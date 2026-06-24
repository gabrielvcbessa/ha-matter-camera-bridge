const MAX_EVENTS = Number(process.env.DIAGNOSTIC_EVENT_LIMIT ?? 200);
const events = [];

export function logEvent(scope, event, fields = {}, level = "info") {
  const entry = {
    ts: new Date().toISOString(),
    level,
    scope,
    event,
    ...sanitize(fields)
  };
  events.push(entry);
  while (events.length > MAX_EVENTS) events.shift();
  console.log(`[stream-to-matter:${scope}] ${JSON.stringify({ event, ...sanitize(fields) })}`);
  return entry;
}

export function recentEvents(limit = 80) {
  return events.slice(-limit);
}

export function errorFields(error) {
  return {
    error: error?.message ?? String(error),
    payload: sanitize(error?.payload),
    status: error?.status ?? null,
    attempts: sanitize(error?.attempts)
  };
}

export function redactSecrets(value) {
  return sanitize(value);
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") {
    return redactString(value);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key.toLowerCase().includes("passcode") || key.toLowerCase().includes("password")
        ? "[redacted]"
        : sanitize(item)
    ])
  );
}

function redactString(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/(rtsp:\/\/[^:/?#\s]+:)[^@/?#\s]+(@)/g, "$1***$2")
    .replace(/("passcode"\s*:\s*)\d+/gi, "$1\"[redacted]\"");
}
