import json

import math

import time as time_module
import threading

from datetime import datetime, time, timedelta
from bson import ObjectId
from bson.errors import InvalidId

from app.schemas.fence_schema import FenceCreate, FenceUpdate, ProjectRegionCreate, ProjectRegionUpdate
from app.schemas.log_schema import LogCreate

from app.core.database import get_compatible_mongo_db, get_mongo_collection, get_next_sequence

from app.utils.logger import get_logger
from app.services.log_service import LogService
from app.services.alarm_service import AlarmService

from app.core.ws_manager import push_alarm_threadsafe

from app.utils.config_manager import get_fence_detection_interval, get_fence_grace_period, get_fence_alarm_silence_minutes, get_fence_setting, get_fence_alarms_disabled, get_fence_default_radius, get_fence_retention_days
from app.core.data_scope import in_scope, scope_filter



# MongoDB 杩炴帴閰嶇疆锛氫紭鍏堜娇鐢ㄥ惈 fence 闆嗗悎鐨勫吋瀹瑰簱,鍛婅鍐欏叆鍚屼竴涓簱

db = get_compatible_mongo_db("fence")

fences_collection = db["fence"]

regions_collection = db["project_regions"]

devices_collection = get_mongo_collection("device")

alarms_collection = db["alarm_record"]



logger = get_logger("FenceService")

FENCE_TOUCH_TOLERANCE_METERS = 3.0



# 璁惧涓婃妫€娴嬫椂闂寸紦瀛?鐢ㄤ簬鎺у埗妫€娴嬮鐜?

_last_detection_time = {}  # device_id -> timestamp



# 瓒婄晫寤惰繜鍒ゅ畾缂撳瓨(鐢ㄤ簬浜屾纭)

# 鏍煎紡: {(device_id, fence_id): {"first_time": timestamp, "is_confirmed": False}}

_pending_violations = {}  # (device_id, fence_id) -> {"first_time": float, "is_confirmed": bool}



# 鍛婅闈欓粯缂撳瓨(鐢ㄤ簬鎺у埗閲嶅鍛婅棰戠巼)

# 鏍煎紡: {(device_id, fence_id): last_alarm_timestamp}

_alarm_silence_cache = {}  # (device_id, fence_id) -> float

_unscoped_no_exit_warned = set()





class FenceService:

    def _fence_identity_query(self, fence_id) -> dict:
        values = [fence_id]
        text_id = str(fence_id)
        values.append(text_id)
        if text_id.isdigit():
            values.append(int(text_id))

        seen = set()
        unique_values = []
        for value in values:
            key = (type(value).__name__, str(value))
            if value in [None, ""] or key in seen:
                continue
            seen.add(key)
            unique_values.append(value)

        candidates = []
        for value in unique_values:
            candidates.append({"fence_id": value})
            candidates.append({"id": value})

        try:
            candidates.append({"_id": ObjectId(text_id)})
        except (InvalidId, TypeError):
            pass

        if not candidates:
            return {"_id": {"$exists": False}}
        return {"$or": candidates}

    def _fence_doc_query(self, fence: dict, fallback_id=None) -> dict:
        if fence.get("_id"):
            return {"_id": fence["_id"]}
        return self._fence_identity_query(fence.get("fence_id") or fence.get("id") or fallback_id)

    def _find_fence_by_identity(self, fence_id):
        return fences_collection.find_one(self._fence_identity_query(fence_id))

    def _serialize_for_log(self, value):
        if isinstance(value, dict):
            result = {}
            for key, item in value.items():
                if key == "_id":
                    result["mongo_id"] = str(item)
                else:
                    result[str(key)] = self._serialize_for_log(item)
            return result
        if isinstance(value, list):
            return [self._serialize_for_log(item) for item in value]
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, ObjectId):
            return str(value)
        return value

    def _log_operator(self, current_user: dict | None) -> str:
        if not current_user:
            return "system"
        return str(
            current_user.get("username")
            or current_user.get("name")
            or current_user.get("operator")
            or "unknown"
        )

    def _fence_binding_fields(self, fence: dict | None, current_user: dict | None = None) -> dict:
        fence = fence or {}
        current_user = current_user or {}
        branch_id = fence.get("branch_id") or current_user.get("branch_id") or current_user.get("department_id")
        project_id = fence.get("project_id") or current_user.get("project_id")
        team_id = fence.get("team_id") or current_user.get("team_id")
        return {
            "company": fence.get("company") or fence.get("department") or current_user.get("company") or current_user.get("department") or (str(branch_id) if branch_id else None),
            "project": fence.get("project") or current_user.get("project") or (str(project_id) if project_id else None),
            "team": fence.get("team") or fence.get("workTeam") or fence.get("work_team") or current_user.get("team") or (str(team_id) if team_id else None),
            "branch_id": branch_id,
            "project_id": project_id,
            "grid_id": fence.get("grid_id") or current_user.get("grid_id"),
            "team_id": team_id,
        }

    def _fence_log_extra(self, fence: dict | None, current_user: dict | None = None, **extra) -> dict:
        fence = fence or {}
        binding = self._fence_binding_fields(fence, current_user)
        payload = {
            "fence_id": fence.get("fence_id") or fence.get("id"),
            "shape": fence.get("shape"),
            "behavior": fence.get("behavior"),
            "severity": fence.get("severity") or fence.get("alarm_type"),
            "scheduleStart": (fence.get("schedule") or {}).get("start"),
            "scheduleEnd": (fence.get("schedule") or {}).get("end"),
            "geometry": fence.get("geometry"),
            "binding": binding,
            **binding,
        }
        payload.update(extra)
        return self._serialize_for_log({k: v for k, v in payload.items() if v not in [None, ""]})

    def _write_fence_log(
        self,
        action: str,
        fence: dict | None,
        current_user: dict | None = None,
        details: str | None = None,
        **extra,
    ):
        try:
            binding = self._fence_binding_fields(fence, current_user)
            log_create = LogCreate(
                operator=self._log_operator(current_user),
                action=action,
                target_type="fence",
                target_name=(fence or {}).get("name") or (fence or {}).get("fence_id") or "鏈煡鍥存爮",
                details=details,
                company=binding.get("company"),
                project=binding.get("project"),
                team=binding.get("team"),
                extra=self._fence_log_extra(fence, current_user, **extra),
            )
            LogService().create_log(None, log_create)
        except Exception as e:
            logger.error(f"Failed to create fence log: {str(e)}")

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



    def create_fence(
        self,
        fence_data: FenceCreate,
        company: str = "",
        project: str = "",
        schedule: dict | None = None,
        scope_fields: dict | None = None,
        current_user: dict | None = None,
    ):

        logger.info(f"Creating new fence: {fence_data.name} ({fence_data.shape})")



        # Basic validation logic could go here

        circle_radius = fence_data.radius

        if fence_data.shape == "circle" and not circle_radius:

            circle_radius = get_fence_default_radius()



        # 瑙ｆ瀽鍧愭爣鏁版嵁

        geometry = {}

        if fence_data.shape == "circle":

            try:

                center = json.loads(fence_data.coordinates_json)

                geometry["center"] = center

                geometry["radius"] = circle_radius

            except:

                pass

        elif fence_data.shape == "polygon":

            try:

                points = json.loads(fence_data.coordinates_json)

                geometry["points"] = points

            except:

                pass



        # 鑾峰彇绯荤粺閰嶇疆鐨勯粯璁?

        default_behavior = get_fence_setting('fenceDefaultBehavior', 'No Entry')

        default_severity = get_fence_setting('fenceDefaultSeverity', 'medium')

        retention_days = get_fence_retention_days()
        now = datetime.now()
        schedule_start = (schedule or {}).get("start") or now.isoformat()
        schedule_end = (schedule or {}).get("end") or (now + timedelta(days=retention_days)).isoformat()

        

        new_fence = {

            "fence_id": str(int(datetime.now().timestamp() * 1000)),

            "name": fence_data.name,

            "company": company,  # 浠庡墠绔紶?

            "project": project,  # 浠庡墠绔紶?

            "project_region_id": fence_data.project_region_id,

            "shape": fence_data.shape,

            "behavior": fence_data.behavior or default_behavior,

            "severity": fence_data.alarm_type.value if hasattr(fence_data.alarm_type, "value") else default_severity,

            "geometry": geometry,

            "schedule": {

                "start": schedule_start,

                "end": schedule_end

            },

            "effective_time": fence_data.effective_time or "00:00-23:59",

            "worker_count": 0,

            "remark": fence_data.remark or "",

            "alarm_type": fence_data.alarm_type.value if hasattr(fence_data.alarm_type, "value") else default_severity,

            "is_active": True,

            "createdAt": datetime.now().isoformat(),

            "updatedAt": datetime.now().isoformat()

        }

        for key, value in (scope_fields or {}).items():
            if value not in [None, "", [], {}]:
                new_fence[key] = value



        result = fences_collection.insert_one(new_fence)

        new_fence["_id"] = str(result.inserted_id)

        self._write_fence_log("创建围栏", new_fence, current_user, details=f"创建围栏: {new_fence.get('name')}")



        # Immediate check for existing devices

        self._check_existing_devices(new_fence)



        print(new_fence)





        return new_fence



    def _check_existing_devices(self, fence: dict):

        """Check all devices against the newly created fence."""

        logger.info(f"Checking existing devices for fence {fence.get('name')}")

        devices = list(devices_collection.find(DEVICE_COORD_QUERY))



        count = 0

        checked = 0

        pending_count = 0

        for device in devices:

            lat, lng = self._get_device_lat_lng(device)

            if lat is None or lng is None:

                continue

            checked += 1

            is_violation = self.check_device_violation(fence, device)

            if self.check_device_against_fence(fence, device):

                count += 1
            elif is_violation:

                pending_count += 1

        

        # 鍙洿鏂板洿鏍忚鏁?涓嶆墦鍗拌缁嗕俊?

        self._update_fence_count(fence)

        if pending_count > 0 and get_fence_grace_period() > 0:

            self._schedule_pending_fence_confirmation(fence)

        logger.info(f"Fence creation check: checked {checked} devices, triggered {count} alarms.")



    def _schedule_pending_fence_confirmation(self, fence: dict):
        fence_id = str(fence.get("fence_id") or fence.get("id") or "")
        delay = max(0.1, float(get_fence_grace_period()) + 0.2)

        def confirm():
            try:
                latest_fence = fences_collection.find_one({"fence_id": fence_id}) or fence
                if not latest_fence or not self.is_fence_active_now(latest_fence):
                    return
                for device in devices_collection.find(DEVICE_COORD_QUERY):
                    lat, lng = self._get_device_lat_lng(device)
                    if lat is None or lng is None:
                        continue
                    self.check_device_against_fence(latest_fence, device)
                self._update_fence_count(latest_fence)
            except Exception as e:
                logger.error(f"Pending fence confirmation failed for {fence_id}: {e}")

        timer = threading.Timer(delay, confirm)
        timer.daemon = True
        timer.start()



    def update_fence(
        self,
        fence_id: str,
        fence_data: FenceUpdate,
        current_user: dict | None = None,
        metadata_updates: dict | None = None,
        scope_fields: dict | None = None,
    ):

        logger.info(f"Updating fence ID: {fence_id}")

        db_fence = self._find_fence_by_identity(fence_id)

        if not db_fence:

            return None

        if not self._in_user_scope(db_fence, current_user):
            return None



        # Update fields if they are provided (not None)

        update_data = fence_data.model_dump(exclude_unset=True)

        if "alarm_type" in update_data:
            alarm_type_value = update_data["alarm_type"]
            update_data["severity"] = alarm_type_value.value if hasattr(alarm_type_value, "value") else alarm_type_value

        for key, value in (metadata_updates or {}).items():
            if value not in [None, "", [], {}]:
                update_data[key] = value

        for key, value in (scope_fields or {}).items():
            if value not in [None, "", [], {}]:
                update_data[key] = value

        update_data["updatedAt"] = datetime.now().isoformat()



        # 澶勭悊鍧愭爣鏁版嵁

        if "coordinates_json" in update_data:

            geometry = {}
            shape = update_data.get("shape") or db_fence.get("shape")

            if shape == "circle":

                try:

                    center = json.loads(update_data["coordinates_json"])

                    geometry["center"] = center

                    geometry["radius"] = update_data.get("radius")

                except:

                    pass

            elif shape == "polygon":

                try:

                    points = json.loads(update_data["coordinates_json"])

                    geometry["points"] = points

                except:

                    pass

            update_data["geometry"] = geometry

            update_data.pop("coordinates_json", None)



        query = self._fence_doc_query(db_fence, fence_id)

        fences_collection.update_one(query, {"$set": update_data})

        self._update_fence_count(fences_collection.find_one(query))

        updated_fence = fences_collection.find_one(query)

        updated_fence["_id"] = str(updated_fence["_id"])

        changed_fields = sorted([key for key in update_data.keys() if key != "updatedAt"])
        self._write_fence_log(
            "更改围栏",
            updated_fence,
            current_user,
            details=f"更改围栏: {updated_fence.get('name')}",
            changed_fields=changed_fields,
            before=self._serialize_for_log(db_fence),
            after=self._serialize_for_log(updated_fence),
        )

        return updated_fence



    def _scope_kwargs(self) -> dict:
        return {
            "project_fields": ("project_id",),
            "grid_fields": ("grid_id",),
            "team_fields": ("team_id",),
            "branch_fields": ("branch_id",),
            "company_fields": ("company", "department"),
            "project_name_fields": ("project",),
            "team_name_fields": ("team", "workTeam", "work_team"),
        }

    def _in_user_scope(self, fence: dict | None, current_user: dict | None) -> bool:
        if current_user is None:
            return True
        return in_scope(fence, current_user, **self._scope_kwargs())

    def get_fences(self, skip: int = 0, limit: int = 100, current_user: dict | None = None):

        query = scope_filter(current_user, **self._scope_kwargs()) if current_user else {}
        fences = list(fences_collection.find(query).skip(skip).limit(limit))

        for fence in fences:

            fence["_id"] = str(fence["_id"])

        return fences

    def get_fence_by_id(self, fence_id: str, current_user: dict | None = None):
        fence = self._find_fence_by_identity(fence_id)
        if not fence:
            return None
        if not self._in_user_scope(fence, current_user):
            return None
        fence["_id"] = str(fence["_id"])
        return fence



    def delete_fence(self, fence_id: str, current_user: dict | None = None):

        db_fence = self._find_fence_by_identity(fence_id)

        if db_fence and self._in_user_scope(db_fence, current_user):
            fence_identifier = str(db_fence.get("fence_id") or db_fence.get("id") or fence_id)
            delete_query = self._fence_doc_query(db_fence, fence_id)
            backup = self._serialize_for_log(db_fence)

            # Set fence_id to NULL for associated alarms instead of deleting them

            alarm_update = alarms_collection.update_many(
                {"$or": [{"fence_id": fence_identifier}, {"fence_id": int(fence_identifier) if fence_identifier.isdigit() else fence_identifier}]},
                {
                    "$unset": {"fence_id": ""},
                    "$set": {
                        "deleted_fence_id": fence_identifier,
                        "deleted_fence_name": db_fence.get("name"),
                        "deleted_fence_backup": backup,
                    },
                },
            )

            fences_collection.delete_one(delete_query)

            self._write_fence_log(
                "删除围栏",
                db_fence,
                current_user,
                details=f"删除围栏: {db_fence.get('name')}",
                deleted_fence_backup=backup,
                affected_alarm_count=getattr(alarm_update, "modified_count", 0),
            )

            return True

        return False



    def check_fence_status(self, device_id: str, lat: float, lng: float):

        """

        Check if a specific device (with new coordinates) violates any active fence.

        This is typically called by a location update stream.

        

        鏍规嵁绯荤粺璁剧疆鐨勬娴嬮棿闅旀帶鍒舵娴嬮鐜?閬垮厤棰戠箒妫€娴?

        """

        if lat is None or lng is None:

            return



        # 鑾峰彇妫€娴嬮棿闅旈厤缃?绉?

        detection_interval = get_fence_detection_interval()

        

        # 妫€鏌ユ槸鍚﹂渶瑕佽烦杩囨湰娆℃娴?鍩轰簬妫€娴嬮棿闅?

        current_time = time_module.time()

        last_time = _last_detection_time.get(str(device_id), 0)

        if current_time - last_time < detection_interval:

            logger.debug(f"设备 {device_id} 检测间隔未到，跳过本次检测")
            return

        

        # 鏇存柊涓婃妫€娴嬫椂?

        _last_detection_time[str(device_id)] = current_time



        device = self._find_device_by_identity(str(device_id)) or {
            "device_id": str(device_id),
            "name": f"定位设备-{device_id}",
        }

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

        schedule = fence.get("schedule") or {}
        try:
            now_datetime = datetime.now()
            start_datetime = self._parse_datetime_str(schedule.get("start"))
            end_datetime = self._parse_datetime_str(schedule.get("end"))
            if start_datetime and now_datetime < start_datetime:
                return False
            if end_datetime and now_datetime > end_datetime:
                return False
        except Exception as e:
            logger.error(f"Error checking fence validity dates: {e}")

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


    def _parse_datetime_str(self, value: str | None) -> datetime | None:
        if not value:
            return None
        text = str(value).strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone().replace(tzinfo=None)
        return parsed


    def _parse_time_str(self, time_str: str) -> time:

        """Parse 'HH:mm' or 'HH.mm' style strings."""

        ts = time_str.strip().replace('.', ':')

        parts = ts.split(':')

        h = int(parts[0])

        m = int(parts[1]) if len(parts) > 1 else 0

        return time(h, m)



    def _get_device_lat_lng(self, device: dict) -> tuple[float | None, float | None]:

        lat = device.get("lat")

        lng = device.get("lng")

        if lat is None:

            lat = device.get("last_latitude")

        if lng is None:

            lng = device.get("last_longitude")

        if lat is None:

            lat = device.get("last_lat")

        if lng is None:

            lng = device.get("last_lng")

        if lat is None or lng is None:

            return None, None

        try:

            lat_value = float(lat)
            lng_value = float(lng)
            if abs(lat_value) > 90 and abs(lng_value) <= 90:
                lat_value, lng_value = lng_value, lat_value
            return lat_value, lng_value

        except (TypeError, ValueError):

            return None, None


    def _device_identity(self, device: dict) -> str:
        return str(
            device.get("phone_num")
            or device.get("device_code")
            or device.get("device_serial")
            or device.get("device_id")
            or device.get("id")
            or ""
        )


    def _device_display_name(self, device: dict) -> str:
        return str(device.get("device_name") or device.get("name") or self._device_identity(device) or "鏈煡璁惧")


    def _find_device_by_identity(self, device_id: str) -> dict | None:
        identity = str(device_id)
        queries = [
            {"phone_num": identity},
            {"device_code": identity},
            {"device_serial": identity},
            {"device_id": identity},
            {"id": identity},
        ]
        if identity.isdigit():
            queries.append({"id": int(identity)})
            queries.append({"device_id": int(identity)})

        for query in queries:
            device = devices_collection.find_one(query)
            if device:
                return device
        return None



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



        devices = list(devices_collection.find(DEVICE_COORD_QUERY))

        count = 0

        for device in devices:

            if self.check_device_violation(fence, device):

                count += 1

        

        # 鍙洿鏂拌鏁?涓嶆墦鍗版棩?

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

            if not self._no_exit_scope_matches(fence, device):
                return False

            return not is_inside or is_touching

        return is_inside or is_touching


    def _scope_value(self, value) -> str:
        text = str(value or "").strip()
        return "" if text in {"0", "None", "null"} else text


    def _scope_variants(self, value) -> set[str]:
        text = self._scope_value(value)
        if not text:
            return set()
        variants = {text.lower()}
        if text.upper().startswith("BRANCH-"):
            suffix = text.split("-", 1)[1].strip()
            if suffix:
                variants.add(suffix.lower())
        return variants


    def _field_group_matches(self, fence: dict, device: dict, fence_fields: tuple[str, ...], device_fields: tuple[str, ...]) -> bool:
        fence_values = set()
        for field in fence_fields:
            fence_values.update(self._scope_variants(fence.get(field)))
        if not fence_values:
            return True

        device_values = set()
        for field in device_fields:
            device_values.update(self._scope_variants(device.get(field)))
        return bool(device_values and fence_values.intersection(device_values))


    def _no_exit_scope_matches(self, fence: dict, device: dict) -> bool:
        """No Exit fences must be scoped, otherwise legacy test fences match every device."""
        field_groups = (
            (("branch_id", "department_id"), ("branch_id", "department_id")),
            (("project_id",), ("project_id",)),
            (("grid_id",), ("grid_id", "responsibilityUnitId", "responsibility_unit_id")),
            (("team_id",), ("team_id",)),
            (("company", "department"), ("company", "department")),
            (("project", "project_name"), ("project", "project_name")),
            (("team", "workTeam", "work_team"), ("team", "workTeam", "work_team")),
        )
        has_scope = any(
            self._scope_value(fence.get(field))
            for fence_fields, _ in field_groups
            for field in fence_fields
        )
        if not has_scope:
            fence_id = str(fence.get("fence_id") or fence.get("id") or "")
            if fence_id not in _unscoped_no_exit_warned:
                _unscoped_no_exit_warned.add(fence_id)
                logger.warning(f"Skipped unscoped No Exit fence {fence_id}: {fence.get('name')}")
            return False
        return all(self._field_group_matches(fence, device, fence_fields, device_fields) for fence_fields, device_fields in field_groups)



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

        """妫€鏌ヨ?鍥存爮瀵规槸鍚﹀湪鍛婅闈欓粯鏈熷唴"""

        silence_minutes = get_fence_alarm_silence_minutes()

        

        if silence_minutes <= 0:

            return False  # 闈欓粯鏃堕棿?鎴栬礋鏁?涓嶅惎鐢ㄩ潤?

        

        cache_key = (device_id, fence_id)

        last_alarm_time = _alarm_silence_cache.get(cache_key, 0)

        current_time = time_module.time()

        

        # 璁＄畻璺濈涓婃鍛婅鐨勫垎閽熸暟(鏀寔灏忔暟)

        elapsed_minutes = (current_time - last_alarm_time) / 60

        

        return elapsed_minutes < silence_minutes



    def _create_fence_alarm(self, fence: dict, device: dict, alarm_type: str, description: str, location: str) -> bool:
        if get_fence_alarms_disabled():
            return False

        device_id = self._device_identity(device)

        fence_id = str(fence.get("fence_id") or fence.get("id") or "")

        if not device_id or not fence_id:

            return False



        # 妫€鏌ュ憡璀﹂潤榛樻湡

        if self._is_in_silence_period(device_id, fence_id):

            return False

        existing_alarm = alarms_collection.find_one({
            "device_id": device_id,
            "fence_id": fence_id,
            "$or": [
                {"source_type": "fence"},
                {"alarm_source": "fence"},
                {"fence_id": {"$nin": [None, "", 0, "0"]}},
            ],
            "status": {"$in": ["pending", "active", None]},
        })

        if existing_alarm:
            _alarm_silence_cache[(device_id, fence_id)] = time_module.time()
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

            "person_name": device.get("holder") or device.get("holder_id") or self._device_display_name(device),

            "person": {

                "username": device.get("holder") or device.get("holder_id") or self._device_display_name(device),

            },

        }
        payload = AlarmService()._apply_org_snapshot_to_payload(payload)

        alarms_collection.insert_one(payload)

        logger.warning(f"Fence alarm saved to alarm_record: alarm_id={next_id}, device={device_id}, fence={fence_id}")

        

        # 鏇存柊鍛婅闈欓粯缂撳瓨

        _alarm_silence_cache[(device_id, fence_id)] = time_module.time()

        

        # Push alarm to frontend via WebSocket

        alarm_data = {

            "id": next_id,

            "device_id": device_id,

            "fence_id": fence_id,

            "alarm_type": alarm_type,

            "type": alarm_type,  # 鍓嶇鏈熸湜鐨勫瓧娈靛悕

            "severity": self._normalize_alarm_severity(fence),

            "timestamp": now.isoformat(),

            "description": description,

            "location": location,

            "person_name": device.get("holder") or device.get("holder_id") or self._device_display_name(device),

            "msg": description,  # 鍓嶇鏈熸湜鐨勬秷鎭瓧?

            "is_alarm": True  # 鏍囪涓鸿鎶?瑙﹀彂鍓嶇寮圭獥鍜屽０?

        }

        push_alarm_threadsafe(alarm_data)

        

        return True



    def check_device_against_fence(

        self, fence: dict, device: dict

    ) -> bool:

        """

        Core logic to check one device against one fence.

        Returns True if an alarm was triggered, False otherwise.

        

        鏀寔瓒婄晫鍒ゅ畾寤惰繜锛氶娆℃娴嬪埌瓒婄晫鏃朵笉绔嬪嵆鎶ヨ,绛夊緟閰嶇疆鐨勫欢杩熸椂闂村悗鍐嶆妫€娴嬬‘璁?

        """

        violation = self.check_device_violation(fence, device)

        gcj_lat, gcj_lng = self._get_device_lat_lng(device)

        

        device_id = self._device_identity(device)

        fence_id = str(fence.get("fence_id") or fence.get("id") or "")

        cache_key = (device_id, fence_id)

        current_time = time_module.time()

        

        # 鑾峰彇瓒婄晫鍒ゅ畾寤惰繜閰嶇疆(绉?

        grace_period = get_fence_grace_period()

        

        if violation:

            # 妫€娴嬪埌瓒婄晫

            if cache_key in _pending_violations:

                # 宸叉湁寰呯‘璁ょ殑瓒婄晫璁板綍

                pending = _pending_violations[cache_key]

                elapsed = current_time - pending["first_time"]

                

                if elapsed >= grace_period:

                    # 寤惰繜鏃堕棿宸插埌,纭瓒婄晫,瑙﹀彂璀︽姤

                    logger.debug(f"设备 {device_id} 越界确认：延迟{grace_period}秒后仍越界，触发警报")

                    del _pending_violations[cache_key]

                    

                    description = ""

                    behavior = fence.get("behavior")

                    device_name = self._device_display_name(device)

                    if behavior == "No Entry":

                        description = f"{device_name} 闯入禁入区域: {fence.get('name')}"

                    else:

                        description = f"{device_name} 离开指定区域: {fence.get('name')}"



                    loc_str = f"{gcj_lat:.6f}, {gcj_lng:.6f}"

                    current_alarm_type = "电子围栏越界"

                    if behavior == "No Entry":

                        current_alarm_type = "电子围栏闯入"



                    try:

                        alarm_created = self._create_fence_alarm(fence, device, current_alarm_type, description, loc_str)

                        return alarm_created

                    except Exception as e:

                        logger.error(f"Failed to create alarm: {e}")

                else:

                    # 寤惰繜鏃堕棿鏈埌,缁х画绛?

                    logger.debug(f"设备 {device_id} 越界待确认：已等待{elapsed:.1f}秒，还需{grace_period - elapsed:.1f}秒")
                    return False

            else:

                # 棣栨妫€娴嬪埌瓒婄晫,璁板綍鏃堕棿,绛夊緟寤惰繜

                if grace_period > 0:

                    _pending_violations[cache_key] = {"first_time": current_time, "is_confirmed": False}

                    logger.debug(f"设备 {device_id} 首次检测到越界，进入{grace_period}秒延迟确认期")

                    return False

                else:

                    # 寤惰繜?,绔嬪嵆鎶?

                    description = ""

                    behavior = fence.get("behavior")

                    device_name = self._device_display_name(device)

                    if behavior == "No Entry":

                        description = f"{device_name} 闯入禁入区域: {fence.get('name')}"

                    else:

                        description = f"{device_name} 离开指定区域: {fence.get('name')}"



                    loc_str = f"{gcj_lat:.6f}, {gcj_lng:.6f}"

                    current_alarm_type = "电子围栏越界"

                    if behavior == "No Entry":

                        current_alarm_type = "电子围栏闯入"



                    try:

                        alarm_created = self._create_fence_alarm(fence, device, current_alarm_type, description, loc_str)

                        return alarm_created

                    except Exception as e:

                        logger.error(f"Failed to create alarm: {e}")

        else:

            # 璁惧鍦ㄥ洿鏍忓唴(鎴栦笉瓒婄晫),娓呴櫎寰呯‘璁ょ姸?

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

DEVICE_COORD_QUERY = {
    "$or": [
        {"last_latitude": {"$exists": True, "$ne": None}, "last_longitude": {"$exists": True, "$ne": None}},
        {"last_lat": {"$exists": True, "$ne": None}, "last_lng": {"$exists": True, "$ne": None}},
        {"lat": {"$exists": True, "$ne": None}, "lng": {"$exists": True, "$ne": None}},
    ]
}

