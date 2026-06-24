import test from "node:test";
import assert from "node:assert/strict";
import { CAMERA_AGGREGATOR_ID, matterServerNodeOptions } from "../src/matterNode.js";

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

test("uses a stable aggregator endpoint id for bridged camera children", () => {
  assert.equal(CAMERA_AGGREGATOR_ID, "camera_bridge");
});

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
