import fs from "node:fs/promises";

const DEFAULT_CONFIG_PATH = process.env.STREAM_TO_MATTER_CONFIG ?? "/data/cameras.json";

export async function readCameraConfig(configPath = DEFAULT_CONFIG_PATH) {
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw);
}

export async function publicCameraConfig(configPath = DEFAULT_CONFIG_PATH, options = {}) {
  const redactSensitive = Boolean(options.redactSensitive);
  const payload = await readCameraConfig(configPath);
  return {
    cameras: (payload.cameras ?? []).map(camera => ({
      id: camera.id ?? "",
      name: camera.name ?? "",
      rtsp_url: redactSensitive ? redactUrl(camera.rtsp_url ?? "") : camera.rtsp_url ?? "",
      rtsp_url_redacted: redactUrl(camera.rtsp_url ?? ""),
      media_source: "",
      media_source_redacted: camera.media_source ? redactUrl(camera.media_source) : "",
      media_source_set: Boolean(camera.media_source),
      onvif: {
        host: camera.onvif?.host ?? "",
        port: camera.onvif?.port ?? 80,
        user: camera.onvif?.user ?? "",
        password_set: Boolean(camera.onvif?.password)
      },
      matter: {
        device_type: camera.matter?.device_type ?? "camera",
        standard: camera.matter?.standard ?? "Matter 1.5.1",
        advertise_ptz: camera.matter?.advertise_ptz ?? true,
        advertise_audio: camera.matter?.advertise_audio ?? true,
        advertise_two_way_audio: camera.matter?.advertise_two_way_audio ?? false,
        advertise_recording: camera.matter?.advertise_recording ?? false
      }
    }))
  };
}

export async function saveCameraConfig(nextPayload, configPath = DEFAULT_CONFIG_PATH) {
  const current = await readCameraConfig(configPath).catch(() => ({ cameras: [] }));
  const currentById = new Map((current.cameras ?? []).map(camera => [String(camera.id), camera]));
  const cameras = (nextPayload.cameras ?? []).map(input => normalizeCamera(input, currentById.get(String(input.id))));
  if (!cameras.length) {
    throw new Error("At least one camera is required.");
  }
  const ids = new Set();
  for (const camera of cameras) {
    if (ids.has(camera.id)) {
      throw new Error(`Duplicate camera id: ${camera.id}`);
    }
    ids.add(camera.id);
  }
  const payload = { cameras };
  await fs.writeFile(configPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return publicCameraConfig(configPath);
}

export function cameraIdsFromManifest(manifest) {
  return cameraDefinitionsFromManifest(manifest)
    .map(camera => camera.id);
}

export function cameraDefinitionsFromManifest(manifest) {
  return (Array.isArray(manifest) ? manifest : [])
    .map(item => {
      const capabilities = Array.isArray(item?.endpoint?.capabilities) ? item.endpoint.capabilities : [];
      return {
        id: item?.endpoint?.id,
        name: item?.endpoint?.name ?? item?.node?.product_name?.replace(/ Matter Camera Bridge$/, "") ?? item?.endpoint?.id,
        advertise_ptz: capabilityEnabled(capabilities, "ptz", true),
        advertise_audio: capabilityEnabled(capabilities, "live_audio", true)
      };
    })
    .filter(camera => camera.id)
    .map(camera => ({
      id: String(camera.id),
      name: String(camera.name ?? camera.id),
      advertise_ptz: Boolean(camera.advertise_ptz),
      advertise_audio: Boolean(camera.advertise_audio)
    }))
    .filter(Boolean);
}

function capabilityEnabled(capabilities, name, fallback) {
  const capability = capabilities.find(item => item?.name === name);
  if (!capability) return fallback;
  return String(capability.status ?? "").toLowerCase() === "enabled";
}

function normalizeCamera(input, existing = {}) {
  const id = String(input.id ?? "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Camera id must use only letters, numbers, underscores, or hyphens.");
  }
  const name = String(input.name ?? id).trim();
  const rtspUrl = normalizeRtspUrl(input.rtsp_url, "RTSP URL");
  const onvif = input.onvif ?? {};
  const password = Object.hasOwn(onvif, "password") && String(onvif.password ?? "").length
    ? String(onvif.password)
    : existing.onvif?.password ?? "";
  return {
    id,
    name,
    rtsp_url: rtspUrl,
    media_source: normalizeOptionalSecretUrl(input.media_source, existing.media_source),
    onvif: {
      host: String(onvif.host ?? "").trim(),
      port: Number(onvif.port ?? 80),
      user: String(onvif.user ?? "").trim(),
      password
    },
    matter: {
      device_type: "camera",
      standard: "Matter 1.5.1",
      advertise_ptz: Boolean(input.matter?.advertise_ptz ?? true),
      advertise_audio: Boolean(input.matter?.advertise_audio ?? true),
      advertise_two_way_audio: Boolean(input.matter?.advertise_two_way_audio ?? false),
      advertise_recording: Boolean(input.matter?.advertise_recording ?? false)
    }
  };
}

function redactUrl(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.password = url.password ? "***" : "";
    }
    return url.toString();
  } catch {
    return value;
  }
}

function normalizeOptionalSecretUrl(value, existing = "") {
  const next = String(value ?? "").trim();
  if (!next) {
    return existing ?? "";
  }
  if (next.includes("***")) {
    return existing ?? "";
  }
  return normalizeRtspUrl(next, "Advanced WHEP media source override");
}

function normalizeRtspUrl(value, label) {
  const next = String(value ?? "").trim();
  if (!next) {
    throw new Error(`${label} is required.`);
  }
  if (next.includes("#")) {
    throw new Error(`${label} must be the plain camera RTSP URL. Remove Frigate/go2rtc suffixes like #tcp#video=copy#audio=copy.`);
  }
  if (!next.startsWith("rtsp://")) {
    throw new Error(`${label} must start with rtsp://, for example rtsp://user:password@camera-ip:554/av_stream/ch0.`);
  }
  let url;
  try {
    url = new URL(next);
  } catch {
    throw new Error(`${label} must start with rtsp://, for example rtsp://user:password@camera-ip:554/av_stream/ch0.`);
  }
  if (url.protocol !== "rtsp:") {
    throw new Error(`${label} must start with rtsp://, not ${url.protocol || "an empty scheme"}.`);
  }
  if (!url.hostname) {
    throw new Error(`${label} must include a camera host.`);
  }
  return next;
}
