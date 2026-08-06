"""Commission the local bridge through Home Assistant Matter Server."""

from __future__ import annotations

import asyncio
import json
import os
import re

from aiohttp import ClientSession
from aiortc import RTCConfiguration, RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import MediaStreamError
from aiortc.sdp import candidate_from_sdp
from matter_server.client.client import MatterClient
from matter_server.common.models import EventType


CAMERA_AV_STREAM_MANAGEMENT_CLUSTER_ID = 1361
WEBRTC_TRANSPORT_PROVIDER_CLUSTER_ID = 1363
CAMERA_AV_SETTINGS_USER_LEVEL_MANAGEMENT_CLUSTER_ID = 1362
STREAM_USAGE_LIVE_VIEW = 3


async def raw_device_command(
    client: MatterClient,
    node_id: int,
    endpoint_id: int,
    command_name: str,
    payload: dict,
    *,
    cluster_id: int = CAMERA_AV_STREAM_MANAGEMENT_CLUSTER_ID,
    response_required: bool = True,
) -> dict | None:
    response = await client.send_command(
        "device_command",
        node_id=node_id,
        endpoint_id=endpoint_id,
        cluster_id=cluster_id,
        command_name=command_name,
        payload=payload,
    )
    if response is None and not response_required:
        return None
    if not isinstance(response, dict):
        raise RuntimeError(f"{command_name} returned an invalid response: {response!r}")
    return response


async def capture_snapshot(client: MatterClient, node_id: int, endpoint_id: int) -> dict:
    resolution = {"width": 640, "height": 360}
    allocated = await raw_device_command(
        client,
        node_id,
        endpoint_id,
        "SnapshotStreamAllocate",
        {
            "imageCodec": 0,
            "maxFrameRate": 1,
            "minResolution": resolution,
            "maxResolution": resolution,
            "quality": 90,
        },
    )
    stream_id = allocated.get("snapshotStreamId", allocated.get("0"))
    if stream_id is None:
        raise RuntimeError(f"SnapshotStreamAllocate returned no stream id: {allocated!r}")
    try:
        snapshot = await raw_device_command(
            client,
            node_id,
            endpoint_id,
            "CaptureSnapshot",
            {"snapshotStreamId": stream_id, "requestedResolution": resolution},
        )
        image = snapshot.get("image", snapshot.get("data", snapshot.get("0")))
        if isinstance(image, str):
            image_size = len(image)
        elif isinstance(image, (bytes, bytearray, list)):
            image_size = len(image)
        else:
            raise RuntimeError(f"CaptureSnapshot returned no image: {snapshot!r}")
        if image_size < 100:
            raise RuntimeError(f"CaptureSnapshot image is unexpectedly small: {image_size}")
        return {"endpoint_id": endpoint_id, "image_size": image_size}
    finally:
        await raw_device_command(
            client,
            node_id,
            endpoint_id,
            "SnapshotStreamDeallocate",
            {"snapshotStreamId": stream_id},
            response_required=False,
        )


async def receive_live_video(client: MatterClient, node_id: int, endpoint_id: int) -> dict:
    resolution = {"width": 640, "height": 480}
    allocated = await raw_device_command(
        client,
        node_id,
        endpoint_id,
        "VideoStreamAllocate",
        {
            "streamUsage": STREAM_USAGE_LIVE_VIEW,
            "videoCodec": 0,
            "minFrameRate": 1,
            "maxFrameRate": 10,
            "minResolution": resolution,
            "maxResolution": resolution,
            "minBitRate": 10000,
            "maxBitRate": 1000000,
            "keyFrameInterval": 4000,
        },
    )
    stream_id = allocated.get("videoStreamId", allocated.get("0"))
    if stream_id is None:
        raise RuntimeError(f"VideoStreamAllocate returned no stream id: {allocated!r}")

    peer = RTCPeerConnection(RTCConfiguration(iceServers=[]))
    peer.addTransceiver("video", direction="recvonly")
    callback_queue: asyncio.Queue[dict] = asyncio.Queue()
    frames: asyncio.Queue = asyncio.Queue()
    connection_states: list[str] = []
    ice_states: list[str] = []

    def on_webrtc_event(_event: EventType, data: dict) -> None:
        if str(data.get("node_id")) == str(node_id) and data.get("endpoint_id") == endpoint_id:
            callback_queue.put_nowait(data)

    unsubscribe = client.subscribe_events(on_webrtc_event, EventType.WEBRTC_CALLBACK)

    @peer.on("connectionstatechange")
    def on_connection_state_change() -> None:
        connection_states.append(peer.connectionState)

    @peer.on("iceconnectionstatechange")
    def on_ice_connection_state_change() -> None:
        ice_states.append(peer.iceConnectionState)

    @peer.on("track")
    def on_track(track) -> None:
        if track.kind != "video":
            return

        async def read_frames() -> None:
            try:
                while True:
                    frames.put_nowait(await track.recv())
            except MediaStreamError as error:
                frames.put_nowait(error)

        asyncio.create_task(read_frames())

    session_id = None
    callback_task = None
    try:
        offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        response = await client.send_webrtc_provider_command(
            node_id,
            endpoint_id,
            "ProvideOffer",
            {
                "webRtcSessionId": None,
                "sdp": peer.localDescription.sdp,
                "streamUsage": STREAM_USAGE_LIVE_VIEW,
                "videoStreams": [stream_id],
            },
        )
        session_id = response.get("webRtcSessionId")
        if session_id is None:
            raise RuntimeError(f"ProvideOffer returned no session id: {response!r}")

        answer_sdp = None
        deadline = asyncio.get_running_loop().time() + 15
        while asyncio.get_running_loop().time() < deadline:
            remaining = deadline - asyncio.get_running_loop().time()
            event = await asyncio.wait_for(callback_queue.get(), timeout=remaining)
            if event.get("webrtc_session_id") != session_id:
                continue
            if event.get("event_type") == "answer":
                answer_sdp = (event.get("data") or {}).get("sdp")
                break
        if not answer_sdp:
            raise RuntimeError("Matter controller received no WebRTC answer")
        await peer.setRemoteDescription(RTCSessionDescription(sdp=answer_sdp, type="answer"))

        async def consume_remote_callbacks() -> None:
            while True:
                event = await callback_queue.get()
                if event.get("webrtc_session_id") != session_id:
                    continue
                if event.get("event_type") == "ice_candidates":
                    for item in (event.get("data") or {}).get("ice_candidates", []):
                        raw = str(item.get("candidate") or "").strip()
                        if not raw or raw == "end-of-candidates":
                            await peer.addIceCandidate(None)
                            continue
                        value = raw.removeprefix("candidate:")
                        candidate = candidate_from_sdp(value)
                        candidate.sdpMid = item.get("sdpMid")
                        candidate.sdpMLineIndex = item.get("sdpMLineIndex")
                        await peer.addIceCandidate(candidate)
                elif event.get("event_type") == "end":
                    return

        callback_task = asyncio.create_task(consume_remote_callbacks())

        received = []
        for _ in range(3):
            frame = await asyncio.wait_for(frames.get(), timeout=15)
            if isinstance(frame, Exception):
                raise RuntimeError(
                    "Matter WebRTC track ended before three frames; "
                    f"connection={peer.connectionState}, ice={peer.iceConnectionState}"
                ) from frame
            received.append({"width": frame.width, "height": frame.height})
        return {
            "endpoint_id": endpoint_id,
            "video_stream_id": stream_id,
            "webrtc_session_id": session_id,
            "frames": received,
            "connection_state": peer.connectionState,
            "ice_connection_state": peer.iceConnectionState,
            "connection_states": connection_states,
            "ice_states": ice_states,
        }
    finally:
        if callback_task is not None:
            callback_task.cancel()
        unsubscribe()
        if session_id is not None:
            await raw_device_command(
                client,
                node_id,
                endpoint_id,
                "EndSession",
                {"webRtcSessionId": session_id, "reason": 2},
                cluster_id=WEBRTC_TRANSPORT_PROVIDER_CLUSTER_ID,
                response_required=False,
            )
        await peer.close()
        await raw_device_command(
            client,
            node_id,
            endpoint_id,
            "VideoStreamDeallocate",
            {"videoStreamId": stream_id},
            response_required=False,
        )


async def test_ptz(
    client: MatterClient,
    session: ClientSession,
    node_id: int,
    endpoint_id: int,
) -> dict:
    bridge_url = os.environ.get("BRIDGE_URL", "http://127.0.0.1:18080").rstrip("/")
    camera_id = os.environ.get("MATTER_PTZ_CAMERA_ID", "lab_camera")
    status_url = f"{bridge_url}/cameras/{camera_id}/ptz/status"

    async def position() -> dict:
        async with session.get(status_url, timeout=10) as response:
            response.raise_for_status()
            payload = await response.json()
        return payload["position"]

    before = await position()
    delta = 10
    await raw_device_command(
        client,
        node_id,
        endpoint_id,
        "MptzRelativeMove",
        {"panDelta": delta, "tiltDelta": 0, "zoomDelta": 0},
        cluster_id=CAMERA_AV_SETTINGS_USER_LEVEL_MANAGEMENT_CLUSTER_ID,
        response_required=False,
    )
    await asyncio.sleep(1)
    moved = await position()
    try:
        if abs(float(moved["pan"]) - float(before["pan"])) < 0.01:
            raise RuntimeError(f"Matter PTZ command did not change ONVIF pan position: {before} -> {moved}")
    finally:
        await raw_device_command(
            client,
            node_id,
            endpoint_id,
            "MptzRelativeMove",
            {"panDelta": -delta, "tiltDelta": 0, "zoomDelta": 0},
            cluster_id=CAMERA_AV_SETTINGS_USER_LEVEL_MANAGEMENT_CLUSTER_ID,
            response_required=False,
        )
        await asyncio.sleep(1)
    restored = await position()
    if abs(float(restored["pan"]) - float(before["pan"])) > 1.0:
        raise RuntimeError(f"Matter PTZ command did not restore the original pan position: {before} -> {restored}")
    return {
        "endpoint_id": endpoint_id,
        "camera_id": camera_id,
        "before": before,
        "moved": moved,
        "restored": restored,
    }


async def main() -> None:
    server_url = os.environ.get("MATTER_SERVER_URL", "ws://127.0.0.1:15580/ws")
    pairing_code = os.environ["MATTER_PAIRING_CODE"]
    async with ClientSession() as session:
        client = MatterClient(server_url, session)
        await client.connect()
        listener = asyncio.create_task(client.start_listening())
        try:
            info = client.server_info
            await asyncio.sleep(1)
            existing = client.get_nodes()
            if existing:
                node = max(existing, key=lambda item: item.node_id)
                await client.interview_node(node.node_id)
                await asyncio.sleep(2)
                node = client.get_node(node.node_id)
                action = "reused"
            else:
                node = await client.commission_with_code(pairing_code, network_only=True)
                action = "commissioned"

            node_data = getattr(node, "node_data", node)
            attributes = getattr(node_data, "attributes", {}) or {}
            endpoint_ids = set(getattr(node, "endpoints", {}).keys())
            for path in attributes:
                endpoint_id = getattr(path, "endpoint_id", None)
                if endpoint_id is None:
                    match = re.match(r"^(\d+)/", str(path))
                    endpoint_id = int(match.group(1)) if match else None
                if endpoint_id is not None:
                    endpoint_ids.add(int(endpoint_id))
            endpoint_ids = sorted(endpoint_ids)
            if not {0, 1, 2}.issubset(endpoint_ids):
                raise RuntimeError(f"Expected root, aggregator, and camera endpoints; got {endpoint_ids}")

            camera_endpoints = []
            for endpoint_id in endpoint_ids:
                prefix = f"{endpoint_id}/{CAMERA_AV_STREAM_MANAGEMENT_CLUSTER_ID}/"
                if any(str(path).startswith(prefix) for path in attributes):
                    camera_endpoints.append(endpoint_id)
            if len(camera_endpoints) != 2:
                raise RuntimeError(f"Expected two camera endpoints; got {camera_endpoints}")
            snapshots = [
                await capture_snapshot(client, node.node_id, endpoint_id)
                for endpoint_id in camera_endpoints
            ]
            live_video = [
                await receive_live_video(client, node.node_id, endpoint_id)
                for endpoint_id in camera_endpoints
            ]
            ptz_endpoint_id = int(os.environ.get("MATTER_PTZ_ENDPOINT_ID", camera_endpoints[0]))
            if ptz_endpoint_id not in camera_endpoints:
                raise RuntimeError(f"Configured PTZ endpoint {ptz_endpoint_id} is not a camera endpoint: {camera_endpoints}")
            matter_ptz = await test_ptz(client, session, node.node_id, ptz_endpoint_id)
            print(json.dumps({
                "ok": True,
                "action": action,
                "server": getattr(info, "sdk_version", str(info)),
                "node_id": node.node_id,
                "endpoint_ids": endpoint_ids,
                "attribute_count": len(attributes),
                "camera_endpoints": camera_endpoints,
                "matter_snapshots": snapshots,
                "matter_live_video": live_video,
                "matter_ptz": matter_ptz,
            }, indent=2))
        finally:
            listener.cancel()
            await client.disconnect()


asyncio.run(main())
