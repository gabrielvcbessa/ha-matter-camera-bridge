"""Stream to Matter Camera Bridge integration."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .client import StreamToMatterClient
from .const import CONF_BRIDGE_URL, CONF_SIDECAR_URL, CONF_WHEP_URL, DEFAULT_BRIDGE_URL, DEFAULT_SIDECAR_URL, DEFAULT_WHEP_URL, DOMAIN, PLATFORMS
from .coordinator import StreamToMatterCoordinator


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Stream to Matter from a config entry."""
    client = StreamToMatterClient(
        async_get_clientsession(hass),
        sidecar_url=entry.data.get(CONF_SIDECAR_URL, DEFAULT_SIDECAR_URL),
        bridge_url=entry.data.get(CONF_BRIDGE_URL, DEFAULT_BRIDGE_URL),
        whep_url=entry.data.get(CONF_WHEP_URL, DEFAULT_WHEP_URL),
    )
    coordinator = StreamToMatterCoordinator(hass, client)
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok
