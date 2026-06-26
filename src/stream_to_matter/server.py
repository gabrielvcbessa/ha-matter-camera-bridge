from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .config import CameraConfig, load_config
from .matter_adapter import matter_endpoint_manifest
from .matter_model import camera_capabilities, stream_profiles
from .media_relay import FormatId, MediaRelayManager, ProfileId
from .onvif import absolute_move, continuous_move, discover_services, get_profiles, get_ptz_status, get_stream_uri, relative_move, safe_onvif_summary, stop
from .rtsp_probe import add_rtsp_credentials, capture_heic_snapshot, capture_snapshot, probe_rtsp, redact_url


PTZ_DIRECTIONS: dict[str, tuple[float, float, float]] = {
    "left": (-0.10, 0.0, 0.0),
    "right": (0.10, 0.0, 0.0),
    "up": (0.0, 0.10, 0.0),
    "down": (0.0, -0.10, 0.0),
    "up-left": (-0.10, 0.10, 0.0),
    "up-right": (0.10, 0.10, 0.0),
    "down-left": (-0.10, -0.10, 0.0),
    "down-right": (0.10, -0.10, 0.0),
    "zoom-in": (0.0, 0.0, 0.10),
    "zoom-out": (0.0, 0.0, -0.10),
}


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: object) -> None:
    body = json.dumps(payload, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _bytes_response(handler: BaseHTTPRequestHandler, status: int, content_type: str, payload: bytes) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


def _not_found(handler: BaseHTTPRequestHandler) -> None:
    _json_response(handler, 404, {"ok": False, "error": "not found"})


def _bounded_int(value: str | None, minimum: int, maximum: int) -> int | None:
    if value is None or value == "":
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return max(minimum, min(maximum, parsed))


class BridgeState:
    def __init__(self, cameras: list[CameraConfig]) -> None:
        self.cameras = {camera.id: camera for camera in cameras}
        self.privacy_zones: dict[str, list[dict[str, object]]] = {camera.id: [] for camera in cameras}
        self.detection_zones: dict[str, list[dict[str, object]]] = {camera.id: [] for camera in cameras}
        self.effective_rtsp_urls: dict[str, str] = {}
        self.ptz_cache: dict[str, tuple[object, list[dict[str, str]]]] = {}
        self.relay = MediaRelayManager(os.environ.get("STREAM_TO_MATTER_RELAY_DIR", "relay"))

    def camera(self, camera_id: str) -> CameraConfig | None:
        return self.cameras.get(camera_id)

    def reload_config(self) -> list[str]:
        cameras = load_config()
        self.cameras = {camera.id: camera for camera in cameras}
        self.privacy_zones = {camera.id: self.privacy_zones.get(camera.id, []) for camera in cameras}
        self.detection_zones = {camera.id: self.detection_zones.get(camera.id, []) for camera in cameras}
        self.effective_rtsp_urls = {}
        self.ptz_cache = {}
        return [camera.id for camera in cameras]


def make_handler(state: BridgeState) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        server_version = "StreamToMatter/0.1"

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            parts = [part for part in parsed.path.split("/") if part]

            if parsed.path == "/health":
                _json_response(self, 200, {"ok": True, "cameras": len(state.cameras)})
                return
            if parsed.path == "/matter/capabilities":
                _json_response(self, 200, [camera_capabilities(camera) for camera in state.cameras.values()])
                return
            if parsed.path == "/matter/manifest":
                base_url = os.environ.get("STREAM_TO_MATTER_BASE_URL", "http://127.0.0.1:8080")
                _json_response(self, 200, [matter_endpoint_manifest(camera, base_url) for camera in state.cameras.values()])
                return
            if parsed.path == "/cameras":
                _json_response(
                    self,
                    200,
                    [
                        {
                            "id": camera.id,
                            "name": camera.name,
                            "rtsp_url": camera.rtsp_url,
                            "matter": camera_capabilities(camera),
                        }
                        for camera in state.cameras.values()
                    ],
                )
                return
            if len(parts) >= 2 and parts[0] == "cameras":
                self._handle_camera_get(parts)
                return
            _not_found(self)

        def do_POST(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            parts = [part for part in parsed.path.split("/") if part]
            if parsed.path == "/config/reload":
                camera_ids = state.reload_config()
                _json_response(self, 200, {"ok": True, "camera_ids": camera_ids})
                return
            if len(parts) >= 2 and parts[0] == "cameras":
                self._handle_camera_post(parts, parsed.query)
                return
            _not_found(self)

        def do_DELETE(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            parts = [part for part in parsed.path.split("/") if part]
            if len(parts) >= 2 and parts[0] == "cameras":
                self._handle_camera_delete(parts)
                return
            _not_found(self)

        def _handle_camera_get(self, parts: list[str]) -> None:
            camera = state.camera(parts[1])
            if not camera:
                _not_found(self)
                return

            tail = parts[2:]
            if tail == ["probe"]:
                _json_response(self, 200, self._probe_camera(camera))
                return
            if tail == ["onvif"]:
                _json_response(self, 200, safe_onvif_summary(camera.onvif))
                return
            if tail == ["matter"]:
                _json_response(self, 200, camera_capabilities(camera))
                return
            if tail == ["streams"]:
                _json_response(self, 200, stream_profiles(camera))
                return
            if tail == ["streams", "relay"]:
                _json_response(self, 200, {"camera_id": camera.id, "relays": state.relay.status(camera.id)})
                return
            if tail == ["stream-uri"]:
                services = discover_services(camera.onvif)
                if not services.media:
                    _json_response(self, 503, {"ok": False, "error": "ONVIF media service unavailable"})
                    return
                profiles = get_profiles(camera.onvif, services.media)
                if not profiles:
                    _json_response(self, 503, {"ok": False, "error": "No ONVIF media profiles found"})
                    return
                _json_response(self, 200, get_stream_uri(camera.onvif, services.media, profiles[0]["token"]))
                return
            if tail == ["zones", "privacy"]:
                _json_response(self, 200, {"camera_id": camera.id, "zones": state.privacy_zones[camera.id]})
                return
            if tail == ["zones", "detection"]:
                _json_response(self, 200, {"camera_id": camera.id, "zones": state.detection_zones[camera.id]})
                return
            if tail == ["snapshot.jpg"]:
                snapshot_dir = Path(os.environ.get("STREAM_TO_MATTER_SNAPSHOT_DIR", "snapshots"))
                snapshot_dir.mkdir(parents=True, exist_ok=True)
                output_path = snapshot_dir / f"{camera.id}.jpg"
                options = self._snapshot_options()
                _json_response(self, 200, capture_snapshot(self._effective_rtsp_url(camera), str(output_path), **options))
                return
            if tail == ["snapshot-data.jpg"]:
                snapshot_dir = Path(os.environ.get("STREAM_TO_MATTER_SNAPSHOT_DIR", "snapshots"))
                snapshot_dir.mkdir(parents=True, exist_ok=True)
                output_path = snapshot_dir / f"{camera.id}.jpg"
                options = self._snapshot_options()
                payload = capture_snapshot(self._effective_rtsp_url(camera), str(output_path), **options)
                if not payload.get("ok"):
                    _json_response(self, 503, payload)
                    return
                _bytes_response(self, 200, "image/jpeg", output_path.read_bytes())
                return
            if tail == ["snapshot.heic"]:
                snapshot_dir = Path(os.environ.get("STREAM_TO_MATTER_SNAPSHOT_DIR", "snapshots"))
                snapshot_dir.mkdir(parents=True, exist_ok=True)
                jpeg_path = snapshot_dir / f"{camera.id}.jpg"
                heic_path = snapshot_dir / f"{camera.id}.heic"
                _json_response(self, 200, capture_heic_snapshot(self._effective_rtsp_url(camera), str(jpeg_path), str(heic_path)))
                return
            if tail == ["snapshot-data.heic"]:
                snapshot_dir = Path(os.environ.get("STREAM_TO_MATTER_SNAPSHOT_DIR", "snapshots"))
                snapshot_dir.mkdir(parents=True, exist_ok=True)
                jpeg_path = snapshot_dir / f"{camera.id}.jpg"
                heic_path = snapshot_dir / f"{camera.id}.heic"
                payload = capture_heic_snapshot(self._effective_rtsp_url(camera), str(jpeg_path), str(heic_path))
                if not payload.get("ok"):
                    _json_response(self, 503, payload)
                    return
                _bytes_response(self, 200, "image/heic", heic_path.read_bytes())
                return
            if tail == ["ptz", "status"]:
                services = discover_services(camera.onvif)
                if not services.ptz or not services.media:
                    _json_response(self, 503, {"ok": False, "error": "ONVIF PTZ or media service unavailable"})
                    return
                profiles = get_profiles(camera.onvif, services.media)
                if not profiles:
                    _json_response(self, 503, {"ok": False, "error": "No ONVIF media profiles found"})
                    return
                _json_response(self, 200, get_ptz_status(camera.onvif, services.ptz, profiles[0]["token"]))
                return
            _not_found(self)

        def _effective_rtsp_url(self, camera: CameraConfig) -> str:
            primary = probe_rtsp(camera.rtsp_url, timeout_seconds=3)
            if primary.get("ok"):
                state.effective_rtsp_urls[camera.id] = camera.rtsp_url
                return camera.rtsp_url

            cached = state.effective_rtsp_urls.get(camera.id)
            if cached:
                return cached

            try:
                services = discover_services(camera.onvif)
                if not services.media:
                    return camera.rtsp_url
                profiles = get_profiles(camera.onvif, services.media)
                if not profiles:
                    return camera.rtsp_url
                uri_payload = get_stream_uri(camera.onvif, services.media, profiles[0]["token"])
                uri = uri_payload.get("uri")
                if not isinstance(uri, str):
                    return camera.rtsp_url
                authed_url = add_rtsp_credentials(uri, camera.onvif.user, camera.onvif.password)
                state.effective_rtsp_urls[camera.id] = authed_url
                return authed_url
            except Exception:
                return camera.rtsp_url

        def _snapshot_options(self) -> dict[str, int | None]:
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            return {
                "width": _bounded_int(query.get("width", [None])[0], 1, 3840),
                "height": _bounded_int(query.get("height", [None])[0], 1, 2160),
                "quality": _bounded_int(query.get("quality", [None])[0], 1, 100),
                "max_bytes": _bounded_int(query.get("max_bytes", [None])[0], 1024, 1_000_000),
            }

        def _probe_camera(self, camera: CameraConfig) -> dict[str, object]:
            primary = probe_rtsp(camera.rtsp_url)
            primary["source"] = "configured_rtsp"
            if primary.get("ok"):
                return primary

            fallback: dict[str, object] = {"ok": False, "error": "ONVIF fallback not attempted"}
            try:
                services = discover_services(camera.onvif)
                if services.media:
                    profiles = get_profiles(camera.onvif, services.media)
                    if profiles:
                        uri_payload = get_stream_uri(camera.onvif, services.media, profiles[0]["token"])
                        uri = uri_payload.get("uri")
                        if isinstance(uri, str):
                            authed_uri = add_rtsp_credentials(uri, camera.onvif.user, camera.onvif.password)
                            fallback = probe_rtsp(authed_uri)
                            fallback["source"] = "onvif_stream_uri"
                            fallback["uri"] = uri
                            if fallback.get("ok"):
                                state.effective_rtsp_urls[camera.id] = authed_uri
            except Exception as exc:  # noqa: BLE001
                fallback = {"ok": False, "source": "onvif_stream_uri", "error": str(exc)}

            return {
                "ok": bool(fallback.get("ok")),
                "primary": primary,
                "fallback": fallback,
                "has_video": fallback.get("has_video", False),
                "has_audio": fallback.get("has_audio", False),
                "streams": fallback.get("streams", []),
                "effective_uri": redact_url(authed_uri) if fallback.get("ok") and "authed_uri" in locals() else None,
            }

        def _handle_camera_post(self, parts: list[str], query: str) -> None:
            camera = state.camera(parts[1])
            if not camera:
                _not_found(self)
                return
            tail = parts[2:]
            if tail in (["zones", "privacy"], ["zones", "detection"]):
                length = int(self.headers.get("Content-Length", "0"))
                raw_body = self.rfile.read(length) if length else b"{}"
                try:
                    zone = json.loads(raw_body.decode("utf-8"))
                except json.JSONDecodeError:
                    _json_response(self, 400, {"ok": False, "error": "Body must be JSON"})
                    return
                if not isinstance(zone, dict) or "id" not in zone or "points" not in zone:
                    _json_response(self, 400, {"ok": False, "error": "Zone must include id and points"})
                    return
                target = state.privacy_zones if tail == ["zones", "privacy"] else state.detection_zones
                zones = [existing for existing in target[camera.id] if existing.get("id") != zone["id"]]
                if not zone.get("removed"):
                    zones.append(zone)
                target[camera.id] = zones
                _json_response(self, 200, {"ok": True, "camera_id": camera.id, "zones": zones})
                return
            if len(tail) == 3 and tail[0] == "streams" and tail[2] in ("hls", "dash"):
                profile_id = self._profile_id(tail[1])
                format_id = self._format_id(tail[2])
                if not profile_id or not format_id:
                    _json_response(self, 400, {"ok": False, "error": "Invalid relay profile or format"})
                    return
                payload = state.relay.start(camera.id, self._effective_rtsp_url(camera), profile_id, format_id)
                _json_response(self, 200 if payload.get("ok") else 503, payload)
                return
            if len(tail) == 4 and tail[0] == "streams" and tail[3] == "stop" and tail[2] in ("hls", "dash"):
                profile_id = self._profile_id(tail[1])
                format_id = self._format_id(tail[2])
                if not profile_id or not format_id:
                    _json_response(self, 400, {"ok": False, "error": "Invalid relay profile or format"})
                    return
                _json_response(self, 200, state.relay.stop(camera.id, profile_id, format_id))
                return
            if tail == ["ptz", "continuous"]:
                params = parse_qs(query)
                services, profiles = self._ptz_services_and_profiles(camera)
                if not services or not profiles:
                    return
                payload = continuous_move(
                    camera.onvif,
                    services.ptz,
                    profiles[0]["token"],
                    pan=float(params.get("pan", ["0"])[0]),
                    tilt=float(params.get("tilt", ["0"])[0]),
                    zoom=float(params.get("zoom", ["0"])[0]),
                )
                _json_response(self, 200, payload)
                return
            if len(tail) == 3 and tail[:2] == ["ptz", "direction"]:
                direction = tail[2]
                velocity = PTZ_DIRECTIONS.get(direction)
                if velocity is None:
                    _json_response(
                        self,
                        400,
                        {
                            "ok": False,
                            "error": "Invalid PTZ direction",
                            "directions": sorted(PTZ_DIRECTIONS),
                        },
                    )
                    return
                params = parse_qs(query)
                speed = float(params.get("speed", ["1.0"])[0])
                pan, tilt, zoom = (value * speed for value in velocity)
                services, profiles = self._ptz_services_and_profiles(camera)
                if not services or not profiles:
                    return
                payload = continuous_move(
                    camera.onvif,
                    services.ptz,
                    profiles[0]["token"],
                    pan=pan,
                    tilt=tilt,
                    zoom=zoom,
                )
                payload["direction"] = direction
                payload["speed"] = speed
                _json_response(self, 200, payload)
                return
            if tail == ["ptz", "relative"]:
                params = parse_qs(query)
                services, profiles = self._ptz_services_and_profiles(camera)
                if not services or not profiles:
                    return
                _json_response(
                    self,
                    200,
                    relative_move(
                        camera.onvif,
                        services.ptz,
                        profiles[0]["token"],
                        pan=float(params.get("pan", ["0"])[0]),
                        tilt=float(params.get("tilt", ["0"])[0]),
                        zoom=float(params.get("zoom", ["0"])[0]),
                    ),
                )
                return
            if tail == ["ptz", "absolute"]:
                params = parse_qs(query)
                services, profiles = self._ptz_services_and_profiles(camera)
                if not services or not profiles:
                    return
                _json_response(
                    self,
                    200,
                    absolute_move(
                        camera.onvif,
                        services.ptz,
                        profiles[0]["token"],
                        pan=float(params.get("pan", ["0"])[0]),
                        tilt=float(params.get("tilt", ["0"])[0]),
                        zoom=float(params.get("zoom", ["0"])[0]),
                    ),
                )
                return
            if tail == ["ptz", "stop"]:
                services, profiles = self._ptz_services_and_profiles(camera)
                if not services or not profiles:
                    return
                _json_response(self, 200, stop(camera.onvif, services.ptz, profiles[0]["token"]))
                return
            _not_found(self)

        def _handle_camera_delete(self, parts: list[str]) -> None:
            camera = state.camera(parts[1])
            if not camera:
                _not_found(self)
                return

            tail = parts[2:]
            if len(tail) == 3 and tail[:2] in (["zones", "privacy"], ["zones", "detection"]):
                zone_id = tail[2]
                target = state.privacy_zones if tail[:2] == ["zones", "privacy"] else state.detection_zones
                zones = [existing for existing in target[camera.id] if str(existing.get("id")) != zone_id]
                target[camera.id] = zones
                _json_response(self, 200, {"ok": True, "camera_id": camera.id, "removed": zone_id, "zones": zones})
                return

            _not_found(self)

        def _ptz_services_and_profiles(self, camera: CameraConfig) -> tuple[object | None, list[dict[str, str]] | None]:
            cached = state.ptz_cache.get(camera.id)
            if cached:
                return cached

            try:
                services = discover_services(camera.onvif)
            except Exception as exc:  # noqa: BLE001
                _json_response(self, 503, {"ok": False, "error": f"ONVIF discovery failed: {exc}"})
                return None, None
            if not services.ptz or not services.media:
                _json_response(self, 503, {"ok": False, "error": "ONVIF PTZ or media service unavailable"})
                return None, None
            try:
                profiles = get_profiles(camera.onvif, services.media)
            except Exception as exc:  # noqa: BLE001
                _json_response(self, 503, {"ok": False, "error": f"ONVIF profile discovery failed: {exc}"})
                return None, None
            if not profiles:
                _json_response(self, 503, {"ok": False, "error": "No ONVIF media profiles found"})
                return None, None
            state.ptz_cache[camera.id] = (services, profiles)
            return services, profiles

        def _profile_id(self, value: str) -> ProfileId | None:
            return value if value in ("high", "mobile", "analysis") else None

        def _format_id(self, value: str) -> FormatId | None:
            return value if value in ("hls", "dash") else None

        def log_message(self, format: str, *args: object) -> None:
            if os.environ.get("STREAM_TO_MATTER_ACCESS_LOG", "0") == "1":
                super().log_message(format, *args)

    return Handler


def run() -> None:
    cameras = load_config()
    state = BridgeState(cameras)
    host = os.environ.get("STREAM_TO_MATTER_HOST", "0.0.0.0")
    port = int(os.environ.get("STREAM_TO_MATTER_PORT", "8080"))
    server = ThreadingHTTPServer((host, port), make_handler(state))
    print(f"Stream to Matter bridge listening on http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    run()
