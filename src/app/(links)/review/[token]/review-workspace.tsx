"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ProfileDocument } from "@/components/profile-document";
import { Button, Card, Textarea, cx } from "@/components/ui";
import type { ProfileContent } from "@/lib/profiles/types";
import { addSuggestionAction, decideAction, deleteSuggestionAction, revertSectionAction, saveEditAction } from "../../review-actions";
import { SectionEditor } from "./section-editor";

export type Item = { id: string; kind: "edit" | "suggestion"; section: string; sectionLabel: string; quote: string; comment: string; beforeText: string; afterText: string; createdAt: string };

type Props = {
  token: string;
  working: ProfileContent;
  items: Item[];
  reviewerName: string;
  resourceName: string;
  roleTitle: string;
  dueDate?: string;
  round: number;
  labels: Record<string, string>;
};

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function ReviewWorkspace(props: Props) {
  const { token, working, items } = props;
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ section: string; quote: string; comment: string } | null>(null);
  const [selection, setSelection] = useState<{ section: string; quote: string; x: number; y: number } | null>(null);
  const [overall, setOverall] = useState("");
  const [confirm, setConfirm] = useState<"approve" | "changes" | null>(null);
  const [done, setDone] = useState<null | { decision: "approve" | "changes"; suggestions: number }>(null);
  const docRef = useRef<HTMLDivElement>(null);

  const suggestions = items.filter((i) => i.kind === "suggestion");
  const edits = items.filter((i) => i.kind === "edit");
  const editedSections = new Set(edits.map((e) => e.section));

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
      return res.ok;
    } catch {
      setError("Couldn't save just now. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Select text inside a section to suggest a change to that exact wording.
  const onMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!sel || !text || sel.rangeCount === 0) return setSelection(null);
    const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
    const section = node?.closest("[data-section]")?.getAttribute("data-section");
    if (!section || !docRef.current?.contains(node!)) return setSelection(null);
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSelection({ section, quote: text.slice(0, 500), x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  useEffect(() => {
    const clear = () => setSelection(null);
    window.addEventListener("scroll", clear, { passive: true });
    return () => window.removeEventListener("scroll", clear);
  }, []);

  const quotes = suggestions.map((s) => s.quote).filter((q) => q.length >= 3);
  const hl = (text: string): ReactNode => {
    if (!quotes.length || !text) return text;
    const parts = text.split(new RegExp(`(${quotes.map(escapeRe).join("|")})`, "g"));
    return parts.map((p, i) => (quotes.includes(p) ? <mark key={i} className="rounded bg-amber-100 px-0.5 text-inherit" title="Has a suggestion">{p}</mark> : p));
  };

  const wrap = (key: string, node: ReactNode) => {
    if (editing === key) {
      return (
        <div className="my-4">
          <SectionEditor
            content={working}
            section={key}
            saving={busy}
            onCancel={() => setEditing(null)}
            onSave={async (value) => {
              if (await run(() => saveEditAction(token, key, value))) setEditing(null);
            }}
          />
        </div>
      );
    }
    const count = suggestions.filter((s) => s.section === key).length;
    const edited = editedSections.has(key);
    return (
      <div data-section={key} className={cx("group relative -mx-3 rounded-md px-3 transition-colors hover:bg-slate-50", (count > 0 || edited) && "border-l-4 border-amber-300 bg-amber-50/30")}>
        <div className="absolute -top-1 right-1 z-10 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
          {edited && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-800">edited</span>}
          {count > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">{count} suggestion{count > 1 ? "s" : ""}</span>}
          <button type="button" className="cursor-pointer rounded bg-white px-2 py-0.5 text-[11px] font-medium text-brand shadow-sm ring-1 ring-slate-200" onClick={() => setEditing(key)}>
            Edit
          </button>
          <button type="button" className="cursor-pointer rounded bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 shadow-sm ring-1 ring-slate-200" onClick={() => setDraft({ section: key, quote: "", comment: "" })}>
            Suggest
          </button>
        </div>
        {node}
      </div>
    );
  };

  if (done) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</div>
        <h1 className="mb-2 text-xl font-semibold">Thank you, {props.reviewerName.split(" ")[0]}!</h1>
        <p className="text-sm leading-relaxed text-slate-600">
          {done.decision === "approve"
            ? "The profile is approved and locked. The team has been notified."
            : done.suggestions > 0
              ? "Your suggestions were sent. The profile will be revised, and you'll get a new link to check the next version."
              : "Your feedback was sent to the team."}
        </p>
        <p className="mt-4 text-sm text-slate-500">You can close this page now.</p>
      </Card>
    );
  }

  return (
    <div className="pb-10">
      <Card className="mb-5 p-5">
        <h1 className="text-xl font-semibold text-slate-900">
          Hi {props.reviewerName.split(" ")[0]}, please review {props.resourceName}&apos;s profile
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          For the <b>{props.roleTitle}</b> role{props.round > 1 && ` (round ${props.round})`}. This is exactly how it will be shared.
          {props.dueDate && <> We&apos;d appreciate your feedback by <b>{props.dueDate}</b>.</>}
        </p>
        <ul className="mt-3 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
          <li>
            ✏️ <b>Edit:</b> hover a section and click Edit to change the text yourself.
          </li>
          <li>
            💬 <b>Suggest:</b> select any text and click Suggest, or use Suggest on a section.
          </li>
        </ul>
      </Card>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div ref={docRef} onMouseUp={onMouseUp} onTouchEnd={() => setTimeout(onMouseUp, 50)} className="min-w-0">
          <ProfileDocument content={working} wrap={wrap} hl={hl} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">Your edits ({edits.length})</h2>
            {edits.length === 0 && <p className="text-slate-500">None yet.</p>}
            <ul className="space-y-3">
              {[...new Set(edits.map((e) => e.section))].map((section) => {
                const list = edits.filter((e) => e.section === section);
                return (
                  <li key={section} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">{props.labels[section] ?? list[0].sectionLabel}</span>
                      <button type="button" disabled={busy} className="cursor-pointer text-red-700 underline" onClick={() => run(() => revertSectionAction(token, section))}>
                        Undo
                      </button>
                    </div>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-slate-500">
                        {list.length} change{list.length > 1 ? "s" : ""} · see before/after
                      </summary>
                      <div className="mt-1 space-y-1">
                        <p className="rounded bg-red-50 px-2 py-1 whitespace-pre-line text-red-900 line-through decoration-red-300">{list[0].beforeText}</p>
                        <p className="rounded bg-emerald-50 px-2 py-1 whitespace-pre-line text-emerald-900">{list[list.length - 1].afterText}</p>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">Your suggestions ({suggestions.length})</h2>
            {suggestions.length === 0 && <p className="text-slate-500">None yet.</p>}
            <ul className="space-y-3">
              {suggestions.map((s) => (
                <li key={s.id} className="border-l-2 border-amber-300 pl-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">{props.labels[s.section] ?? s.sectionLabel}</span>
                    <button type="button" disabled={busy} className="cursor-pointer text-slate-500 underline" onClick={() => run(() => deleteSuggestionAction(token, s.id))}>
                      Delete
                    </button>
                  </div>
                  {s.quote && <p className="mt-0.5 text-slate-500 italic">“{s.quote}”</p>}
                  <p className="mt-0.5 text-slate-700">{s.comment}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="space-y-3 p-4 text-sm">
            <h2 className="font-semibold">Your decision</h2>
            <Textarea rows={3} value={overall} onChange={(e) => setOverall(e.target.value)} placeholder="Overall comment (optional)" />
            {confirm ? (
              <div className="rounded-md bg-slate-50 p-3">
                <p className="mb-2 text-slate-700">
                  {confirm === "approve"
                    ? `Approve and lock this profile${edits.length ? ", including your edits" : ""}?`
                    : suggestions.length
                      ? `Send ${suggestions.length} suggestion${suggestions.length > 1 ? "s" : ""} for revision?`
                      : "You haven't added any suggestions, so there's nothing for the revision to change. Send your feedback anyway?"}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError(null);
                      try {
                        const res = await decideAction(token, confirm, overall);
                        if (res.ok) setDone({ decision: confirm, suggestions: "suggestions" in res ? (res.suggestions ?? 0) : 0 });
                        else setError(res.error);
                      } catch {
                        setError("Couldn't send just now. Please try again.");
                      } finally {
                        setBusy(false);
                        setConfirm(null);
                      }
                    }}
                  >
                    {busy ? "Sending…" : "Yes, send"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => setConfirm("approve")} className="bg-emerald-700 hover:bg-emerald-800">
                  Approve
                </Button>
                <Button type="button" variant="secondary" onClick={() => setConfirm("changes")}>
                  Request changes
                </Button>
              </div>
            )}
          </Card>
        </aside>
      </div>

      {selection && !draft && (
        <button
          type="button"
          className="fixed z-30 -translate-x-1/2 -translate-y-full cursor-pointer rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
          style={{ left: selection.x, top: selection.y - 6 }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setDraft({ section: selection.section, quote: selection.quote, comment: "" });
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          💬 Suggest a change
        </button>
      )}

      {draft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Add a suggestion">
          <Card className="w-full max-w-md space-y-3 p-5">
            <h2 className="font-semibold">Suggestion for {props.labels[draft.section] ?? draft.section}</h2>
            {draft.quote && <p className="rounded bg-amber-50 px-2 py-1 text-sm text-slate-700 italic">“{draft.quote}”</p>}
            <Textarea
              rows={4}
              autoFocus
              value={draft.comment}
              onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
              placeholder='e.g. "Make this shorter" or "Emphasize the AWS work"'
            />
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={busy || !draft.comment.trim()}
                onClick={async () => {
                  if (await run(() => addSuggestionAction(token, draft.section, draft.quote, draft.comment))) setDraft(null);
                }}
              >
                {busy ? "Saving…" : "Add suggestion"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
