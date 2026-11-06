"use client";

import { useState } from "react";
import { inputClass } from "./ui";

/** Chips editor: type and press Enter or comma to add; paste a comma-separated list to add many. */
export function TagInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const items = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return;
    const seen = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const item of items) {
      if (!seen.has(item.toLowerCase())) {
        seen.add(item.toLowerCase());
        next.push(item);
      }
    }
    onChange(next);
    setDraft("");
  }

  return (
    <div className={`${inputClass} flex min-h-10 flex-wrap items-center gap-1.5 py-1.5`}>
      {value.map((tag, i) => (
        <span key={`${tag}-${i}`} className="inline-flex items-center gap-1 rounded bg-brand-soft px-2 py-0.5 text-xs text-brand">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            className="cursor-pointer text-brand/70 hover:text-brand"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        className="min-w-32 flex-1 border-0 bg-transparent p-0.5 text-sm outline-none"
        value={draft}
        placeholder={value.length === 0 ? placeholder : ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) add(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/[,\n]/.test(text)) {
            e.preventDefault();
            add(text);
          }
        }}
      />
    </div>
  );
}
