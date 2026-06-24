import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { readMatterResetRequest, scheduleMatterIdentityReset } from "../src/identityReset.js";

test("matter identity reset requires typed confirmation", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stream-to-matter-reset-"));
  const resetPath = path.join(dir, "reset.json");

  await assert.rejects(
    () => scheduleMatterIdentityReset({ confirmation: "reset" }, resetPath),
    /Type RESET MATTER/
  );
});

test("schedules matter identity reset request", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stream-to-matter-reset-"));
  const resetPath = path.join(dir, "reset.json");

  const reset = await scheduleMatterIdentityReset({ confirmation: "RESET MATTER" }, resetPath);
  const saved = await readMatterResetRequest(resetPath);

  assert.equal(reset.pending, true);
  assert.equal(saved.id, reset.id);
  assert.match(saved.warning, /rotated/);
});
