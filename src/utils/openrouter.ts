import { config } from "../config.js";
import { createLogger } from "./logger.js";

const log = createLogger("openrouter");

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type AspectRatio =
  | "1:1"
  | "2:3"
  | "3:2"
  | "3:4"
  | "4:3"
  | "4:5"
  | "5:4"
  | "9:16"
  | "16:9";

export type ImageSize = "1K" | "2K" | "4K";

export interface GenerateImageOptions {
  prompt: string;
  aspectRatio?: AspectRatio;
  imageSize?: ImageSize;
  model?: string;
  signal?: AbortSignal;
}

export interface GeneratedImage {
  /** Raw base64 data (no `data:image/png;base64,` prefix). */
  base64: string;
  /** Detected MIME type (e.g. `image/png`). */
  mimeType: string;
  /** Accompanying text the model produced alongside the image, if any. */
  commentary: string;
}

interface OpenRouterImage {
  type?: string;
  image_url?: { url?: string };
  imageUrl?: { url?: string };
}

interface OpenRouterChoice {
  message?: {
    content?: unknown;
    images?: OpenRouterImage[];
  };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: { message?: string; code?: number | string };
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error(
      `Unexpected image URL format (expected base64 data URL): ${dataUrl.slice(0, 64)}...`
    );
  }
  return { mimeType: match[1], base64: match[2] };
}

function extractCommentary(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { type: string; text?: string } =>
          typeof part === "object" && part !== null && "type" in part
      )
      .map((part) => (part.type === "text" && part.text ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export async function generateImage(
  opts: GenerateImageOptions
): Promise<GeneratedImage> {
  const body = {
    model: opts.model ?? config.models.image,
    messages: [{ role: "user", content: opts.prompt }],
    modalities: ["image", "text"],
    image_config: {
      aspect_ratio: opts.aspectRatio ?? "1:1",
      image_size: opts.imageSize ?? "1K",
    },
    stream: false,
  };

  log.debug(
    `OpenRouter image request: model=${body.model} prompt=${opts.prompt.slice(0, 80)}...`
  );

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/eugeneoCMU/-Claude-Builder-Club-x-CMUAI-Hackathon",
      "X-Title": "Kintsugi Network",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `OpenRouter request failed (${res.status} ${res.statusText}): ${text.slice(0, 500)}`
    );
  }

  const json = (await res.json()) as OpenRouterResponse;

  if (json.error) {
    throw new Error(`OpenRouter error: ${json.error.message ?? "unknown"}`);
  }

  const choice = json.choices?.[0];
  const images = choice?.message?.images ?? [];
  if (images.length === 0) {
    throw new Error(
      "OpenRouter returned no image. Check that the model supports image output modality."
    );
  }

  const first = images[0];
  const url = first.image_url?.url ?? first.imageUrl?.url;
  if (!url) {
    throw new Error("OpenRouter image response missing image_url.url");
  }

  const { mimeType, base64 } = parseDataUrl(url);
  const commentary = extractCommentary(choice?.message?.content);

  return { base64, mimeType, commentary };
}
