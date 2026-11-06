import { LinkMessage, LinkShell } from "@/components/link-pages";
import { Card } from "@/components/ui";
import { getDb } from "@/db";
import { firstName, formatDueDate } from "@/lib/links/service";
import { openLink } from "@/lib/links/visit";
import { getResource } from "@/lib/resources/service";
import { SKILL_CATEGORIES, totalYears } from "@/lib/resources/types";
import { getSettings } from "@/lib/settings";
import { OtpForm } from "../../otp-form";

export const dynamic = "force-dynamic";

/** Resource update page, opened from the secure link. Phase 3 replaces the preview with the editable form. */
export default async function ResourceLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const view = await openLink(db, token, "resource_update");
  const { senderName } = await getSettings(db);

  if (view.state === "invalid") return <LinkMessage state="invalid" senderName={senderName} />;
  const name = firstName(view.request.recipientName);
  if (view.state !== "open" && view.state !== "otp") return <LinkMessage state={view.state} name={name} senderName={senderName} />;
  if (view.state === "otp")
    return (
      <LinkShell>
        <OtpForm token={token} name={name} />
      </LinkShell>
    );

  const resource = view.request.resourceId ? await getResource(db, view.request.resourceId) : null;
  if (!resource) return <LinkMessage state="invalid" senderName={senderName} />;
  const years = totalYears(resource);

  return (
    <LinkShell wide>
      <Card className="mb-5 p-7">
        <h1 className="text-2xl font-semibold text-slate-900">Hi {name}, thanks for opening this!</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          We&apos;d love to put your profile forward for a <b>{view.request.context.roleTitle}</b> role. Below is the information we currently have for you.
          {view.request.dueDate && <> If you could check it by <b>{formatDueDate(view.request.dueDate)}</b>, that would be great.</>}
        </p>
        <p className="mt-4 rounded-md bg-brand-soft p-3 text-sm text-brand">
          The form to update your details is being finished and will appear on this same page soon. You don&apos;t need to do anything yet.
        </p>
      </Card>

      <Card className="space-y-5 p-7 text-sm">
        <section>
          <h2 className="mb-1 font-semibold text-slate-900">{resource.name}</h2>
          <p className="text-slate-600">
            {[resource.title, years != null && `${years} years of experience`].filter(Boolean).join(" · ")}
          </p>
        </section>
        {resource.skills.length > 0 && (
          <section>
            <h3 className="mb-2 font-semibold text-slate-900">Tech stack</h3>
            <dl className="space-y-1">
              {SKILL_CATEGORIES.map((c) => {
                const items = resource.skills.filter((s) => s.category === c.key);
                return items.length ? (
                  <div key={c.key} className="grid grid-cols-[9rem_1fr] gap-2">
                    <dt className="text-slate-500">{c.label}</dt>
                    <dd>{items.map((s) => s.name).join(", ")}</dd>
                  </div>
                ) : null;
              })}
            </dl>
          </section>
        )}
        {resource.achievements.length > 0 && (
          <section>
            <h3 className="mb-2 font-semibold text-slate-900">Achievements and certifications</h3>
            <ul className="list-disc space-y-0.5 pl-5">
              {resource.achievements.map((a, i) => (
                <li key={i}>{a.name}</li>
              ))}
            </ul>
          </section>
        )}
        {resource.projects.length > 0 && (
          <section>
            <h3 className="mb-2 font-semibold text-slate-900">Projects</h3>
            <ul className="list-disc space-y-0.5 pl-5">
              {resource.projects.map((p, i) => (
                <li key={i}>{p.name}</li>
              ))}
            </ul>
          </section>
        )}
      </Card>
    </LinkShell>
  );
}
