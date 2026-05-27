"""
MongoDB 备份数据导入脚本
从 MongoData/all_collections_backup.json 导入数据到本地 MongoDB
"""
import json
import os
import sys
from datetime import datetime
from pymongo import MongoClient, DeleteMany

MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "smart_helmet_mongo")

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
BACKUP_FILE = os.path.join(PROJECT_ROOT, "MongoData", "all_collections_backup.json")
if not os.path.exists(BACKUP_FILE):
    BACKUP_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "MongoData", "all_collections_backup.json")

def convert_bson_types(obj):
    """转换 MongoDB 扩展 JSON 类型"""
    if isinstance(obj, dict):
        if "$oid" in obj:
            from bson import ObjectId
            return ObjectId(obj["$oid"])
        if "$date" in obj:
            if isinstance(obj["$date"], str):
                from datetime import datetime
                from dateutil import parser
                return parser.parse(obj["$date"])
            return datetime.fromtimestamp(obj["$date"] / 1000)
        return {k: convert_bson_types(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [convert_bson_types(x) for x in obj]
    return obj

def main():
    print("=" * 60)
    print("MongoDB 数据导入工具")
    print("=" * 60)

    if not os.path.exists(BACKUP_FILE):
        print(f"❌ 备份文件不存在: {BACKUP_FILE}")
        return 1

    print(f"📂 读取备份文件: {BACKUP_FILE}")
    
    with open(BACKUP_FILE, "r", encoding="utf-8") as f:
        backup_data = json.load(f)

    print(f"✅ 找到 {len(backup_data)} 个集合")

    try:
        client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        print("✅ MongoDB 连接成功")
    except Exception as e:
        print(f"❌ MongoDB 连接失败: {e}")
        print("💡 请确保 MongoDB 服务已启动")
        return 1

    db = client[MONGO_DB_NAME]

    for collection_name, documents in backup_data.items():
        if not documents:
            print(f"⏭️  {collection_name}: 无数据,跳过")
            continue

        collection = db[collection_name]
        
        print(f"\n📦 导入集合: {collection_name} ({len(documents)} 条)")
        
        collection.bulk_write([DeleteMany({})])
        print(f"   - 清空原有数据")
        
        docs_to_insert = [convert_bson_types(doc) for doc in documents]
        result = collection.insert_many(docs_to_insert)
        print(f"   - 成功插入 {len(result.inserted_ids)} 条")

    print("\n" + "=" * 60)
    print("🎉 MongoDB 数据导入完成!")
    print("=" * 60)
    
    print("\n📋 集合统计:")
    for collection_name in backup_data.keys():
        count = db[collection_name].count_documents({})
        print(f"   {collection_name}: {count} 条")

    return 0

if __name__ == "__main__":
    sys.exit(main())
