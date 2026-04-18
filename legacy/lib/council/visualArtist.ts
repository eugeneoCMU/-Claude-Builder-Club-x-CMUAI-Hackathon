import { z } from "zod";
import { advisorModel, structuredCall } from "../claude";
import type { Entry, EmpathRead, ArtistDraft } from "../types";
import { VISUAL_ARTIST_SYSTEM } from "./personas";

const ArtistSchema = z.object({
  symbols: z.array(z.string().min(4).max(120)).min(2).max(4),
  composition: z.string().min(30).max(280),
  palette: z
    .array(z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/))
    .min(3)
    .max(5),
  motion: z.string().min(15).max(180),
});

export async function runVisualArtist(
  entry: Entry,
  empath: EmpathRead
): Promise<ArtistDraft> {
  const user = `Three statements:

REGRET: ${entry.regret.trim()}
PROUDEST: ${entry.proud.trim()}
DREAM: ${entry.dream.trim()}

The Empath's reading:
- emotional core: ${empath.emotionalCore}
- tension: ${empath.tension}
- throughline: ${empath.throughline}

Propose the tile's symbols, composition, palette, and motion. Not SVG yet.`;

  return structuredCall({
    model: advisorModel(),
    system: VISUAL_ARTIST_SYSTEM,
    user,
    schema: ArtistSchema,
    schemaName: "artist_draft",
    schemaDescription:
      "Imagery brief for this tile: symbols, composition, palette, motion.",
    maxTokens: 700,
    temperature: 0.9,
  });
}
