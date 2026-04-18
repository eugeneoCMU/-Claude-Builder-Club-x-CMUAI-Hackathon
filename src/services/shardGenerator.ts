import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "../config.js";
import { createLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { generateImage } from "../utils/openrouter.js";

const log = createLogger("shard-gen");
const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const REASONING_SYSTEM = `You are an artist-in-residence for a kintsugi art installation.
Each visitor submits three short reflections (regret, proudest moment, half-finished dream).
Your job is to reason carefully through six steps, then produce a short, concrete image-
generation prompt that another model will use to paint a single square shard image.

The image will be 512x512, a close-up of a broken pottery fragment: surface texture,
visible cracks, aged glaze, raw clay edges, and luminous kintsugi gold seams. Always
purely abstract: never include text, faces, or recognizable figures. Only color,
texture, light, form.

You MUST reason through all six steps in prose, then output the final prompt inside
<image_prompt>...</image_prompt> tags. The prompt inside the tags must be a single
paragraph of 120-220 words, fully self-contained (the image model cannot read your
reasoning), concrete about palette, texture, crack pattern, gold placement,
lighting, and composition.`;

const STEP_TEMPLATE = `A visitor to our installation submitted these three reflections:

REGRET: "__REGRET__"
PROUDEST MOMENT: "__PROUD__"
HALF-FINISHED DREAM: "__DREAM__"

Follow these six steps. Show your thinking for each step as a brief prose paragraph.
Keep the whole reasoning under 600 words. End with the <image_prompt> tag.

\u2501\u2501\u2501 STEP 1 \u2014 EMOTIONAL ANALYSIS \u2501\u2501\u2501
- Texture of the regret (abandonment, failure, inaction, time, pride, love?) and its age.
- Quality of the proud moment (triumphant or quiet; public or private; peak or survival).
- Nature of the dream (tender, urgent, resigned, still alive).
- The underlying emotional note all three share.

\u2501\u2501\u2501 STEP 2 \u2014 CENTRAL VISUAL METAPHOR \u2501\u2501\u2501
Choose ONE abstract, elemental metaphor (fire, tide, root, ash, seed, fog, ice, ember,
current, soil) that can hold both fracture and beauty. Name it. Explain fit in one line.

\u2501\u2501\u2501 STEP 3 \u2014 COLOR PALETTE \u2501\u2501\u2501
Exactly 3 aged, glazed colors (pigment absorbed into ceramic, not fresh paint):
- BASE: earthy anchor (ochre, umber, slate, rust, raw sienna, clay, charcoal, indigo, storm green).
- ACCENT: the single vivid note that wants to break through.
- TRANSITION: bridge between regret and dream.
Each specified precisely (e.g. "slate blue with a grey undertone").

\u2501\u2501\u2501 STEP 4 \u2014 CERAMIC SURFACE & CRACK TEXTURE \u2501\u2501\u2501
- CRACK DENSITY: sparse / moderate (web of hairlines) / dense crazing.
- GLAZE FINISH: matte, crackled, pooled runny, or unglazed raw patches.
- AGE OF BREAK: fresh bright clay edge vs old darkened worn edge.
- GOLD ENTRY POINT: where the kintsugi seam seeps in (place at highest emotional tension).

\u2501\u2501\u2501 STEP 5 \u2014 COMPOSITION \u2501\u2501\u2501
- CENTER: focal point / what the metaphor anchors.
- EDGES: raw clay vs dissolving color at jagged borders.
- LIGHTING: single directional source (upper-left raking, center inner glow, edge lit).
- DEPTH: recessed or raised relief.
- GOLD PATH: trace the single most significant crack.

\u2501\u2501\u2501 STEP 6 \u2014 SYNTHESIZE IMAGE PROMPT \u2501\u2501\u2501
Now produce the image prompt. Reference Anselm Kiefer's textural surfaces, Japanese
raku color restraint, and Mark Rothko's emotional fields \u2014 but rendered as a ceramic
artifact, camera inches away. Be concrete about colors (with their specific qualifiers),
the crack pattern, the gold path, the lighting direction, and composition. No text,
faces, or figures \u2014 only abstract surface.

Output format:
  (prose reasoning for steps 1-5)

  <image_prompt>
  (120-220 words, single paragraph, standalone)
  </image_prompt>`;

function buildReasoningPrompt(
  regret: string,
  proud: string,
  dream: string
): string {
  return STEP_TEMPLATE.replace("__REGRET__", regret)
    .replace("__PROUD__", proud)
    .replace("__DREAM__", dream);
}

interface ReasoningResult {
  reasoning: string;
  imagePrompt: string;
}

function extractImagePrompt(raw: string): ReasoningResult {
  const match = raw.match(/<image_prompt>([\s\S]*?)<\/image_prompt>/i);
  if (!match) {
    throw new Error(
      "Reasoning model did not return <image_prompt> block; raw: " +
        raw.slice(0, 200)
    );
  }
  const imagePrompt = match[1].trim();
  const reasoning = raw.slice(0, match.index).trim();
  if (imagePrompt.length < 40) {
    throw new Error("Reasoning model produced a suspiciously short image prompt");
  }
  return { reasoning, imagePrompt };
}

async function runReasoning(
  regret: string,
  proud: string,
  dream: string
): Promise<ReasoningResult> {
  const res = await anthropic.messages.create({
    model: config.models.reasoning,
    max_tokens: 2048,
    system: REASONING_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildReasoningPrompt(regret, proud, dream),
      },
    ],
  });

  const textBlocks = (res.content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string);
  const joined = textBlocks.join("\n");
  return extractImagePrompt(joined);
}

export interface GeneratedShard {
  /** Public-facing URL (served by express static middleware). */
  imageUrl: string;
  /** Absolute path on disk. */
  imagePath: string;
  /** Claude's step 1-5 reasoning in prose. */
  reasoning: string;
  /** The prompt actually sent to Nano Banana. */
  imagePrompt: string;
}

export async function generateShardImage(
  shardId: string,
  regret: string,
  proud: string,
  dream: string
): Promise<GeneratedShard> {
  if (!fs.existsSync(config.shardsDir)) {
    fs.mkdirSync(config.shardsDir, { recursive: true });
  }

  const { reasoning, imagePrompt } = await withRetry(
    () => runReasoning(regret, proud, dream),
    { maxAttempts: 3, baseDelayMs: 750 }
  );

  log.info(`Reasoning done for shard ${shardId}; requesting Nano Banana image`);

  const { base64 } = await withRetry(
    () =>
      generateImage({
        prompt: imagePrompt,
        aspectRatio: "1:1",
        imageSize: "1K",
      }),
    { maxAttempts: 3, baseDelayMs: 1500 }
  );

  const rawBuffer = Buffer.from(base64, "base64");

  const imagePath = path.join(config.shardsDir, `${shardId}.png`);
  await sharp(rawBuffer)
    .resize(512, 512, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 8 })
    .toFile(imagePath);

  log.info(`Saved shard image: ${imagePath}`);

  return {
    imageUrl: `/shards/${shardId}.png`,
    imagePath,
    reasoning,
    imagePrompt,
  };
}
