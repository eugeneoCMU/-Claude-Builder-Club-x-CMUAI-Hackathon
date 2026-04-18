import mockData from "../MOCK_DATA.json";
import type { Connection, Shard } from "../../src/types";

interface InitialSnapshot {
  shards: Shard[];
  connections: Connection[];
  source: "api" | "mock";
}

/**
 * Loads the initial mosaic state from the backend REST API. If the API is
 * unreachable (backend not running, CORS, etc.) it falls back to the bundled
 * `MOCK_DATA.json` so the UI has something to render during development.
 */
export async function loadInitialSnapshot(): Promise<InitialSnapshot> {
  try {
    const [shardsRes, connsRes] = await Promise.all([
      fetch("/api/shards?limit=1000"),
      fetch("/api/connections"),
    ]);
    if (!shardsRes.ok || !connsRes.ok) {
      throw new Error(
        `api responded ${shardsRes.status}/${connsRes.status}`
      );
    }
    const shardsJson = (await shardsRes.json()) as { shards: Shard[] };
    const connsJson = (await connsRes.json()) as { connections: Connection[] };
    return {
      shards: shardsJson.shards ?? [],
      connections: connsJson.connections ?? [],
      source: "api",
    };
  } catch (err) {
    console.warn(
      "[mosaic] API unavailable, using bundled MOCK_DATA.json \u2014",
      (err as Error).message
    );
    return {
      shards: mockData.shards as Shard[],
      connections: mockData.connections as Connection[],
      source: "mock",
    };
  }
}
