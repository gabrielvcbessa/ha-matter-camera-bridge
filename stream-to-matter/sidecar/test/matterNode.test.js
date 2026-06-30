import test from "node:test";
import assert from "node:assert/strict";
import { CAMERA_AGGREGATOR_ID, MatterNodeRuntime, matterMdnsOptions, matterServerNodeOptions } from "../src/matterNode.js";

test("uses stable Matter operational port by default", () => {
  const previousPort = process.env.MATTER_PORT;
  const previousTcp = process.env.MATTER_TCP;
  try {
    delete process.env.MATTER_PORT;
    delete process.env.MATTER_TCP;

    const options = matterServerNodeOptions();

    assert.equal(options.network.port, 5540);
    assert.equal(options.network.tcp, false);
  } finally {
    restoreEnv("MATTER_PORT", previousPort);
    restoreEnv("MATTER_TCP", previousTcp);
  }
});

test("allows Matter TCP override for networks that need it", () => {
  const previousTcp = process.env.MATTER_TCP;
  try {
    process.env.MATTER_TCP = "true";

    const options = matterServerNodeOptions();

    assert.equal(options.network.tcp, true);
  } finally {
    restoreEnv("MATTER_TCP", previousTcp);
  }
});

test("allows Matter operational port override", () => {
  const previousPort = process.env.MATTER_PORT;
  try {
    process.env.MATTER_PORT = "5555";

    const options = matterServerNodeOptions();

    assert.equal(options.network.port, 5555);
  } finally {
    restoreEnv("MATTER_PORT", previousPort);
  }
});

test("allows Matter IPv4 listen address override", () => {
  const previousAddress = process.env.MATTER_LISTENING_ADDRESS_IPV4;
  try {
    process.env.MATTER_LISTENING_ADDRESS_IPV4 = "192.168.68.110";

    const options = matterServerNodeOptions();

    assert.equal(options.network.listeningAddressIpv4, "192.168.68.110");
  } finally {
    restoreEnv("MATTER_LISTENING_ADDRESS_IPV4", previousAddress);
  }
});

test("filters IPv6 mDNS records by default for Home Assistant routing", () => {
  const previousIpv6 = process.env.MATTER_MDNS_IPV6;
  try {
    delete process.env.MATTER_MDNS_IPV6;

    assert.deepEqual(matterMdnsOptions(), { interface: "", ipv6: false });
  } finally {
    restoreEnv("MATTER_MDNS_IPV6", previousIpv6);
  }
});

test("allows Matter mDNS interface and IPv6 override", () => {
  const previousInterface = process.env.MATTER_MDNS_INTERFACE;
  const previousIpv6 = process.env.MATTER_MDNS_IPV6;
  try {
    process.env.MATTER_MDNS_INTERFACE = "enp1s0";
    process.env.MATTER_MDNS_IPV6 = "true";

    assert.deepEqual(matterMdnsOptions(), { interface: "enp1s0", ipv6: true });
  } finally {
    restoreEnv("MATTER_MDNS_INTERFACE", previousInterface);
    restoreEnv("MATTER_MDNS_IPV6", previousIpv6);
  }
});

test("uses a stable aggregator endpoint id for bridged camera children", () => {
  assert.equal(CAMERA_AGGREGATOR_ID, "camera_bridge");
});

test("updates enabled person presence endpoint state", async () => {
  const runtime = new MatterNodeRuntime();
  const updates = [];
  runtime.personEndpointRefs = {
    camera: {
      set: async values => updates.push(values)
    }
  };
  runtime.personEndpoints = {
    camera: {
      attached: true,
      id: "person_camera",
      active: false,
      reason: "enabled",
      lastError: null
    }
  };

  const status = await runtime.updatePersonPresence("camera", true, "test");

  assert.equal(updates.length, 1);
  assert.equal(updates[0].occupancySensing.occupancy.occupied, true);
  assert.equal(status.active, true);
  assert.equal(runtime.status().personEndpoints.camera.active, true);
});

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
