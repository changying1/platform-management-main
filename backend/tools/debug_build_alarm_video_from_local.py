#!/usr/bin/env python
"""
Build a local debug alarm-video copy from a snapshot anchor.

This script intentionally does not call or modify the production alarm video
pipeline. It uses a local alarm snapshot as the trusted time anchor, cuts
overlapping local recording MP4s, and can either draw the older temporary
debug box or replace the alarm second with the original alarm snapshot.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import shlex
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


SCRIPT_PATH = Path(__file__).resolve()
BACKEND_DIR = SCRIPT_PATH.parents[1]
REPO_DIR = BACKEND_DIR.parent
DEFAULT_FFMPEG = REPO_DIR / "ffmpeg-8.0.1-essentials_build" / "bin" / "ffmpeg.exe"
DEFAULT_OUTPUT = BACKEND_DIR / "static" / "alarms" / "videos" / "debug_alarm_video_boxed.mp4"


@dataclass(frozen=True)
class Segment:
    path: Path
    start: datetime
    end: datetime
    duration: float


@dataclass
class SnapshotCandidate:
    path: Path
    snapshot_time: datetime
    snapshot_time_source: str
    alarm_id: str | None
    device_id: str | None
    alarm_data: dict[str, Any]
    bbox_original: list[float] | None
    bbox_mode: str
    bbox_norm: list[float] | None
    bbox_source: str
    notes: list[str]
    bbox_original_pixel: list[int] | None = None
    image_width: int | None = None
    image_height: int | None = None
    red_box_candidates: list[dict[str, Any]] | None = None


def log(message: str) -> None:
    print(f"[debug_alarm_video] {message}", flush=True)


def fail(message: str) -> None:
    raise SystemExit(f"[debug_alarm_video] ERROR: {message}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build raw and boxed debug alarm videos from local snapshot/recording files."
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--records-dir", help="Directory containing local recording MP4 files.")
    source.add_argument("--record-video", help="Single local recording MP4 file.")
    parser.add_argument("--snapshot-image", help="Local alarm snapshot image path.")
    parser.add_argument("--snapshot-time", help="Snapshot time. If omitted, parse from image filename.")
    parser.add_argument("--bbox", help="BBox as x1,y1,x2,y2.")
    parser.add_argument(
        "--bbox-mode",
        choices=("norm", "pixel"),
        default="pixel",
        help="Mode for --bbox. norm means 0..1, pixel means snapshot-image pixels.",
    )
    parser.add_argument("--alarm-json", help="Optional alarm record JSON file.")
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="Boxed output path. Raw video/meta JSON are written beside it.",
    )
    parser.add_argument(
        "--window-seconds",
        type=float,
        default=30.0,
        help="Seconds before/after record_anchor_time to request from recordings.",
    )
    parser.add_argument(
        "--recording-time-offset-seconds",
        type=float,
        default=0.0,
        help=(
            "Compensation seconds from recording filename/segment timeline to the real video watermark timeline. "
            "record_anchor_time = snapshot_time + this value."
        ),
    )
    parser.add_argument(
        "--replace-snapshot-second",
        action="store_true",
        help="Replace the alarm-second video picture with the original alarm snapshot instead of drawing bbox.",
    )
    parser.add_argument(
        "--snapshot-replace-duration-seconds",
        type=float,
        default=1.0,
        help="Duration in seconds for the snapshot replacement window.",
    )
    parser.add_argument(
        "--box-before-seconds",
        type=float,
        default=1.0,
        help="Seconds before alarm_second to show the box.",
    )
    parser.add_argument(
        "--box-after-seconds",
        type=float,
        default=2.0,
        help="Seconds after alarm_second to show the box.",
    )
    parser.add_argument(
        "--ffmpeg",
        default=os.getenv("FFMPEG_PATH", str(DEFAULT_FFMPEG)),
        help="ffmpeg executable path.",
    )
    parser.add_argument("--ffprobe", help="ffprobe executable path. Defaults to ffmpeg directory.")
    parser.add_argument(
        "--observed-video-time-at-alarm-second",
        help=(
            "Optional manual inspection timestamp seen in the video at alarm_second. "
            "It is written to meta only and never used to adjust the clip."
        ),
    )
    parser.add_argument("--batch-date", help="Batch date as YYYYMMDD, e.g. 20260625.")
    parser.add_argument("--batch-time-start", default="12:00:00", help="Batch time range start, HH:MM:SS.")
    parser.add_argument("--batch-time-end", default="18:59:59", help="Batch time range end, HH:MM:SS.")
    parser.add_argument("--max-snapshots", type=int, default=3, help="Maximum usable snapshots for batch mode.")
    parser.add_argument(
        "--offset-sweep",
        default="0,8,10,12",
        help="Comma-separated recording offsets to build in batch mode.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(BACKEND_DIR / "static" / "alarms" / "videos" / "debug_20260625_afternoon"),
        help="Batch output directory.",
    )
    return parser.parse_args()


def offset_label(offset_seconds: float) -> str:
    if abs(offset_seconds) < 0.0005:
        return "no_offset"
    rounded = round(offset_seconds)
    if abs(offset_seconds - rounded) < 0.0005:
        value = str(int(rounded))
    else:
        value = f"{offset_seconds:.3f}".rstrip("0").rstrip(".")
    value = value.replace("-", "minus_").replace(".", "p")
    return f"offset_{value}s"


def derive_output_paths(output_arg: str, offset_seconds: float) -> tuple[Path, Path, Path]:
    label = offset_label(offset_seconds)
    default_output = resolve_path(DEFAULT_OUTPUT)
    requested_output = resolve_path(output_arg)

    if requested_output == default_output:
        output_boxed = default_output.with_name(f"debug_alarm_video_boxed_{label}.mp4")
    else:
        output_boxed = requested_output

    if "boxed" in output_boxed.stem:
        raw_name = output_boxed.name.replace("boxed", "raw", 1)
        meta_name = output_boxed.with_suffix(".json").name.replace("boxed", "meta", 1)
    elif "snapshot_replace" in output_boxed.stem:
        raw_name = output_boxed.name.replace("snapshot_replace", "raw", 1)
        meta_name = output_boxed.with_suffix(".json").name.replace("snapshot_replace", "meta_snapshot_replace", 1)
    else:
        raw_name = f"{output_boxed.stem}_raw.mp4"
        meta_name = f"{output_boxed.stem}_meta.json"

    return output_boxed, output_boxed.with_name(raw_name), output_boxed.with_name(meta_name)


def resolve_path(value: str | os.PathLike[str]) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()
    return path


def ffprobe_from_ffmpeg(ffmpeg_path: Path, explicit: str | None) -> Path:
    if explicit:
        return resolve_path(explicit)
    exe = "ffprobe.exe" if os.name == "nt" else "ffprobe"
    return ffmpeg_path.parent / exe


def run_command(cmd: list[str], step: str, timeout: float | None = None) -> subprocess.CompletedProcess[str]:
    pretty = " ".join(shlex.quote(str(part)) for part in cmd)
    log(f"{step}: {pretty}")
    try:
        proc = subprocess.run(
            [str(part) for part in cmd],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        fail(f"{step} executable not found: {exc}")
    except subprocess.TimeoutExpired as exc:
        fail(f"{step} timed out after {timeout}s: {exc}")
    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()[-2000:]
        stdout = (proc.stdout or "").strip()[-1000:]
        fail(f"{step} failed with code {proc.returncode}. stderr={stderr} stdout={stdout}")
    return proc


def parse_datetime_value(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, dict):
        if "$date" in value:
            return parse_datetime_value(value.get("$date"))
        for key in ("date", "datetime", "time", "timestamp"):
            if key in value:
                parsed = parse_datetime_value(value.get(key))
                if parsed:
                    return parsed
        return None
    if isinstance(value, (int, float)):
        try:
            numeric = float(value)
            if numeric > 10_000_000_000:
                numeric /= 1000.0
            return datetime.fromtimestamp(numeric)
        except Exception:
            return None

    text = str(value).strip()
    if not text:
        return None
    text = text.replace("T", " ").replace("Z", "")
    text = re.sub(r"([+-]\d{2}:?\d{2})$", "", text).strip()

    formats = (
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d_%H-%M-%S",
        "%Y-%m-%d_%H:%M:%S",
        "%Y%m%d_%H%M%S",
        "%Y%m%d%H%M%S",
        "%Y/%m/%d %H:%M:%S",
    )
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            pass

    parsed = parse_datetime_from_name(text)
    return parsed


def parse_datetime_from_name(name: str) -> datetime | None:
    base = Path(str(name)).name
    patterns = (
        (r"(?<!\d)(\d{8})[_-](\d{6})(?!\d)", "%Y%m%d%H%M%S"),
        (r"(?<!\d)(\d{14})(?!\d)", "%Y%m%d%H%M%S"),
        (
            r"(?<!\d)(\d{4})[-_](\d{2})[-_](\d{2})[ _T-]+(\d{2})[-_:](\d{2})[-_:](\d{2})(?!\d)",
            "%Y%m%d%H%M%S",
        ),
    )
    for pattern, fmt in patterns:
        match = re.search(pattern, base)
        if not match:
            continue
        try:
            if len(match.groups()) == 2:
                text = "".join(match.groups())
            elif len(match.groups()) == 1:
                text = match.group(1)
            else:
                text = "".join(match.groups())
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def probe_json(ffprobe: Path, file_path: Path, entries: str) -> dict[str, Any]:
    cmd = [
        str(ffprobe),
        "-v",
        "error",
        "-show_entries",
        entries,
        "-of",
        "json",
        str(file_path),
    ]
    proc = run_command(cmd, "ffprobe", timeout=15)
    try:
        return json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc:
        fail(f"ffprobe returned invalid JSON for {file_path}: {exc}")


def probe_with_ffmpeg(ffmpeg: Path, file_path: Path) -> str:
    cmd = [str(ffmpeg), "-hide_banner", "-i", str(file_path)]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=15,
    )
    return (proc.stderr or "") + "\n" + (proc.stdout or "")


def parse_duration_text(text: str) -> float | None:
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    if not match:
        return None
    hours, minutes, seconds = match.groups()
    try:
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    except ValueError:
        return None


def parse_video_size_text(text: str) -> tuple[int, int] | None:
    for line in text.splitlines():
        if "Video:" not in line:
            continue
        match = re.search(r"(?<!\d)(\d{2,5})x(\d{2,5})(?!\d)", line)
        if not match:
            continue
        width, height = int(match.group(1)), int(match.group(2))
        if width > 0 and height > 0:
            return width, height
    return None


def probe_duration(ffprobe: Path | None, ffmpeg: Path, file_path: Path) -> float:
    if ffprobe:
        data = probe_json(ffprobe, file_path, "format=duration")
        raw = ((data.get("format") or {}).get("duration") or "").strip()
        try:
            duration = float(raw)
        except (TypeError, ValueError):
            fail(f"could not read duration for {file_path}")
    else:
        duration = parse_duration_text(probe_with_ffmpeg(ffmpeg, file_path)) or 0.0
    if duration <= 0:
        fail(f"non-positive duration for {file_path}: {duration}")
    return duration


def probe_video_size(ffprobe: Path | None, ffmpeg: Path, file_path: Path) -> tuple[int, int]:
    if ffprobe:
        data = probe_json(ffprobe, file_path, "stream=width,height")
        streams = data.get("streams") or []
        for stream in streams:
            try:
                width = int(stream.get("width"))
                height = int(stream.get("height"))
            except (TypeError, ValueError):
                continue
            if width > 0 and height > 0:
                return width, height
    else:
        size = parse_video_size_text(probe_with_ffmpeg(ffmpeg, file_path))
        if size:
            return size
    fail(f"could not read width/height for {file_path}")


def probe_video_fps(ffprobe: Path | None, ffmpeg: Path, file_path: Path) -> float | None:
    if ffprobe:
        data = probe_json(ffprobe, file_path, "stream=r_frame_rate,avg_frame_rate")
        streams = data.get("streams") or []
        for stream in streams:
            for key in ("avg_frame_rate", "r_frame_rate"):
                value = str(stream.get(key) or "")
                if "/" in value:
                    numerator, denominator = value.split("/", 1)
                    try:
                        fps = float(numerator) / float(denominator)
                    except (TypeError, ValueError, ZeroDivisionError):
                        continue
                    if fps > 0:
                        return fps
                else:
                    try:
                        fps = float(value)
                    except (TypeError, ValueError):
                        continue
                    if fps > 0:
                        return fps
    text = probe_with_ffmpeg(ffmpeg, file_path)
    match = re.search(r"(?<!\d)(\d+(?:\.\d+)?)\s+fps", text)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


def load_alarm_json(path: Path | None) -> dict[str, Any]:
    if not path:
        return {}
    if not path.exists():
        fail(f"--alarm-json does not exist: {path}")
    with path.open("r", encoding="utf-8-sig") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        fail("--alarm-json must contain a JSON object")
    return data


def value_at_path(data: Any, path: tuple[str, ...]) -> Any:
    current = data
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def first_datetime_from_json(data: dict[str, Any]) -> tuple[datetime | None, str]:
    paths = [
        ("snapshot_time",),
        ("image_time",),
        ("capture_time",),
        ("alarm", "snapshot_time"),
        ("details", "snapshot_time"),
        ("metadata", "snapshot_time"),
    ]
    for path in paths:
        value = value_at_path(data, path)
        parsed = parse_datetime_value(value)
        if parsed:
            return parsed, ".".join(path)

    for path in [
        ("alarm_image_path",),
        ("snapshot_image",),
        ("image_path",),
        ("alarm", "alarm_image_path"),
        ("details", "alarm_image_path"),
    ]:
        value = value_at_path(data, path)
        if value:
            parsed = parse_datetime_from_name(str(value))
            if parsed:
                return parsed, ".".join(path) + ".filename"
    return None, ""


def parse_bbox_text(text: str) -> list[float]:
    parts = [part.strip() for part in text.split(",")]
    if len(parts) != 4:
        fail("--bbox must be formatted as x1,y1,x2,y2")
    try:
        values = [float(part) for part in parts]
    except ValueError:
        fail("--bbox contains a non-numeric value")
    return values


def list4(value: Any) -> list[float] | None:
    if isinstance(value, dict):
        if all(key in value for key in ("x1", "y1", "x2", "y2")):
            source = [value["x1"], value["y1"], value["x2"], value["y2"]]
        elif all(key in value for key in ("left", "top", "right", "bottom")):
            source = [value["left"], value["top"], value["right"], value["bottom"]]
        else:
            return None
    elif isinstance(value, (list, tuple)) and len(value) >= 4:
        source = list(value[:4])
    else:
        return None
    try:
        return [float(item) for item in source]
    except (TypeError, ValueError):
        return None


def bbox_mode_from_values(values: list[float], key_hint: str, default_mode: str) -> str:
    if "norm" in key_hint.lower():
        return "norm"
    if all(0.0 <= item <= 1.0 for item in values):
        return "norm"
    return default_mode


def find_bbox_in_container(container: Any, default_mode: str = "pixel") -> tuple[list[float] | None, str, str]:
    if isinstance(container, dict):
        for key in ("coords_norm", "bbox_norm", "normalized_bbox"):
            values = list4(container.get(key))
            if values:
                return values, "norm", key
        for key in ("coords", "bbox", "bounding_box", "box"):
            values = list4(container.get(key))
            if values:
                return values, bbox_mode_from_values(values, key, default_mode), key
        for key in ("boxes", "detections", "detection_results", "objects", "results"):
            child = container.get(key)
            values, mode, source = find_bbox_in_container(child, default_mode)
            if values:
                return values, mode, f"{key}.{source}"
    elif isinstance(container, list):
        direct = list4(container)
        if direct:
            return direct, bbox_mode_from_values(direct, "list", default_mode), "list"
        for index, item in enumerate(container):
            values, mode, source = find_bbox_in_container(item, default_mode)
            if values:
                return values, mode, f"{index}.{source}"
    return None, "", ""


def normalize_bbox(
    bbox: list[float],
    mode: str,
    image_width: int,
    image_height: int,
) -> list[float]:
    x1, y1, x2, y2 = bbox
    if x2 < x1:
        x1, x2 = x2, x1
    if y2 < y1:
        y1, y2 = y2, y1

    if mode == "norm":
        norm = [x1, y1, x2, y2]
    else:
        if image_width <= 0 or image_height <= 0:
            fail("pixel bbox requires a valid snapshot image width/height")
        norm = [x1 / image_width, y1 / image_height, x2 / image_width, y2 / image_height]

    norm = [max(0.0, min(1.0, item)) for item in norm]
    if norm[2] <= norm[0] or norm[3] <= norm[1]:
        fail(f"bbox is empty after normalization: original={bbox} norm={norm}")
    return norm


def run_binary_command(cmd: list[str], step: str, timeout: float | None = None) -> bytes:
    pretty = " ".join(shlex.quote(str(part)) for part in cmd)
    log(f"{step}: {pretty}")
    try:
        proc = subprocess.run(
            [str(part) for part in cmd],
            capture_output=True,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        fail(f"{step} executable not found: {exc}")
    except subprocess.TimeoutExpired as exc:
        fail(f"{step} timed out after {timeout}s: {exc}")
    if proc.returncode != 0:
        stderr = (proc.stderr or b"")[-2000:].decode("utf-8", errors="replace")
        stdout = (proc.stdout or b"")[-1000:].decode("utf-8", errors="replace")
        fail(f"{step} failed with code {proc.returncode}. stderr={stderr} stdout={stdout}")
    return proc.stdout or b""


def read_image_rgb(snapshot_image_path: Path, ffmpeg: Path, ffprobe: Path | None) -> tuple[int, int, bytes]:
    width, height = probe_video_size(ffprobe, ffmpeg, snapshot_image_path)
    cmd = [
        str(ffmpeg),
        "-v",
        "error",
        "-i",
        str(snapshot_image_path),
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
    ]
    pixels = run_binary_command(cmd, "ffmpeg decode snapshot rgb", timeout=30)
    expected = width * height * 3
    if len(pixels) < expected:
        fail(f"decoded image is too small: got={len(pixels)} expected={expected}")
    return width, height, pixels[:expected]


def dilate_mask(mask: bytearray, width: int, height: int, radius: int = 2) -> bytearray:
    result = bytearray(len(mask))
    for index, value in enumerate(mask):
        if not value:
            continue
        y, x = divmod(index, width)
        y1 = max(0, y - radius)
        y2 = min(height - 1, y + radius)
        x1 = max(0, x - radius)
        x2 = min(width - 1, x + radius)
        for yy in range(y1, y2 + 1):
            base = yy * width
            result[base + x1 : base + x2 + 1] = b"\x01" * (x2 - x1 + 1)
    return result


def red_mask_from_rgb(pixels: bytes, width: int, height: int) -> bytearray:
    mask = bytearray(width * height)
    for index in range(width * height):
        offset = index * 3
        r = pixels[offset]
        g = pixels[offset + 1]
        b = pixels[offset + 2]
        if r >= 150 and g <= 125 and b <= 125 and r >= g + 45 and r >= b + 45:
            mask[index] = 1
    return mask


def score_red_box_candidate(candidate: dict[str, Any], width: int, height: int) -> float:
    bw = candidate["x2"] - candidate["x1"] + 1
    bh = candidate["y2"] - candidate["y1"] + 1
    bbox_area = max(1, bw * bh)
    component_pixels = candidate["component_pixels"]
    fill_ratio = component_pixels / bbox_area
    aspect = bw / max(1, bh)
    rectangularity = 1.0 - min(1.0, abs(fill_ratio - 0.18) / 0.35)
    size_score = min(1.0, bbox_area / max(1.0, width * height * 0.08))
    aspect_score = 0.4 if aspect < 0.15 or aspect > 8.0 else 1.0
    return round((size_score * 2.0 + rectangularity + aspect_score) * bbox_area, 3)


def find_red_box_candidates(mask: bytearray, width: int, height: int) -> list[dict[str, Any]]:
    expanded = dilate_mask(mask, width, height, radius=2)
    visited = bytearray(width * height)
    candidates: list[dict[str, Any]] = []
    min_w = max(12, int(width * 0.02))
    min_h = max(12, int(height * 0.02))
    min_area = max(80, int(width * height * 0.0004))

    for start in range(width * height):
        if not expanded[start] or visited[start]:
            continue
        stack = [start]
        visited[start] = 1
        x0 = x1 = start % width
        y0 = y1 = start // width
        count = 0
        red_count = 0
        while stack:
            index = stack.pop()
            count += 1
            if mask[index]:
                red_count += 1
            y, x = divmod(index, width)
            if x < x0:
                x0 = x
            if x > x1:
                x1 = x
            if y < y0:
                y0 = y
            if y > y1:
                y1 = y
            for neighbor in (index - 1, index + 1, index - width, index + width):
                if neighbor < 0 or neighbor >= width * height:
                    continue
                if neighbor == index - 1 and x == 0:
                    continue
                if neighbor == index + 1 and x == width - 1:
                    continue
                if expanded[neighbor] and not visited[neighbor]:
                    visited[neighbor] = 1
                    stack.append(neighbor)

        bw = x1 - x0 + 1
        bh = y1 - y0 + 1
        bbox_area = bw * bh
        if bw < min_w or bh < min_h or bbox_area < min_area or red_count < 20:
            continue
        if (bw > width * 0.94 and bh > height * 0.90) or (bw > width * 0.90 and bh > height * 0.96):
            continue
        aspect = bw / max(1, bh)
        if aspect < 0.08 or aspect > 12.0:
            continue
        candidate = {
            "x1": x0,
            "y1": y0,
            "x2": x1,
            "y2": y1,
            "width": bw,
            "height": bh,
            "bbox_area": bbox_area,
            "component_pixels": count,
            "red_pixels": red_count,
            "fill_ratio": round(count / max(1, bbox_area), 4),
            "red_fill_ratio": round(red_count / max(1, bbox_area), 4),
            "aspect_ratio": round(aspect, 4),
        }
        candidate["score"] = score_red_box_candidate(candidate, width, height)
        candidates.append(candidate)

    candidates.sort(key=lambda item: item["score"], reverse=True)
    return candidates


def extract_bbox_from_red_box(
    snapshot_image_path: str | os.PathLike[str],
    ffmpeg: Path | None = None,
    ffprobe: Path | None = None,
) -> tuple[list[float] | None, dict[str, Any]]:
    image_path = resolve_path(snapshot_image_path)
    target_ffmpeg = ffmpeg or resolve_path(os.getenv("FFMPEG_PATH", str(DEFAULT_FFMPEG)))
    target_ffprobe = ffprobe
    if target_ffprobe is None:
        candidate_ffprobe = ffprobe_from_ffmpeg(target_ffmpeg, None)
        target_ffprobe = candidate_ffprobe if candidate_ffprobe.exists() else None

    width, height, pixels = read_image_rgb(image_path, target_ffmpeg, target_ffprobe)
    mask = red_mask_from_rgb(pixels, width, height)
    candidates = find_red_box_candidates(mask, width, height)
    if not candidates:
        return None, {
            "image_width": width,
            "image_height": height,
            "bbox_original_pixel": None,
            "red_box_candidates": [],
            "reason": "no red rectangle candidates",
        }

    selected = candidates[0]
    pad = 4
    x1 = max(0, int(selected["x1"]) - pad)
    y1 = max(0, int(selected["y1"]) - pad)
    x2 = min(width - 1, int(selected["x2"]) + pad)
    y2 = min(height - 1, int(selected["y2"]) + pad)
    bbox_pixel = [x1, y1, x2, y2]
    bbox_norm = normalize_bbox([float(x1), float(y1), float(x2), float(y2)], "pixel", width, height)
    details = {
        "image_width": width,
        "image_height": height,
        "bbox_original_pixel": bbox_pixel,
        "red_box_candidates": candidates[:10],
        "selected_red_box_candidate": selected,
        "reason": "ok",
    }
    return bbox_norm, details


def draw_bbox_overlay(
    ffmpeg: Path,
    snapshot_image: Path,
    output_path: Path,
    bbox_pixel: list[int],
) -> None:
    x1, y1, x2, y2 = bbox_pixel
    box_w = max(1, x2 - x1)
    box_h = max(1, y2 - y1)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(ffmpeg),
        "-y",
        "-i",
        str(snapshot_image),
        "-vf",
        f"drawbox=x={x1}:y={y1}:w={box_w}:h={box_h}:color=yellow:t=3",
        "-frames:v",
        "1",
        "-q:v",
        "2",
        str(output_path),
    ]
    run_command(cmd, "ffmpeg draw detected bbox overlay", timeout=60)


def resolve_snapshot_time(args: argparse.Namespace, alarm_data: dict[str, Any], snapshot_image: Path) -> tuple[datetime, str]:
    if args.snapshot_time:
        parsed = parse_datetime_value(args.snapshot_time)
        if not parsed:
            fail(f"could not parse --snapshot-time: {args.snapshot_time}")
        return parsed, "argument.snapshot_time"

    parsed, source = first_datetime_from_json(alarm_data)
    if parsed:
        return parsed, f"alarm_json.{source}"

    parsed = parse_datetime_from_name(snapshot_image.name)
    if parsed:
        return parsed, "snapshot_image.filename"

    fail("could not parse snapshot_time from filename or JSON; pass --snapshot-time explicitly")


def resolve_bbox(
    args: argparse.Namespace,
    alarm_data: dict[str, Any],
    snapshot_image_size: tuple[int, int],
) -> tuple[list[float], str, list[float], str]:
    if args.bbox:
        original = parse_bbox_text(args.bbox)
        mode = args.bbox_mode
        source = "argument.bbox"
    else:
        original, mode, source = find_bbox_in_container(alarm_data)
        if not original:
            fail("bbox missing; pass --bbox or provide --alarm-json with coords/coords_norm/bbox data")
        source = f"alarm_json.{source}"

    width, height = snapshot_image_size
    norm = normalize_bbox(original, mode, width, height)
    return original, mode, norm, source


def collect_record_videos(args: argparse.Namespace) -> list[Path]:
    if args.record_video:
        video = resolve_path(args.record_video)
        if not video.exists():
            fail(f"--record-video does not exist: {video}")
        return [video]

    records_dir = resolve_path(args.records_dir)
    if not records_dir.is_dir():
        fail(f"--records-dir does not exist or is not a directory: {records_dir}")
    videos = sorted(path for path in records_dir.rglob("*.mp4") if path.is_file())
    if not videos:
        fail(f"no mp4 files found under --records-dir: {records_dir}")
    return videos


def collect_segments(
    videos: list[Path],
    request_start: datetime,
    request_end: datetime,
    ffprobe: Path | None,
    ffmpeg: Path,
) -> list[Segment]:
    segments: list[Segment] = []
    skipped_no_time = 0
    parsed_videos: list[tuple[Path, datetime]] = []
    for video in videos:
        start = parse_datetime_from_name(video.name)
        if not start:
            skipped_no_time += 1
            continue
        parsed_videos.append((video, start))

    parsed_videos.sort(key=lambda item: item[1])
    probed_count = 0
    for index, (video, start) in enumerate(parsed_videos):
        next_start = None
        for _, candidate_start in parsed_videos[index + 1:]:
            if candidate_start > start:
                next_start = candidate_start
                break

        coarse_end = next_start or (start + timedelta(hours=6))
        if coarse_end <= request_start or start >= request_end:
            continue

        probed_count += 1
        duration = probe_duration(ffprobe, ffmpeg, video)
        end = start + timedelta(seconds=duration)
        if end > request_start and start < request_end:
            segments.append(Segment(video, start, end, duration))
    segments.sort(key=lambda item: item.start)

    if skipped_no_time:
        log(f"skipped {skipped_no_time} mp4 file(s) because filename start time was not parseable")
    log(f"probed {probed_count} candidate mp4 file(s) after filename-time coarse filtering")
    if not segments:
        fail("no recording segment overlaps the requested snapshot window")
    return segments


def build_concat_list(segments: list[Segment], path: Path) -> None:
    with path.open("w", encoding="utf-8") as f:
        for segment in segments:
            safe_path = segment.path.as_posix().replace("'", r"'\''")
            f.write(f"file '{safe_path}'\n")


def run_clip_build(
    ffmpeg: Path,
    segments: list[Segment],
    request_start: datetime,
    request_end: datetime,
    output_raw: Path,
) -> tuple[datetime, datetime]:
    actual_start = max(request_start, segments[0].start)
    actual_end = min(request_end, max(segment.end for segment in segments))
    if actual_end <= actual_start:
        fail("selected segment overlap produced an empty clip")

    output_raw.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="debug_alarm_video_") as temp_dir:
        temp_dir_path = Path(temp_dir)
        concat_list = temp_dir_path / "concat.txt"
        concat_video = temp_dir_path / "concat.mp4"
        build_concat_list(segments, concat_list)

        concat_cmd = [
            str(ffmpeg),
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_list),
            "-c",
            "copy",
            str(concat_video),
        ]
        concat_proc = subprocess.run(
            concat_cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if concat_proc.returncode != 0:
            log(f"concat copy failed; retrying with reencode. stderr={(concat_proc.stderr or '').strip()[-800:]}")
            concat_cmd = [
                str(ffmpeg),
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list),
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                str(concat_video),
            ]
            run_command(concat_cmd, "ffmpeg concat fallback", timeout=180)
        else:
            log("ffmpeg concat copy succeeded")

        clip_offset = max(0.0, (actual_start - segments[0].start).total_seconds())
        clip_duration = max(0.001, (actual_end - actual_start).total_seconds())
        trim_cmd = [
            str(ffmpeg),
            "-y",
            "-ss",
            f"{clip_offset:.3f}",
            "-i",
            str(concat_video),
            "-t",
            f"{clip_duration:.3f}",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(output_raw),
        ]
        run_command(trim_cmd, "ffmpeg trim raw clip", timeout=180)
    return actual_start, actual_end


def escape_drawbox_expr(value: str) -> str:
    return value.replace("\\", "\\\\").replace(":", r"\:").replace("'", r"\'")


def run_drawbox(
    ffmpeg: Path,
    input_raw: Path,
    output_boxed: Path,
    bbox_norm: list[float],
    output_size: tuple[int, int],
    box_start: float,
    box_end: float,
) -> dict[str, int]:
    width, height = output_size
    x1 = int(round(bbox_norm[0] * width))
    y1 = int(round(bbox_norm[1] * height))
    x2 = int(round(bbox_norm[2] * width))
    y2 = int(round(bbox_norm[3] * height))
    x1 = max(0, min(width - 1, x1))
    y1 = max(0, min(height - 1, y1))
    x2 = max(x1 + 1, min(width, x2))
    y2 = max(y1 + 1, min(height, y2))
    box_w = max(1, x2 - x1)
    box_h = max(1, y2 - y1)

    enable = escape_drawbox_expr(f"between(t,{box_start:.3f},{box_end:.3f})")
    drawbox = f"drawbox=x={x1}:y={y1}:w={box_w}:h={box_h}:color=red:t=6:enable='{enable}'"
    cmd = [
        str(ffmpeg),
        "-y",
        "-i",
        str(input_raw),
        "-vf",
        drawbox,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        str(output_boxed),
    ]
    run_command(cmd, "ffmpeg drawbox boxed clip", timeout=180)
    return {"x": x1, "y": y1, "w": box_w, "h": box_h}


def run_snapshot_replace(
    ffmpeg: Path,
    input_raw: Path,
    snapshot_image: Path,
    output_video: Path,
    output_size: tuple[int, int],
    replace_start: float,
    replace_end: float,
) -> None:
    width, height = output_size
    enable = escape_drawbox_expr(f"between(t,{replace_start:.3f},{replace_end:.3f})")
    snapshot_filter = (
        f"[1:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
        "setsar=1,format=yuv420p[snapshot];"
        f"[0:v][snapshot]overlay=0:0:enable='{enable}'[v]"
    )
    output_video.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(ffmpeg),
        "-y",
        "-i",
        str(input_raw),
        "-loop",
        "1",
        "-i",
        str(snapshot_image),
        "-filter_complex",
        snapshot_filter,
        "-map",
        "[v]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        "-shortest",
        str(output_video),
    ]
    run_command(cmd, "ffmpeg replace alarm second with snapshot", timeout=180)


def write_meta(path: Path, meta: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write("\n")


def local_href(path: Path, base_dir: Path) -> str:
    try:
        href = path.resolve().relative_to(base_dir.resolve()).as_posix()
    except ValueError:
        href = path.resolve().as_posix()
    return href.replace("#", "%23").replace("?", "%3F")


def write_preview_html(path: Path, video_path: Path, meta: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "snapshot_time",
        "recording_time_offset_seconds",
        "record_anchor_time",
        "actual_clip_start",
        "actual_clip_end",
        "actual_duration",
        "alarm_second",
        "replace_start",
        "replace_end",
        "output_video",
    ]
    rows = "\n".join(
        f"<tr><th>{key}</th><td>{str(meta.get(key, '')).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')}</td></tr>"
        for key in fields
    )
    alarm_second = float(meta.get("alarm_second") or 0.0)
    actual_duration = max(0.001, float(meta.get("actual_duration") or 0.001))
    alarm_percent = max(0.0, min(100.0, alarm_second / actual_duration * 100.0))
    video_src = local_href(video_path, path.parent)
    html_text = f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Snapshot Replace Preview</title>
  <style>
    body {{ margin: 24px; font-family: Arial, "Microsoft YaHei", sans-serif; background: #f7f7f5; color: #222; }}
    main {{ max-width: 1040px; margin: 0 auto; }}
    video {{ width: 100%; background: #000; display: block; }}
    .bar {{ position: relative; height: 16px; margin: 14px 0 22px; background: #d8d8d8; border-radius: 3px; overflow: hidden; }}
    .progress {{ position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: #4f7fbf; }}
    .alarm {{ position: absolute; top: 0; bottom: 0; left: {alarm_percent:.4f}%; width: 4px; margin-left: -2px; background: #e00000; }}
    table {{ width: 100%; border-collapse: collapse; background: #fff; }}
    th, td {{ padding: 9px 11px; border: 1px solid #ddd; text-align: left; font-size: 14px; word-break: break-all; }}
    th {{ width: 260px; background: #f0f0f0; }}
  </style>
</head>
<body>
  <main>
    <video id="video" controls preload="metadata" src="{video_src}"></video>
    <div class="bar" id="bar"><div class="progress" id="progress"></div><div class="alarm" title="alarm_second"></div></div>
    <table>{rows}</table>
  </main>
  <script>
    const video = document.getElementById('video');
    const progress = document.getElementById('progress');
    video.addEventListener('timeupdate', () => {{
      const duration = video.duration || {actual_duration:.6f};
      progress.style.width = `${{Math.max(0, Math.min(100, video.currentTime / duration * 100))}}%`;
    }});
  </script>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def iso(value: datetime) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S")


def parse_batch_time(batch_date: str, time_text: str) -> datetime:
    for fmt in ("%Y%m%d %H:%M:%S", "%Y%m%d %H:%M"):
        try:
            return datetime.strptime(f"{batch_date} {time_text}", fmt)
        except ValueError:
            pass
    fail(f"could not parse batch time: date={batch_date} time={time_text}")


def parse_offset_sweep(value: str) -> list[float]:
    offsets: list[float] = []
    for part in str(value or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            offsets.append(float(part))
        except ValueError:
            fail(f"invalid --offset-sweep value: {part}")
    if not offsets:
        fail("--offset-sweep must contain at least one number")
    return offsets


def batch_offset_name(offset_seconds: float) -> str:
    rounded = round(offset_seconds)
    if abs(offset_seconds - rounded) < 0.0005:
        text = str(int(rounded))
    else:
        text = f"{offset_seconds:.3f}".rstrip("0").rstrip(".")
    return text.replace("-", "minus_").replace(".", "p")


def parse_alarm_id_and_device_from_name(path: Path) -> tuple[str | None, str | None]:
    stem = path.stem
    match = re.search(r"alarm_(\d+)_([^_]+)_", stem, flags=re.IGNORECASE)
    if match:
        return match.group(1), match.group(2)
    parts = stem.split("_")
    if len(parts) >= 2 and parts[0].isdigit():
        return None, parts[0]
    return None, None


def candidate_snapshot_dirs() -> list[Path]:
    raw_dirs = [
        BACKEND_DIR / "static" / "alarms",
        BACKEND_DIR / "static" / "alarms" / "images",
        BACKEND_DIR / "storage" / "alarm" / "images",
        BACKEND_DIR / "storage" / "alarms" / "images",
        BACKEND_DIR / "static" / "alarm" / "images",
        BACKEND_DIR / "static" / "alarm_screenshots",
    ]
    seen: set[Path] = set()
    dirs: list[Path] = []
    for directory in raw_dirs:
        resolved = directory.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        if resolved.exists():
            dirs.append(resolved)
    return dirs


def collect_batch_snapshot_paths(batch_date: str) -> list[Path]:
    paths: list[Path] = []
    for directory in candidate_snapshot_dirs():
        for path in directory.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            name = path.name
            if batch_date not in name and f"{batch_date[:4]}-{batch_date[4:6]}-{batch_date[6:]}" not in name:
                continue
            parsed = parse_datetime_from_name(name)
            if parsed and parsed.strftime("%Y%m%d") == batch_date:
                paths.append(path)
    return sorted(set(paths), key=lambda item: (parse_datetime_from_name(item.name) or datetime.min, str(item)))


def query_mongo_alarm_doc(path: Path, alarm_id: str | None) -> tuple[dict[str, Any], str]:
    try:
        from pymongo import MongoClient
        from pymongo.errors import PyMongoError, ServerSelectionTimeoutError
    except Exception as exc:
        return {}, f"pymongo unavailable: {exc}"

    mongo_url = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
    db_names = list(dict.fromkeys([os.getenv("MONGO_DB_NAME", "smart_helmet_mongo"), "platform", "smart_helmet_mongo"]))
    filename = path.name
    clauses: list[dict[str, Any]] = [
        {"alarm_image_path": {"$regex": re.escape(filename)}},
        {"snapshot_path": {"$regex": re.escape(filename)}},
        {"snapshot_url": {"$regex": re.escape(filename)}},
        {"image_path": {"$regex": re.escape(filename)}},
    ]
    if alarm_id:
        clauses.extend(
            [
                {"id": alarm_id},
                {"id": int(alarm_id) if alarm_id.isdigit() else alarm_id},
                {"alarm_id": alarm_id},
                {"alarm_id": int(alarm_id) if alarm_id.isdigit() else alarm_id},
            ]
        )

    try:
        client = MongoClient(mongo_url, serverSelectionTimeoutMS=1200)
        client.admin.command("ping")
        for db_name in db_names:
            db = client[db_name]
            if "alarm_record" not in db.list_collection_names():
                continue
            collection = db["alarm_record"]
            for clause in clauses:
                doc = collection.find_one(clause)
                if doc:
                    doc.pop("_id", None)
                    return dict(doc), f"mongo:{db_name}.alarm_record"
    except (ServerSelectionTimeoutError, PyMongoError, OSError) as exc:
        return {}, f"mongo unavailable: {exc}"
    except Exception as exc:
        return {}, f"mongo query failed: {exc}"
    return {}, "mongo:no matching alarm_record"


def query_local_json_alarm_doc(path: Path, alarm_id: str | None) -> tuple[dict[str, Any], str]:
    filename = path.name
    roots = [BACKEND_DIR / "backup", BACKEND_DIR / "storage"]
    for root in roots:
        if not root.exists():
            continue
        for json_path in root.rglob("*.json"):
            try:
                with json_path.open("r", encoding="utf-8-sig", errors="replace") as handle:
                    for line_no, line in enumerate(handle, start=1):
                        if filename not in line and (not alarm_id or f'"id": {alarm_id}' not in line):
                            continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if not isinstance(data, dict):
                            continue
                        image_text = json.dumps(data, ensure_ascii=False)
                        if filename in image_text or (alarm_id and str(data.get("id")) == str(alarm_id)):
                            return data, f"json:{json_path}:{line_no}"
            except OSError:
                continue
    return {}, "json:no matching exported alarm"


def resolve_alarm_doc(path: Path, alarm_id: str | None) -> tuple[dict[str, Any], list[str]]:
    notes: list[str] = []
    doc, source = query_mongo_alarm_doc(path, alarm_id)
    notes.append(source)
    if doc:
        doc["_debug_record_source"] = source
        return doc, notes
    doc, source = query_local_json_alarm_doc(path, alarm_id)
    notes.append(source)
    if doc:
        doc["_debug_record_source"] = source
        return doc, notes
    return {}, notes


def resolve_device_id(path_device_id: str | None, alarm_data: dict[str, Any]) -> str | None:
    for key in ("device_id", "trigger_device_id", "video_device_id", "camera_id"):
        value = alarm_data.get(key)
        if value not in (None, ""):
            return str(value)
    return path_device_id


def build_snapshot_candidate(path: Path, ffprobe: Path | None, ffmpeg: Path, detect_bbox: bool = True) -> SnapshotCandidate:
    notes: list[str] = []
    alarm_id, path_device_id = parse_alarm_id_and_device_from_name(path)
    alarm_data, record_notes = resolve_alarm_doc(path, alarm_id)
    notes.extend(record_notes)
    device_id = resolve_device_id(path_device_id, alarm_data)

    snapshot_time, snapshot_time_source = first_datetime_from_json(alarm_data)
    if not snapshot_time:
        snapshot_time = parse_datetime_from_name(path.name)
        snapshot_time_source = "snapshot_image.filename" if snapshot_time else ""
    if not snapshot_time:
        raise ValueError("time could not be parsed from record or filename")

    try:
        snapshot_size = probe_video_size(ffprobe, ffmpeg, path)
        bbox_original_pixel = None
        red_box_candidates: list[dict[str, Any]] = []
        bbox_original = None
        bbox_mode = ""
        bbox_norm = None
        bbox_source = "not_used_snapshot_replace" if not detect_bbox else "not_found"
        if detect_bbox:
            bbox_original, bbox_mode, bbox_source = find_bbox_in_container(alarm_data)
            if bbox_original:
                bbox_norm = normalize_bbox(bbox_original, bbox_mode, snapshot_size[0], snapshot_size[1])
                bbox_source = f"alarm_record.{bbox_source}"
            else:
                if any("pymongo unavailable" in note for note in notes):
                    notes.append("pymongo unavailable, falling back to image red box bbox extraction")
                bbox_norm, red_details = extract_bbox_from_red_box(path, ffmpeg=ffmpeg, ffprobe=ffprobe)
                bbox_original_pixel = red_details.get("bbox_original_pixel")
                red_box_candidates = red_details.get("red_box_candidates") or []
                if bbox_norm:
                    bbox_original = [float(item) for item in bbox_original_pixel or []]
                    bbox_mode = "pixel"
                    bbox_source = "image_red_box"
                    snapshot_size = (int(red_details["image_width"]), int(red_details["image_height"]))
                else:
                    bbox_mode = ""
                    bbox_source = "not_found"
                    notes.append(f"skip:red box bbox extraction failed: {red_details.get('reason')}")
    except SystemExit as exc:
        raise ValueError(str(exc)) from exc

    return SnapshotCandidate(
        path=path,
        snapshot_time=snapshot_time,
        snapshot_time_source=snapshot_time_source,
        alarm_id=alarm_id,
        device_id=device_id,
        alarm_data=alarm_data,
        bbox_original=bbox_original,
        bbox_mode=bbox_mode,
        bbox_norm=bbox_norm,
        bbox_source=bbox_source,
        notes=notes,
        bbox_original_pixel=bbox_original_pixel,
        image_width=snapshot_size[0],
        image_height=snapshot_size[1],
        red_box_candidates=red_box_candidates,
    )


def select_batch_candidates(
    candidates: list[SnapshotCandidate],
    range_start: datetime,
    range_end: datetime,
    max_snapshots: int,
    require_bbox: bool = True,
) -> tuple[list[SnapshotCandidate], bool]:
    usable = [item for item in candidates if item.bbox_norm] if require_bbox else list(candidates)
    afternoon = [item for item in usable if range_start <= item.snapshot_time <= range_end]
    relaxed = False
    pool = afternoon
    if len(pool) < min(3, max_snapshots):
        day_start = range_start.replace(hour=0, minute=0, second=0)
        day_end = range_start.replace(hour=23, minute=59, second=59)
        pool = [item for item in usable if day_start <= item.snapshot_time <= day_end]
        relaxed = True
    if not pool:
        return [], relaxed

    pool = sorted(pool, key=lambda item: item.snapshot_time)
    priority_alarm_ids = ["167281", "167282", "167361"]
    selected: list[SnapshotCandidate] = []
    used_paths: set[Path] = set()
    for alarm_id in priority_alarm_ids:
        match = next((item for item in pool if item.alarm_id == alarm_id), None)
        if match and match.path not in used_paths:
            selected.append(match)
            used_paths.add(match.path)
            if len(selected) >= max_snapshots:
                return selected, relaxed

    if len(pool) <= max_snapshots:
        return pool, relaxed

    if max_snapshots <= 1:
        return [pool[0]], relaxed
    remaining = [item for item in pool if item.path not in used_paths]
    needed = max_snapshots - len(selected)
    if needed <= 0:
        return selected, relaxed
    if len(remaining) <= needed:
        return selected + remaining, relaxed
    if needed == 1:
        return selected + [remaining[0]], relaxed
    selected_indexes = {
        round(i * (len(remaining) - 1) / (needed - 1))
        for i in range(needed)
    }
    return selected + [remaining[index] for index in sorted(selected_indexes)], relaxed


def record_search_dirs(device_id: str | None, batch_date: str) -> list[Path]:
    roots: list[Path] = []
    device_ids = [device_id] if device_id else []
    for current_device_id in device_ids:
        roots.extend(
            [
                BACKEND_DIR / "storage" / "records" / current_device_id / batch_date,
                BACKEND_DIR / "static" / "records" / current_device_id / batch_date,
                BACKEND_DIR / "static" / "recordings" / current_device_id / batch_date,
                BACKEND_DIR / "storage" / "records" / current_device_id,
                BACKEND_DIR / "static" / "records" / current_device_id,
                BACKEND_DIR / "static" / "recordings" / current_device_id,
            ]
        )
    roots.extend(
        [
            BACKEND_DIR / "storage" / "records",
            BACKEND_DIR / "static" / "records",
            BACKEND_DIR / "static" / "recordings",
        ]
    )
    seen: set[Path] = set()
    result: list[Path] = []
    for root in roots:
        resolved = root.resolve()
        if resolved in seen or not resolved.exists():
            continue
        seen.add(resolved)
        result.append(resolved)
    return result


def collect_batch_record_videos(device_id: str | None, batch_date: str) -> list[Path]:
    videos: list[Path] = []
    for directory in record_search_dirs(device_id, batch_date):
        for path in directory.rglob("*.mp4"):
            if not path.is_file():
                continue
            if batch_date not in path.name and f"{batch_date[:4]}-{batch_date[4:6]}-{batch_date[6:]}" not in path.name:
                continue
            if device_id:
                normalized = path.as_posix()
                if f"/{device_id}/" not in normalized and f"\\{device_id}\\" not in str(path):
                    # Keep files under direct device search dirs; skip non-device matches from broad roots.
                    direct_device_root = any(
                        f"/recordings/{device_id}" in directory.as_posix().replace("\\", "/")
                        or f"/records/{device_id}" in directory.as_posix().replace("\\", "/")
                        for directory in [path.parent]
                    )
                    if not direct_device_root:
                        continue
            if parse_datetime_from_name(path.name):
                videos.append(path)
    return sorted(set(videos), key=lambda item: (parse_datetime_from_name(item.name) or datetime.min, str(item)))


def snapshot_subdir_name(candidate: SnapshotCandidate) -> str:
    alarm_part = f"alarm_{candidate.alarm_id}" if candidate.alarm_id else "snapshot"
    return f"{alarm_part}_{candidate.snapshot_time.strftime('%H%M%S')}"


def extract_frame(ffmpeg: Path, input_video: Path, second: float, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(ffmpeg),
        "-y",
        "-ss",
        f"{max(0.0, second):.3f}",
        "-i",
        str(input_video),
        "-frames:v",
        "1",
        "-q:v",
        "2",
        str(output_path),
    ]
    run_command(cmd, "ffmpeg extract frame", timeout=60)


def build_alarm_video_artifacts(
    snapshot_image: Path,
    alarm_data: dict[str, Any],
    snapshot_time: datetime,
    snapshot_time_source: str,
    bbox_original: list[float],
    bbox_mode: str,
    bbox_norm: list[float],
    bbox_source: str,
    videos: list[Path],
    output_boxed: Path,
    output_meta: Path,
    offset_seconds: float,
    ffmpeg: Path,
    ffprobe: Path | None,
    window_seconds: float,
    box_before_seconds: float,
    box_after_seconds: float,
    replace_snapshot_second: bool = False,
    snapshot_replace_duration_seconds: float = 1.0,
    output_preview_html: Path | None = None,
    extra_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if snapshot_replace_duration_seconds <= 0:
        fail("--snapshot-replace-duration-seconds must be greater than 0")
    record_anchor_time = snapshot_time + timedelta(seconds=offset_seconds)
    request_start = record_anchor_time - timedelta(seconds=window_seconds)
    request_end = record_anchor_time + timedelta(seconds=window_seconds)
    snapshot_size = probe_video_size(ffprobe, ffmpeg, snapshot_image)

    segments = collect_segments(videos, request_start, request_end, ffprobe, ffmpeg)
    covers_anchor = any(segment.start <= record_anchor_time <= segment.end for segment in segments)
    if not covers_anchor:
        fail("selected recording segments overlap the window but do not cover record_anchor_time")

    if "boxed" in output_boxed.stem:
        output_raw = output_boxed.with_name(output_boxed.name.replace("boxed", "raw", 1))
    elif "snapshot_replace" in output_boxed.stem:
        output_raw = output_boxed.with_name(output_boxed.name.replace("snapshot_replace", "raw", 1))
    else:
        output_raw = output_boxed.with_name(f"{output_boxed.stem}_raw.mp4")

    actual_start, actual_end = run_clip_build(ffmpeg, segments, request_start, request_end, output_raw)
    if not (actual_start <= record_anchor_time <= actual_end):
        fail("actual raw clip does not cover record_anchor_time after trimming")

    actual_duration = probe_duration(ffprobe, ffmpeg, output_raw)
    alarm_second = (record_anchor_time - actual_start).total_seconds()
    if alarm_second < 0 or alarm_second > actual_duration:
        fail(f"alarm_second out of raw clip duration: alarm_second={alarm_second:.3f}, duration={actual_duration:.3f}")

    output_size = probe_video_size(ffprobe, ffmpeg, output_raw)
    raw_fps = probe_video_fps(ffprobe, ffmpeg, output_raw)
    replace_start = max(0.0, alarm_second)
    replace_end = min(actual_duration, alarm_second + snapshot_replace_duration_seconds)
    box_start: float | None = None
    box_end: float | None = None
    bbox_video_pixel: dict[str, int] | None = None

    if replace_snapshot_second:
        if replace_end <= replace_start:
            fail(f"snapshot replacement window is empty: start={replace_start:.3f}, end={replace_end:.3f}")
        run_snapshot_replace(
            ffmpeg=ffmpeg,
            input_raw=output_raw,
            snapshot_image=snapshot_image,
            output_video=output_boxed,
            output_size=output_size,
            replace_start=replace_start,
            replace_end=replace_end,
        )
        output_duration = probe_duration(ffprobe, ffmpeg, output_boxed)
    else:
        if not bbox_norm:
            fail("bbox is required unless --replace-snapshot-second is enabled")
        box_start = max(0.0, alarm_second - box_before_seconds)
        box_end = min(actual_duration, alarm_second + box_after_seconds)
        if box_end <= box_start:
            fail(f"box display window is empty: start={box_start:.3f}, end={box_end:.3f}")
        bbox_video_pixel = run_drawbox(ffmpeg, output_raw, output_boxed, bbox_norm, output_size, box_start, box_end)
        output_duration = probe_duration(ffprobe, ffmpeg, output_boxed)

    meta = {
        "snapshot_image": str(snapshot_image),
        "snapshot_time": iso(snapshot_time),
        "snapshot_time_source": snapshot_time_source,
        "recording_time_offset_seconds": round(offset_seconds, 3),
        "offset": round(offset_seconds, 3),
        "record_anchor_time": iso(record_anchor_time),
        "requested_start": iso(request_start),
        "requested_end": iso(request_end),
        "actual_clip_start": iso(actual_start),
        "actual_clip_end": iso(actual_end),
        "actual_duration": round(actual_duration, 3),
        "output_duration": round(output_duration, 3),
        "boxed_duration": round(output_duration, 3),
        "alarm_second": round(alarm_second, 3),
        "bbox_original": bbox_original,
        "bbox_original_mode": bbox_mode,
        "bbox_source": bbox_source,
        "bbox_norm": [round(item, 8) for item in bbox_norm],
        "snapshot_image_width": snapshot_size[0],
        "snapshot_image_height": snapshot_size[1],
        "output_video_width": output_size[0],
        "output_video_height": output_size[1],
        "bbox_video_pixel": bbox_video_pixel,
        "box_start_second": round(box_start, 3) if box_start is not None else None,
        "box_end_second": round(box_end, 3) if box_end is not None else None,
        "replace_snapshot_second": replace_snapshot_second,
        "snapshot_replace_duration_seconds": round(snapshot_replace_duration_seconds, 3),
        "replace_start": round(replace_start, 3) if replace_snapshot_second else None,
        "replace_end": round(replace_end, 3) if replace_snapshot_second else None,
        "raw_video_fps": round(raw_fps, 3) if raw_fps else None,
        "snapshot_replace_method": "full-frame scale+pad overlay" if replace_snapshot_second else None,
        "expected_video_watermark_time_at_alarm_second": iso(snapshot_time),
        "offset_applied": abs(offset_seconds) >= 0.0005,
        "selected_record_segments": [
            {
                "path": str(segment.path),
                "start": iso(segment.start),
                "end": iso(segment.end),
                "duration": round(segment.duration, 3),
            }
            for segment in segments
        ],
        "selected_segments": [
            {
                "path": str(segment.path),
                "start": iso(segment.start),
                "end": iso(segment.end),
                "duration": round(segment.duration, 3),
            }
            for segment in segments
        ],
        "output_raw_video": str(output_raw),
        "output_video": str(output_boxed),
        "output_boxed_video": str(output_boxed),
        "debug_note": "local batch debug only; production alarm video chain is not used.",
    }
    if extra_meta:
        meta.update(extra_meta)
    if output_preview_html and replace_snapshot_second:
        meta["preview_html"] = str(output_preview_html)
    write_meta(output_meta, meta)
    if output_preview_html and replace_snapshot_second:
        write_preview_html(output_preview_html, output_boxed, meta)
    return meta


def write_readme(output_dir: Path, summary: dict[str, Any]) -> Path:
    readme_path = output_dir / "README.txt"
    lines = [
        "Debug alarm video alignment samples",
        "",
        "This directory was generated by backend/tools/debug_build_alarm_video_from_local.py in local batch mode.",
        "Production alarm video generation was not used or modified.",
        "",
        "Recommended viewing order: start with offset=8s, then compare offset=10s, offset=12s, and offset=0s.",
        "",
        "Manual judgement:",
        "Fill in which offset best matches the original snapshot for each sample.",
        "",
    ]
    if summary.get("time_range_relaxed"):
        lines.append("Note: afternoon filtering was relaxed to the full day because fewer than 3 usable afternoon snapshots were found.")
        lines.append("")
    for sample in summary.get("samples", []):
        lines.append(f"Snapshot: {sample.get('snapshot_image')}")
        lines.append(f"Snapshot time: {sample.get('snapshot_time')}")
        lines.append(f"Device ID: {sample.get('device_id')}")
        lines.append(f"BBox source: {sample.get('bbox_source')}")
        lines.append(f"BBox norm: {sample.get('bbox_norm')}")
        if sample.get("detected_bbox_overlay"):
            lines.append(f"Detected bbox overlay: {sample.get('detected_bbox_overlay')}")
        for build in sample.get("builds", []):
            lines.append(f"  offset={build.get('offset')}s video: {build.get('output_video')}")
            frames = build.get("extracted_frames") or []
            if frames:
                lines.append(f"  frames: {', '.join(frames)}")
        lines.append("  best offset: ______")
        lines.append("")
    if summary.get("skipped"):
        lines.append("Skipped snapshots:")
        for skipped in summary["skipped"]:
            lines.append(f"  {skipped.get('snapshot_image')}: {skipped.get('reason')}")
        lines.append("")
    readme_path.write_text("\n".join(lines), encoding="utf-8")
    return readme_path


def run_batch(args: argparse.Namespace) -> int:
    if not re.fullmatch(r"\d{8}", str(args.batch_date or "")):
        fail("--batch-date must be YYYYMMDD")

    ffmpeg = resolve_path(args.ffmpeg)
    ffprobe = ffprobe_from_ffmpeg(ffmpeg, args.ffprobe)
    if not ffmpeg.exists():
        fail(f"ffmpeg not found: {ffmpeg}")
    if not ffprobe.exists():
        log(f"ffprobe not found, falling back to ffmpeg input probing: {ffprobe}")
        ffprobe = None

    batch_date = args.batch_date
    range_start = parse_batch_time(batch_date, args.batch_time_start)
    range_end = parse_batch_time(batch_date, args.batch_time_end)
    offsets = parse_offset_sweep(args.offset_sweep)
    output_dir = resolve_path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    snapshot_paths = collect_batch_snapshot_paths(batch_date)
    log(f"found {len(snapshot_paths)} snapshot image(s) for {batch_date}")
    replace_snapshot_second = bool(args.replace_snapshot_second)
    skipped: list[dict[str, Any]] = []
    candidates: list[SnapshotCandidate] = []
    for path in snapshot_paths:
        try:
            candidate = build_snapshot_candidate(path, ffprobe, ffmpeg, detect_bbox=not replace_snapshot_second)
        except Exception as exc:
            skipped.append({"snapshot_image": str(path), "reason": str(exc), "notes": []})
            continue
        if not candidate.bbox_norm and not replace_snapshot_second:
            skipped.append({"snapshot_image": str(path), "reason": "bbox not found", "notes": candidate.notes})
            continue
        candidates.append(candidate)

    selected, relaxed = select_batch_candidates(
        candidates,
        range_start,
        range_end,
        int(args.max_snapshots),
        require_bbox=not replace_snapshot_second,
    )
    selected_paths = {item.path for item in selected}
    for candidate in candidates:
        if candidate.path not in selected_paths:
            skipped.append(
                {
                    "snapshot_image": str(candidate.path),
                    "reason": "not selected after max-snapshots/time-spread filtering",
                    "notes": candidate.notes,
                }
            )

    summary: dict[str, Any] = {
        "batch_date": batch_date,
        "requested_time_start": args.batch_time_start,
        "requested_time_end": args.batch_time_end,
        "time_range_relaxed": relaxed,
        "output_dir": str(output_dir),
        "samples": [],
        "skipped": skipped,
    }

    for candidate in selected:
        sample_dir = output_dir / snapshot_subdir_name(candidate)
        sample_dir.mkdir(parents=True, exist_ok=True)
        snapshot_copy = sample_dir / "snapshot_original.jpg"
        shutil.copy2(candidate.path, snapshot_copy)
        detected_overlay = sample_dir / "detected_bbox_overlay.jpg"
        if candidate.bbox_original_pixel and not replace_snapshot_second:
            draw_bbox_overlay(ffmpeg, candidate.path, detected_overlay, candidate.bbox_original_pixel)

        videos = collect_batch_record_videos(candidate.device_id, batch_date)
        if not videos:
            reason = f"no {batch_date} mp4 recordings found for device_id={candidate.device_id or 'unknown'}"
            summary["skipped"].append({"snapshot_image": str(candidate.path), "reason": reason, "notes": candidate.notes})
            continue

        sample_summary: dict[str, Any] = {
            "snapshot_image": str(candidate.path),
            "snapshot_copy": str(snapshot_copy),
            "snapshot_time": iso(candidate.snapshot_time),
            "device_id": candidate.device_id,
            "alarm_id": candidate.alarm_id,
            "bbox_source": candidate.bbox_source,
            "bbox_detected_from_image": candidate.bbox_source == "image_red_box",
            "bbox_original_pixel": candidate.bbox_original_pixel,
            "bbox_norm": [round(item, 8) for item in candidate.bbox_norm or []],
            "image_width": candidate.image_width,
            "image_height": candidate.image_height,
            "red_box_candidates": candidate.red_box_candidates or [],
            "detected_bbox_overlay": str(detected_overlay) if detected_overlay.exists() else None,
            "notes": candidate.notes,
            "builds": [],
        }

        for offset in offsets:
            offset_name = batch_offset_name(offset)
            if replace_snapshot_second:
                boxed_video = sample_dir / f"snapshot_replace_offset_{offset_name}s.mp4"
                meta_path = sample_dir / f"meta_snapshot_replace_offset_{offset_name}s.json"
                preview_path = sample_dir / f"preview_snapshot_replace_offset_{offset_name}s.html"
            else:
                boxed_video = sample_dir / f"boxed_offset_{offset_name}s.mp4"
                meta_path = sample_dir / f"meta_offset_{offset_name}s.json"
                preview_path = None
            try:
                meta = build_alarm_video_artifacts(
                    snapshot_image=candidate.path,
                    alarm_data=candidate.alarm_data,
                    snapshot_time=candidate.snapshot_time,
                    snapshot_time_source=candidate.snapshot_time_source,
                    bbox_original=candidate.bbox_original or [],
                    bbox_mode=candidate.bbox_mode,
                    bbox_norm=candidate.bbox_norm or [],
                    bbox_source=candidate.bbox_source,
                    videos=videos,
                    output_boxed=boxed_video,
                    output_meta=meta_path,
                    offset_seconds=offset,
                    ffmpeg=ffmpeg,
                    ffprobe=ffprobe,
                    window_seconds=float(args.window_seconds),
                    box_before_seconds=float(args.box_before_seconds),
                    box_after_seconds=float(args.box_after_seconds),
                    replace_snapshot_second=replace_snapshot_second,
                    snapshot_replace_duration_seconds=float(args.snapshot_replace_duration_seconds),
                    output_preview_html=preview_path,
                    extra_meta={
                        "device_id": candidate.device_id,
                        "alarm_id": candidate.alarm_id,
                        "bbox_source": candidate.bbox_source,
                        "bbox_detected_from_image": candidate.bbox_source == "image_red_box",
                        "bbox_original_pixel": candidate.bbox_original_pixel,
                        "image_width": candidate.image_width,
                        "image_height": candidate.image_height,
                        "red_box_candidates": candidate.red_box_candidates or [],
                        "detected_bbox_overlay": str(detected_overlay) if detected_overlay.exists() else None,
                        "notes": candidate.notes,
                    },
                )
            except SystemExit as exc:
                sample_summary["builds"].append(
                    {
                        "offset": round(offset, 3),
                        "error": str(exc),
                        "output_video": str(boxed_video),
                        "meta": str(meta_path),
                    }
                )
                continue

            if replace_snapshot_second:
                frame_specs = [
                    ("replace_alarm", meta["alarm_second"]),
                    ("replace_alarm_plus0_5", meta["alarm_second"] + 0.5),
                ]
            else:
                frame_specs = [
                    ("alarm_minus1", meta["alarm_second"] - 1.0),
                    ("alarm", meta["alarm_second"]),
                    ("alarm_plus1", meta["alarm_second"] + 1.0),
                    ("alarm_plus2", meta["alarm_second"] + 2.0),
                ]
            extracted_frames: list[str] = []
            for suffix, second in frame_specs:
                if replace_snapshot_second:
                    frame_path = sample_dir / f"frame_{suffix}.jpg"
                else:
                    frame_path = sample_dir / f"frame_offset_{offset_name}s_{suffix}.jpg"
                try:
                    extract_frame(ffmpeg, boxed_video, float(second), frame_path)
                    extracted_frames.append(str(frame_path))
                except SystemExit as exc:
                    log(f"frame extraction failed for {frame_path}: {exc}")

            meta["extracted_frames"] = extracted_frames
            write_meta(meta_path, meta)
            sample_summary["builds"].append(
                {
                    "offset": round(offset, 3),
                    "record_anchor_time": meta["record_anchor_time"],
                    "actual_clip_start": meta["actual_clip_start"],
                    "actual_clip_end": meta["actual_clip_end"],
                    "actual_duration": meta["actual_duration"],
                    "alarm_second": meta["alarm_second"],
                    "box_start_second": meta["box_start_second"],
                    "box_end_second": meta["box_end_second"],
                    "replace_start": meta.get("replace_start"),
                    "replace_end": meta.get("replace_end"),
                    "selected_record_segments": meta["selected_record_segments"],
                    "output_video": meta["output_video"],
                    "meta": str(meta_path),
                    "preview_html": meta.get("preview_html"),
                    "extracted_frames": extracted_frames,
                    "notes": candidate.notes,
                }
            )

        if any(not build.get("error") for build in sample_summary["builds"]):
            summary["samples"].append(sample_summary)
        else:
            summary["skipped"].append(
                {
                    "snapshot_image": str(candidate.path),
                    "reason": "all offset builds failed",
                    "notes": candidate.notes,
                    "builds": sample_summary["builds"],
                }
            )

    summary_path = output_dir / "summary.json"
    write_meta(summary_path, summary)
    readme_path = write_readme(output_dir, summary)
    log(f"summary json: {summary_path}")
    log(f"readme: {readme_path}")
    return 0


def run_single(args: argparse.Namespace) -> int:
    if not args.snapshot_image:
        fail("--snapshot-image is required unless --batch-date is used")
    if not args.record_video and not args.records_dir:
        fail("one of --record-video or --records-dir is required unless --batch-date is used")

    snapshot_image = resolve_path(args.snapshot_image)
    if not snapshot_image.exists():
        fail(f"--snapshot-image does not exist: {snapshot_image}")

    ffmpeg = resolve_path(args.ffmpeg)
    ffprobe = ffprobe_from_ffmpeg(ffmpeg, args.ffprobe)
    if not ffmpeg.exists():
        fail(f"ffmpeg not found: {ffmpeg}")
    if not ffprobe.exists():
        log(f"ffprobe not found, falling back to ffmpeg input probing: {ffprobe}")
        ffprobe = None

    alarm_json = resolve_path(args.alarm_json) if args.alarm_json else None
    alarm_data = load_alarm_json(alarm_json)
    recording_time_offset_seconds = float(args.recording_time_offset_seconds)
    snapshot_size = probe_video_size(ffprobe, ffmpeg, snapshot_image)
    snapshot_time, snapshot_time_source = resolve_snapshot_time(args, alarm_data, snapshot_image)
    bbox_original_pixel = None
    red_box_candidates: list[dict[str, Any]] = []
    if args.replace_snapshot_second:
        bbox_original = []
        bbox_mode = ""
        bbox_norm = []
        bbox_source = "not_used_snapshot_replace"
    else:
        try:
            bbox_original, bbox_mode, bbox_norm, bbox_source = resolve_bbox(args, alarm_data, snapshot_size)
        except SystemExit:
            bbox_norm, red_details = extract_bbox_from_red_box(snapshot_image, ffmpeg=ffmpeg, ffprobe=ffprobe)
            if not bbox_norm:
                raise
            bbox_original_pixel = red_details.get("bbox_original_pixel")
            bbox_original = [float(item) for item in bbox_original_pixel or []]
            bbox_mode = "pixel"
            bbox_source = "image_red_box"
            red_box_candidates = red_details.get("red_box_candidates") or []
    videos = collect_record_videos(args)
    output_boxed, output_raw, output_meta = derive_output_paths(args.output, recording_time_offset_seconds)
    if args.replace_snapshot_second and Path(args.output) == Path(str(DEFAULT_OUTPUT)):
        label = offset_label(recording_time_offset_seconds)
        output_boxed = resolve_path(DEFAULT_OUTPUT).with_name(f"snapshot_replace_{label}.mp4")
        output_raw = output_boxed.with_name(output_boxed.name.replace("snapshot_replace", "raw", 1))
        output_meta = output_boxed.with_name(output_boxed.with_suffix(".json").name.replace("snapshot_replace", "meta_snapshot_replace", 1))
    output_preview = output_boxed.with_name(output_boxed.with_suffix(".html").name.replace("snapshot_replace", "preview_snapshot_replace", 1))

    meta = build_alarm_video_artifacts(
        snapshot_image=snapshot_image,
        alarm_data=alarm_data,
        snapshot_time=snapshot_time,
        snapshot_time_source=snapshot_time_source,
        bbox_original=bbox_original,
        bbox_mode=bbox_mode,
        bbox_norm=bbox_norm,
        bbox_source=bbox_source,
        videos=videos,
        output_boxed=output_boxed,
        output_meta=output_meta,
        offset_seconds=recording_time_offset_seconds,
        ffmpeg=ffmpeg,
        ffprobe=ffprobe,
        window_seconds=float(args.window_seconds),
        box_before_seconds=float(args.box_before_seconds),
        box_after_seconds=float(args.box_after_seconds),
        replace_snapshot_second=bool(args.replace_snapshot_second),
        snapshot_replace_duration_seconds=float(args.snapshot_replace_duration_seconds),
        output_preview_html=output_preview if args.replace_snapshot_second else None,
        extra_meta={
            "bbox_source": bbox_source,
            "bbox_detected_from_image": bbox_source == "image_red_box",
            "bbox_original_pixel": bbox_original_pixel,
            "image_width": snapshot_size[0],
            "image_height": snapshot_size[1],
            "red_box_candidates": red_box_candidates,
        },
    )

    observed_video_time = parse_datetime_value(args.observed_video_time_at_alarm_second)
    observed_delta = None
    if args.observed_video_time_at_alarm_second and observed_video_time is None:
        fail(f"could not parse --observed-video-time-at-alarm-second: {args.observed_video_time_at_alarm_second}")
    if observed_video_time is not None:
        observed_delta = (observed_video_time - snapshot_time).total_seconds()
        log(
            "manual stream delay observation: "
            f"video_time_at_alarm_second={iso(observed_video_time)}, "
            f"video_minus_snapshot={observed_delta:.3f}s; "
            f"offset_applied={recording_time_offset_seconds:.3f}s"
        )
    meta["debug_note"] = (
        "snapshot_time remains the business alarm anchor; record_anchor_time applies only the explicit local debug offset."
    )
    meta["manual_delay_observation"] = {
        "video_time_at_alarm_second": iso(observed_video_time) if observed_video_time else None,
        "video_time_minus_snapshot_seconds": round(observed_delta, 3) if observed_delta is not None else None,
        "adjustment_applied_seconds": round(recording_time_offset_seconds, 3),
    }
    write_meta(output_meta, meta)

    log(f"raw video: {output_raw}")
    log(f"output video: {output_boxed}")
    log(f"meta json: {output_meta}")
    if args.replace_snapshot_second:
        log(f"preview html: {output_preview}")
        log(
            f"record_anchor_time={meta['record_anchor_time']}, "
            f"alarm_second={float(meta['alarm_second']):.3f}, "
            f"replace_window={meta.get('replace_start')}-{meta.get('replace_end')}"
        )
    else:
        log(
            f"record_anchor_time={meta['record_anchor_time']}, "
            f"alarm_second={float(meta['alarm_second']):.3f}, "
            f"box_window={float(meta['box_start_second']):.3f}-{float(meta['box_end_second']):.3f}"
        )
    return 0


def main() -> int:
    args = parse_args()
    if args.batch_date:
        return run_batch(args)
    return run_single(args)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
