from __future__ import annotations

import json
import shutil
import subprocess
from typing import Any
from urllib.parse import quote, urlsplit, urlunsplit


def ffprobe_available() -> bool:
    return shutil.which("ffprobe") is not None


def heif_encoder_available() -> bool:
    return shutil.which("heif-enc") is not None


def probe_rtsp(rtsp_url: str, timeout_seconds: int = 10) -> dict[str, Any]:
    if not ffprobe_available():
        return {
            "ok": False,
            "error": "ffprobe is not installed",
            "streams": [],
        }

    command = [
        "ffprobe",
        "-v",
        "error",
        "-rtsp_transport",
        "tcp",
        "-show_entries",
        "stream=index,codec_name,codec_type,width,height,avg_frame_rate",
        "-of",
        "json",
        rtsp_url,
    ]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            check=False,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"ffprobe timed out after {timeout_seconds}s", "streams": []}

    if completed.returncode != 0:
        return {"ok": False, "error": completed.stderr.strip(), "streams": []}

    payload = json.loads(completed.stdout or "{}")
    streams = payload.get("streams", [])
    return {
        "ok": True,
        "has_video": any(stream.get("codec_type") == "video" for stream in streams),
        "has_audio": any(stream.get("codec_type") == "audio" for stream in streams),
        "streams": streams,
    }


def add_rtsp_credentials(rtsp_url: str, user: str, password: str) -> str:
    parsed = urlsplit(rtsp_url)
    if parsed.username or parsed.scheme != "rtsp":
        return rtsp_url

    userinfo = f"{quote(user)}:{quote(password)}@"
    hostname = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    netloc = f"{userinfo}{hostname}{port}"
    return urlunsplit((parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment))


def redact_url(rtsp_url: str) -> str:
    parsed = urlsplit(rtsp_url)
    if not parsed.username:
        return rtsp_url
    hostname = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    netloc = f"{parsed.username}:***@{hostname}{port}"
    return urlunsplit((parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment))


def capture_snapshot(
    rtsp_url: str,
    output_path: str,
    timeout_seconds: int = 15,
    width: int | None = None,
    height: int | None = None,
    quality: int | None = None,
) -> dict[str, Any]:
    command = [
        "ffmpeg",
        "-y",
        "-rtsp_transport",
        "tcp",
        "-i",
        rtsp_url,
        *snapshot_filter_args(width, height, quality),
        "-frames:v",
        "1",
        output_path,
    ]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            check=False,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"ffmpeg timed out after {timeout_seconds}s"}

    if completed.returncode != 0:
        return {"ok": False, "error": completed.stderr.strip()}
    return {"ok": True, "path": output_path, "width": width, "height": height}


def snapshot_filter_args(width: int | None, height: int | None, quality: int | None) -> list[str]:
    args: list[str] = []
    if width and height:
        args.extend(["-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease"])
    if quality:
        clamped = max(2, min(31, round(31 - (max(1, min(100, quality)) / 100) * 29)))
        args.extend(["-q:v", str(clamped)])
    return args


def capture_heic_snapshot(rtsp_url: str, jpeg_path: str, heic_path: str, timeout_seconds: int = 30) -> dict[str, Any]:
    if not heif_encoder_available():
        return {"ok": False, "error": "heif-enc is not installed"}

    jpeg_payload = capture_snapshot(rtsp_url, jpeg_path, timeout_seconds=timeout_seconds)
    if not jpeg_payload.get("ok"):
        return jpeg_payload

    command = ["heif-enc", "-q", "90", jpeg_path, "-o", heic_path]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            check=False,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"heif-enc timed out after {timeout_seconds}s"}

    if completed.returncode != 0:
        return {"ok": False, "error": completed.stderr.strip() or completed.stdout.strip()}
    return {"ok": True, "path": heic_path, "source": jpeg_path}
