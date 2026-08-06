FROM node:22-bookworm-slim

ARG BUILD_VERSION=0.1.38
ARG BUILD_ARCH=amd64

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    libheif-examples \
    python3 \
    python3-pip \
    python3-venv \
  && rm -rf /var/lib/apt/lists/*

ARG GO2RTC_VERSION=1.9.14
RUN set -eu; \
  arch="$(dpkg --print-architecture)"; \
  case "${arch}" in \
    amd64) asset="go2rtc_linux_amd64" ;; \
    arm64) asset="go2rtc_linux_arm64" ;; \
    armhf|armel) asset="go2rtc_linux_arm" ;; \
    *) echo "Unsupported go2rtc architecture: ${arch}" >&2; exit 1 ;; \
  esac; \
  curl -fsSL "https://github.com/AlexxIT/go2rtc/releases/download/v${GO2RTC_VERSION}/${asset}" -o /usr/local/bin/go2rtc; \
  chmod a+x /usr/local/bin/go2rtc

WORKDIR /app

COPY media/requirements.txt ./media/requirements.txt
COPY sidecar/package.json sidecar/package-lock.json ./sidecar/

RUN python3 -m venv /opt/stream-to-matter \
  && /opt/stream-to-matter/bin/python -m pip install --no-cache-dir -r /app/media/requirements.txt

RUN cd /app/sidecar \
  && npm install --omit=dev --no-audit --no-fund

COPY src ./src
COPY config ./config
COPY media ./media
COPY sidecar ./sidecar
COPY run.sh /run.sh

RUN chmod a+x /run.sh

ENV PATH="/opt/stream-to-matter/bin:${PATH}" \
  PYTHONUNBUFFERED=1 \
  PYTHONPATH=/app/src \
  STREAM_TO_MATTER_HOST=0.0.0.0 \
  STREAM_TO_MATTER_PORT=8080 \
  STREAM_TO_MATTER_CONFIG=/data/cameras.json \
  STREAM_TO_MATTER_SNAPSHOT_DIR=/data/snapshots \
  STREAM_TO_MATTER_RELAY_DIR=/data/relay \
  MATTER_SIDECAR_PORT=8090 \
  BRIDGE_URL=http://127.0.0.1:8080 \
  MEDIA_WHEP_BASE_URL=http://127.0.0.1:8889 \
  WHEP_RELAY_HOST=0.0.0.0 \
  WHEP_RELAY_PORT=8889 \
  MATTER_PATH_ROOT=/data/matter \
  MATTER_STORAGE_NODE_DIR=/data/matter/node0 \
  MATTER_PORT=5540

EXPOSE 8080 8090 8889 5540/tcp 5540/udp 18555/tcp 18555/udp

CMD ["/run.sh"]
