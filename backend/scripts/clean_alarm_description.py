import os
import sys
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "smart_helmet_mongo")

def clean_descriptions():
    client = MongoClient(MONGO_URL)
    db = client[MONGO_DB_NAME]
    collection = db["alarm_record"]

    # 查找所有需要清理的记录
    cursor = collection.find({"description": {"$regex": "Device |entered restricted area|left designated area"}})
    
    count = 0
    for doc in cursor:
        old_desc = doc["description"]
        new_desc = old_desc
        if new_desc.startswith("Device "):
            new_desc = new_desc[7:]  # 去掉 "Device "
        # 替换英文为中文
        new_desc = new_desc.replace("entered restricted area", "闯入禁入区域")
        new_desc = new_desc.replace("left designated area", "离开指定区域")
        if new_desc != old_desc:
            collection.update_one(
                {"_id": doc["_id"]},
                {"$set": {"description": new_desc}}
            )
            count += 1
            print(f"Updated: {old_desc[:60]}... -> {new_desc[:60]}...")

    print(f"\nDone! Updated {count} records.")

if __name__ == "__main__":
    clean_descriptions()
