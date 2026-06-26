# Native Home Assistant Integration Proposal

This repository now includes a proposal custom integration under
`custom_components/stream_to_matter/`. It is separate from the Matter bridge.
The add-on can still expose Matter camera endpoints, while this integration
creates normal Home Assistant entities from the same add-on APIs.

## What It Creates

For each camera configured in the add-on Web UI, Home Assistant creates one
device with:

- one `camera` entity
- PTZ direction buttons:
  - pan up, down, left, right
  - pan diagonals
  - zoom in and zoom out
- binary sensors for:
  - probe status
  - video detected
  - audio detected
  - Matter endpoint attached

The camera entity uses:

- `/api/cameras/{camera_id}/snapshot.jpg` through the sidecar for snapshots
- the add-on WHEP relay for native Home Assistant WebRTC live view
- sidecar PTZ proxy endpoints for movement buttons

This avoids waiting for Home Assistant Core's Matter integration to expose
Matter Camera endpoints as native HA `camera` entities.

## Install For Local Validation

Copy or symlink the integration folder into Home Assistant:

```bash
mkdir -p /config/custom_components
cp -R custom_components/stream_to_matter /config/custom_components/
```

Restart Home Assistant.

Then add it from **Settings > Devices & services > Add integration** and search
for **Stream to Matter Camera Bridge**.

## Configure URLs

Point the integration at the running add-on:

```yaml
sidecar_url: http://HOME_ASSISTANT_IP:8090
bridge_url: http://HOME_ASSISTANT_IP:8080
whep_url: http://HOME_ASSISTANT_IP:8889
```

If Home Assistant Core can reach the add-on through localhost, these can also
be:

```yaml
sidecar_url: http://127.0.0.1:8090
bridge_url: http://127.0.0.1:8080
whep_url: http://127.0.0.1:8889
```

Use the Home Assistant host IP if unsure.

## Expected Validation

After setup:

1. Open the device created for each camera.
2. Click the camera entity. A still image should load from the add-on snapshot
   proxy.
3. Start live view. Home Assistant should use the integration's native WebRTC
   hook and the add-on WHEP relay.
4. Press each PTZ button and verify the camera moves.
5. Check the add-on Web UI or `/api/logs`; live view should create WHEP relay
   activity, and PTZ should log `direction_requested`.

For local development, the entity classes can also be smoke-tested inside a
Home Assistant container without logging into the UI:

```bash
docker cp tests/ha_entity_smoke.py HOME_ASSISTANT_CONTAINER:/tmp/ha_entity_smoke.py
docker exec -e PYTHONPATH=/config HOME_ASSISTANT_CONTAINER python /tmp/ha_entity_smoke.py
```

Expected output:

```text
ha_entity_smoke ok
```

That smoke test proves the custom integration can create a camera entity, map it
to one Home Assistant device name, request snapshot bytes, expose a status
sensor, and call a PTZ button.

The stronger HTTP smoke test starts a tiny local sidecar/WHEP-compatible server
inside the Home Assistant container, then uses the real integration client and
HA camera entity against it:

```bash
docker cp tests/ha_native_http_smoke.py HOME_ASSISTANT_CONTAINER:/tmp/ha_native_http_smoke.py
docker exec -e PYTHONPATH=/config HOME_ASSISTANT_CONTAINER python /tmp/ha_native_http_smoke.py
```

Expected output:

```text
ha_native_http_smoke ok
```

That stronger smoke test proves the native entities can fetch snapshots, send
PTZ commands, negotiate a WebRTC offer with the WHEP endpoint, forward ICE
candidates, and close the live-view session. The browser UI live-view test still
requires the add-on WHEP URL to be reachable and the camera RTSP/ONVIF path to
be online.

For the most realistic local validation without a physical camera, run the lab
with a synthetic RTSP stream plus the tiny ONVIF fixture in
`tests/lab_onvif_fixture.py`, then execute:

```bash
docker cp tests/ha_native_lab_smoke.py HOME_ASSISTANT_CONTAINER:/tmp/ha_native_lab_smoke.py
docker exec \
  -e PYTHONPATH=/config \
  -e CAMERA_ID=matter_fp2_lab \
  -e SIDECAR_URL=http://127.0.0.1:8090 \
  -e BRIDGE_URL=http://127.0.0.1:8080 \
  -e WHEP_URL=http://127.0.0.1:8889 \
  -e WHEP_OFFER_B64="$VALID_WEBRTC_OFFER_BASE64" \
  HOME_ASSISTANT_CONTAINER \
  python /tmp/ha_native_lab_smoke.py
```

Expected output:

```text
ha_native_lab_smoke ok
```

That lab smoke test uses the real add-on sidecar, bridge, and WHEP relay. It
proves the native HA camera entity can read a JPEG from the bridge, send a PTZ
button action through the sidecar into ONVIF, and receive a real SDP answer from
the WHEP live-view path.

For a stricter live-view proof, run the WHEP checker against the same lab
camera:

```bash
cd sidecar
MEDIA_WHEP_BASE_URL=http://127.0.0.1:8889 \
CAMERA_ID=matter_fp2_lab \
WHEP_CHECK_TIMEOUT_MS=15000 \
npm run whep:check
```

Expected output includes `ok: true` and non-zero `media.videoPackets`. This
confirms the relay is sending actual video RTP packets, not only accepting a
WebRTC offer.

## Current Scope

This is a local proposal, not merged into Home Assistant Core. It creates native
Home Assistant entities in addition to the Matter bridge. The Matter bridge is
still responsible for Matter controllers; the custom integration is for the
Home Assistant UI and automations.
