from pydantic import BaseModel
from typing import Optional


class PersonnelCreate(BaseModel):
    username: str
    dept: Optional[str] = ""
    phone: Optional[str] = ""
    password: Optional[str] = ""
    role: Optional[str] = "Worker"
    parentId: Optional[str] = None
    faceImage: Optional[str] = ""

    employeeId: Optional[str] = ""
    idCard: Optional[str] = ""
    company: Optional[str] = ""
    project: Optional[str] = ""
    workType: Optional[str] = ""
    workTeam: Optional[str] = ""
    team: Optional[str] = ""
    entryDate: Optional[str] = ""
    status: Optional[str] = "active"
    emergencyContact: Optional[str] = ""


class PersonnelUpdate(BaseModel):
    username: Optional[str] = None
    dept: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    parentId: Optional[str] = None
    faceImage: Optional[str] = None

    employeeId: Optional[str] = None
    idCard: Optional[str] = None
    company: Optional[str] = None
    project: Optional[str] = None
    workType: Optional[str] = None
    workTeam: Optional[str] = None
    team: Optional[str] = None
    entryDate: Optional[str] = None
    status: Optional[str] = None
    emergencyContact: Optional[str] = None


class PersonnelOut(BaseModel):
    id: str
    username: str
    dept: Optional[str] = ""
    phone: Optional[str] = ""
    role: Optional[str] = "Worker"
    addedDate: str
    parentId: Optional[str] = None
    faceImage: Optional[str] = ""

    employeeId: Optional[str] = ""
    idCard: Optional[str] = ""
    company: Optional[str] = ""
    project: Optional[str] = ""
    workType: Optional[str] = ""
    workTeam: Optional[str] = ""
    team: Optional[str] = ""
    entryDate: Optional[str] = ""
    status: Optional[str] = "active"
    emergencyContact: Optional[str] = ""