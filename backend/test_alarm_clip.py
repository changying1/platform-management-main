import sys, os
from datetime import datetime, timedelta
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.services.video_service import VideoService

svc = VideoService()
now = datetime.now()
start = now - timedelta(minutes=5)
end = now - timedelta(minutes=1)
print(f"Testing video_id 358 from {start} to {end}")
try:
    res = svc.save_playback_clip(358, start, end, output_type='alarm', filename_prefix='test_alarm')
    print('Success:', res)
except Exception as e:
    print('Failed:', e)
