"""
JT808 协议定位服务
负责接收 JT808 定位终端的 TCP 连接，解析注册/鉴权/心跳/位置上报等消息，
将实时坐标(WGS84→GCJ02纠偏)保存到内存 device_store 中，
供 fence_controller 的 GET /fence/devices 接口读取并合并。
"""
import socket
import struct
import threading
import time
import random
from typing import Any
from app.utils.logger import get_logger
from app.utils.coord_transform import wgs84_to_gcj02
<<<<<<< HEAD
from app.core.database import SessionLocal
from app.models.location_history import DeviceLocationHistory
from datetime import datetime
import uuid
=======
from app.services.Device.device_service import device_service
from app.schemas.device_schema import TrajectoryPoint
>>>>>>> f687e38f23a292c399d3be1f24666c041a7cfa45

logger = get_logger("JT808")


# ============================================================
#  JT808 协议工具函数
# ============================================================

class JT808Packet:
    @staticmethod
    def get_checksum(data: bytes) -> int:
        checksum = 0
        for b in data:
            checksum ^= b
        return checksum

    @staticmethod
    def escape(data: bytes) -> bytes:
        res = bytearray()
        for b in data:
            if b == 0x7e:
                res.extend([0x7d, 0x02])
            elif b == 0x7d:
                res.extend([0x7d, 0x01])
            else:
                res.append(b)
        return bytes(res)

    @staticmethod
    def pack(msg_id: int, phone: str, seq: int, body: bytes) -> bytes:
        msg_attr = len(body) & 0x03FF
        phone_bcd = bytes.fromhex(phone.zfill(12))
        header = struct.pack('>H H 6s H', msg_id, msg_attr, phone_bcd, seq)
        content = header + body
        checksum = JT808Packet.get_checksum(content)
        escaped = JT808Packet.escape(content + bytes([checksum]))
        return b'\x7e' + escaped + b'\x7e'


def unescape(data: bytes) -> bytes:
    """反转义 JT808 数据帧"""
    res = bytearray()
    i = 0
    while i < len(data):
        if data[i] == 0x7d and i + 1 < len(data):
            if data[i + 1] == 0x01:
                res.append(0x7d); i += 2
            elif data[i + 1] == 0x02:
                res.append(0x7e); i += 2
            else:
                res.append(data[i]); i += 1
        else:
            res.append(data[i]); i += 1
    return bytes(res)


def generate_8001_reply(msg_id, phone, seq, result=0):
    """平台通用应答 (0x8001)"""
    target_id = int(msg_id, 16) if isinstance(msg_id, str) else msg_id
    body = struct.pack('>H H B', seq, target_id, result)
    return JT808Packet.pack(0x8001, phone, 0, body)


def generate_8100_reply(phone, seq, auth_code="AUTH123456"):
    """终端注册应答 (0x8100)"""
    result = 0
    material = struct.pack('>H B', seq, result) + auth_code.encode('gbk')
    return JT808Packet.pack(0x8100, phone, 0, material)


def generate_8300_tts_command(phone: str, seq: int, text: str):
    """文本信息下发 (0x8300)，启用终端 TTS 播读。"""
    flag = 0x08
    text_bytes = text.encode("gbk")
    body = struct.pack('>B', flag) + text_bytes
    return JT808Packet.pack(0x8300, phone, seq, body)


# ============================================================
#  JT808 管理器（单例）
# ============================================================

# 模拟室内跳动的随机坐标点（西安项目部附近）
RANDOM_COORDS = [
    (34.284, 109.134), (34.2845, 109.1345), (34.2835, 109.1335),
    (34.285, 109.135), (34.283, 109.133), (34.2842, 109.1348),
    (34.2838, 109.1332), (34.2855, 109.1325), (34.2825, 109.1355),
    (34.2848, 109.1338)
]

class JT808Manager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(JT808Manager, cls).__new__(cls)
                cls._instance._initialized = False
        return cls._instance

    def __init__(self, host='0.0.0.0', port=8989):
        self.host = host
        self.port = port
        self.running = False
        self.last_seen = {}       # {phone_num: timestamp} 记录最后活跃时间
        self.device_store = {}    # {phone_num: {实时数据字典}} 供外部读取
        self.active_connections = {}  # {phone_num: socket} 设备 TCP 连接
        self.device_seqs = {}     # {phone_num: int} 下发消息序列号
        self.connection_lock = threading.Lock()

    def unregister_connection(self, client_sock):
        with self.connection_lock:
            for phone, sock in list(self.active_connections.items()):
                if sock == client_sock:
                    del self.active_connections[phone]
                    logger.info(f"【连接断开】设备 {phone} 连接已清理")
                    break

    def get_next_seq(self, phone_num: str) -> int:
        with self.connection_lock:
            next_seq = self.device_seqs.get(phone_num, 0) + 1
            self.device_seqs[phone_num] = next_seq
            return next_seq

    def send_tts(self, phone_num: str, text: str) -> dict[str, Any]:
        text = text.strip()
        device = self.ensure_device_exists(phone_num)

        if not text:
            return {
                "phone": phone_num,
                "success": False,
                "message": "Text cannot be empty",
                "device_name": device.get("device_name", f"定位器-{phone_num}"),
            }

        try:
            text_bytes = text.encode("gbk")
        except UnicodeEncodeError:
            return {
                "phone": phone_num,
                "success": False,
                "message": "Text contains characters outside GBK encoding",
                "device_name": device.get("device_name", f"定位器-{phone_num}"),
            }

        if len(text_bytes) > 1024:
            return {
                "phone": phone_num,
                "success": False,
                "message": "Text exceeds the JT808 1024-byte limit",
                "device_name": device.get("device_name", f"定位器-{phone_num}"),
            }

        with self.connection_lock:
            client_sock = self.active_connections.get(phone_num)

        if client_sock is None:
            return {
                "phone": phone_num,
                "success": False,
                "message": "Device is not connected for TTS",
                "device_name": device.get("device_name", f"定位器-{phone_num}"),
            }

        seq_num = self.get_next_seq(phone_num)
        try:
            client_sock.sendall(generate_8300_tts_command(phone_num, seq_num, text))
            logger.info(f"[TTS] 文本播报已下发到设备 {phone_num}: {text}")
            return {
                "phone": phone_num,
                "success": True,
                "message": "TTS command sent",
                "device_name": device.get("device_name", f"定位器-{phone_num}"),
                "sequence": seq_num,
            }
        except Exception as exc:
            logger.error(f"[TTS] 文本播报下发失败 {phone_num}: {exc}")
            self.unregister_connection(client_sock)
            return {
                "phone": phone_num,
                "success": False,
                "message": f"Send failed: {exc}",
                "device_name": device.get("device_name", f"定位器-{phone_num}"),
            }

    def send_tts_batch(self, phone_nums: list[str], text: str) -> dict[str, Any]:
        unique_phones = []
        seen = set()
        for phone in phone_nums:
            if phone and phone not in seen:
                unique_phones.append(phone)
                seen.add(phone)

        results = [self.send_tts(phone, text) for phone in unique_phones]
        success_count = sum(1 for item in results if item.get("success"))
        failed_count = len(results) - success_count
        return {
            "requested_count": len(unique_phones),
            "success_count": success_count,
            "failed_count": failed_count,
            "results": results,
        }

    def ensure_device_exists(self, phone_num: str) -> dict:
        """确保 phone_num 对应的设备记录存在于内存中"""
        if phone_num not in self.device_store:
            logger.info(f"【自动注册】发现新设备: {phone_num}")
            self.device_store[phone_num] = {
                "phone": phone_num,
                "is_online": True,
                "last_latitude": None,
                "last_longitude": None,
                "device_name": f"定位器-{phone_num}",
            }
        return self.device_store[phone_num]

    def save_location_history(self, device_id: str, lat: float, lon: float, speed: float = None, direction: float = None):
        """保存定位历史到数据库 + 实时独立备份"""
        try:
            now = datetime.now()
            db = SessionLocal()
            location = DeviceLocationHistory(
                id=str(uuid.uuid4()),
                device_id=device_id,
                latitude=lat,
                longitude=lon,
                speed=speed,
                direction=direction,
                timestamp=now
            )
            db.add(location)
            db.commit()
            db.close()

            import os, csv
            backup_dir = "./storage/location_backup"
            os.makedirs(backup_dir, exist_ok=True)
            date_str = now.strftime("%Y%m%d")
            csv_file = os.path.join(backup_dir, f"location_{date_str}.csv")
            
            file_exists = os.path.exists(csv_file)
            with open(csv_file, 'a', encoding='utf-8', newline='') as f:
                writer = csv.writer(f)
                if not file_exists:
                    writer.writerow(['time', 'device_id', 'lat', 'lng', 'speed', 'direction'])
                writer.writerow([
                    now.strftime("%Y-%m-%d %H:%M:%S"),
                    device_id,
                    f"{lat:.6f}",
                    f"{lon:.6f}",
                    f"{speed or 0:.1f}",
                    f"{direction or 0:.0f}"
                ])

        except Exception as e:
            logger.debug(f"保存定位历史失败: {e}")

    def update_device_data(self, phone_num: str, lat: float = None, lon: float = None, speed: float = None, direction: float = None):
        """更新设备在线状态和坐标（WGS84→GCJ02 纠偏）"""
        self.last_seen[phone_num] = time.time()

        try:
            device = self.ensure_device_exists(phone_num)
            device["is_online"] = True

            if lat is not None and lon is not None:
                if abs(lat) > 0.000001 and abs(lon) > 0.000001:
                    gcj_lon, gcj_lat = wgs84_to_gcj02(lon, lat)
                    device["last_latitude"] = gcj_lat
                    device["last_longitude"] = gcj_lon
                    logger.info(f"[{phone_num}] 坐标更新 -> Lat:{gcj_lat:.6f}, Lon:{gcj_lon:.6f}")
<<<<<<< HEAD
                    self.save_location_history(phone_num, gcj_lat, gcj_lon, speed, direction)
=======
                    
                    # 存储到数据库
                    self._save_to_database(phone_num, gcj_lat, gcj_lon)
>>>>>>> f687e38f23a292c399d3be1f24666c041a7cfa45
                else:
                    # GPS 未锁定时上报(0,0)，从列表随机选一个点，模拟动起来的效果
                    lat_rand, lon_rand = random.choice(RANDOM_COORDS)
                    device["last_latitude"] = lat_rand
                    device["last_longitude"] = lon_rand
                    logger.warning(f"[{phone_num}] 坐标(0,0), 随机跳点至 -> Lat:{lat_rand:.6f}, Lon:{lon_rand:.6f}")
                    
                    # 存储到数据库（使用默认坐标）
                    self._save_to_database(phone_num, lat_rand, lon_rand)
        except Exception as e:
            logger.error(f"更新设备 {phone_num} 异常: {e}")
    
    def _save_to_database(self, phone_num: str, lat: float, lon: float):
        """将坐标存储到数据库，同时添加轨迹点"""
        try:
            # 根据holderPhone查询设备
            device = device_service.get_device_by_holder_phone(phone_num)
            if not device:
                logger.warning(f"[{phone_num}] 未找到对应的设备，跳过存储")
                return
            
            # 获取设备的device_id
            device_id = device.get("device_id")
            if not device_id:
                logger.warning(f"[{phone_num}] 设备缺少device_id，跳过存储")
                return
            
            # 1. 更新设备的实时坐标
            from app.schemas.device_schema import DeviceUpdate
            from datetime import datetime, timezone
            update_data = DeviceUpdate(
                lat=lat,
                lng=lon,
                lastUpdate=datetime.now(timezone.utc).isoformat()
            )
            
            updated_device = device_service.update_device(device_id, update_data)
            if updated_device:
                logger.debug(f"[{phone_num}] 实时坐标已更新到数据库 -> Lat:{lat:.6f}, Lon:{lon:.6f}, DeviceID:{device_id}")
            else:
                logger.warning(f"[{phone_num}] 更新设备坐标失败，DeviceID:{device_id}")
            
            # 2. 添加轨迹点（用于轨迹回放功能）
            from app.schemas.device_schema import TrajectoryPoint
            trajectory_point = TrajectoryPoint(
                timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                lat=lat,
                lng=lon,
                speed=0.0,
                direction=0.0
            )
            device_service.add_trajectory_point(device_id, trajectory_point)
            logger.debug(f"[{phone_num}] 轨迹点已添加 -> Lat:{lat:.6f}, Lon:{lon:.6f}")
            
        except Exception as e:
            logger.error(f"存储坐标到数据库失败 {phone_num}: {e}")

    # ----------------------------------------------------------
    #  超时检测：30分钟无心跳自动离线
    # ----------------------------------------------------------
    def timeout_checker(self):
        while self.running:
            now = time.time()
            for phone in list(self.last_seen.keys()):
                if now - self.last_seen[phone] > 1800:
                    if phone in self.device_store:
                        self.device_store[phone]["is_online"] = False
                    del self.last_seen[phone]
                    logger.info(f"【超时离线】设备 {phone} 已超过30分钟未上报")
            time.sleep(20)

    # ----------------------------------------------------------
    #  TCP 客户端处理：解析 JT808 协议帧
    # ----------------------------------------------------------
    def handle_client(self, client_sock, addr):
        logger.info(f"【新连接】来自: {addr}")
        try:
            buffer = bytearray()
            while self.running:
                data = client_sock.recv(2048)
                if not data:
                    break
                buffer.extend(data)

                while b'\x7e' in buffer:
                    start_idx = buffer.find(b'\x7e')
                    end_idx = buffer.find(b'\x7e', start_idx + 1)
                    if end_idx == -1:
                        buffer = buffer[start_idx:]
                        break

                    frame = buffer[start_idx: end_idx + 1]
                    buffer = buffer[end_idx:]

                    if len(frame) < 15:
                        continue

                    content = unescape(frame[1:-1])
                    content_clean = content[:-1]  # 去掉校验码

                    if len(content_clean) < 12:
                        continue

                    msg_id = content_clean[0:2].hex().upper()
                    msg_attr = struct.unpack('>H', content_clean[2:4])[0]
                    phone_num = content_clean[4:10].hex().upper()
                    seq_num = struct.unpack('>H', content_clean[10:12])[0]

                    is_subpackage = (msg_attr & 0x2000) != 0
                    header_len = 16 if is_subpackage else 12

                    # ---- 消息分发 ----
                    if msg_id == "0100":  # 终端注册
                        logger.info(f"[注册] 设备: {phone_num}")
                        self.update_device_data(phone_num)
                        with self.connection_lock:
                            self.active_connections[phone_num] = client_sock
                        client_sock.sendall(generate_8100_reply(phone_num, seq_num))

                    elif msg_id == "0102":  # 终端鉴权
                        logger.info(f"[鉴权] 设备: {phone_num}")
                        self.update_device_data(phone_num)
                        with self.connection_lock:
                            self.active_connections[phone_num] = client_sock
                        client_sock.sendall(generate_8001_reply(msg_id, phone_num, seq_num))

                    elif msg_id == "0002":  # 心跳
                        self.update_device_data(phone_num)
                        client_sock.sendall(generate_8001_reply(msg_id, phone_num, seq_num))

                    elif msg_id in ["0200", "0203", "0204"]:  # 位置上报
                        body = content_clean[header_len:]
                        if len(body) >= 28:
                            lat_int, lon_int = struct.unpack('>I I', body[8:16])
                            speed_10x, dir_deg = struct.unpack('>H H', body[16:20])
                            lat, lon = lat_int / 10 ** 6, lon_int / 10 ** 6
                            speed = speed_10x / 10.0
                            self.update_device_data(phone_num, lat, lon, speed, dir_deg)
                        else:
                            self.update_device_data(phone_num)
                        client_sock.sendall(generate_8001_reply(msg_id, phone_num, seq_num))

                    else:  # 其他消息通用应答
                        self.update_device_data(phone_num)
                        client_sock.sendall(generate_8001_reply(msg_id, phone_num, seq_num))

        except Exception as e:
            logger.error(f"客户端 {addr} 通信异常: {e}")
        finally:
            self.unregister_connection(client_sock)
            client_sock.close()

    # ----------------------------------------------------------
    #  启动 TCP 服务
    # ----------------------------------------------------------
    def start_server(self):
        self.running = True
        threading.Thread(target=self.timeout_checker, daemon=True).start()

        try:
            server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server_sock.settimeout(2.0)
            server_sock.bind((self.host, self.port))
            server_sock.listen(20)
            logger.success(f"=== JT808 定位服务已启动，监听端口: {self.port} ===")

            while self.running:
                try:
                    client_sock, addr = server_sock.accept()
                    threading.Thread(target=self.handle_client, args=(client_sock, addr), daemon=True).start()
                except socket.timeout:
                    continue
        except Exception as e:
            logger.error(f"JT808 服务启动失败: {e}")
        finally:
            self.running = False


jt808_manager = JT808Manager()

if __name__ == "__main__":
    print("=========================================")
    print("   Starting JT808 Service For Testing    ")
    print("=========================================")
    try:
        jt808_manager.start_server()
    except KeyboardInterrupt:
        print("\nShutting down JT808 service...")
        jt808_manager.running = False
