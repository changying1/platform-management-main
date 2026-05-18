from datetime import datetime
from bson import ObjectId
from app.core.database import get_mongo_collection
from app.schemas.responsibility_unit_schema import ResponsibilityUnitCreate, ResponsibilityUnitUpdate
from app.utils.logger import get_logger

logger = get_logger("ResponsibilityUnitService")

unit_collection = get_mongo_collection("responsibility_unit")


def _to_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "unit_id": doc.get("unit_id", ""),
        "name": doc.get("name", ""),
        "type": doc.get("type", ""),
        "parent_id": doc.get("parent_id"),
        "level": doc.get("level", 1),
        "is_under_construction": doc.get("is_under_construction", True),
        "sort_order": doc.get("sort_order", 0),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", ""),
    }


class ResponsibilityUnitService:
    def list_units(self, unit_type: str = None, parent_id: str = None):
        filter_query = {}
        if unit_type:
            filter_query["type"] = unit_type
        if parent_id is not None:
            filter_query["parent_id"] = parent_id if parent_id else None

        docs = list(unit_collection.find(filter_query).sort("sort_order", 1))
        return [_to_out(doc) for doc in docs]

    def get_unit_by_id(self, unit_id: str):
        doc = unit_collection.find_one({"unit_id": unit_id})
        if doc:
            return _to_out(doc)
        if ObjectId.is_valid(unit_id):
            doc = unit_collection.find_one({"_id": ObjectId(unit_id)})
            return _to_out(doc) if doc else None
        return None

    def create_unit(self, data: ResponsibilityUnitCreate):
        doc = data.model_dump()
        now = datetime.now().isoformat()
        doc["created_at"] = now
        doc["updated_at"] = now

        # 自动计算层级
        if doc.get("parent_id"):
            parent = unit_collection.find_one({"unit_id": doc["parent_id"]})
            if parent:
                doc["level"] = parent.get("level", 1) + 1
            else:
                doc["level"] = 1
                doc["parent_id"] = None
        else:
            doc["level"] = 1
            doc["parent_id"] = None

        # 自动计算排序号
        max_sort = unit_collection.find_one(
            {"parent_id": doc["parent_id"]},
            sort=[("sort_order", -1)]
        )
        doc["sort_order"] = (max_sort.get("sort_order", 0) + 1) if max_sort else 1

        result = unit_collection.insert_one(doc)
        new_doc = unit_collection.find_one({"_id": result.inserted_id})
        logger.info(f"Created responsibility unit: {doc.get('name')}")
        return _to_out(new_doc)

    def update_unit(self, unit_id: str, data: ResponsibilityUnitUpdate):
        doc = unit_collection.find_one({"unit_id": unit_id})
        if not doc and ObjectId.is_valid(unit_id):
            doc = unit_collection.find_one({"_id": ObjectId(unit_id)})
        if not doc:
            return None

        object_id = doc["_id"]
        update_data = {
            k: v for k, v in data.model_dump(exclude_unset=True).items()
            if v is not None
        }

        if not update_data:
            return _to_out(doc)

        # 如果变更了上级，重新计算层级
        if "parent_id" in update_data:
            new_parent_id = update_data["parent_id"]
            if new_parent_id:
                parent = unit_collection.find_one({"unit_id": new_parent_id})
                update_data["level"] = parent.get("level", 1) + 1 if parent else 1
            else:
                update_data["level"] = 1

            # 更新所有子节点的层级
            self._update_children_level(str(object_id), update_data["level"])

        update_data["updated_at"] = datetime.now().isoformat()

        unit_collection.update_one(
            {"_id": object_id},
            {"$set": update_data}
        )

        updated_doc = unit_collection.find_one({"_id": object_id})
        return _to_out(updated_doc)

    def _update_children_level(self, parent_object_id: str, parent_level: int):
        """递归更新子节点的层级"""
        children = unit_collection.find({"parent_id": parent_object_id})
        for child in children:
            new_level = parent_level + 1
            unit_collection.update_one(
                {"_id": child["_id"]},
                {"$set": {"level": new_level}}
            )
            self._update_children_level(str(child["_id"]), new_level)

    def delete_unit(self, unit_id: str):
        doc = unit_collection.find_one({"unit_id": unit_id})
        if not doc and ObjectId.is_valid(unit_id):
            doc = unit_collection.find_one({"_id": ObjectId(unit_id)})
        if not doc:
            return False

        object_id = doc["_id"]

        # 检查是否有子节点
        children_count = unit_collection.count_documents({"parent_id": doc.get("unit_id")})
        if children_count > 0:
            logger.warning(f"Cannot delete unit {unit_id}: has {children_count} children")
            return False

        result = unit_collection.delete_one({"_id": object_id})
        if result.deleted_count:
            logger.info(f"Deleted responsibility unit: {unit_id}")
            return True
        return False

    def move_up(self, unit_id: str):
        doc = unit_collection.find_one({"unit_id": unit_id})
        if not doc:
            return None

        current_sort = doc.get("sort_order", 0)
        parent_id = doc.get("parent_id")

        # 查找同父节点下排序更小的上一个节点
        prev_filter = {"parent_id": parent_id, "sort_order": {"$lt": current_sort}}
        prev_doc = unit_collection.find_one(prev_filter, sort=[("sort_order", -1)])

        if not prev_doc:
            return _to_out(doc)

        # 交换排序号
        unit_collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {"sort_order": prev_doc["sort_order"], "updated_at": datetime.now().isoformat()}}
        )
        unit_collection.update_one(
            {"_id": prev_doc["_id"]},
            {"$set": {"sort_order": current_sort, "updated_at": datetime.now().isoformat()}}
        )

        return self.get_unit_by_id(unit_id)

    def move_down(self, unit_id: str):
        doc = unit_collection.find_one({"unit_id": unit_id})
        if not doc:
            return None

        current_sort = doc.get("sort_order", 0)
        parent_id = doc.get("parent_id")

        # 查找同父节点下排序更大的下一个节点
        next_filter = {"parent_id": parent_id, "sort_order": {"$gt": current_sort}}
        next_doc = unit_collection.find_one(next_filter, sort=[("sort_order", 1)])

        if not next_doc:
            return _to_out(doc)

        # 交换排序号
        unit_collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {"sort_order": next_doc["sort_order"], "updated_at": datetime.now().isoformat()}}
        )
        unit_collection.update_one(
            {"_id": next_doc["_id"]},
            {"$set": {"sort_order": current_sort, "updated_at": datetime.now().isoformat()}}
        )

        return self.get_unit_by_id(unit_id)

    def change_parent(self, unit_id: str, new_parent_id: str):
        doc = unit_collection.find_one({"unit_id": unit_id})
        if not doc:
            return None

        # 计算新的层级
        new_level = 1
        if new_parent_id:
            parent = unit_collection.find_one({"unit_id": new_parent_id})
            if parent:
                new_level = parent.get("level", 1) + 1

        # 计算新的排序号
        max_sort = unit_collection.find_one(
            {"parent_id": new_parent_id},
            sort=[("sort_order", -1)]
        )
        new_sort_order = (max_sort.get("sort_order", 0) + 1) if max_sort else 1

        unit_collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {
                "parent_id": new_parent_id,
                "level": new_level,
                "sort_order": new_sort_order,
                "updated_at": datetime.now().isoformat()
            }}
        )

        # 更新子节点层级
        self._update_children_level(str(doc["_id"]), new_level)

        return self.get_unit_by_id(unit_id)

    def get_tree(self):
        """获取完整的树形结构"""
        all_units = self.list_units()
        unit_map = {u["unit_id"]: {**u, "children": []} for u in all_units}
        root_nodes = []

        for unit in all_units:
            if unit["parent_id"] and unit["parent_id"] in unit_map:
                unit_map[unit["parent_id"]]["children"].append(unit_map[unit["unit_id"]])
            else:
                root_nodes.append(unit_map[unit["unit_id"]])

        return root_nodes


responsibility_unit_service = ResponsibilityUnitService()
