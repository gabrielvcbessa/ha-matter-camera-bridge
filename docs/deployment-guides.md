# Deployment Guides

Home Assistant add-on is the primary deployment path. Proxmox is the secondary
path for cases where you want to run the bridge outside Home Assistant or need
more control over Docker networking.

## Option A: Home Assistant Add-on

Use this when your Home Assistant installation supports add-ons, such as Home
Assistant OS or Home Assistant Supervised.

### Install From GitHub URL

1. Push this repository to GitHub.
2. In Home Assistant, open **Settings > Add-ons > Add-on Store**.
3. Open the menu and choose **Repositories**.
4. Add the GitHub URL for this repository.
5. Install **Stream to Matter Parser**.

The add-on package lives in `stream-to-matter/` at the repository root. Home
Assistant reads `stream-to-matter/config.yaml`, builds the add-on locally from
the repository Dockerfile, and starts one container that runs:

- the Python RTSP/ONVIF bridge on port `8080`
- the Node matter.js sidecar on port `8090`
- the Python WHEP media relay on port `8889`

The add-on uses host networking so Matter mDNS and UDP traffic can reach Matter
controllers on the LAN.

The first install can take several minutes because Home Assistant builds the
container locally. If it fails, open the add-on install log in Home Assistant;
the useful lines are usually the package install or Docker build error.

### Configure

The Home Assistant **Configuration** tab only contains global add-on settings.
Do not configure camera RTSP, ONVIF, or media source values there; those live in
the add-on **Web UI** so multiple cameras can be managed without fighting the
Supervisor options form.

Global add-on options:

```yaml
matter_passcode: ""
matter_discriminator: ""
matter_port: 5540
matter_tcp: true
matter_listen_ipv4: "192.168.68.110"
matter_mdns_interface: "enp1s0"
matter_mdns_ipv6: false
product_name: Stream to Matter Camera Bridge
matter_log_level: warn
status_heartbeat_seconds: 60
```

Leave `matter_passcode` and `matter_discriminator` blank for normal use. Blank
uses the known development defaults that pair reliably in local testing:
passcode `20202021` and discriminator `3840`. Fill those fields only when you
intentionally want an advanced development override.

Keep `matter_tcp` enabled. Home Assistant's matter.js Matter Server can deliver
small camera commands over UDP, but the WebRTC provider command used for live
view is large and follows the operational TCP path. When TCP is disabled, the
camera may still show video allocation events while live view and snapshots fail
with `Operation aborted` or `peer-unreachable`.

Set `matter_listen_ipv4` to the Home Assistant host IP address, not the camera
IP and not `homeassistant.local`. On the tested production network that is
`192.168.68.110`. This gives Home Assistant Matter Server a stable operational
address after add-on restarts.

Keep `matter_mdns_ipv6` disabled on Home Assistant OS unless you know the host's
IPv6 link-local route is stable. The Home Assistant Matter Server prefers
link-local IPv6 over IPv4 when both are advertised; if it selects an unreachable
`fe80::...:5540` address, live view hangs after `VideoStreamAllocate` and then
aborts.

Set `matter_mdns_interface` to the Home Assistant network interface that owns
`matter_listen_ipv4`. This is often `enp1s0`, `eth0`, or `end0`.

To find both values from the Home Assistant Terminal/SSH add-on:

```bash
ip route get 1.1.1.1
```

Use the `src` value as `matter_listen_ipv4` and the `dev` value as
`matter_mdns_interface`. Example output:

```text
1.1.1.1 via 192.168.68.1 dev enp1s0 src 192.168.68.110 uid 0
```

That maps to:

```yaml
matter_listen_ipv4: "192.168.68.110"
matter_mdns_interface: "enp1s0"
matter_mdns_ipv6: false
```

You can also find the interface in the Home Assistant Matter Server logs. If
the log shows a failed connection like
`tcp://[fe80::...%enp1s0]:5540`, the value after `%` is the interface name.

After changing these options, restart the add-on. If the bridge was already
paired before these values were fixed, remove it from the Open Home Foundation
Matter Server, use the Web UI danger action to rotate/reset the Matter identity,
restart the add-on, and pair again. This makes the controller forget any cached
bad operational address.

After starting the add-on, open **Web UI** and edit the camera card. `rtsp_url`
is the camera stream the dashboard probes for video and snapshots.
For the tested camera at `192.168.68.59`, `rtsp://192.168.68.59:554/av_stream`
returned `454 Session Not Found`, while `/av_stream/ch0` was the valid path but
required authentication. Use the credentialed `/av_stream/ch0` URL.

```text
rtsp://rtsp:your-password@192.168.68.59:554/av_stream/ch0
```

If copying from Frigate or go2rtc, paste only the plain camera RTSP URL. Remove
stream modifiers such as `#tcp#video=copy#audio=copy`; the bridge already uses
RTSP-over-TCP internally.

Leave `media_source` blank unless the WebRTC/WHEP relay needs a different RTSP
source than `rtsp_url`.

### Start

Start the add-on from Home Assistant.
Use **Open Web UI** to manage cameras, view health, and copy the Matter pairing
code. Camera edits are saved to the add-on registry and take effect after an
add-on restart.

Use **Load Snapshot** in the Web UI to verify the actual camera image. It grabs
one RTSP frame on demand instead of autoplaying a live stream, because many
cameras have low RTSP session limits and a continuous dashboard preview can
compete with the Matter/WebRTC stream.

### Verify

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
- WHEP health returns `configuredSources` with the camera stream source
- `/api/logs` includes `matter.node_started` with `network.tcp: true`,
  `listen.listeningAddressIpv4` set to the Home Assistant IP, and
  `mdns.ipv6: false`

### Pair With Matter

Open the add-on Web UI and use the manual pairing code or QR payload shown in
the Matter Pairing panel.

If pairing discovery fails, check that Home Assistant and the Matter controller
are on the same LAN/VLAN and that multicast/mDNS is not blocked.

### Validate Camera Controls

Run checks one at a time. Some cameras reject simultaneous RTSP opens.

```bash
curl -X POST "http://HOME_ASSISTANT_IP:8090/camera/camera/ptz/left?speed=0.2"
curl -X POST "http://HOME_ASSISTANT_IP:8090/camera/camera/ptz/right?speed=0.2"
curl -X POST "http://HOME_ASSISTANT_IP:8090/camera/camera/ptz/up?speed=0.2"
curl -X POST "http://HOME_ASSISTANT_IP:8090/camera/camera/ptz/down?speed=0.2"
```

## Option B: Proxmox

Use this when you want a normal Docker deployment in a Debian or Ubuntu VM.
This is also the easier path for deep debugging.

### VM Shape

Use a VM on the same LAN/VLAN as the camera and the Matter controller. Prefer a
VM over an unprivileged LXC because Docker host networking, mDNS, and UDP Matter
traffic are more predictable in a full Linux VM.

### Install Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker compose version
```

### Configure

```bash
git clone https://github.com/gabrielvcbessa/ha-matter-camera-bridge.git
cd ha-matter-camera-bridge
cp .env.example .env
nano .env
```

Set:

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

### Start

```bash
docker compose -f docker-compose.proxmox.yml --profile media up -d --build
```

### Verify

```bash
docker compose -f docker-compose.proxmox.yml --profile media ps
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8090/health
curl http://127.0.0.1:8889/health
curl http://127.0.0.1:8090/matter/onboarding
```

### Live Acceptance

Run these sequentially, not in parallel:

```bash
docker compose -f docker-compose.proxmox.yml --profile media run --rm \
  -e CAMERA_ID=stream_to_matter_camera \
  matter-sidecar npm run whep:check

python3 scripts/acceptance_check.py --require-whep --move-ptz
```

### Update

```bash
git pull
docker compose -f docker-compose.proxmox.yml --profile media up -d --build --force-recreate
```
