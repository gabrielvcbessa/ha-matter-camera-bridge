import test from "node:test";
import assert from "node:assert/strict";
import { dashboardHtml } from "../src/dashboard.js";

const sampleStatus = {
  ok: true,
  bridge: { ok: true },
  media: { ok: true },
  matterNodeStarted: true,
  matterPairable: false,
  cameras: [
    {
      id: "matter_fp2_lab",
      name: "Matter FP2 Lab",
      probeOk: true,
      hasVideo: true,
      hasAudio: true,
      endpointAttached: true
    }
  ],
  cameraConfig: {
    cameras: [
      {
        id: "matter_fp2_lab",
        name: "Matter FP2 Lab",
        rtsp_url: "rtsp://127.0.0.1:8555/stm_lab",
        matter: {
          advertise_ptz: true,
          advertise_audio: true
        },
        onvif: {
          host: "127.0.0.1",
          port: 18080,
          user: "",
          password: ""
        }
      }
    ]
  }
};

test("dashboard renders PTZ controls without forbidden Home Assistant copy", () => {
  const html = dashboardHtml(sampleStatus);

  assert.match(html, /PTZ Test/);
  assert.match(html, /Advertise mechanical PTZ to Matter controllers/);
  assert.match(html, /Some Matter controllers may show the camera but not expose Matter camera PTZ controls yet/);
  assert.doesNotMatch(html, /install the native integration for reliable PTZ buttons/);
});
