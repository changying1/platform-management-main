from app.core.database import get_mongo_collection

# 检查项目的坐标字段
print("=== 项目坐标数据 ===\n")

project_collection = get_mongo_collection("project")
projects = list(project_collection.find())

for proj in projects[:5]:
    print(f"项目: {proj.get('name')}")
    print(f"  id: {proj.get('id')}")
    print(f"  center: {proj.get('center')}")
    print(f"  latitude/lat: {proj.get('latitude')} / {proj.get('lat')}")
    print(f"  longitude/lng: {proj.get('longitude')} / {proj.get('lng')}")
    print(f"  zoom_level: {proj.get('zoom_level')}")
    print(f"  area_boundary: {proj.get('area_boundary')}")
    print()
