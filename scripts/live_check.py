from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from stream_to_matter.config import CameraConfig, load_config
from stream_to_matter.matter_adapter import matter_endpoint_manifest
from stream_to_matter.matter_model import camera_capabilities, stream_profiles
from stream_to_matter.onvif import (
    continuous_move,
    discover_services,
    get_profiles,
    get_ptz_status,
    get_stream_uri,
    stop,
)
from stream_to_matter.rtsp_probe import add_rtsp_credentials, capture_snapshot, probe_rtsp
from stream_to_matter.server import PTZ_DIRECTIONS


REQUIRED_MATTER_CAMERA_FEATURES = {
    "live_video",
    "live_audio",
    "multi_stream",
    "hls",
    "dash",
    "snapshot_jpeg",
    "snapshot_heic",
    "ptz",
    "privacy_zones",
    "detection_zones",
    "recording",
    "two_way_audio",
}


def check_camera(camera: CameraConfig, move_ptz: bool = False) -> dict[str, object]:
    capability_payload = camera_capabilities(camera)
    manifest = matter_endpoint_manifest(camera)
    advertised = {item["name"] for item in capability_payload["capabilities"]}
    missing = sorted(REQUIRED_MATTER_CAMERA_FEATURES - advertised)

    services = discover_services(camera.onvif)
    profiles = get_profiles(camera.onvif, services.media) if services.media else []
    stream_uri = get_stream_uri(camera.onvif, services.media, profiles[0]["token"]) if services.media and profiles else {}

    primary_probe = probe_rtsp(camera.rtsp_url)
    effective_uri = camera.rtsp_url
    if not primary_probe.get("ok") and isinstance(stream_uri.get("uri"), str):
        effective_uri = add_rtsp_credentials(stream_uri["uri"], camera.onvif.user, camera.onvif.password)
    effective_probe = probe_rtsp(effective_uri)

    snapshot_dir = Path("snapshots")
    snapshot_dir.mkdir(exist_ok=True)
    snapshot = capture_snapshot(effective_uri, str(snapshot_dir / f"{camera.id}.jpg"))

    ptz_status = {}
    ptz_motion = {"skipped": True}
    if services.ptz and profiles:
        ptz_status = get_ptz_status(camera.onvif, services.ptz, profiles[0]["token"])
        if move_ptz:
            ptz_motion = continuous_move(camera.onvif, services.ptz, profiles[0]["token"], pan=0.03)
            stop(camera.onvif, services.ptz, profiles[0]["token"])

    ok = (
        not missing
        and bool(services.media)
        and bool(services.ptz)
        and bool(profiles)
        and bool(effective_probe.get("ok"))
        and bool(effective_probe.get("has_video"))
        and bool(snapshot.get("ok"))
        and bool(ptz_status.get("ok"))
    )

    return {
        "ok": ok,
        "camera_id": camera.id,
        "matter_standard": capability_payload["standard"],
        "matter_manifest": manifest,
        "missing_matter_features": missing,
        "onvif": {
            "services": services.__dict__,
            "profiles": profiles,
            "stream_uri": stream_uri,
        },
        "rtsp": {
            "configured_probe": primary_probe,
            "effective_probe": effective_probe,
        },
        "streams": stream_profiles(camera),
        "snapshot": snapshot,
        "ptz_status": ptz_status,
        "ptz_directions": sorted(PTZ_DIRECTIONS),
        "ptz_motion": ptz_motion,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config/cameras.json")
    parser.add_argument("--move-ptz", action="store_true", help="Send a tiny PTZ movement and immediate stop.")
    args = parser.parse_args()

    results = [check_camera(camera, move_ptz=args.move_ptz) for camera in load_config(args.config)]
    print(json.dumps(results, indent=2))
    return 0 if all(item["ok"] for item in results) else 1


if __name__ == "__main__":
    sys.exit(main())
