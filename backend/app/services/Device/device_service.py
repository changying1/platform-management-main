from app.schemas.device_schema import DeviceCreate, DeviceUpdate, TrajectoryPoint
from app.core.database import get_mongo_collection
from app.utils.logger import get_logger
from datetime import datetime
from typing import List, Optional
from app.services.track_simplify_service import track_simplify_service

devices_collection = get_mongo_collection("device")

logger = get_logger("DeviceService")


class DeviceService:
    def get_devices(self) -> List[dict]:
        """获取所有设备"""
        devices = []
        for device in devices_collection.find():
            device["device_id"] = device.pop("id", None) or device.get("device_id")
            devices.append(device)
        return devices

    def get_device_by_id(self, device_id: str) -> Optional[dict]:
        """根据device_id获取设备"""
        device = devices_collection.find_one({"device_id": device_id})
        if device:
            device["device_id"] = device.pop("id", None) or device.get("device_id")
        return device

    def get_devices_by_company(self, company: str) -> List[dict]:
        """根据公司获取设备"""
        devices = []
        for device in devices_collection.find({"company": company}):
            device["device_id"] = device.pop("id", None) or device.get("device_id")
            devices.append(device)
        return devices

    def get_devices_by_project(self, project: str) -> List[dict]:
        """根据项目获取设备"""
        devices = []
        for device in devices_collection.find({"project": project}):
            device["device_id"] = device.pop("id", None) or device.get("device_id")
            devices.append(device)
        return devices

    def create_device(self, device_data: DeviceCreate) -> dict:
        """创建设备"""
        now = datetime.now().isoformat()
        new_device = {
            "device_id": device_data.device_id,
            "name": device_data.name,
            "lat": device_data.lat,
            "lng": device_data.lng,
            "company": device_data.company,
            "project": device_data.project,
            "type": device_data.type or "",
            "team": device_data.team or "",
            "status": device_data.status,
            "holder": device_data.holder,
            "holderPhone": device_data.holderPhone or "",
            "remark": device_data.remark or "",
            "lastUpdate": now,
            "createdAt": now,
            "updatedAt": now,
            "trajectory": [t.model_dump() for t in device_data.trajectory] if device_data.trajectory else []
        }

        result = devices_collection.insert_one(new_device)
        new_device["_id"] = str(result.inserted_id)

        logger.info(f"Created device: {new_device['name']} ({device_data.device_id})")
        return new_device

    def update_device(self, device_id: str, device_data: DeviceUpdate) -> Optional[dict]:
        """更新设备"""
        update_data = {}
        if device_data.name is not None:
            update_data["name"] = device_data.name
        if device_data.lat is not None:
            update_data["lat"] = device_data.lat
        if device_data.lng is not None:
            update_data["lng"] = device_data.lng
        if device_data.company is not None:
            update_data["company"] = device_data.company
        if device_data.project is not None:
            update_data["project"] = device_data.project
        if device_data.type is not None:
            update_data["type"] = device_data.type
        if device_data.team is not None:
            update_data["team"] = device_data.team
        if device_data.status is not None:
            update_data["status"] = device_data.status
        if device_data.holder is not None:
            update_data["holder"] = device_data.holder
        if device_data.holderPhone is not None:
            update_data["holderPhone"] = device_data.holderPhone
        if device_data.remark is not None:
            update_data["remark"] = device_data.remark
        if device_data.trajectory is not None:
            update_data["trajectory"] = [t.model_dump() if isinstance(t, TrajectoryPoint) else t for t in device_data.trajectory]

        update_data["updatedAt"] = datetime.now().isoformat()

        devices_collection.update_one(
            {"device_id": device_id},
            {"$set": update_data}
        )

        updated_device = devices_collection.find_one({"device_id": device_id})
        if updated_device:
            updated_device["device_id"] = updated_device.pop("id", None) or updated_device.get("device_id")

        if device_data.lat is not None and device_data.lng is not None:
            self._check_fence_status(device_id, device_data.lat, device_data.lng)
        return updated_device

    def delete_device(self, device_id: str) -> bool:
        """删除设备"""
        result = devices_collection.delete_one({"device_id": device_id})
        logger.info(f"Deleted device: {device_id}")
        return result.deleted_count > 0

    def add_trajectory_point(self, device_id: str, point: TrajectoryPoint) -> Optional[dict]:
        """添加轨迹点（带抽稀）"""
        # 将 timestamp 字符串转换为时间戳
        import time
        from datetime import datetime
        timestamp = None
        if point.timestamp:
            try:
                if isinstance(point.timestamp, str):
                    dt = datetime.fromisoformat(point.timestamp.replace('Z', '+00:00'))
                    timestamp = dt.timestamp()
                else:
                    timestamp = point.timestamp
            except:
                pass
        
        # 检查是否应该保留该点（根据抽稀精度和时间间隔配置）
        if not track_simplify_service.should_keep_point(device_id, point.lat, point.lng, timestamp):
            logger.debug(f"Skipped trajectory point for device {device_id} (within simplify precision)")
            # 仍然更新设备当前位置，但不添加到轨迹
            devices_collection.update_one(
                {"device_id": device_id},
                {
                    "$set": {
                        "lat": point.lat,
                        "lng": point.lng,
                        "lastUpdate": point.timestamp,
                        "updatedAt": datetime.now().isoformat()
                    }
                }
            )
            self._check_fence_status(device_id, point.lat, point.lng)
            return None
        
        point_data = point.model_dump()
        devices_collection.update_one(
            {"device_id": device_id},
            {
                "$push": {"trajectory": point_data},
                "$set": {
                    "lat": point.lat,
                    "lng": point.lng,
                    "lastUpdate": point.timestamp,
                    "updatedAt": datetime.now().isoformat()
                }
            }
        )

        updated_device = devices_collection.find_one({"device_id": device_id})
        if updated_device:
            updated_device["device_id"] = updated_device.pop("id", None) or updated_device.get("device_id")

        logger.info(f"Added trajectory point to device: {device_id}")
        self._check_fence_status(device_id, point.lat, point.lng)
        return updated_device

    def _check_fence_status(self, device_id: str, lat: float, lng: float):
        try:
            from app.services.Fence.fence_service import FenceService
            FenceService().check_fence_status(device_id, lat, lng)
        except Exception as exc:
            logger.error(f"Fence check failed for device {device_id}: {exc}")

    def get_trajectory(self, device_id: str, hours: int = 24) -> List[dict]:
        """获取设备轨迹（默认最近24小时）"""
        from datetime import timedelta, timezone
        
        device = devices_collection.find_one({"device_id": device_id})
        if not device:
            return []

        trajectory = device.get("trajectory", [])
        
        # 根据 hours 参数过滤轨迹数据
        if hours > 0:
            # 使用 UTC 时间计算截止时间
            cutoff_time = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
            filtered_trajectory = [
                p for p in trajectory 
                if p.get("timestamp", "") >= cutoff_time
            ]
            return filtered_trajectory
        
        return trajectory
    
    def get_device_by_holder_phone(self, holder_phone: str) -> Optional[dict]:
        """根据holderPhone获取设备，支持带前导0和不带前导0的查询"""
        # 先尝试原样查询
        device = devices_collection.find_one({"holderPhone": holder_phone})
        if device:
            device["device_id"] = device.pop("id", None) or device.get("device_id")
            return device
        
        # 如果找不到，尝试去掉前导0查询
        # 去掉所有前导0，但保留至少一位数字
        holder_phone_no_zero = holder_phone.lstrip('0')
        if holder_phone_no_zero and holder_phone_no_zero != holder_phone:
            device = devices_collection.find_one({"holderPhone": holder_phone_no_zero})
            if device:
                device["device_id"] = device.pop("id", None) or device.get("device_id")
                return device
        
        # 如果还找不到，尝试在数据库中查找以该号码结尾的记录
        # 用于处理数据库中存储的是完整号码，但查询的是短号码的情况
        all_devices = list(devices_collection.find())
        for dev in all_devices:
            db_phone = dev.get("holderPhone", "")
            # 去掉前导0后比较
            db_phone_no_zero = db_phone.lstrip('0') if db_phone else ""
            if db_phone_no_zero == holder_phone_no_zero:
                dev["device_id"] = dev.pop("id", None) or dev.get("device_id")
                return dev
        
        return None

    def clean_old_trajectory(self, hours: int = 24) -> int:
        """清理超过指定时间的轨迹点"""
        from datetime import timedelta, timezone
        cutoff_time = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

        devices = devices_collection.find()
        cleaned_count = 0

        for device in devices:
            trajectory = device.get("trajectory", [])
            old_count = len(trajectory)
            new_trajectory = [p for p in trajectory if p.get("timestamp", "") > cutoff_time]

            if old_count != len(new_trajectory):
                devices_collection.update_one(
                    {"device_id": device.get("device_id")},
                    {"$set": {"trajectory": new_trajectory}}
                )
                cleaned_count += old_count - len(new_trajectory)

        logger.info(f"Cleaned {cleaned_count} old trajectory points")
        return cleaned_count


device_service = DeviceService()
