from app.core.database import get_mongo_collection

# 检查组织树结构
print("=== 组织树结构 ===\n")

# 获取组织树
import requests
import json

# 尝试从API获取组织树
try:
    from app.core.security import create_access_token
    from app.core.database import get_mongo_collection
    
    # 获取责任单元
    units_collection = get_mongo_collection("responsibility_units")
    units = list(units_collection.find())
    print(f"责任单元数量: {len(units)}")
    
    for unit in units[:10]:
        print(f"  {unit.get('name')} - type: {unit.get('type')}, parent: {unit.get('parent_id')}")
        
except Exception as e:
    print(f"Error: {e}")

# 检查项目数据
print("\n=== 项目数据 ===")
project_collection = get_mongo_collection("project")
projects = list(project_collection.find())
print(f"项目数量: {len(projects)}")
for proj in projects:
    print(f"  {proj.get('name')} - branch: {proj.get('branch')}, id: {proj.get('id')}")
    
# 检查网格数据  
print("\n=== 网格数据 ===")
grid_collection = get_mongo_collection("grid")
grids = list(grid_collection.find())
print(f"网格数量: {len(grids)}")
for grid in grids[:10]:
    print(f"  {grid.get('name')} - project: {grid.get('project')}, id: {grid.get('id')}")
