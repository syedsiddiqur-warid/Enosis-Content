import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingButton } from "@/components/pending-button";
import { ProfileDocument } from "@/components/profile-document";
import { Badge, Card, PageHeader, buttonClass, cx } from "@/components/ui";
import { getDb } from "@/db";
import { aiCalls, requirements, resources } from "@/db/schema";
import { env } from "@/lib/env";
import { getProfile } from "@/lib/profiles/service";
import { PROFILE_STATUSES } from "@/lib/profiles/types";
import { recheckProfileAction, regenerateProfileAction, restoreVersionAction } from "../actions";
import { ProfileEditor } from "./profile-editor";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  ai: "Written by Claude",
  offline: "Offline draft (no AI)",
  admin_edit: "Edited by admin",
  ai_revision: "Revised by Claude",
};

const SEVERITY = { high: "red", medium: "amber", low: "neutral" } as const;

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; edit?: string; notice?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const data = await getProfile(db, id, sp.v ? Number(sp.v) : undefined).catch(() => null);
  if (!data?.version) notFound();
  const { profile, version, versions } = data;
  const [requirement] = await db.select().from(requirements).where(eq(requirements.id, profile.requirementId));
  const [resource] = await db.select().from(resources).where(eq(resources.id, profile.resourceId));
  const [call] = version.aiCallId ? await db.select().from(aiCalls).where(eq(aiCalls.id, version.aiCallId)) : [];
  const isCurrent = version.version === profile.currentVersion;
  const flags = [...(version.factCheck?.flags ?? [])].sort((a, b) => ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity));
  const highCount = flags.filter((f) => f.severity === "high").length;
  const recordChanged = resource && resource.updatedAt > version.createdAt;

  return (
    <>
      <PageHeader
        title={`${resource?.name ?? "Resource"}: ${requirement?.roleTitle ?? ""}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/requirements/${profile.requirementId}`} className="text-brand underline">
              {requirement?.clientName}
            </Link>
            <Badge tone="brand">{PROFILE_STATUSES.find((s) => s.key === profile.status)?.label ?? profile.status}</Badge>
            <Badge>
              v{version.version} · {SOURCE_LABEL[version.source] ?? version.source}
            </Badge>
            {!isCurrent && <Badge tone="amber">older version</Badge>}
          </span>
        }
        actions={
          isCurrent && !sp.edit ? (
            <>
              <Link href={`/admin/profiles/${id}?edit=1`} className={buttonClass("secondary")}>
                Edit
              </Link>
              <form action={recheckProfileAction.bind(null, id)}>
                <PendingButton variant="secondary" pendingLabel="Checking…">
                  Re-run fact check
                </PendingButton>
              </form>
              <form action={regenerateProfileAction.bind(null, id)}>
                <PendingButton pendingLabel="Generating… (up to a minute or two)">Regenerate</PendingButton>
              </form>
            </>
          ) : !isCurrent ? (
            <form action={restoreVersionAction.bind(null, id, version.version)}>
              <PendingButton variant="secondary" pendingLabel="Restoring…">
                Restore this version
              </PendingButton>
            </form>
          ) : null
        }
      />
      {sp.notice && <p className="mb-4 rounded-md bg-brand-soft p-3 text-sm text-brand">{sp.notice}</p>}
      {recordChanged && isCurrent && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {resource.name}&apos;s record changed after this version was written. Regenerate to use the latest information.
        </p>
      )}

      {sp.edit && isCurrent ? (
        <ProfileEditor profileId={id} initial={version.content} sourceProjects={version.resourceSnapshot.projects.map((p) => p.name)} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
          <div className="min-w-0 overflow-x-auto">
            <ProfileDocument content={version.content} />
          </div>

          <aside className="space-y-5">
            <Card className={cx("p-4 text-sm", highCount ? "border-red-200" : "")}>
              <h3 className="mb-1 font-semibold">Fact check</h3>
              <p className="mb-3 text-xs text-slate-500">
                {version.factCheck?.aiChecked ? "Rule-based checks and a Claude review against the record." : (version.factCheck?.aiError ?? "Rule-based checks only.")}
              </p>
              {flags.length === 0 ? (
                <p className="text-emerald-700">✓ Every claim traces back to the record.</p>
              ) : (
                <ul className="space-y-3">
                  {flags.map((f, i) => (
                    <li key={i} className="text-xs">
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={SEVERITY[f.severity]}>{f.severity}</Badge>
                        <span className="font-medium text-slate-700">{f.section}</span>
                        <span className="text-slate-400">· {f.source === "ai" ? "Claude" : "rules"}</span>
                      </div>
                      {f.quote && <p className="text-slate-500 italic">“{f.quote.length > 140 ? `${f.quote.slice(0, 140)}…` : f.quote}”</p>}
                      <p className="text-slate-700">{f.issue}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-4 text-sm">
              <h3 className="mb-1 font-semibold">Gaps (internal only)</h3>
              <p className="mb-2 text-xs text-slate-500">Requirement skills the record doesn&apos;t support. Never shown in the profile.</p>
              {version.gaps.length === 0 ? (
                <p className="text-slate-500">None.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {version.gaps.map((g) => (
                    <li key={g}>
                      <Badge tone="red">{g}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-4 text-sm">
              <h3 className="mb-2 font-semibold">Versions</h3>
              <ul className="space-y-1.5 text-xs">
                {versions.map((v) => (
                  <li key={v.version}>
                    <Link href={`/admin/profiles/${id}?v=${v.version}`} className={cx("hover:underline", v.version === version.version ? "font-semibold text-slate-900" : "text-brand")}>
                      v{v.version}
                    </Link>{" "}
                    · {SOURCE_LABEL[v.source] ?? v.source} · {v.createdAt.toLocaleString()}
                    {v.version === profile.currentVersion && <span className="text-emerald-700"> · current</span>}
                  </li>
                ))}
              </ul>
              {call && (
                <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  Model {call.model} · attempt {call.attempt} · {Math.round((call.durationMs ?? 0) / 1000)}s
                </p>
              )}
              {env.aiMode === "offline" && <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-amber-800">AI isn&apos;t configured. Add ANTHROPIC_API_KEY to use Claude.</p>}
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
