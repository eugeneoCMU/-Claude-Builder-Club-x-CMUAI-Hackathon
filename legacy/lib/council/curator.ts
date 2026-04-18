import { z } from "zod";
import { curatorModel, structuredCallWithRetry } from "../claude";
import type {
  ArtistDraft,
  CuratorOutput,
  EmpathRead,
  Entry,
  PhilosopherGuidance,
  PoetDraft,
} from "../types";
import { CURATOR_SYSTEM } from "./personas";

const CouncilWhispersSchema = z.object({
  empath: z.string().min(15).max(180),
  poet: z.string().min(8).max(140),
  artist: z.string().min(15).max(180),
  philosopher: z.string().min(15).max(180),
  curator: z.string().min(15).max(180),
});

const CuratorSchema = z.object({
  svg: z.string().min(120).max(4000),
  palette: z
    .array(z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/))
    .min(3)
    .max(5),
  poeticLine: z.string().min(8).max(80),
  themes: z.array(z.string().min(2).max(28)).min(3).max(6),
  councilWhispers: CouncilWhispersSchema,
});

export async function runCurator(
  entry: Entry,
  empath: EmpathRead,
  poet: PoetDraft,
  artist: ArtistDraft,
  philosopher: PhilosopherGuidance
): Promise<CuratorOutput> {
  const user = `Three statements from one person:

REGRET: ${entry.regret.trim()}
PROUDEST: ${entry.proud.trim()}
DREAM: ${entry.dream.trim()}

THE EMPATH says:
- emotional core: ${empath.emotionalCore}
- tension: ${empath.tension}
- throughline: ${empath.throughline}

THE POET offers:
- primary line: "${poet.poeticLine}"
- alternates: ${poet.alternates.map((a) => `"${a}"`).join(", ")}

THE VISUAL ARTIST proposes:
- symbols: ${artist.symbols.map((s) => `"${s}"`).join(", ")}
- composition: ${artist.composition}
- palette: ${artist.palette.join(", ")}
- motion: ${artist.motion}

THE KINTSUGI PHILOSOPHER says:
- fracture location: ${philosopher.fractureLocation}
- gold treatment: ${philosopher.goldTreatment}
- what is honored: ${philosopher.whatIsHonored}

Synthesize. Return the final tile (complete SVG, palette, poetic line, themes, and a one-line whisper from each of the five voices).`;

  return structuredCallWithRetry(
    {
      model: curatorModel(),
      system: CURATOR_SYSTEM,
      user,
      schema: CuratorSchema,
      schemaName: "final_tile",
      schemaDescription:
        "The complete tile: SVG markup, palette, poetic line, themes, and council whispers.",
      maxTokens: 4000,
      temperature: 0.85,
    },
    validateCuratorOutput
  );
}

/**
 * Extra validation the Zod schema can't express: the SVG must be well-formed
 * enough to render, and must reference gold somewhere (the Kintsugi signature).
 */
function validateCuratorOutput(out: CuratorOutput): string | null {
  const svg = out.svg.trim();

  const rootMatch = svg.match(/^<svg\b([^>]*)>/i);
  if (!rootMatch) {
    return "svg must start with a <svg ...> root element.";
  }
  const rootAttrs = rootMatch[1];
  if (!/viewBox\s*=\s*"0 0 400 400"/i.test(rootAttrs)) {
    return 'The root <svg> element must include viewBox="0 0 400 400" directly on it (not on a nested svg).';
  }
  if (!svg.endsWith("</svg>")) {
    return "svg must end with </svg>.";
  }
  // Exactly one root svg — no trailing junk or second root.
  const rootCount = (svg.match(/<svg\b/gi) ?? []).length;
  const rootClose = (svg.match(/<\/svg>/gi) ?? []).length;
  if (rootCount !== rootClose) {
    return "svg <svg> / </svg> counts do not match.";
  }

  // Forbidden elements: anything that can inject text, run code, pull remote
  // content, or generally subvert the tile as a pure visual fragment.
  const forbidden: Array<[RegExp, string]> = [
    [/<script\b/i, "<script>"],
    [/<foreignObject\b/i, "<foreignObject>"],
    [/<image\b/i, "<image>"],
    [/<text\b/i, "<text>"],
    [/<tspan\b/i, "<tspan>"],
    [/<style\b/i, "<style>"],
  ];
  for (const [re, name] of forbidden) {
    if (re.test(svg)) {
      return `svg must not contain ${name} elements.`;
    }
  }
  // <use> is fine for internal references (href="#..."). External href is not.
  const useExternal = /<use\b[^>]*\bhref\s*=\s*"(?!#)[^"]*"/i.test(svg) ||
    /<use\b[^>]*\bxlink:href\s*=\s*"(?!#)[^"]*"/i.test(svg);
  if (useExternal) {
    return "svg <use> elements may only reference internal ids (href=\"#...\"), not external URLs.";
  }

  // Open/close tag balance sanity check (not perfect but catches obvious breakage).
  const openCount = (svg.match(/<(?!\/|!|\?)[a-zA-Z]/g) ?? []).length;
  const closeCount = (svg.match(/<\//g) ?? []).length;
  const selfClose = (svg.match(/\/>/g) ?? []).length;
  if (openCount !== closeCount + selfClose) {
    return "svg tag open/close counts look unbalanced.";
  }

  // The gold must appear somewhere — either a palette color in the gold family
  // or a direct hex reference.
  const goldFamily = /#(d4af37|f4e5a1|8a6b17|c9a227|e6be8a|b8860b|b89458|daa520)/i;
  const hasGoldToken = goldFamily.test(svg);
  const goldInPalette = out.palette.some((p) => goldFamily.test(p));
  if (!hasGoldToken && !goldInPalette) {
    return "The tile must carry gold somewhere — add a gold-family color (#d4af37, #f4e5a1, #8a6b17, or similar) in the SVG as the Kintsugi signature.";
  }

  return null;
}
