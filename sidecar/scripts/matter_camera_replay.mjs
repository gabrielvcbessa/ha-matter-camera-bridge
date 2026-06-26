#!/usr/bin/env node
import { ServerNode } from "@matter/main/node";
import { Invoke } from "@matter/protocol";
import { CameraAvStreamManagement } from "@matter/types/clusters/camera-av-stream-management";
import { WebRtcTransportProvider } from "@matter/types/clusters/web-rtc-transport-provider";
import { ManualPairingCodeCodec } from "@matter/types";
import { Logger, LogLevel, Seconds } from "@matter/general";

const mode = process.env.MATTER_REPLAY_MODE ?? "snapshot";
const pairingCode = process.argv[2];
const existingPeerId = process.env.MATTER_REPLAY_PEER;
if (!pairingCode && !existingPeerId) {
  console.error("Usage: node scripts/matter_camera_replay.mjs <pairing-code>");
  console.error("Or reuse an existing replay controller peer with MATTER_REPLAY_PEER='@fabric:node'.");
  process.exit(2);
}

Logger.defaultLogLevel = LogLevel.DEBUG;

const node = await ServerNode.create({
  id: "stm-replay-controller",
  productDescription: {
    name: "STM Replay Controller",
    deviceType: 0x0016
  },
  basicInformation: {
    vendorName: "Local Debug",
    vendorId: 0xfff1,
    productName: "STM Replay Controller",
    productId: 0x8002,
    nodeLabel: "STM Replay Controller",
    serialNumber: `stm-replay-${Date.now()}`,
    hardwareVersion: 1,
    hardwareVersionString: "1",
    softwareVersion: 1,
    softwareVersionString: "0.1.35"
  },
  network: {
    port: 0,
    tcp: true
  }
});

try {
  await node.start();

  let peer;
  if (existingPeerId) {
    console.log(`[replay] reusing commissioned peer ${existingPeerId}`);
    peer = existingPeerId === "first" ? [...node.peers][0] : node.peers.get(existingPeerId);
    if (!peer) {
      throw new Error(`No commissioned peer ${existingPeerId} found in replay controller storage.`);
    }
  } else {
    const decodedPairingCode = ManualPairingCodeCodec.decode(pairingCode);
    const commissioningOptions = {
      passcode: decodedPairingCode.passcode,
      shortDiscriminator: decodedPairingCode.shortDiscriminator,
      timeout: Seconds(60),
      onAttestationFailure: () => true
    };
    console.log("[replay] commissioning with shared code", {
      shortDiscriminator: commissioningOptions.shortDiscriminator,
      passcode: commissioningOptions.passcode
    });
    peer = await node.peers.commission(commissioningOptions);
  }

  console.log(`[replay] commissioned peer ${peer.identity ?? "(stored peer)"}`);
  const endpointId = Number(process.env.MATTER_CAMERA_ENDPOINT ?? 1);
  console.log(`[replay] camera endpoint ${endpointId}`);

  if (mode === "live") {
    await runLiveProbe(peer, endpointId);
  } else {
    await runSnapshotProbe(peer, endpointId);
  }
} finally {
  await node.close().catch(() => {});
}

async function runSnapshotProbe(peer, endpointId) {
  await invokeCamera(peer, endpointId, "snapshotStreamAllocate", {
    imageCodec: CameraAvStreamManagement.ImageCodec.Jpeg,
    maxFrameRate: 1,
    minResolution: { width: 640, height: 360 },
    maxResolution: { width: 640, height: 360 },
    quality: 80
  });

  await invokeCamera(peer, endpointId, "captureSnapshot", {
    snapshotStreamId: null,
    requestedResolution: { width: 640, height: 360 }
  });
}

async function runLiveProbe(peer, endpointId) {
  const video = await invokeCamera(peer, endpointId, "videoStreamAllocate", {
    streamUsage: 2,
    videoCodec: CameraAvStreamManagement.VideoCodec.H264,
    minFrameRate: 1,
    maxFrameRate: 20,
    minResolution: { width: 640, height: 360 },
    maxResolution: { width: 1280, height: 720 },
    minBitRate: 256_000,
    maxBitRate: 2_500_000,
    keyFrameInterval: 4_000
  });
  const videoStreamId = firstCommandField(video, "videoStreamId");

  const audio = await invokeCamera(peer, endpointId, "audioStreamAllocate", {
    streamUsage: 2,
    audioCodec: CameraAvStreamManagement.AudioCodec.Opus,
    channelCount: 1,
    sampleRate: 16_000,
    bitRate: 32_000,
    bitDepth: 16
  });
  const audioStreamId = firstCommandField(audio, "audioStreamId");

  console.log("[replay] live allocation ids", { videoStreamId, audioStreamId });

  if (process.env.MATTER_REPLAY_SOLICIT_OFFER !== "false") {
    const useLegacyOfferFields = process.env.MATTER_REPLAY_SOLICIT_STYLE === "legacy";
    await invokeCommand(peer, endpointId, WebRtcTransportProvider, "solicitOffer", {
      streamUsage: 2,
      originatingEndpointId: 0,
      ...(useLegacyOfferFields ? { videoStreamId, audioStreamId } : {
        videoStreams: [videoStreamId],
        audioStreams: [audioStreamId]
      })
    });
  }

  if (videoStreamId !== undefined) {
    await invokeCamera(peer, endpointId, "videoStreamDeallocate", { videoStreamId });
  }
  if (audioStreamId !== undefined) {
    await invokeCamera(peer, endpointId, "audioStreamDeallocate", { audioStreamId });
  }
}

async function invokeCamera(peer, endpoint, command, fields) {
  return invokeCommand(peer, endpoint, CameraAvStreamManagement, command, fields);
}

async function invokeCommand(peer, endpoint, cluster, command, fields) {
  console.log(`[replay] invoke ${command}`, fields);
  const chunks = [];
  try {
    for await (const chunk of peer.interaction.invoke(Invoke({
      commands: [
        Invoke.ConcreteCommandRequest({
          endpoint,
          cluster,
          command,
          fields
        })
      ],
      suppressResponse: false,
      skipValidation: false
    }))) {
      chunks.push(chunk);
      console.log(`[replay] ${command} response`, JSON.stringify(cloneWithBytes(chunk), null, 2));
    }
  } catch (error) {
    console.error(`[replay] ${command} failed`, error);
    throw error;
  }
  return chunks;
}

function firstCommandField(chunks, field) {
  for (const chunk of chunks) {
    const invokeResult = chunk?.[0] ?? chunk;
    const value = invokeResult?.fields?.[field] ?? invokeResult?.data?.[field] ?? invokeResult?.[field];
    if (value !== undefined) return value;
  }
  return undefined;
}

function cloneWithBytes(value) {
  if (ArrayBuffer.isView(value)) {
    return { byteLength: value.byteLength };
  }
  if (Array.isArray(value)) {
    return value.map(cloneWithBytes);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneWithBytes(entry)]));
  }
  return value;
}
