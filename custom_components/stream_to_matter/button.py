"""PTZ button platform for Stream to Matter."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .coordinator import StreamToMatterCoordinator
from .entity import StreamToMatterCameraEntity


@dataclass(frozen=True, kw_only=True)
class PtzButtonDescription(ButtonEntityDescription):
    """PTZ button description."""

    direction: str


BUTTONS = (
    PtzButtonDescription(key="ptz_up", translation_key="ptz_up", direction="up"),
    PtzButtonDescription(key="ptz_down", translation_key="ptz_down", direction="down"),
    PtzButtonDescription(key="ptz_left", translation_key="ptz_left", direction="left"),
    PtzButtonDescription(key="ptz_right", translation_key="ptz_right", direction="right"),
    PtzButtonDescription(key="ptz_up_left", translation_key="ptz_up_left", direction="up-left"),
    PtzButtonDescription(key="ptz_up_right", translation_key="ptz_up_right", direction="up-right"),
    PtzButtonDescription(key="ptz_down_left", translation_key="ptz_down_left", direction="down-left"),
    PtzButtonDescription(key="ptz_down_right", translation_key="ptz_down_right", direction="down-right"),
    PtzButtonDescription(key="ptz_zoom_in", translation_key="ptz_zoom_in", direction="zoom-in"),
    PtzButtonDescription(key="ptz_zoom_out", translation_key="ptz_zoom_out", direction="zoom-out"),
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    """Set up PTZ button entities."""
    coordinator: StreamToMatterCoordinator = hass.data[DOMAIN][entry.entry_id]
    known: set[str] = set()

    def add_new_entities() -> None:
        entities = []
        for camera in coordinator.data or []:
            if camera.camera_id in known:
                continue
            known.add(camera.camera_id)
            entities.extend(
                StreamToMatterPtzButton(coordinator, camera.camera_id, description)
                for description in BUTTONS
            )
        if entities:
            async_add_entities(entities)

    add_new_entities()
    entry.async_on_unload(coordinator.async_add_listener(add_new_entities))


class StreamToMatterPtzButton(StreamToMatterCameraEntity, ButtonEntity):
    """One PTZ action button."""

    entity_description: PtzButtonDescription

    def __init__(
        self,
        coordinator: StreamToMatterCoordinator,
        camera_id: str,
        description: PtzButtonDescription,
    ) -> None:
        super().__init__(coordinator, camera_id)
        self.entity_description = description
        self._attr_unique_id = f"{camera_id}_{description.key}"
        self._attr_suggested_object_id = f"{camera_id}_{description.key}"

    async def async_press(self) -> None:
        """Press the PTZ button."""
        await self.coordinator.client.ptz_direction(self.camera_id, self.entity_description.direction)
