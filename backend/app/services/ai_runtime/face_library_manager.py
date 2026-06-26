from __future__ import annotations

import logging
import os
import cv2
import numpy as np
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Optional

# 导入数据库及通用服务
from app.core.database import get_personnel_collection, get_mongo_collection

logger = logging.getLogger("FaceLibraryManager")

class FaceLibraryManager:
    def __init__(self, similarity_threshold: float = 0.60):
        self.similarity_threshold = similarity_threshold
        self.face_model = None
        self.known_db = {}  # {personnel_id: {"vector": tensor, "info": str, "person": dict}}
        self._loaded = False
        self._lock = Lock()

    def ensure_loaded(self) -> bool:
        """确保人脸模型和底库已经加载，线程安全。"""
        if self._loaded:
            return True
        with self._lock:
            if self._loaded:
                return True
            try:
                self._load_face_model()
                self._load_face_database()
                self._loaded = True
                return True
            except Exception as e:
                logger.error("初始化人脸识别服务失败: %s", e, exc_info=True)
                return False

    def _load_face_model(self):
        """加载 FaceNet 预训练特征提取模型。"""
        try:
            from facenet_pytorch import InceptionResnetV1
            logger.info("正在加载 FaceNet 模型 (vggface2)...")
            self.face_model = InceptionResnetV1(pretrained='vggface2').eval()
            logger.info("FaceNet 模型加载成功。")
        except Exception as e:
            logger.error("加载 FaceNet 模型失败: %s", e)
            raise

    def _get_static_file_path(self, url_path: str) -> Optional[str]:
        """将 /static/faces/xxx.png 转换为本地文件的绝对路径。"""
        if not url_path:
            return None

        normalized = str(url_path).strip().replace("\\", "/")
        backend_root = Path(__file__).resolve().parents[3]
        cwd = Path.cwd()
        candidates = []
        if normalized.startswith("/static/"):
            relative_path = normalized.lstrip("/")
            candidates.extend([
                backend_root / relative_path,
                cwd / relative_path,
                cwd / "backend" / relative_path,
            ])
        elif os.path.isabs(normalized):
            candidates.append(Path(normalized))
        else:
            relative_path = normalized.lstrip("/")
            candidates.extend([
                backend_root / relative_path,
                cwd / relative_path,
                cwd / "backend" / relative_path,
            ])

        for candidate in candidates:
            if candidate.exists():
                return str(candidate)

        return str(candidates[0]) if candidates else None

    def _read_image(self, img_path: str) -> Optional[np.ndarray]:
        """Read image paths with non-ASCII characters reliably on Windows."""
        try:
            data = np.fromfile(img_path, dtype=np.uint8)
            if data.size == 0:
                return None
            return cv2.imdecode(data, cv2.IMREAD_COLOR)
        except Exception as exc:
            logger.warning("读取图片失败: %s, error=%s", img_path, exc)
            return None

    def _load_face_database(self):
        """从 MongoDB 中的 personnel 集合扫描并录入人脸特征底库。"""
        self.known_db = {}
        try:
            collection = get_personnel_collection()
            # 检索所有有脸部照片的人员记录
            people = list(collection.find({
                "faceImage": {"$exists": True, "$ne": ""}
            }))
        except Exception as e:
            logger.error("从 MongoDB 获取人员档案失败: %s", e)
            return

        if not people:
            logger.warning("MongoDB personnel 集合中没有找到任何包含人脸登记照的人员。")
            return

        logger.info("正在对 personnel 中的人员登记照提取特征并录入内存底库...")
        count = 0

        for person in people:
            personnel_id = str(person.get("_id"))
            name = person.get("username", "") or "未命名人员"
            dept = person.get("dept", person.get("department", ""))
            role = person.get("role", "")
            phone = person.get("phone", "")
            face_image = person.get("faceImage", "")

            img_path = self._get_static_file_path(face_image)

            if not img_path or not os.path.exists(img_path):
                logger.debug("人员登记照物理文件不存在，跳过: %s (%s)", name, img_path)
                continue

            try:
                # 读取图像并做人脸区域初步提取以精细比对，或者直接将全图视作已对齐的人脸
                img_bgr = self._read_image(img_path)
                if img_bgr is None:
                    logger.warning("无法读取登记照片: %s", img_path)
                    continue

                # 🚀 极致对齐优化：自动对登记照进行人脸定位和裁剪，剔除背景噪音
                from app.services.ai_runtime.detector_manager import detect_frame
                target_img = img_bgr
                try:
                    face_result = detect_frame("face", img_bgr)
                    if face_result.get("success") and face_result.get("detections"):
                        best_det = max(face_result["detections"], key=lambda x: x.get("confidence", 0.0))
                        bbox = best_det.get("bbox")
                        if bbox and len(bbox) >= 4:
                            h_orig, w_orig = img_bgr.shape[:2]
                            x1, y1, x2, y2 = [int(v) for v in bbox]
                            x1 = max(0, min(w_orig, x1))
                            y1 = max(0, min(h_orig, y1))
                            x2 = max(0, min(w_orig, x2))
                            y2 = max(0, min(h_orig, y2))
                            if x2 > x1 and y2 > y1:
                                target_img = img_bgr[y1:y2, x1:x2]
                                logger.info("[人脸底库] 成功从登记照中定位并提取纯人脸子图: 姓名=%s", name)
                except Exception as e:
                    logger.warning("从登记照中提取纯人脸失败 (将降级使用整图): %s", e)

                # 提取 512 维的特征向量
                vec = self._extract_face_vector(target_img)

                info_parts = [f"姓名: {name}"]
                if dept:
                    info_parts.append(f"部门: {dept}")
                if role:
                    info_parts.append(f"角色: {role}")
                if phone:
                    info_parts.append(f"电话: {phone}")

                self.known_db[personnel_id] = {
                    "vector": vec,
                    "info": " / ".join(info_parts),
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
                # ✅ 添加用户特别要求的成功读取并提取特征向量日志
                logger.info("[人脸底库] 成功读取并录入人员登记照: 姓名=%s, ID=%s, 物理路径=%s", name, personnel_id, img_path)

            except Exception as e:
                logger.error("录入人员特征失败: %s (%s), 错误: %s", name, face_image, e)

        logger.info("MongoDB 人脸特征底库初始化加载完成，当前共成功录入 %d 人。", count)

    def _pre_process_facenet(self, cv2_img: np.ndarray):
        """对 OpenCV 图像切片进行 FaceNet 归一化 and 格式预处理。"""
        import torch
        img_rgb = cv2.cvtColor(cv2_img, cv2.COLOR_BGR2RGB)
        img_resized = cv2.resize(img_rgb, (160, 160))
        img_tensor = torch.tensor(img_resized).permute(2, 0, 1).float()
        img_tensor = (img_tensor - 127.5) / 128.0
        return img_tensor.unsqueeze(0)

    def _extract_face_vector(self, cv2_img: np.ndarray):
        """提取 512 维特征向量。"""
        import torch
        img_tensor = self._pre_process_facenet(cv2_img)
        with torch.no_grad():
            vector = self.face_model(img_tensor)
        return vector.flatten()

    def reload_database(self):
        """重新加载底库（供后台上传照片后调用）。"""
        with self._lock:
            self._loaded = False
        self.ensure_loaded()

    def match_face(self, face_crop: np.ndarray) -> Optional[dict]:
        """
        在底库中匹配人脸。
        返回匹配结果或 None (相似度低于阈值)。
        """
        if not self.ensure_loaded() or not self.known_db:
            return None

        import torch.nn.functional as F

        try:
            current_vec = self._extract_face_vector(face_crop)
            best_similarity = 0.0
            best_match = None

            for personnel_id, db_entry in self.known_db.items():
                similarity = F.cosine_similarity(
                    current_vec.unsqueeze(0), db_entry["vector"].unsqueeze(0)
                ).item()

                if similarity > best_similarity:
                    best_similarity = similarity
                    if similarity >= self.similarity_threshold:
                        best_match = {
                            "personnel_id": personnel_id,
                            "name": db_entry["person"].get("username", "未知人员"),
                            "info": db_entry["info"],
                            "similarity": similarity,
                            "person": db_entry["person"],
                        }

            return best_match
        except Exception as e:
            logger.error("特征向量比对出错: %s", e)
            return None


# 全局单例实例
face_library_manager = FaceLibraryManager()
