from sqlalchemy import Column, Integer, String, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class UserRole(str, enum.Enum):
    ADMIN = "admin" # General Admin
    DEPT_LEADER = "dept_leader" # Manages multiple projects
    PROJECT_MANAGER = "project_manager" # Manages one project
    SAFETY_OFFICER = "safety_officer"
    WORKER = "worker"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    hashed_password = Column(String(100))
    full_name = Column(String(100))
    role = Column(String(20)) # Stored as string from UserRole
    department_id = Column(Integer, nullable=True) # Logic for hierarchy
    
    # New columns for Frontend Admin View
    phone = Column(String(20), nullable=True)
    department = Column(String(100), nullable=True) # Text name of department
    parent_id = Column(Integer, nullable=True) # For simple hierarchy (self-referential if needed, but keeping simple for now)
    
    # Relationships
    devices = relationship("Device", back_populates="owner")
