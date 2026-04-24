import os
import json
import sys
from datetime import datetime

# 尝试导入 pymongo 和 bson
try:
    from pymongo import MongoClient
    from bson import json_util
except ImportError as e:
    print(f"错误: 导入失败 ({e})")
    print("请确认是否安装了 pymongo。如果已安装，请尝试卸载独立的 bson 库 (pip uninstall bson) 并重新安装 pymongo。")
    print("建议运行: python -m pip install pymongo")
    sys.exit(1)

# ================= 配置区 =================
# MongoDB 连接字符串
MONGO_URI = "mongodb://localhost:27017/"
# 默认操作的数据库名称
DEFAULT_DB_NAME = "platform"
# 备份存放目录
BACKUP_DIR = "MongoData"
# 备份文件名
BACKUP_FILENAME = "all_collections_backup.json"
# ==========================================

BACKUP_PATH = os.path.join(BACKUP_DIR, BACKUP_FILENAME)

def backup_database(db_name):
    """
    备份指定数据库中的所有集合到 JSON 文件
    """
    print(f"\n[备份] 正在连接 MongoDB...")
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        # 检查连接是否可用
        client.server_info()
        
        db = client[db_name]
        collections = db.list_collection_names()
        
        if not collections:
            print(f"警告: 数据库 '{db_name}' 中没有发现任何集合。")
            return

        print(f"[备份] 正在从数据库 '{db_name}' 提取数据...")
        all_data = {}
        
        for coll_name in collections:
            print(f"  -> 正在读取集合: {coll_name}")
            cursor = db[coll_name].find()
            # 将游标内容转为列表
            all_data[coll_name] = list(cursor)

        # 确保根目录下的 MongoData 文件夹存在
        if not os.path.exists(BACKUP_DIR):
            os.makedirs(BACKUP_DIR)
            print(f"[备份] 创建目录: {BACKUP_DIR}")

        print(f"[备份] 正在写入文件: {BACKUP_PATH}...")
        with open(BACKUP_PATH, 'w', encoding='utf-8') as f:
            # 使用 bson.json_util 处理 MongoDB 特有类型（如 ObjectId, datetime 等）
            json_str = json_util.dumps(all_data, ensure_ascii=False, indent=4)
            f.write(json_str)

        print(f"成功: 数据库 '{db_name}' 已成功备份至 '{BACKUP_PATH}'")
        client.close()
        
    except Exception as e:
        print(f"失败: 备份过程中出现错误: {e}")

def restore_database(db_name):
    """
    从 JSON 文件恢复数据并覆盖当前数据库
    """
    if not os.path.exists(BACKUP_PATH):
        print(f"错误: 备份文件 '{BACKUP_PATH}' 不存在，请先执行备份操作。")
        return

    print(f"\n[恢复] 警告: 准备恢复数据库 '{db_name}'，这将删除该库中的现有数据！")
    confirm = input(f"输入 'y' 确认覆盖数据库 '{db_name}': ").strip().lower()
    if confirm != 'y':
        print("恢复操作已取消。")
        return

    print(f"[恢复] 正在读取备份文件...")
    try:
        with open(BACKUP_PATH, 'r', encoding='utf-8') as f:
            file_content = f.read()
            # 使用 bson.json_util 加载数据，还原 MongoDB 对象类型
            all_data = json_util.loads(file_content)

        if not all_data:
            print("错误: 备份文件内容为空。")
            return

        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[db_name]

        print(f"[恢复] 开始导入数据到数据库 '{db_name}'...")
        for coll_name, docs in all_data.items():
            print(f"  -> 正在处理集合: {coll_name}")
            # 覆盖逻辑：先删后插
            db[coll_name].drop() 
            if docs:
                db[coll_name].insert_many(docs)
                print(f"     已写入 {len(docs)} 条文档。")
            else:
                print(f"     集合 {coll_name} 在备份中为空，已创建空集合。")

        print(f"成功: 数据库 '{db_name}' 已根据备份文件完成覆盖恢复。")
        client.close()

    except Exception as e:
        print(f"失败: 恢复过程中出现错误: {e}")

def main():
    print("="*40)
    print("      MongoDB 数据库备份与恢复工具")
    print("="*40)
    
    # 可以在此处修改默认连接信息或让用户输入
    db_name = input(f"请输入要操作的数据库名称 (回车默认: {DEFAULT_DB_NAME}): ").strip()
    if not db_name:
        db_name = DEFAULT_DB_NAME

    while True:
        print(f"\n当前操作数据库: {db_name}")
        print("-" * 20)
        print("1: 备份 (将数据库提取为 JSON)")
        print("2: 覆盖 (从 JSON 恢复到数据库)")
        print("q: 退出")
        print("-" * 20)
        
        choice = input("请选择操作 [1/2/q]: ").strip().lower()
        
        if choice == '1':
            backup_database(db_name)
        elif choice == '2':
            restore_database(db_name)
        elif choice == 'q':
            print("退出工具。")
            break
        else:
            print("输入无效，请重新选择。")

if __name__ == "__main__":
    main()
