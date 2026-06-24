import test from "node:test";
import assert from "node:assert/strict";

import { MediaClient } from "../src/mediaClient.js";

test("reports whether WHEP endpoint is configured", () => {
  assert.equal(new MediaClient("").configured(), false);
  assert.equal(new MediaClient("http://127.0.0.1:8889").configured(), true);
});

test("posts Matter SDP offers to camera WHEP endpoint", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let requestUrl = null;
    let requestInit = null;
    globalThis.fetch = async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return {
        ok: true,
        status: 201,
        headers: { get: name => (name.toLowerCase() === "location" ? "/camera/whep/session-1" : null) },
        text: async () => "v=0\r\ns=answer\r\n"
      };
    };

    const media = new MediaClient("http://127.0.0.1:8889/");
    const response = await media.whepOffer("camera", "v=0\r\ns=offer\r\n");

    assert.equal(requestUrl, "http://127.0.0.1:8889/camera/whep");
    assert.equal(requestInit.method, "POST");
    assert.equal(requestInit.headers["Content-Type"], "application/sdp");
    assert.equal(requestInit.body, "v=0\r\ns=offer\r\n");
    assert.equal(response.sdp, "v=0\r\ns=answer\r\n");
    assert.equal(response.location, "/camera/whep/session-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
