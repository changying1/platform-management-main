from app.core.database import get_mongo_collection

# 检查咸阳机场T5航站楼项目的围栏和设备坐标
print("=== 咸阳机场T5航站楼项目 ===\n")

# 检查围栏
fence_collection = get_mongo_collection("fence")
fences = list(fence_collection.find({"project": "咸阳机场T5航站楼"}))
print(f"围栏数量: {len(fences)}")
for fence in fences:
    print(f"  围栏: {fence.get('name')}")
    print(f"    type: {fence.get('shape')}")
    print(f"    center: {fence.get('center')}")
    print(f"    geometry: {fence.get('geometry')}")
    print(f"    company: {fence.get('company')}")
    print(f"    project: {fence.get('project')}")

# 检查设备
device_collection = get_mongo_collection("sql_devices")
devices = list(device_collection.find({"project": "咸阳机场T5航站楼"}))
print(f"\n设备数量: {len(devices)}")
for device in devices[:5]:  # 只显示前5个
    print(f"  设备: {device.get('name')}")
    print(f"    lat: {device.get('lat')}, lng: {device.get('lng')}")
    print(f"    company: {device.get('company')}")
    print(f"    project: {device.get('project')}")

# 检查所有设备的坐标范围
all_lats = []
all_lngs = []
for device in devices:
    lat = device.get('lat')
    lng = device.get('lng')
    if lat and lng:
        try:
            lat_val = float(lat)
            lng_val = float(lng)
            if lat_val != 0 and lng_val != 0:
                all_lats.append(lat_val)
                all_lngs.append(lng_val)
        except:
            pass

if all_lats and all_lngs:
    print(f"\n设备坐标范围:")
    print(f"  纬度: {min(all_lats):.6f} ~ {max(all_lats):.6f}")
    print(f"  经度: {min(all_lngs):.6f} ~ {max(all_lngs):.6f}")
    print(f"  中心点: {sum(all_lats)/len(all_lats):.6f}, {sum(all_lngs)/len(all_lngs):.6f}")
else:
    print("\n没有有效的设备坐标")
