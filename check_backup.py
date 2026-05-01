import json

with open(r"E:\project\platform-yaokong-260409\platform-management-main\MongoData\all_collections_backup.json", "r", encoding="utf-8") as f:
    data = json.load(f)

print("=" * 50)
print("MongoDB 备份文件统计")
print("=" * 50)
print()

total = 0
for coll_name, docs in data.items():
    print(f"  {coll_name:22s} {len(docs):5d} 条")
    total += len(docs)
    
print("-" * 50)
print(f"  {'合计':22s} {total:5d} 条")
print()
print(f"共 {len(data)} 个集合")
print()
print("=" * 50)
print("⚠️ 注意：这只是 MongoDB 的备份")
print("❌ 不包含 MySQL 关系型数据")
print("   (用户、分公司、项目、设备、围栏等)")
print("=" * 50)
