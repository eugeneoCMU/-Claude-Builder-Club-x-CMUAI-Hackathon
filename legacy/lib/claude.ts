import Anthropic from "@anthropic-ai/sdk";
import type { Model } from "@anthropic-ai/sdk/resources/messages/messages";
import { z, type ZodTypeAny } from "zod";
import { zodToJsonSchema } from "./zodToJsonSchema";

/**
 * A small, focused wrapper around the Anthropic SDK that gives us
 * reliable structured output by forcing the model to call a single
 * tool whose schema is our Zod schema. This is the most reliable
 * approach on the current SDK version and avoids any free-form JSON
 * parsing.
 */

const SONNET: Model = "claude-sonnet-4-5";
const HAIKU: Model = "claude-haiku-4-5";

export const MODELS = {
  sonnet: SONNET,
  haiku: HAIKU,
} as const;

export type ModelTier = keyof typeof MODELS;

let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and fill it in."
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * Advisors (Empath, Poet, Artist, Philosopher) can optionally run on Haiku
 * to cut cost. The Curator always runs on Sonnet — the final synthesis and
 * SVG generation need the stronger model.
 */
export function advisorModel(): Model {
  const useHaiku = process.env.KINTSUGI_USE_HAIKU_FOR_ADVISORS === "true";
  return useHaiku ? HAIKU : SONNET;
}

export function curatorModel(): Model {
  return SONNET;
}

export interface StructuredCallOptions<T extends ZodTypeAny> {
  model: Model;
  system: string;
  user: string;
  schema: T;
  schemaName: string;
  schemaDescription: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Make a Claude call that is guaranteed to return valid JSON matching
 * the given Zod schema. Uses tool-use forcing under the hood.
 */
export async function structuredCall<T extends ZodTypeAny>(
  opts: StructuredCallOptions<T>
): Promise<z.infer<T>> {
  const client = anthropic();
  const jsonSchema = zodToJsonSchema(opts.schema);

  const response = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 1,
    system: opts.system,
    tools: [
      {
        name: opts.schemaName,
        description: opts.schemaDescription,
        input_schema: jsonSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: opts.schemaName },
    messages: [{ role: "user", content: opts.user }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      `Claude did not return a tool_use block. Got: ${JSON.stringify(
        response.content
      )}`
    );
  }

  const parsed = opts.schema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(
      `Claude's output failed schema validation:\n${JSON.stringify(
        parsed.error.issues,
        null,
        2
      )}\n---\nRaw output:\n${JSON.stringify(toolUse.input, null, 2)}`
    );
  }

  return parsed.data;
}

/**
 * Retry a structured call once if the first attempt throws.
 * The retry prompt includes the error message so the model can self-correct
 * (e.g. when SVG validation fails).
 */
export async function structuredCallWithRetry<T extends ZodTypeAny>(
  opts: StructuredCallOptions<T>,
  extraValidation?: (result: z.infer<T>) => string | null
): Promise<z.infer<T>> {
  try {
    const result = await structuredCall(opts);
    const extraErr = extraValidation?.(result);
    if (extraErr) {
      throw new Error(extraErr);
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const retryUser = `${opts.user}

---
Your previous attempt failed with this error:
${msg}

Please return a corrected response that addresses the error exactly.`;
    const result = await structuredCall({ ...opts, user: retryUser });
    const extraErr = extraValidation?.(result);
    if (extraErr) {
      throw new Error(`Retry also failed extra validation: ${extraErr}`);
    }
    return result;
  }
}
