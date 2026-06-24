import test from "node:test";
import assert from "node:assert/strict";

import { inspectMatterCameraSupport } from "../src/matterCapabilities.js";
import { CameraAvStreamManagement } from "@matter/types/clusters/camera-av-stream-management";

test("loads Matter camera device definitions", () => {
  const support = inspectMatterCameraSupport();
  assert.equal(support.cameraDeviceDefinitionsLoaded, true);
  assert.equal(support.devices.camera.name, "Camera");
  assert.ok(support.devices.camera.mandatoryServerClusters.includes("CameraAvStreamManagement"));
  assert.ok(support.devices.camera.mandatoryServerClusters.includes("WebRtcTransportProvider"));
  assert.equal(CameraAvStreamManagement.ImageCodec.Jpeg, 0);
  assert.equal(CameraAvStreamManagement.ImageCodec.Heic, 1);
});
