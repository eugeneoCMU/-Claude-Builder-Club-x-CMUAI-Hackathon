/**
 * Placeholder color derivation used for shards that have not finished
 * generating yet. We peek at a handful of emotional keywords in the
 * reflection text to pick a base + accent hue so the colored polygon
 * already feels thematically connected to the final image.
 */

export const GOLD = 0xffd700;
export const GOLD_WARM = 0xd4a017;
export const BACKGROUND = 0x0e0500;

interface ColorPair {
  base: number;
  accent: number;
}

const FALLBACK: ColorPair = { base: 0x4a3120, accent: 0xd0893a };

const LEXICON: Array<{ keywords: RegExp; base: number; accent: number }> = [
  {
    keywords:
      /\b(mother|father|parent|grandmother|grandfather|family|home|inheritance|lineage)\b/i,
    base: 0x3a2a20,
    accent: 0xc88a52,
  },
  {
    keywords: /\b(grief|loss|died|dying|death|gone|absent|empty|silence)\b/i,
    base: 0x2a2a32,
    accent: 0x7e879a,
  },
  {
    keywords: /\b(fire|fierce|anger|burn|burned|storm|intense|wild)\b/i,
    base: 0x3f1f10,
    accent: 0xd45a2b,
  },
  {
    keywords: /\b(calm|quiet|tender|soft|gentle|small|private)\b/i,
    base: 0x3a3836,
    accent: 0xb89e7a,
  },
  {
    keywords: /\b(hope|dream|begin|start|open|new|light|future)\b/i,
    base: 0x2d2b3d,
    accent: 0xe4b858,
  },
  {
    keywords:
      /\b(art|paint|painting|music|song|book|write|poetry|film)\b/i,
    base: 0x2a2038,
    accent: 0xc85a7c,
  },
  {
    keywords:
      /\b(work|career|job|quit|school|degree|study|graduat)\b/i,
    base: 0x30302a,
    accent: 0xb4a040,
  },
  {
    keywords: /\b(love|friend|partner|relationship|marriage)\b/i,
    base: 0x3c1f2a,
    accent: 0xd98a70,
  },
];

export function placeholderColors(text: string): ColorPair {
  for (const entry of LEXICON) {
    if (entry.keywords.test(text)) {
      return { base: entry.base, accent: entry.accent };
    }
  }
  return FALLBACK;
}
