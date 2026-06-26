"""End-to-end smoke test for native Home Assistant camera entities.

Run this inside a Home Assistant container with:

    PYTHONPATH=/config python /tmp/ha_native_http_smoke.py

The test starts a tiny local HTTP server that behaves like the add-on sidecar
and WHEP relay, then exercises the real custom integration client and HA entity
classes against it.
"""

from __future__ import annotations

import asyncio
from typing import Any

from aiohttp import ClientSession, web

from custom_components.stream_to_matter.binary_sensor import SENSORS, StreamToMatterBinarySensor
from custom_components.stream_to_matter.button import BUTTONS, StreamToMatterPtzButton
from custom_components.stream_to_matter.camera import StreamToMatterCamera
from custom_components.stream_to_matter.client import StreamToMatterClient


JPEG_BYTES = b"\xff\xd8\xff\xe0stream-to-matter-test\xff\xd9"
ANSWER_SDP = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=Stream to Matter test\r\n"


class FakeHass:
    """Subset of HomeAssistant used by close_webrtc_session."""

    def __init__(self) -> None:
        self.tasks: list[asyncio.Task] = []

    def async_create_task(self, coro):
        task = asyncio.create_task(coro)
        self.tasks.append(task)
        return task


class FakeCandidate:
    """Small candidate object with the shape HA's camera entity expects."""

    def to_dict(self) -> dict[str, str]:
        return {"candidate": "candidate:1 1 UDP 1 127.0.0.1 9999 typ host"}


class HttpCoordinator:
    """Small subset of DataUpdateCoordinator used by CoordinatorEntity."""

    last_update_success = True

    def __init__(self, client: StreamToMatterClient, data) -> None:
        self.client = client
        self.data = data

    def async_add_listener(self, _callback, _context=None):
        return lambda: None

    def camera(self, camera_id: str):
        return next((camera for camera in self.data if camera.camera_id == camera_id), None)


async def main() -> None:
    calls: list[tuple[str, Any]] = []

    app = web.Application()

    async def health(_request: web.Request) -> web.Response:
        return web.json_response({"ok": True, "bridgeUrl": "http://127.0.0.1:8080"})

    async def status(_request: web.Request) -> web.Response:
        return web.json_response(
            {
                "ok": True,
                "cameras": [
                    {
                        "id": "front",
                        "name": "Front Door",
                        "probe": {"ok": True, "has_video": True, "has_audio": True},
                        "endpoint": {"attached": True},
                    }
                ],
            }
        )

    async def snapshot(request: web.Request) -> web.Response:
        calls.append(("snapshot", dict(request.query)))
        return web.Response(body=JPEG_BYTES, content_type="image/jpeg")

    async def ptz(request: web.Request) -> web.Response:
        calls.append(("ptz", request.match_info["direction"], dict(request.query)))
        return web.json_response({"ok": True})

    async def whep_offer(request: web.Request) -> web.Response:
        calls.append(("whep_offer", await request.text()))
        return web.Response(
            text=ANSWER_SDP,
            headers={"Location": "/front/whep/session-1"},
            content_type="application/sdp",
        )

    async def whep_candidate(request: web.Request) -> web.Response:
        calls.append(("whep_candidate", await request.text()))
        return web.Response(status=204)

    async def whep_close(_request: web.Request) -> web.Response:
        calls.append(("whep_close", "session-1"))
        return web.Response(status=204)

    app.router.add_get("/health", health)
    app.router.add_get("/api/status", status)
    app.router.add_get("/api/cameras/{camera_id}/snapshot.jpg", snapshot)
    app.router.add_post("/camera/{camera_id}/ptz/{direction}", ptz)
    app.router.add_post("/{camera_id}/whep", whep_offer)
    app.router.add_patch("/{camera_id}/whep/session-1", whep_candidate)
    app.router.add_delete("/{camera_id}/whep/session-1", whep_close)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    sockets = site._server.sockets
    assert sockets
    base_url = f"http://127.0.0.1:{sockets[0].getsockname()[1]}"

    try:
        async with ClientSession() as session:
            client = StreamToMatterClient(
                session,
                sidecar_url=base_url,
                bridge_url=base_url,
                whep_url=base_url,
            )
            cameras = await client.cameras()
            assert len(cameras) == 1
            assert cameras[0].camera_id == "front"

            coordinator = HttpCoordinator(client, cameras)
            camera = StreamToMatterCamera(coordinator, "front")
            button = StreamToMatterPtzButton(coordinator, "front", BUTTONS[0])
            sensor = StreamToMatterBinarySensor(coordinator, "front", SENSORS[0])
            camera.hass = FakeHass()
            camera.async_write_ha_state = lambda: None

            assert camera.device_info["name"] == "Front Door"
            assert camera.name is None
            assert sensor.is_on is True
            assert await camera.async_camera_image(640, 360) == JPEG_BYTES

            await button.async_press()

            messages = []
            await camera.async_handle_async_webrtc_offer("offer-sdp", "session-a", messages.append)
            assert messages
            assert messages[0].answer == ANSWER_SDP
            assert camera.is_streaming is True

            await camera.async_on_webrtc_candidate("session-a", FakeCandidate())
            camera.close_webrtc_session("session-a")
            await asyncio.gather(*camera.hass.tasks)
            assert camera.is_streaming is False

            assert ("snapshot", {"width": "640", "height": "360"}) in calls
            assert ("ptz", "up", {"speed": "0.2", "stopAfterMs": "150"}) in calls
            assert ("whep_offer", "offer-sdp") in calls
            assert any(call[0] == "whep_candidate" and "candidate:" in call[1] for call in calls)
            assert ("whep_close", "session-1") in calls
    finally:
        await runner.cleanup()

    print("ha_native_http_smoke ok")


if __name__ == "__main__":
    asyncio.run(main())
