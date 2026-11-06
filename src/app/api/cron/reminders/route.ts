import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { env } from "@/lib/env";
import { runReminders } from "@/lib/links/service";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  if (!env.cronSecret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.cronSecret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Sends due friendly reminders. Called daily by a scheduler (see vercel.json) with "Authorization: Bearer CRON_SECRET". */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runReminders(await getDb());
  return NextResponse.json(result);
}
