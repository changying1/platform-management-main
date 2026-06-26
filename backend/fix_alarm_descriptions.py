from app.core.database import get_mongo_collection

# 修复 VIDEO_DEVICE_OFFLINE 告警描述
collection = get_mongo_collection('alarm_record')

# 查找所有包含乱码的告警
alarms = collection.find({
    'alarm_type': 'VIDEO_DEVICE_OFFLINE',
    'description': {'$regex': '瑙嗛'}
})

fixed_count = 0
for alarm in alarms:
    old_desc = alarm.get('description', '')
    # 替换乱码
    new_desc = old_desc.replace('瑙嗛璁惧', '视频设备').replace('绂荤嚎', '离线')
    if new_desc != old_desc:
        collection.update_one(
            {'_id': alarm['_id']},
            {'$set': {'description': new_desc}}
        )
        fixed_count += 1

print(f"Total fixed: {fixed_count}")
