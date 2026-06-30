---
name: matter-camera-bridge-lab
description: Use when iterating on this repo's RTSP/ONVIF-to-Matter camera bridge, especially Home Assistant Matter Server validation, Matter snapshot limits, WHEP live feed debugging, and mirrored add-on/runtime changes.
---

# Matter Camera Bridge Lab

Use the local lab before trusting Home Assistant add-on changes. Validate against the official Home Assistant Matter Server add-on image, not the older Python matter-server stack.

## Version Guardrail

- Check the official add-on manifest before testing: `https://raw.githubusercontent.com/home-assistant/addons/master/matter_server/config.yaml`.
- The lab should use `homeassistant/{arch}-addon-matter-server` at the manifest version.
- Confirm runtime with `fetchServerInfo()`; the expected shape includes `sdk_version` like `matter-server/... (matter.js/...)`.

## Required End-To-End Checks

- Direct bridge health and camera probe.
- WHEP relay `/health`; `configuredSources` must include `config:<camera_id>` for config-backed cameras.
- Matter `SnapshotStreamAllocate` -> `CaptureSnapshot` -> `SnapshotStreamDeallocate` through the HA Matter Server WebSocket API.
- Matter live path: allocate video/audio streams, call `ProvideOffer`, apply `webrtc_callback` answer/ICE, verify RTP packets arrive, then deallocate.
- Dashboard/API live path: run the sidecar WHEP check and confirm ICE reaches connected/completed with real RTP packets. This catches bad advertised ICE addresses before blaming Matter clusters.

## Snapshot Trap

Matter response payloads need headroom below 64 KB. A raw JPEG near 60 KB can still fail once encoded in the Matter response. Use the bridge `max_bytes` query budget for Matter snapshots and verify capture through Matter, not just direct HTTP.

## Live Feed Trap

If `ProvideOffer` returns `Failure(1)`, check sidecar logs and WHEP `/health` first. A common cause is the WHEP relay not seeing the camera registry, which produces `No media source configured for <camera_id>`.

If `ProvideOffer` returns session ids but the controller waits forever, inspect
`/health` on the WHEP relay. `advertiseIp` must be reachable from the Matter
controller; for the Home Assistant add-on it should normally be the same as
`matter_listen_ipv4`.

## Mirrored Files

Keep top-level runtime files and `stream-to-matter/` add-on mirror in sync for bridge, sidecar, and media relay changes.
