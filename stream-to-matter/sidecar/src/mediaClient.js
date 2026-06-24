export class MediaClient {
  constructor(baseUrl = "") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  configured() {
    return this.baseUrl.length > 0;
  }

  async whepOffer(cameraId, sdpOffer) {
    if (!this.configured()) {
      throw new Error("MEDIA_WHEP_BASE_URL is not configured");
    }
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(cameraId)}/whep`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: sdpOffer
    });
    const sdpAnswer = await response.text();
    if (!response.ok) {
      const error = new Error(`WHEP request failed: ${response.status}`);
      error.payload = { raw: sdpAnswer };
      throw error;
    }
    return {
      sdp: sdpAnswer,
      location: response.headers.get("location")
    };
  }

  async providerOffer(cameraId) {
    if (!this.configured()) {
      throw new Error("MEDIA_WHEP_BASE_URL is not configured");
    }
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(cameraId)}/provider-offers`, {
      method: "POST"
    });
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
    const response = await fetch(`${resolveSessionUrl(this.baseUrl, cameraId, sessionLocation)}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: sdpAnswer
    });
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
    const response = await fetch(`${this.baseUrl}/health`);
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

  async whepCandidates(cameraId, sessionLocation, candidates) {
    if (!sessionLocation) {
      return;
    }
    await fetch(resolveSessionUrl(this.baseUrl, cameraId, sessionLocation), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/trickle-ice-sdpfrag",
        "If-Match": "*"
      },
      body: candidatesToSdpFrag(candidates)
    });
  }

  async stopWhepSession(cameraId, sessionLocation) {
    if (!sessionLocation) {
      return;
    }
    await fetch(resolveSessionUrl(this.baseUrl, cameraId, sessionLocation), { method: "DELETE" });
  }
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
      const index = candidate.sdpmLineIndex ?? 0;
      return `a=mid:${mid}\r\na=m-line-index:${index}\r\na=${candidate.candidate}\r\n`;
    })
    .join("");
}
