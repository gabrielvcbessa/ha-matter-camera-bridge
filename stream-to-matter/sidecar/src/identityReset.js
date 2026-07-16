import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const CONFIRMATION = "RESET MATTER";

export function defaultMatterResetRequestPath() {
  if (process.env.MATTER_RESET_REQUEST_PATH) {
    return process.env.MATTER_RESET_REQUEST_PATH;
  }
  if (process.env.STREAM_TO_MATTER_CONFIG) {
    return join(dirname(process.env.STREAM_TO_MATTER_CONFIG), "matter-reset-request.json");
  }
  if (process.env.MATTER_PATH_ROOT) {
    return join(process.env.MATTER_PATH_ROOT, "matter-reset-request.json");
  }
  return join("/tmp", "stream-to-matter", "matter-reset-request.json");
}

export async function readMatterResetRequest(path = defaultMatterResetRequestPath()) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    return {
      pending: false,
      error: `Could not read reset request: ${error.message}`
    };
  }
}

export async function scheduleMatterIdentityReset(payload = {}, path = defaultMatterResetRequestPath()) {
  if (String(payload.confirmation ?? "") !== CONFIRMATION) {
    throw new Error(`Type ${CONFIRMATION} to confirm Matter identity reset.`);
  }

  const request = {
    pending: true,
    id: randomUUID(),
    requestedAt: new Date().toISOString(),
    warning: "Matter storage and commissioning credentials will be rotated on next add-on restart."
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(request, null, 2)}\n`, "utf8");
  return request;
}

export const MATTER_RESET_CONFIRMATION = CONFIRMATION;
