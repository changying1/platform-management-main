"""Simple PTZ test script.
Usage: python test_ptz.py <video_id> <direction>
Example: python test_ptz.py 1 left

Requires backend API to be running at http://127.0.0.1:9000
"""
import sys
import requests

def main():
    if len(sys.argv) < 3:
        print('Usage: python test_ptz.py <video_id> <direction> [speed] [duration]')
        return
    video_id = sys.argv[1]
    direction = sys.argv[2]
    speed = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
    duration = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
    url = f'http://127.0.0.1:9000/video/ptz/{video_id}'
    payload = { 'direction': direction, 'speed': speed, 'duration': duration }
    print('POST', url, payload)
    try:
        r = requests.post(url, json=payload, timeout=10)
        print('Status:', r.status_code)
        try:
            print('Response:', r.json())
        except Exception:
            print('Response text:', r.text)
    except Exception as e:
        print('Request failed:', e)

if __name__ == '__main__':
    main()
