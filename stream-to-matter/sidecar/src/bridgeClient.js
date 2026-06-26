export class BridgeClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async health() {
    return this.#json("/health");
  }

  async manifest() {
    return this.#json("/matter/manifest");
  }

  async probe(cameraId) {
    return this.#json(`/cameras/${cameraId}/probe`);
  }

  async reloadConfig() {
    return this.#json("/config/reload", { method: "POST" });
  }

  async ptzDirection(cameraId, direction, speed = 0.2) {
    return this.#json(`/cameras/${cameraId}/ptz/direction/${direction}?speed=${speed}`, { method: "POST" });
  }

  async ptzStop(cameraId) {
    return this.#json(`/cameras/${cameraId}/ptz/stop`, { method: "POST" });
  }

  async ptzStatus(cameraId) {
    return this.#json(`/cameras/${cameraId}/ptz/status`);
  }

  async ptzAbsolute(cameraId, pan = 0, tilt = 0, zoom = 0) {
    return this.#json(`/cameras/${cameraId}/ptz/absolute?pan=${pan}&tilt=${tilt}&zoom=${zoom}`, { method: "POST" });
  }

  async ptzRelative(cameraId, pan = 0, tilt = 0, zoom = 0) {
    return this.#json(`/cameras/${cameraId}/ptz/relative?pan=${pan}&tilt=${tilt}&zoom=${zoom}`, { method: "POST" });
  }

  async startRelay(cameraId, profile, format) {
    return this.#json(`/cameras/${cameraId}/streams/${profile}/${format}`, { method: "POST" });
  }

  async stopRelay(cameraId, profile, format) {
    return this.#json(`/cameras/${cameraId}/streams/${profile}/${format}/stop`, { method: "POST" });
  }

  async snapshot(cameraId) {
    return this.#json(`/cameras/${cameraId}/snapshot.jpg`);
  }

  async snapshotBytes(cameraId, imageCodec = "jpeg", options = {}) {
    const suffix = imageCodec === "heic" ? "heic" : "jpg";
    const query = snapshotQuery(options);
    return this.#bytes(`/cameras/${cameraId}/snapshot-data.${suffix}${query}`);
  }

  async zones(cameraId, zoneType) {
    return this.#json(`/cameras/${cameraId}/zones/${zoneType}`);
  }

  async upsertZone(cameraId, zoneType, zone) {
    return this.#json(`/cameras/${cameraId}/zones/${zoneType}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(zone)
    });
  }

  async deleteZone(cameraId, zoneType, zoneId) {
    return this.#json(`/cameras/${cameraId}/zones/${zoneType}/${encodeURIComponent(zoneId)}`, { method: "DELETE" });
  }

  async upsertDetectionZone(cameraId, zone) {
    return this.upsertZone(cameraId, "detection", zone);
  }

  async #json(path, init = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    if (!response.ok) {
      const error = new Error(`Bridge request failed: ${response.status}`);
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async #bytes(path, init = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok) {
      const error = new Error(`Bridge request failed: ${response.status}`);
      error.status = response.status;
      error.payload = parsePayload(Buffer.from(bytes).toString("utf8"));
      throw error;
    }
    return bytes;
  }
}

function snapshotQuery(options = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function parsePayload(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}
