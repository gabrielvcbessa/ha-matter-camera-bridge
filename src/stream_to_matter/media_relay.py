from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import shutil
import signal
import subprocess
from typing import Literal
from urllib.parse import urlsplit, urlunsplit


ProfileId = Literal["high", "mobile", "analysis"]
FormatId = Literal["hls", "dash"]


@dataclass(frozen=True)
class RelayProfile:
    id: ProfileId
    purpose: str
    width: int | None
    height: int | None
    fps: int | None
    video_bitrate: str | None
    audio_codec: str


RELAY_PROFILES: dict[ProfileId, RelayProfile] = {
    "high": RelayProfile("high", "recording", None, None, None, None, "aac"),
    "mobile": RelayProfile("mobile", "live_view", 1280, 720, 15, "1800k", "aac"),
    "analysis": RelayProfile("analysis", "ai_detection", 640, 360, 5, "600k", "aac"),
}


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def redact_command(command: list[str]) -> list[str]:
    return [_redact_url(value) for value in command]


def _redact_url(value: str) -> str:
    parsed = urlsplit(value)
    if not parsed.username:
        return value
    hostname = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    return urlunsplit((parsed.scheme, f"{parsed.username}:***@{hostname}{port}", parsed.path, parsed.query, parsed.fragment))


def relay_output_path(root: Path, camera_id: str, profile_id: ProfileId, format_id: FormatId) -> Path:
    suffix = "index.m3u8" if format_id == "hls" else "manifest.mpd"
    return root / camera_id / profile_id / format_id / suffix


def build_ffmpeg_relay_command(
    rtsp_url: str,
    output_path: Path,
    profile_id: ProfileId,
    format_id: FormatId,
) -> list[str]:
    profile = RELAY_PROFILES[profile_id]
    output_path.parent.mkdir(parents=True, exist_ok=True)

    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-rtsp_transport",
        "tcp",
        "-i",
        rtsp_url,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
    ]

    filters: list[str] = []
    if profile.width and profile.height:
        filters.append(f"scale={profile.width}:{profile.height}")
    if profile.fps:
        filters.append(f"fps={profile.fps}")
    if filters:
        command.extend(["-vf", ",".join(filters)])

    if profile.id == "high":
        command.extend(["-c:v", "copy"])
    else:
        command.extend(["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency"])
        if profile.video_bitrate:
            command.extend(["-b:v", profile.video_bitrate])

    command.extend(["-c:a", profile.audio_codec, "-ar", "48000", "-ac", "1"])

    if format_id == "hls":
        command.extend(
            [
                "-f",
                "hls",
                "-hls_time",
                "2",
                "-hls_list_size",
                "6",
                "-hls_flags",
                "delete_segments+append_list+omit_endlist",
                str(output_path),
            ]
        )
    else:
        command.extend(
            [
                "-f",
                "dash",
                "-seg_duration",
                "2",
                "-window_size",
                "6",
                "-remove_at_exit",
                "1",
                str(output_path),
            ]
        )
    return command


class MediaRelayManager:
    def __init__(self, root: str | os.PathLike[str] = "relay") -> None:
        self.root = Path(root)
        self.processes: dict[tuple[str, ProfileId, FormatId], subprocess.Popen[bytes]] = {}

    def status(self, camera_id: str | None = None) -> list[dict[str, object]]:
        rows: list[dict[str, object]] = []
        for (relay_camera_id, profile_id, format_id), process in self.processes.items():
            if camera_id and relay_camera_id != camera_id:
                continue
            output_path = relay_output_path(self.root, relay_camera_id, profile_id, format_id)
            rows.append(
                {
                    "camera_id": relay_camera_id,
                    "profile": profile_id,
                    "format": format_id,
                    "running": process.poll() is None,
                    "pid": process.pid,
                    "output": str(output_path),
                    "exists": output_path.exists(),
                }
            )
        return rows

    def start(self, camera_id: str, rtsp_url: str, profile_id: ProfileId, format_id: FormatId) -> dict[str, object]:
        if not ffmpeg_available():
            return {"ok": False, "error": "ffmpeg is not installed"}

        key = (camera_id, profile_id, format_id)
        existing = self.processes.get(key)
        if existing and existing.poll() is None:
            return {"ok": True, "already_running": True, **self._row(camera_id, profile_id, format_id, existing)}

        output_path = relay_output_path(self.root, camera_id, profile_id, format_id)
        command = build_ffmpeg_relay_command(rtsp_url, output_path, profile_id, format_id)
        process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.processes[key] = process
        return {"ok": True, "command": redact_command(command), **self._row(camera_id, profile_id, format_id, process)}

    def stop(self, camera_id: str, profile_id: ProfileId, format_id: FormatId) -> dict[str, object]:
        key = (camera_id, profile_id, format_id)
        process = self.processes.get(key)
        if not process:
            return {"ok": True, "already_stopped": True}
        if process.poll() is None:
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        return {"ok": True, **self._row(camera_id, profile_id, format_id, process)}

    def _row(
        self,
        camera_id: str,
        profile_id: ProfileId,
        format_id: FormatId,
        process: subprocess.Popen[bytes],
    ) -> dict[str, object]:
        output_path = relay_output_path(self.root, camera_id, profile_id, format_id)
        return {
            "camera_id": camera_id,
            "profile": profile_id,
            "format": format_id,
            "running": process.poll() is None,
            "pid": process.pid,
            "output": str(output_path),
            "exists": output_path.exists(),
        }
