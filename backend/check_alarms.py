from app.core.database import get_mongo_collection

alarms = list(get_mongo_collection('alarm_record').find({'alarm_type': 'VIDEO_DEVICE_OFFLINE'}).limit(3))
for a in alarms:
    print(f"ID: {a.get('id')}, Desc: {a.get('description')}")
