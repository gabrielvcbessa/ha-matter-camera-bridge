import { createHash } from "node:crypto";
import { Endpoint } from "@matter/main/node";
import { CameraDevice, CameraRequirements } from "@matter/main/devices/camera";
import { CameraAvStreamManagementServer } from "@matter/main/behaviors/camera-av-stream-management";
import { CameraAvSettingsUserLevelManagementServer } from "@matter/main/behaviors/camera-av-settings-user-level-management";
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information";
import { FixedLabelServer } from "@matter/node/behaviors/fixed-label";
import { UserLabelServer } from "@matter/node/behaviors/user-label";
import { CameraAvStreamManagement } from "@matter/types/clusters/camera-av-stream-management";
import { CameraAvSettingsUserLevelManagement } from "@matter/types/clusters/camera-av-settings-user-level-management";
import { WebRtcTransportRequestor } from "@matter/types/clusters/web-rtc-transport-requestor";
import { ClientInteraction, DedicatedChannelExchangeProvider, ExchangeManager, Invoke } from "@matter/protocol";
import { Status, StatusResponseError, StreamUsage, ThreeLevelAuto } from "@matter/types";
import { errorFields, logEvent } from "./diagnosticLog.js";
import { markWebRtcSession, recordMatterCommand } from "./matterActivity.js";
import { SOFTWARE_VERSION } from "./version.js";

let nextVideoStreamId = 1;
let nextAudioStreamId = 1;
let nextSnapshotStreamId = 2;
const nextWebRtcSessionIds = new Map();
const webRtcSessions = new Map();
const MATTER_SNAPSHOT_RESPONSE_BUDGET_BYTES = 56_000;
const REQUESTOR_ANSWER_RETRY_DELAYS_MS = [0, 200, 500, 1_000, 2_000];

const WebRtcTransportProviderServerWithoutSFrame = webRtcTransportProviderWithoutSFrame(
  CameraRequirements.WebRtcTransportProviderServer
);

export function assertLiveViewUsage(usage, command) {
  const normalized = usage ?? StreamUsage.LiveView;
  if (normalized === StreamUsage.LiveView) return normalized;
  throw new StatusResponseError(
    `${command}: streamUsage=${normalized} is unsupported until Push AV Stream Transport is implemented`,
    Status.ConstraintError
  );
}

export function webRtcTransportProviderCommandFields(commandName) {
  return WebRtcTransportProviderServerWithoutSFrame.schema.commands
    .find(command => command.propertyName === commandName)
    ?.children
    ?.map(field => field.propertyName) ?? [];
}

export async function matterCaptureSnapshotCommand(cameraId, bridgeClient, request = {}, state = {}, mediaClient = null) {
  const snapshotStreamId = request?.snapshotStreamId ?? null;
  const stream = snapshotStreamForRequest(state, snapshotStreamId);
  const resolution = normalizeResolution(request?.requestedResolution ?? stream?.maxResolution, stream?.maxResolution ?? fullSnapshotResolution());
  recordMatterCommand(cameraId, "CameraAvStreamManagement", "captureSnapshot", { snapshotStreamId, resolution });
  logEvent("matter-camera", "capture_snapshot_start", { cameraId, snapshotStreamId, resolution });
  let bytes;
  const snapshotOptions = {
    width: resolution.width,
    height: resolution.height,
    quality: stream?.quality ?? 80,
    max_bytes: MATTER_SNAPSHOT_RESPONSE_BUDGET_BYTES
  };
  try {
    if (mediaClient?.configured?.() && mediaClient?.snapshotBytes) {
      try {
        bytes = await mediaClient.snapshotBytes(cameraId, snapshotOptions);
        if (bytes.length < 100) throw new Error(`Media snapshot was unexpectedly small: ${bytes.length} bytes`);
        logEvent("matter-camera", "capture_snapshot_media_path", { cameraId, snapshotStreamId });
      } catch (error) {
        logEvent("matter-camera", "capture_snapshot_media_fallback", { cameraId, snapshotStreamId, ...errorFields(error) }, "warn");
      }
    }
    bytes ??= await bridgeClient.snapshotBytes(cameraId, "jpeg", snapshotOptions);
  } catch (error) {
    logEvent("matter-camera", "capture_snapshot_failed", { cameraId, snapshotStreamId, ...errorFields(error) }, "error");
    throw error;
  }
  logEvent("matter-camera", "capture_snapshot_complete", { cameraId, snapshotStreamId, bytes: bytes.byteLength ?? bytes.length ?? null });
  return {
    data: bytes,
    imageCodec: CameraAvStreamManagement.ImageCodec.Jpeg,
    resolution
  };
}

export async function matterProvideWhepOfferCommand(cameraId, mediaClient, request = {}, state = {}, context = {}) {
  assertLiveViewUsage(request?.streamUsage, "ProvideOffer");
  const webRtcSessionId = request?.webRtcSessionId ?? nextWebRtcSessionId(cameraId);
  recordMatterCommand(cameraId, "WebRtcTransportProvider", "provideOffer", {
    webRtcSessionId,
    sdpBytes: String(request?.sdp ?? "").length,
    whepConfigured: mediaClient?.configured?.() ?? false,
    ...summarizeWebRtcRequest(request, context)
  });
  if (!mediaClient?.configured?.()) {
    logEvent("matter-camera", "provide_offer_no_whep", { cameraId, webRtcSessionId }, "warn");
    markWebRtcSession(cameraId, webRtcSessionId, "no-whep");
    setWebRtcSession(cameraId, webRtcSessionId, {}, context);
    upsertWebRtcSession(state, webRtcSessionFromRequest(webRtcSessionId, request, context));
    return {
      webRtcSessionId,
      videoStreamId: selectedVideoStreamId(request),
      sdp: "",
      location: null
    };
  }
  logEvent("matter-camera", "provide_offer_forward_whep", {
    cameraId,
    webRtcSessionId,
    sdpBytes: String(request?.sdp ?? "").length,
    ...summarizeWebRtcRequest(request, context)
  });
  let answer;
  try {
    answer = await mediaClient.whepOffer(cameraId, request?.sdp ?? "");
  } catch (error) {
    cleanupAllocatedStreamsAfterFailedOffer(state, request);
    deleteWebRtcSession(cameraId, webRtcSessionId, context);
    markWebRtcSession(cameraId, webRtcSessionId, "failed", errorFields(error));
    logEvent("matter-camera", "provide_offer_failed", { cameraId, webRtcSessionId, ...errorFields(error) }, "error");
    throw error;
  }
  setWebRtcSession(cameraId, webRtcSessionId, {
    location: answer.location,
    etag: answer.etag,
    sdp: answer.sdp
  }, context);
  upsertWebRtcSession(state, webRtcSessionFromRequest(webRtcSessionId, request, context));
  markWebRtcSession(cameraId, webRtcSessionId, "answered", { location: answer.location });
  logEvent("matter-camera", "provide_offer_answer_ready", { cameraId, webRtcSessionId, sdpBytes: String(answer.sdp ?? "").length });
  return {
    webRtcSessionId,
    videoStreamId: selectedVideoStreamId(request),
    sdp: answer.sdp,
    location: answer.location
  };
}

export async function matterEndWhepSessionCommand(cameraId, mediaClient, request = {}, state = {}, context = {}) {
  const webRtcSessionId = request?.webRtcSessionId;
  const session = getWebRtcSession(cameraId, webRtcSessionId, context) ?? {};
  const location = request?.location ?? session?.location ?? null;
  recordMatterCommand(cameraId, "WebRtcTransportProvider", "endSession", { webRtcSessionId });
  logEvent("matter-camera", "end_session", { cameraId, webRtcSessionId });
  await safeBridgeCall("end_session_stop_whep", cameraId, { webRtcSessionId, location }, () =>
    mediaClient?.stopWhepSession?.(cameraId, location)
  );
  if (webRtcSessionId != null) deleteWebRtcSession(cameraId, webRtcSessionId, context);
  state.currentSessions = (state.currentSessions ?? []).filter(session => session.id !== webRtcSessionId);
  markWebRtcSession(cameraId, webRtcSessionId, "ended");
}

export async function matterPtzRelativeMoveCommand(cameraId, bridgeClient, request = {}, state = {}) {
  recordMatterCommand(cameraId, "CameraAvSettingsUserLevelManagement", "mptzRelativeMove", {
    panDelta: request?.panDelta ?? 0,
    tiltDelta: request?.tiltDelta ?? 0,
    zoomDelta: request?.zoomDelta ?? 0
  });
  const panDelta = request?.panDelta ?? 0;
  const tiltDelta = request?.tiltDelta ?? 0;
  const zoomDelta = request?.zoomDelta ?? 0;
  const current = state.mptzPosition ?? { pan: 0, tilt: 0, zoom: 1 };
  const pan = clamp((current.pan ?? 0) + panDelta, -180, 180);
  const tilt = clamp((current.tilt ?? 0) + tiltDelta, -90, 90);
  const zoom = clamp((current.zoom ?? 1) + zoomDelta, 1, 100);
  state.movementState = CameraAvSettingsUserLevelManagement.PhysicalMovement.Moving;
  try {
    await safeBridgeCall("ptz_relative", cameraId, { panDelta, tiltDelta, zoomDelta, pan, tilt, zoom }, () =>
      bridgeClient.ptzRelative(cameraId, scalePan(panDelta), scaleTilt(tiltDelta), scaleZoomDelta(zoomDelta))
    );
    state.mptzPosition = { pan, tilt, zoom };
    return { ok: true, mptzPosition: state.mptzPosition };
  } finally {
    state.movementState = CameraAvSettingsUserLevelManagement.PhysicalMovement.Idle;
  }
}

export async function matterPtzContinuousMoveCommand(cameraId, bridgeClient, request = {}, state = {}) {
  const direction = request?.direction ?? "stop";
  const speed = clamp(request?.speed ?? 0.25, 0.05, 1);
  const stopAfterMs = Number(request?.stopAfterMs ?? 350);
  recordMatterCommand(cameraId, "CameraAvSettingsUserLevelManagement", "mptzContinuousMove", {
    direction,
    speed,
    stopAfterMs
  });
  state.movementState = CameraAvSettingsUserLevelManagement.PhysicalMovement.Moving;
  try {
    const move = await bridgeClient.ptzDirection(cameraId, direction, speed);
    let stopped = null;
    if (stopAfterMs >= 0) {
      await new Promise(resolve => setTimeout(resolve, stopAfterMs));
      stopped = await bridgeClient.ptzStop(cameraId);
      state.movementState = CameraAvSettingsUserLevelManagement.PhysicalMovement.Idle;
    }
    logEvent("matter-camera", "ptz_continuous_move_ok", { cameraId, direction, speed, stopAfterMs });
    return { ok: true, move, stopped, movementState: state.movementState };
  } catch (error) {
    state.movementState = CameraAvSettingsUserLevelManagement.PhysicalMovement.Idle;
    logEvent("matter-camera", "ptz_continuous_move_failed", { cameraId, direction, speed, stopAfterMs, ...errorFields(error) }, "error");
    throw error;
  }
}

export async function matterPtzStopCommand(cameraId, bridgeClient, state = {}) {
  recordMatterCommand(cameraId, "CameraAvSettingsUserLevelManagement", "mptzStop");
  try {
    const stopped = await bridgeClient.ptzStop(cameraId);
    state.movementState = CameraAvSettingsUserLevelManagement.PhysicalMovement.Idle;
    logEvent("matter-camera", "ptz_stop_ok", { cameraId });
    return { ok: true, stopped, movementState: state.movementState };
  } catch (error) {
    logEvent("matter-camera", "ptz_stop_failed", { cameraId, ...errorFields(error) }, "error");
    throw error;
  }
}

export async function matterPtzStatusCommand(cameraId, bridgeClient) {
  recordMatterCommand(cameraId, "CameraAvSettingsUserLevelManagement", "ptzStatusCheck");
  logEvent("matter-camera", "ptz_status_check", { cameraId });
  return bridgeClient.ptzStatus(cameraId);
}

export function createBridgeCameraEndpoint(cameraId, bridgeClient, mediaClient = null, cameraName = cameraId, options = {}) {
  const advertisePtz = options.advertisePtz !== false;
  const advertiseAudio = options.advertiseAudio !== false;
  const CameraAvStreamManagementWithImageControl =
    CameraAvStreamManagementServer.with("Video", ...(advertiseAudio ? ["Audio"] : []), "Snapshot", "ImageControl");
  const CameraAvSettingsUserLevelManagementWithMptz =
    CameraAvSettingsUserLevelManagementServer.with("MechanicalPan", "MechanicalTilt", "MechanicalZoom");

  class BridgeCameraAvStreamManagementServer extends CameraAvStreamManagementWithImageControl {
    async videoStreamAllocate(request) {
      assertLiveViewUsage(request?.streamUsage, "VideoStreamAllocate");
      const videoStreamId = nextVideoStreamId++;
      const stream = videoStreamFromRequest(videoStreamId, request);
      this.state.allocatedVideoStreams = [...(this.state.allocatedVideoStreams ?? []), stream];
      recordMatterCommand(cameraId, "CameraAvStreamManagement", "videoStreamAllocate", {
        videoStreamId,
        streamUsage: request?.streamUsage ?? null
      });
      logEvent("matter-camera", "video_stream_allocate", { cameraId, videoStreamId });
      if (mediaClient?.configured?.()) {
        logEvent("matter-camera", "video_stream_relay_skipped", { cameraId, videoStreamId, reason: "webrtc-whep" });
      } else {
        await safeBridgeCall("video_stream_start_relay", cameraId, { videoStreamId }, () =>
          bridgeClient.startRelay(cameraId, "mobile", "hls")
        );
      }
      return { videoStreamId };
    }

    async videoStreamDeallocate(request) {
      const videoStreamId = request?.videoStreamId ?? null;
      this.state.allocatedVideoStreams = (this.state.allocatedVideoStreams ?? []).filter(
        stream => stream.videoStreamId !== videoStreamId
      );
      recordMatterCommand(cameraId, "CameraAvStreamManagement", "videoStreamDeallocate", { videoStreamId });
      logEvent("matter-camera", "video_stream_deallocate", { cameraId, videoStreamId });
      if (mediaClient?.configured?.()) {
        logEvent("matter-camera", "video_stream_relay_stop_skipped", { cameraId, videoStreamId, reason: "webrtc-whep" });
      } else {
        await safeBridgeCall("video_stream_stop_relay", cameraId, { videoStreamId }, () =>
          bridgeClient.stopRelay(cameraId, "mobile", "hls")
        );
      }
    }

    async audioStreamAllocate(request) {
      assertLiveViewUsage(request?.streamUsage, "AudioStreamAllocate");
      const audioStreamId = nextAudioStreamId++;
      const stream = audioStreamFromRequest(audioStreamId, request);
      this.state.allocatedAudioStreams = [...(this.state.allocatedAudioStreams ?? []), stream];
      recordMatterCommand(cameraId, "CameraAvStreamManagement", "audioStreamAllocate", {
        audioStreamId,
        streamUsage: request?.streamUsage ?? null
      });
      logEvent("matter-camera", "audio_stream_allocate", { cameraId, audioStreamId });
      return { audioStreamId };
    }

    async audioStreamDeallocate(request) {
      const audioStreamId = request?.audioStreamId ?? null;
      this.state.allocatedAudioStreams = (this.state.allocatedAudioStreams ?? []).filter(
        stream => stream.audioStreamId !== audioStreamId
      );
      recordMatterCommand(cameraId, "CameraAvStreamManagement", "audioStreamDeallocate", { audioStreamId });
      logEvent("matter-camera", "audio_stream_deallocate", { cameraId, audioStreamId });
    }

    async snapshotStreamAllocate(_request) {
      const snapshotStreamId = nextAvailableSnapshotStreamId(this.state);
      const requestedResolution = normalizeResolution(_request?.maxResolution ?? _request?.minResolution, fullSnapshotResolution());
      const minResolution = normalizeResolution(_request?.minResolution, requestedResolution);
      const stream = {
        snapshotStreamId,
        imageCodec: supportedImageCodec(_request?.imageCodec),
        frameRate: Math.min(Number(_request?.maxFrameRate ?? 1) || 1, 1),
        minResolution,
        maxResolution: requestedResolution,
        quality: clamp(Number(_request?.quality ?? 85) || 85, 1, 100),
        referenceCount: 1,
        encodedPixels: false,
        hardwareEncoder: false
      };
      this.state.allocatedSnapshotStreams = [...(this.state.allocatedSnapshotStreams ?? []), stream];
      recordMatterCommand(cameraId, "CameraAvStreamManagement", "snapshotStreamAllocate", {
        snapshotStreamId,
        imageCodec: _request?.imageCodec ?? null,
        requestedResolution,
        minResolution,
        quality: stream.quality
      });
      logEvent("matter-camera", "snapshot_stream_allocate", { cameraId, snapshotStreamId, requestedResolution });
      return { snapshotStreamId };
    }

    async snapshotStreamModify(request) {
      const snapshotStreamId = request?.snapshotStreamId ?? null;
      this.state.allocatedSnapshotStreams = (this.state.allocatedSnapshotStreams ?? []).map(stream => {
        if (stream.snapshotStreamId !== snapshotStreamId) return stream;
        return { ...stream };
      });
      recordMatterCommand(cameraId, "CameraAvStreamManagement", "snapshotStreamModify", {
        snapshotStreamId,
        watermarkEnabled: request?.watermarkEnabled ?? null,
        osdEnabled: request?.osdEnabled ?? null
      });
      logEvent("matter-camera", "snapshot_stream_modify", { cameraId, snapshotStreamId });
    }

    async snapshotStreamDeallocate(request) {
      const snapshotStreamId = request?.snapshotStreamId ?? null;
      this.state.allocatedSnapshotStreams = (this.state.allocatedSnapshotStreams ?? []).filter(
        stream => stream.snapshotStreamId !== snapshotStreamId
      );
      recordMatterCommand(cameraId, "CameraAvStreamManagement", "snapshotStreamDeallocate", { snapshotStreamId });
      logEvent("matter-camera", "snapshot_stream_deallocate", { cameraId, snapshotStreamId });
    }

    async captureSnapshot(request) {
      return matterCaptureSnapshotCommand(cameraId, bridgeClient, request, this.state, mediaClient);
    }

    async setStreamPriorities(request) {
      this.state.streamUsagePriorities = [StreamUsage.LiveView];
      recordMatterCommand(cameraId, "CameraAvStreamManagement", "setStreamPriorities", {
        requested: request?.streamPriorities ?? [],
        applied: this.state.streamUsagePriorities
      });
    }
  }

  class BridgeWebRtcTransportProviderServer extends WebRtcTransportProviderServerWithoutSFrame {
    async solicitOffer(_request) {
      assertLiveViewUsage(_request?.streamUsage, "SolicitOffer");
      const requestSummary = summarizeWebRtcRequest(_request, this.context);
      recordMatterCommand(cameraId, "WebRtcTransportProvider", "solicitOffer", {
        whepConfigured: mediaClient?.configured?.() ?? false,
        ...requestSummary
      });
      logEvent("matter-camera", "solicit_offer", {
        cameraId,
        whepConfigured: mediaClient?.configured?.() ?? false,
        ...requestSummary
      });
      const webRtcSessionId = nextWebRtcSessionId(cameraId);
      markWebRtcSession(cameraId, webRtcSessionId, "solicited");
      setWebRtcSession(cameraId, webRtcSessionId, {}, this.context);
      this.state.currentSessions = [
        ...(this.state.currentSessions ?? []),
        webRtcSessionFromRequest(webRtcSessionId, _request, this.context)
      ];
      if (mediaClient?.configured?.()) {
        void sendProviderOffer(this, cameraId, _request, webRtcSessionId, mediaClient);
      }
      return {
        webRtcSessionId,
        deferredOffer: true,
        ...legacySolicitStreamFields(_request)
      };
    }

    async provideOffer(request) {
      const answer = await matterProvideWhepOfferCommand(cameraId, mediaClient, request, this.state, this.context);
      const { webRtcSessionId } = answer;
      scheduleRequestorAnswer(this, cameraId, request, webRtcSessionId, answer.sdp);
      return {
        webRtcSessionId
      };
    }

    async provideAnswer(request) {
      const webRtcSessionId = request?.webRtcSessionId ?? null;
      const session = getWebRtcSession(cameraId, webRtcSessionId, this.context);
      recordMatterCommand(cameraId, "WebRtcTransportProvider", "provideAnswer", {
        webRtcSessionId,
        sdpBytes: String(request?.sdp ?? "").length,
        location: session?.location ?? null
      });
      if (!session?.location || !mediaClient?.configured?.()) {
        logEvent("matter-camera", "provide_answer_skipped", {
          cameraId,
          webRtcSessionId,
          reason: session?.location ? "no-media-client" : "no-provider-session"
        }, "warn");
        return;
      }
      try {
        await mediaClient.providerAnswer(cameraId, session.location, request?.sdp ?? "");
        markWebRtcSession(cameraId, webRtcSessionId, "connected", { location: session.location });
        logEvent("matter-camera", "provide_answer_forwarded", { cameraId, webRtcSessionId, location: session.location });
      } catch (error) {
        logEvent("matter-camera", "provide_answer_failed", { cameraId, webRtcSessionId, ...errorFields(error) }, "error");
        throw error;
      }
    }

    async provideIceCandidates(request) {
      const session = getWebRtcSession(cameraId, request?.webRtcSessionId, this.context);
      recordMatterCommand(cameraId, "WebRtcTransportProvider", "provideIceCandidates", {
        webRtcSessionId: request?.webRtcSessionId,
        count: request?.iceCandidates?.length ?? 0
      });
      logEvent("matter-camera", "provide_ice_candidates", {
        cameraId,
        webRtcSessionId: request?.webRtcSessionId,
        count: request?.iceCandidates?.length ?? 0
      });
      const update = await safeBridgeCall("provide_ice_candidates_forward", cameraId, {
        webRtcSessionId: request?.webRtcSessionId,
        location: session?.location ?? null
      }, () => mediaClient?.whepCandidates?.(
        cameraId,
        session?.location,
        request?.iceCandidates ?? [],
        session?.etag
      ));
      if (session && update?.etag) session.etag = update.etag;
    }

    async endSession(request) {
      await matterEndWhepSessionCommand(cameraId, mediaClient, request, this.state, this.context);
    }
  }

  class BridgeZoneManagementServer extends CameraRequirements.ZoneManagementServer {
    async createOrUpdateTrigger(request) {
      recordMatterCommand(cameraId, "ZoneManagement", "createOrUpdateTrigger", {
        zoneId: request?.trigger?.zoneId ?? "matter-zone"
      });
      await safeBridgeCall("zone_upsert_detection", cameraId, { zoneId: request?.trigger?.zoneId ?? "matter-zone" }, () => bridgeClient.upsertDetectionZone(cameraId, {
        id: String(request?.trigger?.zoneId ?? "matter-zone"),
        points: request?.zone?.vertices ?? []
      }));
    }

    async removeTrigger(request) {
      recordMatterCommand(cameraId, "ZoneManagement", "removeTrigger", {
        zoneId: request?.zoneId ?? "matter-zone"
      });
      await safeBridgeCall("zone_remove_detection", cameraId, { zoneId: request?.zoneId ?? "matter-zone" }, () =>
        bridgeClient.deleteZone(cameraId, "detection", String(request?.zoneId ?? "matter-zone"))
      );
    }
  }

  class BridgeCameraAvSettingsUserLevelManagementServer extends CameraAvSettingsUserLevelManagementWithMptz {
    async mptzSetPosition(request) {
      recordMatterCommand(cameraId, "CameraAvSettingsUserLevelManagement", "mptzSetPosition", {
        hasPan: request?.pan !== undefined,
        hasTilt: request?.tilt !== undefined,
        hasZoom: request?.zoom !== undefined
      });
      const pan = request?.pan ?? this.state.mptzPosition?.pan ?? 0;
      const tilt = request?.tilt ?? this.state.mptzPosition?.tilt ?? 0;
      const zoom = request?.zoom ?? this.state.mptzPosition?.zoom ?? 1;
      this.state.movementState = CameraAvSettingsUserLevelManagement.PhysicalMovement.Moving;
      try {
        await safeBridgeCall("ptz_absolute", cameraId, { pan, tilt, zoom }, () =>
          bridgeClient.ptzAbsolute(cameraId, scalePan(pan), scaleTilt(tilt), scaleZoom(zoom))
        );
        this.state.mptzPosition = { pan, tilt, zoom };
      } finally {
        this.state.movementState = CameraAvSettingsUserLevelManagement.PhysicalMovement.Idle;
      }
    }

    async mptzRelativeMove(request) {
      await matterPtzRelativeMoveCommand(cameraId, bridgeClient, request, this.state);
    }
  }

  const bridgeBehaviors = [
    BridgeCameraAvStreamManagementServer,
    BridgeWebRtcTransportProviderServer,
    CameraRequirements.WebRtcTransportRequestorClient,
    BridgeZoneManagementServer,
    BridgedDeviceBasicInformationServer,
    FixedLabelServer,
    UserLabelServer
  ];
  if (advertisePtz) {
    bridgeBehaviors.splice(4, 0, BridgeCameraAvSettingsUserLevelManagementServer);
  }

  const BridgeCameraDevice = CameraDevice.with(...bridgeBehaviors);

  return new Endpoint(BridgeCameraDevice, cameraEndpointOptions(cameraId, cameraName, { advertisePtz, advertiseAudio }));
}

export function cameraEndpointOptions(cameraId, cameraName = cameraId, options = {}) {
  const advertisePtz = options.advertisePtz !== false;
  const advertiseAudio = options.advertiseAudio !== false;
  const sensor = { width: 1920, height: 1080, fps: 30 };
  const fullResolution = { width: sensor.width, height: sensor.height };
  const mobileResolution = { width: 1280, height: 720 };
  const snapshot = snapshotResolution();
  const endpointOptions = {
    id: cameraId,
    fixedLabel: {
      labelList: [
        { label: "name", value: labelValue(cameraName) },
        { label: "id", value: labelValue(cameraId) }
      ]
    },
    userLabel: {
      labelList: [
        { label: "name", value: labelValue(cameraName) }
      ]
    },
    bridgedDeviceBasicInformation: {
      reachable: true,
      vendorName: process.env.MATTER_BRIDGED_VENDOR_NAME ?? process.env.MATTER_VENDOR_NAME ?? "Local Bridge",
      vendorId: Number(process.env.MATTER_BRIDGED_VENDOR_ID ?? process.env.MATTER_VENDOR_ID ?? 0xfff1),
      productName: cameraName,
      productId: Number(process.env.MATTER_BRIDGED_PRODUCT_ID ?? 0x8002),
      nodeLabel: cameraName,
      serialNumber: cameraId,
      hardwareVersion: 1,
      hardwareVersionString: "1",
      softwareVersion: 1,
      softwareVersionString: process.env.MATTER_BRIDGED_SOFTWARE_VERSION ?? process.env.MATTER_SOFTWARE_VERSION ?? SOFTWARE_VERSION,
      uniqueId: bridgedUniqueId(cameraId),
      configurationVersion: 1
    },
    cameraAvStreamManagement: {
      maxContentBufferSize: 16 * 1024 * 1024,
      maxNetworkBandwidth: 8_000_000,
      supportedStreamUsages: [StreamUsage.LiveView],
      streamUsagePriorities: [StreamUsage.LiveView],
      hardPrivacyModeOn: false,
      statusLightEnabled: false,
      statusLightBrightness: ThreeLevelAuto.Auto,
      maxConcurrentEncoders: 2,
      maxEncodedPixelRate: sensor.width * sensor.height * sensor.fps,
      videoSensorParams: {
        sensorWidth: sensor.width,
        sensorHeight: sensor.height,
        maxFps: sensor.fps
      },
      minViewportResolution: mobileResolution,
      rateDistortionTradeOffPoints: [
        {
          codec: CameraAvStreamManagement.VideoCodec.H264,
          resolution: mobileResolution,
          minBitRate: 1_000_000
        },
        {
          codec: CameraAvStreamManagement.VideoCodec.H264,
          resolution: fullResolution,
          minBitRate: 2_500_000
        }
      ],
      currentFrameRate: sensor.fps,
      allocatedVideoStreams: [],
      viewport: { x1: 0, y1: 0, x2: sensor.width - 1, y2: sensor.height - 1 },
      microphoneCapabilities: {
        maxNumberOfChannels: 1,
        supportedCodecs: [CameraAvStreamManagement.AudioCodec.Opus],
        supportedSampleRates: [16_000],
        supportedBitDepths: [16]
      },
      allocatedAudioStreams: [],
      microphoneMuted: false,
      microphoneVolumeLevel: 100,
      microphoneMaxLevel: 100,
      microphoneMinLevel: 0,
      microphoneAgcEnabled: false,
      imageRotation: 0,
      snapshotCapabilities: [
        {
          resolution: snapshot,
          maxFrameRate: 1,
          imageCodec: CameraAvStreamManagement.ImageCodec.Jpeg,
          requiresEncodedPixels: false
        },
        {
          resolution: fullResolution,
          maxFrameRate: 1,
          imageCodec: CameraAvStreamManagement.ImageCodec.Jpeg,
          requiresEncodedPixels: false
        }
      ],
      allocatedSnapshotStreams: [defaultSnapshotStream()]
    },
    zoneManagement: {
      maxZones: 8,
      zones: [],
      triggers: [],
      sensitivityMax: 5,
      sensitivity: 3,
      twoDCartesianMax: { x: sensor.width - 1, y: sensor.height - 1 }
    },
    webRtcTransportProvider: {
      currentSessions: []
    }
  };
  if (advertisePtz) {
    endpointOptions.cameraAvSettingsUserLevelManagement = {
      mptzPosition: { pan: 0, tilt: 0, zoom: 1 },
      movementState: CameraAvSettingsUserLevelManagement.PhysicalMovement.Idle,
      zoomMax: 100,
      tiltMin: -90,
      tiltMax: 90,
      panMin: -180,
      panMax: 180
    };
  }
  if (!advertiseAudio) {
    delete endpointOptions.cameraAvStreamManagement.microphoneCapabilities;
    delete endpointOptions.cameraAvStreamManagement.allocatedAudioStreams;
    delete endpointOptions.cameraAvStreamManagement.microphoneMuted;
    delete endpointOptions.cameraAvStreamManagement.microphoneVolumeLevel;
    delete endpointOptions.cameraAvStreamManagement.microphoneMaxLevel;
    delete endpointOptions.cameraAvStreamManagement.microphoneMinLevel;
    delete endpointOptions.cameraAvStreamManagement.microphoneAgcEnabled;
  }
  return endpointOptions;
}

function webRtcTransportProviderWithoutSFrame(base) {
  const schema = base.schema.extend();
  let patched = false;

  for (const commandName of ["solicitOffer", "provideOffer"]) {
    const command = schema.commands.find(item => item.propertyName === commandName);
    if (!command?.children?.some(field => field.propertyName === "sFrameConfig")) continue;

    const replacement = command.clone();
    replacement.children = replacement.children.filter(field => field.propertyName !== "sFrameConfig");
    schema.children.push(replacement);
    patched = true;
  }

  return patched ? base.for(base.cluster, schema) : base;
}

function snapshotResolution() {
  return { width: 1280, height: 720 };
}

function fullSnapshotResolution() {
  return { width: 1920, height: 1080 };
}

function defaultSnapshotStream() {
  const resolution = fullSnapshotResolution();
  return {
    snapshotStreamId: 1,
    imageCodec: CameraAvStreamManagement.ImageCodec.Jpeg,
    frameRate: 1,
    minResolution: snapshotResolution(),
    maxResolution: resolution,
    quality: 85,
    referenceCount: 1,
    encodedPixels: false,
    hardwareEncoder: false
  };
}

function nextAvailableSnapshotStreamId(state) {
  const allocated = state.allocatedSnapshotStreams ?? [];
  while (allocated.some(stream => stream.snapshotStreamId === nextSnapshotStreamId)) {
    nextSnapshotStreamId += 1;
  }
  return nextSnapshotStreamId++;
}

function snapshotStreamForRequest(state, snapshotStreamId) {
  const streams = state.allocatedSnapshotStreams ?? [];
  if (snapshotStreamId == null) return streams[0] ?? defaultSnapshotStream();
  return streams.find(item => item.snapshotStreamId === snapshotStreamId) ?? defaultSnapshotStream();
}

function normalizeResolution(value, fallback = snapshotResolution()) {
  const fallbackWidth = Number(fallback?.width ?? 1280) || 1280;
  const fallbackHeight = Number(fallback?.height ?? 720) || 720;
  return {
    width: clamp(Number(value?.width ?? fallbackWidth) || fallbackWidth, 1, fullSnapshotResolution().width),
    height: clamp(Number(value?.height ?? fallbackHeight) || fallbackHeight, 1, fullSnapshotResolution().height)
  };
}

function supportedImageCodec(value) {
  return value === CameraAvStreamManagement.ImageCodec.Heic
    ? CameraAvStreamManagement.ImageCodec.Jpeg
    : CameraAvStreamManagement.ImageCodec.Jpeg;
}

function labelValue(value) {
  return String(value ?? "").slice(0, 16);
}

function bridgedUniqueId(cameraId) {
  const raw = String(cameraId);
  const candidate = `stm-${raw.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  if (candidate.length <= 32) return candidate;
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 8);
  return `${candidate.slice(0, 23)}-${hash}`;
}

function videoStreamFromRequest(videoStreamId, request = {}) {
  return {
    videoStreamId,
    streamUsage: request.streamUsage ?? StreamUsage.LiveView,
    videoCodec: request.videoCodec ?? CameraAvStreamManagement.VideoCodec.H264,
    minFrameRate: request.minFrameRate ?? 1,
    maxFrameRate: request.maxFrameRate ?? 20,
    minResolution: request.minResolution ?? { width: 640, height: 360 },
    maxResolution: request.maxResolution ?? fullSnapshotResolution(),
    minBitRate: request.minBitRate ?? 256_000,
    maxBitRate: request.maxBitRate ?? 2_500_000,
    keyFrameInterval: request.keyFrameInterval ?? 4_000,
    referenceCount: 1
  };
}

function audioStreamFromRequest(audioStreamId, request = {}) {
  return {
    audioStreamId,
    streamUsage: request.streamUsage ?? StreamUsage.LiveView,
    audioCodec: request.audioCodec ?? CameraAvStreamManagement.AudioCodec.Opus,
    channelCount: request.channelCount ?? 1,
    sampleRate: request.sampleRate ?? 16_000,
    bitRate: request.bitRate ?? 32_000,
    bitDepth: request.bitDepth ?? 16,
    referenceCount: 1
  };
}

function webRtcSessionFromRequest(webRtcSessionId, request = {}, context = {}) {
  const { videoStreams, audioStreams } = streamIdsFromRequest(request);
  return {
    id: webRtcSessionId,
    peerNodeId: context.session?.peerNodeId ?? BigInt(0),
    peerEndpointId: request.originatingEndpointId ?? 0,
    streamUsage: request.streamUsage ?? StreamUsage.LiveView,
    videoStreamId: videoStreams?.[0] ?? request.videoStreamId ?? null,
    audioStreamId: audioStreams?.[0] ?? request.audioStreamId ?? null,
    metadataEnabled: Boolean(request.metadataEnabled),
    ...(videoStreams?.length ? { videoStreams } : {}),
    ...(audioStreams?.length ? { audioStreams } : {}),
    fabricIndex: context.fabric ?? context.session?.fabric?.fabricIndex ?? 1
  };
}

function summarizeWebRtcRequest(request = {}, context = {}) {
  const { videoStreams, audioStreams } = streamIdsFromRequest(request);
  return {
    originatingEndpointId: request?.originatingEndpointId ?? null,
    streamUsage: request?.streamUsage ?? null,
    videoStreams: videoStreams ?? [],
    audioStreams: audioStreams ?? [],
    videoStreamId: request?.videoStreamId ?? null,
    audioStreamId: request?.audioStreamId ?? null,
    metadataEnabled: request?.metadataEnabled ?? null,
    iceServers: Array.isArray(request?.iceServers) ? request.iceServers.length : 0,
    iceTransportPolicy: request?.iceTransportPolicy ?? null,
    peerNodeId: context.session?.peerNodeId?.toString?.() ?? null,
    fabricIndex: context.fabric ?? context.session?.fabric?.fabricIndex ?? null
  };
}

function streamIdsFromRequest(request = {}) {
  return {
    videoStreams: request?.videoStreams ?? (request?.videoStreamId == null ? undefined : [request.videoStreamId]),
    audioStreams: request?.audioStreams ?? (request?.audioStreamId == null ? undefined : [request.audioStreamId])
  };
}

function selectedVideoStreamId(request = {}) {
  const { videoStreams } = streamIdsFromRequest(request);
  return videoStreams?.[0] ?? request?.videoStreamId ?? null;
}

function legacySolicitStreamFields(request) {
  const usesListFields = Array.isArray(request?.videoStreams) || Array.isArray(request?.audioStreams);
  if (usesListFields) return {};
  return {
    ...(request?.videoStreamId !== undefined ? { videoStreamId: request.videoStreamId ?? null } : {}),
    ...(request?.audioStreamId !== undefined ? { audioStreamId: request.audioStreamId ?? null } : {})
  };
}

function upsertWebRtcSession(state, session) {
  state.currentSessions = [
    ...(state.currentSessions ?? []).filter(current => current.id !== session.id),
    session
  ];
}

function cleanupAllocatedStreamsAfterFailedOffer(state, request = {}) {
  const { videoStreams = [], audioStreams = [] } = streamIdsFromRequest(request);
  const videoIds = new Set(videoStreams);
  const audioIds = new Set(audioStreams);
  if (videoIds.size) {
    state.allocatedVideoStreams = (state.allocatedVideoStreams ?? []).filter(stream => !videoIds.has(stream.videoStreamId));
  }
  if (audioIds.size) {
    state.allocatedAudioStreams = (state.allocatedAudioStreams ?? []).filter(stream => !audioIds.has(stream.audioStreamId));
  }
}

async function sendRequestorAnswer(behavior, cameraId, request, webRtcSessionId, sdp) {
  const context = behavior.context;
  if (!context?.session) {
    logEvent("matter-camera", "requestor_answer_skipped", {
      cameraId,
      webRtcSessionId,
      reason: "no-secure-session-context"
    }, "warn");
    return false;
  }

  const endpoint = request?.originatingEndpointId ?? 0;
  try {
    const { endpoint: targetEndpoint, result } = await invokeRequestorCommand(behavior, context.session, {
      preferredEndpoint: endpoint,
      command: "answer",
      fields: {
        webRtcSessionId,
        sdp
      }
    });
    if (hasInvokeFailure(result)) {
      logEvent("matter-camera", "requestor_answer_status_failed", {
        cameraId,
        webRtcSessionId,
        endpoint: targetEndpoint,
        sdpBytes: String(sdp ?? "").length,
        result
      }, "warn");
      return false;
    }
    logEvent("matter-camera", "requestor_answer_sent", {
      cameraId,
      webRtcSessionId,
      endpoint: targetEndpoint,
      sdpBytes: String(sdp ?? "").length,
      result
    });
    return true;
  } catch (error) {
    logEvent("matter-camera", "requestor_answer_failed", {
      cameraId,
      webRtcSessionId,
      endpoint,
      ...errorFields(error)
    }, "error");
    return false;
  }
}

function scheduleRequestorAnswer(behavior, cameraId, request, webRtcSessionId, sdp) {
  setTimeout(() => {
    void (async () => {
      let delivered = false;
      for (const retryDelayMs of REQUESTOR_ANSWER_RETRY_DELAYS_MS) {
        if (retryDelayMs) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        delivered = await sendRequestorAnswer(behavior, cameraId, request, webRtcSessionId, sdp);
        if (delivered) break;
        logEvent("matter-camera", "requestor_answer_retry", { cameraId, webRtcSessionId, retryDelayMs }, "warn");
      }
      if (delivered) {
        await sendRequestorIceCandidates(behavior, cameraId, request, webRtcSessionId, sdp);
      } else {
        markWebRtcSession(cameraId, webRtcSessionId, "answer-delivery-failed");
      }
    })().catch(error => {
      logEvent("matter-camera", "requestor_answer_schedule_failed", {
        cameraId,
        webRtcSessionId,
        ...errorFields(error)
      }, "error");
    });
  }, Number(process.env.MATTER_REQUESTOR_ANSWER_DELAY_MS ?? 80));
}

async function sendRequestorIceCandidates(behavior, cameraId, request, webRtcSessionId, sdp) {
  const candidates = iceCandidatesFromSdp(sdp);
  if (!candidates.length) {
    logEvent("matter-camera", "requestor_ice_candidates_skipped", {
      cameraId,
      webRtcSessionId,
      reason: "no-candidates-in-sdp"
    }, "warn");
    return;
  }

  const context = behavior.context;
  if (!context?.session) {
    logEvent("matter-camera", "requestor_ice_candidates_skipped", {
      cameraId,
      webRtcSessionId,
      reason: "no-secure-session-context",
      count: candidates.length
    }, "warn");
    return;
  }

  const endpoint = request?.originatingEndpointId ?? 0;
  try {
    const { endpoint: targetEndpoint, result } = await invokeRequestorCommand(behavior, context.session, {
      preferredEndpoint: endpoint,
      command: "iceCandidates",
      fields: {
        webRtcSessionId,
        iceCandidates: candidates
      }
    });
    if (hasInvokeFailure(result)) {
      logEvent("matter-camera", "requestor_ice_candidates_status_failed", {
        cameraId,
        webRtcSessionId,
        endpoint: targetEndpoint,
        count: candidates.length,
        result
      }, "warn");
      return;
    }
    logEvent("matter-camera", "requestor_ice_candidates_sent", {
      cameraId,
      webRtcSessionId,
      endpoint: targetEndpoint,
      count: candidates.length,
      result
    });
  } catch (error) {
    logEvent("matter-camera", "requestor_ice_candidates_failed", {
      cameraId,
      webRtcSessionId,
      endpoint,
      count: candidates.length,
      ...errorFields(error)
    }, "error");
  }
}

function iceCandidatesFromSdp(sdp) {
  const candidates = [];
  let currentMid = null;
  let currentMLineIndex = -1;
  for (const rawLine of String(sdp ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("m=")) {
      currentMLineIndex += 1;
      currentMid = null;
      continue;
    }
    if (line.startsWith("a=mid:")) {
      currentMid = line.slice("a=mid:".length) || null;
      continue;
    }
    if (line.startsWith("a=candidate:")) {
      candidates.push({
        candidate: line.slice("a=".length),
        sdpMid: currentMid,
        sdpmLineIndex: currentMLineIndex >= 0 ? currentMLineIndex : null
      });
    }
  }
  return candidates;
}

async function sendProviderOffer(behavior, cameraId, request, webRtcSessionId, mediaClient) {
  logEvent("matter-camera", "requestor_offer_prepare", { cameraId, webRtcSessionId });
  let offer;
  try {
    offer = await mediaClient.providerOffer(cameraId);
  } catch (error) {
    markWebRtcSession(cameraId, webRtcSessionId, "offer-failed");
    logEvent("matter-camera", "requestor_offer_prepare_failed", { cameraId, webRtcSessionId, ...errorFields(error) }, "error");
    return;
  }

  setWebRtcSession(cameraId, webRtcSessionId, {
    location: offer.location,
    sdp: offer.sdp
  }, behavior.context);
  markWebRtcSession(cameraId, webRtcSessionId, "offer-ready", { location: offer.location });
  await sendRequestorOffer(behavior, cameraId, request, webRtcSessionId, offer.sdp);
}

function nextWebRtcSessionId(cameraId) {
  const next = nextWebRtcSessionIds.get(cameraId) ?? 1;
  nextWebRtcSessionIds.set(cameraId, next + 1);
  return next;
}

function webRtcSessionKey(cameraId, webRtcSessionId, context = {}) {
  const fabricIndex = context.fabric ?? context.session?.fabric?.fabricIndex ?? 0;
  const peerNodeId = context.session?.peerNodeId?.toString?.() ?? "0";
  return `${cameraId}:${fabricIndex}:${peerNodeId}:${webRtcSessionId}`;
}

function getWebRtcSession(cameraId, webRtcSessionId, context = {}) {
  if (webRtcSessionId == null) return null;
  return webRtcSessions.get(webRtcSessionKey(cameraId, webRtcSessionId, context));
}

function setWebRtcSession(cameraId, webRtcSessionId, session, context = {}) {
  webRtcSessions.set(webRtcSessionKey(cameraId, webRtcSessionId, context), session);
}

function deleteWebRtcSession(cameraId, webRtcSessionId, context = {}) {
  webRtcSessions.delete(webRtcSessionKey(cameraId, webRtcSessionId, context));
}

async function sendRequestorOffer(behavior, cameraId, request, webRtcSessionId, sdp) {
  const context = behavior.context;
  if (!context?.session) {
    logEvent("matter-camera", "requestor_offer_skipped", {
      cameraId,
      webRtcSessionId,
      reason: "no-secure-session-context"
    }, "warn");
    return;
  }

  const endpoint = request?.originatingEndpointId ?? 0;
  try {
    const { endpoint: targetEndpoint, result } = await invokeRequestorCommand(behavior, context.session, {
      preferredEndpoint: endpoint,
      command: "offer",
      fields: {
        webRtcSessionId,
        sdp
      }
    });
    if (hasInvokeFailure(result)) {
      logEvent("matter-camera", "requestor_offer_status_failed", {
        cameraId,
        webRtcSessionId,
        endpoint: targetEndpoint,
        result
      }, "warn");
      return;
    }
    logEvent("matter-camera", "requestor_offer_sent", {
      cameraId,
      webRtcSessionId,
      endpoint: targetEndpoint,
      sdpBytes: String(sdp ?? "").length,
      result
    });
  } catch (error) {
    markWebRtcSession(cameraId, webRtcSessionId, "offer-send-failed");
    logEvent("matter-camera", "requestor_offer_failed", {
      cameraId,
      webRtcSessionId,
      endpoint,
      ...errorFields(error)
    }, "error");
  }
}

async function invokeRequestorCommand(behavior, session, { preferredEndpoint, command, fields }) {
  const endpoints = uniqueEndpointCandidates(preferredEndpoint);
  const attempts = [];
  for (const endpoint of endpoints) {
    const interaction = new ClientInteraction({
      environment: behavior.env,
      exchangeProvider: new DedicatedChannelExchangeProvider(behavior.env.get(ExchangeManager), session)
    });
    const invoke = Invoke({
      commands: [
        Invoke.ConcreteCommandRequest({
          endpoint,
          cluster: WebRtcTransportRequestor,
          command,
          fields
        })
      ],
      suppressResponse: false,
      skipValidation: false
    });
    invoke.largeMessage = true;
    invoke.batchDuration = false;

    try {
      const result = await drainInvokeResult(interaction.invoke(invoke));
      if (!hasInvokeFailure(result)) {
        return { endpoint, result, attempts };
      }
      attempts.push({ endpoint, result });
    } catch (error) {
      attempts.push({ endpoint, error: errorFields(error) });
      if (endpoint === endpoints[endpoints.length - 1]) {
        error.attempts = attempts;
        throw error;
      }
    } finally {
      await interaction.close().catch(() => {});
    }
  }
  return {
    endpoint: endpoints[endpoints.length - 1],
    result: attempts.at(-1)?.result ?? [],
    attempts
  };
}

function uniqueEndpointCandidates(preferredEndpoint) {
  const values = [preferredEndpoint, 0, 1]
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value >= 0);
  return [...new Set(values)];
}

async function drainInvokeResult(iterable) {
  const items = [];
  for await (const chunk of iterable) {
    for (const item of chunk ?? []) {
      items.push(summarizeInvokeItem(item));
    }
  }
  return items;
}

function summarizeInvokeItem(item) {
  if (!item || typeof item !== "object") return { kind: "unknown" };
  if (item.kind === "cmd-status") {
    return {
      kind: item.kind,
      status: item.status,
      clusterStatus: item.clusterStatus ?? null,
      path: item.path ?? null
    };
  }
  if (item.kind === "cmd-response") {
    return {
      kind: item.kind,
      path: item.path ?? null,
      hasData: item.data !== undefined && item.data !== null
    };
  }
  return {
    kind: item.kind ?? "unknown"
  };
}

function hasInvokeFailure(result) {
  return result.some(item => item.kind === "cmd-status" && item.status !== 0);
}

async function safeBridgeCall(event, cameraId, fields, action) {
  try {
    const result = await action();
    logEvent("matter-camera", `${event}_ok`, { cameraId, ...fields });
    return result;
  } catch (error) {
    logEvent("matter-camera", `${event}_failed`, { cameraId, ...fields, ...errorFields(error) }, "error");
    return null;
  }
}

function scalePan(value) {
  return clamp(value / 180, -1, 1);
}

function scaleTilt(value) {
  return clamp(value / 90, -1, 1);
}

function scaleZoom(value) {
  return clamp((value - 1) / 99, 0, 1);
}

function scaleZoomDelta(value) {
  return clamp(value / 100, -1, 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}
