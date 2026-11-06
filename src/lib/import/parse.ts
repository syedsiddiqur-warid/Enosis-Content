/** Parsing helpers for the free-text answers in our Google Form export. */

const EMPTY = new Set(["", "n/a", "na", "n\\a", "-", "--", "none", "nil", "null", "not applicable"]);

export function isEmpty(value: string | undefined | null) {
  return EMPTY.has((value ?? "").trim().toLowerCase().replace(/\.$/, ""));
}

export function clean(value: string | undefined | null) {
  return isEmpty(value) ? "" : (value ?? "").trim();
}

/** Comma/semicolon/newline separated list → trimmed, de-duplicated items. Commas inside (…) are kept. */
export function splitList(value: string | undefined | null) {
  if (isEmpty(value)) return [];
  const items: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value!) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === "," || ch === ";" || ch === "\n")) {
      items.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  items.push(current);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.replace(/^[\s"'“”.]+|[\s"'“”.]+$/g, "").trim();
    if (isEmpty(item)) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

const BULLET_PREFIX = /^\s*(?:[-•*▪●–]|\d+[.)])\s*/;

/** "- a\n- b" or "- a - b" (all on one line) → ["a", "b"]. */
export function splitBullets(value: string | undefined | null) {
  if (isEmpty(value)) return [];
  const text = value!.trim();
  let lines = text.split(/\r?\n/);
  if (lines.filter((l) => l.trim()).length === 1 && /^\s*-\s/.test(text)) {
    lines = text.replace(/^\s*-\s+/, "").split(/\s+-\s+(?=\S)/);
  }
  return lines.map((l) => l.replace(BULLET_PREFIX, "").trim()).filter((l) => l && !isEmpty(l));
}

export function parseYears(value: string | undefined | null) {
  if (isEmpty(value)) return null;
  const m = value!.match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 0 && n <= 60 ? n : null;
}

/** "Project Name: X; Type: Y" → { name: X, type: Y }. Plain text is returned as the name. */
export function parseProjectName(value: string | undefined | null) {
  const raw = clean(value);
  const m = raw.match(/^\s*(?:project\s*name\s*:)\s*([\s\S]*?)\s*(?:[;|\n,]\s*(?:project\s*)?type\s*:\s*([\s\S]*))?$/i);
  if (m) return { name: m[1].trim(), type: (m[2] ?? "").trim() };
  return { name: raw, type: "" };
}

/** Splits "Project Brief: … Project Feature(s): …" into its two parts when the labels are present. */
export function parseBrief(value: string | undefined | null) {
  const raw = clean(value);
  const m = raw.match(/^\s*(?:project\s*brief\s*:)?\s*([\s\S]*?)\s*(?:project\s*features?\s*:\s*([\s\S]*))?$/i);
  if (!m) return { brief: raw, features: "" };
  return { brief: m[1].trim(), features: (m[2] ?? "").trim() };
}

/** "B.Sc. in CSE, University of X, 2019 - 2023" → degree, institution, year. */
export function parseEducation(value: string | undefined | null) {
  const raw = clean(value);
  if (!raw) return null;
  const yearMatch = raw.match(/((?:19|20)\d{2})(\s*[-–]\s*(?:(?:19|20)\d{2}|present|ongoing))?/i);
  const year = yearMatch ? yearMatch[0].replace(/\s*[-–]\s*/, " – ") : "";
  const rest = (yearMatch ? raw.replace(yearMatch[0], "") : raw).replace(/\byear\b\s*:?/i, "");
  const parts = rest
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return { degree: parts[0] ?? "", institution: parts.slice(1).join(", "), year };
}

export function guessAchievementKind(text: string): "certification" | "award" | "publication" | "other" {
  const t = text.toLowerCase();
  if (/publication|published|journal|conference|paper|acm|ieee/.test(t)) return "publication";
  if (/certif|specialization|licen[cs]e|course/.test(t)) return "certification";
  if (/champion|finalist|rank|award|winner|prize|medal|position|place|scored/.test(t)) return "award";
  return "other";
}

/** Google Forms timestamps look like "3/7/2026 1:17:10" (M/D/YYYY). Returns epoch ms, or 0. */
export function parseTimestamp(value: string | undefined | null) {
  const raw = clean(value);
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime();
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}
