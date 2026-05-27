from app.core.database import SessionLocal
from app.models.device import Device
from app.utils.logger import get_logger

logger = get_logger("DB_Fix")

def fix_device_ips():
    db = SessionLocal()
    try:
        # Find devices with NULL ip_address
        devices = db.query(Device).filter(Device.ip_address == None).all()
        if not devices:
            print("No devices found with NULL ip_address.")
            return
            
        print(f"Found {len(devices)} devices with NULL ip_address. Fixing...")
        for dev in devices:
            dev.ip_address = "0.0.0.0"
            if dev.port is None:
                dev.port = 8989
            print(f"Fixed device: {dev.id}")
            
        db.commit()
        print("Database fix complete.")
    except Exception as e:
        print(f"Error fixing database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    fix_device_ips()
