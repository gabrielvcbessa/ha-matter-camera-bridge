FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libheif-examples libheif-plugin-x265 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY src ./src
COPY config ./config

ENV PYTHONPATH=/app/src
ENV STREAM_TO_MATTER_CONFIG=/app/config/cameras.json
ENV STREAM_TO_MATTER_HOST=0.0.0.0
ENV STREAM_TO_MATTER_PORT=8080

EXPOSE 8080
CMD ["python", "-m", "stream_to_matter.server"]
