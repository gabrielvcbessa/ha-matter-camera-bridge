import test from "node:test";
import assert from "node:assert/strict";

import { logEvent, recentEvents, redactSecrets } from "../src/diagnosticLog.js";

test("diagnostic events redact passwords in rtsp urls and password fields", () => {
  logEvent("test", "redaction", {
    url: "rtsp://user:secret@camera.local:554/stream",
    password: "secret",
    nested: { passcode: 20202021 }
  });

  const event = recentEvents(1)[0];
  assert.equal(event.url, "rtsp://user:***@camera.local:554/stream");
  assert.equal(event.password, "[redacted]");
  assert.equal(event.nested.passcode, "[redacted]");
});

test("redactSecrets recursively redacts rtsp credentials in diagnostic payloads", () => {
  const payload = redactSecrets({
    manifest: {
      endpoint: {
        stream_profiles: [
          { source: "rtsp://front:front-secret@camera.local:554/stream" },
          { source: "rtsp://camera.local:554/anonymous" }
        ]
      }
    }
  });

  assert.equal(payload.manifest.endpoint.stream_profiles[0].source, "rtsp://front:***@camera.local:554/stream");
  assert.equal(payload.manifest.endpoint.stream_profiles[1].source, "rtsp://camera.local:554/anonymous");
});
