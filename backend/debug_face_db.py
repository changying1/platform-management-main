import os
import sys

# 将 backend 加入路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import get_personnel_collection, is_mongo_available, describe_mongo_connection

print(f"MongoDB 连接: {describe_mongo_connection()}")
print(f"MongoDB 可用: {is_mongo_available(log_error=True)}")

try:
    coll = get_personnel_collection()
    total = coll.estimated_document_count()
    print(f"\npersonnel 集合总文档数: {total}")

    # 查询包含 faceImage 字段的文档数
    with_faceimage = coll.count_documents({"faceImage": {"$exists": True, "$ne": ""}})
    print(f"包含 faceImage 字段(非空)的文档数: {with_faceimage}")

    # 查看所有字段名（取前3条样例）
    print("\n--- 样本文档字段 ---")
    for i, doc in enumerate(coll.find().limit(3)):
        print(f"\n样例 {i+1}:")
        for k, v in doc.items():
            v_str = str(v)
            if len(v_str) > 80:
                v_str = v_str[:80] + "..."
            print(f"  {k}: {v_str}")

    # 检查是否有 photo 或其他可能的图片字段
    print("\n--- 检查其他可能的图片字段 ---")
    possible_fields = ["photo", "avatar", "image", "imageUrl", "headImage", "portrait", "faceUrl"]
    for field in possible_fields:
        count = coll.count_documents({field: {"$exists": True, "$ne": ""}})
        if count > 0:
            print(f"  字段 '{field}': {count} 条记录")

except Exception as e:
    print(f"查询失败: {e}")
    import traceback
    traceback.print_exc()
