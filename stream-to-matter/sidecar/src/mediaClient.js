export class MediaClient {
  constructor(baseUrl = "", requestTimeoutMs = Number(process.env.MEDIA_REQUEST_TIMEOUT_MS ?? 15_000)) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.requestTimeoutMs = positiveTimeout(requestTimeoutMs);
  }

  configured() {
    return this.baseUrl.length > 0;
  }

  async whepOffer(cameraId, sdpOffer) {
    if (!this.configured()) {
      throw new Error("MEDIA_WHEP_BASE_URL is not configured");
    }
    const response = await this.#fetch(`${this.baseUrl}/${encodeURIComponent(cameraId)}/whep`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: sdpOffer
    }, timeoutFromEnv("MEDIA_WHEP_OFFER_TIMEOUT_MS", 45_000));
    const sdpAnswer = await response.text();
    if (!response.ok) {
      const error = new Error(`WHEP request failed: ${response.status}`);
      error.payload = { raw: sdpAnswer };
      throw error;
    }
    return {
      sdp: sdpAnswer,
      location: response.headers.get("location"),
      etag: response.headers.get("etag")
    };
  }

  async prewarm(cameraId) {
    if (!this.configured()) {
      throw new Error("MEDIA_WHEP_BASE_URL is not configured");
    }
    const response = await this.#fetch(`${this.baseUrl}/${encodeURIComponent(cameraId)}/prewarm`, {
      method: "POST"
    }, timeoutFromEnv("MEDIA_PREWARM_TIMEOUT_MS", 30_000));
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      const error = new Error(`WHEP prewarm request failed: ${response.status}`);
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async snapshotBytes(cameraId, options = {}) {
    if (!this.configured()) {
      throw new Error("MEDIA_WHEP_BASE_URL is not configured");
    }
    const query = new URLSearchParams();
    for (const key of ["width", "height", "quality", "max_bytes"]) {
      const value = options[key];
      if (value != null) query.set(key, String(value));
    }
    const suffix = query.size ? `?${query}` : "";
    const response = await this.#fetch(
      `${this.baseUrl}/${encodeURIComponent(cameraId)}/snapshot.jpg${suffix}`,
      {},
      timeoutFromEnv("MEDIA_SNAPSHOT_TIMEOUT_MS", 5_000)
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok) {
      const error = new Error(`Media snapshot request failed: ${response.status}`);
      error.payload = { raw: new TextDecoder().decode(bytes) };
      throw error;
    }
    return bytes;
  }

  async providerOffer(cameraId) {
    if (!this.configured()) {
      throw new Error("MEDIA_WHEP_BASE_URL is not configured");
    }
    const response = await this.#fetch(`${this.baseUrl}/${encodeURIComponent(cameraId)}/provider-offers`, {
      method: "POST"
    }, timeoutFromEnv("MEDIA_WHEP_OFFER_TIMEOUT_MS", 45_000));
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      const error = new Error(`Provider offer request failed: ${response.status}`);
      error.payload = payload;
      throw error;
    }
    return {
      sdp: payload.sdp,
      location: payload.location ?? response.headers.get("location"),
      video: Boolean(payload.video),
      audio: Boolean(payload.audio)
    };
  }

  async providerAnswer(cameraId, sessionLocation, sdpAnswer) {
    if (!sessionLocation) {
      throw new Error("Provider session location is missing");
    }
    const response = await this.#fetch(`${resolveSessionUrl(this.baseUrl, cameraId, sessionLocation)}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: sdpAnswer
    }, timeoutFromEnv("MEDIA_WHEP_OFFER_TIMEOUT_MS", 45_000));
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      const error = new Error(`Provider answer request failed: ${response.status}`);
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async health() {
    if (!this.configured()) {
      return { ok: false, configured: false };
    }
    const response = await this.#fetch(
      `${this.baseUrl}/health`,
      {},
      timeoutFromEnv("MEDIA_HEALTH_TIMEOUT_MS", 5_000)
    );
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    if (!response.ok) {
      const error = new Error(`WHEP health request failed: ${response.status}`);
      error.payload = payload;
      throw error;
    }
    return { configured: true, ...payload };
  }

  async whepCandidates(cameraId, sessionLocation, candidates, etag = "*") {
    if (!sessionLocation) {
      return;
    }
    return this.#updateWhepSession(cameraId, sessionLocation, candidatesToSdpFrag(candidates), etag);
  }

  async whepCandidatesSdpFrag(cameraId, sessionLocation, sdpFrag, etag = "*") {
    if (!sessionLocation || !sdpFrag) {
      return null;
    }
    return this.#updateWhepSession(cameraId, sessionLocation, sdpFrag, etag);
  }

  async #updateWhepSession(cameraId, sessionLocation, sdpFrag, etag) {
    const response = await this.#fetch(resolveSessionUrl(this.baseUrl, cameraId, sessionLocation), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/trickle-ice-sdpfrag",
        "If-Match": etag || "*"
      },
      body: sdpFrag
    });
    const payload = await response.text();
    if (!response.ok) {
      const error = new Error(`WHEP candidate update failed: ${response.status}`);
      error.payload = { raw: payload };
      throw error;
    }
    return { etag: response.headers.get("etag") ?? etag ?? "*" };
  }

  async stopWhepSession(cameraId, sessionLocation) {
    if (!sessionLocation) {
      return;
    }
    const response = await this.#fetch(resolveSessionUrl(this.baseUrl, cameraId, sessionLocation), { method: "DELETE" });
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      const error = new Error(`WHEP session delete failed: ${response.status}`);
      error.payload = { raw: await response.text() };
      throw error;
    }
  }

  async #fetch(url, options = {}, requestTimeoutMs = this.requestTimeoutMs) {
    const boundedTimeoutMs = positiveTimeout(requestTimeoutMs);
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, boundedTimeoutMs);
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } catch (error) {
      if (timedOut) {
        const timeoutError = new Error(`Media request timed out after ${boundedTimeoutMs}ms`);
        timeoutError.cause = error;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

function positiveTimeout(value) {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 15_000;
}

function timeoutFromEnv(name, fallback) {
  return positiveTimeout(process.env[name] ?? fallback);
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function resolveSessionUrl(baseUrl, cameraId, location) {
  if (/^https?:\/\//i.test(location)) {
    return location;
  }
  if (location.startsWith("/")) {
    return new URL(location, baseUrl).toString();
  }
  return `${baseUrl}/${encodeURIComponent(cameraId)}/${location}`;
}

function candidatesToSdpFrag(candidates = []) {
  return candidates
    .map(candidate => {
      const mid = candidate.sdpMid ?? "0";
      const index = candidate.sdpMLineIndex ?? 0;
      return `a=mid:${mid}\r\na=m-line-index:${index}\r\na=${candidate.candidate}\r\n`;
    })
    .join("");
}
