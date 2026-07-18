# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import sys
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import Mock, patch

from openpyxl import load_workbook


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.device_registration.hikiot_registration_service import (  # noqa: E402
    HikiotRegistrationService,
    build_import_excel,
)


TEST_ICCID = "TEST_ICCID_VALUE"
TEST_SERIAL = "TEST_DEVICE_SERIAL"


class FakeVideoService:
    def _get_hikiot_config(self, force_login: bool = False):
        return "https://api.hikiot.com", "Bearer test-token", "__UNI__3109F91", "2"


class FakeAuthService:
    def __init__(self, tokens=None):
        self.tokens = list(tokens or [])
        self.force_refresh_calls = 0
        self.clear_calls = 0

    def get_token(self, *, force_refresh: bool = False):
        if force_refresh:
            self.force_refresh_calls += 1
        if self.tokens:
            return self.tokens.pop(0)
        return ""

    def clear_token(self):
        self.clear_calls += 1


def response(status_code: int, body: dict):
    mock = Mock()
    mock.status_code = status_code
    mock.json.return_value = body
    return mock


class HikiotRegistrationServiceTest(unittest.TestCase):
    def setUp(self):
        self.env_patch = patch.dict(os.environ, {"HIKIOT_BEARER_TOKEN": "test-token"}, clear=False)
        self.env_patch.start()
        self.service = HikiotRegistrationService(video_service=FakeVideoService())
        self.service.timeout_seconds = 1

    def tearDown(self):
        self.env_patch.stop()

    def test_build_import_excel_template(self):
        excel_bytes = build_import_excel(TEST_ICCID, TEST_SERIAL)
        workbook = load_workbook(BytesIO(excel_bytes))
        sheet = workbook["物卡导入"]

        self.assertEqual(sheet["A1"].value, "*卡号")
        self.assertEqual(sheet["B1"].value, "备注")
        self.assertEqual(sheet["A2"].value, TEST_ICCID)
        self.assertEqual(sheet["B2"].value, TEST_SERIAL)

    def test_import_uses_file_field_and_removes_json_content_type(self):
        body = {
            "code": 0,
            "msg": "操作成功！",
            "data": {
                "successCount": 1,
                "errorCount": 0,
                "successDataList": [{"data": {"iccid": TEST_ICCID}}],
                "errorDataList": [],
            },
        }

        with patch("app.services.device_registration.hikiot_registration_service.requests.post") as post:
            post.return_value = response(200, body)
            result = self.service.import_card(TEST_ICCID, TEST_SERIAL, b"xlsx-bytes")

        self.assertTrue(result["success"])
        kwargs = post.call_args.kwargs
        self.assertIn("files", kwargs)
        self.assertIn("file", kwargs["files"])
        self.assertEqual(kwargs["files"]["file"][0], "物卡导入.xlsx")
        self.assertNotEqual(kwargs["headers"].get("Content-Type"), "application/json")

    def test_parse_import_success_response(self):
        result = HikiotRegistrationService.parse_import_response(
            200,
            {
                "code": 0,
                "msg": "操作成功！",
                "data": {
                    "totalCount": 1,
                    "successCount": 1,
                    "errorCount": 0,
                    "errorDataList": [],
                    "successDataList": [{"data": {"iccid": TEST_ICCID}}],
                },
            },
            TEST_ICCID,
        )

        self.assertTrue(result["success"])
        self.assertFalse(result["already_exists"])

    def test_parse_remark_success_response(self):
        result = HikiotRegistrationService.parse_remark_response(200, {"code": 0, "msg": "操作成功！", "data": True})

        self.assertTrue(result["success"])

    def test_existing_card_becomes_idempotent_success_after_query_verification(self):
        import_body = {
            "code": 0,
            "msg": "操作成功！",
            "data": {
                "successCount": 0,
                "errorCount": 1,
                "successDataList": [],
                "errorDataList": [{"errorMsg": "卡号已存在"}],
            },
        }
        remark_body = {"code": 0, "msg": "操作成功！", "data": True}
        page_body = {
            "code": 0,
            "msg": "操作成功！",
            "data": {
                "records": [{"iccid": TEST_ICCID, "remark": TEST_SERIAL}],
                "total": 1,
                "pages": 1,
            },
        }

        with patch("app.services.device_registration.hikiot_registration_service.requests.post") as post, patch(
            "app.services.device_registration.hikiot_registration_service.requests.get"
        ) as get:
            post.side_effect = [response(200, import_body), response(200, remark_body)]
            get.return_value = response(200, page_body)
            result = self.service.register_sim_card(TEST_ICCID, TEST_SERIAL)

        self.assertTrue(result.success)
        self.assertEqual(result.status, "success")
        self.assertIn("已存在", result.message)

    def test_error_count_extracts_error_reason(self):
        result = HikiotRegistrationService.parse_import_response(
            200,
            {
                "code": 0,
                "msg": "操作成功！",
                "data": {
                    "successCount": 0,
                    "errorCount": 1,
                    "successDataList": [],
                    "errorDataList": [{"errorMsg": "卡号格式错误"}],
                },
            },
            TEST_ICCID,
        )

        self.assertFalse(result["success"])
        self.assertFalse(result["already_exists"])
        self.assertIn("卡号格式错误", result["message"])

    def test_find_card_searches_next_page(self):
        page_1 = {
            "code": 0,
            "msg": "操作成功！",
            "data": {
                "records": [{"iccid": "8986000000000000001", "remark": "other"}],
                "total": 2,
                "pages": 2,
            },
        }
        page_2 = {
            "code": 0,
            "msg": "操作成功！",
            "data": {
                "records": [{"iccid": TEST_ICCID, "remark": TEST_SERIAL}],
                "total": 2,
                "pages": 2,
            },
        }

        with patch("app.services.device_registration.hikiot_registration_service.requests.get") as get:
            get.side_effect = [response(200, page_1), response(200, page_2)]
            card = self.service.find_card(TEST_ICCID)

        self.assertIsNotNone(card)
        self.assertEqual(card["iccid"], TEST_ICCID)
        self.assertEqual(get.call_count, 2)

    def test_build_headers_prefers_login_token_over_static_token(self):
        service = HikiotRegistrationService(video_service=FakeVideoService(), auth_service=FakeAuthService(["login-token"]))

        headers = service._build_headers(content_type=None)

        self.assertEqual(headers["Authorization"], "Bearer login-token")

    def test_build_headers_falls_back_to_static_token_when_login_fails(self):
        service = HikiotRegistrationService(video_service=FakeVideoService(), auth_service=FakeAuthService([""]))

        headers = service._build_headers(content_type=None)

        self.assertEqual(headers["Authorization"], "Bearer test-token")

    def test_import_retries_once_with_refreshed_token_after_401(self):
        body = {
            "code": 0,
            "msg": "ok",
            "data": {
                "successCount": 1,
                "errorCount": 0,
                "successDataList": [{"data": {"iccid": TEST_ICCID}}],
                "errorDataList": [],
            },
        }
        auth_service = FakeAuthService(["expired-token", "fresh-token"])
        service = HikiotRegistrationService(video_service=FakeVideoService(), auth_service=auth_service)

        with patch("app.services.device_registration.hikiot_registration_service.requests.post") as post:
            post.side_effect = [response(401, {"msg": "Invalid access token"}), response(200, body)]
            result = service.import_card(TEST_ICCID, TEST_SERIAL, b"xlsx-bytes")

        self.assertTrue(result["success"])
        self.assertEqual(post.call_count, 2)
        self.assertEqual(auth_service.clear_calls, 1)
        self.assertEqual(auth_service.force_refresh_calls, 1)
        self.assertEqual(post.call_args_list[1].kwargs["headers"]["Authorization"], "Bearer fresh-token")


if __name__ == "__main__":
    unittest.main()
