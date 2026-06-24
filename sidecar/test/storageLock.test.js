import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { cleanupStaleMatterStorageLock } from "../src/storageLock.js";

test("removes pre-start Matter lock before the sidecar acquires storage", async () => {
  const nodeDir = await mkdtemp(join(tmpdir(), "matter-lock-"));
  await writeFile(join(nodeDir, "matter.pid"), "19 old-token");
  await writeFile(join(nodeDir, "matter.lock"), "");

  const result = await cleanupStaleMatterStorageLock({ nodeDir });

  assert.equal(result.removed, true);
  assert.equal(result.reason, "pre-start-lock");
  await assert.rejects(() => stat(join(nodeDir, "matter.pid")));
  await assert.rejects(() => stat(join(nodeDir, "matter.lock")));
});

test("can disable pre-start Matter lock cleanup", async () => {
  const nodeDir = await mkdtemp(join(tmpdir(), "matter-lock-"));
  await writeFile(join(nodeDir, "matter.pid"), "42 token");
  await writeFile(join(nodeDir, "matter.lock"), "");

  const previous = process.env.MATTER_CLEAN_STALE_LOCKS;
  process.env.MATTER_CLEAN_STALE_LOCKS = "0";
  const result = await cleanupStaleMatterStorageLock({ nodeDir });
  if (previous === undefined) {
    delete process.env.MATTER_CLEAN_STALE_LOCKS;
  } else {
    process.env.MATTER_CLEAN_STALE_LOCKS = previous;
  }

  assert.equal(result.removed, false);
  assert.equal(result.reason, "disabled");
  assert.equal(await readFile(join(nodeDir, "matter.pid"), "utf8"), "42 token");
});
