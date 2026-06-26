#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH=/data/options.json
CAMERA_CONFIG=/data/cameras.json
MATTER_CREDENTIALS=/data/matter-credentials.json
MATTER_RESET_REQUEST=/data/matter-reset-request.json
MATTER_STORAGE_ROOT=/data/matter
MATTER_STORAGE_DIR="${MATTER_STORAGE_ROOT}/node0"
DEFAULT_MATTER_PASSCODE=20202021
DEFAULT_MATTER_DISCRIMINATOR=3840

log() {
  echo "[stream-to-matter] $*"
}

json_get() {
  python3 - "$1" "$2" <<'PY'
import json
import sys

path, key = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as handle:
    data = json.load(handle)
value = data.get(key, "")
print(value)
PY
}

export MATTER_PASSCODE="$(json_get "${CONFIG_PATH}" matter_passcode)"
export MATTER_DISCRIMINATOR="$(json_get "${CONFIG_PATH}" matter_discriminator)"
export MATTER_PORT="$(json_get "${CONFIG_PATH}" matter_port)"
export MATTER_TCP="$(json_get "${CONFIG_PATH}" matter_tcp)"
export MATTER_LISTENING_ADDRESS_IPV4="$(json_get "${CONFIG_PATH}" matter_listen_ipv4)"
export MATTER_MDNS_INTERFACE="$(json_get "${CONFIG_PATH}" matter_mdns_interface)"
export MATTER_MDNS_IPV6="$(json_get "${CONFIG_PATH}" matter_mdns_ipv6)"
export MATTER_PRODUCT_NAME="$(json_get "${CONFIG_PATH}" product_name)"
export MATTER_NODE_LABEL="${MATTER_PRODUCT_NAME}"
export MATTER_LOG_LEVEL="$(json_get "${CONFIG_PATH}" matter_log_level)"
export STATUS_HEARTBEAT_SECONDS="$(json_get "${CONFIG_PATH}" status_heartbeat_seconds)"
export MATTER_PATH_ROOT="${MATTER_PATH_ROOT:-${MATTER_STORAGE_ROOT}}"
export MATTER_STORAGE_NODE_DIR="${MATTER_STORAGE_NODE_DIR:-${MATTER_STORAGE_DIR}}"

if [[ -z "${MATTER_LOG_LEVEL}" ]]; then
  export MATTER_LOG_LEVEL=notice
fi

if [[ -z "${MATTER_PORT}" ]]; then
  export MATTER_PORT=5540
fi

if [[ "${MATTER_TCP}" != "true" ]]; then
  log "Enabling Matter TCP. Home Assistant Matter Server uses TCP for camera WebRTC and snapshot command paths."
  export MATTER_TCP=true
fi

if [[ -n "${MATTER_LISTENING_ADDRESS_IPV4}" ]]; then
  log "Binding Matter IPv4 listener/advertisement to ${MATTER_LISTENING_ADDRESS_IPV4}"
fi

if [[ -z "${MATTER_MDNS_IPV6}" ]]; then
  export MATTER_MDNS_IPV6=false
fi

if [[ -n "${MATTER_MDNS_INTERFACE}" ]]; then
  log "Limiting Matter mDNS to interface ${MATTER_MDNS_INTERFACE}"
fi

if [[ -z "${STATUS_HEARTBEAT_SECONDS}" ]]; then
  export STATUS_HEARTBEAT_SECONDS=60
fi

if [[ -f "${MATTER_RESET_REQUEST}" ]]; then
  log "Applying pending Matter identity reset"
  rm -rf "${MATTER_STORAGE_ROOT}"
fi

eval "$(
python3 - "${MATTER_CREDENTIALS}" "${MATTER_RESET_REQUEST}" "${MATTER_PASSCODE}" "${MATTER_DISCRIMINATOR}" "${DEFAULT_MATTER_PASSCODE}" "${DEFAULT_MATTER_DISCRIMINATOR}" <<'PY'
import json
import random
import secrets
import shlex
import sys
import uuid
from pathlib import Path

path = Path(sys.argv[1])
reset_path = Path(sys.argv[2])
override_passcode = sys.argv[3].strip()
override_discriminator = sys.argv[4].strip()
default_passcode = sys.argv[5].strip()
default_discriminator = sys.argv[6].strip()

def valid_passcode(value: str) -> bool:
    try:
        number = int(value)
    except ValueError:
        return False
    return 1 <= number <= 99999998 and number not in {
        11111111, 22222222, 33333333, 44444444, 55555555,
        66666666, 77777777, 88888888, 99999999, 12345678, 87654321,
    }

def valid_discriminator(value: str) -> bool:
    try:
        number = int(value)
    except ValueError:
        return False
    return 0 <= number <= 4095

def generated_payload(source: str, reset_id: str | None = None) -> dict[str, object]:
    passcode = random.randint(10000000, 99999998)
    while not valid_passcode(str(passcode)):
        passcode = random.randint(10000000, 99999998)
    payload = {
        "passcode": passcode,
        "discriminator": random.randint(0, 4095),
        "source": source,
        "identity_id": secrets.token_hex(6),
        "generated_at": __import__("datetime").datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }
    if reset_id:
        payload["reset_id"] = reset_id
    return payload

if valid_passcode(override_passcode) and valid_discriminator(override_discriminator):
    payload = {
        "passcode": int(override_passcode),
        "discriminator": int(override_discriminator),
        "source": "advanced_override",
    }
    reset_path.unlink(missing_ok=True)
else:
    reset_payload = None
    if reset_path.exists():
        try:
            reset_payload = json.loads(reset_path.read_text(encoding="utf-8"))
        except Exception:
            reset_payload = {"id": str(uuid.uuid4())}
        payload = generated_payload("rotated_reset", str(reset_payload.get("id", uuid.uuid4())))
        reset_path.unlink(missing_ok=True)
    elif path.exists():
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            payload = generated_payload("generated_recovered")
    else:
        payload = {
            "passcode": int(default_passcode),
            "discriminator": int(default_discriminator),
            "source": "default_static",
        }

path.parent.mkdir(parents=True, exist_ok=True)
with path.open("w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")

print(f"export MATTER_PASSCODE={shlex.quote(str(payload['passcode']))}")
print(f"export MATTER_DISCRIMINATOR={shlex.quote(str(payload['discriminator']))}")
print(f"export MATTER_CREDENTIAL_SOURCE={shlex.quote(str(payload.get('source', 'generated')))}")
if payload.get("identity_id"):
    print(f"export MATTER_SERIAL_NUMBER={shlex.quote('stm-' + str(payload['identity_id'])[:12])}")
PY
)"
log "Matter commissioning credentials source: ${MATTER_CREDENTIAL_SOURCE}"

mkdir -p /data/snapshots /data/relay "${MATTER_STORAGE_ROOT}"

log "Starting Home Assistant add-on"
log "Camera registry: ${CAMERA_CONFIG}"
if [[ ! -f "${CAMERA_CONFIG}" ]]; then
  log "Creating initial placeholder camera registry. Configure cameras from the Web UI."

  python3 - "${CAMERA_CONFIG}" <<'PY'
import json
import sys

path = sys.argv[1]
payload = {
    "cameras": [
        {
            "id": "stream_to_matter_camera",
            "name": "Stream to Matter Camera",
            "rtsp_url": "rtsp://user:password@camera-ip:554/av_stream/ch0",
            "media_source": "",
            "onvif": {
                "host": "camera-ip",
                "port": 80,
                "user": "user",
                "password": "",
            },
            "matter": {
                "device_type": "camera",
                "standard": "Matter 1.5.1",
                "advertise_ptz": True,
                "advertise_audio": True,
                "advertise_two_way_audio": False,
                "advertise_recording": False,
            },
        }
    ]
}

with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
PY
else
  log "Using existing camera registry. Edit it from the Web UI."
fi

export CAMERA_IDS="$(python3 - "${CAMERA_CONFIG}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    data = json.load(handle)
print(",".join(str(camera["id"]) for camera in data.get("cameras", []) if camera.get("id")))
PY
)"
export CAMERA_ID="${CAMERA_IDS%%,*}"
log "Configured camera ids: ${CAMERA_IDS}"

cleanup() {
  trap - TERM INT
  jobs -p | xargs -r kill
  wait || true
}
trap cleanup TERM INT

log "Launching bridge on http://0.0.0.0:8080"
python3 -m stream_to_matter.server &
bridge_pid=$!

log "Launching WHEP relay on http://0.0.0.0:8889"
python3 /app/media/whep_relay.py &
whep_pid=$!

log "Waiting for bridge health"
bridge_ready=0
for _ in $(seq 1 30); do
  if python3 - <<'PY'
import sys
import urllib.request

try:
    urllib.request.urlopen("http://127.0.0.1:8080/health", timeout=1).read()
except Exception:
    sys.exit(1)
PY
  then
    bridge_ready=1
    break
  fi
  sleep 1
done
if [[ "${bridge_ready}" == "1" ]]; then
  log "Bridge health is ready"
else
  log "Bridge did not answer /health within 30 seconds; starting sidecar so /status can report details"
fi

log "Waiting for bridge Matter manifest"
manifest_ready=0
for _ in $(seq 1 30); do
  if python3 - <<'PY'
import json
import sys
import urllib.request

try:
    payload = urllib.request.urlopen("http://127.0.0.1:8080/matter/manifest", timeout=1).read()
    manifest = json.loads(payload)
    if isinstance(manifest, list) and len(manifest) > 0:
        sys.exit(0)
except Exception:
    pass
sys.exit(1)
PY
  then
    manifest_ready=1
    break
  fi
  sleep 1
done
if [[ "${manifest_ready}" == "1" ]]; then
  log "Bridge Matter manifest is ready"
else
  log "Bridge Matter manifest did not become ready within 30 seconds; sidecar will report the startup error"
fi

cd /app/sidecar
log "Launching Matter sidecar on http://0.0.0.0:8090"
npm start &
sidecar_pid=$!

log "Startup complete. Use /status for diagnostics and /matter/onboarding for pairing."
wait -n "${bridge_pid}" "${whep_pid}" "${sidecar_pid}"
log "A child process exited; shutting down add-on"
cleanup
