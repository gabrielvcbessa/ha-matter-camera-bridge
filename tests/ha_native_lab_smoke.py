"""Smoke-test native HA entities against the running lab sidecar.

This expects the local lab services to be running and a valid WebRTC SDP offer
to be supplied as base64 in WHEP_OFFER_B64.
"""

from __future__ import annotations

import asyncio
import base64
import os

from aiohttp import ClientSession

from custom_components.stream_to_matter.binary_sensor import SENSORS, StreamToMatterBinarySensor
from custom_components.stream_to_matter.button import BUTTONS, StreamToMatterPtzButton
from custom_components.stream_to_matter.camera import StreamToMatterCamera
from custom_components.stream_to_matter.client import StreamToMatterClient


class FakeHass:
    def __init__(self) -> None:
        self.tasks: list[asyncio.Task] = []

    def async_create_task(self, coro):
        task = asyncio.create_task(coro)
        self.tasks.append(task)
        return task


class LabCoordinator:
    last_update_success = True

    def __init__(self, client: StreamToMatterClient, data) -> None:
        self.client = client
        self.data = data

    def async_add_listener(self, _callback, _context=None):
        return lambda: None

    def camera(self, camera_id: str):
        return next((camera for camera in self.data if camera.camera_id == camera_id), None)


async def main() -> None:
    offer_b64 = os.environ.get("WHEP_OFFER_B64")
    assert offer_b64, "WHEP_OFFER_B64 is required"
    offer_sdp = base64.b64decode(offer_b64).decode("utf-8")

    sidecar_url = os.environ.get("SIDECAR_URL", "http://127.0.0.1:8090")
    bridge_url = os.environ.get("BRIDGE_URL", "http://127.0.0.1:8080")
    whep_url = os.environ.get("WHEP_URL", "http://127.0.0.1:8889")
    camera_id = os.environ.get("CAMERA_ID", "matter_fp2_lab")

    async with ClientSession() as session:
        client = StreamToMatterClient(
            session,
            sidecar_url=sidecar_url,
            bridge_url=bridge_url,
            whep_url=whep_url,
        )
        cameras = await client.cameras()
        assert any(camera.camera_id == camera_id for camera in cameras), cameras

        coordinator = LabCoordinator(client, cameras)
        camera = StreamToMatterCamera(coordinator, camera_id)
        button = StreamToMatterPtzButton(coordinator, camera_id, BUTTONS[2])
        video_sensor = StreamToMatterBinarySensor(coordinator, camera_id, SENSORS[1])
        camera.hass = FakeHass()
        camera.async_write_ha_state = lambda: None

        assert camera.device_info["name"]
        assert video_sensor.is_on is True

        snapshot = await camera.async_camera_image(320, 180)
        assert snapshot and snapshot.startswith(b"\xff\xd8"), f"not a JPEG: {snapshot[:8] if snapshot else snapshot!r}"

        await button.async_press()

        messages = []
        await camera.async_handle_async_webrtc_offer(offer_sdp, "lab-session", messages.append)
        assert messages, "no WHEP answer was returned"
        assert getattr(messages[0], "answer", "").startswith("v=0"), messages[0]
        assert camera.is_streaming is True

        camera.close_webrtc_session("lab-session")
        await asyncio.gather(*camera.hass.tasks)
        assert camera.is_streaming is False

    print("ha_native_lab_smoke ok")


if __name__ == "__main__":
    asyncio.run(main())
