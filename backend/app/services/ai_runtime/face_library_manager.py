from __future__ import annotations

import logging
import os
from pathlib import Path
from threading import Lock
from typing import Any, Optional

import cv2
import numpy as np

from app.core.database import get_personnel_collection
from app.utils.face_storage import find_alternate_person_face_file, find_face_file

logger = logging.getLogger("FaceLibraryManager")


class LocalFaceAnalysis:
    """InsightFace FaceAnalysis variant that loads ONNX files from a local pack dir."""

    def __init__(self, model_dir: Path, providers: list[str], allowed_modules: Optional[list[str]] = None):
        from insightface.app.common import Face
        from insightface import model_zoo

        self.Face = Face
        self.models = {}
        self.model_dir = Path(model_dir)
        onnx_files = sorted(self.model_dir.glob("*.onnx"))
        if not onnx_files:
            raise FileNotFoundError(f"InsightFace model files not found: {self.model_dir}")

        allowed = set(allowed_modules or [])
        for onnx_file in onnx_files:
            model = model_zoo.get_model(str(onnx_file), providers=providers)
            if model is None:
                logger.warning("InsightFace model not recognized: %s", onnx_file)
                continue
            taskname = getattr(model, "taskname", "")
            if allowed and taskname not in allowed:
                continue
            if taskname not in self.models:
                self.models[taskname] = model
                logger.info(
                    "Loaded InsightFace model: task=%s file=%s shape=%s",
                    taskname,
                    onnx_file.name,
                    getattr(model, "input_shape", None),
                )

        if "detection" not in self.models:
            raise RuntimeError(f"InsightFace detection model missing in {self.model_dir}")
        if "recognition" not in self.models:
            raise RuntimeError(f"InsightFace recognition model missing in {self.model_dir}")
        self.det_model = self.models["detection"]

    def prepare(self, ctx_id: int, det_thresh: float = 0.5, det_size: tuple[int, int] = (640, 640)):
        self.det_thresh = det_thresh
        self.det_size = det_size
        for taskname, model in self.models.items():
            if taskname == "detection":
                model.prepare(ctx_id, input_size=det_size, det_thresh=det_thresh)
            else:
                model.prepare(ctx_id)

    def get(self, img: np.ndarray, max_num: int = 0, det_metric: str = "default"):
        bboxes, kpss = self.det_model.detect(img, max_num=max_num, metric=det_metric)
        if bboxes.shape[0] == 0:
            return []
        faces = []
        for index in range(bboxes.shape[0]):
            bbox = bboxes[index, 0:4]
            det_score = float(bboxes[index, 4])
            kps = kpss[index] if kpss is not None else None
            face = self.Face(bbox=bbox, kps=kps, det_score=det_score)
            for taskname, model in self.models.items():
                if taskname == "detection":
                    continue
                model.get(img, face)
            faces.append(face)
        return faces


class FaceLibraryManager:
    def __init__(self, similarity_threshold: float | None = None):
        if similarity_threshold is None:
            similarity_threshold = float(os.getenv("FACE_RECOGNITION_SIMILARITY_THRESHOLD", "0.38"))
        self.similarity_threshold = similarity_threshold
        self.face_model: Optional[LocalFaceAnalysis] = None
        self.known_db: dict[str, dict[str, Any]] = {}
        self._loaded = False
        self._lock = Lock()
        self.det_size = self._parse_det_size(os.getenv("INSIGHTFACE_DET_SIZE", "640"))
        self.det_thresh = float(os.getenv("INSIGHTFACE_DET_THRESH", "0.45"))
        self.max_faces = int(os.getenv("INSIGHTFACE_MAX_FACES", "0") or "0")

    def ensure_loaded(self) -> bool:
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
            except Exception as exc:
                logger.error("Failed to initialize InsightFace service: %s", exc, exc_info=True)
                return False

    def reload_database(self):
        with self._lock:
            self._loaded = False
            self.known_db = {}
        self.ensure_loaded()

    def _parse_det_size(self, value: str) -> tuple[int, int]:
        raw = str(value or "640").lower().replace("x", ",")
        parts = [item.strip() for item in raw.split(",") if item.strip()]
        try:
            if len(parts) >= 2:
                return max(64, int(parts[0])), max(64, int(parts[1]))
            size = max(64, int(parts[0]))
            return size, size
        except Exception:
            return 640, 640

    def _model_dir(self) -> Path:
        configured = os.getenv("INSIGHTFACE_MODEL_DIR")
        if configured:
            return Path(configured).expanduser().resolve()
        return Path(__file__).resolve().parents[1] / "yolo_models" / "buffalo_l"

    def _providers(self) -> list[str]:
        try:
            import onnxruntime as ort

            available = list(ort.get_available_providers())
        except Exception:
            available = ["CPUExecutionProvider"]

        preferred = []
        env_providers = [item.strip() for item in os.getenv("INSIGHTFACE_PROVIDERS", "").split(",") if item.strip()]
        if env_providers:
            preferred.extend(env_providers)
        else:
            preferred.extend(["CUDAExecutionProvider", "CPUExecutionProvider"])

        providers = [provider for provider in preferred if provider in available]
        if not providers:
            providers = available or ["CPUExecutionProvider"]
        return providers

    def _ctx_id_for_providers(self, providers: list[str]) -> int:
        if "CUDAExecutionProvider" in providers:
            return int(os.getenv("INSIGHTFACE_CUDA_CTX_ID", "0"))
        return -1

    def _load_face_model(self):
        model_dir = self._model_dir()
        providers = self._providers()
        logger.info("Loading InsightFace buffalo_l from %s providers=%s", model_dir, providers)
        model = LocalFaceAnalysis(model_dir, providers=providers, allowed_modules=["detection", "recognition"])
        model.prepare(ctx_id=self._ctx_id_for_providers(providers), det_thresh=self.det_thresh, det_size=self.det_size)
        self.face_model = model
        self.face_device = "cuda" if "CUDAExecutionProvider" in providers else "cpu"
        logger.info("InsightFace buffalo_l loaded: device=%s det_size=%s threshold=%.3f", self.face_device, self.det_size, self.det_thresh)

    def _get_static_file_path(self, url_path: str) -> Optional[str]:
        if not url_path:
            return None
        face_path = find_face_file(url_path)
        if face_path:
            return str(face_path)
        alternate_face_path = find_alternate_person_face_file(url_path)
        if alternate_face_path:
            logger.warning(
                "Registered face image missing, using latest image for same personnel: faceImage=%s actual=%s",
                url_path,
                alternate_face_path,
            )
            return str(alternate_face_path)
        normalized = str(url_path).strip().replace("\\", "/")
        backend_root = Path(__file__).resolve().parents[3]
        app_root = Path(__file__).resolve().parents[2]
        cwd = Path.cwd()
        candidates: list[Path] = []
        if normalized.startswith("/static/"):
            relative_path = normalized.lstrip("/")
            candidates.extend([
                app_root / relative_path,
                backend_root / relative_path,
                cwd / relative_path,
                cwd / "backend" / relative_path,
                cwd / "backend" / "app" / relative_path,
            ])
        elif os.path.isabs(normalized):
            candidates.append(Path(normalized))
        else:
            relative_path = normalized.lstrip("/")
            candidates.extend([
                app_root / relative_path,
                backend_root / relative_path,
                cwd / relative_path,
                cwd / "backend" / relative_path,
                cwd / "backend" / "app" / relative_path,
            ])

        for candidate in candidates:
            if candidate.exists():
                return str(candidate)
            alternate = self._find_alternate_person_face_file(candidate)
            if alternate:
                logger.warning(
                    "Registered face image missing, using latest image for same personnel: expected=%s actual=%s",
                    candidate,
                    alternate,
                )
                return str(alternate)
        return str(candidates[0]) if candidates else None

    def _find_alternate_person_face_file(self, candidate: Path) -> Optional[Path]:
        try:
            if candidate.parent.name != "faces":
                return None
            stem = candidate.stem
            if "_" not in stem:
                return None
            personnel_id = stem.split("_", 1)[0]
            if not personnel_id or not candidate.parent.exists():
                return None
            allowed_exts = {".jpg", ".jpeg", ".png", ".webp"}
            matches = [
                item
                for item in candidate.parent.glob(f"{personnel_id}_*")
                if item.is_file() and item.suffix.lower() in allowed_exts
            ]
            if not matches:
                return None
            return max(matches, key=lambda item: item.stat().st_mtime)
        except Exception as exc:
            logger.warning("Failed to find alternate registered face image for %s: %s", candidate, exc)
            return None

    def _read_image(self, img_path: str) -> Optional[np.ndarray]:
        try:
            data = np.fromfile(img_path, dtype=np.uint8)
            if data.size == 0:
                return None
            return cv2.imdecode(data, cv2.IMREAD_COLOR)
        except Exception as exc:
            logger.warning("Failed to read face image: %s error=%s", img_path, exc)
            return None

    def _normalize_vector(self, vector: Any) -> Optional[np.ndarray]:
        if vector is None:
            return None
        arr = np.asarray(vector, dtype=np.float32).reshape(-1)
        if arr.size <= 0:
            return None
        norm = float(np.linalg.norm(arr))
        if norm <= 1e-12:
            return None
        return arr / norm

    def _face_embedding(self, face: Any) -> Optional[np.ndarray]:
        embedding = getattr(face, "normed_embedding", None)
        if embedding is None:
            embedding = getattr(face, "embedding", None)
        return self._normalize_vector(embedding)

    def _extract_best_face(self, cv2_img: np.ndarray):
        if self.face_model is None or cv2_img is None or cv2_img.size == 0:
            return None
        faces = self.face_model.get(cv2_img, max_num=1)
        if not faces:
            return None
        return max(faces, key=lambda face: float(getattr(face, "det_score", 0.0) or 0.0))

    def _extract_face_vector(self, cv2_img: np.ndarray) -> Optional[np.ndarray]:
        face = self._extract_best_face(cv2_img)
        if face is None:
            return None
        return self._face_embedding(face)

    def detect_and_match(self, frame: np.ndarray) -> dict[str, Any]:
        if not self.ensure_loaded() or self.face_model is None or frame is None:
            return {"success": False, "detections": []}

        try:
            frame_h, frame_w = frame.shape[:2]
            faces = self.face_model.get(frame, max_num=self.max_faces)
            detections = []
            for face in faces:
                bbox = getattr(face, "bbox", None)
                if bbox is None:
                    continue
                x1, y1, x2, y2 = [int(round(float(v))) for v in list(bbox)[:4]]
                x1 = max(0, min(frame_w, x1))
                y1 = max(0, min(frame_h, y1))
                x2 = max(0, min(frame_w, x2))
                y2 = max(0, min(frame_h, y2))
                if x2 <= x1 or y2 <= y1:
                    continue
                embedding = self._face_embedding(face)
                det = {
                    "label": "face",
                    "raw_label": "face",
                    "confidence": float(getattr(face, "det_score", 0.0) or 0.0),
                    "bbox": [x1, y1, x2, y2],
                    "coords": [x1, y1, x2, y2],
                    "model": "insightface/buffalo_l",
                }
                match = self.match_embedding(embedding)
                if match:
                    det.update(
                        {
                            "label": match["name"],
                            "person": match["person"],
                            "personName": match["name"],
                            "personnel_id": match["personnel_id"],
                            "similarity": match["similarity"],
                            "face_match_low_confidence": not bool(match.get("matched", True)),
                        }
                    )
                else:
                    det["label"] = "unknown"
                detections.append(det)
            return {"success": True, "detections": detections}
        except Exception as exc:
            logger.error("InsightFace detect_and_match failed: %s", exc, exc_info=True)
            return {"success": False, "detections": []}

    def _load_face_database(self):
        self.known_db = {}
        try:
            collection = get_personnel_collection()
            people = list(collection.find({"faceImage": {"$exists": True, "$ne": ""}}))
        except Exception as exc:
            logger.error("Failed to load personnel face database: %s", exc)
            return

        if not people:
            logger.warning("No personnel face images found in MongoDB.")
            return

        count = 0
        missing_count = 0
        unreadable_count = 0
        no_face_count = 0
        for person in people:
            personnel_id = str(person.get("_id"))
            name = person.get("username", "") or person.get("name", "") or "Unknown"
            dept = person.get("dept", person.get("department", ""))
            role = person.get("role", "")
            phone = person.get("phone", "")
            face_image = person.get("faceImage", "")
            img_path = self._get_static_file_path(face_image)

            if not img_path or not os.path.exists(img_path):
                missing_count += 1
                logger.warning("Skip missing registered face image: name=%s faceImage=%s resolved_path=%s", name, face_image, img_path)
                continue

            try:
                img_bgr = self._read_image(img_path)
                if img_bgr is None:
                    unreadable_count += 1
                    logger.warning("Unable to read registered face image: %s", img_path)
                    continue
                vec = self._extract_face_vector(img_bgr)
                if vec is None:
                    no_face_count += 1
                    logger.warning("No face embedding extracted from registered image: name=%s path=%s", name, img_path)
                    continue

                info_parts = [f"name: {name}"]
                if dept:
                    info_parts.append(f"dept: {dept}")
                if role:
                    info_parts.append(f"role: {role}")
                if phone:
                    info_parts.append(f"phone: {phone}")

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
                    },
                }
                count += 1
                logger.info("Registered InsightFace identity: name=%s id=%s path=%s", name, personnel_id, img_path)
            except Exception as exc:
                logger.error("Failed to register face identity: name=%s image=%s error=%s", name, face_image, exc)

        logger.info(
            "InsightFace face database loaded: %d identities, missing=%d, unreadable=%d, no_face=%d.",
            count,
            missing_count,
            unreadable_count,
            no_face_count,
        )

    def match_embedding(self, current_vec: Optional[np.ndarray]) -> Optional[dict]:
        if current_vec is None or not self.known_db:
            return None

        best_similarity = -1.0
        best_candidate = None
        for personnel_id, db_entry in self.known_db.items():
            db_vec = db_entry.get("vector")
            if db_vec is None:
                continue
            similarity = float(np.dot(current_vec, db_vec))
            if similarity > best_similarity:
                best_similarity = similarity
                person = db_entry["person"]
                best_candidate = {
                    "personnel_id": personnel_id,
                    "name": person.get("username", "Unknown"),
                    "info": db_entry.get("info", ""),
                    "similarity": similarity,
                    "person": person,
                    "matched": similarity >= self.similarity_threshold,
                }

        if not best_candidate:
            return None
        if best_candidate["matched"]:
            logger.info(
                "InsightFace matched: name=%s similarity=%.4f threshold=%.4f",
                best_candidate.get("name"),
                best_candidate.get("similarity", 0.0),
                self.similarity_threshold,
            )
        else:
            logger.info(
                "InsightFace low-confidence candidate: name=%s similarity=%.4f threshold=%.4f",
                best_candidate.get("name"),
                best_candidate.get("similarity", 0.0),
                self.similarity_threshold,
            )
        return best_candidate

    def match_face(self, face_crop: np.ndarray) -> Optional[dict]:
        if not self.ensure_loaded() or not self.known_db:
            return None
        try:
            current_vec = self._extract_face_vector(face_crop)
            return self.match_embedding(current_vec)
        except Exception as exc:
            logger.error("InsightFace face match failed: %s", exc)
            return None


face_library_manager = FaceLibraryManager()
