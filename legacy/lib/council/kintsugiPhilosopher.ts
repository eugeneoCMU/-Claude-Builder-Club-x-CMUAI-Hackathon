import { z } from "zod";
import { advisorModel, structuredCall } from "../claude";
import type { Entry, EmpathRead, PhilosopherGuidance } from "../types";
import { KINTSUGI_PHILOSOPHER_SYSTEM } from "./personas";

const PhilosopherSchema = z.object({
  fractureLocation: z.string().min(20).max(260),
  goldTreatment: z.string().min(25).max(300),
  whatIsHonored: z.string().min(20).max(220),
});

export async function runKintsugiPhilosopher(
  entry: Entry,
  empath: EmpathRead
): Promise<PhilosopherGuidance> {
  const user = `Three statements:

REGRET: ${entry.regret.trim()}
PROUDEST: ${entry.proud.trim()}
DREAM: ${entry.dream.trim()}

The Empath's reading:
- emotional core: ${empath.emotionalCore}
- tension: ${empath.tension}
- throughline: ${empath.throughline}

Where is the fracture? Where does gold enter this tile? What does this tile refuse to hide?`;

  return structuredCall({
    model: advisorModel(),
    system: KINTSUGI_PHILOSOPHER_SYSTEM,
    user,
    schema: PhilosopherSchema,
    schemaName: "philosopher_guidance",
    schemaDescription:
      "Guidance on fracture, gold treatment, and what the tile honors.",
    maxTokens: 600,
    temperature: 0.85,
  });
}
