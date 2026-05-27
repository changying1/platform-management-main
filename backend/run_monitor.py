import cv2
import time
import os
from app.services.ai_service import AIService

# --- 配置区域 ---
# 替换为你的海康摄像头 RTSP 地址
# 格式: rtsp://账号:密码@IP:554/Streaming/Channels/101
RTSP_URL = "rtsp://admin:Song%40871023@10.102.1.154//Streaming/Channels/1"

# 如果没有摄像头,可以用本地视频文件测试,或者填 0 使用笔记本摄像头
# RTSP_URL = 0 

def start_monitoring():
    print("--- 正在初始化 AI 服务 ---")
    
    # 确保路径正确,如果不正确请修改 app/models/best.pt
    ai = AIService(model_path="app/models/best.pt")
    
    print(f"--- 正在连接视频流: {RTSP_URL} ---")
    cap = cv2.VideoCapture(RTSP_URL)
    
    if not cap.isOpened():
        print("❌ 无法连接到摄像头,请检查 RTSP 地址或网络连接.")
        return

    print("✅ 监控已启动!请观察控制台输出,或查看 backend 目录下的 alerts.txt")
    
    frame_count = 0
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("⚠️ 视频流中断,尝试重连...")
                cap.release()
                time.sleep(2)
                cap = cv2.VideoCapture(RTSP_URL)
                continue

            # 策略:每 10 帧检测一次 (约每秒 2-3 次),避免电脑卡死
            if frame_count % 10 == 0:
                ai.detect_and_log(frame, device_id="Site_Main_Camera")
            
            frame_count += 1
            
            # (可选) 如果你在本地电脑运行,可以把下面两行注释取消,看实时画面
            # cv2.imshow("Security Monitor", frame)
            # if cv2.waitKey(1) & 0xFF == ord('q'): break

    except KeyboardInterrupt:
        print("\n--- 监控服务已停止 ---")
    finally:
        cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    start_monitoring()