import unittest
import json
import os
import tempfile
from unittest.mock import Mock, patch

from stream_to_matter.config import load_config
from stream_to_matter.matter_adapter import matter_endpoint_manifest
from stream_to_matter.matter_model import camera_capabilities, stream_profiles
from stream_to_matter.media_relay import build_ffmpeg_relay_command, redact_command, relay_output_path
from stream_to_matter.rtsp_probe import add_rtsp_credentials, capture_heic_snapshot, redact_url
from stream_to_matter.server import PTZ_DIRECTIONS


class ConfigAndModelTests(unittest.TestCase):
    def test_loads_generic_camera_config(self):
        with patch.dict(
            os.environ,
            {
                "CAMERA_ID": "camera",
                "CAMERA_NAME": "Camera",
                "CAMERA_RTSP_URL": "rtsp://127.0.0.1:8554/camera",
                "CAMERA_ONVIF_HOST": "192.168.68.59",
                "CAMERA_ONVIF_PORT": "80",
                "CAMERA_ONVIF_USER": "rtsp",
                "CAMERA_ONVIF_PASSWORD": "camera-password",
            },
            clear=True,
        ):
            cameras = load_config("config/cameras.json")
        self.assertEqual(len(cameras), 1)
        camera = cameras[0]
        self.assertEqual(camera.id, "camera")
        self.assertEqual(camera.onvif.host, "192.168.68.59")
        self.assertEqual(camera.rtsp_url, "rtsp://127.0.0.1:8554/camera")

    def test_loads_multiple_camera_config(self):
        payload = {
            "cameras": [
                {
                    "id": "front_door",
                    "name": "Front Door",
                    "rtsp_url": "rtsp://front/stream",
                    "onvif": {"host": "front.local", "port": 80, "user": "front", "password": "secret"},
                    "matter": {"advertise_ptz": True, "advertise_audio": True},
                },
                {
                    "id": "garage",
                    "name": "Garage",
                    "rtsp_url": "rtsp://garage/stream",
                    "onvif": {"host": "garage.local", "port": 8080, "user": "garage", "password": "secret"},
                    "matter": {"advertise_ptz": False, "advertise_audio": False},
                },
            ]
        }
        with tempfile.NamedTemporaryFile("w", encoding="utf-8") as handle:
            json.dump(payload, handle)
            handle.flush()

            cameras = load_config(handle.name)

        self.assertEqual([camera.id for camera in cameras], ["front_door", "garage"])
        self.assertEqual(cameras[0].name, "Front Door")
        self.assertTrue(cameras[0].matter.advertise_ptz)
        self.assertEqual(cameras[1].onvif.port, 8080)
        self.assertFalse(cameras[1].matter.advertise_audio)

    def test_matter_151_capability_surface_contains_camera_controls(self):
        camera = load_config("config/cameras.json")[0]
        payload = camera_capabilities(camera)
        names = {item["name"]: item for item in payload["capabilities"]}

        for required in [
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
        ]:
            self.assertIn(required, names)

        self.assertEqual(payload["standard"], "Matter 1.5.1")
        self.assertEqual(names["ptz"]["status"], "enabled")
        self.assertEqual(names["hls"]["status"], "enabled")
        self.assertEqual(names["dash"]["status"], "enabled")
        self.assertEqual(names["snapshot_heic"]["status"], "enabled")

    def test_stream_profiles_cover_matter_multistream_uses(self):
        camera = load_config("config/cameras.json")[0]
        payload = stream_profiles(camera)
        purposes = {profile["purpose"] for profile in payload["profiles"]}
        self.assertLessEqual({"recording", "live_view", "ai_detection"}, purposes)

    def test_adds_rtsp_credentials_to_onvif_uri(self):
        uri = add_rtsp_credentials("rtsp://192.168.68.59:554/av_stream/ch0", "rtsp", "camera-password")
        self.assertEqual(uri, "rtsp://rtsp:camera-password@192.168.68.59:554/av_stream/ch0")

    def test_replaces_rtsp_credentials_for_onvif_fallback_uri(self):
        uri = add_rtsp_credentials(
            "rtsp://old:wrong@192.168.68.59:554/av_stream/ch0",
            "rtsp",
            "camera-password",
            replace_existing=True,
        )
        self.assertEqual(uri, "rtsp://rtsp:camera-password@192.168.68.59:554/av_stream/ch0")

    def test_does_not_add_empty_rtsp_credentials(self):
        uri = add_rtsp_credentials("rtsp://127.0.0.1:28555/stm_lab", "", "", replace_existing=True)
        self.assertEqual(uri, "rtsp://127.0.0.1:28555/stm_lab")

    def test_redacts_rtsp_credentials(self):
        uri = redact_url("rtsp://rtsp:camera-password@192.168.68.59:554/av_stream/ch0")
        self.assertEqual(uri, "rtsp://rtsp:***@192.168.68.59:554/av_stream/ch0")

    def test_matter_endpoint_manifest_exposes_sidecar_routes(self):
        camera = load_config("config/cameras.json")[0]
        manifest = matter_endpoint_manifest(camera, "http://bridge.local:8080")
        routes = manifest["endpoint"]["routes"]
        self.assertEqual(manifest["commissioning"]["status"], "sidecar_required")
        self.assertEqual(manifest["endpoint"]["name"], camera.name)
        self.assertEqual(routes["hls_high"], "http://bridge.local:8080/cameras/camera/streams/high/hls")
        self.assertEqual(routes["ptz_direction"], "http://bridge.local:8080/cameras/camera/ptz/direction/{direction}")
        self.assertEqual(routes["ptz_absolute"], "http://bridge.local:8080/cameras/camera/ptz/absolute")
        self.assertEqual(routes["snapshot_heic_data"], "http://bridge.local:8080/cameras/camera/snapshot-data.heic")

    def test_multiple_manifest_entries_keep_camera_routes_separate(self):
        cameras = [
            load_config("config/cameras.json")[0],
            load_config("config/cameras.example.json")[0],
        ]
        manifests = [matter_endpoint_manifest(camera, "http://bridge.local:8080") for camera in cameras]
        ids = [manifest["endpoint"]["id"] for manifest in manifests]
        self.assertEqual(ids, ["camera", "front_door"])
        self.assertEqual(
            manifests[0]["endpoint"]["routes"]["probe"],
            "http://bridge.local:8080/cameras/camera/probe",
        )
        self.assertEqual(
            manifests[1]["endpoint"]["routes"]["probe"],
            "http://bridge.local:8080/cameras/front_door/probe",
        )

    def test_ptz_direction_map_covers_cardinal_diagonal_and_zoom(self):
        self.assertEqual(
            set(PTZ_DIRECTIONS),
            {
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
            },
        )

    def test_hls_relay_command_preserves_high_video(self):
        output = relay_output_path(__import__("pathlib").Path("relay"), "camera", "high", "hls")
        command = build_ffmpeg_relay_command("rtsp://camera/stream", output, "high", "hls")
        self.assertIn("-c:v", command)
        self.assertIn("copy", command)
        self.assertIn("-f", command)
        self.assertIn("hls", command)

    def test_mobile_dash_relay_command_transcodes(self):
        output = relay_output_path(__import__("pathlib").Path("relay"), "camera", "mobile", "dash")
        command = build_ffmpeg_relay_command("rtsp://camera/stream", output, "mobile", "dash")
        self.assertIn("scale=1280:720,fps=15", command)
        self.assertIn("libx264", command)
        self.assertIn("dash", command)

    def test_relay_command_redacts_credentials(self):
        redacted = redact_command(["ffmpeg", "-i", "rtsp://rtsp:camera-password@192.168.68.59:554/av_stream/ch0"])
        self.assertEqual(redacted[-1], "rtsp://rtsp:***@192.168.68.59:554/av_stream/ch0")

    @patch("stream_to_matter.rtsp_probe.heif_encoder_available", return_value=True)
    @patch("stream_to_matter.rtsp_probe.capture_snapshot", return_value={"ok": True, "path": "snapshot.jpg"})
    @patch("stream_to_matter.rtsp_probe.subprocess.run")
    def test_heic_snapshot_uses_heif_encoder(self, run: Mock, _capture: Mock, _available: Mock):
        run.return_value = Mock(returncode=0, stdout="", stderr="")
        payload = capture_heic_snapshot("rtsp://camera/stream", "snapshot.jpg", "snapshot.heic")

        self.assertEqual(payload, {"ok": True, "path": "snapshot.heic", "source": "snapshot.jpg"})
        run.assert_called_once()
        self.assertEqual(run.call_args.args[0], ["heif-enc", "-q", "90", "snapshot.jpg", "-o", "snapshot.heic"])

    @patch("stream_to_matter.rtsp_probe.heif_encoder_available", return_value=False)
    def test_heic_snapshot_reports_missing_encoder(self, _available: Mock):
        payload = capture_heic_snapshot("rtsp://camera/stream", "snapshot.jpg", "snapshot.heic")
        self.assertEqual(payload, {"ok": False, "error": "heif-enc is not installed"})


if __name__ == "__main__":
    unittest.main()
