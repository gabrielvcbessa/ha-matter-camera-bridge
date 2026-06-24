import importlib.util
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


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

    def test_create_app_registers_health_route(self):
        app = self.relay.create_app()
        self.assertTrue(any(route.resource.canonical == "/health" for route in app.router.routes()))


if __name__ == "__main__":
    unittest.main()
