import sys
sys.path.insert(0, '.')

from sqlalchemy import create_engine, text

SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:1234@127.0.0.1:3306/company-management?charset=utf8mb4"
engine = create_engine(SQLALCHEMY_DATABASE_URL)

with engine.connect() as conn:
    print("=" * 60)
    print("检查当前数据库数据")
    print("=" * 60)
    
    result = conn.execute(text("SELECT COUNT(*) as cnt FROM projects"))
    project_count = result.scalar()
    print(f"项目总数: {project_count}")
    
    result = conn.execute(text("SELECT COUNT(*) as cnt FROM projects WHERE longitude IS NOT NULL AND latitude IS NOT NULL"))
    project_with_coord = result.scalar()
    print(f"有坐标的项目数: {project_with_coord}")
    
    result = conn.execute(text("SELECT COUNT(*) as cnt FROM projects WHERE branch_id IS NOT NULL"))
    project_with_branch = result.scalar()
    print(f"有关联分公司的项目数: {project_with_branch}")
    
    print("\n" + "=" * 60)
    print("分公司数据")
    print("=" * 60)
    result = conn.execute(text("SELECT COUNT(*) as cnt FROM branches"))
    branch_count = result.scalar()
    print(f"分公司总数: {branch_count}")
    
    result = conn.execute(text("SELECT COUNT(*) as cnt FROM branches WHERE lng IS NOT NULL AND lat IS NOT NULL"))
    branch_with_coord = result.scalar()
    print(f"有坐标的分公司数: {branch_with_coord}")
    
    print("\n" + "=" * 60)
    print("设备数据")
    print("=" * 60)
    result = conn.execute(text("SELECT COUNT(*) as cnt FROM devices"))
    device_count = result.scalar()
    print(f"设备总数: {device_count}")
    
    result = conn.execute(text("SELECT COUNT(*) as cnt FROM devices WHERE lng IS NOT NULL AND lat IS NOT NULL"))
    device_with_coord = result.scalar()
    print(f"有坐标的设备数: {device_with_coord}")
    
    result = conn.execute(text("""
        SELECT device_type, COUNT(*) as cnt 
        FROM devices 
        WHERE lng IS NOT NULL AND lat IS NOT NULL
        GROUP BY device_type
    """))
    print("\n按类型统计定位设备:")
    for row in result:
        print(f"  {row[0] or '空'}: {row[1]} 个")
    
    print("\n" + "=" * 60)
    
    if project_with_coord == 0 and project_count > 0:
        print("⚠️  项目没有坐标数据！正在自动修复...")
        conn.execute(text("""
            UPDATE projects p
            JOIN branches b ON p.branch_id = b.id
            SET p.longitude = b.lng, p.latitude = b.lat
            WHERE p.longitude IS NULL OR p.latitude IS NULL
        """))
        conn.commit()
        print("✅ 已使用分公司坐标填充项目坐标")
    
    if project_with_branch < project_count:
        print("⚠️  部分项目没有分公司关联！")
        conn.execute(text("UPDATE projects SET branch_id = 1 WHERE branch_id IS NULL"))
        conn.commit()
        print("✅ 已将无分公司项目默认关联到总公司")
    
    print("\n✅ 数据检查完成！")
    print("\n💡 现在刷新前端页面，按 F12 看 Console 的 🗺️ 地图数据调试输出")
