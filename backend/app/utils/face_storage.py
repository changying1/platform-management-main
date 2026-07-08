from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable, Optional

from app.utils.config_manager import get_system_settings


ALLOWED_FACE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
INVALID_FILENAME_CHARS = set('<>:"/\\|?*')


def backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


def project_root() -> Path:
    return backend_root().parent


def resolve_storage_root(path: str | None) -> Path:
    raw = str(path or "").strip()
    if raw:
        candidate = Path(raw)
        if candidate.is_absolute():
            return candidate.resolve()
        return (project_root() / candidate).resolve()
    return (backend_root() / "static").resolve()


def get_face_storage_root() -> Path:
    settings = get_system_settings()
    root = resolve_storage_root(settings.get("videoStoragePath"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def get_faces_dir() -> Path:
    faces_dir = get_face_storage_root() / "faces"
    faces_dir.mkdir(parents=True, exist_ok=True)
    return faces_dir


def safe_face_filename(filename: str) -> str:
    name = os.path.basename(str(filename or "").replace("\\", "/"))
    suffix = Path(name).suffix.lower()
    if not name or suffix not in ALLOWED_FACE_EXTS:
        raise ValueError("invalid face image filename")
    return name


def safe_filename_part(value: str | None, default: str = "person") -> str:
    text = str(value or "").strip()
    cleaned = "".join("_" if ch in INVALID_FILENAME_CHARS or ord(ch) < 32 else ch for ch in text)
    cleaned = "_".join(part for part in cleaned.replace("\t", "_").split() if part)
    cleaned = cleaned.strip("._ ")
    return (cleaned or default)[:48]


def get_face_file_path(filename: str) -> Path:
    return get_faces_dir() / safe_face_filename(filename)


def get_face_public_url(filename: str) -> str:
    return f"/static/faces/{safe_face_filename(filename)}"


def _legacy_face_dirs() -> Iterable[Path]:
    cwd = Path.cwd()
    yield backend_root() / "static" / "faces"
    yield backend_root() / "app" / "static" / "faces"
    yield cwd / "static" / "faces"
    yield cwd / "backend" / "static" / "faces"
    yield cwd / "backend" / "app" / "static" / "faces"


def iter_face_dirs(include_legacy: bool = True) -> list[Path]:
    dirs: list[Path] = [get_faces_dir()]
    if include_legacy:
        dirs.extend(_legacy_face_dirs())

    deduped: list[Path] = []
    seen: set[str] = set()
    for item in dirs:
        try:
            key = str(item.resolve())
        except Exception:
            key = str(item.absolute())
        if key not in seen:
            seen.add(key)
            deduped.append(item)
    return deduped


def face_filename_from_url(url_path: str) -> Optional[str]:
    if not url_path:
        return None
    normalized = str(url_path).strip().replace("\\", "/")
    if normalized.startswith("/static/faces/"):
        return os.path.basename(normalized)
    if normalized.startswith("static/faces/"):
        return os.path.basename(normalized)
    return os.path.basename(normalized)


def find_face_file(url_path_or_filename: str, include_legacy: bool = True) -> Optional[Path]:
    filename = face_filename_from_url(url_path_or_filename)
    if not filename:
        return None
    try:
        safe_name = safe_face_filename(filename)
    except ValueError:
        return None

    for faces_dir in iter_face_dirs(include_legacy=include_legacy):
        candidate = faces_dir / safe_name
        if candidate.is_file():
            return candidate
    return None


def find_alternate_person_face_file(url_path_or_filename: str, include_legacy: bool = True) -> Optional[Path]:
    filename = face_filename_from_url(url_path_or_filename)
    if not filename:
        return None
    stem = Path(filename).stem
    parts = [part for part in stem.split("_") if part]
    personnel_id = next((part for part in parts if len(part) >= 12 and all(ch in "0123456789abcdefABCDEF" for ch in part)), None)
    if personnel_id is None and parts:
        personnel_id = parts[0]
    if not personnel_id:
        return None

    matches: list[Path] = []
    for faces_dir in iter_face_dirs(include_legacy=include_legacy):
        if not faces_dir.exists():
            continue
        for item in faces_dir.glob(f"*{personnel_id}*"):
            if item.is_file() and item.suffix.lower() in ALLOWED_FACE_EXTS:
                matches.append(item)
    if not matches:
        return None
    return max(matches, key=lambda item: item.stat().st_mtime)
