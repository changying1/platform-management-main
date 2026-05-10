import json
import os
import sys
from pymongo import MongoClient
from bson import ObjectId

MONGO_URL = "mongodb://127.0.0.1:27017"
MONGO_DB_NAME = "smart_helmet_mongo"

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
BACKUP_FILE = os.path.join(PROJECT_ROOT, "MongoData", "all_collections_backup.json")
if not os.path.exists(BACKUP_FILE):
    BACKUP_FILE = os.path.join(os.path.dirname(__file__), "..", "MongoData", "all_collections_backup.json")

def fix_bson(obj):
    """转换 MongoDB 扩展 JSON $oid, $date 等格式"""
    if isinstance(obj, dict):
        if "$oid" in obj:
            return ObjectId(obj["$oid"])
        if "$date" in obj:
            return obj["$date"]
        return {k: fix_bson(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [fix_bson(x) for x in obj]
    return obj

print("=" * 60)
print("MongoDB 数据导入工具 (修复版)")
print("=" * 60)

print(f"\n📂 备份文件: {BACKUP_FILE}")
if not os.path.exists(BACKUP_FILE):
    print(f"❌ 文件不存在!")
    sys.exit(1)

with open(BACKUP_FILE, "r", encoding="utf-8") as f:
    backup_data = json.load(f)

print(f"✅ 找到 {len(backup_data)} 个集合")

try:
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    print("✅ MongoDB 连接成功")
except Exception as e:
    print(f"❌ MongoDB 连接失败: {e}")
    print("💡 请确保第一个窗口的 MongoDB 正在运行!")
    sys.exit(1)

db = client[MONGO_DB_NAME]

for collection_name, documents in backup_data.items():
    if not documents:
        print(f"\n⏭️  {collection_name}: 无数据，跳过")
        continue

    collection = db[collection_name]
    print(f"\n📦 导入 {collection_name}: {len(documents)} 条")
    
    collection.delete_many({})
    
    docs_fixed = [fix_bson(d) for d in documents]
    collection.insert_many(docs_fixed)
    print(f"   ✅ 完成")

print("\n" + "=" * 60)
print("🎉 全部导入完成!")
print("=" * 60)

print("\n📋 验证结果:")
for collection_name in backup_data.keys():
    count = db[collection_name].count_documents({})
    print(f"   {collection_name}: {count} 条")
