"""Config flow for Stream to Matter Camera Bridge."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .client import StreamToMatterClient, StreamToMatterError
from .const import CONF_BRIDGE_URL, CONF_SIDECAR_URL, CONF_WHEP_URL, DEFAULT_BRIDGE_URL, DEFAULT_SIDECAR_URL, DEFAULT_WHEP_URL, DOMAIN


class StreamToMatterConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        """Handle setup from the UI."""
        errors: dict[str, str] = {}
        if user_input is not None:
            sidecar_url = user_input[CONF_SIDECAR_URL].rstrip("/")
            bridge_url = user_input[CONF_BRIDGE_URL].rstrip("/")
            whep_url = user_input[CONF_WHEP_URL].rstrip("/")
            client = StreamToMatterClient(
                async_get_clientsession(self.hass),
                sidecar_url=sidecar_url,
                bridge_url=bridge_url,
                whep_url=whep_url,
            )
            try:
                health = await client.health()
                cameras = await client.cameras()
            except StreamToMatterError:
                errors["base"] = "cannot_connect"
            else:
                await self.async_set_unique_id(sidecar_url)
                self._abort_if_unique_id_configured()
                title = "Stream to Matter Camera Bridge"
                if cameras:
                    title = f"Stream to Matter ({len(cameras)} camera{'s' if len(cameras) != 1 else ''})"
                elif health_bridge_url := health.get("bridgeUrl"):
                    title = f"Stream to Matter ({health_bridge_url})"
                return self.async_create_entry(
                    title=title,
                    data={
                        CONF_SIDECAR_URL: sidecar_url,
                        CONF_BRIDGE_URL: bridge_url,
                        CONF_WHEP_URL: whep_url,
                    },
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_SIDECAR_URL, default=DEFAULT_SIDECAR_URL): str,
                    vol.Required(CONF_BRIDGE_URL, default=DEFAULT_BRIDGE_URL): str,
                    vol.Required(CONF_WHEP_URL, default=DEFAULT_WHEP_URL): str,
                }
            ),
            errors=errors,
        )
