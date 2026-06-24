from __future__ import annotations

import asyncio
import json
import os
import secrets
from datetime import datetime, timezone
from dataclasses import dataclass
from urllib.parse import quote

from aiohttp import web
from aiortc import RTCSessionDescription, RTCPeerConnection
from aiortc.contrib.media import MediaPlayer
from aiortc.exceptions import InvalidStateError


@dataclass
class WhepSession:
    peer: RTCPeerConnection
    player: MediaPlayer
    camera_id: str
    mode: str
    created_at: str


SESSIONS: dict[str, WhepSession] = {}


def log(message: str) -> None:
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    print(f"[whep-relay] {timestamp} {message}", flush=True)


def source_for(camera_id: str) -> str | None:
    env_name = f"{camera_id.upper().replace('-', '_')}_MEDIA_SOURCE"
    configured = source_from_config(camera_id)
    return configured or os.environ.get(env_name) or os.environ.get("CAMERA_MEDIA_SOURCE") or os.environ.get("MEDIA_SOURCE")


def source_from_config(camera_id: str) -> str | None:
    config_path = os.environ.get("STREAM_TO_MATTER_CONFIG", "/data/cameras.json")
    try:
        with open(config_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except OSError:
        return None
    for camera in payload.get("cameras", []):
        if str(camera.get("id", "")) == camera_id:
            return camera.get("media_source") or camera.get("rtsp_url")
    return None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def attach_peer_logging(peer: RTCPeerConnection, camera_id: str, mode: str, session_id: str | None = None) -> None:
    label = f"{mode} camera={camera_id}"
    if session_id:
        label = f"{label} session={session_id}"

    @peer.on("iceconnectionstatechange")
    async def on_ice_connection_state_change() -> None:
        log(f"{label} iceConnectionState={peer.iceConnectionState}")

    @peer.on("connectionstatechange")
    async def on_connection_state_change() -> None:
        log(f"{label} connectionState={peer.connectionState}")

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


async def open_player_or_error(camera_id: str, source: str, mode: str, peer: RTCPeerConnection) -> tuple[MediaPlayer | None, web.Response | None]:
    try:
        return MediaPlayer(source, format="rtsp", options={"rtsp_transport": "tcp"}), None
    except Exception as error:
        await peer.close()
        log(f"{mode} camera={camera_id} status=open-failed error={error}")
        return None, web.json_response({"ok": False, "error": f"Could not open RTSP source: {error}"}, status=503)


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
    player, error_response = await open_player_or_error(camera_id, source, "offer", peer)
    if error_response is not None:
        return error_response

    if player.video:
        peer.addTrack(player.video)
    if player.audio:
        peer.addTrack(player.audio)

    if not player.video and not player.audio:
        await close_session(WhepSession(peer, player, camera_id, "whep", now_iso()))
        log(f"offer camera={camera_id} status=no-tracks")
        return web.json_response({"ok": False, "error": "RTSP source did not expose audio or video tracks"}, status=503)

    await peer.setRemoteDescription(RTCSessionDescription(sdp=sdp_offer, type="offer"))
    answer = await peer.createAnswer()
    await peer.setLocalDescription(answer)

    session_id = secrets.token_urlsafe(18)
    attach_peer_logging(peer, camera_id, "whep", session_id)
    SESSIONS[session_id] = WhepSession(peer, player, camera_id, "whep", now_iso())
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
    player, error_response = await open_player_or_error(camera_id, source, "provider-offer", peer)
    if error_response is not None:
        return error_response

    if player.video:
        peer.addTrack(player.video)
    if player.audio:
        peer.addTrack(player.audio)

    if not player.video and not player.audio:
        await close_session(WhepSession(peer, player, camera_id, "provider", now_iso()))
        log(f"provider-offer camera={camera_id} status=no-tracks")
        return web.json_response({"ok": False, "error": "RTSP source did not expose audio or video tracks"}, status=503)

    offer = await peer.createOffer()
    await peer.setLocalDescription(offer)

    session_id = secrets.token_urlsafe(18)
    attach_peer_logging(peer, camera_id, "provider", session_id)
    SESSIONS[session_id] = WhepSession(peer, player, camera_id, "provider", now_iso())
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
    body = await request.text()
    candidate_lines = [
        line
        for line in body.splitlines()
        if line.startswith("a=candidate:") or line.startswith("candidate:")
    ]
    log(f"candidates camera={camera_id} session={session_id} bytes={len(body)} count={len(candidate_lines)}")
    return web.Response(status=204, headers={"Access-Control-Allow-Origin": "*"})


async def delete_whep(request: web.Request) -> web.Response:
    camera_id = request.match_info["camera_id"]
    session_id = request.match_info["session_id"]
    session = SESSIONS.pop(session_id, None)
    if session:
        await close_session(session)
    log(f"delete camera={camera_id} session={session_id} existed={bool(session)} sessions={len(SESSIONS)}")
    return web.Response(status=204, headers={"Access-Control-Allow-Origin": "*"})


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
    configured = sorted(
        name
        for name, value in os.environ.items()
        if value and (name.endswith("_MEDIA_SOURCE") or name == "MEDIA_SOURCE")
    )
    sessions = [
        {
            "id": session_id,
            "cameraId": session.camera_id,
            "mode": session.mode,
            "createdAt": session.created_at,
            "connectionState": session.peer.connectionState,
            "iceConnectionState": session.peer.iceConnectionState,
            "iceGatheringState": session.peer.iceGatheringState,
        }
        for session_id, session in SESSIONS.items()
    ]
    return web.json_response({"ok": True, "sessions": len(SESSIONS), "configuredSources": configured, "activeSessions": sessions})


async def close_session(session: WhepSession) -> None:
    for track in [session.player.audio, session.player.video]:
        if track:
            track.stop()
    await session.peer.close()


async def on_shutdown(_app: web.Application) -> None:
    sessions = list(SESSIONS.values())
    SESSIONS.clear()
    await asyncio.gather(*(close_session(session) for session in sessions), return_exceptions=True)


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/health", health)
    app.router.add_post("/{camera_id}/whep", post_whep)
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
    log(
        f"starting host={os.environ.get('WHEP_RELAY_HOST', '0.0.0.0')} "
        f"port={os.environ.get('WHEP_RELAY_PORT', '8889')}"
    )
    web.run_app(
        create_app(),
        host=os.environ.get("WHEP_RELAY_HOST", "0.0.0.0"),
        port=int(os.environ.get("WHEP_RELAY_PORT", "8889")),
    )
