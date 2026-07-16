import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { defaultMatterResetRequestPath, readMatterResetRequest, scheduleMatterIdentityReset } from "../src/identityReset.js";

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

test("defaults matter identity reset request beside active camera config", async () => {
  const previousResetPath = process.env.MATTER_RESET_REQUEST_PATH;
  const previousConfig = process.env.STREAM_TO_MATTER_CONFIG;
  const previousRoot = process.env.MATTER_PATH_ROOT;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stream-to-matter-reset-default-"));

  delete process.env.MATTER_RESET_REQUEST_PATH;
  delete process.env.MATTER_PATH_ROOT;
  process.env.STREAM_TO_MATTER_CONFIG = path.join(dir, "cameras.json");
  try {
    assert.equal(defaultMatterResetRequestPath(), path.join(dir, "matter-reset-request.json"));
    const reset = await scheduleMatterIdentityReset({ confirmation: "RESET MATTER" });
    const saved = await readMatterResetRequest();
    assert.equal(saved.id, reset.id);
  } finally {
    if (previousResetPath === undefined) delete process.env.MATTER_RESET_REQUEST_PATH;
    else process.env.MATTER_RESET_REQUEST_PATH = previousResetPath;
    if (previousConfig === undefined) delete process.env.STREAM_TO_MATTER_CONFIG;
    else process.env.STREAM_TO_MATTER_CONFIG = previousConfig;
    if (previousRoot === undefined) delete process.env.MATTER_PATH_ROOT;
    else process.env.MATTER_PATH_ROOT = previousRoot;
  }
});
