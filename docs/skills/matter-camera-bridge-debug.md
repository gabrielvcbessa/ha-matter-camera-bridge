# Matter Camera Bridge Debug Skill

Use this runbook when debugging the Stream to Matter camera bridge against Home Assistant's Open Home Foundation Matter Server.

## Critical Lessons

- The Matter topology that should make camera children discoverable is Root Node -> Aggregator endpoint -> bridged child Camera endpoints. Each camera endpoint must include `BridgedDeviceBasicInformation`; matter.js then injects the `BridgedNode` device type while preserving the `Camera` device type.
- `BridgedDeviceBasicInformation` only initializes under an Aggregator endpoint. If cameras are added directly to the root node, matter.js rejects the bridged-info cluster.
- Keep `BridgedDeviceBasicInformation.uniqueId` at 32 characters or less. Matter.js returns constraint error 135 when it is too long.
- Do not treat raw RTSP, snapshot, or WHEP success as sufficient. The target success signal is a Matter controller live view or snapshot request flowing through the Matter camera clusters.
- Home Assistant may invoke `WebRtcTransportProvider.provideOffer` with `originatingEndpointId: 2`. The bridge must send `WebRtcTransportRequestor.answer` and `WebRtcTransportRequestor.iceCandidates` back to that endpoint, not blindly endpoint `0`.
- The Matter live-view path that worked used `provideOffer`, not `solicitOffer`: HA sent its SDP offer to the camera endpoint, the bridge forwarded it to the WHEP relay, then the bridge invoked the controller requestor callback with the SDP answer.
- A successful live run should show all of these in `/api/logs` or `/status`:
  - `video_stream_allocate`
  - `audio_stream_allocate`
  - `provide_offer_forward_whep` with `originatingEndpointId`
  - `provide_offer_answer_ready`
  - `requestor_answer_sent` with `status: 0`
  - `requestor_ice_candidates_sent` with `status: 0`
  - `provide_ice_candidates_forward_ok`
- A successful media relay should show the active WHEP session as `connectionState: connected` and `iceConnectionState: completed` in the relay `/health` output.
- Snapshot success should show `capture_snapshot_complete` with non-zero `bytes`.
- PTZ success should show `ptz_relative_ok` or another PTZ success event after a Matter PTZ command.
- If `VideoStreamAllocate` succeeds but `send_webrtc_provider_command` or `CaptureSnapshot` fails with `peer-unreachable`, inspect the Matter Server log for `PeerConnection ... tcp://[fe80::...%iface]:5540 ... TCP connection timeout` or `ECONNREFUSED`. In local HA Matter Server 9.0.2 testing, this reproduced when the node was commissioned but the add-on restarted with `MATTER_TCP=false`: allocation still worked over UDP, but `ProvideOffer` never reached the camera. The Home Assistant add-on should run with `MATTER_TCP=true`, and `/api/logs` should show `matter.node_started` with `network.tcp: true`.
- If TCP is true and the same log still shows `peer-unreachable` on `tcp://[fe80::...%iface]:5540`, the controller is selecting an unreachable link-local IPv6 operational address. Keep `MATTER_MDNS_IPV6=false`, set `MATTER_LISTENING_ADDRESS_IPV4`/`matter_listen_ipv4` to the Home Assistant host IP, and set `MATTER_MDNS_INTERFACE` to the interface name shown in the Matter Server log, for example `enp1s0`.
- To find the Home Assistant IP/interface pair, run `ip route get 1.1.1.1` from the Home Assistant Terminal/SSH add-on. Use `src` as `matter_listen_ipv4` and `dev` as `matter_mdns_interface`; for example `dev enp1s0 src 192.168.68.110` maps to `matter_mdns_interface: enp1s0` and `matter_listen_ipv4: "192.168.68.110"`.
- If a bridge was paired before the IPv4/interface settings were correct, removing it from the Open Home Foundation Matter Server may not be enough. Use the bridge Web UI identity reset/rotate action, restart the add-on, and commission again so the controller learns the corrected operational address.
- The proved good production shape is `matter_tcp: true`, `matter_listen_ipv4` set to the Home Assistant host IP, `matter_mdns_interface` set to the interface that owns that IP, and `matter_mdns_ipv6: false`. `/api/logs` should show `matter.node_started` with `network.tcp: true`, `listen.listeningAddressIpv4`, and `mdns.ipv6: false`.

## Current Verified Command Set

These checks were used for the local Node 33 test:

```bash
curl -sS http://127.0.0.1:18092/status
curl -sS http://127.0.0.1:18092/api/logs
curl -sS http://127.0.0.1:18889/health
```

Expected bridge topology evidence:

```json
{
  "bridgeTopology": {
    "aggregatorId": "camera_bridge",
    "aggregatorAttached": true,
    "childDeviceType": "BridgedNode/Camera"
  }
}
```

Expected live-view evidence:

```json
{
  "event": "requestor_answer_sent",
  "endpoint": 2,
  "result": [{ "kind": "cmd-status", "status": 0 }]
}
```

Expected WHEP evidence:

```json
{
  "connectionState": "connected",
  "iceConnectionState": "completed"
}
```

## Debugging Order

1. Confirm the bridge can probe the real camera and reports H.264 video.
2. Confirm `/snapshot-data.jpg` returns non-empty JPEG bytes.
3. Confirm the WHEP relay can negotiate outside Matter.
4. Confirm Matter networking before pairing or after every identity rotation: `/api/logs` should show TCP enabled, IPv6 mDNS disabled, and the Home Assistant IPv4 listen address.
5. Trigger live view from the Matter Server UI and inspect `/api/logs`.
6. If live view fails, inspect the `originatingEndpointId`, callback status, and whether the WHEP session reaches ICE completed.
7. Only change Matter device definitions after command flow, operational addressing, and callback routing have been proven wrong.

## Anti-Regressions

- Preserve callback routing through the controller-provided `originatingEndpointId`.
- Keep fallback callback attempts visible in diagnostic logs.
- Do not remove `provideOffer` handling while HA's dashboard uses it for live view.
- Keep snapshot resizing wired to the requested Matter resolution and quality.
- Keep the add-on mirror under `stream-to-matter/` synced with the top-level runtime files.
