from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
from datetime import datetime, timezone
from dataclasses import dataclass
from urllib.parse import quote

from aiohttp import web
from aiortc import RTCSessionDescription, RTCPeerConnection
from aiortc.contrib.media import MediaPlayer, MediaRelay
from aiortc.exceptions import InvalidStateError
from aiortc.sdp import candidate_from_sdp


ADVERTISE_IP_ENV_KEYS = ("WHEP_ADVERTISE_IP", "WHEP_RELAY_ADVERTISE_IP")
ENV_PATTERN = re.compile(r"\$\{([A-Z0-9_]+)(?::-(.*?))?\}")


@dataclass
class WhepSession:
    peer: RTCPeerConnection
    player: MediaPlayer | None
    camera_id: str
    mode: str
    created_at: str
    source_key: str | None = None
    cleanup_task: asyncio.Task | None = None


@dataclass
class WarmSource:
    player: MediaPlayer
    source: str
    created_at: str
    last_used_at: str
    cleanup_task: asyncio.Task | None = None


SESSIONS: dict[str, WhepSession] = {}
WARM_SOURCES: dict[str, WarmSource] = {}
MEDIA_RELAY = MediaRelay()
RTSP_OPEN_ATTEMPTS = 3
RTSP_OPEN_RETRY_DELAY_SECONDS = 0.75
SESSION_TTL_SECONDS = int(os.environ.get("WHEP_SESSION_TTL_SECONDS", "90"))
FAILED_SESSION_GRACE_SECONDS = int(os.environ.get("WHEP_FAILED_SESSION_GRACE_SECONDS", "8"))
WARM_SOURCE_TTL_SECONDS = int(os.environ.get("WHEP_WARM_SOURCE_TTL_SECONDS", "75"))


def configured_advertise_ip() -> str:
    for key in ADVERTISE_IP_ENV_KEYS:
        value = os.environ.get(key, "").strip()
        if value:
            return value
    return ""


def configure_ice_host_address() -> None:
    advertise_ip = configured_advertise_ip()
    if not advertise_ip:
        return

    try:
        import aioice.ice
    except Exception as error:
        log(f"advertise_ip={advertise_ip} status=configure-failed error={error}")
        return

    def get_host_addresses(use_ipv4: bool, use_ipv6: bool) -> list[str]:
        if ":" in advertise_ip:
            return [advertise_ip] if use_ipv6 else []
        return [advertise_ip] if use_ipv4 else []

    aioice.ice.get_host_addresses = get_host_addresses
    log(f"advertise_ip={advertise_ip} status=configured")


def log(message: str) -> None:
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    print(f"[whep-relay] {timestamp} {message}", flush=True)


def resolve_env(value):
    if isinstance(value, dict):
        return {key: resolve_env(item) for key, item in value.items()}
    if isinstance(value, list):
        return [resolve_env(item) for item in value]
    if not isinstance(value, str):
        return value

    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        default = match.group(2)
        if name in os.environ:
            return os.environ[name]
        if default is not None:
            return default
        raise ValueError(f"Missing required environment variable: {name}")

    return ENV_PATTERN.sub(replace, value)


def source_for(camera_id: str) -> str | None:
    env_name = f"{camera_id.upper().replace('-', '_')}_MEDIA_SOURCE"
    configured = source_from_config(camera_id)
    return configured or os.environ.get(env_name) or os.environ.get("CAMERA_MEDIA_SOURCE") or os.environ.get("MEDIA_SOURCE")


def source_from_config(camera_id: str) -> str | None:
    config_path = os.environ.get("STREAM_TO_MATTER_CONFIG", "/data/cameras.json")
    try:
        with open(config_path, "r", encoding="utf-8") as handle:
            payload = resolve_env(json.load(handle))
    except (OSError, ValueError):
        return None
    for camera in payload.get("cameras", []):
        if str(camera.get("id", "")) == camera_id:
            return camera.get("media_source") or camera.get("rtsp_url")
    return None


def configured_source_names() -> list[str]:
    names = {
        name
        for name, value in os.environ.items()
        if value and (name.endswith("_MEDIA_SOURCE") or name == "MEDIA_SOURCE")
    }
    config_path = os.environ.get("STREAM_TO_MATTER_CONFIG", "/data/cameras.json")
    try:
        with open(config_path, "r", encoding="utf-8") as handle:
            payload = resolve_env(json.load(handle))
    except (OSError, ValueError):
        return sorted(names)
    for camera in payload.get("cameras", []):
        camera_id = str(camera.get("id", "")).strip()
        if camera_id and (camera.get("media_source") or camera.get("rtsp_url")):
            names.add(f"config:{camera_id}")
    return sorted(names)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def attach_peer_logging(peer: RTCPeerConnection, camera_id: str, mode: str, session_id: str | None = None) -> None:
    label = f"{mode} camera={camera_id}"
    if session_id:
        label = f"{label} session={session_id}"

    @peer.on("iceconnectionstatechange")
    async def on_ice_connection_state_change() -> None:
        log(f"{label} iceConnectionState={peer.iceConnectionState}")
        if session_id and peer.iceConnectionState in {"failed", "disconnected", "closed"}:
            asyncio.create_task(close_session_later(session_id, FAILED_SESSION_GRACE_SECONDS))

    @peer.on("connectionstatechange")
    async def on_connection_state_change() -> None:
        log(f"{label} connectionState={peer.connectionState}")
        if session_id and peer.connectionState in {"failed", "closed"}:
            asyncio.create_task(close_session_later(session_id, FAILED_SESSION_GRACE_SECONDS))

    @peer.on("icegatheringstatechange")
    async def on_ice_gathering_state_change() -> None:
        log(f"{label} iceGatheringState={peer.iceGatheringState}")


def describe_sdp(sdp: str) -> dict[str, object]:
    candidates = [
        line[12:]
        for line in sdp.splitlines()
        if line.startswith("a=candidate:")
    ]
    return {
        "bytes": len(sdp),
        "candidates": len(candidates),
        "hostCandidates": sum(1 for candidate in candidates if " typ host " in f" {candidate} "),
        "srflxCandidates": sum(1 for candidate in candidates if " typ srflx " in f" {candidate} "),
    }


async def open_player(camera_id: str, source: str, mode: str) -> MediaPlayer:
    last_error: Exception | None = None
    for attempt in range(1, RTSP_OPEN_ATTEMPTS + 1):
        try:
            return MediaPlayer(source, format="rtsp", options={"rtsp_transport": "tcp"})
        except Exception as error:
            last_error = error
            log(f"{mode} camera={camera_id} status=open-retry attempt={attempt}/{RTSP_OPEN_ATTEMPTS} error={error}")
            if attempt < RTSP_OPEN_ATTEMPTS:
                await asyncio.sleep(RTSP_OPEN_RETRY_DELAY_SECONDS)

    log(f"{mode} camera={camera_id} status=open-failed error={last_error}")
    raise RuntimeError(f"Could not open RTSP source: {last_error}")


async def warm_source_or_error(camera_id: str, source: str, mode: str, peer: RTCPeerConnection) -> tuple[WarmSource | None, web.Response | None]:
    source_key = camera_id
    existing = WARM_SOURCES.get(source_key)
    if existing and existing.source == source:
        existing.last_used_at = now_iso()
        schedule_warm_source_cleanup(source_key, existing)
        log(f"{mode} camera={camera_id} status=warm-source-reused")
        return existing, None
    if existing:
        await close_warm_source(source_key, existing)

    try:
        player = await open_player(camera_id, source, mode)
    except Exception as error:
        await peer.close()
        return None, web.json_response({"ok": False, "error": str(error)}, status=503)

    warm = WarmSource(player=player, source=source, created_at=now_iso(), last_used_at=now_iso())
    WARM_SOURCES[source_key] = warm
    schedule_warm_source_cleanup(source_key, warm)
    log(f"{mode} camera={camera_id} status=warm-source-opened video={bool(player.video)} audio={bool(player.audio)}")
    return warm, None


def schedule_warm_source_cleanup(source_key: str, source: WarmSource) -> None:
    if source.cleanup_task and not source.cleanup_task.done():
        source.cleanup_task.cancel()
    source.cleanup_task = asyncio.create_task(close_warm_source_later(source_key, WARM_SOURCE_TTL_SECONDS))


async def post_whep(request: web.Request) -> web.Response:
    camera_id = request.match_info["camera_id"]
    source = source_for(camera_id)
    if not source:
        log(f"offer camera={camera_id} status=no-media-source")
        return web.json_response({"ok": False, "error": f"No media source configured for {camera_id}"}, status=503)

    sdp_offer = await request.text()
    if not sdp_offer.strip():
        log(f"offer camera={camera_id} status=empty-sdp")
        return web.json_response({"ok": False, "error": "WHEP offer body must be SDP"}, status=400)

    offer_info = describe_sdp(sdp_offer)
    log(
        f"offer camera={camera_id} status=open-rtsp "
        f"sdpBytes={offer_info['bytes']} candidates={offer_info['candidates']} "
        f"hostCandidates={offer_info['hostCandidates']} srflxCandidates={offer_info['srflxCandidates']}"
    )
    peer = RTCPeerConnection()
    warm, error_response = await warm_source_or_error(camera_id, source, "offer", peer)
    if error_response is not None:
        return error_response
    player = warm.player

    if player.video:
        peer.addTrack(MEDIA_RELAY.subscribe(player.video))
    if player.audio:
        peer.addTrack(MEDIA_RELAY.subscribe(player.audio))

    if not player.video and not player.audio:
        await close_session(WhepSession(peer, None, camera_id, "whep", now_iso(), camera_id))
        log(f"offer camera={camera_id} status=no-tracks")
        return web.json_response({"ok": False, "error": "RTSP source did not expose audio or video tracks"}, status=503)

    await peer.setRemoteDescription(RTCSessionDescription(sdp=sdp_offer, type="offer"))
    answer = await peer.createAnswer()
    await peer.setLocalDescription(answer)

    session_id = secrets.token_urlsafe(18)
    attach_peer_logging(peer, camera_id, "whep", session_id)
    SESSIONS[session_id] = WhepSession(peer, None, camera_id, "whep", now_iso(), camera_id)
    SESSIONS[session_id].cleanup_task = asyncio.create_task(close_session_later(session_id, SESSION_TTL_SECONDS))
    answer_info = describe_sdp(peer.localDescription.sdp)
    log(
        f"offer camera={camera_id} status=answer session={session_id} "
        f"video={bool(player.video)} audio={bool(player.audio)} sessions={len(SESSIONS)} "
        f"sdpBytes={answer_info['bytes']} candidates={answer_info['candidates']}"
    )
    headers = {
        "Location": f"/{quote(camera_id)}/whep/{session_id}",
        "Content-Type": "application/sdp",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Location",
    }
    return web.Response(status=201, text=peer.localDescription.sdp, headers=headers)


async def post_provider_offer(request: web.Request) -> web.Response:
    camera_id = request.match_info["camera_id"]
    source = source_for(camera_id)
    if not source:
        log(f"provider-offer camera={camera_id} status=no-media-source")
        return web.json_response({"ok": False, "error": f"No media source configured for {camera_id}"}, status=503)

    log(f"provider-offer camera={camera_id} status=open-rtsp")
    peer = RTCPeerConnection()
    warm, error_response = await warm_source_or_error(camera_id, source, "provider-offer", peer)
    if error_response is not None:
        return error_response
    player = warm.player

    if player.video:
        peer.addTrack(MEDIA_RELAY.subscribe(player.video))
    if player.audio:
        peer.addTrack(MEDIA_RELAY.subscribe(player.audio))

    if not player.video and not player.audio:
        await close_session(WhepSession(peer, None, camera_id, "provider", now_iso(), camera_id))
        log(f"provider-offer camera={camera_id} status=no-tracks")
        return web.json_response({"ok": False, "error": "RTSP source did not expose audio or video tracks"}, status=503)

    offer = await peer.createOffer()
    await peer.setLocalDescription(offer)

    session_id = secrets.token_urlsafe(18)
    attach_peer_logging(peer, camera_id, "provider", session_id)
    SESSIONS[session_id] = WhepSession(peer, None, camera_id, "provider", now_iso(), camera_id)
    SESSIONS[session_id].cleanup_task = asyncio.create_task(close_session_later(session_id, SESSION_TTL_SECONDS))
    offer_info = describe_sdp(peer.localDescription.sdp)
    log(
        f"provider-offer camera={camera_id} status=offer session={session_id} "
        f"video={bool(player.video)} audio={bool(player.audio)} sessions={len(SESSIONS)} "
        f"sdpBytes={offer_info['bytes']} candidates={offer_info['candidates']}"
    )
    return web.json_response(
        {
            "ok": True,
            "sdp": peer.localDescription.sdp,
            "location": f"/{quote(camera_id)}/provider/{session_id}",
            "video": bool(player.video),
            "audio": bool(player.audio),
        },
        status=201,
        headers={
            "Location": f"/{quote(camera_id)}/provider/{session_id}",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Location",
        },
    )


async def post_provider_answer(request: web.Request) -> web.Response:
    camera_id = request.match_info["camera_id"]
    session_id = request.match_info["session_id"]
    session = SESSIONS.get(session_id)
    if not session:
        log(f"provider-answer camera={camera_id} session={session_id} status=missing")
        return web.json_response({"ok": False, "error": "Provider session not found"}, status=404)

    sdp_answer = await request.text()
    if not sdp_answer.strip():
        return web.json_response({"ok": False, "error": "Provider answer body must be SDP"}, status=400)

    await session.peer.setRemoteDescription(RTCSessionDescription(sdp=sdp_answer, type="answer"))
    answer_info = describe_sdp(sdp_answer)
    log(
        f"provider-answer camera={camera_id} session={session_id} status=accepted "
        f"sdpBytes={answer_info['bytes']} candidates={answer_info['candidates']} sessions={len(SESSIONS)}"
    )
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})


async def patch_whep(request: web.Request) -> web.Response:
    camera_id = request.match_info["camera_id"]
    session_id = request.match_info["session_id"]
    session = SESSIONS.get(session_id)
    if not session:
        log(f"candidates camera={camera_id} session={session_id} status=missing")
        return web.json_response({"ok": False, "error": "WHEP session not found"}, status=404)

    body = await request.text()
    sdp_mid: str | None = None
    sdp_mline_index: int | None = None
    candidate_lines = [
        line
        for line in body.splitlines()
        if line.startswith("a=candidate:") or line.startswith("candidate:")
    ]
    added = 0
    for line in body.splitlines():
        if line.startswith("a=mid:"):
            sdp_mid = line.removeprefix("a=mid:")
        elif line.startswith("a=m-line-index:"):
            try:
                sdp_mline_index = int(line.removeprefix("a=m-line-index:"))
            except ValueError:
                sdp_mline_index = None
        elif line.startswith("a=candidate:") or line.startswith("candidate:"):
            candidate_text = line.removeprefix("a=")
            candidate = candidate_from_sdp(candidate_text)
            candidate.sdpMid = sdp_mid
            candidate.sdpMLineIndex = sdp_mline_index
            await session.peer.addIceCandidate(candidate)
            added += 1
    log(f"candidates camera={camera_id} session={session_id} bytes={len(body)} count={len(candidate_lines)} added={added}")
    return web.Response(status=204, headers={"Access-Control-Allow-Origin": "*"})


async def delete_whep(request: web.Request) -> web.Response:
    camera_id = request.match_info["camera_id"]
    session_id = request.match_info["session_id"]
    session = SESSIONS.pop(session_id, None)
    if session:
        await close_session(session)
    log(f"delete camera={camera_id} session={session_id} existed={bool(session)} sessions={len(SESSIONS)}")
    return web.Response(status=204, headers={"Access-Control-Allow-Origin": "*"})


async def post_prewarm(request: web.Request) -> web.Response:
    camera_id = request.match_info["camera_id"]
    source = source_for(camera_id)
    if not source:
        log(f"prewarm camera={camera_id} status=no-media-source")
        return web.json_response({"ok": False, "error": f"No media source configured for {camera_id}"}, status=503)

    peer = RTCPeerConnection()
    warm, error_response = await warm_source_or_error(camera_id, source, "prewarm", peer)
    await peer.close()
    if error_response is not None:
        return error_response
    player = warm.player
    return web.json_response(
        {
            "ok": True,
            "cameraId": camera_id,
            "video": bool(player.video),
            "audio": bool(player.audio),
            "warmSources": len(WARM_SOURCES),
        },
        headers={"Access-Control-Allow-Origin": "*"},
    )


async def options(_request: web.Request) -> web.Response:
    return web.Response(
        status=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, If-Match",
            "Access-Control-Expose-Headers": "Location",
        },
    )


async def health(_request: web.Request) -> web.Response:
    configured = configured_source_names()
    sessions = [
        {
            "id": session_id,
            "cameraId": session.camera_id,
            "mode": session.mode,
            "createdAt": session.created_at,
            "sourceKey": session.source_key,
            "connectionState": session.peer.connectionState,
            "iceConnectionState": session.peer.iceConnectionState,
            "iceGatheringState": session.peer.iceGatheringState,
        }
        for session_id, session in SESSIONS.items()
    ]
    return web.json_response(
        {
            "ok": True,
            "sessions": len(SESSIONS),
            "warmSources": len(WARM_SOURCES),
            "configuredSources": configured,
            "activeSessions": sessions,
            "activeSources": [
                {
                    "cameraId": camera_id,
                    "createdAt": source.created_at,
                    "lastUsedAt": source.last_used_at,
                    "video": bool(source.player.video),
                    "audio": bool(source.player.audio),
                }
                for camera_id, source in WARM_SOURCES.items()
            ],
            "advertiseIp": configured_advertise_ip() or None,
        }
    )


async def close_session(session: WhepSession) -> None:
    if session.cleanup_task and session.cleanup_task is not asyncio.current_task():
        session.cleanup_task.cancel()
    if session.player:
        for track in [session.player.audio, session.player.video]:
            if track:
                track.stop()
    await session.peer.close()


async def close_warm_source(source_key: str, source: WarmSource) -> None:
    if source.cleanup_task and source.cleanup_task is not asyncio.current_task():
        source.cleanup_task.cancel()
    if WARM_SOURCES.get(source_key) is source:
        WARM_SOURCES.pop(source_key, None)
    for track in [source.player.audio, source.player.video]:
        if track:
            track.stop()
    log(f"warm-source camera={source_key} status=closed warmSources={len(WARM_SOURCES)}")


async def close_warm_source_later(source_key: str, delay_seconds: int) -> None:
    await asyncio.sleep(delay_seconds)
    source = WARM_SOURCES.get(source_key)
    if not source:
        return
    if any(session.source_key == source_key for session in SESSIONS.values()):
        schedule_warm_source_cleanup(source_key, source)
        return
    await close_warm_source(source_key, source)


async def close_session_later(session_id: str, delay_seconds: int) -> None:
    await asyncio.sleep(delay_seconds)
    session = SESSIONS.pop(session_id, None)
    if not session:
        return
    await close_session(session)
    log(f"session={session_id} status=expired camera={session.camera_id} mode={session.mode} sessions={len(SESSIONS)}")


async def on_shutdown(_app: web.Application) -> None:
    sessions = list(SESSIONS.values())
    SESSIONS.clear()
    await asyncio.gather(*(close_session(session) for session in sessions), return_exceptions=True)
    sources = list(WARM_SOURCES.items())
    await asyncio.gather(*(close_warm_source(key, source) for key, source in sources), return_exceptions=True)


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/health", health)
    app.router.add_post("/{camera_id}/whep", post_whep)
    app.router.add_post("/{camera_id}/prewarm", post_prewarm)
    app.router.add_post("/{camera_id}/provider-offers", post_provider_offer)
    app.router.add_post("/{camera_id}/provider/{session_id}/answer", post_provider_answer)
    app.router.add_patch("/{camera_id}/whep/{session_id}", patch_whep)
    app.router.add_delete("/{camera_id}/whep/{session_id}", delete_whep)
    app.router.add_route("OPTIONS", "/{tail:.*}", options)
    app.on_shutdown.append(on_shutdown)
    return app


def ignore_expected_ice_shutdown(_loop: asyncio.AbstractEventLoop, context: dict[str, object]) -> None:
    exception = context.get("exception")
    if isinstance(exception, InvalidStateError) and str(exception) == "RTCIceTransport is closed":
        return
    _loop.default_exception_handler(context)


if __name__ == "__main__":
    asyncio.get_event_loop().set_exception_handler(ignore_expected_ice_shutdown)
    configure_ice_host_address()
    log(
        f"starting host={os.environ.get('WHEP_RELAY_HOST', '0.0.0.0')} "
        f"port={os.environ.get('WHEP_RELAY_PORT', '8889')}"
    )
    web.run_app(
        create_app(),
        host=os.environ.get("WHEP_RELAY_HOST", "0.0.0.0"),
        port=int(os.environ.get("WHEP_RELAY_PORT", "8889")),
    )
