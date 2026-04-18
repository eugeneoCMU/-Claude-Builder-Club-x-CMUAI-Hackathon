import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { createLogger } from "../utils/logger.js";
import {
  getCompleteShards,
  insertConnection,
} from "../db/database.js";
import type { Connection, Shard } from "../types.js";

const log = createLogger("connections");
const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `You are a poet finding hidden connections between strangers' confessions.
You receive a new visitor's three reflections (regret, proud, dream) and up to 10 recent
other visitors' reflections. Identify only pairings that share a real thematic echo
(loss, longing, joy, transformation, inheritance, repair, held-complexity). Skip weak
or surface matches.

For each real connection, write a poetic phrase of no more than 50 characters. Think
"two lives, one silence" or "the same wound, different names".

Respond ONLY with a JSON array, no prose, no code fences. Shape:
  [{"shard_id": "...", "phrase": "...", "theme": "..."}]
Return [] if no strong connections exist. Maximum __MAX__ connections.`;

interface RawConnection {
  shard_id: unknown;
  phrase: unknown;
  theme?: unknown;
}

function extractFirstText(
  content: Array<{ type: string; text?: string }>
): string {
  for (const block of content) {
    if (block.type === "text" && block.text) return block.text;
  }
  return "";
}

function parseConnections(raw: string): RawConnection[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function analyzeConnections(
  newShard: Shard
): Promise<Connection[]> {
  const recent = getCompleteShards(config.nearbyShardCount).filter(
    (s) => s.id !== newShard.id
  );

  if (recent.length === 0) {
    log.info(`No prior shards yet; skipping connection analysis for ${newShard.id}`);
    return [];
  }

  const payload = {
    new_shard: {
      regret: newShard.regret,
      proud: newShard.proud,
      dream: newShard.dream,
    },
    existing_shards: recent.map((s) => ({
      id: s.id,
      regret: s.regret,
      proud: s.proud,
      dream: s.dream,
    })),
  };

  const res = await anthropic.messages.create({
    model: config.models.fast,
    max_tokens: 500,
    system: SYSTEM_PROMPT.replace(
      "__MAX__",
      String(config.maxConnectionsPerShard)
    ),
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });

  const raw = extractFirstText(
    res.content as Array<{ type: string; text?: string }>
  );
  const proposed = parseConnections(raw);

  const now = Date.now();
  const validIds = new Set(recent.map((s) => s.id));
  const created: Connection[] = [];

  for (const conn of proposed.slice(0, config.maxConnectionsPerShard)) {
    if (typeof conn.shard_id !== "string") continue;
    if (!validIds.has(conn.shard_id)) continue;
    if (typeof conn.phrase !== "string" || conn.phrase.length === 0) continue;
    const phrase = conn.phrase.slice(0, 50);
    const theme =
      typeof conn.theme === "string" && conn.theme.length > 0
        ? conn.theme.slice(0, 40)
        : null;

    const connection: Connection = {
      id: randomUUID(),
      shard_a_id: newShard.id,
      shard_b_id: conn.shard_id,
      phrase,
      theme,
      created_at: now,
    };
    insertConnection(connection);
    created.push(connection);
  }

  log.info(
    `Created ${created.length} connections for shard ${newShard.id} ` +
      `(considered ${recent.length} prior shards)`
  );
  return created;
}
