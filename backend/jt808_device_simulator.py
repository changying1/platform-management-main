#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
仅用于“连接定位设备(JT808)”的测试脚本.

功能:
1) 连接到你的 JT808 TCP 服务(默认 127.0.0.1:8989)
2) 发送注册(0x0100)、鉴权(0x0102)
3) 周期发送心跳(0x0002) + 定位(0x0200)

用法示例:
python jt808_device_simulator.py --phone 138001380000
python jt808_device_simulator.py --host 127.0.0.1 --port 8989 --phone 138001380000 --lat 34.341568 --lon 108.93977 --interval 5
"""

from __future__ import annotations

import argparse
import socket
import struct
import time
from datetime import datetime


def checksum(data: bytes) -> int:
    x = 0
    for b in data:
        x ^= b
    return x


def escape_808(data: bytes) -> bytes:
    out = bytearray()
    for b in data:
        if b == 0x7E:
            out.extend([0x7D, 0x02])
        elif b == 0x7D:
            out.extend([0x7D, 0x01])
        else:
            out.append(b)
    return bytes(out)


def bcd_phone(phone: str) -> bytes:
    # JT808 终端手机号 6字节 BCD
    cleaned = ''.join(ch for ch in phone if ch.isdigit())
    return bytes.fromhex(cleaned.zfill(12)[-12:])


def pack_808(msg_id: int, phone: str, seq: int, body: bytes) -> bytes:
    msg_attr = len(body) & 0x03FF
    header = struct.pack('>H H 6s H', msg_id, msg_attr, bcd_phone(phone), seq)
    payload = header + body
    cs = checksum(payload)
    return b'\x7e' + escape_808(payload + bytes([cs])) + b'\x7e'


def make_0100_register_body() -> bytes:
    # 省市县 + 制造商(5) + 终端型号(20) + 终端ID(7) + 车牌颜色 + 车牌
    province = 6100
    city = 100
    maker = 'PYSIM'.ljust(5)
    model = 'JT808-SIM'.ljust(20)
    term_id = 'SIM0001'.ljust(7)
    plate_color = 0
    plate = ''
    return (
        struct.pack('>H H', province, city)
        + maker.encode('ascii', errors='ignore')[:5]
        + model.encode('ascii', errors='ignore')[:20]
        + term_id.encode('ascii', errors='ignore')[:7]
        + struct.pack('B', plate_color)
        + plate.encode('gbk', errors='ignore')
    )


def make_0102_auth_body(auth_code: str = 'AUTH123456') -> bytes:
    return auth_code.encode('gbk', errors='ignore')


def make_0002_heartbeat_body() -> bytes:
    return b''


def make_0200_location_body(lat: float, lon: float, speed_kmh: float = 20.0, direction_deg: int = 90) -> bytes:
    # 报警标志(4) + 状态(4) + 纬度(4) + 经度(4) + 高程(2) + 速度(2, 1/10km/h) + 方向(2) + 时间(6, BCD)
    alarm_flag = 0
    status = 0x00000002  # ACC开
    lat_i = int(abs(lat) * 1_000_000)
    lon_i = int(abs(lon) * 1_000_000)
    altitude = 30
    speed = int(speed_kmh * 10)
    direction = max(0, min(359, int(direction_deg)))

    now = datetime.now()
    yy = now.year % 100
    time_bcd = bytes.fromhex(f"{yy:02d}{now.month:02d}{now.day:02d}{now.hour:02d}{now.minute:02d}{now.second:02d}")

    return struct.pack('>I I I I H H H', alarm_flag, status, lat_i, lon_i, altitude, speed, direction) + time_bcd


def recv_reply(sock: socket.socket, timeout: float = 2.0) -> bytes:
    sock.settimeout(timeout)
    try:
        return sock.recv(2048)
    except Exception:
        return b''


def run(args):
    seq = 1

    with socket.create_connection((args.host, args.port), timeout=6) as sock:
        print(f"✅ 已连接 JT808 服务: {args.host}:{args.port}")

        # 1) 注册
        reg = pack_808(0x0100, args.phone, seq, make_0100_register_body())
        seq += 1
        sock.sendall(reg)
        print("➡️ 已发送 0x0100 注册")
        rep = recv_reply(sock)
        if rep:
            print(f"⬅️ 收到注册应答 {len(rep)} bytes")

        # 2) 鉴权
        auth = pack_808(0x0102, args.phone, seq, make_0102_auth_body(args.auth))
        seq += 1
        sock.sendall(auth)
        print("➡️ 已发送 0x0102 鉴权")
        rep = recv_reply(sock)
        if rep:
            print(f"⬅️ 收到鉴权应答 {len(rep)} bytes")

        lat = args.lat
        lon = args.lon

        print("🚚 开始周期上报(心跳+定位)... 按 Ctrl+C 结束")
        try:
            while True:
                # 3) 心跳
                hb = pack_808(0x0002, args.phone, seq, make_0002_heartbeat_body())
                seq += 1
                sock.sendall(hb)

                # 4) 定位
                loc = pack_808(0x0200, args.phone, seq, make_0200_location_body(lat, lon, args.speed, args.direction))
                seq += 1
                sock.sendall(loc)

                print(f"📍 上报定位 lat={lat:.6f}, lon={lon:.6f}, speed={args.speed:.1f}km/h")

                # 可选:模拟移动
                if args.move_step != 0:
                    lon += args.move_step

                # 读一小段应答(非强依赖)
                _ = recv_reply(sock, timeout=0.6)

                time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\n🛑 已停止上报")


def build_parser():
    p = argparse.ArgumentParser(description='JT808 定位设备连接与上报模拟脚本')
    p.add_argument('--host', default='127.0.0.1', help='JT808 服务地址')
    p.add_argument('--port', type=int, default=8989, help='JT808 服务端口')
    p.add_argument('--phone', default='14084725763', help='终端手机号(12位BCD,不足自动补0)')
    p.add_argument('--auth', default='AUTH123456', help='鉴权码(与服务端约定)')
    p.add_argument('--lat', type=float, default=0.0, help='初始纬度(WGS84)')
    p.add_argument('--lon', type=float, default=0.0, help='初始经度(WGS84)')
    p.add_argument('--speed', type=float, default=0.0, help='速度 km/h')
    p.add_argument('--direction', type=int, default=90, help='方向角 0~359')
    p.add_argument('--interval', type=float, default=5.0, help='上报周期秒')
    p.add_argument('--move-step', type=float, default=0.0, help='每次上报经度微移(模拟移动)')
    return p


if __name__ == '__main__':
    parser = build_parser()
    args = parser.parse_args()
    run(args)
