import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_RESET_PATH = process.env.MATTER_RESET_REQUEST_PATH ?? "/data/matter-reset-request.json";
const CONFIRMATION = "RESET MATTER";

export async function readMatterResetRequest(path = DEFAULT_RESET_PATH) {
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

export async function scheduleMatterIdentityReset(payload = {}, path = DEFAULT_RESET_PATH) {
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
