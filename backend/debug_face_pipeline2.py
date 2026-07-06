import os
import sys
import cv2
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.ai_runtime.face_library_manager import face_library_manager
from app.services.ai_runtime.detector_manager import detect_frame

def safe_imread(path):
    """兼容中文路径的图片读取"""
    data = np.fromfile(path, dtype=np.uint8)
    if data.size == 0:
        return None
    return cv2.imdecode(data, cv2.IMREAD_COLOR)

print("=== 端到端人脸识别链路测试 ===\n")

# 1. 确保底库加载
ok = face_library_manager.ensure_loaded()
print(f"[1] 底库加载: {ok}, 人数={len(face_library_manager.known_db)}")

# 2. 读取登记照进行自测
face_dir = os.path.join(os.path.dirname(__file__), "static", "faces")
face_files = [f for f in os.listdir(face_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
print(f"[2] 登记照文件数: {len(face_files)} (在 {face_dir})")

matched_count = 0
for fname in face_files[:5]:  # 只测前5个
    fpath = os.path.join(face_dir, fname)
    img = safe_imread(fpath)
    if img is None:
        print(f"  无法读取: {fname}")
        continue
    print(f"\n  测试图片: {fname} ({img.shape[1]}x{img.shape[0]})")

    # 2a. 人脸检测 (face.onnx)
    result = detect_frame("face", img)
    detections = result.get("detections", []) if result.get("success") else []
    print(f"  [2a] 人脸检测: success={result.get('success')}, 检测到 {len(detections)} 个人脸")
    if not result.get('success'):
        print(f"       error={result.get('error')}")

    for i, det in enumerate(detections):
        bbox = det.get("bbox", [])
        conf = det.get("confidence", 0)
        print(f"    人脸{i+1}: bbox={bbox}, confidence={conf:.4f}")

        # 2b. 裁剪人脸
        if len(bbox) >= 4:
            x1, y1, x2, y2 = [int(v) for v in bbox]
            h, w = img.shape[:2]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            if x2 > x1 and y2 > y1:
                face_crop = img[y1:y2, x1:x2]
                print(f"    [2b] 裁剪人脸尺寸: {face_crop.shape[1]}x{face_crop.shape[0]}")
                # 2c. 底库匹配
                match = face_library_manager.match_face(face_crop)
                if match:
                    matched = match.get("matched", False)
                    name = match.get("name", "未知")
                    sim = match.get("similarity", 0)
                    print(f"    [2c] 匹配结果: 姓名={name}, 相似度={sim:.4f}, 通过阈值={matched}")
                    if matched:
                        matched_count += 1
                else:
                    print(f"    [2c] 匹配结果: None (无匹配)")
            else:
                print(f"    [2b] 裁剪区域无效")

print(f"\n=== 测试完成 (成功匹配 {matched_count} 张) ===")
