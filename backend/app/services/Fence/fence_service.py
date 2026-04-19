import json
import math
from datetime import datetime, time, timedelta
from pymongo import MongoClient
from app.schemas.fence_schema import FenceCreate, FenceUpdate, ProjectRegionCreate, ProjectRegionUpdate
from app.schemas.alarm_schema import AlarmCreate
from app.services.alarm_service import AlarmService
from app.utils.logger import get_logger

# MongoDB 连接配置
client = MongoClient("mongodb://localhost:27017/")
db = client["platform"]
fences_collection = db["fence"]
regions_collection = db["project_regions"]
devices_collection = db["devices"]
alarms_collection = db["alarms"]

logger = get_logger("FenceService")


class FenceService:
    # --- Project Region CRUD ---
    def create_project_region(self, region_data: ProjectRegionCreate):
        logger.info(f"Creating new project region: {region_data.name}")
        new_region = {
            "name": region_data.name,
            "coordinates_json": region_data.coordinates_json,
            "remark": region_data.remark,
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat()
        }
        result = regions_collection.insert_one(new_region)
        new_region["_id"] = str(result.inserted_id)
        return new_region

    def get_project_regions(self, skip: int = 0, limit: int = 100):
        regions = list(regions_collection.find().skip(skip).limit(limit))
        for region in regions:
            region["_id"] = str(region["_id"])
        return regions

    def update_project_region(self, region_id: str, region_data: ProjectRegionUpdate):
        db_region = regions_collection.find_one({"_id": region_id})
        if not db_region:
            return None
        
        update_data = region_data.model_dump(exclude_unset=True)
        update_data["updatedAt"] = datetime.now().isoformat()
        
        regions_collection.update_one({"_id": region_id}, {"$set": update_data})
        updated_region = regions_collection.find_one({"_id": region_id})
        updated_region["_id"] = str(updated_region["_id"])
        return updated_region

    def delete_project_region(self, region_id: str):
        db_region = regions_collection.find_one({"_id": region_id})
        if db_region:
            # Set project_region_id to NULL for associated fences
            fences_collection.update_many({"project_region_id": region_id}, {"$unset": {"project_region_id": ""}})
            regions_collection.delete_one({"_id": region_id})
            return True
        return False

    def is_device_inside_project_region(self, region: dict, device: dict) -> bool:
        if not device.get("last_latitude") or not device.get("last_longitude"):
            return False
        try:
            poly_points = json.loads(region.get("coordinates_json", "[]"))
            poly = []
            for p in poly_points:
                if isinstance(p, list) and len(p) >= 2:
                    poly.append((float(p[1]), float(p[0])))
                elif isinstance(p, dict):
                    poly.append((float(p.get("lng")), float(p.get("lat"))))
            return self._is_inside_polygon((device.get("last_longitude"), device.get("last_latitude")), poly)
        except Exception:
            return False

    def create_fence(self, fence_data: FenceCreate, company: str = "", project: str = ""):
        logger.info(f"Creating new fence: {fence_data.name} ({fence_data.shape})")

        # Basic validation logic could go here
        if fence_data.shape == "circle" and not fence_data.radius:
            raise ValueError("Radius is required for circular fences")

        # 解析坐标数据
        geometry = {}
        if fence_data.shape == "circle":
            try:
                center = json.loads(fence_data.coordinates_json)
                geometry["center"] = center
                geometry["radius"] = fence_data.radius
            except:
                pass
        elif fence_data.shape == "polygon":
            try:
                points = json.loads(fence_data.coordinates_json)
                geometry["points"] = points
            except:
                pass

        new_fence = {
            "fence_id": str(int(datetime.now().timestamp() * 1000)),
            "name": fence_data.name,
            "company": company,  # 从前端传入
            "project": project,  # 从前端传入
            "project_region_id": fence_data.project_region_id,
            "shape": fence_data.shape,
            "behavior": fence_data.behavior,
            "severity": fence_data.alarm_type.value if hasattr(fence_data.alarm_type, "value") else "medium",
            "geometry": geometry,
            "schedule": {
                "start": datetime.now().isoformat(),
                "end": (datetime.now() + timedelta(days=365)).isoformat()
            },
            "effective_time": fence_data.effective_time or "00:00-23:59",
            "worker_count": 0,
            "remark": fence_data.remark or "",
            "alarm_type": fence_data.alarm_type.value if hasattr(fence_data.alarm_type, "value") else "medium",
            "is_active": True,
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat()
        }

        result = fences_collection.insert_one(new_fence)
        new_fence["_id"] = str(result.inserted_id)

        # Immediate check for existing devices
        self._check_existing_devices(new_fence)

        print(new_fence)


        return new_fence

    def _check_existing_devices(self, fence: dict):
        """Check all devices against the newly created fence."""
        logger.info(f"Checking existing devices for fence {fence.get('name')}")
        devices = list(devices_collection.find({"last_latitude": {"$ne": None}, "last_longitude": {"$ne": None}}))

        count = 0
        for device in devices:
            if self.check_device_against_fence(fence, device):
                count += 1
        
        self._update_fence_count(fence)
        logger.info(f"Fence creation check: Triggered {count} alarms.")

    def update_fence(self, fence_id: str, fence_data: FenceUpdate):
        logger.info(f"Updating fence ID: {fence_id}")
        db_fence = fences_collection.find_one({"fence_id": fence_id})
        if not db_fence:
            return None

        # Update fields if they are provided (not None)
        update_data = fence_data.model_dump(exclude_unset=True)
        update_data["updatedAt"] = datetime.now().isoformat()

        # 处理坐标数据
        if "coordinates_json" in update_data and "shape" in update_data:
            geometry = {}
            if update_data["shape"] == "circle":
                try:
                    center = json.loads(update_data["coordinates_json"])
                    geometry["center"] = center
                    geometry["radius"] = update_data.get("radius")
                except:
                    pass
            elif update_data["shape"] == "polygon":
                try:
                    points = json.loads(update_data["coordinates_json"])
                    geometry["points"] = points
                except:
                    pass
            update_data["geometry"] = geometry
            update_data.pop("coordinates_json", None)

        fences_collection.update_one({"fence_id": fence_id}, {"$set": update_data})
        self._update_fence_count(fences_collection.find_one({"fence_id": fence_id}))
        updated_fence = fences_collection.find_one({"fence_id": fence_id})
        updated_fence["_id"] = str(updated_fence["_id"])
        return updated_fence

    def get_fences(self, skip: int = 0, limit: int = 100):
        fences = list(fences_collection.find().skip(skip).limit(limit))
        for fence in fences:
            fence["_id"] = str(fence["_id"])
        return fences

    def delete_fence(self, fence_id: str):
        db_fence = fences_collection.find_one({"fence_id": fence_id})
        if db_fence:
            # Set fence_id to NULL for associated alarms instead of deleting them
            alarms_collection.update_many({"fence_id": fence_id}, {"$unset": {"fence_id": ""}})
            fences_collection.delete_one({"fence_id": fence_id})
            return True
        return False

    def check_fence_status(self, device_id: str, lat: float, lng: float):
        """
        Check if a specific device (with new coordinates) violates any active fence.
        This is typically called by a location update stream.
        """
        # Update device location first
        device = devices_collection.find_one({"id": device_id})
        if device:
            devices_collection.update_one({"id": device_id}, {"$set": {"last_latitude": lat, "last_longitude": lng}})
        else:
            logger.warning(f"Device {device_id} not found during fence check.")
            return

        active_fences = list(fences_collection.find({"is_active": True}))
        for fence in active_fences:
            if self.is_fence_active_now(fence):
                self.check_device_against_fence(fence, device)
            self._update_fence_count(fence)

    def is_fence_active_now(self, fence: dict) -> bool:
        """Check if the fence is within its effective time range."""
        if not fence.get("is_active"):
            return False
        effective_time = fence.get("effective_time")
        if not effective_time or '-' not in effective_time:
            return True
            
        try:
            now = datetime.now().time()
            start_str, end_str = effective_time.split('-')
            
            start_t = self._parse_time_str(start_str)
            end_t = self._parse_time_str(end_str)
            
            if start_t <= end_t:
                return start_t <= now <= end_t
            else: # Overnight range
                return now >= start_t or now <= end_t
        except Exception as e:
            logger.error(f"Error checking fence time: {e}")
            return True

    def _parse_time_str(self, time_str: str) -> time:
        """Parse 'HH:mm' or 'HH.mm' style strings."""
        ts = time_str.strip().replace('.', ':')
        parts = ts.split(':')
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        return time(h, m)

    def is_device_inside_fence(self, fence: dict, device: dict) -> bool:
        """Helper to determine if a device is currently inside a fence boundary."""
        if not device.get("last_latitude") or not device.get("last_longitude"):
            return False

        gcj_lat, gcj_lng = device.get("last_latitude"), device.get("last_longitude")
        shape = fence.get("shape")
        geometry = fence.get("geometry", {})

        if shape == "circle":
            try:
                center = geometry.get("center")
                radius = geometry.get("radius", 0)
                if isinstance(center, list) and len(center) >= 2:
                    center_lat, center_lng = float(center[0]), float(center[1])
                    dist = self._get_distance(gcj_lat, gcj_lng, center_lat, center_lng)
                    return dist <= radius
            except Exception:
                return False

        elif shape == "polygon":
            try:
                polygon_points = geometry.get("points", [])
                poly = []
                for p in polygon_points:
                    if isinstance(p, list) and len(p) >= 2:
                        poly.append((float(p[1]), float(p[0])))
                    elif isinstance(p, dict):
                        poly.append((float(p.get("lng")), float(p.get("lat"))))
                return self._is_inside_polygon((gcj_lng, gcj_lat), poly)
            except Exception:
                return False
        return False

    def _update_fence_count(self, fence: dict):
        """Recalculate and update the worker_count (violator count) for a fence."""
        # If fence is not active or out of time range, count is 0
        if not self.is_fence_active_now(fence):
            fences_collection.update_one({"fence_id": fence.get("fence_id")}, {"$set": {"worker_count": 0}})
            return

        devices = list(devices_collection.find({"last_latitude": {"$ne": None}}))
        count = 0
        for device in devices:
            if self.check_device_violation(fence, device):
                count += 1
        
        fences_collection.update_one({"fence_id": fence.get("fence_id")}, {"$set": {"worker_count": count}})

    def check_device_violation(self, fence: dict, device: dict) -> bool:
        """Determine if a device is violating a fence's rules."""
        is_inside = self.is_device_inside_fence(fence, device)
        
        behavior = fence.get("behavior")
        if behavior == "No Entry":
            return is_inside
        elif behavior == "No Exit":
            # If targeted to a project region, only violate if inside region but outside fence
            project_region_id = fence.get("project_region_id")
            if project_region_id:
                region = regions_collection.find_one({"_id": project_region_id})
                if region:
                    is_in_region = self.is_device_inside_project_region(region, device)
                    return is_in_region and not is_inside
                return False # Avoid global alarms if region ID is set but region doesn't exist
            else:
                return not is_inside
        return is_inside

    def check_device_against_fence(
        self, fence: dict, device: dict
    ) -> bool:
        """
        Core logic to check one device against one fence.
        Returns True if an alarm was triggered, False otherwise.
        """
        violation = self.check_device_violation(fence, device)
        gcj_lat, gcj_lng = device.get("last_latitude"), device.get("last_longitude")

        if violation:
            description = ""
            behavior = fence.get("behavior")
            if behavior == "No Entry":
                description = f"Device {device.get('device_name')} entered restricted area: {fence.get('name')}"
            else:
                description = f"Device {device.get('device_name')} left designated area: {fence.get('name')}"

            # Check for duplicate ACTIVE alarms for this device and fence
            existing_alarm = alarms_collection.find_one({
                "device_id": device.get("id"),
                "fence_id": fence.get("fence_id"),
                "status": "pending"
            })

            if existing_alarm:
                return False  # Already alarmed

            logger.warning(f"  VIOLATION DETECTED: {description}")
            alarm_service = AlarmService()
            loc_str = f"{gcj_lat:.6f}, {gcj_lng:.6f}"

            # Determine distinct alarm type based on behavior
            current_alarm_type = "电子围栏越界"  # Default / No Exit
            if behavior == "No Entry":
                current_alarm_type = "电子围栏闯入"

            alarm_data = AlarmCreate(
                device_id=device.get("id"),
                fence_id=fence.get("fence_id"),
                alarm_type=current_alarm_type,
                severity=fence.get("alarm_type", "high"),
                description=description,
                location=loc_str,
                status="pending",
            )
            try:
                alarm_service.create_alarm(alarm_data)
                return True
            except Exception as e:
                logger.error(f"Failed to create alarm: {e}")

        return False

    def _get_distance(self, lat1, lon1, lat2, lon2):
        """
        Calculate Haversine distance between two points in meters.
        """
        R = 6371000  # Radius of Earth in meters
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

    def _is_inside_polygon(self, point, polygon):
        """
        Ray casting algorithm to check if point is inside polygon.
        point: (lng, lat) -> (x, y)
        polygon: list of (lng, lat)
        """
        if not polygon:
            return False
        x, y = point
        n = len(polygon)
        inside = False
        p1x, p1y = polygon[0]
        for i in range(n + 1):
            p2x, p2y = polygon[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        return inside
