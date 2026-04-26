from fastapi import APIRouter, HTTPException, UploadFile, File
from app.schemas.personnel_schema import PersonnelCreate, PersonnelUpdate, PersonnelOut
from app.services.personnel_service import PersonnelService
import os
import shutil
from uuid import uuid4

router = APIRouter(prefix="/personnel", tags=["Personnel"])
service = PersonnelService()


@router.get("/", response_model=list[PersonnelOut])
def list_personnel():
    return service.list_personnel()


@router.post("/", response_model=PersonnelOut)
def create_personnel(data: PersonnelCreate):
    return service.create_personnel(data)


@router.put("/{personnel_id}", response_model=PersonnelOut)
def update_personnel(personnel_id: str, data: PersonnelUpdate):
    updated = service.update_personnel(personnel_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Personnel not found")
    return updated

@router.post("/{personnel_id}/face", response_model=PersonnelOut)
def upload_personnel_face(personnel_id: str, file: UploadFile = File(...)):
    allowed_exts = {".jpg", ".jpeg", ".png", ".webp"}
    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()

    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail="Only jpg, jpeg, png, webp files are allowed")

    backend_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    face_dir = os.path.join(backend_root, "static", "faces")
    os.makedirs(face_dir, exist_ok=True)

    filename = f"{personnel_id}_{uuid4().hex}{ext}"
    save_path = os.path.join(face_dir, filename)

    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    face_image_url = f"/static/faces/{filename}"

    updated = service.update_face_image(personnel_id, face_image_url)
    if not updated:
        raise HTTPException(status_code=404, detail="Personnel not found")

    return updated

@router.delete("/{personnel_id}")
def delete_personnel(personnel_id: str):
    success = service.delete_personnel(personnel_id)
    return {"success": success}