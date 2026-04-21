import os
import gzip
import shutil
import subprocess
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from pathlib import Path
import threading
import time
import json

from app.utils.logger import get_logger

logger = get_logger("BackupService")


class BackupTarget:
    def __init__(self, target_type: str, path: str, name: str, enabled: bool = True, config: Dict = None):
        self.type = target_type  # local, s3, aliyun, tencent
        self.path = path
        self.name = name
        self.enabled = enabled
        self.config = config or {}


class BackupRecord:
    def __init__(self, filename: str, size: int, created_at: datetime, backup_type: str, targets: List[str]):
        self.filename = filename
        self.size = size
        self.created_at = created_at
        self.type = backup_type
        self.targets = targets


class BackupService:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, '_initialized'):
            return
        self._initialized = True
        
        self.backup_root = self._get_backup_root()
        self.targets_file = os.path.join(self.backup_root, "backup_targets.json")
        self._backup_thread_running = True
        self._backup_thread = threading.Thread(target=self._backup_scheduler_worker, daemon=True)
        self._backup_thread.start()
        self._targets = self._load_targets()
        self._running_backup = False
        
        logger.info(f"备份服务已初始化，根目录: {self.backup_root}")

    def _get_backup_root(self) -> str:
        storage_root = os.getenv("STORAGE_ROOT", "./storage")
        backup_root = os.path.join(storage_root, "backups")
        os.makedirs(backup_root, exist_ok=True)
        return backup_root

    def _load_targets(self) -> List[BackupTarget]:
        default_targets = [
            BackupTarget("local", self.backup_root, "默认本地备份", True)
        ]
        
        if not os.path.exists(self.targets_file):
            self._save_targets(default_targets)
            return default_targets
        
        try:
            with open(self.targets_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return [BackupTarget(**t) for t in data]
        except Exception as e:
            logger.error(f"加载备份目标失败: {e}")
            return default_targets

    def _save_targets(self, targets: List[BackupTarget]):
        data = [
            {
                "type": t.type,
                "path": t.path,
                "name": t.name,
                "enabled": t.enabled,
                "config": t.config
            }
            for t in targets
        ]
        with open(self.targets_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        self._targets = targets

    def get_targets(self) -> List[Dict]:
        return [
            {
                "type": t.type,
                "path": t.path,
                "name": t.name,
                "enabled": t.enabled,
                "config": t.config
            }
            for t in self._targets
        ]

    def add_target(self, target_type: str, path: str, name: str, config: Dict = None) -> bool:
        if target_type == "local":
            try:
                os.makedirs(path, exist_ok=True)
                test_file = os.path.join(path, ".test_write")
                with open(test_file, 'w') as f:
                    f.write("test")
                os.remove(test_file)
            except Exception as e:
                logger.error(f"无法访问备份路径 {path}: {e}")
                return False

        new_target = BackupTarget(target_type, path, name, True, config or {})
        targets = self._targets
        targets.append(new_target)
        self._save_targets(targets)
        logger.info(f"已添加备份目标: {name} ({target_type}: {path})")
        return True

    def delete_target(self, index: int) -> bool:
        if index <= 0:
            logger.warning("不能删除默认备份目标")
            return False
        
        targets = self._targets
        if 0 <= index < len(targets):
            removed = targets.pop(index)
            self._save_targets(targets)
            logger.info(f"已删除备份目标: {removed.name}")
            return True
        return False

    def toggle_target(self, index: int, enabled: bool) -> bool:
        targets = self._targets
        if 0 <= index < len(targets):
            targets[index].enabled = enabled
            self._save_targets(targets)
            return True
        return False

    def _backup_scheduler_worker(self):
        while self._backup_thread_running:
            try:
                now = datetime.now()
                config = self._get_backup_config()
                
                if config.get("autoBackup", True):
                    backup_time = config.get("backupTime", "02:00")
                    hour, minute = map(int, backup_time.split(":"))
                    
                    if now.hour == hour and now.minute == minute and now.second < 60:
                        frequency = config.get("backupFrequency", "daily")
                        should_run = False
                        
                        if frequency == "daily":
                            should_run = True
                        elif frequency == "weekly" and now.weekday() == 0:
                            should_run = True
                        elif frequency == "monthly" and now.day == 1:
                            should_run = True
                        
                        if should_run and not self._running_backup:
                            logger.info(f"定时备份触发: {frequency}")
                            self.create_full_backup()
                
                time.sleep(60)
            except Exception as e:
                logger.error(f"备份调度器错误: {e}")
                time.sleep(60)

    def _get_backup_config(self) -> Dict:
        try:
            settings_path = "./storage/system_settings.json"
            if os.path.exists(settings_path):
                with open(settings_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except:
            pass
        return {
            "autoBackup": True,
            "backupFrequency": "daily",
            "backupTime": "02:00",
            "backupRetention": 7
        }

    def create_full_backup(self) -> Dict:
        if self._running_backup:
            return {"success": False, "message": "备份正在进行中，请稍候"}
        
        self._running_backup = True
        
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"full_backup_{timestamp}.tar.gz"
            
            os.makedirs(self.backup_root, exist_ok=True)
            backup_path = os.path.join(self.backup_root, filename)
            
            extract_dir = os.path.join(self.backup_root, f"_backup_{timestamp}")
            os.makedirs(extract_dir, exist_ok=True)
            
            logger.info("开始完整备份...")

            db_host = "127.0.0.1"
            db_port = "3306"
            db_user = "root"
            db_pass = "1234"
            db_name = "company-management"
            
            mysqldump_cmd = shutil.which("mysqldump") or "mysqldump"
            cmd = [
                mysqldump_cmd,
                f"--host={db_host}",
                f"--port={db_port}",
                f"--user={db_user}",
                f"--password={db_pass}",
                "--default-character-set=utf8mb4",
                "--single-transaction",
                "--quick",
                "--force",
                "--ignore-table={}.v_personnel_stats".format(db_name),
                db_name
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
            if result.returncode != 0 and "error" in result.stderr.lower() and "warning" not in result.stderr.lower():
                raise Exception(f"mysqldump 失败: {result.stderr[:200]}")
            
            with open(os.path.join(extract_dir, "database.sql"), 'w', encoding='utf-8') as f:
                f.write(result.stdout)
            
            logger.info("MySQL 数据库已导出")
            
            import json
            from app.services.video_service import video_service
            
            storage_config = video_service.get_storage_paths()
            with open(os.path.join(extract_dir, "storage_paths.json"), 'w', encoding='utf-8') as f:
                json.dump(storage_config, f, indent=2, ensure_ascii=False)
            
            backup_settings = self._get_backup_config()
            with open(os.path.join(extract_dir, "backup_settings.json"), 'w', encoding='utf-8') as f:
                json.dump(backup_settings, f, indent=2, ensure_ascii=False)
            
            logger.info("所有配置已导出")
            
            import tarfile
            with tarfile.open(backup_path, "w:gz") as tar:
                tar.add(extract_dir, arcname=".")
            
            shutil.rmtree(extract_dir, ignore_errors=True)
            
            final_size = os.path.getsize(backup_path)
            logger.info(f"完整备份完成: {filename}, {final_size / 1024 / 1024:.2f} MB")
            
            self._replicate_to_targets(backup_path)
            self._cleanup_old_backups()
            
            return {
                "success": True,
                "message": f"备份完成: {filename} ({final_size / 1024 / 1024:.1f} MB)",
                "filename": filename
            }
            
        except Exception as e:
            logger.error(f"完整备份失败: {e}")
            return {"success": False, "message": f"备份失败: {str(e)}"}
            
        finally:
            self._running_backup = False

    def _replicate_to_targets(self, source_file: str):
        filename = os.path.basename(source_file)
        
        for target in self._targets:
            if not target.enabled:
                continue
            
            if target.type == "local":
                target_path = os.path.join(target.path, filename)
                if os.path.abspath(source_file) != os.path.abspath(target_path):
                    try:
                        shutil.copy2(source_file, target_path)
                        logger.info(f"已复制到备份目标: {target.name}")
                    except Exception as e:
                        logger.error(f"复制到备份目标 {target.name} 失败: {e}")
            
            elif target.type == "s3":
                self._upload_to_s3(target, source_file, filename)
            elif target.type == "aliyun":
                self._upload_to_aliyun(target, source_file, filename)
            elif target.type == "tencent":
                self._upload_to_tencent(target, source_file, filename)

    def _upload_to_s3(self, target: BackupTarget, source_file: str, filename: str):
        try:
            import boto3
            s3 = boto3.client(
                's3',
                aws_access_key_id=target.config.get("access_key"),
                aws_secret_access_key=target.config.get("secret_key"),
                endpoint_url=target.config.get("endpoint")
            )
            bucket = target.config.get("bucket", "backups")
            s3.upload_file(source_file, bucket, f"backups/{filename}")
            logger.info(f"已上传到 S3: {target.name}")
        except Exception as e:
            logger.error(f"S3 上传失败: {e}")

    def _upload_to_aliyun(self, target: BackupTarget, source_file: str, filename: str):
        logger.info(f"阿里云 OSS 上传功能待实现: {filename} -> {target.name}")

    def _upload_to_tencent(self, target: BackupTarget, source_file: str, filename: str):
        logger.info(f"腾讯云 COS 上传功能待实现: {filename} -> {target.name}")

    def _cleanup_old_backups(self):
        config = self._get_backup_config()
        retention = config.get("backupRetention", 7)
        
        for target in self._targets:
            if not target.enabled or target.type != "local":
                continue
            
            backup_dir = target.path
            if not os.path.exists(backup_dir):
                continue
            
            backups = []
            for f in os.listdir(backup_dir):
                if f.endswith(('.gz', '.tar.gz')) and ('backup' in f.lower()):
                    filepath = os.path.join(backup_dir, f)
                    backups.append((filepath, os.path.getmtime(filepath)))
            
            backups.sort(key=lambda x: x[1], reverse=True)
            
            for filepath, _ in backups[retention:]:
                try:
                    os.remove(filepath)
                    logger.info(f"已清理过期备份: {os.path.basename(filepath)}")
                except Exception as e:
                    logger.error(f"清理备份失败: {e}")

    def list_backups(self) -> List[Dict]:
        backups = []
        seen = set()
        
        for target in self._targets:
            if not target.enabled or target.type != "local":
                continue
            
            backup_dir = target.path
            if not os.path.exists(backup_dir):
                continue
            
            for f in os.listdir(backup_dir):
                if f in seen:
                    continue
                if f.endswith(('.gz', '.tar.gz')) and ('backup' in f.lower()):
                    filepath = os.path.join(backup_dir, f)
                    stat = os.stat(filepath)
                    
                    backup_type = "mysql" if "mysql" in f.lower() else "config"
                    if "full" in f.lower():
                        backup_type = "full"
                    
                    backups.append({
                        "filename": f,
                        "size": stat.st_size,
                        "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "type": backup_type,
                        "path": filepath
                    })
                    seen.add(f)
        
        backups.sort(key=lambda x: x["created_at"], reverse=True)
        return backups

    def restore_backup(self, filename: str) -> Dict:
        backup_path = None
        for target in self._targets:
            if not target.enabled or target.type != "local":
                continue
            candidate = os.path.join(target.path, filename)
            if os.path.exists(candidate):
                backup_path = candidate
                break
        
        if not backup_path:
            backup_path = os.path.join(self.backup_root, filename)
            if not os.path.exists(backup_path):
                return {"success": False, "message": "备份文件不存在"}
        
        try:
            extract_dir = os.path.join(self.backup_root, "_restore_temp")
            os.makedirs(extract_dir, exist_ok=True)
            
            import tarfile
            with tarfile.open(backup_path, "r:gz") as tar:
                tar.extractall(extract_dir)
            
            db_sql = os.path.join(extract_dir, "database.sql")
            if os.path.exists(db_sql):
                db_host = "127.0.0.1"
                db_port = "3306"
                db_user = "root"
                db_pass = "1234"
                db_name = "company-management"
                
                mysql_cmd = shutil.which("mysql") or "mysql"
                cmd = [
                    mysql_cmd,
                    f"--host={db_host}",
                    f"--port={db_port}",
                    f"--user={db_user}",
                    f"--password={db_pass}",
                    "--default-character-set=utf8mb4",
                    db_name
                ]
                
                with open(db_sql, 'r', encoding='utf-8') as f:
                    result = subprocess.run(cmd, stdin=f, capture_output=True, text=True)
                
                if result.returncode != 0:
                    raise Exception(f"MySQL 恢复失败: {result.stderr[:200]}")
                
                logger.info("MySQL 数据库已恢复")
            
            import json
            from app.services.video_service import video_service
            
            storage_cfg = os.path.join(extract_dir, "storage_paths.json")
            if os.path.exists(storage_cfg):
                with open(storage_cfg, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    for sp in config.get("paths", []):
                        video_service.add_storage_path(sp)
                logger.info("存储路径配置已恢复")
            
            shutil.rmtree(extract_dir, ignore_errors=True)
            logger.info(f"系统已从备份 {filename} 完整恢复")
            return {"success": True, "message": "系统已完整恢复，请刷新页面"}
        except Exception as e:
            logger.error(f"备份恢复失败: {e}")
            return {"success": False, "message": f"恢复失败: {str(e)}"}

    def delete_backup(self, filename: str) -> bool:
        deleted = False
        for target in self._targets:
            if not target.enabled or target.type != "local":
                continue
            
            filepath = os.path.join(target.path, filename)
            if os.path.exists(filepath):
                try:
                    os.remove(filepath)
                    deleted = True
                    logger.info(f"已删除备份: {filename} from {target.name}")
                except Exception as e:
                    logger.error(f"删除备份失败 {filename}: {e}")
        
        return deleted

    def restore_mysql_backup(self, filename: str) -> bool:
        filepath = os.path.join(self.backup_root, filename)
        if not os.path.exists(filepath):
            logger.error(f"备份文件不存在: {filename}")
            return False
        
        try:
            sql_path = filepath.replace(".gz", "")
            with gzip.open(filepath, 'rb') as f_in:
                with open(sql_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            
            db_host = "127.0.0.1"
            db_port = "3306"
            db_user = "root"
            db_pass = "1234"
            db_name = "company-management"
            
            mysql_cmd = shutil.which("mysql") or "mysql"
            
            cmd = [
                mysql_cmd,
                f"--host={db_host}",
                f"--port={db_port}",
                f"--user={db_user}",
                f"--password={db_pass}",
                "--default-character-set=utf8mb4",
                db_name
            ]
            
            with open(sql_path, 'r', encoding='utf-8') as f:
                result = subprocess.run(
                    cmd,
                    stdin=f,
                    capture_output=True,
                    text=True
                )
            
            os.remove(sql_path)
            
            if result.returncode != 0:
                logger.error(f"恢复失败: {result.stderr}")
                return False
            
            logger.info(f"数据库恢复成功: {filename}")
            return True
            
        except Exception as e:
            logger.error(f"恢复备份失败: {e}")
            return False

    def get_backup_status(self) -> Dict:
        backups = self.list_backups()
        last_backup = backups[0] if backups else None
        
        return {
            "running": self._running_backup,
            "last_backup": last_backup,
            "total_backups": len(backups),
            "total_size": sum(b["size"] for b in backups),
            "targets_count": len([t for t in self._targets if t.enabled])
        }


backup_service = BackupService()
