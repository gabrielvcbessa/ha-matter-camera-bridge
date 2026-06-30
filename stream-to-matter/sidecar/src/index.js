import http from "node:http";
import { Logger } from "@matter/general";
import { BridgeClient } from "./bridgeClient.js";
import { cameraDefinitionsFromManifest, cameraIdsFromManifest, publicCameraConfig, saveCameraConfig } from "./configStore.js";
import { dashboardHtml } from "./dashboard.js";
import { errorFields, logEvent, recentEvents, redactSecrets } from "./diagnosticLog.js";
import { readMatterResetRequest, scheduleMatterIdentityReset } from "./identityReset.js";
import { MediaClient } from "./mediaClient.js";
import { matterActivitySnapshot } from "./matterActivity.js";
import { inspectMatterCameraSupport } from "./matterCapabilities.js";
import { MatterNodeRuntime } from "./matterNode.js";
import { cleanupStaleMatterStorageLock } from "./storageLock.js";

const PORT = Number(process.env.MATTER_SIDECAR_PORT ?? 8090);
const BRIDGE_URL = process.env.BRIDGE_URL ?? "http://stream-to-matter:8080";
const COMMISSIONING_MODE = process.env.SIDECAR_MODE ?? "manifest-validated";
let cameraIds = (process.env.CAMERA_IDS ?? process.env.CAMERA_ID ?? "camera").split(",").map(value => value.trim()).filter(Boolean);
const HEARTBEAT_SECONDS = Number(process.env.STATUS_HEARTBEAT_SECONDS ?? 60);

Logger.level = process.env.MATTER_LOG_LEVEL ?? "notice";
Logger.format = process.env.MATTER_LOG_FORMAT ?? "plain";

const bridge = new BridgeClient(BRIDGE_URL);
const media = new MediaClient(process.env.MEDIA_WHEP_BASE_URL ?? "");
const matterSupport = inspectMatterCameraSupport();
const matterNode = new MatterNodeRuntime(bridge, media, cameraIds);
let lastManifest = null;
let lastBridgeHealth = null;
let lastCameraProbes = {};
let lastMediaHealth = null;
let cameraDefinitions = cameraIds.map(id => ({ id, name: id }));
let startupError = null;

async function refreshBridgeState() {
  lastBridgeHealth = await bridge.health();
  lastManifest = await bridge.manifest();
  cameraDefinitions = cameraDefinitionsFromManifest(lastManifest);
  cameraIds = cameraIdsFromManifest(lastManifest);
  matterNode.setCameraDefinitions(cameraDefinitions);
  logEvent("bridge", "manifest_loaded", { cameras: cameraDefinitions, cameraCount: cameraIds.length });
  return { health: lastBridgeHealth, manifest: lastManifest };
}

try {
  logEvent("startup", "sidecar_starting", {
    port: PORT,
    bridgeUrl: BRIDGE_URL,
    mediaWhepConfigured: media.configured(),
    heartbeatSeconds: HEARTBEAT_SECONDS,
    matterLogLevel: Logger.level
  });
  await refreshBridgeState();
  const lockCleanup = await cleanupStaleMatterStorageLock();
  if (lockCleanup.removed) {
    logEvent("matter", "removed_stale_storage_lock", { reason: lockCleanup.reason });
    console.log(`Removed stale Matter storage lock: ${lockCleanup.reason}`);
  }
  await matterNode.start();
} catch (error) {
  startupError = { message: error.message, payload: error.payload };
  logEvent("startup", "sidecar_start_failed", errorFields(error), "error");
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return html(response, 200, dashboardHtml(await statusPayload({ includeSensitive: true })));
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, {
        ok: startupError === null,
        mode: COMMISSIONING_MODE,
        bridgeUrl: BRIDGE_URL,
        matterCameraDefinitionsLoaded: matterSupport.cameraDeviceDefinitionsLoaded,
        matterNodeStarted: matterNode.status().started,
        pairable: matterNode.status().pairable
      });
    }

    if (request.method === "GET" && url.pathname === "/status") {
      return json(response, 200, await statusPayload());
    }

    if (request.method === "GET" && url.pathname === "/api/status") {
      return json(response, 200, await statusPayload({ includeSensitive: true }));
    }

    if (request.method === "GET" && url.pathname === "/api/logs") {
      return json(response, 200, { events: recentEvents(Number(url.searchParams.get("limit") ?? 80)) });
    }

    const liveWhepMatch = url.pathname.match(/^\/api\/cameras\/([^/]+)\/whep$/);
    if (request.method === "POST" && liveWhepMatch) {
      const [, cameraId] = liveWhepMatch;
      try {
        const offer = await readText(request);
        const answer = await media.whepOffer(decodeURIComponent(cameraId), offer);
        logEvent("media", "dashboard_whep_offer", {
          cameraId: decodeURIComponent(cameraId),
          sdpBytes: answer.sdp.length,
          location: answer.location
        });
        return text(response, 201, answer.sdp, {
          "Content-Type": "application/sdp",
          "Location": answer.location ?? ""
        });
      } catch (error) {
        logEvent("media", "dashboard_whep_offer_failed", { cameraId: decodeURIComponent(cameraId), ...errorFields(error) }, "warn");
        return json(response, error.status ?? 503, { ok: false, error: error.message, payload: error.payload });
      }
    }

    const liveWhepSessionMatch = url.pathname.match(/^\/api\/cameras\/([^/]+)\/whep-session$/);
    if (request.method === "DELETE" && liveWhepSessionMatch) {
      const [, cameraId] = liveWhepSessionMatch;
      await media.stopWhepSession(decodeURIComponent(cameraId), url.searchParams.get("location"));
      logEvent("media", "dashboard_whep_stop", { cameraId: decodeURIComponent(cameraId) });
      return json(response, 200, { ok: true });
    }

    const personDetectionMatch = url.pathname.match(/^\/api\/cameras\/([^/]+)\/detection\/person$/);
    if (request.method === "GET" && personDetectionMatch) {
      const [, cameraId] = personDetectionMatch;
      return json(response, 200, await bridge.personDetection(decodeURIComponent(cameraId)));
    }

    if (request.method === "POST" && personDetectionMatch) {
      const [, rawCameraId] = personDetectionMatch;
      const cameraId = decodeURIComponent(rawCameraId);
      const payload = await readJson(request);
      const bridgeState = await bridge.updatePersonDetection(cameraId, payload);
      let matterEndpoint = null;
      try {
        matterEndpoint = await matterNode.updatePersonPresence(
          cameraId,
          Boolean(bridgeState.active),
          bridgeState.source ?? payload.source ?? "api"
        );
      } catch (error) {
        logEvent("matter", "person_presence_mirror_failed", { cameraId, ...errorFields(error) }, "warn");
      }
      return json(response, 200, { ...bridgeState, matterEndpoint });
    }

    if (request.method === "POST" && url.pathname === "/matter/reset-identity") {
      const payload = await readJson(request);
      let reset;
      try {
        reset = await scheduleMatterIdentityReset(payload);
      } catch (error) {
        return json(response, 400, { ok: false, error: error.message });
      }
      logEvent("matter", "identity_reset_scheduled", { resetId: reset.id }, "warn");
      return json(response, 200, {
        ok: true,
        reset,
        restartRequired: true,
        message: "Matter identity reset has been scheduled. Restart the add-on to rotate credentials and clear Matter storage."
      });
    }

    if (request.method === "GET" && url.pathname === "/api/cameras") {
      return json(response, 200, await publicCameraConfig());
    }

    if (request.method === "PUT" && url.pathname === "/api/cameras") {
      const payload = await readJson(request);
      const saved = await saveCameraConfig(payload);
      const bridgeReload = await bridge.reloadConfig().catch(errorPayload);
      logEvent("config", "cameras_saved", {
        cameraIds: saved.cameras.map(camera => camera.id),
        bridgeReloadOk: Boolean(bridgeReload?.ok)
      });
      await refreshBridgeState().catch(error => {
        startupError = { message: error.message, payload: error.payload };
        logEvent("bridge", "refresh_after_save_failed", errorFields(error), "error");
      });
      return json(response, 200, { ...saved, bridgeReload });
    }

    const snapshotMatch = url.pathname.match(/^\/api\/cameras\/([^/]+)\/snapshot\.jpg$/);
    if (request.method === "GET" && snapshotMatch) {
      const [, cameraId] = snapshotMatch;
      try {
        const bytes = await bridge.snapshotBytes(decodeURIComponent(cameraId), "jpeg", snapshotOptionsFromUrl(url));
        return bytesResponse(response, 200, "image/jpeg", Buffer.from(bytes));
      } catch (error) {
        logEvent("snapshot", "snapshot_failed", { cameraId: decodeURIComponent(cameraId), ...errorFields(error) }, "warn");
        return json(response, error.status ?? 503, {
          ok: false,
          error: error.message,
          payload: error.payload
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/refresh") {
      startupError = null;
      try {
        await refreshBridgeState();
      } catch (error) {
        startupError = { message: error.message, payload: error.payload };
      }
      return json(response, startupError ? 503 : 200, await statusPayload());
    }

    if (request.method === "GET" && url.pathname === "/bridge/manifest") {
      await refreshBridgeState();
      return json(response, 200, redactSecrets(lastManifest));
    }

    if (request.method === "GET" && url.pathname === "/matter/onboarding") {
      logEvent("matter", "onboarding_requested", {
        started: matterNode.status().started,
        pairable: matterNode.status().pairable,
        cameraIds
      });
      return json(response, 200, onboardingPayload({ includeSensitive: true }));
    }

    if (request.method === "POST" && url.pathname === "/matter/start") {
      logEvent("matter", "start_requested");
      return json(response, 200, await matterNode.start());
    }

    const ptzMatch = url.pathname.match(/^\/camera\/([^/]+)\/ptz\/([^/]+)$/);
    if (request.method === "POST" && ptzMatch) {
      const [, cameraId, direction] = ptzMatch;
      logEvent("ptz", "direction_requested", { cameraId, direction });
      const speed = Number(url.searchParams.get("speed") ?? "0.2");
      const move = await bridge.ptzDirection(cameraId, direction, speed);
      const stopAfterMs = Number(url.searchParams.get("stopAfterMs") ?? "150");
      let stopped = null;
      if (stopAfterMs >= 0) {
        await new Promise(resolve => setTimeout(resolve, stopAfterMs));
        stopped = await bridge.ptzStop(cameraId);
      }
      return json(response, 200, { ok: true, move, stopped });
    }

    const ptzStatusMatch = url.pathname.match(/^\/api\/cameras\/([^/]+)\/ptz\/status$/);
    if (request.method === "GET" && ptzStatusMatch) {
      const [, cameraId] = ptzStatusMatch;
      try {
        const payload = await bridge.ptzStatus(decodeURIComponent(cameraId));
        logEvent("ptz", "status_checked", { cameraId: decodeURIComponent(cameraId), ok: Boolean(payload?.ok) });
        return json(response, 200, payload);
      } catch (error) {
        logEvent("ptz", "status_failed", { cameraId: decodeURIComponent(cameraId), ...errorFields(error) }, "warn");
        return json(response, error.status ?? 503, {
          ok: false,
          error: error.message,
          payload: error.payload
        });
      }
    }

    const zonesMatch = url.pathname.match(/^\/camera\/([^/]+)\/zones\/(privacy|detection)$/);
    if (request.method === "GET" && zonesMatch) {
      const [, cameraId, zoneType] = zonesMatch;
      return json(response, 200, await bridge.zones(cameraId, zoneType));
    }

    if (request.method === "POST" && zonesMatch) {
      const [, cameraId, zoneType] = zonesMatch;
      const zone = await readJson(request);
      return json(response, 200, await bridge.upsertZone(cameraId, zoneType, zone));
    }

    const zoneDeleteMatch = url.pathname.match(/^\/camera\/([^/]+)\/zones\/(privacy|detection)\/([^/]+)$/);
    if (request.method === "DELETE" && zoneDeleteMatch) {
      const [, cameraId, zoneType, zoneId] = zoneDeleteMatch;
      return json(response, 200, await bridge.deleteZone(cameraId, zoneType, decodeURIComponent(zoneId)));
    }

    return json(response, 404, { ok: false, error: "not found" });
  } catch (error) {
    return json(response, 500, { ok: false, error: error.message, payload: error.payload });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Matter sidecar listening on http://0.0.0.0:${PORT}`);
  console.log(`Bridge URL: ${BRIDGE_URL}`);
  console.log(`Matter log level: ${process.env.MATTER_LOG_LEVEL ?? "notice"}`);
  console.log(`Matter log format: ${process.env.MATTER_LOG_FORMAT ?? "plain"}`);
});

if (HEARTBEAT_SECONDS > 0) {
  setInterval(() => {
    logHeartbeat().catch(error => {
      console.log(`[stream-to-matter-status] error=${JSON.stringify({ message: error.message, payload: error.payload })}`);
    });
  }, HEARTBEAT_SECONDS * 1000).unref();
  logHeartbeat().catch(() => {});
}

async function statusPayload({ includeSensitive = false } = {}) {
  await refreshRuntimeDiagnostics(true);
  const cameraConfig = await publicCameraConfig(undefined, { redactSensitive: true }).catch(errorPayload);
  const matterReset = await readMatterResetRequest();
  return {
    ok: startupError === null,
    mode: COMMISSIONING_MODE,
    bridgeUrl: BRIDGE_URL,
    mediaWhepConfigured: media.configured(),
    bridgeHealth: lastBridgeHealth,
    cameraProbe: firstValue(lastCameraProbes),
    cameraProbes: lastCameraProbes,
    cameras: cameraStatusList(),
    cameraConfig,
    mediaHealth: lastMediaHealth,
    manifestLoaded: Array.isArray(lastManifest) && lastManifest.length > 0,
    manifestCameraCount: Array.isArray(lastManifest) ? lastManifest.length : 0,
    matterSupport,
    matterActivity: matterActivitySnapshot(cameraIds),
    commissioning: onboardingPayload({ includeSensitive }),
    matterReset,
    events: recentEvents(80),
    startupError
  };
}

async function refreshRuntimeDiagnostics(includeProbe = true) {
  lastBridgeHealth = await bridge.health().catch(errorPayload);
  lastMediaHealth = await media.health().catch(errorPayload);
  if (includeProbe) {
    const probes = {};
    for (const cameraId of cameraIds) {
      probes[cameraId] = await bridge.probe(cameraId).catch(errorPayload);
    }
    lastCameraProbes = probes;
  }
}

async function logHeartbeat() {
  await refreshRuntimeDiagnostics(true);
  const nodeStatus = matterNode.status();
  const payload = {
    cameraIds,
    cameraDefinitions,
    bridgeOk: Boolean(lastBridgeHealth?.ok),
    cameras: cameraIds.map(cameraId => ({
      id: cameraId,
      probeOk: Boolean(lastCameraProbes[cameraId]?.ok),
      hasVideo: Boolean(lastCameraProbes[cameraId]?.has_video),
      hasAudio: Boolean(lastCameraProbes[cameraId]?.has_audio),
      endpointAttached: Boolean(nodeStatus.cameraEndpoints?.[cameraId]?.attached)
    })),
    matterActivity: matterActivitySnapshot(cameraIds).cameras.map(camera => ({
      id: camera.id,
      totalCommands: camera.totalCommands,
      lastSeen: camera.lastSeen
    })),
    mediaOk: Boolean(lastMediaHealth?.ok),
    mediaSessions: lastMediaHealth?.sessions ?? null,
    mediaSources: lastMediaHealth?.configuredSources ?? [],
    matterStarted: Boolean(nodeStatus.started),
    matterPairable: Boolean(nodeStatus.pairable),
    endpointAttached: Boolean(nodeStatus.cameraEndpoint?.attached),
    startupError: startupError?.message ?? null
  };
  console.log(`[stream-to-matter-status] ${JSON.stringify(payload)}`);
}

function errorPayload(error) {
  return { ok: false, error: error.message, payload: error.payload };
}

function onboardingPayload({ includeSensitive = false } = {}) {
  const nodeStatus = matterNode.status();
  const payload = {
    mode: COMMISSIONING_MODE,
    started: nodeStatus.started,
    pairable: nodeStatus.pairable,
    credentialSource: process.env.MATTER_CREDENTIAL_SOURCE ?? "unknown",
    manualPairingCode: includeSensitive ? nodeStatus.manualPairingCode : null,
    qrPairingCode: includeSensitive ? nodeStatus.qrPairingCode : null,
    qrCodeUrl: includeSensitive ? nodeStatus.qrCodeUrl : null,
    passcode: includeSensitive ? nodeStatus.passcode : null,
    discriminator: includeSensitive ? nodeStatus.discriminator : null,
    cameraEndpoint: nodeStatus.cameraEndpoint,
    cameraEndpoints: nodeStatus.cameraEndpoints,
    personEndpoints: nodeStatus.personEndpoints,
    bridgeTopology: nodeStatus.bridgeTopology,
    reason: onboardingReason(nodeStatus),
    implementedNow: [
      "Starts a real matter.js ServerNode.",
      "Exposes real development manual and QR pairing codes generated by matter.js.",
      "Loads real matter.js Matter 1.5.1 camera device definitions.",
      "Attaches a Matter Aggregator endpoint and exposes each camera as a bridged child Camera endpoint.",
      "Adds Bridged Device Basic Information so controllers can identify each camera as a bridge child.",
      "Loads bridge /matter/manifest.",
      "Proxies PTZ direction controls to the bridge.",
      "Runs as a separate container in docker-compose."
    ],
    error: nodeStatus.error
  };
  return payload;
}

function onboardingReason(nodeStatus) {
  if (!nodeStatus.started) {
    return "Matter ServerNode did not start; inspect /status for error details.";
  }
  if (nodeStatus.pairable) {
    return "A real matter.js ServerNode is running as a Matter bridge. Camera endpoints are attached under the aggregator as bridged child Camera devices.";
  }
  if (nodeStatus.commissioned || Number(nodeStatus.commissionedFabrics ?? 0) > 0) {
    return "Matter ServerNode is running and already commissioned to at least one fabric.";
  }
  return "Matter ServerNode is running but is not currently advertising a pairing window.";
}

function json(response, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function html(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function text(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...headers
  });
  response.end(body);
}

function bytesResponse(response, status, contentType, body) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": body.byteLength,
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function firstValue(object) {
  return Object.values(object ?? {})[0] ?? null;
}

function cameraStatusList() {
  return cameraIds.map(cameraId => {
    const manifest = (lastManifest ?? []).find(item => item?.endpoint?.id === cameraId);
    const nodeStatus = matterNode.status();
    return {
      id: cameraId,
      name: manifest?.endpoint?.name ?? manifest?.node?.product_name?.replace(/ Matter Camera Bridge$/, "") ?? cameraId,
      manifest: redactSecrets(manifest),
      probe: lastCameraProbes[cameraId] ?? null,
      endpoint: nodeStatus.cameraEndpoints?.[cameraId] ?? null,
      personEndpoint: nodeStatus.personEndpoints?.[cameraId] ?? null
    };
  });
}

function snapshotOptionsFromUrl(url) {
  return {
    width: url.searchParams.get("width"),
    height: url.searchParams.get("height"),
    quality: url.searchParams.get("quality"),
    max_bytes: url.searchParams.get("max_bytes")
  };
}

async function readJson(request) {
  const raw = await readText(request);
  return raw ? JSON.parse(raw) : {};
}

async function readText(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
