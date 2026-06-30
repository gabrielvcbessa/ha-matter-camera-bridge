import { createHash } from "node:crypto";
import { Endpoint } from "@matter/main/node";
import { OccupancySensorDevice } from "@matter/main/devices/occupancy-sensor";
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information";
import { OccupancySensingServer } from "@matter/node/behaviors/occupancy-sensing";
import { OccupancySensing } from "@matter/types/clusters/occupancy-sensing";
import { SOFTWARE_VERSION } from "./version.js";

const Os = OccupancySensing;

export function personPresenceEndpointId(cameraId) {
  return `person_${cameraId}`;
}

export function createPersonPresenceEndpoint(cameraId, cameraName = cameraId) {
  const PersonPresenceDevice = OccupancySensorDevice.with(
    BridgedDeviceBasicInformationServer,
    OccupancySensingServer.with("PassiveInfrared")
  );
  return new Endpoint(PersonPresenceDevice, personPresenceEndpointOptions(cameraId, cameraName));
}

export function personPresenceState(active) {
  return {
    occupancySensing: {
      occupancy: new Os.Occupancy({ occupied: Boolean(active) })
    }
  };
}

export function personPresenceEndpointOptions(cameraId, cameraName = cameraId) {
  const id = personPresenceEndpointId(cameraId);
  const name = `${cameraName} Person Presence`;
  return {
    id,
    bridgedDeviceBasicInformation: {
      reachable: true,
      vendorName: process.env.MATTER_BRIDGED_VENDOR_NAME ?? process.env.MATTER_VENDOR_NAME ?? "Local Bridge",
      vendorId: Number(process.env.MATTER_BRIDGED_VENDOR_ID ?? process.env.MATTER_VENDOR_ID ?? 0xfff1),
      productName: "Person Presence Sensor",
      productId: Number(process.env.MATTER_PERSON_SENSOR_PRODUCT_ID ?? 0x8003),
      nodeLabel: name,
      serialNumber: id,
      hardwareVersion: 1,
      hardwareVersionString: "1",
      softwareVersion: 1,
      softwareVersionString: process.env.MATTER_BRIDGED_SOFTWARE_VERSION ?? process.env.MATTER_SOFTWARE_VERSION ?? SOFTWARE_VERSION,
      uniqueId: bridgedUniqueId(id),
      configurationVersion: 1
    },
    occupancySensing: {
      occupancy: new Os.Occupancy({ occupied: false }),
      occupancySensorType: Os.OccupancySensorType.Pir,
      occupancySensorTypeBitmap: new Os.OccupancySensorTypeBitmap({ pir: true }),
      holdTime: 10,
      holdTimeLimits: { holdTimeMin: 1, holdTimeMax: 300, holdTimeDefault: 10 }
    }
  };
}

function bridgedUniqueId(rawId) {
  const raw = String(rawId);
  const candidate = `stm-${raw.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  if (candidate.length <= 32) return candidate;
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 8);
  return `${candidate.slice(0, 23)}-${hash}`;
}
