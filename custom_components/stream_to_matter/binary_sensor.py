"""Binary sensors for Stream to Matter."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity, BinarySensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .client import StreamToMatterCamera
from .const import DOMAIN
from .coordinator import StreamToMatterCoordinator
from .entity import StreamToMatterCameraEntity


@dataclass(frozen=True, kw_only=True)
class StreamToMatterBinarySensorDescription(BinarySensorEntityDescription):
    """Binary sensor description."""

    value_fn: Callable[[StreamToMatterCamera], bool]


SENSORS = (
    StreamToMatterBinarySensorDescription(
        key="probe_ok",
        translation_key="probe_ok",
        device_class=BinarySensorDeviceClass.CONNECTIVITY,
        value_fn=lambda camera: camera.probe_ok,
    ),
    StreamToMatterBinarySensorDescription(
        key="video_detected",
        translation_key="video_detected",
        device_class=BinarySensorDeviceClass.CONNECTIVITY,
        value_fn=lambda camera: camera.has_video,
    ),
    StreamToMatterBinarySensorDescription(
        key="audio_detected",
        translation_key="audio_detected",
        value_fn=lambda camera: camera.has_audio,
    ),
    StreamToMatterBinarySensorDescription(
        key="matter_endpoint_attached",
        translation_key="matter_endpoint_attached",
        device_class=BinarySensorDeviceClass.CONNECTIVITY,
        value_fn=lambda camera: camera.endpoint_attached,
    ),
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    """Set up binary sensor entities."""
    coordinator: StreamToMatterCoordinator = hass.data[DOMAIN][entry.entry_id]
    known: set[str] = set()

    def add_new_entities() -> None:
        entities = []
        for camera in coordinator.data or []:
            if camera.camera_id in known:
                continue
            known.add(camera.camera_id)
            entities.extend(
                StreamToMatterBinarySensor(coordinator, camera.camera_id, description)
                for description in SENSORS
            )
        if entities:
            async_add_entities(entities)

    add_new_entities()
    entry.async_on_unload(coordinator.async_add_listener(add_new_entities))


class StreamToMatterBinarySensor(StreamToMatterCameraEntity, BinarySensorEntity):
    """One camera binary sensor."""

    entity_description: StreamToMatterBinarySensorDescription

    def __init__(
        self,
        coordinator: StreamToMatterCoordinator,
        camera_id: str,
        description: StreamToMatterBinarySensorDescription,
    ) -> None:
        super().__init__(coordinator, camera_id)
        self.entity_description = description
        self._attr_unique_id = f"{camera_id}_{description.key}"
        self._attr_suggested_object_id = f"{camera_id}_{description.key}"

    @property
    def is_on(self) -> bool:
        """Return sensor state."""
        camera = self.camera
        return bool(camera and self.entity_description.value_fn(camera))
