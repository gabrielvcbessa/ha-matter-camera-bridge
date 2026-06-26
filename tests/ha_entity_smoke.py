"""Smoke-test Home Assistant entity classes when HA is installed.

This is intentionally a small runtime check for the custom integration proposal.
It runs inside a Home Assistant container without needing a configured HA auth
session or UI access.
"""

from __future__ import annotations

import asyncio

from custom_components.stream_to_matter.binary_sensor import SENSORS, StreamToMatterBinarySensor
from custom_components.stream_to_matter.button import BUTTONS, StreamToMatterPtzButton
from custom_components.stream_to_matter.camera import StreamToMatterCamera
from custom_components.stream_to_matter.client import StreamToMatterCamera as CameraSummary


class FakeClient:
    """Capture calls made by HA entities."""

    def __init__(self) -> None:
        self.calls: list[tuple] = []

    async def snapshot(self, camera_id: str, width: int | None = None, height: int | None = None) -> bytes:
        self.calls.append(("snapshot", camera_id, width, height))
        return b"jpeg"

    async def ptz_direction(
        self,
        camera_id: str,
        direction: str,
        speed: float = 0.2,
        stop_after_ms: int = 150,
    ) -> None:
        self.calls.append(("ptz", camera_id, direction, speed, stop_after_ms))


class FakeCoordinator:
    """Small subset of DataUpdateCoordinator used by CoordinatorEntity."""

    last_update_success = True

    def __init__(self) -> None:
        self.client = FakeClient()
        self.data = [
            CameraSummary(
                camera_id="front",
                name="Front Door",
                has_video=True,
                has_audio=False,
                probe_ok=True,
                endpoint_attached=True,
            ),
            CameraSummary(
                camera_id="garage",
                name="Garage",
                has_video=True,
                has_audio=True,
                probe_ok=True,
                endpoint_attached=True,
            ),
        ]

    def async_add_listener(self, _callback, _context=None):
        return lambda: None

    def camera(self, camera_id: str) -> CameraSummary | None:
        return next((camera for camera in self.data if camera.camera_id == camera_id), None)


async def main() -> None:
    coordinator = FakeCoordinator()
    camera = StreamToMatterCamera(coordinator, "front")
    second_camera = StreamToMatterCamera(coordinator, "garage")
    button = StreamToMatterPtzButton(coordinator, "front", BUTTONS[0])
    second_button = StreamToMatterPtzButton(coordinator, "garage", BUTTONS[2])
    sensor = StreamToMatterBinarySensor(coordinator, "front", SENSORS[0])

    assert camera.name is None
    assert camera.device_info["name"] == "Front Door"
    assert camera.device_info["identifiers"] != second_camera.device_info["identifiers"]
    assert second_camera.device_info["name"] == "Garage"
    assert button._attr_suggested_object_id == "front_ptz_up"
    assert second_button._attr_suggested_object_id == "garage_ptz_left"
    assert sensor._attr_suggested_object_id == "front_probe_ok"
    assert sensor.is_on is True
    assert await camera.async_camera_image(320, 180) == b"jpeg"
    await button.async_press()
    assert coordinator.client.calls == [
        ("snapshot", "front", 320, 180),
        ("ptz", "front", "up", 0.2, 150),
    ]
    print("ha_entity_smoke ok")


if __name__ == "__main__":
    asyncio.run(main())
