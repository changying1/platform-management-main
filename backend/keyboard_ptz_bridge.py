import json
import socket
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional, Any

import requests


# =========================
# 配置区
# =========================

# 键盘网络配置
LISTEN_IP = "0.0.0.0"
LISTEN_PORT = 52381
KEYBOARD_IP = "192.168.1.108"

# 默认先控制这台；前端可通过 HTTP 动态切换
DEFAULT_VIDEO_ID = 2

# 当前控制目标摄像头（会被前端动态修改）
current_video_id = DEFAULT_VIDEO_ID
current_video_id_lock = threading.Lock()

# 你现有后端地址
BACKEND_BASE_URL = "http://127.0.0.1:9000"

# 本地 HTTP 服务（供前端设置当前摄像头）
HTTP_LISTEN_IP = "127.0.0.1"
HTTP_LISTEN_PORT = 52382
# PTZ / Zoom 速度
PTZ_SPEED = 0.5

# 超时判定：连续多久没再收到方向包，就认为该停止
ACTION_TIMEOUT_SECONDS = 0.6

# 请求超时
HTTP_TIMEOUT_SECONDS = 3
CRUISE_TOGGLE_COOLDOWN_SECONDS = 1.0
last_cruise_toggle_ts = 0.0
last_cruise_toggle_lock = threading.Lock()

# 日志开关
DEBUG = True


# =========================
# 动作定义
# =========================

IDLE = "idle"
UP = "up"
DOWN = "down"
LEFT = "left"
RIGHT = "right"
ZOOM_IN = "zoom_in"
ZOOM_OUT = "zoom_out"
CRUISE_TOGGLE = "cruise_toggle"

VALID_ACTIONS = {IDLE, UP, DOWN, LEFT, RIGHT, ZOOM_IN, ZOOM_OUT, CRUISE_TOGGLE}


@dataclass
class PTZState:
    current_action: str = IDLE
    current_action_video_id: int = DEFAULT_VIDEO_ID
    last_action_packet_ts: float = 0.0
    last_raw_hex: str = ""


state = PTZState()
state_lock = threading.Lock()

# 复用连接
http = requests.Session()

def get_current_video_id() -> int:
    with current_video_id_lock:
        return current_video_id


def set_current_video_id(video_id: int):
    global current_video_id
    with current_video_id_lock:
        current_video_id = video_id


def build_ptz_start_url(video_id: int) -> str:
    return f"{BACKEND_BASE_URL}/video/ptz/{video_id}/start"


def build_ptz_stop_url(video_id: int) -> str:
    return f"{BACKEND_BASE_URL}/video/ptz/{video_id}/stop"


def build_zoom_start_url(video_id: int) -> str:
    return f"{BACKEND_BASE_URL}/video/zoom/{video_id}/start"


def build_zoom_stop_url(video_id: int) -> str:
    return f"{BACKEND_BASE_URL}/video/zoom/{video_id}/stop"


def build_presets_list_url(video_id: int) -> str:
    return f"{BACKEND_BASE_URL}/video/ptz/{video_id}/presets"


def build_presets_create_url(video_id: int) -> str:
    return f"{BACKEND_BASE_URL}/video/ptz/{video_id}/presets"

def build_cruise_start_current_url(video_id: int) -> str:
    return f"{BACKEND_BASE_URL}/video/ptz/{video_id}/cruise/start-current"


def build_cruise_stop_url(video_id: int) -> str:
    return f"{BACKEND_BASE_URL}/video/ptz/{video_id}/cruise/stop"


def build_cruise_status_url(video_id: int) -> str:
    return f"{BACKEND_BASE_URL}/video/ptz/{video_id}/cruise/status"

# =========================
# 工具函数
# =========================

def log(*args):
    if DEBUG:
        print("[keyboard-ptz]", *args)


def bytes_to_hex(data: bytes) -> str:
    return data.hex(" ")


def payload_tail(data: bytes, count: int = 10) -> bytes:
    if len(data) <= count:
        return data
    return data[-count:]


def _safe_json(resp: requests.Response) -> Any:
    try:
        return resp.json()
    except Exception:
        return None


def _preset_token_for_no(preset_no: int) -> str:
    # 给键盘预置点一个稳定 token，避免后端只认识 token 不认识编号
    return f"kb_{preset_no}"


def _preset_name_for_no(preset_no: int) -> str:
    # 名称就直接用编号字符串，便于后台查看
    return str(preset_no)


def call_ptz_start(direction: str, video_id: int):
    payload = {
        "direction": direction,
        "speed": PTZ_SPEED,
    }

    if direction in {ZOOM_IN, ZOOM_OUT}:
        url = build_zoom_start_url(video_id)
    else:
        url = build_ptz_start_url(video_id)

    try:
        r = http.post(url, json=payload, timeout=HTTP_TIMEOUT_SECONDS)
        log(f"START {direction} video_id={video_id} -> {r.status_code} {r.text[:200]}")
    except Exception as e:
        log(f"START {direction} video_id={video_id} failed:", repr(e))


def call_stop_for_action(action: str, video_id: int):
    if action in {ZOOM_IN, ZOOM_OUT}:
        url = build_zoom_stop_url(video_id)
    else:
        url = build_ptz_stop_url(video_id)

    try:
        r = http.post(url, timeout=HTTP_TIMEOUT_SECONDS)
        log(f"STOP {action} video_id={video_id} -> {r.status_code} {r.text[:200]}")
    except Exception as e:
        log(f"STOP {action} video_id={video_id} failed:", repr(e))


def list_presets(video_id: int) -> list[dict]:
    """
    后端返回 PTZPresetItem 列表，字段至少有:
      { "token": "...", "name": "..." }
    """
    try:
        r = http.get(build_presets_list_url(video_id), timeout=HTTP_TIMEOUT_SECONDS)
        if r.status_code != 200:
            log(f"LIST presets -> {r.status_code} {r.text[:200]}")
            return []

        data = _safe_json(r)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        return []
    except Exception as e:
        log("LIST presets failed:", repr(e))
        return []


def resolve_preset_token(video_id: int, preset_no: int) -> Optional[str]:
    items = list_presets(video_id)
    """
    把键盘编号 -> 后端 preset_token

    优先级：
    1) token == kb_{n}
    2) name == "{n}"
    3) 第 n 个预置点（兜底，按列表顺序）
    """
    if not items:
        return None

    wanted_token = _preset_token_for_no(preset_no)
    wanted_name = _preset_name_for_no(preset_no)

    # 1) 先按 token 精确匹配
    for item in items:
        token = str(item.get("token", "")).strip()
        if token == wanted_token:
            return token

    # 2) 再按 name 精确匹配
    for item in items:
        token = str(item.get("token", "")).strip()
        name = str(item.get("name", "")).strip()
        if name == wanted_name and token:
            return token

    # 3) 最后按顺序兜底（仅为兼容旧数据）
    idx = preset_no - 1
    if 0 <= idx < len(items):
        token = str(items[idx].get("token", "")).strip()
        return token or None

    return None


def delete_preset_by_token(video_id: int, preset_token: str) -> bool:
    url = f"{build_presets_list_url(video_id)}/{preset_token}"
    try:
        r = http.delete(url, timeout=HTTP_TIMEOUT_SECONDS)
        ok = r.status_code in (200, 204)
        log(f"DELETE preset token={preset_token} -> {r.status_code} {r.text[:200]}")
        return ok
    except Exception as e:
        log(f"DELETE preset token={preset_token} failed:", repr(e))
        return False


def create_preset(video_id: int, preset_no: int) -> bool:
    existing = resolve_preset_token(video_id, preset_no)
    if existing:
        delete_preset_by_token(video_id, existing)

    payload = {
        "name": _preset_name_for_no(preset_no),
        "token": _preset_token_for_no(preset_no),
    }

    try:
        r = http.post(build_presets_create_url(video_id), json=payload, timeout=HTTP_TIMEOUT_SECONDS)
        log(f"PRESET preset_set #{preset_no} video_id={video_id} -> {r.status_code} {r.text[:200]}")
        return r.status_code in (200, 201)
    except Exception as e:
        log(f"PRESET preset_set #{preset_no} video_id={video_id} failed:", repr(e))
        return False
        

def goto_preset(video_id: int, preset_no: int) -> bool:
    preset_token = resolve_preset_token(video_id, preset_no)
    if not preset_token:
        log(f"PRESET preset_call #{preset_no} video_id={video_id} failed: preset token not found")
        return False

    url = f"{build_presets_list_url(video_id)}/{preset_token}/goto"
    payload = {
        "speed": PTZ_SPEED,
    }

    try:
        r = http.post(url, json=payload, timeout=HTTP_TIMEOUT_SECONDS)
        log(f"PRESET preset_call #{preset_no} token={preset_token} video_id={video_id} -> {r.status_code} {r.text[:200]}")
        return r.status_code == 200
    except Exception as e:
        log(f"PRESET preset_call #{preset_no} video_id={video_id} failed:", repr(e))
        return False


def clear_preset(video_id: int, preset_no: int) -> bool:
    preset_token = resolve_preset_token(video_id, preset_no)
    if not preset_token:
        log(f"PRESET preset_clear #{preset_no} video_id={video_id} failed: preset token not found")
        return False

    return delete_preset_by_token(video_id, preset_token)


def call_preset_once(action: str, preset_no: int):
    video_id = get_current_video_id()

    if action == "preset_set":
        create_preset(video_id, preset_no)
        return

    if action == "preset_call":
        goto_preset(video_id, preset_no)
        return

    if action == "preset_clear":
        clear_preset(video_id, preset_no)
        return

    log(f"unknown preset action: {action}")

def get_cruise_status(video_id: int) -> dict:
    try:
        r = http.get(build_cruise_status_url(video_id), timeout=HTTP_TIMEOUT_SECONDS)
        if r.status_code != 200:
            log(f"CRUISE status video_id={video_id} -> {r.status_code} {r.text[:200]}")
            return {"running": False}

        data = _safe_json(r)
        if isinstance(data, dict):
            return data
        return {"running": False}
    except Exception as e:
        log(f"CRUISE status video_id={video_id} failed:", repr(e))
        return {"running": False}


def start_current_cruise(video_id: int) -> bool:
    try:
        r = http.post(build_cruise_start_current_url(video_id), timeout=HTTP_TIMEOUT_SECONDS)
        log(f"CRUISE start-current video_id={video_id} -> {r.status_code} {r.text[:200]}")
        return 200 <= r.status_code < 300
    except Exception as e:
        log(f"CRUISE start-current video_id={video_id} failed:", repr(e))
        return False


def stop_cruise(video_id: int) -> bool:
    try:
        r = http.post(build_cruise_stop_url(video_id), timeout=HTTP_TIMEOUT_SECONDS)
        log(f"CRUISE stop video_id={video_id} -> {r.status_code} {r.text[:200]}")
        return 200 <= r.status_code < 300
    except Exception as e:
        log(f"CRUISE stop video_id={video_id} failed:", repr(e))
        return False


def toggle_cruise(video_id: int):
    status = get_cruise_status(video_id)
    running = bool(status.get("running"))

    if running:
        log(f"CRUISE toggle -> stop video_id={video_id}")
        stop_cruise(video_id)
        return

    log(f"CRUISE toggle -> start-current video_id={video_id}")
    start_current_cruise(video_id)

def trigger_cruise_toggle_once(video_id: int):
    global last_cruise_toggle_ts

    now = time.time()
    with last_cruise_toggle_lock:
        if now - last_cruise_toggle_ts < CRUISE_TOGGLE_COOLDOWN_SECONDS:
            log(f"CRUISE toggle ignored by cooldown video_id={video_id}")
            return
        last_cruise_toggle_ts = now

    toggle_cruise(video_id)

# =========================
# 报文识别
# =========================

def classify_packet(data: bytes) -> Optional[str]:
    """
    基于当前真实抓到的 payload 规则匹配：

    空闲:
      len=13
      尾部形如: 81 09 ?? ?? ff

    方向:
      len=17
      尾部形如: 81 01 06 01 a b c d ff

    结合抓包结果：
    - 垂直方向:
        a == 0 and c == 3 and d in (1, 2)
        d == 1 -> up
        d == 2 -> down
        b 为力度/速度，可变

    - 水平方向:
        b == 0 and d == 3 and c in (1, 2)
        c == 1 -> left
        c == 2 -> right
        a 为力度/速度，可变
    """
    data_len = len(data)

    # 1) 空闲/停止态
    if data_len == 13:
        if data[8] == 0x81 and data[9] == 0x09 and data[12] == 0xFF:
            return IDLE
        return None

    # 2) 方向动作
    if data_len == 17:
        if not (
            data[8] == 0x81 and
            data[9] == 0x01 and
            data[10] == 0x06 and
            data[11] == 0x01 and
            data[16] == 0xFF
        ):
            return None

        a = data[12]
        b = data[13]
        c = data[14]
        d = data[15]

        # 垂直方向：00 speed 03 dir
        if a == 0x00 and c == 0x03:
            if d == 0x01:
                return UP
            if d == 0x02:
                return DOWN

        # 水平方向：speed 00 dir 03
        if b == 0x00 and d == 0x03:
            if c == 0x01:
                return LEFT
            if c == 0x02:
                return RIGHT

        return None

    return None


def classify_zoom_packet(data: bytes) -> Optional[str]:
    """
    识别末尾 VISCA zoom 命令:
      81 01 04 07 2x ff   -> zoom_in
      81 01 04 07 3x ff   -> zoom_out
      81 01 04 07 00 ff   -> idle
    """
    if len(data) < 6:
        return None

    tail = data[-6:]

    if (
        tail[0] != 0x81 or
        tail[1] != 0x01 or
        tail[2] != 0x04 or
        tail[3] != 0x07 or
        tail[5] != 0xFF
    ):
        return None

    v = tail[4]

    if v == 0x00:
        return IDLE

    hi = v & 0xF0

    if hi == 0x20:
        return ZOOM_IN

    if hi == 0x30:
        return ZOOM_OUT

    return None


def classify_preset_packet(data: bytes):
    """
    实测最终映射：
      81 01 04 3f 00 nn ff -> preset_clear
      81 01 04 3f 01 nn ff -> preset_set
      81 01 04 3f 02 nn ff -> preset_call
    """
    if len(data) < 7:
        return None

    tail = data[-7:]

    if (
        tail[0] != 0x81 or
        tail[1] != 0x01 or
        tail[2] != 0x04 or
        tail[3] != 0x3F or
        tail[6] != 0xFF
    ):
        return None

    op = tail[4]
    preset_no = tail[5]

    if op == 0x00:
        return ("preset_clear", preset_no)

    if op == 0x01:
        return ("preset_set", preset_no)

    if op == 0x02:
        return ("preset_call", preset_no)

    return None

def classify_cruise_packet(data: bytes) -> Optional[str]:
    """
    巡航触发键：
      ... 81 01 04 38 02 ff
    """
    if len(data) < 6:
        return None

    tail = data[-6:]
    if tail == bytes.fromhex("81 01 04 38 02 ff"):
        return CRUISE_TOGGLE

    return None

# =========================
# 状态机（仅 PTZ / Zoom 用）
# =========================

def handle_action(new_action: str, raw_hex: str):
    now = time.time()

    need_stop = False
    need_start = None
    need_sleep_before_start = False
    stop_video_id = DEFAULT_VIDEO_ID
    start_video_id = DEFAULT_VIDEO_ID

    with state_lock:
        old_action = state.current_action
        old_video_id = state.current_action_video_id
        state.last_raw_hex = raw_hex

        # 空闲包
        if new_action == IDLE:
            state.last_action_packet_ts = now
            if old_action != IDLE:
                log(f"transition: {old_action} -> idle")
                state.current_action = IDLE
                state.current_action_video_id = get_current_video_id()
                need_stop = True
                stop_video_id = old_video_id

        else:
            state.last_action_packet_ts = now
            target_video_id = get_current_video_id()

            # 同方向持续包：只更新时间，不重复发 start
            if old_action == new_action and old_video_id == target_video_id:
                return

            # 从一个方向切到另一个方向：先 stop 再 start
            if old_action != IDLE and (old_action != new_action or old_video_id != target_video_id):
                log(f"transition: {old_action}@{old_video_id} -> {new_action}@{target_video_id} (stop then start)")
                state.current_action = new_action
                state.current_action_video_id = target_video_id
                need_stop = True
                stop_video_id = old_video_id
                need_start = new_action
                start_video_id = target_video_id
                need_sleep_before_start = True

            # 从 idle 到方向
            elif old_action == IDLE:
                log(f"transition: {old_action} -> {new_action}@{target_video_id}")
                state.current_action = new_action
                state.current_action_video_id = target_video_id
                need_start = new_action
                start_video_id = target_video_id

    # 锁外执行网络请求和 sleep
    if need_stop:
        call_stop_for_action(old_action, stop_video_id)

    if need_sleep_before_start:
        time.sleep(0.05)

    if need_start:
        call_ptz_start(need_start, start_video_id)


def watchdog_loop():
    while True:
        time.sleep(0.1)

        should_stop = False
        old_action = IDLE
        old_video_id = DEFAULT_VIDEO_ID

        with state_lock:
            current_action = state.current_action
            last_ts = state.last_action_packet_ts

            if current_action != IDLE and time.time() - last_ts > ACTION_TIMEOUT_SECONDS:
                old_action = current_action
                old_video_id = state.current_action_video_id
                state.current_action = IDLE
                state.current_action_video_id = get_current_video_id()
                should_stop = True

        if should_stop:
            log(f"watchdog timeout: {old_action}@{old_video_id} -> idle")
            call_stop_for_action(old_action, old_video_id)

# =========================
# 本地 HTTP 服务（供前端设置当前摄像头）
# =========================

class KeyboardHttpHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/keyboard/target":
            self._send_json(200, {
                "video_id": get_current_video_id(),
                "status": "ok",
            })
            return

        self._send_json(404, {"detail": "Not Found"})

    def do_POST(self):
        if self.path != "/keyboard/target":
            self._send_json(404, {"detail": "Not Found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send_json(400, {"detail": "Invalid JSON"})
            return

        video_id = data.get("video_id")
        if not isinstance(video_id, int) or video_id <= 0:
            self._send_json(400, {"detail": "video_id must be a positive integer"})
            return

        set_current_video_id(video_id)
        log(f"keyboard target updated -> video_id={video_id}")

        self._send_json(200, {
            "status": "ok",
            "video_id": video_id,
        })

    def log_message(self, format, *args):
        if DEBUG:
            log("http:", format % args)


def http_server():
    server = ThreadingHTTPServer((HTTP_LISTEN_IP, HTTP_LISTEN_PORT), KeyboardHttpHandler)
    log(f"http listening {HTTP_LISTEN_IP}:{HTTP_LISTEN_PORT}")
    server.serve_forever()

# =========================
# UDP 监听
# =========================

def udp_server():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((LISTEN_IP, LISTEN_PORT))
    log(f"listening udp {LISTEN_IP}:{LISTEN_PORT}")

    while True:
        data, addr = sock.recvfrom(4096)
        src_ip, src_port = addr

        # 只接键盘 IP
        if src_ip != KEYBOARD_IP:
            continue

        action = classify_packet(data)
        if action is None:
            action = classify_zoom_packet(data)
        if action is None:
            action = classify_preset_packet(data)
        if action is None:
            action = classify_cruise_packet(data)

        raw_hex = bytes_to_hex(data)

        if action is None:
            if DEBUG:
                log(f"unknown packet len={len(data)} from {src_ip}:{src_port} hex={raw_hex}")
            continue

        # 预置点是一次性命令，不走持续动作状态机
        if isinstance(action, tuple):
            preset_action, preset_no = action
            if DEBUG:
                log(
                    f"matched preset action={preset_action} "
                    f"preset_no={preset_no} len={len(data)} hex={raw_hex}"
                )
            call_preset_once(preset_action, preset_no)
            continue

        if action == CRUISE_TOGGLE:
            if DEBUG:
                log(f"matched cruise toggle len={len(data)} hex={raw_hex}")
            video_id = get_current_video_id()
            trigger_cruise_toggle_once(video_id)
            continue

        # PTZ / zoom 还是走原来的状态机
        if DEBUG:
            log(f"matched action={action} len={len(data)} hex={raw_hex}")

        handle_action(action, raw_hex)


def main():
    t_watchdog = threading.Thread(target=watchdog_loop, daemon=True)
    t_watchdog.start()

    t_http = threading.Thread(target=http_server, daemon=True)
    t_http.start()

    udp_server()


if __name__ == "__main__":
    main()