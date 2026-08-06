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
- Restart the bridge with its persisted Matter storage, then repeat snapshot and live-view requests without re-pairing. The node must restore its fabric and camera endpoints.
- Restart the Home Assistant Matter Server, interview the existing node again, and repeat snapshot and live-view requests. A successful first pairing is not enough.
- Use at least two camera endpoints. Exercise snapshot and live view on each endpoint to catch shared-session and camera-id routing bugs.
- For a real PTZ camera, read its position, move it through the Matter-facing PTZ route, and restore the original position before the test finishes.

## Snapshot Trap

Matter response payloads need headroom below 64 KB. A raw JPEG near 60 KB can still fail once encoded in the Matter response. Use the bridge `max_bytes` query budget for Matter snapshots and verify capture through Matter, not just direct HTTP.

## Live Feed Trap

If `ProvideOffer` returns `Failure(1)`, check sidecar logs and WHEP `/health` first. A common cause is the WHEP relay not seeing the camera registry, which produces `No media source configured for <camera_id>`.

If `ProvideOffer` returns session ids but the controller waits forever, inspect
`/health` on the WHEP relay. `advertiseIp` must be reachable from the Matter
controller; for the Home Assistant add-on it should normally be the same as
`matter_listen_ipv4`.

The HTTP listener address and the advertised ICE address are different jobs.
Binding go2rtc or the relay to `0.0.0.0` does not produce a controller-reachable
candidate. In the local Docker lab, set `WHEP_ADVERTISE_IP` to the host LAN IPv4
address; the lab script auto-detects macOS `en0` when the variable is absent.

Advertise only stream usages that are implemented end to end. The current
bridge supports Matter `LiveView`; advertising recording or analysis causes
controllers to negotiate paths the relay cannot satisfy.

Do not prewarm or recycle a shared camera source in the middle of Matter WebRTC
negotiation. Serialize relay work per camera, return the legal Matter offer
response immediately, and apply the controller answer and ICE candidates when
they arrive.

Use separate timeout budgets for separate media jobs. A relay snapshot should
fail fast (currently 5 seconds) so the direct bridge fallback still has time to
answer the Matter command. Cold WHEP offer negotiation may legitimately need a
longer budget (currently 45 seconds). Do not use the WHEP budget as the global
media timeout: two camera aliases sharing one RTSP source can otherwise push a
snapshot beyond the controller deadline and produce `Operation aborted`.

Do not prewarm every camera during sidecar startup. Bring the Matter node online
first and warm media only on explicit demand. Startup prewarming can contend
with the first controller snapshot or live request, especially when multiple
Matter endpoints use the same physical stream.

## Dashboard Guardrails

- Dashboard snapshot, live preview, and PTZ controls must call the
  `/api/matter/cameras/<camera_id>/...` routes so the UI exercises the same
  adapters as a Matter controller.
- Label dashboard checks honestly: those routes exercise the same command
  handlers but do not cross a commissioned Matter fabric. Only the controller
  smoke test or a real controller proves cluster encoding, secure sessions,
  requestor callbacks, ICE exchange, and network reachability.
- Compile the generated inline dashboard script with `vm.Script`; template
  literal escaping errors can leave a healthy bridge behind an empty shell.
- Keep one selected-camera workspace with tabs. Do not open a background stream
  for every configured camera.
- Never render a player for a camera whose probe has not detected video.
- Keep pairing compact and secondary to live camera operation. Show full-width
  guidance only for actionable failures or a required restart.

## Mirrored Files

Keep top-level runtime files and `stream-to-matter/` add-on mirror in sync for bridge, sidecar, and media relay changes.
