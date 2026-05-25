from sqlalchemy import create_engine


from sqlalchemy.orm import sessionmaker


import sys


import os


import math


from datetime import datetime





# Add backend directory to sys.path


sys.path.append(os.path.join(os.getcwd(), "backend"))





from app.core.database import SQLALCHEMY_DATABASE_URL


from app.core.database import Base


from app.models.admin_user import User


from app.models.alarm_records import AlarmRecord


from app.models.device import Device


from app.models.fence import ElectronicFence, ProjectRegion, FenceShape, AlarmLevel


from app.models.group_call import GroupCallSession


from app.models.video import VideoDevice


from app.models.project import Project


from app.models.branches import Branch





def reset_database():


    # confirm = input("DANGER: This will delete ALL tables in the database. Type 'DELETE' to confirm: ")


    # if confirm != "DELETE":


    #     print("Operation cancelled.")


    #     return


    print("Auto-confirming database reset...")





    engine = create_engine(SQLALCHEMY_DATABASE_URL)


    


    print("Dropping all tables...")


    Base.metadata.drop_all(bind=engine)


    print("All tables dropped successfully.")


    


    print("Creating all tables...")


    Base.metadata.create_all(bind=engine)


    print("All tables created successfully.")





    SessionLocal = sessionmaker(bind=engine)


    session = SessionLocal()


    try:


        devices = []


        # Center: User requested (109.13, 34.28)


        # GCJ-02 coordinates


        


        base_lat = 34.28


        base_lng = 109.13


        


        print(f"Base Coordinates: {base_lat}, {base_lng}")


        print("Initializing devices with nearby coordinates...")





        for i in range(1, 11):


            device_id = f"DEV-{i:04d}"


            


            # Place devices in a small circle around the base


            # Radius ~500m (approx 0.005 degrees)


            angle = (i / 10) * 2 * math.pi


            


            # Use deterministic offsets


            lat_offset = 0.005 * math.cos(angle)


            lng_offset = 0.005 * math.sin(angle)


            


            # Special case: Device 1 is EXACTLY at the center


            if i == 1:


                lat_offset = 0


                lng_offset = 0


                


            final_lat = base_lat + lat_offset


            final_lng = base_lng + lng_offset


            


            print(f"  {device_id}: {final_lat:.6f}, {final_lng:.6f}")





            devices.append(


                Device(


                    id=device_id,


                    device_name=f"Device {i}",


                    device_type="HELMET_CAM",


                    ip_address=f"192.168.1.{100 + i}",


                    port=8000,


                    stream_url=f"rtsp://192.168.1.{100 + i}/stream",


                    is_online=True, # Set to True so they appear active


                    last_latitude=final_lat,


                    last_longitude=final_lng


                )


            )


        session.add_all(devices)


        


        # Add initial branches


        branches_data = [


            Branch(id=1, province="北京", name="北京分公司", lng=116.4074, lat=39.9042, address="北京市朝阳区", project="北京大兴机场", manager="张三", phone="13800138000", device_count=10, status="正常"),


            Branch(id=2, province="上海", name="上海分公司", lng=121.4737, lat=31.2304, address="上海市浦东新区", project="上海中心大厦", manager="李四", phone="13900139000", device_count=5, status="正常"),


            Branch(id=3, province="广东", name="广东分公司", lng=113.2644, lat=23.1291, address="广州市天河区", project="广州塔", manager="王五", phone="13700137000", device_count=8, status="正常"),


        ]


        session.add_all(branches_data)


        session.flush()





        # Add initial admin user


        admin_user = User(


            id=1,


            username="admin",


            hashed_password="admin",  # 明文密码(当前系统使用明文比较)


            full_name="系统管理员",


            role="admin",


            department_id=None


        )


        session.add(admin_user)


        session.flush()





        # --- 以下代码已注释,不再生成初始项目、区域和围栏数据 ---


        """


        # Add initial project "一号桥" (Associated with Shanghai Branch id=2)


        project1 = Project(


            id=1,


            name="一号桥",


            description="",


            manager="",


            status="active",


            remark="",


            branch_id=2


        )


        project1.users.append(admin_user)


        # 将所有 10 个设备都关联到这个项目


        project1.devices = devices


        session.add(project1)


        session.flush()


        """





        # Add initial video device


        video_device = VideoDevice(


            id=3,


            name="11",


            ip_address="10.102.7.154",


            port=80,


            username="admin",


            password="Song@871023",


            stream_url="http://127.0.0.1:8001/live/11.flv",


            status="online",


            is_active=1


        )


        session.add(video_device)


        


        # --- 以下代码已注释,不再生成初始区域和围栏数据 ---


        """


        # Add initial project regions


        regions = [


            ProjectRegion(


                id=1,


                name="1号施工区",


                coordinates_json='[[34.283, 109.125], [34.276, 109.122], [34.273, 109.132], [34.277, 109.136], [34.279, 109.136]]',


                remark="",


                project_id=1


            ),


            ProjectRegion(


                id=2,


                name="2号施工区",


                coordinates_json='[[34.272, 109.131], [34.266, 109.127], [34.265, 109.141]]',


                remark="",


                project_id=1


            )


        ]


        session.add_all(regions)


        session.flush() 


        


        # Add initial electronic fence


        fence = ElectronicFence(


            id=1,


            name="1号围栏",


            project_region_id=1,


            shape=FenceShape.POLYGON,


            behavior="No Entry",


            coordinates_json='[[34.279, 109.125], [34.279, 109.124], [34.278, 109.124], [34.275, 109.127], [34.276, 109.128]]',


            radius=80,


            effective_time="00:00-23:59",


            worker_count=2,


            remark="",


            alarm_type=AlarmLevel.MEDIUM,


            is_active=1


        )


        session.add(fence)


        session.flush() # Ensure fence id=1 exists


        """





        # --- 以下代码已注释,不再生成初始报警记录(因为相关的围栏已被注释,外键约束会失败) ---


        """


        # Add initial alarm records


        alarms = [


            AlarmRecord(


                id=1,


                alarm_type="电子围栏越界",


                severity="medium",


                timestamp=datetime.strptime("2026-01-16 08:13:58", "%Y-%m-%d %H:%M:%S"),


                description="Device Device 1 left designated area: 1号围栏",


                status="pending",


                location="1号围栏 31.230400, 121.474000",


                device_id="DEV-0001",


                fence_id=1


            ),


            AlarmRecord(


                id=2,


                alarm_type="电子围栏越界",


                severity="medium",


                timestamp=datetime.strptime("2026-01-16 08:13:58", "%Y-%m-%d %H:%M:%S"),


                description="Device Device 3 left designated area: 1号围栏",


                status="pending",


                location="1号围栏 31.228900, 121.478000",


                device_id="DEV-0003",


                fence_id=1


            ),


            AlarmRecord(


                id=3,


                alarm_type="电子围栏越界",


                severity="medium",


                timestamp=datetime.strptime("2026-01-16 08:13:58", "%Y-%m-%d %H:%M:%S"),


                description="Device Device 4 left designated area: 1号围栏",


                status="pending",


                location="1号围栏 31.226400, 121.477000",


                device_id="DEV-0004",


                fence_id=1


            ),


            AlarmRecord(


                id=4,


                alarm_type="电子围栏越界",


                severity="medium",


                timestamp=datetime.strptime("2026-01-16 08:13:58", "%Y-%m-%d %H:%M:%S"),


                description="Device Device 5 left designated area: 1号围栏",


                status="pending",


                location="1号围栏 31.225400, 121.474000",


                device_id="DEV-0005",


                fence_id=1


            ),


            AlarmRecord(


                id=5,


                alarm_type="电子围栏越界",


                severity="medium",


                timestamp=datetime.strptime("2026-01-16 08:13:58", "%Y-%m-%d %H:%M:%S"),


                description="Device Device 8 left designated area: 1号围栏",


                status="pending",


                location="1号围栏 31.231900, 121.469000",


                device_id="DEV-0008",


                fence_id=1


            )


        ]


        session.add_all(alarms)


        """


        





        








        session.commit()


        print("Seeded 1 admin user, 10 devices, 1 video device, 1 project (一号桥), 2 project regions, 1 fence, and 5 alarm records.")


        print("✅ Project management data seeded and associated successfully.")


        print("\\n=== Default Admin Account ===")


        print("Username: admin")


        print("Password: admin")


        print("=============================\\n")


    finally:


        session.close()





if __name__ == "__main__":


    reset_database()