import json
import math
import time as time_module
from datetime import datetime, time, timedelta
from app.schemas.fence_schema import FenceCreate, FenceUpdate, ProjectRegionCreate, ProjectRegionUpdate
from app.core.database import get_compatible_mongo_db, get_mongo_collection, get_next_sequence
from app.utils.logger import get_logger
from app.core.ws_manager import push_alarm_threadsafe
from app.utils.config_manager import get_fence_detection_interval, get_fence_grace_period, get_fence_alarm_silence_minutes, get_fence_setting

# MongoDB 连接配置：优先使用含 fence 集合的兼容库，告警写入同一个库
db = get_compatible_mongo_db("fence")
fences_collection = db["fence"]
regions_collection = db["project_regions"]
devices_collection = get_mongo_collection("device")
alarms_collection = db["alarm_record"]

logger = get_logger("FenceService")
FENCE_TOUCH_TOLERANCE_METERS = 3.0

# 设备上次检测时间缓存（用于控制检测频率）
_last_detection_time = {}  # device_id -> timestamp

# 越界延迟判定缓存（用于二次确认）
# 格式: {(device_id, fence_id): {"first_time": timestamp, "is_confirmed": False}}
_pending_violations = {}  # (device_id, fence_id) -> {"first_time": float, "is_confirmed": bool}

# 告警静默缓存（用于控制重复告警频率）
# 格式: {(device_id, fence_id): last_alarm_timestamp}
_alarm_silence_cache = {}  # (device_id, fence_id) -> float


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
        lat, lng = self._get_device_lat_lng(device)
        if lat is None or lng is None:
            return False
        try:
            poly_points = json.loads(region.get("coordinates_json", "[]"))
            poly = []
            for p in poly_points:
                if isinstance(p, list) and len(p) >= 2:
                    poly.append((float(p[1]), float(p[0])))
                elif isinstance(p, dict):
                    poly.append((float(p.get("lng")), float(p.get("lat"))))
            return self._is_inside_polygon((lng, lat), poly)
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

        # 获取系统配置的默认值
        default_behavior = get_fence_setting('fenceDefaultBehavior', 'No Entry')
        default_severity = get_fence_setting('fenceDefaultSeverity', 'medium')
        retention_days = get_fence_setting('fenceRetentionDays', 365)
        
        new_fence = {
            "fence_id": str(int(datetime.now().timestamp() * 1000)),
            "name": fence_data.name,
            "company": company,  # 从前端传入
            "project": project,  # 从前端传入
            "project_region_id": fence_data.project_region_id,
            "shape": fence_data.shape,
            "behavior": fence_data.behavior or default_behavior,
            "severity": fence_data.alarm_type.value if hasattr(fence_data.alarm_type, "value") else default_severity,
            "geometry": geometry,
            "schedule": {
                "start": datetime.now().isoformat(),
                "end": (datetime.now() + timedelta(days=retention_days)).isoformat()
            },
            "effective_time": fence_data.effective_time or "00:00-23:59",
            "worker_count": 0,
            "remark": fence_data.remark or "",
            "alarm_type": fence_data.alarm_type.value if hasattr(fence_data.alarm_type, "value") else default_severity,
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
        devices = list(devices_collection.find({
            "$or": [
                {
                    "last_latitude": {"$exists": True, "$ne": None},
                    "last_longitude": {"$exists": True, "$ne": None},
                },
                {
                    "lat": {"$exists": True, "$ne": None},
                    "lng": {"$exists": True, "$ne": None},
                },
            ]
        }))

        count = 0
        checked = 0
        for device in devices:
            lat, lng = self._get_device_lat_lng(device)
            if lat is None or lng is None:
                continue
            checked += 1
            if self.check_device_against_fence(fence, device):
                count += 1
        
        # 只更新围栏计数，不打印详细信息
        self._update_fence_count(fence)
        logger.info(f"Fence creation check: checked {checked} devices, triggered {count} alarms.")

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
        
        根据系统设置的检测间隔控制检测频率，避免频繁检测。
        """
        if lat is None or lng is None:
            return

        # 获取检测间隔配置（秒）
        detection_interval = get_fence_detection_interval()
        
        # 检查是否需要跳过本次检测（基于检测间隔）
        current_time = time_module.time()
        last_time = _last_detection_time.get(str(device_id), 0)
        if current_time - last_time < detection_interval:
            logger.debug(f"设备 {device_id} 检测间隔未到，跳过本次检测")
            return
        
        # 更新上次检测时间
        _last_detection_time[str(device_id)] = current_time

        device = (
            devices_collection.find_one({"device_id": str(device_id)})
            or devices_collection.find_one({"id": str(device_id)})
            or {"device_id": str(device_id), "name": f"定位设备-{device_id}"}
        )
        device["last_latitude"] = float(lat)
        device["last_longitude"] = float(lng)

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

    def _get_device_lat_lng(self, device: dict) -> tuple[float | None, float | None]:
        lat = device.get("last_latitude")
        lng = device.get("last_longitude")
        if lat is None:
            lat = device.get("lat")
        if lng is None:
            lng = device.get("lng")
        if lat is None or lng is None:
            return None, None
        try:
            return float(lat), float(lng)
        except (TypeError, ValueError):
            return None, None

    def _extract_lat_lng(self, point) -> tuple[float, float] | None:
        try:
            if isinstance(point, list) and len(point) >= 2:
                return float(point[0]), float(point[1])
            if isinstance(point, dict):
                return float(point.get("lat")), float(point.get("lng"))
        except (TypeError, ValueError):
            return None
        return None

    def _to_local_xy(self, lat: float, lng: float, ref_lat: float, ref_lng: float) -> tuple[float, float]:
        meters_per_degree_lat = 111320.0
        meters_per_degree_lng = 111320.0 * math.cos(math.radians(ref_lat))
        return (
            (lng - ref_lng) * meters_per_degree_lng,
            (lat - ref_lat) * meters_per_degree_lat,
        )

    def _distance_to_segment_meters(
        self,
        point: tuple[float, float],
        start: tuple[float, float],
        end: tuple[float, float],
    ) -> float:
        px, py = point
        ax, ay = start
        bx, by = end
        dx = bx - ax
        dy = by - ay
        if dx == 0 and dy == 0:
            return math.hypot(px - ax, py - ay)

        t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
        t = max(0.0, min(1.0, t))
        closest_x = ax + t * dx
        closest_y = ay + t * dy
        return math.hypot(px - closest_x, py - closest_y)

    def _is_point_near_polygon_boundary(
        self,
        lat: float,
        lng: float,
        polygon_points: list,
        tolerance_meters: float = FENCE_TOUCH_TOLERANCE_METERS,
    ) -> bool:
        coords = []
        for point in polygon_points:
            coord = self._extract_lat_lng(point)
            if coord is not None:
                coords.append(coord)

        if len(coords) < 2:
            return False

        local_point = self._to_local_xy(lat, lng, lat, lng)
        local_coords = [self._to_local_xy(p_lat, p_lng, lat, lng) for p_lat, p_lng in coords]

        for idx, start in enumerate(local_coords):
            end = local_coords[(idx + 1) % len(local_coords)]
            if self._distance_to_segment_meters(local_point, start, end) <= tolerance_meters:
                return True
        return False

    def _get_fence_position(self, fence: dict, device: dict) -> tuple[bool, bool]:
        lat, lng = self._get_device_lat_lng(device)
        if lat is None or lng is None:
            return False, False

        shape = fence.get("shape")
        geometry = fence.get("geometry", {})

        if shape == "circle":
            try:
                center = geometry.get("center")
                radius = float(geometry.get("radius", 0) or 0)
                center_coord = self._extract_lat_lng(center)
                if center_coord is None:
                    return False, False
                center_lat, center_lng = center_coord
                distance = self._get_distance(lat, lng, center_lat, center_lng)
                inside = distance < max(0.0, radius - FENCE_TOUCH_TOLERANCE_METERS)
                touching = abs(distance - radius) <= FENCE_TOUCH_TOLERANCE_METERS
                return inside, touching
            except Exception:
                return False, False

        if shape == "polygon":
            try:
                polygon_points = geometry.get("points", [])
                poly = []
                for point in polygon_points:
                    coord = self._extract_lat_lng(point)
                    if coord is not None:
                        point_lat, point_lng = coord
                        poly.append((point_lng, point_lat))
                inside = self._is_inside_polygon((lng, lat), poly)
                touching = self._is_point_near_polygon_boundary(lat, lng, polygon_points)
                return inside and not touching, touching
            except Exception:
                return False, False

        return False, False

    def is_device_inside_fence(self, fence: dict, device: dict) -> bool:
        """Helper to determine if a device is currently inside a fence boundary."""
        inside, touching = self._get_fence_position(fence, device)
        return inside or touching

    def _update_fence_count(self, fence: dict):
        """Recalculate and update the worker_count (violator count) for a fence."""
        # If fence is not active or out of time range, count is 0
        if not self.is_fence_active_now(fence):
            fences_collection.update_one({"fence_id": fence.get("fence_id")}, {"$set": {"worker_count": 0}})
            return

        devices = list(devices_collection.find({
            "$or": [
                {
                    "last_latitude": {"$exists": True, "$ne": None},
                    "last_longitude": {"$exists": True, "$ne": None},
                },
                {
                    "lat": {"$exists": True, "$ne": None},
                    "lng": {"$exists": True, "$ne": None},
                },
            ]
        }))
        count = 0
        for device in devices:
            if self.check_device_violation(fence, device):
                count += 1
        
        # 只更新计数，不打印日志
        fences_collection.update_one({"fence_id": fence.get("fence_id")}, {"$set": {"worker_count": count}})

    def check_device_violation(self, fence: dict, device: dict) -> bool:
        """Determine if a device is violating a fence's rules."""
        lat, lng = self._get_device_lat_lng(device)
        if lat is None or lng is None:
            return False

        is_inside, is_touching = self._get_fence_position(fence, device)
        
        behavior = fence.get("behavior")
        if behavior == "No Entry":
            return is_inside or is_touching
        elif behavior == "No Exit":
            # 对于No Exit行为，需要检查设备的company和project是否与围栏一致
            fence_company = fence.get("company")
            fence_project = fence.get("project")
            device_company = device.get("company")
            device_project = device.get("project")
            
            # 只有当设备的company和project与围栏一致，并且设备在围栏外时，才返回True
            company_match = not fence_company or fence_company == device_company
            project_match = not fence_project or fence_project == device_project
            
            return (not is_inside or is_touching) and company_match and project_match
        return is_inside or is_touching

    def _normalize_alarm_severity(self, fence: dict) -> str:
        raw = str(fence.get("alarm_type") or fence.get("severity") or "medium").lower()
        severity_map = {
            "severe": "high",
            "risk": "medium",
            "general": "low",
            "normal": "low",
        }
        return severity_map.get(raw, raw if raw in {"high", "medium", "low"} else "medium")

    def _is_in_silence_period(self, device_id: str, fence_id: str) -> bool:
        """检查设备-围栏对是否在告警静默期内"""
        silence_minutes = get_fence_alarm_silence_minutes()
        
        if silence_minutes <= 0:
            return False  # 静默时间为0或负数，不启用静默
        
        cache_key = (device_id, fence_id)
        last_alarm_time = _alarm_silence_cache.get(cache_key, 0)
        current_time = time_module.time()
        
        # 计算距离上次告警的分钟数（支持小数）
        elapsed_minutes = (current_time - last_alarm_time) / 60
        
        return elapsed_minutes < silence_minutes

    def _create_fence_alarm(self, fence: dict, device: dict, alarm_type: str, description: str, location: str) -> bool:
        device_id = str(device.get("device_id") or device.get("id") or "")
        fence_id = str(fence.get("fence_id") or fence.get("id") or "")
        if not device_id or not fence_id:
            return False

        # 检查告警静默期
        if self._is_in_silence_period(device_id, fence_id):
            return False

        next_id = int(get_next_sequence("alarm_record_id", db=db))
        now = datetime.utcnow()
        payload = {
            "id": next_id,
            "device_id": device_id,
            "fence_id": fence_id,
            "project_id": fence.get("project_id"),
            "alarm_source": "fence",
            "source_type": "fence",
            "alarm_type": alarm_type,
            "severity": self._normalize_alarm_severity(fence),
            "timestamp": now,
            "description": description,
            "status": "pending",
            "handled_at": None,
            "location": location,
            "recording_path": "",
            "recording_status": "not_required",
            "recording_error": "",
            "alarm_image_path": "",
            "personnel_id": device.get("holderPhone") or "",
            "person_name": device.get("holder") or device.get("name") or device.get("device_name") or "未知",
            "person": {
                "username": device.get("holder") or device.get("name") or device.get("device_name") or "未知",
            },
        }
        alarms_collection.insert_one(payload)
        logger.warning(f"Fence alarm saved to alarm_record: alarm_id={next_id}, device={device_id}, fence={fence_id}")
        
        # 更新告警静默缓存
        _alarm_silence_cache[(device_id, fence_id)] = time_module.time()
        
        # Push alarm to frontend via WebSocket
        alarm_data = {
            "id": next_id,
            "device_id": device_id,
            "fence_id": fence_id,
            "alarm_type": alarm_type,
            "type": alarm_type,  # 前端期望的字段名
            "severity": self._normalize_alarm_severity(fence),
            "timestamp": now.isoformat(),
            "description": description,
            "location": location,
            "person_name": device.get("holder") or device.get("name") or device.get("device_name") or "未知",
            "msg": description,  # 前端期望的消息字段
            "is_alarm": True  # 标记为警报，触发前端弹窗和声音
        }
        push_alarm_threadsafe(alarm_data)
        
        return True

    def check_device_against_fence(
        self, fence: dict, device: dict
    ) -> bool:
        """
        Core logic to check one device against one fence.
        Returns True if an alarm was triggered, False otherwise.
        
        支持越界判定延迟：首次检测到越界时不立即报警，等待配置的延迟时间后再次检测确认。
        """
        violation = self.check_device_violation(fence, device)
        gcj_lat, gcj_lng = self._get_device_lat_lng(device)
        
        device_id = str(device.get("device_id") or device.get("id") or "")
        fence_id = str(fence.get("fence_id") or fence.get("id") or "")
        cache_key = (device_id, fence_id)
        current_time = time_module.time()
        
        # 获取越界判定延迟配置（秒）
        grace_period = get_fence_grace_period()
        
        if violation:
            # 检测到越界
            if cache_key in _pending_violations:
                # 已有待确认的越界记录
                pending = _pending_violations[cache_key]
                elapsed = current_time - pending["first_time"]
                
                if elapsed >= grace_period:
                    # 延迟时间已到，确认越界，触发警报
                    logger.debug(f"设备 {device_id} 越界确认：延迟{grace_period}秒后仍越界，触发警报")
                    del _pending_violations[cache_key]
                    
                    description = ""
                    behavior = fence.get("behavior")
                    device_name = device.get("device_name") or device.get("name") or device.get("device_id") or device.get("id")
                    if behavior == "No Entry":
                        description = f"Device {device_name} entered restricted area: {fence.get('name')}"
                    else:
                        description = f"Device {device_name} left designated area: {fence.get('name')}"

                    loc_str = f"{gcj_lat:.6f}, {gcj_lng:.6f}"
                    current_alarm_type = "电子围栏越界"
                    if behavior == "No Entry":
                        current_alarm_type = "电子围栏闯入"

                    try:
                        alarm_created = self._create_fence_alarm(fence, device, current_alarm_type, description, loc_str)
                        if alarm_created:
                            logger.warning(f"Fence alarm created: {description}")
                        return alarm_created
                    except Exception as e:
                        logger.error(f"Failed to create alarm: {e}")
                else:
                    # 延迟时间未到，继续等待
                    logger.debug(f"设备 {device_id} 越界待确认：已等待{elapsed:.1f}秒，还需{grace_period - elapsed:.1f}秒")
                    return False
            else:
                # 首次检测到越界，记录时间，等待延迟
                if grace_period > 0:
                    _pending_violations[cache_key] = {"first_time": current_time, "is_confirmed": False}
                    logger.debug(f"设备 {device_id} 首次检测到越界，进入{grace_period}秒延迟确认期")
                    return False
                else:
                    # 延迟为0，立即报警
                    description = ""
                    behavior = fence.get("behavior")
                    device_name = device.get("device_name") or device.get("name") or device.get("device_id") or device.get("id")
                    if behavior == "No Entry":
                        description = f"Device {device_name} entered restricted area: {fence.get('name')}"
                    else:
                        description = f"Device {device_name} left designated area: {fence.get('name')}"

                    loc_str = f"{gcj_lat:.6f}, {gcj_lng:.6f}"
                    current_alarm_type = "电子围栏越界"
                    if behavior == "No Entry":
                        current_alarm_type = "电子围栏闯入"

                    try:
                        alarm_created = self._create_fence_alarm(fence, device, current_alarm_type, description, loc_str)
                        if alarm_created:
                            logger.warning(f"Fence alarm created: {description}")
                        return alarm_created
                    except Exception as e:
                        logger.error(f"Failed to create alarm: {e}")
        else:
            # 设备在围栏内（或不越界），清除待确认状态
            if cache_key in _pending_violations:
                del _pending_violations[cache_key]
                logger.debug(f"设备 {device_id} 已回到围栏内，取消待确认越界")
        
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
