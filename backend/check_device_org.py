from app.core.database import get_mongo_collection

# 统计设备的组织架构分布
collection = get_mongo_collection("sql_devices")

total = collection.count_documents({})
print(f"总设备数: {total}")

# 按公司统计
print("\n按公司分布:")
pipeline = [
    {"$group": {"_id": "$company", "count": {"$sum": 1}}},
    {"$sort": {"count": -1}}
]
for doc in collection.aggregate(pipeline):
    print(f"  {doc['_id'] or '(空)'}: {doc['count']}")

# 按项目统计
print("\n按项目分布:")
pipeline = [
    {"$group": {"_id": "$project", "count": {"$sum": 1}}},
    {"$sort": {"count": -1}}
]
for doc in collection.aggregate(pipeline):
    print(f"  {doc['_id'] or '(空)'}: {doc['count']}")

# 按网格统计
print("\n按网格分布:")
pipeline = [
    {"$group": {"_id": "$grid", "count": {"$sum": 1}}},
    {"$sort": {"count": -1}}
]
for doc in collection.aggregate(pipeline):
    print(f"  {doc['_id'] or '(空)'}: {doc['count']}")

# 按工队统计
print("\n按工队分布:")
pipeline = [
    {"$group": {"_id": "$team", "count": {"$sum": 1}}},
    {"$sort": {"count": -1}}
]
for doc in collection.aggregate(pipeline):
    print(f"  {doc['_id'] or '(空)'}: {doc['count']}")

# 显示几个示例设备
print("\n示例设备:")
for doc in collection.find().limit(5):
    print(f"  {doc.get('name')} - company:{doc.get('company')}, project:{doc.get('project')}, grid:{doc.get('grid')}, team:{doc.get('team')}")
