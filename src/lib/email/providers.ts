import "server-only";

export type ProviderMessage = { from: string; to: string; subject: string; text: string; html?: string };
/** Sends one message and returns the provider's message id. Throws on failure. */
type Provider = (msg: ProviderMessage) => Promise<string | undefined>;

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/** "Name <addr@x.com>" → { name, email } */
function parseAddress(from: string) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { name: "", email: from.trim() };
}

async function check(res: Response, provider: string) {
  if (!res.ok) throw new Error(`${provider} responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const resend: Provider = async (msg) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: msg.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
  });
  await check(res, "Resend");
  return ((await res.json()) as { id?: string }).id;
};

const postmark: Provider = async (msg) => {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { "X-Postmark-Server-Token": requireEnv("POSTMARK_SERVER_TOKEN"), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ From: msg.from, To: msg.to, Subject: msg.subject, TextBody: msg.text, HtmlBody: msg.html, MessageStream: "outbound" }),
  });
  await check(res, "Postmark");
  return ((await res.json()) as { MessageID?: string }).MessageID;
};

const sendgrid: Provider = async (msg) => {
  const content = [{ type: "text/plain", value: msg.text }];
  if (msg.html) content.push({ type: "text/html", value: msg.html });
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${requireEnv("SENDGRID_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ personalizations: [{ to: [{ email: msg.to }] }], from: parseAddress(msg.from), subject: msg.subject, content }),
  });
  await check(res, "SendGrid");
  return res.headers.get("x-message-id") ?? undefined;
};

export const providers: Record<"resend" | "postmark" | "sendgrid", Provider> = { resend, postmark, sendgrid };
