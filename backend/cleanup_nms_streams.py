
import requests
import sys

NMS_HOST = "http://127.0.0.1:8001"
NMS_USER = "admin"
NMS_PASS = "admin123"

def cleanup_streams():
    """清理所有现有的流和中继任务"""
    
    # 1. 获取所有中继任务
    relay_url = f"{NMS_HOST}/api/relay"
    try:
        response = requests.get(relay_url, auth=(NMS_USER, NMS_PASS), timeout=5)
        if response.status_code == 200:
            relays = response.json()
            print(f"Found {len(relays)} relay tasks")
            
            # 删除所有中继任务
            for relay_id, relay_info in relays.items():
                delete_url = f"{NMS_HOST}/api/relay/{relay_id}"
                del_response = requests.delete(delete_url, auth=(NMS_USER, NMS_PASS))
                print(f"  Deleted relay task: {relay_id} - Status: {del_response.status_code}")
        else:
            print(f"Failed to get relays: {response.status_code}")
    except Exception as e:
        print(f"Error getting relays: {e}")
    
    # 2. 获取所有活动流
    streams_url = f"{NMS_HOST}/api/streams"
    try:
        response = requests.get(streams_url, auth=(NMS_USER, NMS_PASS), timeout=5)
        if response.status_code == 200:
            streams = response.json()
            print(f"\nActive streams: {streams}")
            # NMS 的流会在客户端断开后自动清理
        else:
            print(f"Failed to get streams: {response.status_code}")
    except Exception as e:
        print(f"Error getting streams: {e}")
    
    print("\nCleanup completed. Please restart NMS if streams persist.")

if __name__ == "__main__":
    cleanup_streams()
