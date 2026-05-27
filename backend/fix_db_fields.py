import sys
sys.path.insert(0, '.')

from sqlalchemy import create_engine, text

SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:1234@127.0.0.1:3306/company-management?charset=utf8mb4"
engine = create_engine(SQLALCHEMY_DATABASE_URL)

with engine.connect() as conn:
    print("=" * 60)
    print("修复 branches 表字段")
    print("=" * 60)
    
    try:
        conn.execute(text("ALTER TABLE branches ADD COLUMN lng DECIMAL(10,6)"))
        conn.execute(text("ALTER TABLE branches ADD COLUMN lat DECIMAL(10,6)"))
        print("✅ 已添加 branches 表 lng/lat 字段")
    except Exception as e:
        print("ℹ️ branches 表字段已存在")
    
    branch_coords = [
        (1, 108.9398, 34.3416),  # 西安
        (2, 116.4074, 39.9042),  # 北京
        (3, 121.4737, 31.2304),  # 上海
        (4, 113.2644, 23.1291),  # 广州
        (5, 104.0668, 30.5728),  # 成都
        (6, 114.3054, 30.5931),  # 武汉
        (7, 123.4328, 41.8045),  # 沈阳
        (8, 118.7969, 32.0603),  # 南京
        (9, 114.0579, 22.5431),  # 深圳
        (10, 106.5516, 29.5630), # 重庆
    ]
    
    for bid, lng, lat in branch_coords:
        conn.execute(text(f"UPDATE branches SET lng = {lng}, lat = {lat} WHERE id = {bid}"))
    
    conn.commit()
    result = conn.execute(text("SELECT COUNT(*) FROM branches WHERE lng IS NOT NULL AND lat IS NOT NULL"))
    print(f"✅ 已更新 {result.scalar()} 个分公司坐标数据")
    
    print("\n" + "=" * 60)
    print("修复 devices 表字段")
    print("=" * 60)
    
    try:
        conn.execute(text("ALTER TABLE devices ADD COLUMN lng DECIMAL(10,6)"))
        conn.execute(text("ALTER TABLE devices ADD COLUMN lat DECIMAL(10,6)"))
        print("✅ 已添加 devices 表 lng/lat 字段")
    except Exception as e:
        print("ℹ️ devices 表字段已存在")
    
    print("\n" + "=" * 60)
    print("按分公司统计项目数量")
    print("=" * 60)
    
    result = conn.execute(text("""
        SELECT b.id, b.name, COUNT(p.id) as project_count
        FROM branches b
        LEFT JOIN projects p ON b.id = p.branch_id
        GROUP BY b.id, b.name
    """))
    
    print("\n 分公司ID | 分公司名称 | 绑定项目数")
    print("-" * 50)
    for row in result:
        print(f" {row[0]:>6d}   | {row[1]:<10s} | {row[2]:>6d} 个")
    
    print("\n" + "=" * 60)
    print("✅ 数据库修复完成!")
    print("💡 现在刷新前端页面,F12 Console 查看地图数据")
