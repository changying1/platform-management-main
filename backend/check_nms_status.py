
import requests
import json

NMS_HOST = "http://127.0.0.1:8001"
NMS_USER = "admin"
NMS_PASS = "admin123"

print("=== Checking NMS Relay Tasks ===")
try:
    # 获取所有中继任务
    relay_url = f"{NMS_HOST}/api/relay"
    response = requests.get(relay_url, auth=(NMS_USER, NMS_PASS), timeout=5)
    print(f"Status: {response.status_code}")
    relays = response.json()
    print(f"Relay tasks: {json.dumps(relays, indent=2)}")
except Exception as e:
    print(f"Error: {e}")

print("\n=== Checking NMS Active Streams ===")
try:
    # 获取所有活动流
    streams_url = f"{NMS_HOST}/api/streams"
    response = requests.get(streams_url, auth=(NMS_USER, NMS_PASS), timeout=5)
    print(f"Status: {response.status_code}")
    streams = response.json()
    print(f"Streams: {json.dumps(streams, indent=2)}")
except Exception as e:
    print(f"Error: {e}")

print("\n=== Checking Stream 11 Directly ===")
try:
    # 尝试直接访问流
    stream_url = f"{NMS_HOST}/live/11.flv"
    response = requests.get(stream_url, timeout=2, stream=True)
    print(f"Status: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    print(f"First 100 bytes: {response.content[:100]}")
except Exception as e:
    print(f"Error: {e}")
