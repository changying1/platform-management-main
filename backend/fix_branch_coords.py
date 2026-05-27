import sys
sys.path.insert(0, '.')

from sqlalchemy import create_engine, text

SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:1234@127.0.0.1:3306/company-management?charset=utf8mb4"
engine = create_engine(SQLALCHEMY_DATABASE_URL)

with engine.connect() as conn:
    print("=" * 60)
    print("Update branches coordinates")
    print("=" * 60)
    
    branch_coords = [
        (1, 108.9398, 34.3416),
        (2, 116.4074, 39.9042),
        (3, 121.4737, 31.2304),
        (4, 113.2644, 23.1291),
        (5, 104.0668, 30.5728),
        (6, 114.3054, 30.5931),
        (7, 123.4328, 41.8045),
        (8, 118.7969, 32.0603),
        (9, 114.0579, 22.5431),
        (10, 106.5516, 29.5630),
    ]
    
    for bid, lng, lat in branch_coords:
        conn.execute(text(f"UPDATE branches SET lng = {lng}, lat = {lat} WHERE id = {bid}"))
    
    conn.commit()
    result = conn.execute(text("SELECT COUNT(*) FROM branches WHERE lng IS NOT NULL AND lat IS NOT NULL"))
    print(f"Updated {result.scalar()} branches with coordinates")
    
    print("\n" + "=" * 60)
    print("Projects per Branch")
    print("=" * 60)
    
    result = conn.execute(text("""
        SELECT b.id, b.name, COUNT(p.id) as project_count
        FROM branches b
        LEFT JOIN projects p ON b.id = p.branch_id
        GROUP BY b.id, b.name
    """))
    
    print("\n  ID | Branch Name | Projects Count")
    print("-" * 50)
    for row in result:
        print(f" {row[0]:>3d} | {row[1]:<15s} | {row[2]:>6d}")
    
    print("\n" + "=" * 60)
    print("Done! Refresh frontend now")
