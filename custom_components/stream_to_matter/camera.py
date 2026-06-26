"""Camera platform for Stream to Matter."""

from __future__ import annotations

import logging

from homeassistant.components.camera import Camera, CameraEntityFeature
from homeassistant.components.camera.webrtc import WebRTCAnswer, WebRTCError
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from webrtc_models import RTCIceCandidateInit

from .const import DOMAIN
from .coordinator import StreamToMatterCoordinator
from .entity import StreamToMatterCameraEntity

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    """Set up camera entities."""
    coordinator: StreamToMatterCoordinator = hass.data[DOMAIN][entry.entry_id]
    known: set[str] = set()

    def add_new_entities() -> None:
        entities = []
        for camera in coordinator.data or []:
            if camera.camera_id in known:
                continue
            known.add(camera.camera_id)
            entities.append(StreamToMatterCamera(coordinator, camera.camera_id))
        if entities:
            async_add_entities(entities)

    add_new_entities()
    entry.async_on_unload(coordinator.async_add_listener(add_new_entities))


class StreamToMatterCamera(StreamToMatterCameraEntity, Camera):
    """Native Home Assistant camera backed by the add-on."""

    _attr_supported_features = CameraEntityFeature.STREAM
    _attr_brand = "Stream to Matter"
    _attr_model = "RTSP/ONVIF Camera Bridge"

    def __init__(self, coordinator: StreamToMatterCoordinator, camera_id: str) -> None:
        super().__init__(coordinator, camera_id)
        Camera.__init__(self)
        self._attr_unique_id = f"{camera_id}_camera"
        self._attr_translation_key = "camera"
        self._sessions: dict[str, str] = {}

    @property
    def name(self) -> str | None:
        """Use the device name for the primary camera entity."""
        return None

    @property
    def is_streaming(self) -> bool:
        """Return if this camera has active HA WebRTC sessions."""
        return bool(self._sessions)

    async def async_camera_image(self, width: int | None = None, height: int | None = None) -> bytes | None:
        """Return bytes of a JPEG snapshot."""
        try:
            return await self.coordinator.client.snapshot(self.camera_id, width, height)
        except Exception as err:
            raise HomeAssistantError(f"Unable to fetch Stream to Matter snapshot: {err}") from err

    async def async_handle_async_webrtc_offer(self, offer_sdp: str, session_id: str, send_message) -> None:
        """Forward a Home Assistant frontend WebRTC offer to the WHEP relay."""
        try:
            answer_sdp, location = await self.coordinator.client.whep_offer(self.camera_id, offer_sdp)
        except Exception as err:
            _LOGGER.warning("WHEP offer failed for %s: %s", self.camera_id, err)
            send_message(WebRTCError("webrtc_offer_failed", str(err)))
            return
        if location:
            self._sessions[session_id] = location
        send_message(WebRTCAnswer(answer_sdp))
        self.async_write_ha_state()

    async def async_on_webrtc_candidate(self, session_id: str, candidate: RTCIceCandidateInit) -> None:
        """Forward a frontend ICE candidate to the WHEP relay."""
        location = self._sessions.get(session_id)
        if not location:
            return
        candidate_value = candidate.to_dict().get("candidate", "")
        if not candidate_value:
            return
        await self.coordinator.client.whep_candidate(location, _candidate_sdpfrag(candidate_value))

    @callback
    def close_webrtc_session(self, session_id: str) -> None:
        """Close a WHEP session."""
        location = self._sessions.pop(session_id, None)
        if location:
            self.hass.async_create_task(self.coordinator.client.close_whep_session(location))
        self.async_write_ha_state()


def _candidate_sdpfrag(candidate: str) -> str:
    if candidate.startswith("candidate:"):
        return f"a={candidate}\r\n"
    if candidate.startswith("a=candidate:"):
        return f"{candidate}\r\n"
    return f"a=candidate:{candidate}\r\n"
