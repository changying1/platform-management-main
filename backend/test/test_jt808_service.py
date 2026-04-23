#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
JT808 接收测试脚本。

用途：
1. 直接启动当前项目里的 JT808 服务
2. 等待真实设备接入并上报消息
3. 按设备号区分打印在线状态、坐标和打卡事件

运行方式：
python backend/test/test_jt808_service.py
python backend/test/test_jt808_service.py --host 0.0.0.0 --port 8989 --refresh 5
"""

from __future__ import annotations

import argparse
import sys
import threading
import time
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.jt808_service import JT808Manager


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="JT808 接收测试脚本")
    parser.add_argument("--host", default="0.0.0.0", help="监听地址，默认 0.0.0.0")
    parser.add_argument("--port", type=int, default=8989, help="监听端口，默认 8989")
    parser.add_argument("--refresh", type=float, default=3.0, help="控制台刷新间隔秒数")
    return parser


def format_coord(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:.6f}"


def print_device_snapshot(manager: JT808Manager) -> None:
    device_items = sorted(manager.device_store.items(), key=lambda item: item[0])
    print("")
    print("=" * 88)
    print(f"已接收设备数: {len(device_items)}")

    if not device_items:
        print("当前还没有设备上报。")
        return

    for phone_num, device in device_items:
        print(
            f"设备号: {phone_num} | 在线: {device.get('is_online')} | "
            f"纬度: {format_coord(device.get('last_latitude'))} | "
            f"经度: {format_coord(device.get('last_longitude'))} | "
            f"名称: {device.get('device_name') or '-'}"
        )


def print_new_attendance_events(manager: JT808Manager, printed_count: int) -> int:
    events = manager.get_pending_attendance_events()
    new_events = events[printed_count:]

    for event in new_events:
        print(
            f"[打卡] device_id={event.get('device_id')} | phone={event.get('phone_num')} | "
            f"type={event.get('event_type')} | lat={event.get('lat')} | lon={event.get('lon')} | "
            f"time={event.get('received_at')}"
        )

    return len(events)


def run_server(manager: JT808Manager) -> None:
    manager.start_server()


def main() -> None:
    args = build_parser().parse_args()

    manager = JT808Manager()
    manager.host = args.host
    manager.port = args.port

    print(f"启动 JT808 测试接收服务: {args.host}:{args.port}")
    print("等待设备连接并上报消息，按 Ctrl+C 结束。")

    server_thread = threading.Thread(target=run_server, args=(manager,), daemon=True)
    server_thread.start()

    printed_attendance_count = 0

    try:
        while True:
            time.sleep(args.refresh)
            print_device_snapshot(manager)
            printed_attendance_count = print_new_attendance_events(manager, printed_attendance_count)
    except KeyboardInterrupt:
        print("")
        print("正在停止 JT808 测试接收服务...")
    finally:
        manager.running = False
        server_thread.join(timeout=3)
        print("服务已停止。")


if __name__ == "__main__":
    main()
