import { z } from "zod";
import { advisorModel, structuredCall } from "../claude";
import type { Entry, EmpathRead } from "../types";
import { EMPATH_SYSTEM } from "./personas";

const EmpathSchema = z.object({
  emotionalCore: z.string().min(20).max(220),
  tension: z.string().min(15).max(180),
  throughline: z.string().min(15).max(180),
});

export async function runEmpath(entry: Entry): Promise<EmpathRead> {
  const user = buildUser(entry);
  return structuredCall({
    model: advisorModel(),
    system: EMPATH_SYSTEM,
    user,
    schema: EmpathSchema,
    schemaName: "empath_read",
    schemaDescription:
      "Your three-part reading of what is beneath this person's statements.",
    maxTokens: 600,
    temperature: 0.9,
  });
}

function buildUser(entry: Entry): string {
  return `Three statements from one person:

REGRET:
${entry.regret.trim()}

PROUDEST MOMENT:
${entry.proud.trim()}

UNFINISHED DREAM:
${entry.dream.trim()}

Listen carefully. Return your reading.`;
}
