# Stream to Matter Parser

Home Assistant add-on for exposing RTSP/ONVIF cameras as Matter camera
endpoints, with snapshot, live view, PTZ, and a Web UI for managing multiple
cameras.

The Home Assistant add-on is the primary supported deployment. Proxmox/Docker
is still documented, but it is secondary and mainly useful for deep debugging.

## Why This Exists

This project follows the same proxy idea described by the Open Home Foundation:
keep useful hardware in service by bridging the protocol it already speaks into
the modern smart home. Instead of replacing working RTSP/ONVIF cameras just to
get Matter camera support, this add-on lets Home Assistant host the bridge:

```text
RTSP/ONVIF camera -> Home Assistant add-on -> Matter camera endpoint
```

The goal is practical retro compatibility: old or vendor-locked cameras keep
doing camera things, while Home Assistant and Matter controllers get a modern
interface for live view, snapshots, and PTZ.

## Install In Home Assistant

1. Open **Settings > Add-ons > Add-on Store**.
2. Open the menu, choose **Repositories**, and add this repository URL:

   ```text
   https://github.com/gabrielvcbessa/ha-matter-camera-bridge
   ```

3. Install **Stream to Matter Parser**.
4. Start the add-on.
5. Open **Web UI** from the add-on page.

Home Assistant builds the add-on locally from `stream-to-matter/`. The first
install can take several minutes because the image includes ffmpeg, Python
camera tooling, the matter.js sidecar, and the WHEP media relay.

## Required Matter Network Settings

Before pairing with Matter, configure a stable Home Assistant operational
address in the add-on **Configuration** tab:

```yaml
matter_tcp: true
matter_listen_ipv4: "HOME_ASSISTANT_IP"
matter_mdns_interface: "HOME_ASSISTANT_NETWORK_INTERFACE"
matter_mdns_ipv6: false
```

`matter_listen_ipv4` must be the Home Assistant host IP, not the camera IP and
not `homeassistant.local`.

To find the correct IP and interface, open the Home Assistant Terminal/SSH
add-on and run:

```bash
ip route get 1.1.1.1
```

Example output:

```text
1.1.1.1 via 192.168.68.1 dev enp1s0 src 192.168.68.110 uid 0
```

Use `src` as `matter_listen_ipv4` and `dev` as `matter_mdns_interface`:

```yaml
matter_tcp: true
matter_listen_ipv4: "192.168.68.110"
matter_mdns_interface: "enp1s0"
matter_mdns_ipv6: false
```

Why this matters: Home Assistant Matter Server can cache an unreachable IPv6
link-local address after add-on updates or reboots. When that happens, the
bridge may look healthy, but Matter live view hangs and eventually reports
`Operation aborted`.

After changing these options, restart the add-on.

## Add Cameras

Camera RTSP, ONVIF, and optional WHEP override values are managed in the add-on
**Web UI**, not in the Home Assistant Configuration tab. This is what allows
multiple cameras to be configured cleanly.

For each camera:

- `Camera ID`: stable identifier, for example `matter_fp2`.
- `Display Name`: name shown to Matter controllers when they surface endpoint
  labels.
- `RTSP URL`: stream used for video probing and snapshots.
- `ONVIF Host/Port/User/Password`: used for PTZ and ONVIF stream discovery.
- `Advanced WHEP Media Source Override`: leave blank unless the WebRTC relay
  must use a different stream than `RTSP URL`.

Use a plain credentialed camera RTSP URL:

```text
rtsp://USER:PASSWORD@CAMERA_IP:554/av_stream/ch0
```

If copying from Frigate or go2rtc, remove suffixes such as
`#tcp#video=copy#audio=copy`; those are not part of the camera RTSP URL.

Use **Load Snapshot** in the Web UI to verify the actual camera image. The Web
UI fetches one frame on demand so it does not keep an extra RTSP stream open
while Matter live view is being tested.

## Pair With Matter

Open the add-on Web UI and copy the manual pairing code or QR payload from the
Matter Pairing panel.

For Home Assistant Matter Server, enable test/development attestation support
before commissioning:

```yaml
enable_test_net_dcl: true
```

This is configured in **Settings > Add-ons > Matter Server > Configuration**.
Restart the Matter Server add-on after changing it.

If you already paired before fixing `matter_listen_ipv4` or
`matter_mdns_interface`, remove the bridge from the Open Home Foundation Matter
Server, use the Web UI danger action to rotate/reset the Matter identity,
restart this add-on, and pair again. This makes the Matter controller forget
any cached bad operational address.

## Verify

From a terminal that can reach Home Assistant:

```bash
curl http://HOME_ASSISTANT_IP:8080/health
curl http://HOME_ASSISTANT_IP:8090/health
curl http://HOME_ASSISTANT_IP:8889/health
curl http://HOME_ASSISTANT_IP:8090/api/logs?limit=80
```

Expected:

- bridge health returns `ok: true`
- sidecar health returns `matterNodeStarted: true`
- WHEP health returns configured camera sources
- `/api/logs` includes `matter.node_started` with `network.tcp: true`,
  `listen.listeningAddressIpv4` set to the Home Assistant IP, and
  `mdns.ipv6: false`

When Matter live view works, `/api/logs` should include events like:

```text
matter-camera.video_stream_allocate
matter-camera.provide_offer_forward_whep
matter-camera.provide_offer_answer_ready
matter-camera.requestor_answer_sent
matter-camera.requestor_ice_candidates_sent
```

When Matter snapshot works, logs should include:

```text
matter-camera.snapshot_stream_allocate
matter-camera.capture_snapshot_complete
matter-camera.snapshot_stream_deallocate
```

## Troubleshooting

If live view hangs and then shows `Operation aborted`, check the Home Assistant
Matter Server logs. This error usually means Home Assistant cached a bad Matter
operational route:

```text
PeerConnection ... tcp://[fe80::...%enp1s0]:5540 ... TCP connection timeout
```

Fix it by setting:

```yaml
matter_tcp: true
matter_listen_ipv4: "HOME_ASSISTANT_IP"
matter_mdns_interface: "INTERFACE_FROM_THE_LOG_OR_IP_ROUTE"
matter_mdns_ipv6: false
```

Then restart the add-on. If the device had already been paired with bad route
data, rotate/reset the Matter identity in the Web UI and pair again.

If the camera probe fails, verify the RTSP URL with credentials and remove any
Frigate/go2rtc suffixes. If PTZ fails, verify the ONVIF password and host.

## Secondary Deployment

The Home Assistant add-on path above is the supported path right now. Proxmox
and generic Docker notes live in
[docs/deployment-guides.md](docs/deployment-guides.md) for advanced debugging
or non-Home Assistant installs.

Developer and architecture notes:

- [docs/deployment-guides.md](docs/deployment-guides.md)
- [docs/matter-sidecar.md](docs/matter-sidecar.md)
- [docs/skills/matter-camera-bridge-debug.md](docs/skills/matter-camera-bridge-debug.md)
