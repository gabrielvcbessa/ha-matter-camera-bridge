from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest

CLIENT_PATH = Path(__file__).resolve().parents[1] / "custom_components" / "stream_to_matter" / "client.py"
CLIENT_SPEC = importlib.util.spec_from_file_location("stream_to_matter_ha_client", CLIENT_PATH)
assert CLIENT_SPEC and CLIENT_SPEC.loader
client_module = importlib.util.module_from_spec(CLIENT_SPEC)
sys.modules[CLIENT_SPEC.name] = client_module
CLIENT_SPEC.loader.exec_module(client_module)

StreamToMatterClient = client_module.StreamToMatterClient
cameras_from_status = client_module.cameras_from_status


class CamerasFromStatusTest(unittest.TestCase):
    def test_extracts_camera_summaries_from_status(self) -> None:
        payload = {
            "cameras": [
                {
                    "id": "front",
                    "name": "Front Door",
                    "probe": {"ok": True, "has_video": True, "has_audio": False},
                    "endpoint": {"attached": True},
                },
                {
                    "id": "garage",
                    "name": "Garage",
                    "probe": {"ok": False, "has_video": False, "has_audio": False},
                    "endpoint": {"attached": False},
                },
            ]
        }

        cameras = cameras_from_status(payload)

        self.assertEqual([camera.camera_id for camera in cameras], ["front", "garage"])
        self.assertEqual(cameras[0].name, "Front Door")
        self.assertTrue(cameras[0].probe_ok)
        self.assertTrue(cameras[0].has_video)
        self.assertFalse(cameras[0].has_audio)
        self.assertTrue(cameras[0].endpoint_attached)
        self.assertFalse(cameras[1].probe_ok)

    def test_ignores_invalid_camera_items(self) -> None:
        cameras = cameras_from_status({"cameras": [None, {}, {"id": ""}, {"id": "front"}]})

        self.assertEqual(len(cameras), 1)
        self.assertEqual(cameras[0].camera_id, "front")
        self.assertEqual(cameras[0].name, "front")


class FakeResponse:
    def __init__(self, *, status=200, payload=None, body=b"", text="", headers=None):
        self.status = status
        self._payload = payload
        self._body = body
        self._text = text
        self.headers = headers or {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def raise_for_status(self):
        if self.status >= 400:
            raise RuntimeError(f"status {self.status}")

    async def json(self):
        return self._payload

    async def read(self):
        return self._body

    async def text(self):
        return self._text


class FakeSession:
    def __init__(self):
        self.requests = []

    def request(self, method, url, params=None):
        self.requests.append((method, url, params, None, None))
        if url.endswith("/api/status"):
            return FakeResponse(payload={"cameras": [{"id": "front", "name": "Front", "probe": {"ok": True}}]})
        if url.endswith("/camera/front/ptz/left"):
            return FakeResponse(payload={"ok": True})
        return FakeResponse(status=404, payload={"ok": False})

    def get(self, url, params=None):
        self.requests.append(("GET", url, params, None, None))
        return FakeResponse(body=b"jpeg-bytes")

    def post(self, url, data=None, headers=None):
        self.requests.append(("POST", url, None, data, headers))
        return FakeResponse(status=201, text="answer-sdp", headers={"Location": "/front/whep/session-1"})

    def patch(self, url, data=None, headers=None):
        self.requests.append(("PATCH", url, None, data, headers))
        return FakeResponse(status=204)

    def delete(self, url):
        self.requests.append(("DELETE", url, None, None, None))
        return FakeResponse(status=204)


class StreamToMatterClientTest(unittest.IsolatedAsyncioTestCase):
    async def test_snapshot_ptz_and_whep_requests(self) -> None:
        session = FakeSession()
        client = StreamToMatterClient(
            session,
            sidecar_url="http://ha.local:8090/",
            bridge_url="http://ha.local:8080",
            whep_url="http://ha.local:8889",
        )

        self.assertEqual((await client.cameras())[0].camera_id, "front")
        self.assertEqual(await client.snapshot("front", width=640, height=360), b"jpeg-bytes")
        await client.ptz_direction("front", "left", speed=0.4, stop_after_ms=200)
        answer, location = await client.whep_offer("front", "offer-sdp")
        await client.whep_candidate(location, "a=candidate:1\r\n")
        await client.close_whep_session(location)

        self.assertEqual(answer, "answer-sdp")
        self.assertEqual(location, "/front/whep/session-1")
        self.assertIn(("GET", "http://ha.local:8090/api/status", None, None, None), session.requests)
        self.assertIn(("GET", "http://ha.local:8090/api/cameras/front/snapshot.jpg", {"width": "640", "height": "360"}, None, None), session.requests)
        self.assertIn(("POST", "http://ha.local:8090/camera/front/ptz/left", {"speed": "0.4", "stopAfterMs": "200"}, None, None), session.requests)
        self.assertIn(("POST", "http://ha.local:8889/front/whep", None, "offer-sdp", {"Content-Type": "application/sdp"}), session.requests)
        self.assertIn(("PATCH", "http://ha.local:8889/front/whep/session-1", None, "a=candidate:1\r\n", {"Content-Type": "application/trickle-ice-sdpfrag"}), session.requests)
        self.assertIn(("DELETE", "http://ha.local:8889/front/whep/session-1", None, None, None), session.requests)


if __name__ == "__main__":
    unittest.main()
