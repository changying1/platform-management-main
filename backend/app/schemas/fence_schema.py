from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from enum import Enum
import json

class AlarmLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class FenceShape(str, Enum):
    POLYGON = "polygon"
    CIRCLE = "circle"

# --- Project Region Schemas ---
class ProjectRegionBase(BaseModel):
    name: str = Field(..., description="项目区域名字")
    coordinates_json: str = Field(..., description="多边形顶点坐标JSON: '[[lat,lng],...]'")
    remark: Optional[str] = Field(None, description="区域备注")

    @field_validator('coordinates_json')
    def validate_json(cls, v):
        try:
            json.loads(v)
        except ValueError:
            raise ValueError('Invalid JSON format for coordinates')
        return v

class ProjectRegionCreate(ProjectRegionBase):
    pass

class ProjectRegionUpdate(BaseModel):
    name: Optional[str] = None
    coordinates_json: Optional[str] = None
    remark: Optional[str] = None

class ProjectRegionOut(ProjectRegionBase):
    id: int

    class Config:
        from_attributes = True

# --- Fence Schemas ---
class FenceBase(BaseModel):
    name: str = Field(..., description="围栏名字")
    project_region_id: Optional[int] = Field(None, description="所属项目区域ID")
    shape: FenceShape = Field(default=FenceShape.POLYGON, description="形状: polygon 或 circle")
    behavior: str = Field(default="No Exit", description="管控类型: No Entry, No Exit")
    
    coordinates_json: str = Field(..., description="坐标数据.多边形: '[[lat,lng],...]', 圆形: '[lat,lng]'")
    radius: Optional[float] = Field(None, description="半径(米),当 shape=circle 时必填")
    
    effective_time: str = Field(..., description="生效时间 (如 5.00-23.00)", example="5.00-23.00")
    remark: Optional[str] = Field(None, description="围栏备注")
    alarm_type: AlarmLevel = Field(default=AlarmLevel.MEDIUM, description="报警类型: high, medium, low")

    @field_validator('radius')
    def validate_radius(cls, v, values):
        return v

    @field_validator('coordinates_json')
    def validate_json(cls, v):
        try:
            json.loads(v)
        except ValueError:
            raise ValueError('Invalid JSON format for coordinates')
        return v

class FenceCreate(FenceBase):
    pass

class FenceUpdate(BaseModel):
    name: Optional[str] = None
    project_region_id: Optional[int] = None
    shape: Optional[FenceShape] = None
    behavior: Optional[str] = None
    coordinates_json: Optional[str] = None
    radius: Optional[float] = None
    effective_time: Optional[str] = None
    remark: Optional[str] = None
    alarm_type: Optional[AlarmLevel] = None
    is_active: Optional[int] = None

class FenceOut(FenceBase):
    id: int
    worker_count: int = Field(0, description="当前围栏内工人数")
    is_active: int

    class Config:
        from_attributes = True
