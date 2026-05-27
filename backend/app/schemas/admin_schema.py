from pydantic import BaseModel
from typing import Optional

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str
    department_id: Optional[int] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    parent_id: Optional[int] = None
    # 员工相关字段
    employee_code: Optional[str] = None
    id_card: Optional[str] = None
    work_type_id: Optional[str] = None
    team: Optional[str] = None
    work_team: Optional[str] = None
    company: Optional[str] = None
    project: Optional[str] = None
    entry_date: Optional[str] = None
    emergency_contact: Optional[str] = None



class UserUpdate(BaseModel):

    username: Optional[str] = None

    password: Optional[str] = None

    full_name: Optional[str] = None

    role: Optional[str] = None

    phone: Optional[str] = None

    department: Optional[str] = None

    parent_id: Optional[int] = None

    department_id: Optional[int] = None



class UserOut(BaseModel):

    id: int

    username: str

    full_name: Optional[str] = None

    role: str

    # New fields

    phone: Optional[str] = None

    department: Optional[str] = None

    department_id: Optional[int] = None

    parent_id: Optional[int] = None

    

    class Config:

        from_attributes=True

