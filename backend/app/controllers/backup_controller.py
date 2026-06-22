from fastapi import APIRouter, Depends, HTTPException, Request

from fastapi.responses import FileResponse

from pydantic import BaseModel

from typing import Optional, Dict, List

import os



from app.services.backup_service import backup_service

from app.services.video_service import VideoService
from app.core.database import get_db
from app.core.data_scope import is_hq
from app.core.security import get_current_user
from app.schemas.log_schema import LogCreate
from app.services.log_service import LogService





class StoragePathCreate(BaseModel):

    path: str

    name: str

    type: str = "mirror"

    endpoint: Optional[str] = None

    bucket: Optional[str] = None

    access_key: Optional[str] = None

    secret_key: Optional[str] = None

    region: Optional[str] = None



video_service = VideoService()
log_service = LogService()



router = APIRouter(prefix="/api/backup", tags=["backup"])





class BackupTargetCreate(BaseModel):

    type: str

    path: str

    name: str

    config: Optional[Dict] = None


def _backup_operator(current_user: Optional[dict]) -> str:

    if not current_user:

        return "system"

    return str(current_user.get("username") or current_user.get("full_name") or "system")


def _backup_log_scope(current_user: Optional[dict]) -> Dict:

    current_user = current_user or {}

    if is_hq(current_user):

        return {

            "company": "\u603b\u516c\u53f8",

            "project": None,

            "grid": None,

            "team": None,

        }

    return {

        "company": current_user.get("company") or current_user.get("department"),

        "project": current_user.get("project"),

        "grid": current_user.get("grid"),

        "team": current_user.get("team") or current_user.get("work_team"),

    }


def _write_backup_log(db, current_user: Optional[dict], action: str, target_name: str, details: str, level: str = "info", extra: Optional[Dict] = None):

    try:

        scope = _backup_log_scope(current_user)

        log_service.create_log(db, LogCreate(

            operator=_backup_operator(current_user),

            action=action,

            target_type="backup",

            target_name=target_name,

            details=details,

            level=level,

            company=scope.get("company"),

            project=scope.get("project"),

            grid=scope.get("grid"),

            team=scope.get("team"),

            extra=extra,

        ))

    except Exception:

        pass





@router.get("/status")

async def get_backup_status():

    return backup_service.get_backup_status()





@router.get("/list")

async def list_backups():

    return backup_service.list_backups()





@router.post("/create/mysql")

async def create_mysql_backup(db = Depends(get_db), current_user: dict = Depends(get_current_user)):

    result = backup_service.create_mysql_backup()

    filename = result.get("filename") or "\u6570\u636e\u5e93\u5907\u4efd"

    if result.get("success"):

        _write_backup_log(db, current_user, "\u751f\u6210\u6570\u636e\u5e93\u5907\u4efd", filename, result.get("message") or f"\u751f\u6210\u6570\u636e\u5e93\u5907\u4efd\uff1a{filename}", extra=result)

        return result

    message = result.get("message", "\u6570\u636e\u5e93\u5907\u4efd\u5931\u8d25")

    _write_backup_log(db, current_user, "\u751f\u6210\u6570\u636e\u5e93\u5907\u4efd\u5931\u8d25", filename, message, level="error", extra=result)

    raise HTTPException(status_code=500, detail=message)





@router.post("/create/config")

async def create_config_backup(db = Depends(get_db), current_user: dict = Depends(get_current_user)):

    filename = backup_service.create_config_backup()

    if filename:

        result = {"success": True, "filename": filename, "type": "config"}

        _write_backup_log(db, current_user, "\u751f\u6210\u7cfb\u7edf\u8bbe\u7f6e\u5907\u4efd", filename, f"\u751f\u6210\u7cfb\u7edf\u8bbe\u7f6e\u5907\u4efd\uff1a{filename}", extra=result)

        return result

    message = "\u7cfb\u7edf\u8bbe\u7f6e\u5907\u4efd\u5931\u8d25"

    _write_backup_log(db, current_user, "\u751f\u6210\u7cfb\u7edf\u8bbe\u7f6e\u5907\u4efd\u5931\u8d25", "\u7cfb\u7edf\u8bbe\u7f6e\u5907\u4efd", message, level="error")

    raise HTTPException(status_code=500, detail=message)



@router.post("/create/full")

async def create_full_backup(db = Depends(get_db), current_user: dict = Depends(get_current_user)):

    result = backup_service.create_full_backup()

    filename = result.get("filename") or "\u5b8c\u6574\u5907\u4efd"

    if result.get("success"):

        _write_backup_log(db, current_user, "\u751f\u6210\u5b8c\u6574\u5907\u4efd", filename, result.get("message") or f"\u751f\u6210\u5b8c\u6574\u5907\u4efd\uff1a{filename}", extra=result)

    else:

        _write_backup_log(db, current_user, "\u751f\u6210\u5b8c\u6574\u5907\u4efd\u5931\u8d25", filename, result.get("message") or "\u5b8c\u6574\u5907\u4efd\u5931\u8d25", level="error", extra=result)

    return result





@router.delete("/{filename}")

async def delete_backup(filename: str):

    if backup_service.delete_backup(filename):

        return {"success": True, "message": "备份已删除"}

    raise HTTPException(status_code=404, detail="备份不存在")





class RestoreRequest(BaseModel):

    filename: str





@router.post("/restore")

async def restore_system_from_backup(restore: RestoreRequest, db = Depends(get_db), current_user: dict = Depends(get_current_user)):

    try:

        result = backup_service.restore_backup(restore.filename)

    except Exception as e:

        message = f"Restore failed: {e}"

        _write_backup_log(db, current_user, "\u6062\u590d\u5907\u4efd\u5931\u8d25", restore.filename, message, level="error", extra={"filename": restore.filename})

        raise HTTPException(status_code=500, detail=message)

    if result["success"]:

        _write_backup_log(db, current_user, "\u6062\u590d\u5907\u4efd", restore.filename, result.get("message") or f"\u6062\u590d\u5907\u4efd\uff1a{restore.filename}", extra={"filename": restore.filename, **result})

        return result

    _write_backup_log(db, current_user, "\u6062\u590d\u5907\u4efd\u5931\u8d25", restore.filename, result.get("message") or "\u6062\u590d\u5907\u4efd\u5931\u8d25", level="error", extra={"filename": restore.filename, **result})

    raise HTTPException(status_code=500, detail=result["message"])



@router.get("/download/{filename}")

async def download_backup(filename: str):

    filepath = os.path.join(backup_service.backup_root, filename)

    if os.path.exists(filepath):

        return FileResponse(

            filepath,

            media_type="application/gzip",

            filename=filename

        )

    raise HTTPException(status_code=404, detail="备份文件不存在")





@router.post("/restore/{filename}")

async def restore_backup(filename: str):

    if backup_service.restore_mysql_backup(filename):

        return {"success": True, "message": "鎭㈠鎴愬姛"}

    raise HTTPException(status_code=500, detail="鎭㈠澶辫触")





@router.get("/targets")

async def get_backup_targets():

    return backup_service.get_targets()





@router.post("/targets")

async def add_backup_target(target: BackupTargetCreate):

    if backup_service.add_target(target.type, target.path, target.name, target.config):

        return {"success": True, "message": "娣诲姞鎴愬姛"}

    raise HTTPException(status_code=500, detail="娣诲姞澶辫触锛岃矾寰勪笉鍙闂垨鏉冮檺涓嶈冻")





@router.put("/targets/{index}")

async def update_backup_target(index: int, target: BackupTargetCreate):

    if backup_service.update_target(index, target.type, target.path, target.name, target.config):

        return {"success": True, "message": "更新成功"}

    raise HTTPException(status_code=500, detail="更新失败，路径不可访问或目标不存在")



@router.delete("/targets/{index}")
async def delete_backup_target(index: int):

    if backup_service.delete_target(index):

        return {"success": True, "message": "鍒犻櫎鎴愬姛"}

    raise HTTPException(status_code=404, detail="目标不存在")





@router.put("/targets/{index}/toggle")

async def toggle_backup_target(index: int, enabled: bool):

    if backup_service.toggle_target(index, enabled):

        return {"success": True, "message": "鐘舵€佸凡鏇存柊"}

    raise HTTPException(status_code=404, detail="目标不存在")





@router.get("/storage/paths")

async def get_storage_paths():

    return video_service.get_storage_paths()





@router.post("/storage/paths")

async def add_storage_path(storage_path: StoragePathCreate):

    config = storage_path.dict()

    if video_service.add_storage_path(config):

        return {"success": True, "message": f"瀹炴椂闀滃儚璺緞娣诲姞鎴愬姛 ({storage_path.type})"}

    raise HTTPException(status_code=500, detail="娣诲姞澶辫触锛岃矾寰勪笉鍙闂垨鏉冮檺涓嶈冻")





@router.delete("/storage/paths/{index}")

async def delete_storage_path(index: int):

    if video_service.delete_storage_path(index):

        return {"success": True, "message": "鍒犻櫎鎴愬姛"}

    raise HTTPException(status_code=404, detail="存储路径不存在")





@router.post("/storage/paths/{index}/primary")

async def set_primary_storage(index: int):

    if video_service.set_primary_storage(index):

        return {"success": True, "message": "涓诲瓨鍌ㄥ凡鍒囨崲锛屾柊褰曞儚灏嗗啓鍏ユ璺緞"}

    raise HTTPException(status_code=404, detail="存储路径不存在")





@router.post("/storage/open")

async def open_storage_folder(request: Request):

    import subprocess

    import os

    

    body = await request.json()

    path = body.get("path", "")

    

    path = os.path.abspath(os.path.normpath(path))

    if os.path.exists(path):

        subprocess.Popen(f'explorer "{path}"', shell=True)

        return {"success": True, "message": f"宸叉墦寮€: {path}"}

    return {"success": False, "message": f"璺緞涓嶅瓨鍦? {path}"}





@router.get("/browse/folder")

async def browse_folder():

    import tkinter as tk

    from tkinter import filedialog

    

    root = tk.Tk()

    root.withdraw()

    root.wm_attributes('-topmost', 1)

    folder_path = filedialog.askdirectory(title="选择镜像存储文件夹")

    root.destroy()

    

    if folder_path:

        return {"success": True, "path": folder_path}

    return {"success": False, "message": "未选择文件夹"}





@router.post("/location/restore")

async def restore_location_from_csv():

    import csv

    from datetime import datetime

    from app.core.database import get_mongo_collection
    import uuid



    backup_dir = "./storage/location_backup"

    if not os.path.exists(backup_dir):

        return {"success": False, "message": "娌℃湁鎵惧埌杞ㄨ抗澶囦唤鏂囦欢"}



    count = 0

    collection = get_mongo_collection("device_location_history")


    try:

        for filename in sorted(os.listdir(backup_dir)):

            if not filename.endswith(".csv"):

                continue

            

            csv_path = os.path.join(backup_dir, filename)

            with open(csv_path, 'r', encoding='utf-8') as f:

                reader = csv.DictReader(f)

                for row in reader:

                    try:

                        timestamp = datetime.strptime(row['time'], "%Y-%m-%d %H:%M:%S")
                        exists = collection.find_one({"device_id": row['device_id'], "timestamp": timestamp})
                        """
                            DeviceLocationHistory.device_id == row['device_id'],

                            DeviceLocationHistory.timestamp == datetime.strptime(row['time'], "%Y-%m-%d %H:%M:%S")

                        ).first()
                        """
                        

                        if not exists:

                            collection.insert_one({
                                "id": str(uuid.uuid4()),
                                "device_id": row['device_id'],
                                "latitude": float(row['lat']),
                                "longitude": float(row['lng']),
                                "speed": float(row.get('speed') or 0),
                                "direction": float(row.get('direction') or 0),
                                "timestamp": timestamp,
                            })
                            """
                            location = DeviceLocationHistory(
                                id=str(uuid.uuid4()),

                                device_id=row['device_id'],

                                latitude=float(row['lat']),

                                longitude=float(row['lng']),

                                speed=float(row['speed']),

                                direction=float(row['direction']),

                                timestamp=datetime.strptime(row['time'], "%Y-%m-%d %H:%M:%S")

                            )

                            db.add(location)
                            """
                            count += 1

                    except:

                        pass

        

        pass
        return {"success": True, "message": f"宸蹭粠 CSV 鎭㈠ {count} 鏉″畾浣嶈建杩规暟鎹紒"}

    except Exception as e:

        pass
        return {"success": False, "message": f"鎭㈠澶辫触: {str(e)}"}

    finally:

        pass


