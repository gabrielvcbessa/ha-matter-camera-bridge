import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_NODE_DIR = "/root/.matter/node0";

export async function cleanupStaleMatterStorageLock(options = {}) {
  if (process.env.MATTER_CLEAN_STALE_LOCKS === "0") {
    return { checked: false, removed: false, reason: "disabled" };
  }

  const nodeDir = options.nodeDir ?? process.env.MATTER_STORAGE_NODE_DIR ?? DEFAULT_NODE_DIR;
  const pidPath = join(nodeDir, "matter.pid");
  const lockPath = join(nodeDir, "matter.lock");

  let info;
  try {
    info = parseLockInfo(await readFile(pidPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      return { checked: true, removed: false, reason: `pid-read-failed:${error.code ?? error.message}` };
    }
  }

  await mkdir(nodeDir, { recursive: true });
  await Promise.all([rm(pidPath, { force: true }), rm(lockPath, { force: true })]);
  return { checked: true, removed: true, reason: staleReason(info), ownerPid: info?.pid ?? null };
}

function parseLockInfo(content) {
  const [pidText, token] = String(content ?? "").trim().split(/\s+/);
  const pid = Number.parseInt(pidText, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    return null;
  }
  return { pid, token };
}

function staleReason(info) {
  if (!info) {
    return "invalid-pid-file";
  }
  return "pre-start-lock";
}
