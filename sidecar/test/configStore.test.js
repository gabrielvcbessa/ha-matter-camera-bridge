import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { cameraIdsFromManifest, publicCameraConfig, saveCameraConfig } from "../src/configStore.js";

test("redacts media source in UI but preserves real URL when saved blank", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stream-to-matter-config-"));
  const configPath = path.join(dir, "cameras.json");
  const realMediaSource = "rtsp://rtsp:camera-password@192.168.68.59:554/av_stream/ch0";
  await fs.writeFile(configPath, JSON.stringify({
    cameras: [{
      id: "stream_to_matter_camera",
      name: "Stream to Matter Camera",
      rtsp_url: realMediaSource,
      media_source: realMediaSource,
      onvif: { host: "192.168.68.59", port: 80, user: "rtsp", password: "camera-password" }
    }]
  }), "utf8");

  const uiPayload = await publicCameraConfig(configPath);
  assert.equal(uiPayload.cameras[0].rtsp_url, realMediaSource);
  assert.equal(uiPayload.cameras[0].rtsp_url_redacted, "rtsp://rtsp:***@192.168.68.59:554/av_stream/ch0");
  assert.equal(uiPayload.cameras[0].media_source, "");
  assert.equal(uiPayload.cameras[0].media_source_set, true);
  assert.equal(uiPayload.cameras[0].media_source_redacted, "rtsp://rtsp:***@192.168.68.59:554/av_stream/ch0");

  const diagnosticPayload = await publicCameraConfig(configPath, { redactSensitive: true });
  assert.equal(diagnosticPayload.cameras[0].rtsp_url, "rtsp://rtsp:***@192.168.68.59:554/av_stream/ch0");

  await saveCameraConfig({
    cameras: [{
      ...uiPayload.cameras[0],
      media_source: "",
      onvif: { ...uiPayload.cameras[0].onvif, password: "" }
    }]
  }, configPath);

  const saved = JSON.parse(await fs.readFile(configPath, "utf8"));
  assert.equal(saved.cameras[0].media_source, realMediaSource);
  assert.equal(saved.cameras[0].onvif.password, "camera-password");
});

test("redacted media source placeholder is never persisted as a password", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stream-to-matter-config-"));
  const configPath = path.join(dir, "cameras.json");
  const realMediaSource = "rtsp://rtsp:camera-password@192.168.68.59:554/av_stream/ch0";
  await fs.writeFile(configPath, JSON.stringify({
    cameras: [{
      id: "stream_to_matter_camera",
      name: "Stream to Matter Camera",
      rtsp_url: realMediaSource,
      media_source: realMediaSource,
      onvif: { host: "192.168.68.59", port: 80, user: "rtsp", password: "camera-password" }
    }]
  }), "utf8");

  const uiPayload = await publicCameraConfig(configPath);
  await saveCameraConfig({
    cameras: [{
      ...uiPayload.cameras[0],
      media_source: uiPayload.cameras[0].media_source_redacted,
      onvif: { ...uiPayload.cameras[0].onvif, password: "" }
    }]
  }, configPath);

  const saved = JSON.parse(await fs.readFile(configPath, "utf8"));
  assert.equal(saved.cameras[0].media_source, realMediaSource);
});

test("saves multiple cameras while preserving per-camera secrets", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stream-to-matter-config-"));
  const configPath = path.join(dir, "cameras.json");
  await fs.writeFile(configPath, JSON.stringify({
    cameras: [
      {
        id: "front_door",
        name: "Front Door",
        rtsp_url: "rtsp://front/stream",
        media_source: "rtsp://front:secret@front.local/stream",
        onvif: { host: "front.local", port: 80, user: "front", password: "front-password" }
      },
      {
        id: "garage",
        name: "Garage",
        rtsp_url: "rtsp://garage/stream",
        media_source: "rtsp://garage:secret@garage.local/stream",
        onvif: { host: "garage.local", port: 80, user: "garage", password: "garage-password" }
      }
    ]
  }), "utf8");

  const uiPayload = await publicCameraConfig(configPath);
  uiPayload.cameras[0].name = "Front Door Main";
  uiPayload.cameras[1].name = "Garage Side";
  await saveCameraConfig({
    cameras: uiPayload.cameras.map(camera => ({
      ...camera,
      media_source: "",
      onvif: { ...camera.onvif, password: "" }
    }))
  }, configPath);

  const saved = JSON.parse(await fs.readFile(configPath, "utf8"));
  assert.deepEqual(saved.cameras.map(camera => camera.id), ["front_door", "garage"]);
  assert.equal(saved.cameras[0].name, "Front Door Main");
  assert.equal(saved.cameras[0].media_source, "rtsp://front:secret@front.local/stream");
  assert.equal(saved.cameras[0].onvif.password, "front-password");
  assert.equal(saved.cameras[1].name, "Garage Side");
  assert.equal(saved.cameras[1].media_source, "rtsp://garage:secret@garage.local/stream");
  assert.equal(saved.cameras[1].onvif.password, "garage-password");
});

test("rejects duplicate camera ids", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stream-to-matter-config-"));
  const configPath = path.join(dir, "cameras.json");
  await fs.writeFile(configPath, JSON.stringify({ cameras: [] }), "utf8");

  await assert.rejects(
    () => saveCameraConfig({
      cameras: [
        { id: "front_door", name: "Front", rtsp_url: "rtsp://front", onvif: { host: "front", port: 80, user: "user", password: "secret" } },
        { id: "front_door", name: "Front Copy", rtsp_url: "rtsp://front2", onvif: { host: "front2", port: 80, user: "user", password: "secret" } }
      ]
    }, configPath),
    /Duplicate camera id: front_door/
  );
});

test("rejects frigate or go2rtc stream modifiers in rtsp url", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stream-to-matter-config-"));
  const configPath = path.join(dir, "cameras.json");
  await fs.writeFile(configPath, JSON.stringify({ cameras: [] }), "utf8");

  await assert.rejects(
    () => saveCameraConfig({
      cameras: [{
        id: "front_door",
        name: "Front",
        rtsp_url: "rtsp://user:password@camera-ip:554/av_stream/ch0#tcp#video=copy#audio=copy",
        onvif: { host: "camera-ip", port: 80, user: "user", password: "secret" }
      }]
    }, configPath),
    /plain camera RTSP URL/
  );
});

test("rejects malformed rtsp urls before they reach ffmpeg", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stream-to-matter-config-"));
  const configPath = path.join(dir, "cameras.json");
  await fs.writeFile(configPath, JSON.stringify({ cameras: [] }), "utf8");

  await assert.rejects(
    () => saveCameraConfig({
      cameras: [{
        id: "front_door",
        name: "Front",
        rtsp_url: "rtsp:invalid-secret@192.168.68.59:554/av_stream/ch0",
        onvif: { host: "192.168.68.59", port: 80, user: "rtsp", password: "invalid-secret" }
      }]
    }, configPath),
    /must start with rtsp:\/\//
  );
});

test("extracts multiple camera ids from manifest", () => {
  assert.deepEqual(cameraIdsFromManifest([
    { endpoint: { id: "front_door" } },
    { endpoint: { id: "garage" } },
    { endpoint: {} },
    {}
  ]), ["front_door", "garage"]);
});

test("extracts Matter PTZ and audio advertisement from manifest capabilities", async () => {
  const { cameraDefinitionsFromManifest } = await import("../src/configStore.js");

  assert.deepEqual(cameraDefinitionsFromManifest([
    {
      endpoint: {
        id: "front_door",
        name: "Front Door",
        capabilities: [
          { name: "ptz", status: "enabled" },
          { name: "live_audio", status: "disabled" }
        ]
      }
    },
    {
      endpoint: {
        id: "fixed_camera",
        capabilities: [
          { name: "ptz", status: "disabled" },
          { name: "live_audio", status: "enabled" }
        ]
      }
    }
  ]), [
    { id: "front_door", name: "Front Door", advertise_ptz: true, advertise_audio: false },
    { id: "fixed_camera", name: "fixed_camera", advertise_ptz: false, advertise_audio: true }
  ]);
});
