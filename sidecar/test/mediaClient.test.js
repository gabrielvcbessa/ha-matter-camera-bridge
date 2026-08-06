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
        headers: { get: name => ({ location: "/camera/whep/session-1", etag: '"session-1"' })[name.toLowerCase()] ?? null },
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
    assert.equal(response.etag, '"session-1"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checks WHEP candidate update responses and preserves the ETag", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let requestInit = null;
    globalThis.fetch = async (_url, init) => {
      requestInit = init;
      return {
        ok: true,
        status: 204,
        headers: { get: name => (name.toLowerCase() === "etag" ? '"session-2"' : null) },
        text: async () => ""
      };
    };

    const media = new MediaClient("http://127.0.0.1:8889");
    const response = await media.whepCandidatesSdpFrag("camera", "/session-1", "a=end-of-candidates\r\n", '"session-1"');

    assert.equal(requestInit.method, "PATCH");
    assert.equal(requestInit.headers["If-Match"], '"session-1"');
    assert.deepEqual(response, { etag: '"session-2"' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("surfaces failed WHEP candidate updates", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 412,
      headers: { get: () => null },
      text: async () => "etag mismatch"
    });

    const media = new MediaClient("http://127.0.0.1:8889");
    await assert.rejects(
      () => media.whepCandidatesSdpFrag("camera", "/session-1", "a=end-of-candidates\r\n"),
      /WHEP candidate update failed: 412/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("prewarms camera WHEP source", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let requestUrl = null;
    let requestInit = null;
    globalThis.fetch = async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, video: true, audio: false })
      };
    };

    const media = new MediaClient("http://127.0.0.1:8889/");
    const response = await media.prewarm("camera");

    assert.equal(requestUrl, "http://127.0.0.1:8889/camera/prewarm");
    assert.equal(requestInit.method, "POST");
    assert.deepEqual(response, { ok: true, video: true, audio: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetches snapshots from the shared media source", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let requestUrl = null;
    globalThis.fetch = async url => {
      requestUrl = url;
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
      };
    };

    const media = new MediaClient("http://127.0.0.1:8889/");
    const response = await media.snapshotBytes("front door", {
      width: 640,
      height: 360,
      quality: 80,
      max_bytes: 56000
    });

    assert.equal(
      requestUrl,
      "http://127.0.0.1:8889/front%20door/snapshot.jpg?width=640&height=360&quality=80&max_bytes=56000"
    );
    assert.deepEqual([...response], [1, 2, 3]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bounds stalled media requests", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    });

    const media = new MediaClient("http://127.0.0.1:8889", 10);
    await assert.rejects(
      () => media.stopWhepSession("camera", "session"),
      /Media request timed out after 10ms/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the shorter snapshot timeout budget", async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = process.env.MEDIA_SNAPSHOT_TIMEOUT_MS;
  try {
    process.env.MEDIA_SNAPSHOT_TIMEOUT_MS = "10";
    globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    });

    const media = new MediaClient("http://127.0.0.1:8889", 1_000);
    await assert.rejects(
      () => media.snapshotBytes("camera"),
      /Media request timed out after 10ms/
    );
  } finally {
    if (originalTimeout == null) delete process.env.MEDIA_SNAPSHOT_TIMEOUT_MS;
    else process.env.MEDIA_SNAPSHOT_TIMEOUT_MS = originalTimeout;
    globalThis.fetch = originalFetch;
  }
});
