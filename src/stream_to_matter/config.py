from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
from typing import Any


DEFAULT_CONFIG = Path("config/cameras.json")
ENV_PATTERN = re.compile(r"\$\{([A-Z0-9_]+)(?::-(.*?))?\}")


@dataclass(frozen=True)
class OnvifConfig:
    host: str
    port: int
    user: str
    password: str

    @property
    def device_service_url(self) -> str:
        return f"http://{self.host}:{self.port}/onvif/device_service"


@dataclass(frozen=True)
class MatterConfig:
    device_type: str = "camera"
    standard: str = "Matter 1.5.1"
    advertise_ptz: bool = True
    advertise_audio: bool = True
    advertise_two_way_audio: bool = False
    advertise_recording: bool = False


@dataclass(frozen=True)
class CameraConfig:
    id: str
    name: str
    rtsp_url: str
    onvif: OnvifConfig
    matter: MatterConfig


def _require(mapping: dict[str, Any], key: str) -> Any:
    if key not in mapping:
        raise ValueError(f"Missing required config key: {key}")
    return mapping[key]


def load_dotenv(path: str | os.PathLike[str] = ".env") -> None:
    env_path = Path(path)
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def resolve_env(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: resolve_env(item) for key, item in value.items()}
    if isinstance(value, list):
        return [resolve_env(item) for item in value]
    if not isinstance(value, str):
        return value

    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        default = match.group(2)
        if name in os.environ:
            return os.environ[name]
        if default is not None:
            return default
        raise ValueError(f"Missing required environment variable: {name}")

    return ENV_PATTERN.sub(replace, value)


def load_config(path: str | os.PathLike[str] | None = None) -> list[CameraConfig]:
    load_dotenv()
    config_path = Path(path or os.environ.get("STREAM_TO_MATTER_CONFIG", DEFAULT_CONFIG))
    with config_path.open("r", encoding="utf-8") as handle:
        raw = resolve_env(json.load(handle))

    cameras: list[CameraConfig] = []
    for item in raw.get("cameras", []):
        onvif_raw = _require(item, "onvif")
        matter_raw = item.get("matter", {})
        cameras.append(
            CameraConfig(
                id=str(_require(item, "id")),
                name=str(item.get("name", item["id"])),
                rtsp_url=str(_require(item, "rtsp_url")),
                onvif=OnvifConfig(
                    host=str(_require(onvif_raw, "host")),
                    port=int(onvif_raw.get("port", 80)),
                    user=str(_require(onvif_raw, "user")),
                    password=str(_require(onvif_raw, "password")),
                ),
                matter=MatterConfig(
                    device_type=str(matter_raw.get("device_type", "camera")),
                    standard=str(matter_raw.get("standard", "Matter 1.5.1")),
                    advertise_ptz=bool(matter_raw.get("advertise_ptz", True)),
                    advertise_audio=bool(matter_raw.get("advertise_audio", True)),
                    advertise_two_way_audio=bool(matter_raw.get("advertise_two_way_audio", False)),
                    advertise_recording=bool(matter_raw.get("advertise_recording", False)),
                ),
            )
        )

    if not cameras:
        raise ValueError(f"No cameras configured in {config_path}")
    return cameras
