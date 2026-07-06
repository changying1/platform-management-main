from sqlalchemy.orm import Session
from fastapi import HTTPException
from bson import ObjectId
from bson.errors import InvalidId

from app.schemas.alarm_schema import AlarmCreate, AlarmUpdate
from app.schemas.log_schema import LogCreate
from app.utils.logger import get_logger
from app.core.database import get_compatible_mongo_db, get_mongo_collection, get_next_sequence
from app.services.notification_service import notification_service
from app.services.log_service import LogService
from app.core.data_scope import in_scope, is_hq, matches_query, merge_filters, scope_filter
from app.utils.config_manager import get_alarm_auto_resolve_enabled, get_alarm_retention_days, get_system_settings

from datetime import datetime, timedelta
import asyncio

# 不再恢复 SQL 报警主链
# from app.models.alarm_records import AlarmRecord
# from app.models.device import Device
# from app.models.fence import ElectronicFence

logger = get_logger("AlarmService")

VIDEO_BEHAVIOR_LABELS = {
    "HEIGHT_NO_HELMET": "未佩戴安全帽",
    "helmet_missing": "未佩戴安全帽",
}

class AlarmService:
    _fence_doc_cache: dict[str, dict | None] = {}
    _org_cache: dict[str, dict] = {}

    def _is_fence_alarm_doc(self, alarm_doc: dict | None) -> bool:
        if not alarm_doc:
            return False
        source_type = str(alarm_doc.get("source_type") or "").lower()
        alarm_source = str(alarm_doc.get("alarm_source") or "").lower()
        alarm_type = str(alarm_doc.get("alarm_type") or "")
        description = str(alarm_doc.get("description") or "")
        return (
            source_type == "fence"
            or alarm_source == "fence"
            or alarm_doc.get("fence_id") not in [None, "", 0, "0"]
            or "围栏" in alarm_type
            or "电子围栏" in description
        )

    def _is_offline_alarm_doc(self, alarm_doc: dict | None) -> bool:
        if not alarm_doc:
            return False
        alarm_type = str(alarm_doc.get("alarm_type") or alarm_doc.get("type") or "").lower()
        description = str(alarm_doc.get("description") or alarm_doc.get("alarm_content") or "")
        return (
            "offline" in alarm_type
            or "VIDEO_DEVICE_OFFLINE".lower() in alarm_type
            or "离线" in description
            or "摄像头离线" in description
            or "设备离线" in description
            or "离线" in description
        )

    def _coerce_alarm_time(self, value):
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                return None
        return None

    def apply_alarm_policies(self):
        collection = self._alarm_collection()
        now = datetime.utcnow()

        if get_alarm_auto_resolve_enabled():
            cutoff = now - timedelta(seconds=30)
            collection.update_many(
                {
                    "status": {"$in": ["pending", "active", None]},
                    "$or": [
                        {"timestamp": {"$lte": cutoff}},
                        {"created_at": {"$lte": cutoff}},
                    ],
                },
                {
                    "$set": {
                        "status": "resolved",
                        "handled_at": now,
                        "handler": "system",
                        "remark": "系统设置自动处理",
                    }
                },
            )

        retention_cutoff = now - timedelta(days=get_alarm_retention_days())
        collection.delete_many(
            {
                "$or": [
                    {"timestamp": {"$lt": retention_cutoff}},
                    {"created_at": {"$lt": retention_cutoff}},
                ]
            }
        )

    def _safe_int(self, value):
        if value in [None, "", "null", "None"]:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _get_video_device_by_id(self, device_id: int | str):
        video_id = self._safe_int(device_id)
        if video_id is None:
            return None

        from app.services.video_service import VideoService

        video_service = VideoService()
        try:
            return video_service._get_video_runtime_by_id(video_id)
        except Exception:
            return None
    
    def _alarm_collection(self):
        return get_mongo_collection("alarm_record", same_db_as="fence")

    def _fence_alarm_query(self) -> dict:
        return {
            "$or": [
                {"source_type": "fence"},
                {"alarm_source": "fence"},
                {"fence_id": {"$nin": [None, "", 0, "0"]}},
                {"alarm_type": {"$regex": "围栏|电子围栏"}},
                {"description": {"$regex": "围栏|电子围栏"}},
            ]
        }

    def _fence_collection(self):
        return get_mongo_collection("fence")

    def _project_device_collection(self):
        for name in ["project_device", "project_devices"]:
            db = get_compatible_mongo_db(name)
            try:
                if name in db.list_collection_names():
                    return db[name]
            except Exception:
                continue
        return None

    def _text(self, value) -> str:
        return str(value or "").strip()

    def _first_value(self, *values):
        for value in values:
            if value not in [None, "", 0, "0"]:
                return value
        return None

    def _find_one_cached(self, cache_prefix: str, collection_name: str, query: dict):
        cache_key = f"{cache_prefix}:{collection_name}:{query}"
        if cache_key in self._org_cache:
            return self._org_cache[cache_key]
        doc = get_mongo_collection(collection_name).find_one(query, {"_id": 0})
        self._org_cache[cache_key] = doc or {}
        return doc or {}

    def _find_project_doc(self, project_id=None, project_name=None) -> dict:
        clauses = []
        safe_id = self._safe_int(project_id)
        if safe_id is not None:
            clauses.extend([{"id": safe_id}, {"project_id": safe_id}, {"id": str(safe_id)}, {"project_id": str(safe_id)}])
        if self._text(project_name):
            clauses.extend([{"name": self._text(project_name)}, {"project": self._text(project_name)}, {"project_name": self._text(project_name)}])
        if not clauses:
            return {}
        query = {"$or": clauses}
        for collection_name in ("project", "projects", "sql_projects"):
            doc = self._find_one_cached("project", collection_name, query)
            if doc:
                return doc
        return {}

    def _find_branch_doc(self, branch_id=None, branch_name=None) -> dict:
        clauses = []
        safe_id = self._safe_int(branch_id)
        if safe_id is not None:
            clauses.extend([{"id": safe_id}, {"branch_id": safe_id}, {"id": str(safe_id)}, {"branch_id": str(safe_id)}])
        raw_branch_id = self._text(branch_id)
        if raw_branch_id.upper().startswith("BRANCH-"):
            suffix = raw_branch_id.split("-", 1)[1]
            safe_suffix = self._safe_int(suffix)
            if safe_suffix is not None:
                clauses.extend([{"id": safe_suffix}, {"branch_id": safe_suffix}, {"id": suffix}, {"branch_id": suffix}])
        if self._text(branch_name):
            clauses.extend([{"name": self._text(branch_name)}, {"company": self._text(branch_name)}, {"department": self._text(branch_name)}])
        if not clauses:
            return {}
        query = {"$or": clauses}
        for collection_name in ("branch", "branches", "sql_branches"):
            doc = self._find_one_cached("branch", collection_name, query)
            if doc:
                return doc
        return {}

    def _find_grid_doc(self, grid_id=None, grid_name=None) -> dict:
        clauses = []
        if self._text(grid_id):
            clauses.extend([{"grid_id": self._text(grid_id)}, {"unit_id": self._text(grid_id)}, {"id": self._text(grid_id)}])
        if self._text(grid_name):
            clauses.extend([{"name": self._text(grid_name)}, {"grid": self._text(grid_name)}, {"grid_name": self._text(grid_name)}])
        if not clauses:
            return {}
        query = {"$or": clauses}
        for collection_name in ("grid", "responsibility_unit"):
            doc = self._find_one_cached("grid", collection_name, query)
            if doc:
                return doc
        return {}

    def _find_team_doc(self, team_id=None, team_name=None) -> dict:
        clauses = []
        if self._text(team_id):
            clauses.extend([{"team_id": self._text(team_id)}, {"unit_id": self._text(team_id)}, {"id": self._text(team_id)}])
        if self._text(team_name):
            clauses.extend([{"name": self._text(team_name)}, {"team": self._text(team_name)}, {"workTeam": self._text(team_name)}, {"work_team": self._text(team_name)}])
        if not clauses:
            return {}
        query = {"$or": clauses}
        for collection_name in ("team", "teams", "sql_teams", "responsibility_unit"):
            doc = self._find_one_cached("team", collection_name, query)
            if doc:
                return doc
        return {}

    def _find_person_doc(self, person_id=None, person_name=None) -> dict:
        clauses = []
        if self._text(person_id):
            pid = self._text(person_id)
            clauses.extend([
                {"id": pid},
                {"personnel_id": pid},
                {"employee_id": pid},
                {"employeeId": pid},
                {"phone": pid},
                {"mobile": pid},
            ])
            try:
                clauses.append({"_id": ObjectId(pid)})
            except (InvalidId, TypeError):
                pass
        if self._text(person_name):
            name = self._text(person_name)
            clauses.extend([{"username": name}, {"name": name}, {"full_name": name}])
        if not clauses:
            return {}
        cache_key = f"person:personnel:{clauses}"
        if cache_key in self._org_cache:
            return self._org_cache[cache_key]
        docs = list(get_mongo_collection("personnel").find({"$or": clauses}))
        if not docs:
            self._org_cache[cache_key] = {}
            return {}

        def org_score(doc: dict) -> int:
            fields = (
                "branch_id", "branchId", "department_id", "company", "dept", "department",
                "project_id", "projectId", "project",
                "grid_id", "gridId", "grid", "gridName", "responsibilityUnitId",
                "team_id", "teamId", "team", "workTeam", "work_team",
            )
            return sum(1 for field in fields if doc.get(field) not in [None, "", [], {}, 0, "0"])

        doc = max(docs, key=org_score)
        doc = {**doc, "_id": str(doc.get("_id"))} if doc.get("_id") is not None else doc
        self._org_cache[cache_key] = doc
        return doc

    def _person_org_context(self, person: dict) -> dict:
        person = person or {}
        return {
            "branch_id": self._first_value(person.get("branch_id"), person.get("branchId"), person.get("department_id")),
            "branch_name": self._first_value(person.get("branch_name"), person.get("company"), person.get("dept"), person.get("department")),
            "project_id": self._first_value(person.get("project_id"), person.get("projectId")),
            "project_name": self._first_value(person.get("project_name"), person.get("project")),
            "grid_id": self._first_value(person.get("grid_id"), person.get("gridId"), person.get("responsibilityUnitId"), person.get("responsibility_unit_id")),
            "grid_name": self._first_value(person.get("grid_name"), person.get("grid"), person.get("gridName")),
            "team_id": self._first_value(person.get("team_id"), person.get("teamId")),
            "team_name": self._first_value(person.get("team_name"), person.get("team"), person.get("workTeam"), person.get("work_team")),
        }

    def _is_video_person_alarm(self, doc: dict, person: dict) -> bool:
        if not person:
            return False
        if (doc.get("source_type") or doc.get("alarm_source")) == "fence" or doc.get("fence_id") not in [None, "", 0, "0"]:
            return False
        raw_person = doc.get("person") if isinstance(doc.get("person"), dict) else {}
        if raw_person.get("isMock") or raw_person.get("is_mock"):
            return False
        source = str(doc.get("source_type") or doc.get("alarm_source") or "").lower()
        if source in {"video", "ai", "camera"}:
            return True
        if doc.get("behavior_code") or doc.get("alarm_image_path") or doc.get("recording_status") == "pending":
            return True
        return False

    def _find_device_doc(self, device_id=None, device_name=None) -> dict:
        clauses = []
        if self._text(device_id):
            did = self._text(device_id)
            clauses.extend([
                {"id": did},
                {"device_id": did},
                {"device_code": did},
                {"device_serial": did},
                {"serial_number": did},
            ])
            safe_id = self._safe_int(did)
            if safe_id is not None:
                clauses.extend([
                    {"id": safe_id},
                    {"device_id": safe_id},
                    {"device_code": safe_id},
                    {"device_serial": safe_id},
                    {"serial_number": safe_id},
                ])
        if self._text(device_name):
            name = self._text(device_name)
            clauses.extend([
                {"name": name},
                {"device_name": name},
                {"video_name": name},
                {"trigger_device_name": name},
            ])
        if not clauses:
            return {}
        query = {"$or": clauses}
        for collection_name in ("video_device", "device", "fence_device", "sql_devices"):
            doc = self._find_one_cached("device", collection_name, query)
            if doc:
                return doc
        return {}

    def _org_context_for_alarm(self, doc: dict) -> dict:
        fence = self._find_fence_doc_by_id(doc.get("fence_id")) if doc.get("fence_id") not in [None, "", 0, "0"] else {}
        fence = fence or {}
        device = self._find_device_doc(
            doc.get("device_id") or doc.get("trigger_device_id"),
            doc.get("device_name") or doc.get("trigger_device_name") or doc.get("video_name"),
        ) or {}

        raw_person = doc.get("person") if isinstance(doc.get("person"), dict) else {}
        person_id = self._first_value(
            doc.get("personnel_id"),
            doc.get("person_id"),
            doc.get("trigger_person_id"),
            doc.get("employee_id"),
            raw_person.get("id"),
            raw_person.get("personnel_id"),
        )
        person_name = self._first_value(
            doc.get("trigger_person_name"),
            doc.get("person_name"),
            doc.get("captured_person_name"),
            doc.get("bound_person_name"),
            raw_person.get("username"),
            raw_person.get("name"),
            raw_person.get("full_name"),
        )
        person = self._find_person_doc(person_id, person_name)
        use_person_org = self._is_video_person_alarm(doc, person)
        person_org = self._person_org_context(person) if use_person_org else {}

        project_id = self._first_value(person_org.get("project_id"), doc.get("project_id"), fence.get("project_id"), device.get("project_id"))
        project_name = self._first_value(
            person_org.get("project_name"),
            doc.get("project_name"),
            doc.get("project"),
            fence.get("project_name"),
            fence.get("project"),
            device.get("project_name"),
            device.get("project"),
        )
        project = self._find_project_doc(project_id, project_name)
        project_id = self._first_value(project_id, project.get("id"), project.get("project_id"))
        project_name = self._first_value(project_name, project.get("name"), project.get("project_name"), project.get("project"))

        branch_id = self._first_value(person_org.get("branch_id"), doc.get("branch_id"), fence.get("branch_id"), device.get("branch_id"), project.get("branch_id"))
        branch_name = self._first_value(
            person_org.get("branch_name"),
            doc.get("branch_name"),
            doc.get("company"),
            doc.get("department"),
            fence.get("branch_name"),
            fence.get("company"),
            device.get("branch_name"),
            device.get("company"),
            device.get("department"),
        )
        branch = self._find_branch_doc(branch_id, branch_name)
        branch_id = self._first_value(branch_id, branch.get("id"), branch.get("branch_id"))
        branch_name = self._first_value(branch_name, branch.get("name"), branch.get("company"), branch.get("department"))

        grid_id = self._first_value(person_org.get("grid_id"), doc.get("grid_id"), fence.get("grid_id"), device.get("grid_id"))
        grid_name = self._first_value(person_org.get("grid_name"), doc.get("grid_name"), doc.get("grid"), fence.get("grid_name"), fence.get("grid"), device.get("grid_name"), device.get("grid"))
        grid = self._find_grid_doc(grid_id, grid_name)
        grid_id = self._first_value(grid_id, grid.get("grid_id"), grid.get("unit_id"))
        grid_name = self._first_value(grid_name, grid.get("name"), grid.get("grid_name"), grid.get("grid"))

        team_id = self._first_value(person_org.get("team_id"), doc.get("team_id"), fence.get("team_id"), device.get("team_id"))
        team_name = self._first_value(
            person_org.get("team_name"),
            doc.get("team_name"),
            doc.get("team"),
            doc.get("workTeam"),
            doc.get("work_team"),
            fence.get("team_name"),
            fence.get("team"),
            device.get("team_name"),
            device.get("team"),
            device.get("workTeam"),
            device.get("work_team"),
        )
        team = self._find_team_doc(team_id, team_name)
        team_id = self._first_value(team_id, team.get("team_id"), team.get("unit_id"), team.get("id"))
        team_name = self._first_value(team_name, team.get("name"), team.get("team_name"), team.get("team"))

        person_id = self._first_value(person_id, person.get("personnel_id"), person.get("id"), person.get("employee_id"))
        person_name = self._first_value(person_name, person.get("username"), person.get("name"), person.get("full_name"))

        return {
            "person_org_context_used": use_person_org,
            "person_branch_id": branch_id if use_person_org else "",
            "person_branch_name": branch_name if use_person_org else "",
            "person_company": branch_name if use_person_org else "",
            "person_project_id": project_id if use_person_org else "",
            "person_project_name": project_name if use_person_org else "",
            "person_project": project_name if use_person_org else "",
            "person_grid_id": grid_id if use_person_org else "",
            "person_grid_name": grid_name if use_person_org else "",
            "person_grid": grid_name if use_person_org else "",
            "person_team_id": team_id if use_person_org else "",
            "person_team_name": team_name if use_person_org else "",
            "person_team": team_name if use_person_org else "",
            "branch_id": branch_id,
            "branch_name": branch_name,
            "company": branch_name,
            "project_id": project_id,
            "project_name": project_name,
            "project": project_name,
            "grid_id": grid_id,
            "grid_name": grid_name,
            "grid": grid_name,
            "team_id": team_id,
            "team_name": team_name,
            "team": team_name,
            "trigger_person_id": person_id,
            "trigger_person_name": person_name,
            "trigger_device_id": self._first_value(device.get("id"), device.get("device_id"), doc.get("device_id")),
            "trigger_device_name": self._first_value(device.get("name"), device.get("device_name"), device.get("video_name"), doc.get("device_name"), doc.get("trigger_device_name")),
            "location": self._first_value(doc.get("location"), device.get("install_location"), device.get("location"), device.get("remark")),
            "location_desc": self._first_value(
                doc.get("location_desc"),
                device.get("location_desc"),
                device.get("install_location"),
                device.get("location"),
                device.get("remark"),
            ),
        }

    def _apply_org_snapshot_to_payload(self, payload: dict) -> dict:
        if not payload:
            return payload

        org_context = self._org_context_for_alarm(payload)
        prefer_person_org = bool(org_context.get("person_org_context_used"))
        org_fields = {
            "branch_id",
            "branch_name",
            "company",
            "project_id",
            "project_name",
            "project",
            "grid_id",
            "grid_name",
            "grid",
            "team_id",
            "team_name",
            "team",
        }
        for field in (
            "branch_id",
            "branch_name",
            "company",
            "project_id",
            "project_name",
            "project",
            "grid_id",
            "grid_name",
            "grid",
            "team_id",
            "team_name",
            "team",
            "trigger_person_id",
            "trigger_person_name",
            "trigger_device_id",
            "trigger_device_name",
            "location",
            "location_desc",
        ):
            should_replace = (
                prefer_person_org
                and field in org_fields
                and org_context.get(field) not in [None, "", 0, "0"]
            )
            if should_replace or (payload.get(field) in [None, "", 0, "0"] and org_context.get(field) not in [None, "", 0, "0"]):
                payload[field] = org_context[field]

        if prefer_person_org:
            for field in (
                "person_branch_id",
                "person_branch_name",
                "person_company",
                "person_project_id",
                "person_project_name",
                "person_project",
                "person_grid_id",
                "person_grid_name",
                "person_grid",
                "person_team_id",
                "person_team_name",
                "person_team",
            ):
                if org_context.get(field) not in [None, "", 0, "0"]:
                    payload[field] = org_context[field]

        resolved_project_id = self._safe_int(org_context.get("project_id") or payload.get("project_id"))
        if resolved_project_id is not None:
            payload["project_id"] = resolved_project_id

        if payload.get("person_name") in [None, ""] and org_context.get("trigger_person_name"):
            payload["person_name"] = org_context["trigger_person_name"]
        if payload.get("personnel_id") in [None, ""] and org_context.get("trigger_person_id"):
            payload["personnel_id"] = org_context["trigger_person_id"]
        return payload

    def _find_fence_doc_by_id(self, fence_id: int | str):
        collection = self._fence_collection()
        if collection is None or fence_id is None:
            return None

        cache_key = str(fence_id)
        if cache_key in self._fence_doc_cache:
            return self._fence_doc_cache[cache_key]

        candidates = []
        safe_id = self._safe_int(fence_id)
        if safe_id is not None:
            candidates.append({"id": safe_id})
            candidates.append({"fence_id": safe_id})
        candidates.append({"id": str(fence_id)})
        candidates.append({"fence_id": str(fence_id)})

        fence = collection.find_one({"$or": candidates})
        self._fence_doc_cache[cache_key] = fence
        return fence

    def _alarm_doc_with_fence_scope(self, alarm_doc: dict | None) -> dict:
        if not alarm_doc:
            return {}
        scoped_doc = dict(alarm_doc)
        if not self._is_fence_alarm_doc(scoped_doc):
            return scoped_doc

        fence = self._find_fence_doc_by_id(scoped_doc.get("fence_id"))
        if not fence:
            return scoped_doc

        for field in ("project_id", "grid_id", "team_id", "branch_id", "company", "project", "team", "workTeam", "work_team"):
            if scoped_doc.get(field) in [None, "", 0, "0"] and fence.get(field) not in [None, "", 0, "0"]:
                scoped_doc[field] = fence.get(field)
        if not scoped_doc.get("location") and fence.get("name"):
            scoped_doc["location"] = fence.get("name")
        return scoped_doc

    def _is_legacy_unscoped_fence_alarm(self, alarm_doc: dict | None) -> bool:
        if not alarm_doc:
            return False
        if not self._is_fence_alarm_doc(alarm_doc):
            return False
        return not any(alarm_doc.get(field) not in [None, "", 0, "0"] for field in ("project_id", "grid_id", "team_id", "branch_id", "company", "project"))

    def _infer_project_id_from_device(self, device_id: int | str):
        collection = self._project_device_collection()
        if collection is None:
            return None

        candidates = [{"device_id": int(device_id)}]
        candidates.append({"device_id": str(device_id)})

        row = collection.find_one({"$or": candidates})
        if not row:
            return None

        return self._safe_int(row.get("project_id"))

    def _apply_fence_business_fields(self, alarm):
        """
        保留真实围栏业务语义：
        1. fence_id 存在时尝试查围栏
        2. 生成 description
        3. 生成/修正 location
        4. 若未传 project_id，尝试从设备关联推断
        """
        if alarm.fence_id == 0:
            alarm.fence_id = None
        if alarm.project_id == 0:
            alarm.project_id = None

        if alarm.fence_id is not None:
            fence = self._find_fence_doc_by_id(alarm.fence_id)
            if fence:
                behavior = str(fence.get("behavior") or "").strip()
                behavior_text = "禁入" if behavior == "No Entry" else "禁出"
                fence_name = fence.get("name") or f"Fence-{alarm.fence_id}"

                if not alarm.description:
                    alarm.description = f"[电子围栏-{behavior_text}] {fence_name} 触发报警"

                if alarm.location and "," in str(alarm.location):
                    alarm.location = f"{fence_name} ({alarm.location})"
                elif not alarm.location:
                    alarm.location = fence_name

                if alarm.project_id is None:
                    fence_project_id = fence.get("project_id")
                    if fence_project_id not in [None, "", 0, "0"]:
                        alarm.project_id = fence_project_id

        if alarm.project_id is None:
            inferred_project_id = self._infer_project_id_from_device(alarm.device_id)
            if inferred_project_id not in [None, "", 0, "0"]:
                alarm.project_id = inferred_project_id

        return alarm

    def _mongo_alarm_to_out(self, doc: dict) -> dict:
        if not doc:
            return {}

        doc = dict(doc)
        doc.pop("_id", None)
        source_type = "fence" if self._is_fence_alarm_doc(doc) else (doc.get("source_type") or "video")

        raw_alarm_type = doc.get("alarm_type") or doc.get("behavior_code") or doc.get("event_type") or "Alarm"
        alarm_type = VIDEO_BEHAVIOR_LABELS.get(str(raw_alarm_type), raw_alarm_type)
        device_id = doc.get("device_id") or doc.get("trigger_device_id")
        device_name = doc.get("device_name") or doc.get("trigger_device_name") or doc.get("video_name") or ""
        timestamp = doc.get("timestamp") or doc.get("alarm_time") or doc.get("created_at")
        location = doc.get("location") or doc.get("location_desc")
        image_path = doc.get("alarm_image_path") or doc.get("image_url") or doc.get("snapshot_url") or doc.get("picture_url") or doc.get("image_path") or doc.get("snapshot_path") or ""
        video_path = doc.get("recording_path") or doc.get("video_clip_url") or doc.get("video_url") or doc.get("clip_url") or doc.get("video_path") or ""
        recording_error = doc.get("recording_error") or doc.get("error_message") or ""
        duration = doc.get("duration_seconds") or doc.get("duration") or doc.get("video_duration") or doc.get("clip_duration")
        alarm_second = doc.get("alarm_second")
        if alarm_second is None:
            alarm_second = doc.get("alarmSecond")
        alarm_type = doc.get("alarm_type") or doc.get("event_type") or doc.get("type") or doc.get("rule_name") or doc.get("algo_name") or "未知报警类型"
        person = doc.get("person") or {}
        person_name = doc.get("person_name") or doc.get("captured_person_name") or doc.get("bound_person_name") or person.get("username") or person.get("name") or ""
        person_label = doc.get("person_label") or doc.get("captured_person_label") or ""
        device_id = str(doc.get("device_id")) if doc.get("device_id") is not None else ""
        description = doc.get("description") or doc.get("message") or doc.get("msg") or doc.get("behavior") or ""
        if not description:
            description = " - ".join([part for part in [person_name, person_label, alarm_type] if part])
        org_context = self._org_context_for_alarm(doc)
        if not device_name:
            device = self._find_device_doc(device_id)
            device_name = device.get("name") or device.get("device_name") or device.get("video_name") or ""

        return {
            "id": self._safe_int(doc.get("id")) or doc.get("id"),
            "device_id": str(device_id) if device_id is not None else "",
            "fence_id": self._safe_int(doc.get("fence_id")),
            "project_id": self._safe_int(org_context.get("project_id") or doc.get("project_id")),
            "branch_id": org_context.get("branch_id"),
            "branch_name": org_context.get("branch_name"),
            "company": org_context.get("company"),
            "project_name": org_context.get("project_name"),
            "project": org_context.get("project"),
            "grid_id": org_context.get("grid_id"),
            "grid_name": org_context.get("grid_name"),
            "grid": org_context.get("grid"),
            "team_id": org_context.get("team_id"),
            "team_name": org_context.get("team_name"),
            "team": org_context.get("team"),
            "trigger_person_id": org_context.get("trigger_person_id"),
            "trigger_person_name": org_context.get("trigger_person_name"),
            "alarm_type": alarm_type,
            "severity": doc.get("severity") or "low",
            "timestamp": timestamp,
            "description": description,
            "status": doc.get("status") or "pending",
            "handled_at": doc.get("handled_at") or doc.get("resolved_at"),
            "location": location,
            "recording_path": video_path,
            "recording_status": doc.get("recording_status") or "pending",
            "recording_error": recording_error,
            "alarm_image_path": image_path,
            "alarm_boxes": doc.get("alarm_boxes") or (doc.get("details") or {}).get("alarm_boxes") or (doc.get("details") or {}).get("boxes") or [],
            "personnel_id": doc.get("personnel_id") or doc.get("bound_person_phone") or "",
            "person_name": person_name or "未知",
            "person_label": person_label,
            "person": person,
            "device_name": device_name,
            "source_type": source_type,
            "image_url": image_path,
            "snapshot_url": image_path,
            "picture_url": image_path,
            "video_url": video_path,
            "clip_url": video_path,
            "duration": duration,
            "duration_seconds": duration,
            "alarm_second": alarm_second,
            "recording_start_time": doc.get("recording_start_time") or doc.get("start_time"),
            "recording_end_time": doc.get("recording_end_time") or doc.get("end_time"),
            "recording_time_offset_seconds": doc.get("recording_time_offset_seconds"),
            "record_anchor_time": doc.get("record_anchor_time"),
            "box_rendered": doc.get("box_rendered"),
            "box_start_second": doc.get("box_start_second"),
            "box_end_second": doc.get("box_end_second"),
            "video_duration": duration,
            "clip_duration": duration,
            "start_time": doc.get("recording_start_time") or doc.get("start_time"),
            "end_time": doc.get("recording_end_time") or doc.get("end_time"),
            "error_message": recording_error,
        }

    def _alarm_sort_time(self, doc: dict):
        value = doc.get("timestamp") or doc.get("alarm_time") or doc.get("created_at")
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return datetime.min
        return datetime.min

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

    def _in_user_scope(self, alarm_doc: dict | None, current_user: dict | None, scope_query: dict | None = None) -> bool:
        if current_user is None:
            return True
        if is_hq(current_user):
            return True
        scoped_doc = self._alarm_doc_with_fence_scope(alarm_doc)
        if scope_query is None:
            return in_scope(scoped_doc, current_user, **self._scope_kwargs()) or self._is_legacy_unscoped_fence_alarm(scoped_doc)
        if not scope_query:
            return True
        if scope_query == {"_id": {"$exists": False}}:
            return self._is_legacy_unscoped_fence_alarm(scoped_doc)
        return matches_query(scoped_doc, scope_query) or self._is_legacy_unscoped_fence_alarm(scoped_doc)

    def _find_alarm_doc_by_id(self, alarm_id: int | str):
        return self._alarm_collection().find_one({"id": int(alarm_id)})

    def _update_alarm_fields(self, alarm_id: int | str, updates: dict):
        clean_updates = {k: v for k, v in (updates or {}).items() if k != "_id"}
        if not clean_updates:
            return
        self._alarm_collection().update_one(
            {"id": int(alarm_id)},
            {"$set": clean_updates}
        )

    def _notify_alarm_created(self, alarm_doc: dict):
        """
        低风险保留上游 notification_service 功能。

        注意：
        1. 报警主链仍然以 MongoDB 写入为准；
        2. 通知失败不能影响报警保存；
        3. 这里不依赖 SQL 的 new_alarm 对象，只传 MongoDB alarm dict。
        """
        try:
            alarm_data = self._mongo_alarm_to_out(alarm_doc)
            settings = get_system_settings()
            severity = str(alarm_data.get("severity") or "").lower()
            is_severe = severity in {"high", "severe", "critical"}
            upgrade = str(settings.get("alarmSevereUpgrade") or "sound")
            recipients = settings.get("notificationRecipients", [])

            if is_severe and upgrade in {"sms", "call"}:
                enabled_key = "notifySevereBySms" if upgrade == "sms" else "notifySevereByCall"
                if settings.get(enabled_key, True):
                    logger.info(f"Severe alarm escalation requested via {upgrade}: {alarm_data.get('id')}")
                    result = notification_service.send_alarm_notification(alarm_data, recipients)
                    if asyncio.iscoroutine(result):
                        try:
                            loop = asyncio.get_running_loop()
                            loop.create_task(result)
                        except RuntimeError:
                            asyncio.run(result)

            # 优先兼容 upstream/main 里的 handle_alarm 通知方式
            handle_alarm = getattr(notification_service, "handle_alarm", None)
            if callable(handle_alarm):
                import json
                import os

                config_path = "data/system_config.json"
                recipients = []

                if os.path.exists(config_path):
                    with open(config_path, "r", encoding="utf-8") as f:
                        config = json.load(f)
                        recipients = config.get("notificationRecipients", [])

                if recipients:
                    alarm_level = alarm_data.get("severity") or "medium"
                    if alarm_level == "normal":
                        alarm_level = "low"
                    elif alarm_level == "high":
                        alarm_level = "severe"

                    result = handle_alarm(
                        alarm_level=alarm_level,
                        alarm_type=alarm_data.get("alarm_type"),
                        alarm_message=alarm_data.get("description") or "安全告警触发",
                        recipients=recipients,
                    )

                    if asyncio.iscoroutine(result):
                        try:
                            loop = asyncio.get_running_loop()
                            loop.create_task(result)
                        except RuntimeError:
                            asyncio.run(result)

                return

            # 兼容其他可能的方法名
            notify_func = None
            for method_name in [
                "create_alarm_notification",
                "send_alarm_notification",
                "notify_alarm",
                "create_notification",
            ]:
                func = getattr(notification_service, method_name, None)
                if callable(func):
                    notify_func = func
                    break

            if notify_func is None:
                logger.warning("notification_service has no compatible alarm notification method, skipped.")
                return

            result = notify_func(alarm_data)

            if asyncio.iscoroutine(result):
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(result)
                except RuntimeError:
                    asyncio.run(result)

        except Exception as e:
            logger.warning(f"Alarm notification failed, ignored: {str(e)}")
    
    def create_alarm(self, db: Session | AlarmCreate | None = None, alarm: AlarmCreate | None = None):
        if alarm is None and isinstance(db, AlarmCreate):
            alarm = db
            db = None

        if alarm is None:
            raise HTTPException(status_code=400, detail="Alarm payload is required")

        logger.warning(f"ALARM TRIGGERED: Device {alarm.device_id}, Type {alarm.alarm_type}")

        # 1. 重复报警抑制 (1秒内完全相同的设备+类型+围栏报警视为重复)
        duplicate_window_seconds = 5
        one_second_ago = datetime.utcnow() - timedelta(seconds=duplicate_window_seconds)
        exists = self._alarm_collection().find_one({
            "device_id": str(alarm.device_id),
            "alarm_type": alarm.alarm_type,
            "fence_id": self._safe_int(alarm.fence_id),
            "timestamp": {"$gte": one_second_ago},
        })
        if exists:
            logger.info("Duplicate alarm suppressed")
            return self._mongo_alarm_to_out(exists)
        
        device = self._get_video_device_by_id(alarm.device_id)
        if not device:
            raise HTTPException(status_code=400, detail=f"Device not found: {alarm.device_id}")

        # 保留围栏/定位/项目真实业务语义，但不再依赖旧 SQL ORM
        alarm = self._apply_fence_business_fields(alarm)
        project_id = self._safe_int(alarm.project_id)

        next_id = int(get_next_sequence("alarm_record_id"))
        payload = {
            "id": next_id,
            "device_id": str(alarm.device_id),
            "fence_id": self._safe_int(alarm.fence_id),
            "project_id": project_id,
            "alarm_type": alarm.alarm_type,
            "severity": alarm.severity,
            "timestamp": datetime.utcnow(),
            "description": alarm.description,
            "status": alarm.status,
            "handled_at": None,
            "location": alarm.location,
            "recording_path": "",
            "recording_status": "pending",
            "recording_error": "",
            "alarm_image_path": "",
        }
        payload = self._apply_org_snapshot_to_payload(payload)
        try:
            self._alarm_collection().insert_one(payload)
            saved = self._find_alarm_doc_by_id(next_id)

            logger.warning(f"SUCCESSFULLY SAVED ALARM: ID {next_id}")

            # 低风险保留上游通知功能：
            # 通知失败只记录 warning，不影响 MongoDB 报警保存和前端显示。
            self._notify_alarm_created(saved or payload)

            return self._mongo_alarm_to_out(saved or payload)

        except Exception as e:
            logger.error(f"DATABASE SAVE ERROR: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database save error: {str(e)}")
        
    def get_alarms(
        self,
        db: Session,
        skip: int = 0,
        limit: int = 100,
        project_id: int | None = None,
        source_type: str | None = None,
        current_user: dict | None = None,
    ):
        query = {}
        if project_id is not None:
            query["project_id"] = project_id
        query = merge_filters(query, {"$nor": [
            {"alarm_type": {"$regex": "offline", "$options": "i"}},
            {"type": {"$regex": "offline", "$options": "i"}},
            {"description": {"$regex": "离线"}},
            {"alarm_content": {"$regex": "离线"}},
        ]})

        video_alarm_query = {"$or": [
                {"source_type": "video"},
                {"alarm_type": {"$regex": "^VIDEO_"}},
                {"recording_path": {"$nin": [None, ""]}},
                {"alarm_image_path": {"$nin": [None, ""]}},
                {"alarm_boxes": {"$nin": [None, "", []]}},
                {"device_id": {"$nin": [None, ""]}},
            ]}
        if source_type == "video":
            query = merge_filters(query, {"$and": [video_alarm_query, {"$nor": [self._fence_alarm_query()]}]})
        elif source_type == "fence":
            query = merge_filters(query, self._fence_alarm_query())
        include_legacy_fence_alarms = current_user is not None and source_type is None and project_id is None
        use_post_scope_filter = source_type == "fence"
        user_scope_query = None
        if current_user is not None and not is_hq(current_user):
            user_scope_query = scope_filter(current_user, **self._scope_kwargs())
        if current_user is not None and not use_post_scope_filter:
            query = merge_filters(query, user_scope_query or {})

        # Listing must stay read-only and fast. Running auto-resolve/retention here can
        # make the alarm page time out when historical fence alarms are present.
        docs = list(self._alarm_collection().find(query))
        if include_legacy_fence_alarms:
            existing_ids = {str(doc.get("id")) for doc in docs}
            fence_docs = list(self._alarm_collection().find({"source_type": "fence"}))
            docs.extend(
                doc for doc in fence_docs
                if str(doc.get("id")) not in existing_ids and self._in_user_scope(doc, current_user, user_scope_query)
            )
        if current_user is not None and use_post_scope_filter:
            docs = [doc for doc in docs if self._in_user_scope(doc, current_user, user_scope_query)]
        docs = [doc for doc in docs if not self._is_offline_alarm_doc(doc)]
        docs.sort(key=self._alarm_sort_time, reverse=True)
        docs = docs[max(0, int(skip)): max(0, int(skip)) + max(1, int(limit))]
        return [self._mongo_alarm_to_out(doc) for doc in docs]

    def get_pending_fence_device_status(self, current_user: dict | None = None) -> dict:
        query = merge_filters(
            self._fence_alarm_query(),
            {"status": {"$nin": ["resolved", "ignored"]}},
        )
        projection = {
            "_id": 0,
            "device_id": 1,
            "device_code": 1,
            "device_serial": 1,
            "phone_num": 1,
            "fence_id": 1,
            "alarm_type": 1,
            "status": 1,
            "project_id": 1,
            "grid_id": 1,
            "team_id": 1,
            "branch_id": 1,
            "company": 1,
            "project": 1,
            "team": 1,
            "workTeam": 1,
            "work_team": 1,
        }
        docs = list(self._alarm_collection().find(query, projection).limit(1000))
        if current_user is not None and not is_hq(current_user):
            user_scope_query = scope_filter(current_user, **self._scope_kwargs())
            docs = [doc for doc in docs if self._in_user_scope(doc, current_user, user_scope_query)]

        result: dict[str, str] = {}
        for doc in docs:
            keys = [
                doc.get("device_id"),
                doc.get("device_code"),
                doc.get("device_serial"),
                doc.get("phone_num"),
            ]
            alarm_type = str(doc.get("alarm_type") or "")
            violation_type = "No Exit" if "exit" in alarm_type.lower() or "离开" in alarm_type else "No Entry"
            for key in keys:
                value = str(key or "").strip()
                if value:
                    result[value] = violation_type
        return result

    def get_alarm_stats(self, current_user: dict | None = None) -> dict:
        docs = list(self._alarm_collection().find({}))
        if current_user is not None and not is_hq(current_user):
            user_scope_query = scope_filter(current_user, **self._scope_kwargs())
            docs = [doc for doc in docs if self._in_user_scope(doc, current_user, user_scope_query)]
        docs = [doc for doc in docs if not self._is_offline_alarm_doc(doc)]

        total = len(docs)
        fence = sum(1 for doc in docs if self._is_fence_alarm_doc(doc))
        pending = sum(1 for doc in docs if doc.get("status") in ["pending", "active", None])
        return {
            "total": total,
            "pending": pending,
            "fence": fence,
            "video": max(0, total - fence),
        }

    def update_alarm(self, db: Session, alarm_id: int, update_data: AlarmUpdate, current_user: dict | None = None):
        db_alarm = self._find_alarm_doc_by_id(alarm_id)
        if not db_alarm:
            return None
        if not self._in_user_scope(db_alarm, current_user):
            return None

        updates = {}

        if update_data.status:
            updates["status"] = update_data.status
            if update_data.status == "resolved":
                updates["handled_at"] = datetime.now()

        if update_data.description:
            updates["description"] = update_data.description

        if update_data.severity:
            updates["severity"] = update_data.severity

        if update_data.handler:
            updates["handler"] = update_data.handler

        if update_data.remark:
            updates["remark"] = update_data.remark

        self._update_alarm_fields(alarm_id, updates)
        updated = self._find_alarm_doc_by_id(alarm_id)
        
        # 写日志
        try:
            log_service = LogService()
            company = self._first_value(updated.get("company"), updated.get("branch_name"), updated.get("department"))
            project = self._first_value(updated.get("project"), updated.get("project_name"))
            grid = self._first_value(updated.get("grid"), updated.get("grid_name"))
            team = self._first_value(updated.get("team"), updated.get("team_name"), updated.get("workTeam"), updated.get("work_team"))
            log_create = LogCreate(
                operator=update_data.handler or "unknown",
                action="处理告警",
                target_type="alarm",
                target_name=updated.get("description", "未知告警"),
                details=update_data.remark,
                company=company,
                project=project,
                grid=grid,
                team=team,
                extra={
                    "alarm_id": alarm_id,
                    "status": update_data.status,
                    "alarm_type": updated.get("alarm_type"),
                    "description": updated.get("description"),
                    "device_id": updated.get("device_id"),
                    "device_name": updated.get("device_name") or updated.get("video_name"),
                    "company": company,
                    "branch_name": company,
                    "project": project,
                    "grid": grid,
                    "team": team,
                }
            )
            log_service.create_log(db, log_create)
        except Exception as e:
            logger.error(f"Failed to create log for alarm update: {str(e)}")
        
        return self._mongo_alarm_to_out(updated)

    def delete_alarm(self, db: Session, alarm_id: int, current_user: dict | None = None):
        db_alarm = self._find_alarm_doc_by_id(alarm_id)
        if db_alarm and self._in_user_scope(db_alarm, current_user):
            self._alarm_collection().delete_one({"id": int(alarm_id)})
            return True
        return False
