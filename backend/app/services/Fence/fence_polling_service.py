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
            # 获取所有有位置信息的设备（支持多种字段名）
            devices = list(self.devices_collection.find({
                "$or": [
                    {"last_latitude": {"$exists": True, "$ne": None}},
                    {"last_longitude": {"$exists": True, "$ne": None}},
                    {"lat": {"$exists": True, "$ne": None}},
                    {"lng": {"$exists": True, "$ne": None}},
                    {"last_lat": {"$exists": True, "$ne": None}},
                    {"last_lng": {"$exists": True, "$ne": None}},
                ]
            }))
            
            # 遍历所有设备进行检测
            for device in devices:
                device_id = str(device.get("device_id") or device.get("id") or "")
                
                # 支持多种字段名获取位置
                lat = device.get("last_latitude") or device.get("lat") or device.get("last_lat")
                lng = device.get("last_longitude") or device.get("lng") or device.get("last_lng")
                
                if lat and lng:
                    try:
                        lat = float(lat)
                        lng = float(lng)
                        
                        # 检查坐标是否合法（纬度 -90~90，经度 -180~180）
                        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                            # 尝试交换经纬度
                            lat, lng = lng, lat
                            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                                continue
                        
                        self.fence_service.check_fence_status(device_id, lat, lng)
                    except Exception as e:
                        logger.error(f"[围栏检测] 设备 {device_id} 出错: {e}")


        


        except Exception as e:


            logger.error(f"Failed to perform fence detection: {e}")





# 创建单例实例


fence_polling_service = FencePollingService()


