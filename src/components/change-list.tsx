import type { FieldChange, SectionDiff } from "@/lib/resources/diff";
import { Card } from "./ui";

const EMPTY = <div className="text-xs text-slate-400 italic">empty</div>;

/** Multi-line values (bullet lists) are compared line by line, so only added and removed lines are highlighted. */
function LineDiff({ before, after }: { before: string; after: string }) {
  const b = before.split("\n");
  const a = after.split("\n");
  const bSet = new Set(b);
  const aSet = new Set(a);
  return (
    <>
      <div className="space-y-0.5">
        {before ? b.map((l, i) => <div key={i} className={aSet.has(l) ? "px-2 text-slate-500" : "rounded bg-red-50 px-2 text-red-900 line-through decoration-red-300"}>{l}</div>) : EMPTY}
      </div>
      <div className="space-y-0.5">
        {after ? a.map((l, i) => <div key={i} className={bSet.has(l) ? "px-2 text-slate-500" : "rounded bg-emerald-50 px-2 text-emerald-900"}>{l}</div>) : EMPTY}
      </div>
    </>
  );
}

function FieldRows({ fields }: { fields: FieldChange[] }) {
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.label} className="grid gap-2 text-sm sm:grid-cols-[11rem_1fr_1fr]">
          <div className="font-medium text-slate-600">{f.label}</div>
          {f.before.includes("\n") || f.after.includes("\n") ? (
            <LineDiff before={f.before} after={f.after} />
          ) : (
            <>
              {f.before ? <div className="rounded bg-red-50 px-2 py-1 whitespace-pre-line text-red-900 line-through decoration-red-300">{f.before}</div> : EMPTY}
              {f.after ? <div className="rounded bg-emerald-50 px-2 py-1 whitespace-pre-line text-emerald-900">{f.after}</div> : EMPTY}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function ColumnHeads() {
  return (
    <div className="mb-2 hidden gap-2 text-xs tracking-wide text-slate-400 uppercase sm:grid sm:grid-cols-[11rem_1fr_1fr]">
      <span />
      <span>Before</span>
      <span>After</span>
    </div>
  );
}

const KIND = {
  added: { label: "Added", cls: "bg-emerald-50 text-emerald-800" },
  removed: { label: "Removed", cls: "bg-red-50 text-red-800" },
  changed: { label: "Changed", cls: "bg-amber-50 text-amber-800" },
};

/** Highlighted before/after view of what changed in a resource record. */
export function ChangeList({ diffs }: { diffs: SectionDiff[] }) {
  if (diffs.length === 0) return <p className="text-sm text-slate-600">No changes. Everything was confirmed as still correct.</p>;
  return (
    <div className="space-y-4">
      {diffs.map((d) => (
        <Card key={d.section} className="p-5">
          <h3 className="mb-3 text-base font-semibold text-slate-900">{d.title}</h3>
          {d.fields.length > 0 && (
            <>
              <ColumnHeads />
              <FieldRows fields={d.fields} />
            </>
          )}
          {d.items.length > 0 && (
            <ul className="mt-3 space-y-3">
              {d.items.map((it, i) => (
                <li key={i} className={it.fields.length ? "rounded-md border border-slate-200 p-3" : ""}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND[it.kind].cls}`}>{KIND[it.kind].label}</span>
                    <span className={it.kind === "removed" ? "text-slate-500 line-through" : "font-medium text-slate-800"}>{it.label}</span>
                  </div>
                  {it.fields.length > 0 && (
                    <div className="mt-3">
                      <ColumnHeads />
                      <FieldRows fields={it.fields} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
