"""Base entities for Stream to Matter."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import StreamToMatterCoordinator


class StreamToMatterCameraEntity(CoordinatorEntity[StreamToMatterCoordinator]):
    """Base entity for one bridge camera."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: StreamToMatterCoordinator, camera_id: str) -> None:
        super().__init__(coordinator)
        self.camera_id = camera_id

    @property
    def camera(self):
        """Return current camera summary."""
        return self.coordinator.camera(self.camera_id)

    @property
    def available(self) -> bool:
        """Return if entity is available."""
        return self.camera is not None and super().available

    @property
    def device_info(self) -> DeviceInfo:
        """Return device info."""
        camera = self.camera
        name = camera.name if camera else self.camera_id
        return DeviceInfo(
            identifiers={(DOMAIN, self.camera_id)},
            manufacturer="Stream to Matter",
            model="RTSP/ONVIF Camera Bridge",
            name=name,
        )
