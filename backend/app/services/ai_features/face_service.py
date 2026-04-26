"""
人脸识别服务：YOLO Pose 定位 + FaceNet 特征比对
底库目前从文件目录模拟，后续可替换为数据库用户表读取。
"""
import cv2
import os
import numpy as np
from bson import ObjectId
from app.core.database import get_personnel_collection


class FaceService:
    def __init__(self, pose_model_path="app/models/yolo11n-pose.pt",
                 similarity_threshold=0.60):
        self.pose_model_path = pose_model_path
        self.similarity_threshold = similarity_threshold
        self.pose_model = None
        self.face_model = None
        self.known_db = {}  # {personnel_id: {"vector": tensor, "info": str, "person": dict}}
        self._loaded = False

    def ensure_loaded(self):
        if self._loaded:
            return True
        try:
            self._load_models()
            self._load_face_database()
            self._loaded = True
            return True
        except Exception as e:
            print(f"❌ [人脸服务] 初始化失败: {e}")
            import traceback
            traceback.print_exc()
            return False

    def _load_models(self):
        from ultralytics import YOLO
        from facenet_pytorch import InceptionResnetV1

        base_dir = os.getcwd()
        pose_path = os.path.join(base_dir, self.pose_model_path)

        print("⏳ [人脸服务] 正在加载 YOLO Pose 模型...")
        self.pose_model = YOLO('yolo11n-pose.pt')
        print("✅ [人脸服务] YOLO Pose 模型加载完成")

        print("⏳ [人脸服务] 正在加载 FaceNet 模型...")
        self.face_model = InceptionResnetV1(pretrained='vggface2').eval()
        print("✅ [人脸服务] FaceNet 模型加载完成")

    def _get_static_file_path(self, url_path: str):
        """
        将 /static/faces/xxx.png 转成本地绝对路径：
        backend/static/faces/xxx.png
        """
        if not url_path:
            return None

        normalized = url_path.replace("\\", "/")

        if normalized.startswith("/static/"):
            backend_root = os.getcwd()
            relative_path = normalized.lstrip("/")
            return os.path.join(backend_root, relative_path)

        # 兼容万一数据库里存的是绝对路径
        if os.path.isabs(normalized):
            return normalized

        return os.path.join(os.getcwd(), normalized)

    def _load_face_database(self):
        """
        从 MongoDB personnel 集合加载人脸底库。
        依赖字段：
            username
            dept
            phone
            role
            faceImage: /static/faces/xxx.png
        """
        self.known_db = {}

        try:
            collection = get_personnel_collection()
            people = list(collection.find({
                "faceImage": {"$exists": True, "$ne": ""}
            }))
        except Exception as e:
            print(f"❌ [人脸服务] 读取 MongoDB personnel 失败: {e}")
            return

        if not people:
            print("⚠️ [人脸服务] MongoDB personnel 中没有可用的人脸照片")
            return

        count = 0
        print("⚙️ [人脸服务] 正在从 MongoDB personnel 录入人脸特征...")

        for person in people:
            personnel_id = str(person.get("_id"))
            name = person.get("username", "") or "未命名人员"
            dept = person.get("dept", "")
            role = person.get("role", "")
            phone = person.get("phone", "")
            face_image = person.get("faceImage", "")

            img_path = self._get_static_file_path(face_image)

            if not img_path or not os.path.exists(img_path):
                print(f"   ❌ [录入跳过] {name} 图片不存在: {img_path}")
                continue

            try:
                crops = self._find_and_crop_faces(img_path)
                if crops:
                    vec = self._extract_face_vector(crops[0]["face_crop"])

                    info_parts = [f"姓名: {name}"]
                    if dept:
                        info_parts.append(f"部门: {dept}")
                    if role:
                        info_parts.append(f"角色: {role}")
                    if phone:
                        info_parts.append(f"电话: {phone}")

                    self.known_db[personnel_id] = {
                        "vector": vec,
                        "info": "，".join(info_parts),
                        "person": {
                            "id": personnel_id,
                            "username": name,
                            "dept": dept,
                            "role": role,
                            "phone": phone,
                            "faceImage": face_image,
                        }
                    }

                    count += 1
                    print(f"   ✅ [录入成功] {name} ({personnel_id})")
                else:
                    print(f"   ❌ [录入跳过] {name} (未检测到人脸): {img_path}")
            except Exception as e:
                print(f"   ❌ [录入失败] {name}: {e}")

        print(f"✨ [人脸服务] MongoDB 人脸底库初始化完成，当前包含 {count} 人")

    def _pre_process_facenet(self, cv2_img):
        import torch
        img_rgb = cv2.cvtColor(cv2_img, cv2.COLOR_BGR2RGB)
        img_resized = cv2.resize(img_rgb, (160, 160))
        img_tensor = torch.tensor(img_resized).permute(2, 0, 1).float()
        img_tensor = (img_tensor - 127.5) / 128.0
        return img_tensor.unsqueeze(0)

    def _extract_face_vector(self, cv2_img):
        import torch
        img_tensor = self._pre_process_facenet(cv2_img)
        with torch.no_grad():
            vector = self.face_model(img_tensor)
        return vector.flatten()

    def _find_and_crop_faces(self, source):
        """
        从图片路径或视频帧中检测并裁剪人脸区域。
        Returns: list of {"face_crop": ndarray, "coords": [x1, y1, x2, y2]}
        """
        results = self.pose_model.predict(source=source, conf=0.3, verbose=False)[0]
        img_orig = results.orig_img
        face_data = []

        if results.keypoints is not None:
            for kpts in results.keypoints.xy:
                head_pts = kpts[:5].cpu().numpy()
                valid_pts = head_pts[np.any(head_pts != 0, axis=1)]
                if len(valid_pts) < 2:
                    continue

                x_min, y_min = np.min(valid_pts, axis=0)
                x_max, y_max = np.max(valid_pts, axis=0)

                w, h = x_max - x_min, y_max - y_min
                padding = max(w, h) * 0.82
                x1 = int(x_min - padding * 0.5)
                y1 = int(y_min - padding * 0.7)
                x2 = int(x_max + padding * 0.5)
                y2 = int(y_max + padding * 0.4)

                h_orig, w_orig = img_orig.shape[:2]
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w_orig, x2), min(h_orig, y2)

                face_roi = img_orig[y1:y2, x1:x2]
                if face_roi.size > 0:
                    face_data.append({
                        "face_crop": face_roi,
                        "coords": [x1, y1, x2, y2],
                    })

        return face_data

    def recognize_faces(self, frame):
        """
        在视频帧中识别人脸，与底库进行比对。
        Returns: list of {"name", "info", "similarity", "coords"}
        """
        if not self._loaded and not self.ensure_loaded():
            return []
        if not self.known_db:
            return []

        face_data = self._find_and_crop_faces(frame)
        if not face_data:
            return []

        import torch.nn.functional as F

        results = []
        for fd in face_data:
            current_vec = self._extract_face_vector(fd["face_crop"])
            match_name = "未知人员"
            match_info = ""
            best_similarity = 0.0

            match_person = None

            for personnel_id, db_entry in self.known_db.items():
                similarity = F.cosine_similarity(
                    current_vec.unsqueeze(0), db_entry["vector"].unsqueeze(0)
                ).item()
                if similarity > best_similarity:
                    best_similarity = similarity
                    if similarity > self.similarity_threshold:
                        person = db_entry.get("person", {})
                        match_name = person.get("username", "未知人员")
                        match_info = db_entry.get("info", "")
                        match_person = person

            results.append({
                "name": match_name,
                "info": match_info,
                "similarity": best_similarity,
                "coords": fd["coords"],
                "person": match_person,
            })

        return results
