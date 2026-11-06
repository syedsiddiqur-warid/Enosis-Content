import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { messageTemplates } from "@/db/schema";

export type TemplateKey = "resource_update_request" | "reviewer_request" | "reminder" | "thank_you";

type TemplateDef = {
  key: TemplateKey;
  name: string;
  description: string;
  variables: string[];
  subject: string;
  body: string;
};

/** Default wording. Admins can change subject and body in Settings → Messages; "Reset" restores these. */
export const TEMPLATE_DEFS: TemplateDef[] = [
  {
    key: "resource_update_request",
    name: "Resource update request",
    description: "Sent to a resource with their secure link to review and update their information.",
    variables: ["name", "role_title", "client_industry", "due_date", "link", "sender_name"],
    subject: "Quick request: please review your profile information",
    body: `Hi {name},

I hope you're doing well! We have an exciting opportunity for a {role_title} role, and we'd love to put your profile forward.

Could you please take a few minutes to check your information using the link below? Everything is already filled in, including your tech stack, skills, experience, certifications, and projects, so you only need to review it and update or edit anything that has changed. No login is needed; just open the link.

{link}

It would be great if you could complete this by {due_date}. Thank you so much for your help!

Best regards,
{sender_name}`,
  },
  {
    key: "reviewer_request",
    name: "Reviewer request",
    description: "Sent to a reviewer with a secure link to the formatted profile (used from phase 6).",
    variables: ["reviewer_name", "resource_name", "role_title", "due_date", "link", "sender_name"],
    subject: "Profile ready for your review: {resource_name}, {role_title}",
    body: `Hi {reviewer_name},

A new talent profile for {resource_name} ({role_title}) is ready for your review. The link below opens the final formatted profile, exactly as it will be shared. You can read the full content and make edits or leave suggestions directly on the page. No login is needed.

{link}

We'd appreciate your feedback by {due_date}. Thank you!

Best regards,
{sender_name}`,
  },
  {
    key: "reminder",
    name: "Friendly reminder",
    description: "Sent once (by default) if a request isn't completed a few days before the due date.",
    variables: ["name", "task", "due_date", "link", "sender_name"],
    subject: "Gentle reminder: {task}",
    body: `Hi {name},

Just a gentle reminder about the request below. Whenever you have a moment, we'd really appreciate it. Thank you!

{link}

It would be great if you could complete this by {due_date}.

Best regards,
{sender_name}`,
  },
  {
    key: "thank_you",
    name: "Thank-you confirmation",
    description: "Shown on screen after a submission, and optionally emailed (see Settings).",
    variables: ["name", "sender_name"],
    subject: "Thank you, {name}!",
    body: `Thank you, {name}! Your information has been received.

Best regards,
{sender_name}`,
  },
];

export function templateDef(key: TemplateKey) {
  return TEMPLATE_DEFS.find((t) => t.key === key)!;
}

export async function getTemplate(db: Db, key: TemplateKey) {
  const [row] = await db.select().from(messageTemplates).where(eq(messageTemplates.key, key));
  const def = templateDef(key);
  return { ...def, subject: row?.subject ?? def.subject, body: row?.body ?? def.body, customized: !!row, updatedAt: row?.updatedAt, updatedBy: row?.updatedBy };
}

export async function saveTemplate(db: Db, key: TemplateKey, subject: string, body: string, by: string) {
  await db
    .insert(messageTemplates)
    .values({ key, subject, body, updatedBy: by })
    .onConflictDoUpdate({ target: messageTemplates.key, set: { subject, body, updatedBy: by, updatedAt: new Date() } });
}

export async function resetTemplate(db: Db, key: TemplateKey) {
  await db.delete(messageTemplates).where(eq(messageTemplates.key, key));
}

/** Fills {variables}. Unknown or empty variables are reported so the admin can see them before sending. */
export function fill(text: string, vars: Record<string, string | undefined>) {
  const missing = new Set<string>();
  const out = text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = vars[name];
    if (v === undefined || v === "") {
      missing.add(name);
      return match;
    }
    return v;
  });
  return { text: out, missing: [...missing] };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Simple branded HTML version of a plain-text message. A paragraph that is just the link becomes a button. */
export function toHtml(text: string, link?: string) {
  const paragraphs = text.split(/\n{2,}/).map((p) => {
    const trimmed = p.trim();
    if (link && trimmed === link) {
      return `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#1f4e8c;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Open your secure link</a></p><p style="font-size:12px;color:#64748b;word-break:break-all">Or copy this address into your browser: ${escapeHtml(link)}</p>`;
    }
    const html = escapeHtml(trimmed)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1f4e8c">$1</a>')
      .replace(/\n/g, "<br>");
    return `<p style="margin:0 0 16px">${html}</p>`;
  });
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1c2430;font-size:15px;line-height:1.55"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:28px"><p style="margin:0 0 20px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1f4e8c">Enosis Solutions</p>${paragraphs.join("")}</div></body></html>`;
}
