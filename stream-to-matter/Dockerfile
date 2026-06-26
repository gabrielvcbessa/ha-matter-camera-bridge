FROM node:22-bookworm-slim

ARG BUILD_VERSION=0.1.34
ARG BUILD_ARCH=amd64

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    libheif-examples \
    python3 \
    python3-pip \
    python3-venv \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY src ./src
COPY config ./config
COPY media ./media
COPY sidecar ./sidecar
COPY run.sh /run.sh

RUN python3 -m venv /opt/stream-to-matter \
  && /opt/stream-to-matter/bin/python -m pip install --no-cache-dir -r /app/media/requirements.txt

RUN cd /app/sidecar \
  && npm install --omit=dev --no-audit --no-fund

RUN chmod a+x /run.sh

ENV PATH="/opt/stream-to-matter/bin:${PATH}"
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src
ENV STREAM_TO_MATTER_HOST=0.0.0.0
ENV STREAM_TO_MATTER_PORT=8080
ENV STREAM_TO_MATTER_CONFIG=/data/cameras.json
ENV STREAM_TO_MATTER_SNAPSHOT_DIR=/data/snapshots
ENV STREAM_TO_MATTER_RELAY_DIR=/data/relay
ENV MATTER_SIDECAR_PORT=8090
ENV BRIDGE_URL=http://127.0.0.1:8080
ENV MEDIA_WHEP_BASE_URL=http://127.0.0.1:8889
ENV WHEP_RELAY_HOST=0.0.0.0
ENV WHEP_RELAY_PORT=8889
ENV MATTER_PATH_ROOT=/data/matter
ENV MATTER_STORAGE_NODE_DIR=/data/matter/node0
ENV MATTER_PORT=5540

EXPOSE 8080 8090 8889 5540/tcp 5540/udp

CMD ["/run.sh"]
