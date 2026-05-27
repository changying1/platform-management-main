import sys
sys.path.insert(0, '.')
from app.core.database import SessionLocal
from app.models.video import VideoDevice

db = SessionLocal()
devices = db.query(VideoDevice).all()
print('设备列表:')
for d in devices:
    print(f'ID: {d.id}, 名称: {d.name}')
db.close()
