# Stream to Matter Parser

Containerized RTSP/ONVIF camera bridge plus a matter.js sidecar that exposes a
Matter 1.5.1 Camera endpoint.

The bridge verifies a real camera stream, discovers ONVIF services, controls
PTZ, captures snapshots, generates a Matter-facing capability model, and exposes
HLS/DASH relay controls. The sidecar starts a real matter.js `ServerNode`,
generates Matter onboarding payloads, advertises over mDNS, and attaches a
bridge-backed Matter Camera endpoint.

## What Works Now

- Loads camera credentials from environment variables or `.env`.
- Probes RTSP with `ffprobe`.
- Falls back from a local Frigate/go2rtc loopback URL to the ONVIF-discovered
  camera RTSP URI when needed.
- Discovers ONVIF media and PTZ services.
- Reads ONVIF stream profiles and stream URI.
- Reads PTZ status with structured pan/tilt/zoom and move state.
- Sends ONVIF continuous, relative, absolute, and stop PTZ commands.
- Captures JPEG snapshots through `ffmpeg`.
- Models the newest camera-facing Matter surface currently targeted here:
  live video, live audio, multi-stream profiles, HLS/DASH, JPEG snapshot
  capture, PTZ, privacy zones, detection zones, recording hooks, and two-way
  audio hooks. The bridge still has HEIC helper routes, but the Matter endpoint
  advertises JPEG-only snapshots until HEIC is verified against Home Assistant.
- Starts/stops ffmpeg-backed HLS and DASH relays for `high`, `mobile`, and
  `analysis` profiles.
- Emits `/matter/manifest`, the integration contract consumed by the sidecar.
- Runs a separate `matter-sidecar` container with a real matter.js `ServerNode`.
- Generates a Matter manual pairing code and QR payload from the running sidecar.
- Attaches a Matter Camera endpoint with `CameraAvStreamManagement`,
  `WebRtcTransportProvider`, `ZoneManagement`, and
  `CameraAvSettingsUserLevelManagement` behaviors.
- Routes Matter-sidecar stream allocation, snapshot capture, zone updates, and
  mechanical pan/tilt/zoom calls back through the bridge.
- Carries each configured camera display name into the Matter endpoint labels
  so multi-camera setups can be distinguished by controllers that surface those
  labels.

## Current Matter Scope

The Python service is not itself the commissioned Matter node; the Node sidecar
owns Matter commissioning and protocol state. The included sidecar uses
development credentials and is suitable for local testing. Production ecosystem
pairing still requires valid Matter certification, device attestation, and
controller-specific compatibility testing.

See [docs/matter-sidecar.md](docs/matter-sidecar.md) for the sidecar shape and
why pairing codes/QR codes have to come from a running Matter SDK device
instance, not directly from this REST API.

## Test Camera

The included config targets one generic ONVIF camera:

- ONVIF host: `192.168.68.59`
- ONVIF port: `80`
- RTSP restream from Frigate/go2rtc: `rtsp://127.0.0.1:8554/camera`

Credentials are intentionally loaded from environment variables, not from the
JSON config.

## Environment

Create a local `.env`:

```bash
cp .env.example .env
```

Set these values:

```bash
CAMERA_RTSP_URL=rtsp://127.0.0.1:8554/camera
CAMERA_ID=stream_to_matter_camera
CAMERA_NAME=Stream to Matter Camera
CAMERA_ONVIF_HOST=192.168.68.59
CAMERA_ONVIF_PORT=80
CAMERA_ONVIF_USER=rtsp
CAMERA_ONVIF_PASSWORD=your-password
CAMERA_MEDIA_SOURCE=rtsp://rtsp:your-password@192.168.68.59:554/av_stream/ch0
```

`.env` is ignored by Git. Commit `.env.example`, not `.env`.

## Recommended Deployment

Use the Home Assistant add-on path first. After this repo is pushed to GitHub,
add the repository URL in Home Assistant under **Settings > Add-ons > Add-on
Store > Repositories**, then install **Stream to Matter Parser**.

The Home Assistant add-on package is the root-level `stream-to-matter/` folder.
It runs the bridge, Matter sidecar, and WHEP relay in one add-on container with
host networking so Matter mDNS and UDP traffic can reach your controller.

The add-on builds locally from the repository Dockerfile during install. The
first install can take several minutes on Home Assistant hardware because it
installs ffmpeg, Python media dependencies, and the matter.js sidecar.

Use the Proxmox Docker guide only when you want to run the bridge outside Home
Assistant or need a separate VM for networking/debugging.

Full instructions for both paths are in
[docs/deployment-guides.md](docs/deployment-guides.md).

## Run Locally

```bash
env PYTHONPATH=src PYTHONPYCACHEPREFIX=.pycache python3 -m stream_to_matter.server
```

Open:

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/cameras/stream_to_matter_camera/probe
curl http://127.0.0.1:8080/matter/manifest
```

## Run In Docker

This repo was tested with Docker CLI, Docker Compose, and Colima on macOS:

```bash
brew install docker docker-compose colima
colima start --cpu 2 --memory 4 --disk 20
docker-compose up --build
```

By default, `docker-compose.yml` starts two containers:

- `stream-to-matter`: Python RTSP/ONVIF bridge on port `8080`.
- `matter-sidecar`: Node/matter.js sidecar on port `8090`.

The API ports are published to `127.0.0.1` for local testing. On macOS/Colima,
the configured Frigate loopback URL may not resolve from inside the VM, so the
bridge falls back to the ONVIF-discovered camera stream.
All camera secrets are provided through `.env`; they are not committed.

The optional `media` profile starts a third container:

- `media-webrtc`: repo-owned RTSP-to-WebRTC/WHEP service on port `8889`.

Run it when you intentionally want the local WHEP relay container to read the
camera RTSP credentials from `.env`:

```bash
docker-compose --profile media up --build
```

Inside Compose, the sidecar reaches the relay at `http://media-webrtc:8889`.
From your host, the same relay is available at `http://127.0.0.1:8889`.

## Run On Proxmox

Use a Debian or Ubuntu VM on the same LAN/VLAN as the camera and the Matter
controller. A VM is preferred over an unprivileged LXC because Matter pairing
uses LAN multicast/mDNS plus UDP traffic, and Docker host networking behaves
more predictably in a full Linux VM.

Install Docker and Compose:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker compose version
```

Clone the repo and configure secrets:

```bash
git clone https://github.com/gabrielvcbessa/ha-matter-camera-bridge.git
cd ha-matter-camera-bridge
cp .env.example .env
nano .env
```

Set `.env` with the camera host, ONVIF credentials, and RTSP media source. Keep
`.env` only on the Proxmox VM; it is ignored by Git.

Start the full Matter plus WebRTC stack:

```bash
docker compose -f docker-compose.proxmox.yml --profile media up -d --build
```

Check that all three services are running:

```bash
docker compose -f docker-compose.proxmox.yml --profile media ps
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8090/health
curl http://127.0.0.1:8889/health
```

Get the Matter pairing payload:

```bash
curl http://127.0.0.1:8090/matter/onboarding
```

Use the returned manual pairing code or QR payload in your Matter controller.
If the controller cannot discover the bridge, confirm the Proxmox VM and
controller are on the same LAN/VLAN and that multicast/mDNS is not blocked by
firewall rules.

Run live acceptance checks one at a time. Some cameras reject simultaneous
RTSP opens, so do not run the WHEP verifier and full acceptance script in
parallel:

```bash
docker compose -f docker-compose.proxmox.yml --profile media run --rm \
  -e CAMERA_ID=stream_to_matter_camera \
  matter-sidecar npm run whep:check

python3 scripts/acceptance_check.py --require-whep --move-ptz
```

Update after pulling new commits:

```bash
git pull
docker compose -f docker-compose.proxmox.yml --profile media up -d --build --force-recreate
```

## API

Core:

- `GET /health`
- `GET /cameras`
- `GET /matter/capabilities`
- `GET /matter/manifest`

Sidecar:

- `GET http://127.0.0.1:8090/health`
- `GET http://127.0.0.1:8090/status`
- `GET http://127.0.0.1:8090/bridge/manifest`
- `GET http://127.0.0.1:8090/matter/onboarding`
- `POST http://127.0.0.1:8090/matter/start`
- `POST http://127.0.0.1:8090/camera/camera/ptz/left?speed=0.2`
- `GET http://127.0.0.1:8090/camera/camera/zones/privacy`
- `POST http://127.0.0.1:8090/camera/camera/zones/detection`
- `DELETE http://127.0.0.1:8090/camera/camera/zones/detection/entry_detection`

Camera discovery/media:

- `GET /cameras/stream_to_matter_camera/probe`
- `GET /cameras/stream_to_matter_camera/onvif`
- `GET /cameras/stream_to_matter_camera/stream-uri`
- `GET /cameras/stream_to_matter_camera/streams`
- `GET /cameras/stream_to_matter_camera/snapshot.jpg`
- `GET /cameras/stream_to_matter_camera/snapshot-data.jpg`

Relays:

- `GET /cameras/stream_to_matter_camera/streams/relay`
- `POST /cameras/stream_to_matter_camera/streams/high/hls`
- `POST /cameras/stream_to_matter_camera/streams/high/hls/stop`
- `POST /cameras/stream_to_matter_camera/streams/mobile/dash`
- `POST /cameras/stream_to_matter_camera/streams/mobile/dash/stop`

PTZ:

- `GET /cameras/stream_to_matter_camera/ptz/status`
- `POST /cameras/stream_to_matter_camera/ptz/direction/left?speed=1`
- `POST /cameras/stream_to_matter_camera/ptz/direction/right?speed=1`
- `POST /cameras/stream_to_matter_camera/ptz/direction/up?speed=1`
- `POST /cameras/stream_to_matter_camera/ptz/direction/down?speed=1`
- `POST /cameras/stream_to_matter_camera/ptz/direction/up-left?speed=1`
- `POST /cameras/stream_to_matter_camera/ptz/direction/up-right?speed=1`
- `POST /cameras/stream_to_matter_camera/ptz/direction/down-left?speed=1`
- `POST /cameras/stream_to_matter_camera/ptz/direction/down-right?speed=1`
- `POST /cameras/stream_to_matter_camera/ptz/direction/zoom-in?speed=1`
- `POST /cameras/stream_to_matter_camera/ptz/direction/zoom-out?speed=1`
- `POST /cameras/stream_to_matter_camera/ptz/continuous?pan=0.05&tilt=0&zoom=0`
- `POST /cameras/stream_to_matter_camera/ptz/relative?pan=0.1&tilt=0&zoom=0`
- `POST /cameras/stream_to_matter_camera/ptz/absolute?pan=0&tilt=0&zoom=0`
- `POST /cameras/stream_to_matter_camera/ptz/stop`

Zones:

- `GET /cameras/stream_to_matter_camera/zones/privacy`
- `POST /cameras/stream_to_matter_camera/zones/privacy`
- `DELETE /cameras/stream_to_matter_camera/zones/privacy/{zone_id}`
- `GET /cameras/stream_to_matter_camera/zones/detection`
- `POST /cameras/stream_to_matter_camera/zones/detection`
- `DELETE /cameras/stream_to_matter_camera/zones/detection/{zone_id}`

Example zone body:

```json
{
  "id": "entry_detection",
  "points": [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]
}
```

## Tests

Offline unit tests:

```bash
env PYTHONPATH=src PYTHONPYCACHEPREFIX=.pycache python3 -m unittest discover -s tests
```

Live camera acceptance check:

```bash
env PYTHONPATH=src PYTHONPYCACHEPREFIX=.pycache python3 scripts/live_check.py
```

Live Docker stack acceptance check:

```bash
python3 scripts/acceptance_check.py
```

This checks the running bridge and sidecar containers, Matter onboarding,
camera probe, enabled Matter camera capabilities, JPEG/HEIC snapshots, HLS relay
startup/stop, privacy/detection zone controls, and WHEP configuration status.

Optional PTZ movement check:

```bash
env PYTHONPATH=src PYTHONPYCACHEPREFIX=.pycache python3 scripts/live_check.py --move-ptz
python3 scripts/acceptance_check.py --move-ptz
```

Matter-sidecar unit tests:

```bash
docker run --rm -v "$PWD/sidecar:/app" -w /app node:22-slim npm test
```

Live WebRTC/WHEP acceptance check, after the `media` profile is running:

```bash
docker-compose --profile media run --rm \
  -e CAMERA_ID=stream_to_matter_camera \
  matter-sidecar npm run whep:check
```

The WHEP check creates a real receive-only WebRTC offer, sends it through the
same `MediaClient` path used by Matter `ProvideOffer`, applies the SDP answer,
and waits for ICE/peer connection. A passing result prints JSON with `ok: true`.
The WebRTC verifier dependency is included in the sidecar image so the shipped
container can run this operational check.

To make WHEP media a required acceptance gate after enabling the `media` profile:

```bash
python3 scripts/acceptance_check.py --require-whep
```

Full local acceptance with WebRTC/WHEP and PTZ movement:

```bash
python3 scripts/acceptance_check.py --require-whep --move-ptz
```

## Current Live Findings

Against the tested ONVIF camera:

- ONVIF media service: found.
- ONVIF PTZ service: found.
- ONVIF profiles: `mainStream`, `minorStream`.
- ONVIF stream URI: `rtsp://192.168.68.59:554/av_stream/ch0`.
- Configured go2rtc loopback returned invalid RTSP data from this host.
- ONVIF stream fallback worked with credentials.
- Effective stream: H.264 video, 1920x1080, 20fps.
- Audio stream: `pcm_alaw`.
- Snapshot capture: 1920x1080 JPEG.
- HEIC bridge route: available when `heif-enc` is installed, but not advertised
  through Matter yet.
- HLS relay: mobile profile starts, writes `index.m3u8`, and stops cleanly.
- Docker stack acceptance: `scripts/acceptance_check.py` passes.
- WHEP acceptance: repo-owned `media-webrtc` relay accepts a real SDP offer,
  returns an SDP answer, and reaches ICE connected through `npm run whep:check`.
- PTZ acceptance: `scripts/acceptance_check.py --move-ptz` passes for all
  cardinal, diagonal, and zoom directions.
- PTZ status: structured position and idle move state.
- PTZ continuous move and stop: verified.

## Matter Pairing

With Docker running, get the development pairing payload from:

```bash
curl http://127.0.0.1:8090/matter/onboarding
```

The response includes:

- `manualPairingCode`
- `qrPairingCode`
- `qrCodeUrl`
- `passcode`
- `discriminator`
- `cameraEndpoint.attached`

The pairing code comes from the running matter.js sidecar, not from the Python
REST bridge. Blank Home Assistant Matter credential options use the local
development defaults, passcode `20202021` and discriminator `3840`, unless you
enter an advanced override. In the verified local run, the sidecar reported
`cameraEndpoint.attached: true` and advertised endpoint `Camera (0x0142, rev 1)`.
The endpoint included `CameraAvStreamManagement`, `WebRtcTransportProvider`,
`ZoneManagement`, and `CameraAvSettingsUserLevelManagement`.

### Home Assistant Matter Server Test DCL

The sidecar currently uses matter.js development attestation. Home Assistant's
Matter Server add-on must allow the Test Net DCL or commissioning will discover
the device, perform PASE, and then reject attestation.

In Home Assistant, open **Settings -> Add-ons -> Matter Server -> Configuration**
and enable:

```yaml
enable_test_net_dcl: true
```

Restart the Matter Server add-on, then retry pairing. The Matter Server log
signature for this issue is:

```text
Device uses a test/development certificate. Enable the "Test Net DCL" option
```

## WebRTC Media Path

The sidecar maps Matter `WebRtcTransportProvider.ProvideOffer` to the configured
WHEP endpoint:

```text
Matter controller SDP offer
  -> matter-sidecar WebRtcTransportProvider
  -> media-webrtc /camera/whep
  -> RTSP camera source
```

With the `media` profile enabled, Compose sets `MEDIA_WHEP_BASE_URL` to the
internal relay URL, `http://media-webrtc:8889`. The first-party WHEP relay
source URL is `CAMERA_MEDIA_SOURCE` in `.env`.

The dashboard's **Matter Activity** panel counts camera cluster command handlers
per camera. After pairing, zero commands means the controller has not touched
the camera endpoint yet. When a controller actually opens video, the
`WebRtcTransportProvider.solicitOffer` and `WebRtcTransportProvider.provideOffer`
counters should increase, and active WebRTC sessions should briefly show the
open media path.

Live verification of `media-webrtc` requires running the local WHEP relay
container with the real camera RTSP credentials from `.env`.
