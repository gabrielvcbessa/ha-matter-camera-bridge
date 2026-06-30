import { ServerNode, Endpoint } from "@matter/main/node";
import { AggregatorEndpoint } from "@matter/main/endpoints/aggregator";
import { NodeJsNetwork } from "@matter/nodejs";
import { createBridgeCameraEndpoint } from "./cameraEndpoint.js";
import { createPersonPresenceEndpoint, personPresenceEndpointId, personPresenceState } from "./personEndpoint.js";
import { errorFields, logEvent } from "./diagnosticLog.js";
import { SOFTWARE_VERSION } from "./version.js";

const DEFAULT_PASSCODE = 20202021;
const DEFAULT_DISCRIMINATOR = 3840;
const DEFAULT_PORT = 5540;
export const CAMERA_AGGREGATOR_ID = "camera_bridge";
let originalGetIpMac = null;

export class MatterNodeRuntime {
  constructor(bridgeClient = null, mediaClient = null, cameraDefinitions = ["camera"]) {
    this.bridgeClient = bridgeClient;
    this.mediaClient = mediaClient;
    this.cameraDefinitions = normalizeCameraDefinitions(cameraDefinitions);
    this.cameraIds = this.cameraDefinitions.map(camera => camera.id);
    this.node = null;
    this.aggregator = null;
    this.started = false;
    this.error = null;
    this.cameraEndpoints = {};
    this.personEndpoints = {};
    this.personEndpointRefs = {};
  }

  setCameraIds(cameraIds) {
    this.setCameraDefinitions(cameraIds);
  }

  setCameraDefinitions(cameraDefinitions) {
    const nextCameraDefinitions = normalizeCameraDefinitions(cameraDefinitions);
    const nextCameraIds = nextCameraDefinitions.map(camera => camera.id);
    if (!this.started) {
      this.cameraDefinitions = nextCameraDefinitions;
      this.cameraIds = nextCameraIds;
      logEvent("matter", "camera_ids_set", { cameras: this.cameraDefinitions });
      return;
    }
    const changed = nextCameraIds.join(",") !== this.cameraIds.join(",");
    const metadataChanged = JSON.stringify(nextCameraDefinitions) !== JSON.stringify(this.cameraDefinitions);
    if (changed) {
      logEvent("matter", "camera_ids_changed_after_start", {
        currentCameraIds: this.cameraIds,
        nextCameraIds,
        note: "Restart the add-on for new or removed cameras to become Matter endpoints."
      }, "warn");
    } else if (metadataChanged) {
      logEvent("matter", "camera_metadata_changed_after_start", {
        currentCameras: this.cameraDefinitions,
        nextCameras: nextCameraDefinitions,
        note: "Restart the add-on for updated camera names to be reflected in Matter bridged device metadata."
      }, "warn");
    }
  }

  async start() {
    if (this.started) {
      return this.status();
    }
    try {
      logEvent("matter", "node_starting", {
        cameraIds: this.cameraIds,
        credentialSource: process.env.MATTER_CREDENTIAL_SOURCE ?? "unknown",
        discriminator: numberEnv(process.env.MATTER_DISCRIMINATOR, DEFAULT_DISCRIMINATOR),
        port: numberEnv(process.env.MATTER_PORT, DEFAULT_PORT),
        mdns: matterMdnsOptions(),
        listen: listeningAddressOptions()
      });
      this.node = await ServerNode.create(matterServerNodeOptions());
      await this.#attachCameraEndpoint();
      const failedEndpoints = Object.entries(this.cameraEndpoints)
        .filter(([, endpoint]) => !endpoint.attached);
      if (failedEndpoints.length) {
        throw new Error(`Matter camera endpoint attachment failed for: ${failedEndpoints.map(([cameraId]) => cameraId).join(", ")}`);
      }
      await this.node.start();
      this.started = true;
      this.error = null;
      const status = this.status();
      logEvent("matter", "node_started", {
        pairable: status.pairable,
        network: status.network,
        cameraIds: this.cameraIds,
        attachedCameraIds: Object.entries(status.cameraEndpoints ?? {}).filter(([, value]) => value.attached).map(([key]) => key)
      });
    } catch (error) {
      this.error = serializeError(error);
      this.started = false;
      await this.node?.close?.().catch(closeError => {
        logEvent("matter", "node_close_after_start_failed", errorFields(closeError), "warn");
      });
      this.node = null;
      logEvent("matter", "node_start_failed", errorFields(error), "error");
    }
    return this.status();
  }

  async #attachCameraEndpoint() {
    if (!this.bridgeClient || !this.node) {
      this.aggregator = null;
      this.cameraEndpoints = Object.fromEntries(this.cameraDefinitions.map(camera => [
        camera.id,
        {
          attached: false,
          name: camera.name,
          reason: "Bridge client or Matter node is unavailable.",
          lastError: null
        }
      ]));
      return;
    }
    this.cameraEndpoints = {};
    this.personEndpoints = {};
    this.personEndpointRefs = {};
    this.aggregator = new Endpoint(AggregatorEndpoint, { id: CAMERA_AGGREGATOR_ID });
    await this.node.add(this.aggregator);
    logEvent("matter", "camera_aggregator_attached", { aggregatorId: CAMERA_AGGREGATOR_ID });
    for (const camera of this.cameraDefinitions) {
      const cameraId = camera.id;
      try {
        const endpoint = createBridgeCameraEndpoint(cameraId, this.bridgeClient, this.mediaClient, camera.name, {
          advertisePtz: camera.advertise_ptz,
          advertiseAudio: camera.advertise_audio
        });
        await this.aggregator.add(endpoint);
        this.cameraEndpoints[cameraId] = {
          attached: true,
          name: camera.name,
          reason: "Bridge-backed Matter camera endpoint attached.",
          lastError: null
        };
        logEvent("matter", "camera_endpoint_attached", { cameraId, cameraName: camera.name });
        if (camera.advertise_person_detection) {
          const personEndpoint = createPersonPresenceEndpoint(cameraId, camera.name);
          await this.aggregator.add(personEndpoint);
          this.personEndpointRefs[cameraId] = personEndpoint;
          this.personEndpoints[cameraId] = {
            attached: true,
            id: personPresenceEndpointId(cameraId),
            name: `${camera.name} Person Presence`,
            active: false,
            reason: "Bridge-backed Matter occupancy endpoint attached.",
            lastError: null
          };
          logEvent("matter", "person_endpoint_attached", {
            cameraId,
            endpointId: personPresenceEndpointId(cameraId),
            cameraName: camera.name
          });
        } else {
          this.personEndpoints[cameraId] = {
            attached: false,
            id: personPresenceEndpointId(cameraId),
            name: `${camera.name} Person Presence`,
            active: false,
            reason: "Person detection endpoint is disabled for this camera.",
            lastError: null
          };
        }
      } catch (error) {
        this.cameraEndpoints[cameraId] = {
          attached: false,
          name: camera.name,
          reason: "Camera endpoint attachment failed.",
          lastError: serializeError(error)
        };
      logEvent("matter", "camera_endpoint_attach_failed", { cameraId, ...errorFields(error) }, "error");
      }
    }
  }

  async updatePersonPresence(cameraId, active, source = "api") {
    const endpoint = this.personEndpointRefs[cameraId];
    if (!endpoint || !this.personEndpoints[cameraId]?.attached) {
      const error = new Error(`Person presence endpoint is not enabled for camera ${cameraId}`);
      logEvent("matter", "person_presence_update_skipped", { cameraId, active: Boolean(active), source, reason: error.message }, "warn");
      throw error;
    }
    await endpoint.set(personPresenceState(active));
    this.personEndpoints[cameraId] = {
      ...this.personEndpoints[cameraId],
      active: Boolean(active),
      lastError: null
    };
    logEvent("matter", "person_presence_updated", { cameraId, active: Boolean(active), source });
    return this.personEndpoints[cameraId];
  }

  status() {
    const commissioning = stateOf(this.node, "commissioning");
    const operationalCredentials = stateOf(this.node, "operationalCredentials");
    const network = stateOf(this.node, "network");
    const pairingCodes = commissioning?.pairingCodes ?? {};
    return {
      started: this.started,
      commissioned: Boolean(commissioning.commissioned),
      commissionedFabrics: Number(operationalCredentials.commissionedFabrics ?? 0),
      network: {
        port: numberEnv(network.port, numberEnv(process.env.MATTER_PORT, DEFAULT_PORT)),
        operationalPort: numberEnv(network.operationalPort, null),
        tcp: network.tcp ?? matterTcpOption()
      },
      pairable: this.started && !Boolean(commissioning.commissioned) && Boolean(pairingCodes.manualPairingCode && pairingCodes.qrPairingCode),
      manualPairingCode: pairingCodes.manualPairingCode ?? null,
      qrPairingCode: pairingCodes.qrPairingCode ?? null,
      qrCodeUrl: pairingCodes.qrPairingCode
        ? `https://project-chip.github.io/connectedhomeip/qrcode.html?data=${encodeURIComponent(pairingCodes.qrPairingCode)}`
        : null,
      passcode: numberEnv(process.env.MATTER_PASSCODE, DEFAULT_PASSCODE),
      discriminator: numberEnv(process.env.MATTER_DISCRIMINATOR, DEFAULT_DISCRIMINATOR),
      cameraEndpoint: primaryEndpoint(this.cameraEndpoints),
      cameraEndpoints: this.cameraEndpoints,
      personEndpoints: this.personEndpoints,
      bridgeTopology: {
        rootDeviceType: "RootNode",
        aggregatorId: this.aggregator?.id ?? CAMERA_AGGREGATOR_ID,
        aggregatorAttached: Boolean(this.aggregator),
        childDeviceType: "BridgedNode/Camera",
        bridgedCameraIds: Object.entries(this.cameraEndpoints ?? {})
          .filter(([, endpoint]) => endpoint.attached)
          .map(([cameraId]) => cameraId),
        bridgedPersonSensorIds: Object.entries(this.personEndpoints ?? {})
          .filter(([, endpoint]) => endpoint.attached)
          .map(([, endpoint]) => endpoint.id)
      },
      error: this.error
    };
  }
}

export function matterServerNodeOptions() {
  configureMatterMdnsNetwork();
  return {
        id: process.env.MATTER_NODE_STORAGE_ID ?? "node0",
        productDescription: {
          name: process.env.MATTER_PRODUCT_NAME ?? "Stream to Matter Camera Bridge",
          deviceType: 0x0016
        },
        basicInformation: {
          vendorName: process.env.MATTER_VENDOR_NAME ?? "Local Bridge",
          vendorId: Number(process.env.MATTER_VENDOR_ID ?? 0xfff1),
          productName: process.env.MATTER_PRODUCT_NAME ?? "Stream to Matter Camera Bridge",
          productId: Number(process.env.MATTER_PRODUCT_ID ?? 0x8001),
          nodeLabel: process.env.MATTER_NODE_LABEL ?? "Stream to Matter Camera Bridge",
          serialNumber: process.env.MATTER_SERIAL_NUMBER ?? "stream-to-matter-sidecar",
          hardwareVersion: 1,
          hardwareVersionString: "1",
          softwareVersion: 1,
          softwareVersionString: SOFTWARE_VERSION
        },
        commissioning: {
          passcode: numberEnv(process.env.MATTER_PASSCODE, DEFAULT_PASSCODE),
          discriminator: numberEnv(process.env.MATTER_DISCRIMINATOR, DEFAULT_DISCRIMINATOR)
        },
        network: {
          port: numberEnv(process.env.MATTER_PORT, DEFAULT_PORT),
          tcp: matterTcpOption(),
          ...listeningAddressOptions()
        }
    };
}

function matterTcpOption() {
  return envFlag(process.env.MATTER_TCP, false);
}

export function configureMatterMdnsNetwork() {
  const options = matterMdnsOptions();
  if (options.interface) {
    process.env.MATTER_MDNS_NETWORKINTERFACE = options.interface;
  }
  if (!options.ipv6 && originalGetIpMac === null) {
    originalGetIpMac = NodeJsNetwork.prototype.getIpMac;
    NodeJsNetwork.prototype.getIpMac = function filteredGetIpMac(netInterface) {
      const details = originalGetIpMac.call(this, netInterface);
      return details ? { ...details, ipV6: [] } : details;
    };
  }
  return options;
}

export function matterMdnsOptions() {
  return {
    interface: stringEnv(process.env.MATTER_MDNS_INTERFACE, ""),
    ipv6: envFlag(process.env.MATTER_MDNS_IPV6, false)
  };
}

function listeningAddressOptions() {
  const options = {};
  const ipv4 = stringEnv(process.env.MATTER_LISTENING_ADDRESS_IPV4 ?? process.env.MATTER_LISTEN_IPV4, "");
  const ipv6 = stringEnv(process.env.MATTER_LISTENING_ADDRESS_IPV6 ?? process.env.MATTER_LISTEN_IPV6, "");
  if (ipv4) {
    options.listeningAddressIpv4 = ipv4;
  }
  if (ipv6) {
    options.listeningAddressIpv6 = ipv6;
  }
  return options;
}

function numberEnv(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringEnv(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function envFlag(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

function normalizeCameraIds(cameraIds) {
  return normalizeCameraDefinitions(cameraIds).map(camera => camera.id);
}

function normalizeCameraDefinitions(cameraDefinitions) {
  const values = Array.isArray(cameraDefinitions) ? cameraDefinitions : String(cameraDefinitions).split(",");
  const normalized = values
    .map(value => {
      if (value && typeof value === "object") {
        const id = String(value.id ?? "").trim();
        return id ? {
          id,
          name: String(value.name ?? id).trim() || id,
          advertise_ptz: value.advertise_ptz !== false,
          advertise_audio: value.advertise_audio !== false,
          advertise_person_detection: value.advertise_person_detection === true
        } : null;
      }
      const id = String(value).trim();
      return id ? { id, name: id, advertise_ptz: true, advertise_audio: true, advertise_person_detection: false } : null;
    })
    .filter(Boolean);
  const unique = new Map();
  for (const camera of normalized) {
    if (!unique.has(camera.id)) {
      unique.set(camera.id, camera);
    }
  }
  return unique.size ? [...unique.values()] : [{ id: "camera", name: "camera" }];
}

function primaryEndpoint(cameraEndpoints) {
  return Object.values(cameraEndpoints ?? {})[0] ?? {
    attached: false,
    reason: "Camera endpoint has not been attached yet.",
    lastError: null
  };
}

function stateOf(node, behaviorName) {
  if (!node) return {};
  try {
    const fromStateOf = node.stateOf?.(behaviorName);
    if (fromStateOf) return fromStateOf;
  } catch {
    return {};
  }
  return node.state?.[behaviorName] ?? {};
}

function serializeError(error) {
  const detail = {};
  for (const key of Object.getOwnPropertyNames(error ?? {})) {
    if (["name", "message", "stack", "errors", "cause"].includes(key)) {
      continue;
    }
    try {
      detail[key] = error[key];
    } catch {
      detail[key] = "[unreadable]";
    }
  }
  return {
    name: error?.name ?? null,
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
    cause: error?.cause ? serializeError(error.cause) : null,
    details: detail,
    errors: Array.isArray(error?.errors) ? error.errors.map(serializeError) : []
  };
}
