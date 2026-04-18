import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function parseCredentials(b64: string): Record<string, unknown> {
  try {
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (err) {
    throw new Error(
      "GOOGLE_SHEETS_CREDENTIALS_JSON must be valid base64-encoded JSON."
    );
  }
}

const sheetsId = optionalEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
const sheetsCredsB64 = optionalEnv("GOOGLE_SHEETS_CREDENTIALS_JSON");
const sheetsConfigured = Boolean(sheetsId && sheetsCredsB64);

export const config = {
  repoRoot,
  port: parseInt(process.env.PORT || "3000", 10),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "30000", 10),
  dbPath: path.resolve(
    repoRoot,
    process.env.DB_PATH || "./kintsugi.db"
  ),
  shardsDir: path.resolve(
    repoRoot,
    process.env.SHARDS_DIR || "./public/shards"
  ),
  csvFallbackPath: path.resolve(repoRoot, "./data/entries.csv"),

  anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
  openrouterApiKey: requireEnv("OPENROUTER_API_KEY"),

  sheetsConfigured,
  sheetsSpreadsheetId: sheetsId,
  sheetsCredentials: sheetsCredsB64 ? parseCredentials(sheetsCredsB64) : null,

  maxReflectionLength: parseInt(
    process.env.MAX_REFLECTION_LENGTH || "500",
    10
  ),
  contentSafetyTimeoutMs: parseInt(
    process.env.CONTENT_SAFETY_TIMEOUT_MS || "3000",
    10
  ),
  maxConnectionsPerShard: parseInt(
    process.env.MAX_CONNECTIONS_PER_SHARD || "3",
    10
  ),
  nearbyShardCount: parseInt(
    process.env.NEARBY_SHARDS_FOR_ANALYSIS || "10",
    10
  ),

  models: {
    fast: process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-4-5",
    reasoning: process.env.ANTHROPIC_MODEL_REASONING || "claude-sonnet-4-5",
    image:
      process.env.OPENROUTER_IMAGE_MODEL ||
      "google/gemini-2.5-flash-image-preview",
  },
} as const;
