"""
轨迹数据清理服务

负责定时清理过期的轨迹数据,根据系统设置的 trackRetentionDays 参数.
"""

import time
import threading
from datetime import datetime, timedelta
from app.core.database import get_mongo_collection
from app.utils.logger import get_logger
from app.utils.config_manager import get_system_settings

logger = get_logger("TrackCleanupService")

class TrackCleanupService:
    """轨迹数据清理服务"""
    
    def __init__(self):
        self.running = False
        self.thread = None
        self.devices_collection = get_mongo_collection("device")
    
    def start(self):
        """启动清理服务"""
        if self.running:
            logger.warning("Track cleanup service is already running")
            return
        
        self.running = True
        self.thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self.thread.start()
        logger.info("Track cleanup service started")
    
    def stop(self):
        """停止清理服务"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("Track cleanup service stopped")
    
    def _cleanup_loop(self):
        """清理主循环(每天凌晨2点执行)"""
        while self.running:
            try:
                now = datetime.now()
                
                # 计算下次执行时间(明天凌晨2点)
                next_run = now.replace(hour=2, minute=0, second=0, microsecond=0) + timedelta(days=1)
                wait_seconds = (next_run - now).total_seconds()
                
                logger.debug(f"Next track cleanup scheduled in {wait_seconds/3600:.1f} hours")
                
                # 等待到下次执行时间
                time.sleep(min(wait_seconds, 3600))  # 最多等1小时,检查运行状态
                
                if not self.running:
                    break
                
                # 检查是否到了执行时间
                if datetime.now().hour == 2:
                    self._cleanup_expired_trajectories()
            
            except Exception as e:
                logger.error(f"Track cleanup loop error: {e}")
                time.sleep(3600)  # 出错时等待1小时再重试
    
    def _cleanup_expired_trajectories(self):
        """清理过期的轨迹数据"""
        try:
            # 获取保留天数配置
            settings = get_system_settings()
            retention_days = settings.get("trackRetentionDays", 30)
            
            if retention_days <= 0:
                logger.debug("Track retention days is 0 or negative, skipping cleanup")
                return
            
            # 计算过期时间点
            cutoff_time = datetime.now() - timedelta(days=retention_days)
            cutoff_timestamp = cutoff_time.isoformat()
            
            logger.info(f"Starting track cleanup for records older than {retention_days} days")
            
            # 更新所有设备的轨迹数据,删除过期的轨迹点
            result = self.devices_collection.update_many(
                {},
                {
                    "$pull": {
                        "trajectory": {
                            "timestamp": {"$lt": cutoff_timestamp}
                        }
                    }
                }
            )
            
            logger.info(f"Track cleanup completed. Modified {result.modified_count} devices")
        
        except Exception as e:
            logger.error(f"Failed to cleanup expired trajectories: {e}")
    
    def cleanup_now(self):
        """立即执行一次清理(用于测试或手动触发)"""
        self._cleanup_expired_trajectories()

# 创建单例实例
track_cleanup_service = TrackCleanupService()
