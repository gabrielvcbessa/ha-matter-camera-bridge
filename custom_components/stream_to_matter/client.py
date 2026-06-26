"""Async client for the Stream to Matter add-on APIs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, urljoin

try:
    from aiohttp import ClientError, ClientResponseError, ClientSession
except ModuleNotFoundError:  # pragma: no cover - Home Assistant provides aiohttp at runtime.
    class ClientError(Exception):
        """Fallback used by local unit tests when aiohttp is unavailable."""

    class ClientResponseError(ClientError):
        """Fallback used by local unit tests when aiohttp is unavailable."""

    class ClientSession:  # type: ignore[no-redef]
        """Typing fallback used by local unit tests when aiohttp is unavailable."""


class StreamToMatterError(Exception):
    """Base integration API error."""


@dataclass(frozen=True)
class StreamToMatterCamera:
    """Camera summary loaded from the add-on."""

    camera_id: str
    name: str
    has_video: bool
    has_audio: bool
    probe_ok: bool
    endpoint_attached: bool


class StreamToMatterClient:
    """Client for sidecar, bridge, and WHEP relay endpoints."""

    def __init__(
        self,
        session: ClientSession,
        *,
        sidecar_url: str,
        bridge_url: str,
        whep_url: str,
    ) -> None:
        self._session = session
        self.sidecar_url = _strip(sidecar_url)
        self.bridge_url = _strip(bridge_url)
        self.whep_url = _strip(whep_url)

    async def status(self) -> dict[str, Any]:
        """Return sidecar status."""
        return await self._json(self.sidecar_url, "/api/status")

    async def health(self) -> dict[str, Any]:
        """Return sidecar health."""
        return await self._json(self.sidecar_url, "/health")

    async def cameras(self) -> list[StreamToMatterCamera]:
        """Return camera summaries from sidecar status."""
        return cameras_from_status(await self.status())

    async def snapshot(self, camera_id: str, width: int | None = None, height: int | None = None) -> bytes:
        """Return a JPEG snapshot through the sidecar proxy."""
        params: dict[str, str] = {}
        if width:
            params["width"] = str(width)
        if height:
            params["height"] = str(height)
        return await self._bytes(
            self.sidecar_url,
            f"/api/cameras/{quote(camera_id, safe='')}/snapshot.jpg",
            params=params,
        )

    async def ptz_direction(self, camera_id: str, direction: str, speed: float = 0.2, stop_after_ms: int = 150) -> None:
        """Move a camera in one PTZ direction."""
        await self._json(
            self.sidecar_url,
            f"/camera/{quote(camera_id, safe='')}/ptz/{quote(direction, safe='')}",
            method="POST",
            params={"speed": str(speed), "stopAfterMs": str(stop_after_ms)},
        )

    async def whep_offer(self, camera_id: str, offer_sdp: str) -> tuple[str, str | None]:
        """Submit a WebRTC offer to the WHEP relay and return answer/location."""
        url = _url(self.whep_url, f"/{quote(camera_id, safe='')}/whep")
        try:
            async with self._session.post(url, data=offer_sdp, headers={"Content-Type": "application/sdp"}) as response:
                text = await response.text()
                if response.status >= 400:
                    raise StreamToMatterError(f"WHEP offer failed: {response.status} {text}")
                return text, response.headers.get("Location")
        except ClientError as err:
            raise StreamToMatterError(f"WHEP offer request failed: {err}") from err

    async def whep_candidate(self, session_location: str, candidate_sdp: str) -> None:
        """Forward a WebRTC ICE candidate to the relay."""
        url = _absolute_or_join(self.whep_url, session_location)
        try:
            async with self._session.patch(url, data=candidate_sdp, headers={"Content-Type": "application/trickle-ice-sdpfrag"}) as response:
                if response.status >= 400:
                    raise StreamToMatterError(f"WHEP candidate failed: {response.status} {await response.text()}")
        except ClientError as err:
            raise StreamToMatterError(f"WHEP candidate request failed: {err}") from err

    async def close_whep_session(self, session_location: str) -> None:
        """Close a WHEP session."""
        url = _absolute_or_join(self.whep_url, session_location)
        try:
            async with self._session.delete(url) as response:
                if response.status >= 400:
                    raise StreamToMatterError(f"WHEP session close failed: {response.status} {await response.text()}")
        except ClientError as err:
            raise StreamToMatterError(f"WHEP session close request failed: {err}") from err

    async def _json(
        self,
        base_url: str,
        path: str,
        *,
        method: str = "GET",
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        url = _url(base_url, path)
        try:
            async with self._session.request(method, url, params=params) as response:
                response.raise_for_status()
                payload = await response.json()
        except (ClientError, ClientResponseError) as err:
            raise StreamToMatterError(f"API request failed: {method} {url}: {err}") from err
        if not isinstance(payload, dict):
            raise StreamToMatterError(f"API returned non-object JSON: {url}")
        return payload

    async def _bytes(
        self,
        base_url: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
    ) -> bytes:
        url = _url(base_url, path)
        try:
            async with self._session.get(url, params=params) as response:
                body = await response.read()
                if response.status >= 400:
                    raise StreamToMatterError(f"Byte request failed: {response.status} {body.decode('utf-8', 'replace')}")
                return body
        except ClientError as err:
            raise StreamToMatterError(f"Byte request failed: {url}: {err}") from err


def cameras_from_status(status: dict[str, Any]) -> list[StreamToMatterCamera]:
    """Extract camera summaries from `/api/status`."""
    cameras = status.get("cameras") or []
    result: list[StreamToMatterCamera] = []
    if not isinstance(cameras, list):
        return result

    for item in cameras:
        if not isinstance(item, dict):
            continue
        camera_id = str(item.get("id") or "").strip()
        if not camera_id:
            continue
        probe = item.get("probe") if isinstance(item.get("probe"), dict) else {}
        endpoint = item.get("endpoint") if isinstance(item.get("endpoint"), dict) else {}
        result.append(
            StreamToMatterCamera(
                camera_id=camera_id,
                name=str(item.get("name") or camera_id),
                has_video=bool(probe.get("has_video")),
                has_audio=bool(probe.get("has_audio")),
                probe_ok=bool(probe.get("ok")),
                endpoint_attached=bool(endpoint.get("attached")),
            )
        )
    return result


def _strip(value: str) -> str:
    return value.rstrip("/")


def _url(base_url: str, path: str) -> str:
    return f"{_strip(base_url)}/{path.lstrip('/')}"


def _absolute_or_join(base_url: str, location: str) -> str:
    if location.startswith(("http://", "https://")):
        return location
    return urljoin(f"{_strip(base_url)}/", location.lstrip("/"))
