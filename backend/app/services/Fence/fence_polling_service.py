"""
围栏检测轮询服务

负责定时轮询所有设备的围栏状态,实现越界检测和告警静默功能.
"""

import time
import threading
from app.core.database import get_mongo_collection
from app.utils.logger import get_logger
from app.utils.config_manager import get_fence_detection_interval
from .fence_service import FenceService

logger = get_logger("FencePollingService")

class FencePollingService:
    """围栏检测轮询服务"""
    
    def __init__(self):
        self.running = False
        self.thread = None
        self.fence_service = FenceService()
        self.devices_collection = get_mongo_collection("device")
    
    def start(self):
        """启动轮询服务"""
        if self.running:
            logger.warning("Fence polling service is already running")
            return
        
        self.running = True
        self.thread = threading.Thread(target=self._polling_loop, daemon=True)
        self.thread.start()
        logger.info("Fence polling service started")
    
    def stop(self):
        """停止轮询服务"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("Fence polling service stopped")
    
    def _polling_loop(self):
        """轮询主循环"""
        while self.running:
            try:
                # 获取检测间隔配置
                interval = get_fence_detection_interval()
                
                # 执行一次完整的检测
                self._perform_detection()
                
                # 等待下一次检测
                time.sleep(interval)
                
            except Exception as e:
                logger.error(f"Fence polling error: {e}")
                time.sleep(5)  # 出错时等待5秒再重试
    
    def _perform_detection(self):
        """执行一次完整的围栏检测"""
        try:
            # 获取所有有位置信息的设备
            devices = list(self.devices_collection.find({
                "$or": [
                    {"last_latitude": {"$exists": True, "$ne": None}},
                    {"lat": {"$exists": True, "$ne": None}},
                ]
            }))
            
            logger.debug(f"Polling {len(devices)} devices for fence violations")
            
            # 遍历所有设备进行检测
            for device in devices:
                device_id = str(device.get("device_id") or device.get("id") or "")
                lat = device.get("last_latitude") or device.get("lat")
                lng = device.get("last_longitude") or device.get("lng")
                
                if lat and lng:
                    try:
                        self.fence_service.check_fence_status(device_id, float(lat), float(lng))
                    except Exception as e:
                        logger.error(f"Error checking fence status for device {device_id}: {e}")
        
        except Exception as e:
            logger.error(f"Failed to perform fence detection: {e}")

# 创建单例实例
fence_polling_service = FencePollingService()
