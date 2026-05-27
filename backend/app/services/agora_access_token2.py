import base64
import hmac
import random
import struct
import time
import zlib
from collections import OrderedDict
from hashlib import sha256


ROLE_PUBLISHER = 1


def _pack_uint16(value: int) -> bytes:
    return struct.pack("<H", int(value))


def _pack_uint32(value: int) -> bytes:
    return struct.pack("<I", int(value))


def _pack_string(value: bytes) -> bytes:
    return _pack_uint16(len(value)) + value


def _pack_map_uint32(value: dict[int, int]) -> bytes:
    return _pack_uint16(len(value)) + b"".join(
        _pack_uint16(key) + _pack_uint32(item) for key, item in value.items()
    )


class _Service:
    def __init__(self, service_type: int):
        self._type = service_type
        self._privileges: dict[int, int] = {}

    def add_privilege(self, privilege: int, expire: int) -> None:
        self._privileges[privilege] = expire

    def service_type(self) -> int:
        return self._type

    def pack(self) -> bytes:
        privileges = OrderedDict(sorted(self._privileges.items(), key=lambda item: int(item[0])))
        return _pack_uint16(self._type) + _pack_map_uint32(privileges)


class _ServiceRtc(_Service):
    SERVICE_TYPE = 1
    PRIVILEGE_JOIN_CHANNEL = 1
    PRIVILEGE_PUBLISH_AUDIO_STREAM = 2
    PRIVILEGE_PUBLISH_VIDEO_STREAM = 3
    PRIVILEGE_PUBLISH_DATA_STREAM = 4

    def __init__(self, channel_name: str, uid: int):
        super().__init__(self.SERVICE_TYPE)
        self._channel_name = channel_name.encode("utf-8")
        self._uid = b"" if uid == 0 else str(uid).encode("utf-8")

    def pack(self) -> bytes:
        return super().pack() + _pack_string(self._channel_name) + _pack_string(self._uid)


class _AccessToken2:
    VERSION = "007"

    def __init__(self, app_id: str, app_certificate: str, expire_seconds: int):
        self._app_id = app_id
        self._app_certificate = app_certificate
        self._issue_ts = int(time.time())
        self._expire_seconds = int(expire_seconds)
        self._salt = random.randint(1, 99999999)
        self._services: dict[int, _Service] = {}

    def add_service(self, service: _Service) -> None:
        self._services[service.service_type()] = service

    def _valid_uuid(self, value: str) -> bool:
        if len(value) != 32:
            return False
        try:
            bytes.fromhex(value)
            return True
        except ValueError:
            return False

    def build(self) -> str:
        if not self._valid_uuid(self._app_id) or not self._valid_uuid(self._app_certificate):
            return ""
        if not self._services:
            return ""

        app_id = self._app_id.encode("utf-8")
        app_certificate = self._app_certificate.encode("utf-8")
        signing = hmac.new(_pack_uint32(self._issue_ts), app_certificate, sha256).digest()
        signing = hmac.new(_pack_uint32(self._salt), signing, sha256).digest()

        signing_info = (
            _pack_string(app_id)
            + _pack_uint32(self._issue_ts)
            + _pack_uint32(self._expire_seconds)
            + _pack_uint32(self._salt)
            + _pack_uint16(len(self._services))
        )
        for service_type in sorted(self._services.keys()):
            signing_info += self._services[service_type].pack()

        signature = hmac.new(signing, signing_info, sha256).digest()
        payload = zlib.compress(_pack_string(signature) + signing_info)
        return self.VERSION + base64.b64encode(payload).decode("utf-8")


def build_rtc_token_with_uid(
    app_id: str,
    app_certificate: str,
    channel_name: str,
    uid: int,
    expire_seconds: int,
) -> str:
    token = _AccessToken2(app_id, app_certificate, expire_seconds)
    rtc_service = _ServiceRtc(channel_name, uid)
    rtc_service.add_privilege(_ServiceRtc.PRIVILEGE_JOIN_CHANNEL, expire_seconds)
    rtc_service.add_privilege(_ServiceRtc.PRIVILEGE_PUBLISH_AUDIO_STREAM, expire_seconds)
    rtc_service.add_privilege(_ServiceRtc.PRIVILEGE_PUBLISH_VIDEO_STREAM, expire_seconds)
    rtc_service.add_privilege(_ServiceRtc.PRIVILEGE_PUBLISH_DATA_STREAM, expire_seconds)
    token.add_service(rtc_service)
    return token.build()
