import { CameraDevice, CameraRequirements } from "@matter/main/devices/camera";
import { SnapshotCameraDevice, SnapshotCameraRequirements } from "@matter/main/devices/snapshot-camera";
import { VideoDoorbellDevice } from "@matter/main/devices/video-doorbell";

export function inspectMatterCameraSupport() {
  const camera = describeDevice("Camera", CameraDevice, CameraRequirements);
  const snapshotCamera = describeDevice("SnapshotCamera", SnapshotCameraDevice, SnapshotCameraRequirements);
  const videoDoorbell = describeDevice("VideoDoorbell", VideoDoorbellDevice, undefined);

  return {
    library: "matter.js",
    package: "@matter/main",
    matterStandardTarget: "Matter 1.5.1",
    cameraDeviceDefinitionsLoaded: Boolean(camera.deviceType && snapshotCamera.deviceType),
    devices: {
      camera,
      snapshotCamera,
      videoDoorbell
    },
    implementedSidecarWork: [
      "Starts a real matter.js ServerNode.",
      "Attaches CameraDevice with CameraAvStreamManagement, WebRtcTransportProvider, ZoneManagement, and CameraAvSettingsUserLevelManagement.",
      "Implements CameraAvStreamManagement command handlers that call bridge relay and snapshot endpoints.",
      "Implements WebRtcTransportProvider command handlers and proxies SDP offers to WHEP when MEDIA_WHEP_BASE_URL is configured.",
      "Implements ZoneManagement trigger handlers that call bridge detection-zone state.",
      "Maps Matter mechanical pan/tilt/zoom commands to bridge ONVIF PTZ absolute and relative movement."
    ],
    productionReadinessWork: [
      "Replace development credentials with certified DAC/PAI/PAA credentials.",
      "Validate commissioning and camera behavior with each target Matter controller.",
      "Run ecosystem-specific controller validation after commissioning with the generated Matter pairing payload."
    ]
  };
}

function describeDevice(name, device, requirements) {
  return {
    name,
    deviceType: device?.deviceType ?? device?.definition?.deviceType ?? null,
    deviceRevision: device?.deviceRevision ?? device?.definition?.deviceRevision ?? null,
    hasWithBuilder: typeof device?.with === "function",
    mandatoryServerClusters: Object.keys(requirements?.server?.mandatory ?? {}),
    optionalServerClusters: Object.keys(requirements?.server?.optional ?? {})
  };
}
