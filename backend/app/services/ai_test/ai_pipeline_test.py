import time
import numpy as np

from app.services.ai_manager import ai_manager
from app.services.ai_test.fake_frame import generate_fake_frame

from app.models.fence import ElectronicFence
from app.core.database import SessionLocal
from app.models.device import Device


class AIPipelineTester:

    def __init__(self):
        self.ai_manager = ai_manager

    def run(self, device_id=1):
        """
        测试所有AI规则
        """

        print("===== AI系统链路测试开始 =====")

        frame = generate_fake_frame()

        for algo_key, handler in self.ai_manager.algo_handlers.items():

            print(f"测试算法: {algo_key}")

            try:
                is_alarm, details = handler(frame)

                if not details:
                    details = {
                        "type": f"TEST-{algo_key}",
                        "msg": "AI链路测试报警"
                    }

                img = self.ai_manager._save_alarm_image(frame, device_id, details)

                self.ai_manager._save_alarm_to_db(device_id, details, img)

                print(f"✅ {algo_key} 测试成功")

            except Exception as e:
                print(f"❌ {algo_key} 测试失败: {e}")

        print("===== AI系统链路测试结束 =====")


def ensure_test_device(device_id="TEST_DEVICE"):
    """
    确保数据库中存在测试设备
    """
    db = SessionLocal()

    try:
        device = db.query(Device).filter(Device.id == device_id).first()

        if device:
            print(f"测试设备已存在 id={device_id}")
            return device_id

        device = Device(
            id=device_id,
            device_name="AI_TEST_CAMERA",
            device_type="TEST_CAMERA",
            ip_address="127.0.0.1",
            port=8000,
            stream_url="rtsp://127.0.0.1/test",
            is_online=True
        )

        db.add(device)
        db.commit()

        print(f"创建测试设备 id={device_id}")

        return device_id

    finally:
        db.close()


if __name__ == "__main__":

    tester = AIPipelineTester()

    device_id = ensure_test_device(1)

    tester.run(device_id=device_id)

    print("ElectronicFence loaded")