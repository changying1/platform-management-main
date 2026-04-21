from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.alarm_records import AlarmRecord
from app.models.device import Device
from app.models.fence import ElectronicFence
from app.schemas.alarm_schema import AlarmCreate, AlarmUpdate
from app.utils.logger import get_logger
from app.services.notification_service import notification_service
from datetime import datetime, timedelta
import asyncio

logger = get_logger("AlarmService")

class AlarmService:
    def create_alarm(self, db: Session, alarm: AlarmCreate):
        logger.warning(f"ALARM TRIGGERED: Device {alarm.device_id}, Type {alarm.alarm_type}")

        # 1. 重复报警抑制 (1秒内完全相同的设备+类型+围栏报警视为重复)
        one_second_ago = datetime.utcnow() - timedelta(seconds=1)
        exists = db.query(AlarmRecord).filter(
            AlarmRecord.device_id == alarm.device_id,
            AlarmRecord.alarm_type == alarm.alarm_type,
            AlarmRecord.fence_id == alarm.fence_id,
            AlarmRecord.timestamp >= one_second_ago
        ).first()
        if exists:
            logger.info("Duplicate alarm suppressed")
            return exists

        device = db.query(Device).filter(Device.id == alarm.device_id).first()
        if not device:
            raise HTTPException(status_code=400, detail=f"Device not found: {alarm.device_id}")
        if alarm.fence_id is not None:
            fence = db.query(ElectronicFence).filter(ElectronicFence.id == alarm.fence_id).first()
            if not fence:
                raise HTTPException(status_code=400, detail=f"Fence not found: {alarm.fence_id}")
            
            # 修正描述逻辑：不再重复拼接，直接生成结构化描述
            behavior_text = "禁入" if fence.behavior == "No Entry" else "禁出"
            alarm.description = f"[电子围栏-{behavior_text}] {fence.name} 触发报警"
            
            # 修正地点逻辑：如果前端传了坐标，保留坐标；否则仅显示围栏名
            if alarm.location and "," in alarm.location:
                alarm.location = f"{fence.name} ({alarm.location})"
            else:
                alarm.location = fence.name

        # 自动推断 project_id：如果前端没传，通过 device_id 在 project_devices 表查找
        project_id = alarm.project_id
        if project_id is None:
            from app.models.project import project_devices, Project
            # 先查 project_devices 表获取设备关联的项目
            row = db.execute(
                project_devices.select().where(project_devices.c.device_id == alarm.device_id)
            ).first()
            if row:
                project_id = row.project_id
            else:
                # 兼容性处理：如果没有关联项目，尝试取数据库中现有的第一个项目 ID
                first_project = db.query(Project).first()
                if first_project:
                    project_id = first_project.id
                else:
                    # 如果库里一个项目都没有，则设为 None 以避免外键失败
                    logger.warning(f"Device {alarm.device_id} has no project association and NO project exists in DB.")
                    project_id = None

        new_alarm = AlarmRecord(
            device_id=alarm.device_id,
            fence_id=alarm.fence_id,
            project_id=project_id,
            alarm_type=alarm.alarm_type,
            severity=alarm.severity,
            description=alarm.description,
            location=alarm.location,
            status=alarm.status
        )
        db.add(new_alarm)
        try:
            db.commit()
            db.refresh(new_alarm)
            logger.warning(f"SUCCESSFULLY SAVED ALARM: ID {new_alarm.id}")
            
            # 触发通知
            try:
                import json
                import os
                
                config_path = "data/system_config.json"
                recipients = []
                if os.path.exists(config_path):
                    with open(config_path, "r", encoding="utf-8") as f:
                        config = json.load(f)
                        recipients = config.get("notificationRecipients", [])
                
                if recipients:
                    alarm_level = new_alarm.severity or "medium"
                    if alarm_level == "normal":
                        alarm_level = "low"
                    elif alarm_level == "high":
                        alarm_level = "severe"
                    
                    asyncio.create_task(notification_service.handle_alarm(
                        alarm_level=alarm_level,
                        alarm_type=new_alarm.alarm_type,
                        alarm_message=new_alarm.description or "安全告警触发",
                        recipients=recipients
                    ))
            except Exception as notify_err:
                logger.error(f"Notification error: {notify_err}")
                
            return new_alarm
        except Exception as e:
            db.rollback()
            logger.error(f"DATABASE SAVE ERROR: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database save error: {str(e)}")

    def get_alarms(self, db: Session, skip: int = 0, limit: int = 100, project_id: int | None = None):
        query = db.query(AlarmRecord)
        if project_id is not None:
            query = query.filter(AlarmRecord.project_id == project_id)
        return query.order_by(AlarmRecord.timestamp.desc()).offset(skip).limit(limit).all()

    def update_alarm(self, db: Session, alarm_id: int, update_data: AlarmUpdate):
        db_alarm = db.query(AlarmRecord).filter(AlarmRecord.id == alarm_id).first()
        if not db_alarm:
            return None
        
        if update_data.status:
            db_alarm.status = update_data.status
            if update_data.status == "resolved":
                db_alarm.handled_at = datetime.now()
        
        if update_data.description:
            db_alarm.description = update_data.description
            
        if update_data.severity:
            db_alarm.severity = update_data.severity
            
        db.commit()
        db.refresh(db_alarm)
        return db_alarm

    def delete_alarm(self, db: Session, alarm_id: int):
        db_alarm = db.query(AlarmRecord).filter(AlarmRecord.id == alarm_id).first()
        if db_alarm:
            db.delete(db_alarm)
            db.commit()
            return True
        return False
