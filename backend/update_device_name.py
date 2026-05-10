from app.core.database import get_video_device_collection

c = get_video_device_collection()

result = c.update_one(
    {"device_serial": "GM7974925"},
    {"$set": {"name": "海康球机摄像头1号"}}
)

print("修改成功！")
print("匹配数:", result.matched_count)
print("修改数:", result.modified_count)

d = c.find_one({"device_serial": "GM7974925"})
print("当前设备名称:", d.get("name"))
