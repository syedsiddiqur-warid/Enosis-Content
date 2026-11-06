"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { resources } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { createResourceUpdateRequest, LinkError, remindRequest, resendRequest, revokeRequest } from "@/lib/links/service";

const sendSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Select at least one resource."),
  roleTitle: z.string().trim().min(1, "Role title is required.").max(200),
  clientIndustry: z.string().trim().max(200).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date."),
});

export type SendState = { error?: string } | null;

export async function sendUpdateRequestsAction(_prev: SendState, formData: FormData): Promise<SendState> {
  const session = await requireAdmin();
  const parsed = sendSchema.safeParse({
    ids: formData.getAll("ids").map(String),
    roleTitle: formData.get("roleTitle"),
    clientIndustry: formData.get("clientIndustry") || undefined,
    dueDate: formData.get("dueDate"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.dueDate < new Date().toISOString().slice(0, 10)) return { error: "The due date can't be in the past." };

  const db = await getDb();
  const rows = await db.select().from(resources).where(inArray(resources.id, parsed.data.ids));
  const counts = { sent: 0, devInbox: 0, blocked: 0, failed: 0, skipped: 0 };
  const problems: string[] = [];
  for (const r of rows) {
    try {
      const { email } = await createResourceUpdateRequest(db, r, parsed.data, session.email);
      if (email.status === "sent") counts.sent++;
      else if (email.status === "dev_inbox") counts.devInbox++;
      else {
        counts[email.status]++;
        problems.push(`${r.name}: ${email.error ?? email.status}`);
      }
    } catch (err) {
      if (!(err instanceof LinkError)) throw err;
      counts.skipped++;
      problems.push(err.message);
    }
  }

  revalidatePath("/admin/requests");
  const qs = new URLSearchParams(Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => [k, String(v)]));
  if (problems.length) qs.set("problems", problems.slice(0, 5).join(" | "));
  redirect(`/admin/requests?${qs}`);
}

async function runRequestAction(formData: FormData, fn: (db: Awaited<ReturnType<typeof getDb>>, id: string, admin: string) => Promise<unknown>, done: string) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const back = String(formData.get("back") || "/admin/requests");
  const safeBack = back.startsWith("/admin/") ? back : "/admin/requests";
  let notice = done;
  try {
    const result = (await fn(await getDb(), id, session.email)) as { status?: string; error?: string } | undefined;
    if (result?.status === "blocked" || result?.status === "failed") notice = `Email ${result.status}: ${result.error ?? ""}`;
  } catch (err) {
    if (!(err instanceof LinkError)) throw err;
    notice = err.message;
  }
  revalidatePath("/admin", "layout");
  redirect(`${safeBack}${safeBack.includes("?") ? "&" : "?"}notice=${encodeURIComponent(notice)}`);
}

export async function resendAction(formData: FormData) {
  await runRequestAction(formData, resendRequest, "A fresh link was sent and the expiry extended.");
}

export async function remindAction(formData: FormData) {
  await runRequestAction(formData, (db, id, admin) => remindRequest(db, id, admin), "Reminder sent.");
}

export async function revokeAction(formData: FormData) {
  await runRequestAction(formData, (db, id, admin) => revokeRequest(db, id, admin), "The link was revoked. It no longer opens.");
}
