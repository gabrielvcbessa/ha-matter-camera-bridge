import { RTCPeerConnection } from "werift";

import { MediaClient } from "../src/mediaClient.js";

const cameraId = process.env.CAMERA_ID || "camera";
const baseUrl = process.env.MEDIA_WHEP_BASE_URL || "";
const timeoutMs = Number(process.env.WHEP_CHECK_TIMEOUT_MS || 10_000);

if (!baseUrl) {
  console.error("MEDIA_WHEP_BASE_URL is required, for example http://127.0.0.1:8889");
  process.exit(2);
}

const mediaClient = new MediaClient(baseUrl);
const peer = new RTCPeerConnection({
  iceAdditionalHostAddresses: ["127.0.0.1"]
});

let closed = false;
let whepSession = null;
const events = [];

peer.connectionStateChange.subscribe(state => events.push({ type: "connection", state }));
peer.iceConnectionStateChange.subscribe(state => events.push({ type: "ice", state }));

try {
  peer.addTransceiver("video", { direction: "recvonly" });
  peer.addTransceiver("audio", { direction: "recvonly" });

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  const answer = await mediaClient.whepOffer(cameraId, peer.localDescription.sdp);
  whepSession = answer.location;
  await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });

  const connected = await waitForPeer(peer, timeoutMs);
  const result = {
    ok: connected,
    cameraId,
    whepUrl: `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(cameraId)}/whep`,
    answerBytes: answer.sdp.length,
    sessionLocation: answer.location,
    connectionState: peer.connectionState,
    iceConnectionState: peer.iceConnectionState,
    events
  };

  console.log(JSON.stringify(result, null, 2));
  if (!connected) {
    process.exitCode = 1;
  }

} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    cameraId,
    error: error.message,
    payload: error.payload ?? null,
    connectionState: peer.connectionState,
    iceConnectionState: peer.iceConnectionState,
    events
  }, null, 2));
  process.exitCode = 1;
} finally {
  if (whepSession) {
    await mediaClient.stopWhepSession(cameraId, whepSession).catch(() => {});
  }
  if (!closed) {
    closed = true;
    await peer.close();
  }
}

process.exit(process.exitCode ?? 0);

function waitForPeer(peerConnection, timeout) {
  if (isConnected(peerConnection)) {
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(isConnected(peerConnection));
    }, timeout);

    const onState = () => {
      if (isConnected(peerConnection)) {
        cleanup();
        resolve(true);
      }
      if (peerConnection.connectionState === "failed" || peerConnection.iceConnectionState === "failed") {
        cleanup();
        resolve(false);
      }
    };

    const connectionSubscription = peerConnection.connectionStateChange.subscribe(onState);
    const iceSubscription = peerConnection.iceConnectionStateChange.subscribe(onState);

    function cleanup() {
      clearTimeout(timer);
      connectionSubscription.unSubscribe();
      iceSubscription.unSubscribe();
    }
  });
}

function isConnected(peerConnection) {
  return (
    peerConnection.connectionState === "connected" ||
    peerConnection.iceConnectionState === "connected" ||
    peerConnection.iceConnectionState === "completed"
  );
}
