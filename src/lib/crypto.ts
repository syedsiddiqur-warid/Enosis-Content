import { createHash, randomBytes } from "node:crypto";

/** 256-bit URL-safe random token. Only its hash is ever stored. */
export function randomToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
