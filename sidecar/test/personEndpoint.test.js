import test from "node:test";
import assert from "node:assert/strict";

import { personPresenceEndpointId, personPresenceEndpointOptions, personPresenceState } from "../src/personEndpoint.js";

test("builds a bridged person presence sensor endpoint for a camera", () => {
  const options = personPresenceEndpointOptions("front_door", "Front Door");

  assert.equal(personPresenceEndpointId("front_door"), "person_front_door");
  assert.equal(options.id, "person_front_door");
  assert.equal(options.bridgedDeviceBasicInformation.nodeLabel, "Front Door Person Presence");
  assert.equal(options.bridgedDeviceBasicInformation.productName, "Person Presence Sensor");
  assert.equal(options.occupancySensing.occupancy.occupied, false);
});

test("builds a Matter occupancy state patch", () => {
  assert.equal(personPresenceState(true).occupancySensing.occupancy.occupied, true);
  assert.equal(personPresenceState(false).occupancySensing.occupancy.occupied, false);
});

test("limits person presence node labels to the Matter 32 character constraint", () => {
  const options = personPresenceEndpointOptions("lab_camera", "Local Matter Lab Camera");

  assert.ok(options.bridgedDeviceBasicInformation.nodeLabel.length <= 32);
  assert.match(options.bridgedDeviceBasicInformation.nodeLabel, /^Local Matter Lab Camera P-[0-9a-f]{6}$/);
});
