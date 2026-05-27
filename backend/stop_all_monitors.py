"""
停止除了"东站西门摄像头"外的所有AI监控
"""
import sys
sys.path.insert(0, '.')

from app.services.ai_manager import ai_manager
from app.core.database import SessionLocal
from app.models.video import VideoDevice

def main():
    db = SessionLocal()
    
    try:
        devices = db.query(VideoDevice).all()
        
        print("=" * 50)
        print("当前数据库中的设备列表:")
        print("=" * 50)
        
        target_device_id = None
        for d in devices:
            print(f"ID: {d.id}, 名称: {d.name}")
            if "东站西门" in (d.name or ""):
                target_device_id = str(d.id)
                print(f"   >>> 这是目标设备,将保留")
        
        print("=" * 50)
        print(f"当前活跃监控: {list(ai_manager.active_monitors.keys())}")
        print("=" * 50)
        
        stopped_count = 0
        for device_id in list(ai_manager.active_monitors.keys()):
            if device_id != target_device_id:
                print(f"正在停止设备 {device_id} 的监控...")
                ai_manager.stop_monitoring(device_id)
                stopped_count += 1
            else:
                print(f"跳过目标设备 {device_id} (东站西门摄像头)")
        
        print("=" * 50)
        print(f"已停止 {stopped_count} 个监控")
        print(f"剩余活跃监控: {list(ai_manager.active_monitors.keys())}")
        print("=" * 50)
        
    finally:
        db.close()

if __name__ == "__main__":
    main()
