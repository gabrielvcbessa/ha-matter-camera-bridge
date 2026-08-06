import importlib.util
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, patch


def load_whep_relay():
    module_path = Path(__file__).resolve().parents[1] / "media" / "whep_relay.py"
    spec = importlib.util.spec_from_file_location("whep_relay", module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class WhepRelayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.relay = load_whep_relay()
        except ModuleNotFoundError as error:
            raise unittest.SkipTest(f"media relay dependency is not installed: {error.name}") from error

    def test_camera_specific_source_env(self):
        with patch.dict(os.environ, {"CAMERA_MEDIA_SOURCE": "rtsp://camera/stream"}, clear=True):
            self.assertEqual(self.relay.source_for("camera"), "rtsp://camera/stream")

    def test_named_camera_source_env_overrides_generic_source(self):
        with patch.dict(
            os.environ,
            {
                "FRONT_DOOR_MEDIA_SOURCE": "rtsp://front-door/stream",
                "CAMERA_MEDIA_SOURCE": "rtsp://camera/stream",
            },
            clear=True,
        ):
            self.assertEqual(self.relay.source_for("front_door"), "rtsp://front-door/stream")

    def test_generic_source_env_fallback(self):
        with patch.dict(os.environ, {"MEDIA_SOURCE": "rtsp://generic/stream"}, clear=True):
            self.assertEqual(self.relay.source_for("unknown"), "rtsp://generic/stream")

    def test_plain_rtsp_source_is_normalized_for_browser_webrtc(self):
        self.assertEqual(
            self.relay.normalized_go2rtc_source("rtsp://user:secret@camera/stream"),
            "ffmpeg:rtsp://user:secret@camera/stream#tcp#video=h264#audio=opus",
        )

    def test_camera_without_advertised_audio_does_not_require_audio_transcode(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "cameras.json"
            config_path.write_text(
                json.dumps(
                    {
                        "cameras": [
                            {
                                "id": "silent",
                                "matter": {"advertise_audio": False},
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            with patch.dict(os.environ, {"STREAM_TO_MATTER_CONFIG": str(config_path)}, clear=True):
                self.assertEqual(
                    self.relay.normalized_go2rtc_source("rtsp://camera/stream", "silent"),
                    "ffmpeg:rtsp://camera/stream#tcp#video=h264",
                )

    def test_explicit_go2rtc_source_is_preserved(self):
        source = "ffmpeg:rtsp://camera/stream#video=copy#audio=opus"
        self.assertEqual(self.relay.normalized_go2rtc_source(source), source)

    def test_configured_source_names_include_config_camera_ids(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "cameras.json"
            config_path.write_text(
                json.dumps(
                    {
                        "cameras": [
                            {"id": "front", "rtsp_url": "rtsp://user:secret@front/stream"},
                            {"id": "empty", "rtsp_url": ""},
                        ]
                    }
                ),
                encoding="utf-8",
            )
            with patch.dict(
                os.environ,
                {"STREAM_TO_MATTER_CONFIG": str(config_path), "MEDIA_SOURCE": "rtsp://generic/stream"},
                clear=True,
            ):
                self.assertEqual(self.relay.configured_source_names(), ["MEDIA_SOURCE", "config:front"])

    def test_config_source_resolves_environment_placeholders(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "cameras.json"
            config_path.write_text(
                json.dumps({"cameras": [{"id": "front", "media_source": "rtsp://user:${CAMERA_PASSWORD}@front/stream"}]}),
                encoding="utf-8",
            )
            with patch.dict(
                os.environ,
                {"STREAM_TO_MATTER_CONFIG": str(config_path), "CAMERA_PASSWORD": "secret"},
                clear=True,
            ):
                self.assertEqual(self.relay.source_for("front"), "rtsp://user:secret@front/stream")

    def test_create_app_registers_health_route(self):
        app = self.relay.create_app()
        self.assertTrue(any(route.resource.canonical == "/health" for route in app.router.routes()))
        self.assertTrue(any(route.resource.canonical == "/{camera_id}/snapshot.jpg" for route in app.router.routes()))

    def test_go2rtc_health_does_not_report_dummy_peer_state(self):
        session_id = "go2rtc-session"
        self.relay.SESSIONS[session_id] = self.relay.WhepSession(
            peer=None,
            player=None,
            camera_id="front",
            mode="go2rtc-whep",
            created_at="2026-08-01T00:00:00+00:00",
        )
        try:
            response = asyncio.run(self.relay.health(None))
            payload = json.loads(response.text)
            session = payload["activeSessions"][0]
            self.assertEqual(session["connectionState"], "managed-by-go2rtc")
            self.assertIsNone(session["iceConnectionState"])
        finally:
            self.relay.SESSIONS.pop(session_id, None)

    def test_go2rtc_lock_is_stable_per_camera(self):
        self.relay.GO2RTC_LOCKS.clear()
        try:
            self.assertIs(self.relay.go2rtc_lock("front"), self.relay.go2rtc_lock("front"))
            self.assertIsNot(self.relay.go2rtc_lock("front"), self.relay.go2rtc_lock("garage"))
        finally:
            self.relay.GO2RTC_LOCKS.clear()

    def test_redacts_rtsp_passwords_from_relay_errors(self):
        value = "ffmpeg failed for rtsp://camera-user:camera-password@camera.local/stream"
        redacted = self.relay.redact_sensitive_text(value)
        self.assertEqual(redacted, "ffmpeg failed for rtsp://camera-user:***@camera.local/stream")
        self.assertNotIn("camera-password", redacted)

    def test_failed_go2rtc_replacement_does_not_cache_new_source(self):
        self.relay.GO2RTC_STREAMS.clear()
        request = AsyncMock(side_effect=[
            (409, {}, b"already exists"),
            (204, {}, b""),
            (500, {}, b"rtsp://user:secret@camera/stream failed"),
        ])
        with patch.object(self.relay, "go2rtc_request", request), patch.object(
            self.relay, "go2rtc_stream_exists", AsyncMock(return_value=True)
        ), patch.object(
            self.relay, "go2rtc_stream_matches", AsyncMock(return_value=False)
        ):
            with self.assertRaisesRegex(RuntimeError, r"rtsp://user:\*\*\*@camera/stream"):
                asyncio.run(self.relay.ensure_go2rtc_stream("front", "rtsp://user:secret@camera/stream"))
        self.assertNotIn("front", self.relay.GO2RTC_STREAMS)

    def test_accepts_go2rtc_yaml_write_error_only_when_stream_was_registered(self):
        self.relay.GO2RTC_STREAMS.clear()
        with patch.object(
            self.relay,
            "go2rtc_request",
            AsyncMock(return_value=(400, {}, b"yaml: line 8: did not find expected key")),
        ), patch.object(
            self.relay, "go2rtc_stream_matches", AsyncMock(return_value=True)
        ):
            stream_name = asyncio.run(
                self.relay.ensure_go2rtc_stream("front", "rtsp://camera/stream")
            )
        self.assertEqual(stream_name, "front_webrtc")
        self.assertIn("front", self.relay.GO2RTC_STREAMS)

    def test_prunes_removed_go2rtc_streams(self):
        self.relay.GO2RTC_STREAMS.clear()
        self.relay.GO2RTC_STREAMS["removed"] = "ffmpeg:rtsp://camera/old"
        with patch.object(self.relay, "source_for", return_value=None), patch.object(
            self.relay, "go2rtc_request", AsyncMock(return_value=(204, {}, b""))
        ):
            asyncio.run(self.relay.prune_go2rtc_streams())
        self.assertNotIn("removed", self.relay.GO2RTC_STREAMS)


if __name__ == "__main__":
    unittest.main()
