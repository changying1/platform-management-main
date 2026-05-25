"""
直接数据库测试脚本
用于直接向MySQL数据库插入视频设备测试数据
"""

import sys
from pathlib import Path

# 添加backend目录到Python路径
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.video import VideoDevice
from app.core.database import Base, SQLALCHEMY_DATABASE_URL

def init_test_data():
    """初始化测试数据"""
    print("="*60)
    print("视频设备测试数据初始化脚本")
    print("="*60)
    
    # 创建数据库连接
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        # 创建表(如果不存在)
        print("\n检查并创建数据库表...")
        Base.metadata.create_all(bind=engine)
        print("✓ 数据库表就绪")
        
        # 检查现有数据
        print("\n检查现有数据...")
        existing_count = db.query(VideoDevice).count()
        print(f"  当前数据库中有 {existing_count} 个视频设备")
        
        # 测试数据列表
        test_videos = [
            {
                "name": "大门口摄像头",
                "ip_address": "192.168.1.100",
                "port": 554,
                "username": "admin",
                "password": "admin123",
                "stream_url": "rtsp://192.168.1.100:554/Streaming/Channels/101",
                "latitude": 39.9042,
                "longitude": 116.4074,
                "status": "online",
                "remark": "主入口监控",
                "is_active": 1
            },
            {
                "name": "停车场摄像头",
                "ip_address": "192.168.1.101",
                "port": 554,
                "username": "admin",
                "password": "admin123",
                "stream_url": "rtsp://192.168.1.101:554/Streaming/Channels/101",
                "latitude": 39.9052,
                "longitude": 116.4084,
                "status": "online",
                "remark": "停车场监控",
                "is_active": 1
            },
            {
                "name": "仓库摄像头",
                "ip_address": "192.168.1.102",
                "port": 554,
                "username": "admin",
                "password": "admin123",
                "stream_url": "rtsp://192.168.1.102:554/Streaming/Channels/101",
                "latitude": 39.9062,
                "longitude": 116.4094,
                "status": "offline",
                "remark": "仓库区域监控",
                "is_active": 1
            },
            {
                "name": "办公区摄像头",
                "ip_address": "192.168.1.103",
                "port": 554,
                "username": "admin",
                "password": "admin123",
                "stream_url": "rtsp://192.168.1.103:554/Streaming/Channels/101",
                "latitude": 39.9072,
                "longitude": 116.4104,
                "status": "online",
                "remark": "办公区域监控",
                "is_active": 1
            }
        ]
        
        # 插入测试数据
        print("\n开始插入测试数据...")
        added_count = 0
        
        for video_data in test_videos:
            # 检查是否已存在
            existing = db.query(VideoDevice).filter(
                VideoDevice.name == video_data["name"]
            ).first()
            
            if existing:
                print(f"  跳过: '{video_data['name']}' 已存在")
            else:
                new_video = VideoDevice(**video_data)
                db.add(new_video)
                added_count += 1
                print(f"  ✓ 添加: '{video_data['name']}'")
        
        # 提交事务
        db.commit()
        print(f"\n✓ 成功添加 {added_count} 个视频设备")
        
        # 查询并显示所有数据
        print("\n" + "="*60)
        print("当前数据库中的所有视频设备:")
        print("="*60)
        all_videos = db.query(VideoDevice).all()
        
        for video in all_videos:
            print(f"\nID: {video.id}")
            print(f"  名称: {video.name}")
            print(f"  IP地址: {video.ip_address}:{video.port}")
            print(f"  流地址: {video.stream_url}")
            print(f"  位置: ({video.latitude}, {video.longitude})")
            print(f"  状态: {video.status}")
            print(f"  备注: {video.remark}")
        
        print("\n" + "="*60)
        print("测试数据初始化完成!")
        print("="*60)
        print(f"总计: {len(all_videos)} 个视频设备")
        
    except Exception as e:
        print(f"\n✗ 错误: {str(e)}")
        db.rollback()
    finally:
        db.close()


def clear_test_data():
    """清空测试数据"""
    print("="*60)
    print("清空视频设备测试数据")
    print("="*60)
    
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        count = db.query(VideoDevice).count()
        print(f"\n当前有 {count} 个视频设备")
        
        confirm = input("\n确认要删除所有视频设备吗? (yes/no): ")
        if confirm.lower() == 'yes':
            db.query(VideoDevice).delete()
            db.commit()
            print("✓ 已删除所有视频设备")
        else:
            print("操作已取消")
    except Exception as e:
        print(f"✗ 错误: {str(e)}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    import sys
    
    print("""
╔════════════════════════════════════════════════════════╗
║          视频设备数据库测试工具                        ║
╚════════════════════════════════════════════════════════╝
    """)
    
    print("选择操作:")
    print("  1. 初始化测试数据")
    print("  2. 清空测试数据")
    print("  0. 退出")
    
    choice = input("\n请输入选项 (0-2): ")
    
    if choice == "1":
        init_test_data()
    elif choice == "2":
        clear_test_data()
    else:
        print("退出")
