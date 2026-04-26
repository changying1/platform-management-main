from datetime import datetime
from bson import ObjectId
from app.core.database import get_personnel_collection
from app.schemas.personnel_schema import PersonnelCreate, PersonnelUpdate
from app.utils.logger import get_logger

logger = get_logger("PersonnelService")


def _to_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "username": doc.get("username", ""),
        "dept": doc.get("dept", ""),
        "phone": doc.get("phone", ""),
        "role": doc.get("role", "Worker"),
        "addedDate": doc.get("addedDate", ""),
        "parentId": doc.get("parentId"),
        "faceImage": doc.get("faceImage", ""),

        "employeeId": doc.get("employeeId", ""),
        "idCard": doc.get("idCard", ""),
        "company": doc.get("company", ""),
        "project": doc.get("project", ""),
        "workType": doc.get("workType", ""),
        "workTeam": doc.get("workTeam", ""),
        "team": doc.get("team", ""),
        "entryDate": doc.get("entryDate", ""),
        "status": doc.get("status", "active"),
        "emergencyContact": doc.get("emergencyContact", ""),
    }


class PersonnelService:
    def __init__(self):
        self.collection = get_personnel_collection()

    def list_personnel(self):
        docs = list(self.collection.find().sort("created_at", 1))
        return [_to_out(doc) for doc in docs]

    def create_personnel(self, data: PersonnelCreate):
        doc = data.dict()

        if doc.get("role") == "HQ Manager":
            doc["parentId"] = None

        doc["addedDate"] = datetime.now().strftime("%Y-%m-%d")
        doc["created_at"] = datetime.now()
        doc["updated_at"] = datetime.now()

        result = self.collection.insert_one(doc)
        new_doc = self.collection.find_one({"_id": result.inserted_id})
        logger.info(f"Created personnel: {doc.get('username')}")
        return _to_out(new_doc)

    def update_personnel(self, personnel_id: str, data: PersonnelUpdate):
        if not ObjectId.is_valid(personnel_id):
            return None

        update_data = {
            k: v for k, v in data.dict(exclude_unset=True).items()
            if v is not None
        }

        if not update_data:
            doc = self.collection.find_one({"_id": ObjectId(personnel_id)})
            return _to_out(doc) if doc else None

        if update_data.get("role") == "HQ Manager":
            update_data["parentId"] = None

        update_data["updated_at"] = datetime.now()

        self.collection.update_one(
            {"_id": ObjectId(personnel_id)},
            {"$set": update_data}
        )

        doc = self.collection.find_one({"_id": ObjectId(personnel_id)})
        return _to_out(doc) if doc else None

    def update_face_image(self, personnel_id: str, face_image_url: str):
        if not ObjectId.is_valid(personnel_id):
            return None

        self.collection.update_one(
            {"_id": ObjectId(personnel_id)},
            {
                "$set": {
                    "faceImage": face_image_url,
                    "updated_at": datetime.now(),
                }
            }
        )

        doc = self.collection.find_one({"_id": ObjectId(personnel_id)})
        return _to_out(doc) if doc else None

    def delete_personnel(self, personnel_id: str):
        if not ObjectId.is_valid(personnel_id):
            return False

        # 删除该人员，同时把直属下级的 parentId 清空，避免树结构断掉后仍引用不存在的人
        result = self.collection.delete_one({"_id": ObjectId(personnel_id)})
        if result.deleted_count:
            self.collection.update_many(
                {"parentId": personnel_id},
                {"$set": {"parentId": None, "updated_at": datetime.now()}}
            )
            return True

        return False