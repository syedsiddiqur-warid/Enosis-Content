import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "@/db/client";
import { aiCalls } from "@/db/schema";
import { env } from "@/lib/env";

let client: Anthropic | null = null;
function anthropic() {
  // Reads ANTHROPIC_API_KEY (or other configured credentials) from the environment.
  client ??= new Anthropic();
  return client;
}

export type AiContext = {
  purpose: "generate" | "fact_check" | "revise";
  requirementId?: string;
  resourceId?: string;
  profileId?: string;
  resourceUpdatedAt?: Date;
  adminEmail: string;
  attempt?: number;
};

export type AiResult<T> = { ok: true; data: T; callId: string } | { ok: false; error: string; callId: string };

/**
 * One structured call to Claude. The response is constrained to `schema` (structured outputs) and
 * parsed with Zod; every call, its input, output, model, and timing is written to ai_calls.
 */
export async function callStructured<T>(db: Db, ctx: AiContext, schema: z.ZodType<T>, system: string, user: string): Promise<AiResult<T>> {
  const started = Date.now();
  const request = { model: env.anthropicModel, system, user, effort: "high" };
  const [log] = await db
    .insert(aiCalls)
    .values({
      purpose: ctx.purpose,
      requirementId: ctx.requirementId,
      resourceId: ctx.resourceId,
      profileId: ctx.profileId,
      resourceUpdatedAt: ctx.resourceUpdatedAt,
      model: env.anthropicModel,
      attempt: ctx.attempt ?? 1,
      request,
      status: "error",
      createdBy: ctx.adminEmail,
    })
    .returning({ id: aiCalls.id });

  const finish = async (fields: Partial<typeof aiCalls.$inferInsert>) => {
    await db.update(aiCalls).set({ ...fields, durationMs: Date.now() - started }).where(eq(aiCalls.id, log.id));
  };

  try {
    const response = await anthropic().beta.messages.parse({
      model: env.anthropicModel,
      max_tokens: 16000,
      // If a safety classifier declines, the API retries on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content: user }],
    });

    const usage = response.usage;
    if (response.stop_reason === "refusal") {
      const why = response.stop_details?.explanation ?? response.stop_details?.category ?? "no details";
      await finish({ status: "refusal", error: why, usage, response: response.content });
      return { ok: false, error: `Claude declined this request (${why}).`, callId: log.id };
    }
    if (response.stop_reason === "max_tokens") {
      await finish({ status: "invalid", error: "Output was cut off (max_tokens).", usage, response: response.content });
      return { ok: false, error: "The response was too long and got cut off.", callId: log.id };
    }
    if (!response.parsed_output) {
      await finish({ status: "invalid", error: "Output did not match the schema.", usage, response: response.content });
      return { ok: false, error: "The response didn't match the expected format.", callId: log.id };
    }
    await finish({ status: "ok", usage, response: response.parsed_output as object });
    return { ok: true, data: response.parsed_output as T, callId: log.id };
  } catch (err) {
    let message: string;
    if (err instanceof Anthropic.AuthenticationError) message = "The Anthropic API key is missing or invalid. Check ANTHROPIC_API_KEY in .env.";
    else if (err instanceof Anthropic.PermissionDeniedError) message = "This API key doesn't have access to the configured model.";
    else if (err instanceof Anthropic.NotFoundError) message = `Model "${env.anthropicModel}" was not found. Check ANTHROPIC_MODEL.`;
    else if (err instanceof Anthropic.RateLimitError) message = "Rate limited by the Anthropic API. Please try again in a minute.";
    else if (err instanceof Anthropic.BadRequestError) message = `The request was rejected: ${err.message}`;
    else if (err instanceof Anthropic.APIConnectionError) message = "Couldn't reach the Anthropic API. Check the network connection.";
    else if (err instanceof Anthropic.APIError) message = `Anthropic API error ${err.status ?? ""}: ${err.message}`;
    else if (err instanceof Error && /credentials|api key|apiKey/i.test(err.message)) message = "No Anthropic API key is configured. Add ANTHROPIC_API_KEY to .env.";
    else message = err instanceof Error ? err.message : String(err);
    await finish({ status: "error", error: message });
    return { ok: false, error: message, callId: log.id };
  }
}
