"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { runReminders } from "@/lib/links/service";

/** Runs the reminder job now, the same as the daily scheduler. Requests reminded in the last 20 hours are skipped. */
export async function runRemindersNowAction() {
  const session = await requireAdmin();
  const run = await runReminders(await getDb(), session.email);
  const parts = [`${run.sent} reminder${run.sent === 1 ? "" : "s"} sent`, run.blocked && `${run.blocked} blocked (unverified email)`, run.failed && `${run.failed} failed`].filter(Boolean);
  revalidatePath("/admin");
  redirect(`/admin?notice=${encodeURIComponent(`Reminder run: ${parts.join(", ")}.`)}`);
}
