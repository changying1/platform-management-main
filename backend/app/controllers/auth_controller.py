from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import get_mongo_collection

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class LoginReq(BaseModel):
    username: str
    password: str


def _find_branch(department_id):
    if department_id in (None, "", 0, "0"):
        return None
    branch_id = int(department_id)
    for collection_name in ["branches", "sql_branches"]:
        branch = get_mongo_collection(collection_name).find_one(
            {"$or": [{"id": branch_id}, {"id": str(branch_id)}]},
            {"_id": 0},
        )
        if branch:
            return branch
    return None


@router.post("/login")
def login(req: LoginReq):
    user = get_mongo_collection("users").find_one({"username": req.username}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="账号或密码错误")

    stored_password = user.get("hashed_password") or user.get("password") or ""
    if stored_password != req.password:
        raise HTTPException(status_code=401, detail="账号或密码错误")

    role = (user.get("role") or "BRANCH").upper()
    department_id = user.get("department_id")
    branch = None

    if role == "BRANCH":
        if department_id is None:
            raise HTTPException(status_code=400, detail="分部账号未绑定分公司")
        branch_doc = _find_branch(department_id)
        if not branch_doc:
            raise HTTPException(status_code=400, detail="账号分公司信息未配置正确")

        lng = branch_doc.get("lng")
        lat = branch_doc.get("lat")
        coord = [float(lng), float(lat)] if lng is not None and lat is not None else None
        branch = {
            "id": int(branch_doc.get("id")),
            "province": branch_doc.get("province") or "",
            "name": branch_doc.get("name") or "",
            "coord": coord,
            "address": branch_doc.get("address"),
            "project": branch_doc.get("project"),
            "manager": branch_doc.get("manager"),
            "phone": branch_doc.get("phone"),
            "deviceCount": int(branch_doc.get("device_count") or 0),
            "status": branch_doc.get("status") or "正常",
            "updatedAt": str(branch_doc.get("updated_at")) if branch_doc.get("updated_at") else None,
            "remark": branch_doc.get("remark"),
        }

    return {
        "userId": int(user.get("id")),
        "username": user.get("username"),
        "full_name": user.get("full_name"),
        "role": role,
        "department_id": department_id,
        "branch": branch,
    }
