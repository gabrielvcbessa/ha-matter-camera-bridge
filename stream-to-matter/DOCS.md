# Stream to Matter Parser Add-on

## Configuration

Home Assistant's Configuration tab only contains global add-on settings such as
Matter credentials, product name, log level, and heartbeat interval. Camera
RTSP, ONVIF, and optional WHEP media-source values are managed in the add-on Web
UI so multiple cameras can be edited in one place.

The camera display name from the Web UI is exported in the Matter endpoint
labels. After changing a camera name, restart this add-on and run **Update** or
**Interview** on the device in the Matter Server UI so Home Assistant refreshes
the endpoint metadata it cached during pairing.

In the Web UI, `rtsp_url` is the stream used for video probing and snapshots.
For the tested camera stream shape, use a credentialed URL like:

```text
rtsp://USER:PASSWORD@CAMERA_IP:554/av_stream/ch0
```

Use the plain camera RTSP URL. Frigate/go2rtc suffixes such as
`#tcp#video=copy#audio=copy` are not part of the camera URL and should be
removed; the bridge already requests RTSP-over-TCP when probing and capturing
snapshots.

Leave the advanced `media_source` override empty unless the WebRTC/WHEP relay
must use a different RTSP source than `rtsp_url`.

The first start creates a placeholder camera that you should edit in the Web UI:

```yaml
camera_id: stream_to_matter_camera
camera_name: Stream to Matter Camera
```

`matter_log_level` defaults to `warn` so Home Assistant logs focus on useful
status instead of low-level Matter packet chatter. Use `debug` only when you
need Matter protocol traces.

Leave `matter_passcode` and `matter_discriminator` blank for normal use. Blank
uses the known development defaults that pair reliably in local testing:
passcode `20202021` and discriminator `3840`. Fill those fields only when you
intentionally want an advanced development override.

Keep `matter_tcp` enabled for Home Assistant Matter Server. Live view uses
Matter camera WebRTC commands that are large enough to require the operational
TCP path.

Set `matter_listen_ipv4` to the Home Assistant host IP address, not the camera
IP. Set `matter_mdns_interface` to the network interface that owns that IP, and
keep `matter_mdns_ipv6` disabled unless your IPv6 link-local route is known to
be stable.

From the Home Assistant Terminal/SSH add-on, this command shows both values:

```bash
ip route get 1.1.1.1
```

Example:

```text
1.1.1.1 via 192.168.68.1 dev enp1s0 src 192.168.68.110 uid 0
```

Use:

```yaml
matter_listen_ipv4: "192.168.68.110"
whep_advertise_ip: "192.168.68.110"
matter_mdns_interface: "enp1s0"
matter_mdns_ipv6: false
```

`whep_advertise_ip` is the IP address advertised in WebRTC ICE candidates for
Matter live view. It should normally match `matter_listen_ipv4`. If it is left
blank, the add-on defaults it to `matter_listen_ipv4`.

If Home Assistant Matter Server logs show
`tcp://[fe80::...%enp1s0]:5540` followed by `TCP connection timeout`, the
controller selected an unreachable IPv6 link-local route. The interface name is
the value after `%`; set `matter_mdns_interface` to that value and keep
`matter_mdns_ipv6` disabled.

After changing these Matter network options, restart the add-on. If the bridge
was already paired before the values were corrected, remove it from the Open
Home Foundation Matter Server, rotate/reset the Matter identity in the Web UI,
restart the add-on, and pair again.

`status_heartbeat_seconds` controls the periodic camera status line. Set it to
`0` to disable the heartbeat.

## Start

Start the add-on from Home Assistant. The add-on uses host networking so Matter
mDNS and UDP traffic can reach controllers on the LAN.

Open **Web UI** from the add-on page to manage cameras, copy the Matter pairing
code, and inspect bridge, camera, and WHEP health. Camera edits are saved to the
add-on registry and take effect after an add-on restart.

Use **Load Snapshot** in the Web UI to verify the actual camera image. It
captures one frame on demand instead of autoplaying a live preview, which avoids
holding an extra RTSP session open while Matter/WebRTC is also trying to use the
camera.

## Check Health

From the Home Assistant host or another machine that can reach it:

```bash
curl http://HOME_ASSISTANT_IP:8080/health
curl http://HOME_ASSISTANT_IP:8090/health
curl http://HOME_ASSISTANT_IP:8889/health
```

For video diagnostics:

```bash
curl http://HOME_ASSISTANT_IP:8090/status
curl http://HOME_ASSISTANT_IP:8080/cameras/stream_to_matter_camera/probe
curl http://HOME_ASSISTANT_IP:8090/api/logs?limit=80
```

In `/api/logs`, `matter.node_started` should report `network.tcp: true`,
`listen.listeningAddressIpv4` set to the Home Assistant IP, and
`mdns.ipv6: false`.

In `http://HOME_ASSISTANT_IP:8889/health`, `advertiseIp` should be the Home
Assistant IP, not a Docker-only or loopback address.

The add-on logs one compact heartbeat:

```text
[stream-to-matter-status] {"cameraProbeOk":true,"cameraHasVideo":true,"mediaOk":true,...}
```

When a controller opens video, the logs should include Matter camera and WHEP
relay lines:

```text
[matter-camera] provideOffer camera=stream_to_matter_camera status=forward-whep
[whep-relay] ... offer camera=stream_to_matter_camera status=answer ...
```

If no Matter camera request appears, the controller is not asking this Matter
camera endpoint for media. If WHEP reports `no-media-source` or `no-tracks`,
check the add-on `rtsp_url`, optional `media_source` override, and credentials.

When a controller asks for a snapshot, the sidecar logs these events:

```text
snapshot_stream_allocate
capture_snapshot_start
capture_snapshot_complete
snapshot_stream_deallocate
```

If you only see allocate/deallocate and never see `capture_snapshot_start`, the
request reached the Matter camera cluster but Home Assistant aborted before it
asked the add-on for image bytes. If `capture_snapshot_failed` appears, copy the
event from `http://HOME_ASSISTANT_IP:8090/api/logs?limit=120`; it includes the
camera id and the bridge or ffmpeg error.

## Pair Matter

Open the Web UI and use the manual pairing code or QR payload shown in the
Matter Pairing panel.
