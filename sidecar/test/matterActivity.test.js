import assert from "node:assert/strict";
import test from "node:test";
import {
  markWebRtcSession,
  matterActivitySnapshot,
  recordMatterCommand,
  resetMatterActivity
} from "../src/matterActivity.js";

test("tracks per-camera Matter camera cluster activity", () => {
  resetMatterActivity();

  recordMatterCommand("front", "WebRtcTransportProvider", "solicitOffer", { sdp: "x".repeat(200) });
  recordMatterCommand("front", "WebRtcTransportProvider", "solicitOffer");
  recordMatterCommand("front", "WebRtcTransportProvider", "provideOffer", {
    webRtcSessionId: 7,
    sdp: "x".repeat(200)
  });
  markWebRtcSession("front", 7, "answered", { location: "http://relay/session/7" });

  const snapshot = matterActivitySnapshot(["front", "garage"]);
  assert.equal(snapshot.activeWebRtcSessionCount, 1);
  assert.equal(snapshot.activeWebRtcSessions[0].cameraId, "front");

  const front = snapshot.cameras.find(camera => camera.id === "front");
  assert.equal(front.totalCommands, 3);
  assert.equal(front.commands[0].command, "solicitOffer");
  assert.equal(front.commands[0].count, 2);
  const provideOffer = front.commands.find(command => command.command === "provideOffer");
  assert.equal(provideOffer.lastFields.sdp.length, 163);

  const garage = snapshot.cameras.find(camera => camera.id === "garage");
  assert.equal(garage.totalCommands, 0);

  markWebRtcSession("front", 7, "ended");
  assert.equal(matterActivitySnapshot(["front"]).activeWebRtcSessionCount, 0);
});
