import test from "node:test";
import assert from "node:assert/strict";

import { BridgeClient } from "../src/bridgeClient.js";

test("fetches JPEG and HEIC snapshot byte endpoints", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const requested = [];
    globalThis.fetch = async url => {
      requested.push(url);
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
      };
    };

    const bridge = new BridgeClient("http://127.0.0.1:8080/");
    assert.deepEqual([...await bridge.snapshotBytes("camera")], [1, 2, 3]);
    assert.deepEqual([...await bridge.snapshotBytes("camera", "heic")], [1, 2, 3]);

    assert.deepEqual(requested, [
      "http://127.0.0.1:8080/cameras/camera/snapshot-data.jpg",
      "http://127.0.0.1:8080/cameras/camera/snapshot-data.heic"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("passes snapshot sizing options to bridge byte endpoint", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let requestUrl = null;
    globalThis.fetch = async url => {
      requestUrl = url;
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([1]).buffer
      };
    };

    const bridge = new BridgeClient("http://127.0.0.1:8080/");
    await bridge.snapshotBytes("camera", "jpeg", { width: 640, height: 360, quality: 85, max_bytes: 200000 });

    assert.equal(
      requestUrl,
      "http://127.0.0.1:8080/cameras/camera/snapshot-data.jpg?width=640&height=360&quality=85&max_bytes=200000"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parses snapshot byte errors as bridge JSON payloads", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const bytes = new TextEncoder().encode(JSON.stringify({ ok: false, error: "ffmpeg failed" }));
    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      arrayBuffer: async () => bytes.buffer
    });

    const bridge = new BridgeClient("http://127.0.0.1:8080/");
    await assert.rejects(
      () => bridge.snapshotBytes("camera"),
      error => {
        assert.equal(error.status, 503);
        assert.equal(error.payload.error, "ffmpeg failed");
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("proxies privacy and detection zone controls", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const requests = [];
    globalThis.fetch = async (url, init = {}) => {
      requests.push({ url, init });
      return {
        ok: true,
        text: async () => JSON.stringify({ ok: true })
      };
    };

    const bridge = new BridgeClient("http://127.0.0.1:8080/");
    await bridge.zones("camera", "privacy");
    await bridge.upsertZone("camera", "detection", { id: "entry", points: [[0, 0], [1, 1]] });
    await bridge.deleteZone("camera", "detection", "entry");

    assert.equal(requests[0].url, "http://127.0.0.1:8080/cameras/camera/zones/privacy");
    assert.equal(requests[0].init.method, undefined);
    assert.equal(requests[1].url, "http://127.0.0.1:8080/cameras/camera/zones/detection");
    assert.equal(requests[1].init.method, "POST");
    assert.equal(requests[1].init.headers["Content-Type"], "application/json");
    assert.equal(requests[1].init.body, JSON.stringify({ id: "entry", points: [[0, 0], [1, 1]] }));
    assert.equal(requests[2].url, "http://127.0.0.1:8080/cameras/camera/zones/detection/entry");
    assert.equal(requests[2].init.method, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requests bridge config reload", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let requestUrl = null;
    let requestInit = null;
    globalThis.fetch = async (url, init = {}) => {
      requestUrl = url;
      requestInit = init;
      return {
        ok: true,
        text: async () => JSON.stringify({ ok: true, camera_ids: ["camera"] })
      };
    };

    const bridge = new BridgeClient("http://127.0.0.1:8080/");
    const response = await bridge.reloadConfig();

    assert.equal(requestUrl, "http://127.0.0.1:8080/config/reload");
    assert.equal(requestInit.method, "POST");
    assert.deepEqual(response, { ok: true, camera_ids: ["camera"] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
