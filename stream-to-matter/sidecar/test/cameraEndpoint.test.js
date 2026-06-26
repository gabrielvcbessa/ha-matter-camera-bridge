import test from "node:test";
import assert from "node:assert/strict";

import { cameraEndpointOptions, webRtcTransportProviderCommandFields } from "../src/cameraEndpoint.js";

test("preallocates a default Matter snapshot stream for controllers that skip allocation", () => {
  const options = cameraEndpointOptions("front_door", "Front Door");
  const snapshotStreams = options.cameraAvStreamManagement.allocatedSnapshotStreams;

  assert.equal(snapshotStreams.length, 1);
  assert.deepEqual(snapshotStreams[0], {
    snapshotStreamId: 1,
    imageCodec: 0,
    frameRate: 1,
    minResolution: { width: 1280, height: 720 },
    maxResolution: { width: 1920, height: 1080 },
    quality: 85,
    referenceCount: 1,
    encodedPixels: false,
    hardwareEncoder: false
  });
});

test("omits provisional SFrame config from WebRTC offer commands", () => {
  assert.equal(webRtcTransportProviderCommandFields("solicitOffer").includes("sFrameConfig"), false);
  assert.equal(webRtcTransportProviderCommandFields("provideOffer").includes("sFrameConfig"), false);
});

test("advertises bridged camera identity metadata", () => {
  const options = cameraEndpointOptions("front_door", "Front Door");

  assert.deepEqual(options.bridgedDeviceBasicInformation, {
    reachable: true,
    vendorName: "Local Bridge",
    vendorId: 0xfff1,
    productName: "Front Door",
    productId: 0x8002,
    nodeLabel: "Front Door",
    serialNumber: "front_door",
    hardwareVersion: 1,
    hardwareVersionString: "1",
    softwareVersion: 1,
    softwareVersionString: "0.1.34",
    uniqueId: "stm-front_door",
    configurationVersion: 1
  });
});

test("adds a hash suffix to long bridged camera unique ids", () => {
  const first = cameraEndpointOptions("front_door_camera_with_a_very_long_shared_prefix_one", "Front Door");
  const second = cameraEndpointOptions("front_door_camera_with_a_very_long_shared_prefix_two", "Front Door Copy");

  assert.equal(first.bridgedDeviceBasicInformation.uniqueId.length, 32);
  assert.equal(second.bridgedDeviceBasicInformation.uniqueId.length, 32);
  assert.notEqual(
    first.bridgedDeviceBasicInformation.uniqueId,
    second.bridgedDeviceBasicInformation.uniqueId
  );
});
