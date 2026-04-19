from pymongo import MongoClient
from app.schemas.device_schema import DeviceCreate, DeviceUpdate, TrajectoryPoint
from app.utils.logger import get_logger
from datetime import datetime
from typing import List, Optional

client = MongoClient("mongodb://localhost:27017/")
db = client["platform"]
devices_collection = db["device"]

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
            "status": device_data.status,
            "holder": device_data.holder,
            "holderPhone": device_data.holderPhone or "",
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
        if device_data.status is not None:
            update_data["status"] = device_data.status
        if device_data.holder is not None:
            update_data["holder"] = device_data.holder
        if device_data.holderPhone is not None:
            update_data["holderPhone"] = device_data.holderPhone
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

        logger.info(f"Updated device: {device_id}")
        return updated_device

    def delete_device(self, device_id: str) -> bool:
        """删除设备"""
        result = devices_collection.delete_one({"device_id": device_id})
        logger.info(f"Deleted device: {device_id}")
        return result.deleted_count > 0

    def add_trajectory_point(self, device_id: str, point: TrajectoryPoint) -> Optional[dict]:
        """添加轨迹点"""
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
        return updated_device

    def get_trajectory(self, device_id: str, hours: int = 24) -> List[dict]:
        """获取设备轨迹（默认最近24小时）"""
        device = devices_collection.find_one({"device_id": device_id})
        if not device:
            return []

        trajectory = device.get("trajectory", [])
        return trajectory
    
    def get_device_by_holder_phone(self, holder_phone: str) -> Optional[dict]:
        """根据holderPhone获取设备"""
        device = devices_collection.find_one({"holderPhone": holder_phone})
        if device:
            device["device_id"] = device.pop("id", None) or device.get("device_id")
        return device

    def clean_old_trajectory(self, hours: int = 24) -> int:
        """清理超过指定时间的轨迹点"""
        from datetime import timedelta
        cutoff_time = (datetime.now() - timedelta(hours=hours)).isoformat() + "Z"

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