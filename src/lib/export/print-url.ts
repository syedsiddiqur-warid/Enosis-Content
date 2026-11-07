import "server-only";
import { sign, verifySignature } from "@/lib/crypto";
import { env } from "@/lib/env";
import { baseUrl } from "@/lib/url";

const TTL_MS = 2 * 60 * 1000;

function payload(profileId: string, version: number, exp: number) {
  return `print:${profileId}:${version}:${exp}`;
}

/** A URL to the print view that works for two minutes, for the headless browser. */
export async function signedPrintUrl(profileId: string, version: number) {
  const exp = Date.now() + TTL_MS;
  const sig = sign(payload(profileId, version, exp), env.secretKey);
  // INTERNAL_URL lets the headless browser reach the app directly (e.g. inside a container) instead of going out and back in.
  const base = env.internalUrl || (await baseUrl());
  return `${base}/print/profiles/${profileId}?v=${version}&exp=${exp}&sig=${sig}`;
}

export function verifyPrintSignature(profileId: string, version: number, exp: number, sig: string) {
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return verifySignature(payload(profileId, version, exp), sig, env.secretKey);
}
