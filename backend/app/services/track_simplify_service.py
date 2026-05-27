"""
轨迹抽稀服务

负责对轨迹数据进行抽稀处理,根据系统设置的 trackSimplifyPrecision 和 trackRecordInterval 参数.
- 距离精度:当新轨迹点与上一个保留的轨迹点之间的距离超过抽稀精度时,才保留该轨迹点.
- 时间间隔:当新轨迹点与上一个保留的轨迹点之间的时间超过记录间隔时,才保留该轨迹点.
"""

import math
import time
from datetime import datetime
from app.utils.logger import get_logger
from app.utils.config_manager import get_system_settings

logger = get_logger("TrackSimplifyService")

class TrackSimplifyService:
    """轨迹抽稀服务"""
    
    def __init__(self):
        self.last_points = {}  # device_id -> {"lat": float, "lng": float, "timestamp": float}
    
    def _get_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        计算两个坐标点之间的距离(米)
        使用 Haversine 公式
        """
        R = 6371000  # 地球半径(米)
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = (
            math.sin(delta_phi / 2.0) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def should_keep_point(self, device_id: str, lat: float, lng: float, timestamp: float = None) -> bool:
        """
        判断是否应该保留该轨迹点
        
        :param device_id: 设备ID
        :param lat: 纬度
        :param lng: 经度
        :param timestamp: 时间戳(秒),可选
        :return: True-保留该点, False-跳过该点
        """
        # 获取配置
        settings = get_system_settings()
        precision = settings.get("trackSimplifyPrecision", 2)  # 距离精度(米)
        interval = settings.get("trackRecordInterval", 0)  # 时间间隔(秒)
        
        current_time = timestamp if timestamp else time.time()
        
        # 如果精度和间隔都为0或负数,保留所有点
        if precision <= 0 and interval <= 0:
            self.last_points[device_id] = {"lat": lat, "lng": lng, "timestamp": current_time}
            return True
        
        # 获取该设备上一个保留的点
        last_point = self.last_points.get(device_id)
        
        # 如果是第一个点,直接保留
        if not last_point:
            self.last_points[device_id] = {"lat": lat, "lng": lng, "timestamp": current_time}
            return True
        
        # 检查时间间隔条件
        if interval > 0:
            time_diff = current_time - last_point["timestamp"]
            if time_diff < interval:
                logger.debug(f"设备 {device_id} 轨迹点时间间隔 {time_diff:.2f} 秒,小于配置的 {interval} 秒,跳过该点")
                return False
        
        # 检查距离精度条件
        if precision > 0:
            distance = self._get_distance(
                last_point["lat"], last_point["lng"],
                lat, lng
            )
            if distance < precision:
                logger.debug(f"设备 {device_id} 轨迹点距离上一点 {distance:.2f} 米,小于配置的 {precision} 米,跳过该点")
                return False
        
        # 满足条件,保留该点
        self.last_points[device_id] = {"lat": lat, "lng": lng, "timestamp": current_time}
        logger.debug(f"设备 {device_id} 轨迹点满足条件,保留该点")
        return True
    
    def simplify_trajectory(self, device_id: str, trajectory: list) -> list:
        """
        对已有的轨迹数据进行抽稀处理
        
        :param device_id: 设备ID
        :param trajectory: 原始轨迹数据列表
        :return: 抽稀后的轨迹数据列表
        """
        if not trajectory:
            return []
        
        # 获取抽稀精度配置
        settings = get_system_settings()
        precision = settings.get("trackSimplifyPrecision", 2)
        
        if precision <= 0:
            return trajectory
        
        simplified = []
        last_lat, last_lng = None, None
        
        for point in trajectory:
            lat = point.get("lat")
            lng = point.get("lng")
            
            if lat is None or lng is None:
                continue
            
            if last_lat is None or last_lng is None:
                # 第一个点
                simplified.append(point)
                last_lat, last_lng = lat, lng
                continue
            
            # 计算距离
            distance = self._get_distance(last_lat, last_lng, lat, lng)
            
            if distance >= precision:
                simplified.append(point)
                last_lat, last_lng = lat, lng
        
        # 更新最后保存的点
        if simplified:
            last_point = simplified[-1]
            self.last_points[device_id] = {
                "lat": last_point.get("lat"),
                "lng": last_point.get("lng")
            }
        
        logger.info(f"设备 {device_id} 轨迹抽稀完成:{len(trajectory)} -> {len(simplified)} 个点")
        
        return simplified
    
    def clear_cache(self, device_id: str = None):
        """
        清除缓存
        
        :param device_id: 设备ID,如果为None则清除所有缓存
        """
        if device_id:
            self.last_points.pop(device_id, None)
        else:
            self.last_points.clear()

# 创建单例实例
track_simplify_service = TrackSimplifyService()
