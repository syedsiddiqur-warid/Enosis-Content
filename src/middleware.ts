import { NextResponse, type NextRequest } from "next/server";

// Per-instance, in-memory limit for the public link pages: enough to stop token guessing
// and scripted hammering. Use a shared store (e.g. Upstash) if running many instances.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS = 60;
const hits = new Map<string, { count: number; reset: number }>();

function rateLimited(ip: string) {
  const now = Date.now();
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_REQUESTS;
}

function isLinkPage(pathname: string) {
  return pathname.startsWith("/r/") || pathname.startsWith("/review/");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isLinkPage(pathname)) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
    if (rateLimited(ip)) {
      return new NextResponse("Too many requests. Please wait a few minutes and try again.", {
        status: 429,
        headers: { "Retry-After": "300", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    const res = NextResponse.next();
    // Keep tokens out of search engines, caches, and Referer headers.
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Referrer-Policy", "no-referrer");
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  // Cheap gate only; the admin layout validates the session against the database.
  if (!req.cookies.has("tps_session")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/r/:path*", "/review/:path*"] };
