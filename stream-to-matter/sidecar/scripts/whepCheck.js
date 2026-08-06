import { RTCPeerConnection, useH264 } from "werift";

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
  iceAdditionalHostAddresses: ["127.0.0.1"],
  codecs: {
    video: [useH264()]
  }
});

let closed = false;
let whepSession = null;
const events = [];
const media = {
  videoTracks: 0,
  audioTracks: 0,
  videoPackets: 0,
  audioPackets: 0
};

peer.connectionStateChange.subscribe(state => events.push({ type: "connection", state }));
peer.iceConnectionStateChange.subscribe(state => events.push({ type: "ice", state }));
peer.ontrack = trackEvent => {
  const track = trackEvent.track;
  if (track.kind === "video") media.videoTracks += 1;
  if (track.kind === "audio") media.audioTracks += 1;
  events.push({ type: "track", kind: track.kind, id: track.id });
  track.onReceiveRtp.subscribe(() => {
    if (track.kind === "video") media.videoPackets += 1;
    if (track.kind === "audio") media.audioPackets += 1;
  });
};

try {
  peer.addTransceiver("video", { direction: "recvonly" });
  if (process.env.WHEP_CHECK_AUDIO === "1") {
    peer.addTransceiver("audio", { direction: "recvonly" });
  }

  const offer = await peer.createOffer();
  await peer.setLocalDescription({ type: offer.type, sdp: preferH264(offer.sdp) });

  const answer = await mediaClient.whepOffer(cameraId, peer.localDescription.sdp);
  whepSession = answer.location;
  await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });

  const connected = await waitForPeer(peer, timeoutMs);
  const receivedVideo = await waitForVideo(media, timeoutMs);
  const result = {
    ok: connected && receivedVideo,
    cameraId,
    whepUrl: `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(cameraId)}/whep`,
    answerBytes: answer.sdp.length,
    sessionLocation: answer.location,
    connectionState: peer.connectionState,
    iceConnectionState: peer.iceConnectionState,
    media,
    events
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
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
    media,
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

function waitForVideo(mediaState, timeout) {
  if (mediaState.videoPackets > 0) {
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (mediaState.videoPackets > 0) {
        cleanup();
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeout) {
        cleanup();
        resolve(false);
      }
    }, 100);

    function cleanup() {
      clearInterval(timer);
    }
  });
}

function preferH264(sdp) {
  if (!sdp) return sdp;
  const sections = sdp.split(/(?=m=)/);
  return sections.map(section => {
    if (!section.startsWith("m=video ")) return section;

    const lines = section.split(/\r?\n/);
    const media = lines[0].split(" ");
    const payloads = media.slice(3);
    const codecByPayload = new Map();
    const aptByPayload = new Map();

    for (const line of lines) {
      const rtpmap = line.match(/^a=rtpmap:(\d+)\s+([^/]+)/i);
      if (rtpmap) codecByPayload.set(rtpmap[1], rtpmap[2].toUpperCase());
      const fmtp = line.match(/^a=fmtp:(\d+)\s+.*(?:^|[ ;])apt=(\d+)/i);
      if (fmtp) aptByPayload.set(fmtp[1], fmtp[2]);
    }

    const h264 = payloads.filter(payload => codecByPayload.get(payload) === "H264");
    if (!h264.length) return section;

    const h264Rtx = payloads.filter(payload => codecByPayload.get(payload) === "RTX" && h264.includes(aptByPayload.get(payload)));
    const preferred = [...h264, ...h264Rtx];
    const rest = payloads.filter(payload => !preferred.includes(payload));
    lines[0] = [...media.slice(0, 3), ...preferred, ...rest].join(" ");
    return lines.join("\r\n");
  }).join("");
}
