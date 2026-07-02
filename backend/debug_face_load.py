import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.ai_runtime.face_library_manager import face_library_manager

print("=== 测试人脸底库加载 ===")

try:
    ok = face_library_manager.ensure_loaded()
    print(f"ensure_loaded() 返回: {ok}")
    print(f"known_db 人数: {len(face_library_manager.known_db)}")
    print(f"相似度阈值: {face_library_manager.similarity_threshold}")
    print(f"FaceNet 模型是否加载: {face_library_manager.face_model is not None}")

    if face_library_manager.known_db:
        print("\n已加载的人员列表:")
        for pid, entry in face_library_manager.known_db.items():
            print(f"  ID={pid}, 姓名={entry['person'].get('username')}, info={entry['info']}")
    else:
        print("\n⚠️ 底库为空！没有成功加载任何人员。")

except Exception as e:
    print(f"加载失败: {e}")
    import traceback
    traceback.print_exc()
