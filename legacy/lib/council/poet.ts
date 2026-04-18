import { z } from "zod";
import { advisorModel, structuredCall } from "../claude";
import type { Entry, EmpathRead, PoetDraft } from "../types";
import { POET_SYSTEM } from "./personas";

const PoetSchema = z.object({
  poeticLine: z.string().min(8).max(80),
  alternates: z.array(z.string().min(8).max(80)).min(3).max(4),
});

export async function runPoet(
  entry: Entry,
  empath: EmpathRead
): Promise<PoetDraft> {
  const user = `Three statements:

REGRET: ${entry.regret.trim()}
PROUDEST: ${entry.proud.trim()}
DREAM: ${entry.dream.trim()}

The Empath's reading:
- emotional core: ${empath.emotionalCore}
- tension: ${empath.tension}
- throughline: ${empath.throughline}

Give me the poetic line for this tile, plus three alternates.`;

  return structuredCall({
    model: advisorModel(),
    system: POET_SYSTEM,
    user,
    schema: PoetSchema,
    schemaName: "poet_draft",
    schemaDescription:
      "A primary poetic line (4-8 words) and three alternates for this tile.",
    maxTokens: 400,
    temperature: 1,
  });
}
