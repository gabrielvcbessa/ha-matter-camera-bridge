"""Constants for the Stream to Matter integration."""

from __future__ import annotations

DOMAIN = "stream_to_matter"

CONF_BRIDGE_URL = "bridge_url"
CONF_SIDECAR_URL = "sidecar_url"
CONF_WHEP_URL = "whep_url"

DEFAULT_BRIDGE_URL = "http://127.0.0.1:8080"
DEFAULT_SIDECAR_URL = "http://127.0.0.1:8090"
DEFAULT_WHEP_URL = "http://127.0.0.1:8889"

PLATFORMS = ["camera", "button", "binary_sensor"]
