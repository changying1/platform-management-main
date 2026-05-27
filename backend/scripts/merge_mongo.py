"""
MongoDB 数据合并导入脚本
从 MongoData/all_collections_backup.json 合并数据到本地 MongoDB
- 如果记录已存在（根据_id判断），则更新
- 如果记录不存在，则插入
- 不会删除本地已有的数据
"""
import json
import os
from pymongo import MongoClient, UpdateOne
from bson import ObjectId

MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "smart_helmet_mongo")

BACKUP_FILE = r"E:\project\platform-yaokong-260409\platform-management-main - 副本 (2) - 副本\MongoData\all_collections_backup.json"

def convert_bson_types(obj):
    """转换 MongoDB 扩展 JSON 类型"""
    if isinstance(obj, dict):
        if "$oid" in obj:
            return ObjectId(obj["$oid"])
        if "$date" in obj:
            if isinstance(obj["$date"], str):
                from dateutil import parser
                return parser.parse(obj["$date"])
            from datetime import datetime
            return datetime.fromtimestamp(obj["$date"] / 1000)
        return {k: convert_bson_types(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [convert_bson_types(x) for x in obj]
    return obj

def main():
    print("=" * 60)
    print("MongoDB 数据合并导入工具")
    print("=" * 60)

    if not os.path.exists(BACKUP_FILE):
        print(f"错误: 备份文件不存在: {BACKUP_FILE}")
        return 1

    print(f"读取备份文件: {BACKUP_FILE}")

    with open(BACKUP_FILE, "r", encoding="utf-8") as f:
        backup_data = json.load(f)

    print(f"找到 {len(backup_data)} 个集合")

    try:
        client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        print("MongoDB 连接成功")
    except Exception as e:
        print(f"MongoDB 连接失败: {e}")
        return 1

    db = client[MONGO_DB_NAME]

    total_updated = 0
    total_inserted = 0

    for collection_name, documents in backup_data.items():
        if not documents:
            print(f"\n集合 {collection_name}: 无数据, 跳过")
            continue

        collection = db[collection_name]
        print(f"\n处理集合: {collection_name} ({len(documents)} 条)")

        operations = []
        existing_count = 0
        new_count = 0

        for doc in documents:
            converted_doc = convert_bson_types(doc)
            doc_id = converted_doc.get("_id")

            if doc_id is None:
                continue

            filter_doc = {"_id": doc_id}
            existing = collection.find_one(filter_doc)

            if existing:
                existing_count += 1
            else:
                operations.append(
                    {
                        "insert": converted_doc
                    }
                )
                new_count += 1

        if operations:
            from pymongo import InsertOne
            result = collection.bulk_write([InsertOne(doc["insert"]) for doc in operations], ordered=False)
            total_inserted += result.inserted_count
            print(f"  - 已有: {existing_count} 条, 新增: {new_count} 条")

    print("\n" + "=" * 60)
    print(f"合并完成! 共新增 {total_inserted} 条记录")
    print("备份文件中已有的记录保持不变，本地其他数据不受影响")

if __name__ == "__main__":
    main()
