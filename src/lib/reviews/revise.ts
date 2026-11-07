import "server-only";
import { z } from "zod";
import type { Db } from "@/db/client";
import type { ReviewItemRow } from "@/db/schema";
import { callStructured } from "@/lib/profiles/ai";
import { generationSystemPrompt, recordForAi } from "@/lib/profiles/generate";
import { getSection, sectionKeys, sectionLabel, setSection } from "@/lib/profiles/sections";
import { profileContentSchema, type ProfileContent } from "@/lib/profiles/types";
import type { ResourceInput } from "@/lib/resources/types";
import type { AiSettings } from "@/lib/settings";

const revisionOutputSchema = z.object({ profile: profileContentSchema });

type ReviseInput = {
  content: ProfileContent;
  record: ResourceInput;
  suggestions: ReviewItemRow[];
  editedSections: string[];
  overallComment: string;
  ai: AiSettings;
  ctx: { requirementId: string; resourceId: string; profileId: string; adminEmail: string };
};

/**
 * Revises only the sections that have reviewer suggestions, under the same no-invention rules.
 * Every other section, including the reviewer's direct edits, is copied back from the input
 * after the call, so the model can't change them even if it tries.
 */
export async function reviseProfile(db: Db, input: ReviseInput): Promise<{ content: ProfileContent; callId: string } | { error: string }> {
  const { content, suggestions } = input;
  const targets = [...new Set(suggestions.map((s) => s.section))].filter((k) => getSection(content, k) !== undefined);
  if (targets.length === 0) return { error: "The suggested sections no longer exist in the profile." };
  const locked = sectionKeys(content).filter((k) => !targets.includes(k));

  const system = `${generationSystemPrompt(input.ai)}

You are now revising an existing profile after a reviewer's feedback. Change only the sections listed under <sections_to_revise>, following the reviewer's suggestions as closely as the hard rules allow. If a suggestion asks for something the record doesn't support, don't add it; keep that part as it is. Return the complete profile, with every other section exactly as given.`;

  const user = `<resource_record>
${JSON.stringify(recordForAi(input.record), null, 2)}
</resource_record>

<current_profile>
${JSON.stringify(content, null, 2)}
</current_profile>

<sections_to_revise>
${targets.map((k) => `- ${sectionLabel(content, k)} (${k})`).join("\n")}
</sections_to_revise>

<reviewer_suggestions>
${suggestions.map((s) => `- [${s.sectionLabel}]${s.quote ? ` On "${s.quote}":` : ""} ${s.comment}`).join("\n")}
</reviewer_suggestions>
${input.overallComment ? `\n<reviewer_overall_comment>\n${input.overallComment}\n</reviewer_overall_comment>\n` : ""}
<do_not_change>
${locked.map((k) => `- ${sectionLabel(content, k)}${input.editedSections.includes(k) ? " (edited directly by the reviewer)" : ""}`).join("\n")}
</do_not_change>

Projects are identified by their position in the "projects" array; keep the same number and order of projects.`;

  const result = await callStructured(db, { purpose: "revise", ...input.ctx }, revisionOutputSchema, system, user);
  if (!result.ok) return { error: result.error };

  // Take only the targeted sections from the model's output.
  let revised = content;
  for (const key of targets) {
    const value = getSection(result.data.profile, key);
    if (value !== undefined) revised = setSection(revised, key, value);
  }
  // A project keeps its link to the record project it came from.
  revised.projects = revised.projects.map((p, i) => ({ ...p, sourceProjectName: content.projects[i]?.sourceProjectName ?? p.sourceProjectName }));
  return { content: revised, callId: result.callId };
}
