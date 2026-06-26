"""Coordinator for Stream to Matter cameras."""

from __future__ import annotations

from datetime import timedelta
import logging

from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .client import StreamToMatterCamera, StreamToMatterClient
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


class StreamToMatterCoordinator(DataUpdateCoordinator[list[StreamToMatterCamera]]):
    """Poll camera summaries from the add-on."""

    def __init__(self, hass, client: StreamToMatterClient) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=30),
        )
        self.client = client

    async def _async_update_data(self) -> list[StreamToMatterCamera]:
        return await self.client.cameras()

    def camera(self, camera_id: str) -> StreamToMatterCamera | None:
        """Return one camera by id."""
        for camera in self.data or []:
            if camera.camera_id == camera_id:
                return camera
        return None
