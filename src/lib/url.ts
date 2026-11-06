import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * Base URL for emailed links. Production always uses APP_URL (never the Host header, which a
 * client controls). In development, use the address the app is actually running on, since the port can vary.
 */
export async function baseUrl() {
  if (env.isProduction) return env.appUrl;
  try {
    const h = await headers();
    const host = h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  } catch {
    // Outside a request (e.g. the reminder job): fall back to APP_URL.
  }
  return env.appUrl;
}
