const cameras = new Map();
const activeWebRtcSessions = new Map();

export function recordMatterCommand(cameraId, cluster, command, fields = {}) {
  const camera = ensureCamera(cameraId);
  const key = `${cluster}.${command}`;
  const now = new Date().toISOString();
  const item = camera.commands.get(key) ?? {
    cluster,
    command,
    count: 0,
    firstSeen: now,
    lastSeen: null,
    lastFields: null
  };
  item.count += 1;
  item.lastSeen = now;
  item.lastFields = sanitizeFields(fields);
  camera.commands.set(key, item);
  camera.totalCommands += 1;
  camera.lastSeen = now;
  return item;
}

export function markWebRtcSession(cameraId, webRtcSessionId, state, fields = {}) {
  const now = new Date().toISOString();
  const id = String(webRtcSessionId);
  if (state === "ended") {
    activeWebRtcSessions.delete(id);
    return;
  }
  activeWebRtcSessions.set(id, {
    cameraId,
    webRtcSessionId,
    state,
    updatedAt: now,
    ...sanitizeFields(fields)
  });
}

export function matterActivitySnapshot(cameraIds = []) {
  const ids = [...new Set([...cameraIds, ...cameras.keys()])];
  return {
    activeWebRtcSessionCount: activeWebRtcSessions.size,
    activeWebRtcSessions: [...activeWebRtcSessions.values()],
    cameras: ids.map(cameraId => {
      const camera = cameras.get(cameraId);
      return {
        id: cameraId,
        totalCommands: camera?.totalCommands ?? 0,
        lastSeen: camera?.lastSeen ?? null,
        commands: [...(camera?.commands.values() ?? [])].sort((a, b) => b.count - a.count)
      };
    })
  };
}

export function resetMatterActivity() {
  cameras.clear();
  activeWebRtcSessions.clear();
}

function ensureCamera(cameraId) {
  const id = String(cameraId || "camera");
  if (!cameras.has(id)) {
    cameras.set(id, {
      totalCommands: 0,
      lastSeen: null,
      commands: new Map()
    });
  }
  return cameras.get(id);
}

function sanitizeFields(fields) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([key, value]) => [key, sanitizeValue(value)])
  );
}

function sanitizeValue(value) {
  if (typeof value === "string" && value.length > 160) return `${value.slice(0, 160)}...`;
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") return value;
  return sanitizeFields(value);
}
