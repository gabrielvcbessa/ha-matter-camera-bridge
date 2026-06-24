# Stream to Matter Parser

Home Assistant add-on for exposing an RTSP/ONVIF camera as a Matter camera
bridge with PTZ controls and WHEP media.

Install this add-on from the repository URL, start the add-on, then open
**Web UI** from Home Assistant. The Home Assistant Configuration tab is only for
global add-on settings; camera RTSP/ONVIF/media settings are managed in the Web
UI so multiple cameras can be edited in one place.

The first start creates a placeholder camera that you should edit in Web UI:

- `camera_id`: `stream_to_matter_camera`
- `camera_name`: `Stream to Matter Camera`

The Web UI camera name is exported to Matter endpoint labels. If you rename a
camera after pairing, restart this add-on and use **Update** or **Interview** in
the Matter Server UI so Home Assistant refreshes the endpoint metadata.

The add-on builds locally from the repository Dockerfile during install. The
first install can take several minutes on Home Assistant hardware because it
installs ffmpeg, Python media dependencies, and the matter.js sidecar.

Every add-on change should bump the patch version in `config.yaml` so Home
Assistant knows an update is available.

Blank Matter setup options use the known development defaults that pair reliably
in local testing: passcode `20202021` and discriminator `3840`. The Home
Assistant options expose advanced override fields only for development or
recovery.

## Matter Server Test DCL

This add-on currently uses matter.js development attestation. Home Assistant's
**Matter Server** add-on must allow the Test Net DCL or commissioning will find
the device and then reject it during attestation.

Open **Settings -> Add-ons -> Matter Server -> Configuration** and enable:

```yaml
enable_test_net_dcl: true
```

Then restart **Matter Server** and retry pairing from this add-on's Web UI.

If Matter Server logs contain this message, the option is still disabled:

```text
Device uses a test/development certificate. Enable the "Test Net DCL" option
```

## Debugging Video

Matter pairing can succeed before video works. Pairing proves the Matter node
is reachable; video additionally requires the camera RTSP stream to open and
the controller to request WebRTC.

Use `rtsp_url` for the stream that should be probed for video and snapshots.
For cameras using the tested `/av_stream/ch0` shape, use:

```text
rtsp://USER:PASSWORD@CAMERA_IP:554/av_stream/ch0
```

Paste the plain camera RTSP URL here, not a Frigate/go2rtc stream expression.
Remove suffixes such as `#tcp#video=copy#audio=copy`; this bridge already opens
RTSP with TCP transport internally.

Leave `media_source` blank unless the WHEP relay must use a different stream
than `rtsp_url`. Do not paste a redacted `rtsp://user:***@...` value into either
field; `***` is only a display placeholder.

The Web UI includes an on-demand **Load Snapshot** button for each camera. It
captures one real frame through the configured RTSP path so you can confirm the
actual video image without keeping a continuous extra stream open. This is
intentional: some cameras allow only one or two RTSP clients, so autoplaying
live previews in every dashboard tab can overload the camera or starve the
Matter/WebRTC session.

Useful checks:

```bash
curl http://HOME_ASSISTANT_IP:8090/status
curl http://HOME_ASSISTANT_IP:8889/health
curl http://HOME_ASSISTANT_IP:8080/cameras/stream_to_matter_camera/probe
```

The add-on log prints a compact heartbeat every `status_heartbeat_seconds`
seconds:

```text
[stream-to-matter-status] {"cameraProbeOk":true,"cameraHasVideo":true,...}
```

When a Matter controller tries to view the camera, look for:

```text
[matter-camera] solicitOffer ...
[matter-camera] provideOffer ... status=forward-whep
[whep-relay] ... status=answer ...
```

When a Matter controller tries a snapshot, look for:

```text
[matter-camera] snapshot_stream_allocate ...
[matter-camera] capture_snapshot_start ...
[matter-camera] capture_snapshot_complete ...
```

If `snapshot_stream_allocate` appears but `capture_snapshot_start` does not,
the controller reached the camera cluster and then aborted before requesting
image bytes. If `capture_snapshot_failed` appears, open
`http://HOME_ASSISTANT_IP:8090/api/logs?limit=120` and copy that event; it
contains the camera id and the exact bridge/ffmpeg error.

The Web UI also includes **Matter Activity**. A paired controller that has not
opened the camera will show zero camera cluster commands. When the controller
actually asks for video, `WebRtcTransportProvider.solicitOffer` and
`WebRtcTransportProvider.provideOffer` counters should increase. Active WebRTC
session count shows sessions currently held open by the Matter media path.

If those Matter camera lines never appear, the controller paired the device but
is not requesting a Matter camera stream. If they appear and WHEP reports
`no-media-source`, `empty-sdp`, `no-tracks`, or an RTSP error, fix the `rtsp_url`
or advanced `media_source` override and camera credentials.

## Reset Matter Identity

If a controller gets stuck with an old fabric/device entry, open the Web UI and
use **Danger Zone -> Reset Matter Identity**. Type `RESET MATTER` to schedule
the reset, then restart the add-on.

On the next start the add-on clears local Matter storage, rotates generated
pairing credentials, and changes the Matter serial number. Existing Matter
controllers will lose the old device and you must pair again using the new code.
