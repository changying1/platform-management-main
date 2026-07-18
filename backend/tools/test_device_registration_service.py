import unittest
import sys
from pathlib import Path
from types import SimpleNamespace


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.schemas.device_registration_schema import CameraRegistrationRequest, RegistrationStepResult
from app.services.device_registration.device_registration_service import DeviceRegistrationService


class FakeCollection:
    def find_one(self, *args, **kwargs):
        return None


class FakeVideoService:
    def __init__(self):
        self.created_payload = None

    def _video_collection(self):
        return FakeCollection()

    def create_video(self, mongo_db, payload, scope_fields=None):
        self.created_payload = payload
        return {"id": "video-1"}


class FakeEzvizService:
    def __init__(self):
        self.calls = []

    def register_device(self, device_serial, camera_password):
        self.calls.append((device_serial, camera_password))
        return RegistrationStepResult(status="success", success=True, message="ezviz ok")


class FakeHikiotService:
    def __init__(self):
        self.calls = []

    def register_sim_card(self, iccid, remark):
        self.calls.append({"iccid": iccid, "remark": remark})
        return RegistrationStepResult(status="success", success=True, message="hikiot ok")


class FakeRepository:
    def __init__(self):
        self.saved = None

    def save_record(self, **kwargs):
        self.saved = kwargs


class DeviceRegistrationServiceTest(unittest.TestCase):
    def _service(self):
        video_service = FakeVideoService()
        ezviz_service = FakeEzvizService()
        hikiot_service = FakeHikiotService()
        repository = FakeRepository()
        service = DeviceRegistrationService(
            video_service=video_service,
            ezviz_service=ezviz_service,
            hikiot_service=hikiot_service,
            repository=repository,
        )
        return SimpleNamespace(
            service=service,
            video_service=video_service,
            ezviz_service=ezviz_service,
            hikiot_service=hikiot_service,
            repository=repository,
        )

    def test_registers_hikiot_sim_card_after_local_and_ezviz_registration(self):
        fixture = self._service()
        request = CameraRegistrationRequest(
            name="camera-1",
            device_serial="TEST_DEVICE_SERIAL",
            camera_password="ABCDEF",
            sim_card_id="TEST_ICCID_VALUE",
        )

        result = fixture.service.create_and_register(None, request)

        self.assertTrue(result.success)
        self.assertEqual(result.local.status, "success")
        self.assertEqual(fixture.ezviz_service.calls, [("TEST_DEVICE_SERIAL", "ABCDEF")])
        self.assertEqual(
            fixture.hikiot_service.calls,
            [{"iccid": "TEST_ICCID_VALUE", "remark": "TEST_DEVICE_SERIAL"}],
        )
        self.assertEqual(result.hikiot.message, "hikiot ok")
        self.assertEqual(fixture.repository.saved["sim_card_id"], "TEST_ICCID_VALUE")

    def test_skips_hikiot_when_sim_card_id_is_empty(self):
        fixture = self._service()
        request = CameraRegistrationRequest(
            name="camera-1",
            device_serial="TEST_DEVICE_SERIAL",
            camera_password="ABCDEF",
        )

        result = fixture.service.create_and_register(None, request)

        self.assertTrue(result.success)
        self.assertEqual(result.hikiot.status, "skipped")
        self.assertEqual(fixture.hikiot_service.calls, [])


if __name__ == "__main__":
    unittest.main()
