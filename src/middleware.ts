import { NextResponse, type NextRequest } from "next/server";

// Cheap gate only; the admin layout validates the session against the database.
export function middleware(req: NextRequest) {
  if (!req.cookies.has("tps_session")) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
