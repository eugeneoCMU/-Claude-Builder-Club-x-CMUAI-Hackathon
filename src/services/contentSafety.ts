import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("safety");

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `You are a content safety filter for an art installation about human vulnerability.
Respond ONLY with JSON, no prose, no code fences. Use one of:
  {"safe": true}
  {"safe": false, "reason": "..."}
Flag content that is: violent, sexually explicit, hateful, promoting self-harm,
or contains real personal information (phone numbers, addresses, full names paired with context).
Grief, loss, regret, darkness, and emotional pain are SAFE \u2014 they are the artistic point.
Complete in under 3 seconds.`;

export interface SafetyResult {
  safe: boolean;
  reason?: string;
}

function extractFirstText(
  content: Array<{ type: string; text?: string }>
): string {
  for (const block of content) {
    if (block.type === "text" && block.text) return block.text;
  }
  return "";
}

function parseSafety(raw: string): SafetyResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Safety model returned non-JSON: ${raw.slice(0, 120)}`);
  }
  const parsed = JSON.parse(match[0]) as {
    safe?: unknown;
    reason?: unknown;
  };
  if (typeof parsed.safe !== "boolean") {
    throw new Error(`Safety model returned unexpected shape: ${raw}`);
  }
  return {
    safe: parsed.safe,
    reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
  };
}

export async function screenContent(
  regret: string,
  proud: string,
  dream: string
): Promise<SafetyResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.contentSafetyTimeoutMs
  );

  try {
    const res = await anthropic.messages.create(
      {
        model: config.models.fast,
        max_tokens: 100,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Regret: ${regret}\nProud moment: ${proud}\nDream: ${dream}`,
          },
        ],
      },
      { signal: controller.signal }
    );
    const text = extractFirstText(res.content as Array<{ type: string; text?: string }>);
    const parsed = parseSafety(text);
    if (!parsed.safe) {
      log.warn(`Flagged entry: ${parsed.reason ?? "(no reason given)"}`);
    }
    return parsed;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      log.warn("Safety check timed out; treating as UNSAFE for operator review");
      return { safe: false, reason: "content safety check timed out" };
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
