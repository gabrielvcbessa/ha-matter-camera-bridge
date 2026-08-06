#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/compose.local-matter.yml"
LAB_DIR="${ROOT_DIR}/.local-matter-lab"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose -f "${COMPOSE_FILE}")
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose -f "${COMPOSE_FILE}")
else
  echo "Docker Compose is required." >&2
  exit 1
fi

if [[ -z "${MATTER_SERVER_IMAGE:-}" ]]; then
  case "$(uname -m)" in
    arm64|aarch64) export MATTER_SERVER_IMAGE=homeassistant/aarch64-addon-matter-server:9.1.1 ;;
    x86_64|amd64) export MATTER_SERVER_IMAGE=homeassistant/amd64-addon-matter-server:9.1.1 ;;
    *) echo "Set MATTER_SERVER_IMAGE for architecture $(uname -m)." >&2; exit 1 ;;
  esac
fi

prepare() {
  mkdir -p "${LAB_DIR}/bridge" "${LAB_DIR}/matter-server"
  cp "${ROOT_DIR}/tests/fixtures/local-matter-options.json" "${LAB_DIR}/bridge/options.json"
  cp "${ROOT_DIR}/tests/fixtures/local-matter-cameras.json" "${LAB_DIR}/bridge/cameras.json"
}

wait_for_url() {
  local url="$1"
  local name="$2"
  for _ in $(seq 1 90); do
    if curl --fail --silent --show-error "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for ${name}: ${url}" >&2
  return 1
}

wait_for_sidecar_ready() {
  for _ in $(seq 1 120); do
    if python3 - <<'PY' >/dev/null 2>&1
import json
import urllib.request

with urllib.request.urlopen("http://127.0.0.1:18090/health", timeout=5) as response:
    payload = json.load(response)
assert payload.get("ok") is True
assert payload.get("matterNodeStarted") is True
assert payload.get("cameraEndpointsAttached") == payload.get("cameraEndpointsExpected")
PY
    then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for the Matter sidecar and camera endpoints." >&2
  return 1
}

up() {
  prepare
  if [[ -z "${WHEP_ADVERTISE_IP:-}" && "$(uname -s)" == "Darwin" ]]; then
    export WHEP_ADVERTISE_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
  fi
  "${COMPOSE[@]}" up -d --build --force-recreate
  wait_for_url http://127.0.0.1:18080/health bridge
  wait_for_sidecar_ready
  wait_for_url http://127.0.0.1:18889/health media-relay
  echo "Local Matter camera lab is ready."
}

validate() {
  wait_for_url http://127.0.0.1:18080/health bridge
  wait_for_sidecar_ready
  wait_for_url http://127.0.0.1:18889/health media-relay

  python3 - <<'PY'
import json
import time
import urllib.request

checks = {
    "bridge": "http://127.0.0.1:18080/health",
    "sidecar": "http://127.0.0.1:18090/api/status",
    "media": "http://127.0.0.1:18889/health",
    "probe": "http://127.0.0.1:18080/cameras/lab_camera/probe",
    "ptz": "http://127.0.0.1:18080/cameras/lab_camera/ptz/status",
    "probe_two": "http://127.0.0.1:18080/cameras/lab_camera_two/probe",
    "ptz_two": "http://127.0.0.1:18080/cameras/lab_camera_two/ptz/status",
}
payloads = {}
for name, url in checks.items():
    for attempt in range(60):
        with urllib.request.urlopen(url, timeout=20) as response:
            payloads[name] = json.load(response)
        if not name.startswith("probe") or payloads[name].get("ok"):
            break
        time.sleep(1)

status = payloads["sidecar"]
matter = status.get("commissioning", {})
camera = matter.get("cameraEndpoints", {}).get("lab_camera", {})
camera_two = matter.get("cameraEndpoints", {}).get("lab_camera_two", {})
assert matter.get("started"), matter
assert camera.get("attached"), camera
assert camera_two.get("attached"), camera_two
assert payloads["probe"].get("ok"), payloads["probe"]
assert payloads["probe_two"].get("ok"), payloads["probe_two"]
assert payloads["ptz"].get("ok"), payloads["ptz"]
assert payloads["ptz_two"].get("ok"), payloads["ptz_two"]
print(json.dumps({
    "bridge_ok": payloads["bridge"].get("ok"),
    "matter_node_started": matter.get("started"),
    "camera_endpoint_attached": camera.get("attached"),
    "second_camera_endpoint_attached": camera_two.get("attached"),
    "rtsp_probe_ok": payloads["probe"].get("ok"),
    "second_rtsp_probe_ok": payloads["probe_two"].get("ok"),
    "ptz_fixture_ok": payloads["ptz"].get("ok"),
    "second_ptz_fixture_ok": payloads["ptz_two"].get("ok"),
}, indent=2))
PY

  local pairing_code
  pairing_code="$(python3 -c 'import json,urllib.request; print(json.load(urllib.request.urlopen("http://127.0.0.1:18090/api/status"))["commissioning"]["manualPairingCode"])')"
  docker build -f "${ROOT_DIR}/tests/matter-client.Dockerfile" -t stm-matter-client "${ROOT_DIR}"
  docker run --rm --network host \
    -e MATTER_SERVER_URL=ws://127.0.0.1:15580/ws \
    -e MATTER_PAIRING_CODE="${pairing_code}" \
    -v "${ROOT_DIR}/scripts/matter_server_smoke.py:/tmp/matter_server_smoke.py:ro" \
    stm-matter-client \
    python /tmp/matter_server_smoke.py

  docker exec stm-local-bridge sh -lc \
    'cd /app/sidecar && MEDIA_WHEP_BASE_URL=http://127.0.0.1:18889 CAMERA_ID=lab_camera WHEP_CHECK_TIMEOUT_MS=15000 npm run whep:check'
  docker exec stm-local-bridge sh -lc \
    'cd /app/sidecar && MEDIA_WHEP_BASE_URL=http://127.0.0.1:18889 CAMERA_ID=lab_camera_two WHEP_CHECK_TIMEOUT_MS=15000 npm run whep:check'
}

case "${1:-up}" in
  up) up ;;
  validate) validate ;;
  test) up; validate ;;
  logs) "${COMPOSE[@]}" logs -f --tail=120 ;;
  down) "${COMPOSE[@]}" down ;;
  reset) "${COMPOSE[@]}" down; rm -rf "${LAB_DIR}" ;;
  *) echo "Usage: $0 {up|validate|test|logs|down|reset}" >&2; exit 2 ;;
esac
