# Matter Sidecar Integration

The bridge API is the camera media/control backend. The `matter-sidecar`
container is the Matter protocol process: it starts matter.js, advertises over
mDNS, generates onboarding payloads, and owns commissioning state.

## Current Boundary

`GET /matter/manifest` returns the contract the matter.js sidecar binds to:

- Camera identity
- Camera display name for endpoint labels
- Matter-targeted camera capability list
- Stream profiles
- HLS/DASH relay routes
- Snapshot route
- PTZ routes
- Privacy and detection zone routes

The `matter-sidecar` container starts a real matter.js `ServerNode`, attaches a
bridge-backed Camera endpoint with Matter camera media, zone, and PTZ/settings
behaviors, and exposes its development pairing information through:

- `GET /matter/onboarding`
- `POST /matter/start`

The current Matter node is pairable as a development node. The camera endpoint
attachment is reported as `cameraEndpoint.attached` so operators can confirm the
endpoint is live before pairing a controller.

Matter controllers may cache endpoint metadata during commissioning. After
changing a camera name or adding/removing cameras, restart the add-on and run a
Matter Server **Update** or **Interview**. If the endpoint shape changed and the
controller keeps stale metadata, remove and re-pair the Matter node.

## What The Matter Sidecar Does

The included sidecar:

1. Starts a Matter SDK node using matter.js.
2. Generates Matter onboarding payloads, such as manual pairing code
   and QR code, using development credentials for local testing.
3. Handles the Matter commissioning state for the local node.
4. Advertises a Camera endpoint matching the manifest.
5. Maps Matter stream allocation to bridge relay routes.
6. Maps Matter mechanical pan/tilt/zoom and sidecar PTZ proxy calls to bridge
   ONVIF PTZ routes.
7. Maps Matter zone and snapshot handlers to bridge state and media routes.
8. Maps Matter WebRTC `ProvideOffer` SDP to a configured WHEP endpoint when
   `MEDIA_WHEP_BASE_URL` is set.
9. Includes an explicit WHEP verifier that creates a real WebRTC offer and
   checks the MediaMTX answer path when the media container is enabled.

## Local Development Shape

```text
Matter controller
  -> Matter SDK sidecar
    -> GET /matter/manifest
    -> POST /cameras/{id}/streams/{profile}/{hls|dash}
    -> POST /cameras/{id}/ptz/direction/{direction}
    -> GET /cameras/{id}/snapshot-data.jpg
    -> GET /cameras/{id}/snapshot-data.heic (bridge-only helper; not advertised through Matter yet)
    -> GET/POST/DELETE /cameras/{id}/zones/{privacy|detection}
    -> POST /{id}/whep on the repo-owned media-webrtc relay when WebRTC media is enabled
      -> RTSP/ONVIF camera
```

## Live WHEP Verification

Enable the optional media container when you intentionally want the local WHEP
relay to receive the camera RTSP source credentials:

```bash
docker-compose --profile media up --build
```

Compose gives the sidecar the internal WHEP URL `http://media-webrtc:8889` and
publishes the relay to the host at `http://127.0.0.1:8889` for diagnostics.

Then run the sidecar WHEP verifier:

```bash
docker-compose --profile media run --rm \
  -e CAMERA_ID=stream_to_matter_camera \
  matter-sidecar npm run whep:check
```

The verifier uses Werift to create a receive-only audio/video offer, posts it to
`/{cameraId}/whep` through `MediaClient`, sets the SDP answer as the remote
description, and waits for the peer or ICE connection to become connected. Werift
is a dev-only verifier dependency and is not installed into the production
Matter sidecar image.

## Why The API Cannot Just Return "The Matter Code"

Matter commissioning is not only a code string. The pairing code/QR payload is
derived from a running Matter device instance with discriminator, passcode,
vendor/product metadata, network advertisement, and device attestation. The
Python bridge provides camera behavior; the matter.js sidecar owns the actual
commissioning session and protocol state.

## Production Note

Development credentials are fine for local experiments. A product that pairs
reliably across consumer ecosystems needs valid Matter certification and device
attestation credentials.
