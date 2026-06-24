from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


PTZ_DIRECTIONS = [
    "left",
    "right",
    "up",
    "down",
    "up-left",
    "up-right",
    "down-left",
    "down-right",
    "zoom-in",
    "zoom-out",
]


@dataclass
class CheckResult:
    name: str
    ok: bool
    details: dict[str, Any]


class HttpClient:
    def __init__(self, timeout: int = 30) -> None:
        self.timeout = timeout

    def get_json(self, url: str) -> dict[str, Any] | list[Any]:
        return self._request_json("GET", url)

    def post_json(self, url: str, body: dict[str, Any] | None = None) -> dict[str, Any] | list[Any]:
        return self._request_json("POST", url, body)

    def delete_json(self, url: str) -> dict[str, Any] | list[Any]:
        return self._request_json("DELETE", url)

    def get_bytes(self, url: str) -> tuple[int, str, int, bytes]:
        with urlopen(Request(url, method="GET"), timeout=self.timeout) as response:
            body = response.read()
            return response.status, response.headers.get("Content-Type", ""), len(body), body

    def _request_json(self, method: str, url: str, body: dict[str, Any] | None = None) -> dict[str, Any] | list[Any]:
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"Content-Type": "application/json"} if body is not None else {}
        try:
            with urlopen(Request(url, data=data, headers=headers, method=method), timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            payload = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {url} returned {error.code}: {payload}") from error


def main() -> int:
    parser = argparse.ArgumentParser(description="Run live acceptance checks against the Dockerized bridge and Matter sidecar.")
    parser.add_argument("--bridge-url", default="http://127.0.0.1:8080")
    parser.add_argument("--sidecar-url", default="http://127.0.0.1:8090")
    parser.add_argument("--camera-id", default="camera")
    parser.add_argument("--move-ptz", action="store_true", help="Run all PTZ direction moves through the sidecar.")
    parser.add_argument("--relay-seconds", type=float, default=2.0, help="Seconds to let the HLS relay run before stopping.")
    parser.add_argument("--require-whep", action="store_true", help="Fail if the sidecar is not configured for WHEP media.")
    args = parser.parse_args()

    client = HttpClient()
    results = run_checks(client, args)
    print(json.dumps([result.__dict__ for result in results], indent=2))
    return 0 if all(result.ok for result in results) else 1


def run_checks(client: HttpClient, args: argparse.Namespace) -> list[CheckResult]:
    bridge = args.bridge_url.rstrip("/")
    sidecar = args.sidecar_url.rstrip("/")
    camera_id = args.camera_id
    results: list[CheckResult] = []

    results.append(check_bridge_health(client, bridge))
    results.append(check_sidecar_health(client, sidecar))
    results.append(check_probe(client, bridge, camera_id))
    results.append(check_manifest(client, bridge, camera_id))
    results.append(check_onboarding(client, sidecar))
    results.extend(check_snapshots(client, bridge, camera_id))
    results.append(check_hls_relay(client, bridge, camera_id, args.relay_seconds))
    results.append(check_zones(client, sidecar, camera_id))
    results.append(check_ptz(client, sidecar, camera_id, args.move_ptz))
    results.append(check_whep_status(client, sidecar, args.require_whep))
    return results


def check_bridge_health(client: HttpClient, bridge: str) -> CheckResult:
    payload = client.get_json(f"{bridge}/health")
    return CheckResult("bridge_health", bool(payload.get("ok")), {"payload": payload})


def check_sidecar_health(client: HttpClient, sidecar: str) -> CheckResult:
    payload = client.get_json(f"{sidecar}/health")
    ok = bool(payload.get("ok")) and bool(payload.get("matterNodeStarted")) and bool(payload.get("pairable"))
    return CheckResult("sidecar_health", ok, {"payload": payload})


def check_probe(client: HttpClient, bridge: str, camera_id: str) -> CheckResult:
    payload = client.get_json(f"{bridge}/cameras/{camera_id}/probe")
    ok = bool(payload.get("ok")) and bool(payload.get("has_video"))
    return CheckResult("camera_probe", ok, {"has_audio": payload.get("has_audio"), "streams": payload.get("streams")})


def check_manifest(client: HttpClient, bridge: str, camera_id: str) -> CheckResult:
    payload = client.get_json(f"{bridge}/matter/manifest")
    manifest = next((item for item in payload if item.get("endpoint", {}).get("id") == camera_id), None)
    capabilities = {item["name"]: item for item in manifest.get("endpoint", {}).get("capabilities", [])} if manifest else {}
    required_enabled = ["live_video", "live_audio", "multi_stream", "hls", "dash", "snapshot_jpeg", "snapshot_heic", "ptz"]
    ok = bool(manifest) and all(capabilities.get(name, {}).get("status") == "enabled" for name in required_enabled)
    return CheckResult(
        "matter_manifest",
        ok,
        {
            "matter_standard": manifest.get("matter_standard") if manifest else None,
            "enabled": {name: capabilities.get(name, {}).get("status") for name in required_enabled},
        },
    )


def check_onboarding(client: HttpClient, sidecar: str) -> CheckResult:
    payload = client.get_json(f"{sidecar}/matter/onboarding")
    ok = bool(payload.get("pairable")) and bool(payload.get("manualPairingCode")) and payload.get("cameraEndpoint", {}).get("attached") is True
    return CheckResult(
        "matter_onboarding",
        ok,
        {
            "manualPairingCode": payload.get("manualPairingCode"),
            "qrPairingCode": payload.get("qrPairingCode"),
            "cameraEndpoint": payload.get("cameraEndpoint"),
        },
    )


def check_snapshots(client: HttpClient, bridge: str, camera_id: str) -> list[CheckResult]:
    checks = []
    for suffix, expected_type in [("jpg", "image/jpeg"), ("heic", "image/heic")]:
        status, content_type, size, _body = client.get_bytes(f"{bridge}/cameras/{camera_id}/snapshot-data.{suffix}")
        checks.append(
            CheckResult(
                f"snapshot_{suffix}",
                status == 200 and expected_type in content_type and size > 1024,
                {"status": status, "content_type": content_type, "size": size},
            )
        )
    return checks


def check_hls_relay(client: HttpClient, bridge: str, camera_id: str, relay_seconds: float) -> CheckResult:
    started = client.post_json(f"{bridge}/cameras/{camera_id}/streams/mobile/hls")
    time.sleep(max(0.0, relay_seconds))
    status = client.get_json(f"{bridge}/cameras/{camera_id}/streams/relay")
    stopped = client.post_json(f"{bridge}/cameras/{camera_id}/streams/mobile/hls/stop")
    ok = bool(started.get("ok")) and bool(stopped.get("ok")) and any(
        relay.get("profile") == "mobile" and relay.get("format") == "hls" for relay in status.get("relays", [])
    )
    return CheckResult("hls_relay", ok, {"started": summarize_relay(started), "stopped": summarize_relay(stopped)})


def check_zones(client: HttpClient, sidecar: str, camera_id: str) -> CheckResult:
    base = f"{sidecar}/camera/{camera_id}/zones"
    privacy = {"id": "acceptance_privacy", "points": [[0.05, 0.05], [0.25, 0.05], [0.25, 0.25], [0.05, 0.25]]}
    detection = {"id": "acceptance_detection", "points": [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]}
    privacy_post = client.post_json(f"{base}/privacy", privacy)
    detection_post = client.post_json(f"{base}/detection", detection)
    privacy_delete = client.delete_json(f"{base}/privacy/{privacy['id']}")
    detection_delete = client.delete_json(f"{base}/detection/{detection['id']}")
    ok = all(item.get("ok") for item in [privacy_post, detection_post, privacy_delete, detection_delete])
    return CheckResult("zone_controls", ok, {"privacy_delete": privacy_delete, "detection_delete": detection_delete})


def check_ptz(client: HttpClient, sidecar: str, camera_id: str, move_ptz: bool) -> CheckResult:
    if not move_ptz:
        return CheckResult("ptz_direction_controls", True, {"skipped": True, "directions": PTZ_DIRECTIONS})
    moves = {}
    for direction in PTZ_DIRECTIONS:
        try:
            moves[direction] = client.post_json(f"{sidecar}/camera/{camera_id}/ptz/{direction}?speed=0.12&stopAfterMs=200")
        except Exception as exc:  # noqa: BLE001
            moves[direction] = {"ok": False, "error": str(exc)}
    ok = all(payload.get("ok") and payload.get("move", {}).get("ok") for payload in moves.values())
    return CheckResult("ptz_direction_controls", ok, {"directions": sorted(moves)})


def check_whep_status(client: HttpClient, sidecar: str, require_whep: bool) -> CheckResult:
    status = client.get_json(f"{sidecar}/status")
    configured = bool(status.get("mediaWhepConfigured"))
    ok = configured or not require_whep
    return CheckResult("whep_media_configuration", ok, {"configured": configured, "required": require_whep})


def summarize_relay(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "ok": payload.get("ok"),
        "profile": payload.get("profile"),
        "format": payload.get("format"),
        "running": payload.get("running"),
        "exists": payload.get("exists"),
    }


if __name__ == "__main__":
    sys.exit(main())
