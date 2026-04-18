import { MosaicApp } from "./rendering/MosaicApp";
import { MosaicLayer } from "./rendering/MosaicLayer";
import { GoldThread } from "./rendering/GoldThread";
import { AnimationLoop } from "./rendering/AnimationLoop";
import { HoverManager } from "./interaction/HoverManager";
import { PoeticLabel } from "./interaction/PoeticLabel";
import { ZoomPanControls } from "./interaction/ZoomPanControls";
import { loadInitialSnapshot } from "./state/MosaicStore";
import { WebSocketClient } from "./state/WebSocketClient";
import type { Connection, Shard } from "../src/types";

const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 2400;

async function boot(): Promise<void> {
  const container = document.body;
  const hud = document.getElementById("hud");
  const empty = document.getElementById("empty");

  const mosaic = await MosaicApp.create(container);
  const mosaicLayer = new MosaicLayer({
    container: mosaic.layers.shards,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
  });

  const threads = new Map<string, GoldThread>();
  const poeticLabel = new PoeticLabel();
  mosaic.layers.ui.addChild(poeticLabel.view);

  const hover = new HoverManager({
    mosaic: mosaicLayer,
    label: poeticLabel,
    getThreads: () => threads.values(),
  });

  let cursorWorld: [number, number] | null = null;

  const zoomPan = new ZoomPanControls({
    app: mosaic.app,
    world: mosaic.layers.world,
    onCursorMove: (world) => {
      cursorWorld = world;
      hover.updateCursor(world);
    },
    onScaleChange: (scale, lowDetail) => {
      if (hud) {
        hud.textContent = `${mosaicLayer.shards.length} shards \u00b7 ${threads.size} threads \u00b7 ${Math.round(scale * 100)}%${lowDetail ? " (low)" : ""}`;
      }
    },
  });
  zoomPan.setCenter(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);

  const addConnection = async (
    conn: Connection
  ): Promise<void> => {
    if (threads.has(conn.id)) return;
    const a = mosaicLayer.get(conn.shard_a_id);
    const b = mosaicLayer.get(conn.shard_b_id);
    if (!a || !b) return;
    const thread = new GoldThread(conn, a, b);
    threads.set(conn.id, thread);
    mosaic.layers.threads.addChild(thread.view);
  };

  const tryWireDeferredConnections = (): void => {
    for (const conn of pendingConnections) {
      if (
        mosaicLayer.get(conn.shard_a_id) &&
        mosaicLayer.get(conn.shard_b_id) &&
        !threads.has(conn.id)
      ) {
        addConnection(conn);
      }
    }
  };

  const pendingConnections: Connection[] = [];

  const upsertShard = async (shard: Shard): Promise<void> => {
    await mosaicLayer.upsert(shard);
    tryWireDeferredConnections();
    if (empty) empty.style.display = "none";
  };

  const snapshot = await loadInitialSnapshot();
  console.info(
    `[mosaic] loaded ${snapshot.shards.length} shards and ${snapshot.connections.length} connections from ${snapshot.source}`
  );
  for (const shard of snapshot.shards) {
    await upsertShard(shard);
  }
  for (const conn of snapshot.connections) {
    if (!(await tryAdd(conn))) pendingConnections.push(conn);
  }

  async function tryAdd(conn: Connection): Promise<boolean> {
    const a = mosaicLayer.get(conn.shard_a_id);
    const b = mosaicLayer.get(conn.shard_b_id);
    if (a && b) {
      await addConnection(conn);
      return true;
    }
    return false;
  }

  if (empty) {
    empty.style.display = mosaicLayer.shards.length > 0 ? "none" : "flex";
  }

  const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  const client = new WebSocketClient(wsUrl);
  client.onMessage((event) => {
    if (event.type === "shard:new") {
      upsertShard(event.shard);
    } else if (event.type === "connection:new") {
      if (!tryAddFlag(event.connection)) pendingConnections.push(event.connection);
    } else if (event.type === "mosaic:stats") {
      if (hud) {
        hud.textContent = `${event.total} shards \u00b7 ${threads.size} threads \u00b7 ${event.pending} pending`;
      }
    }
  });
  client.connect();

  async function tryAddFlag(conn: Connection): Promise<void> {
    const added = await tryAdd(conn);
    if (!added) pendingConnections.push(conn);
  }

  const loop = new AnimationLoop(mosaic.app);
  loop.add((timeMs, deltaMs) => {
    const hovered = hover.state.hoveredShardId;
    mosaicLayer.tick(timeMs, deltaMs, cursorWorld, hovered);
    for (const thread of threads.values()) thread.tick(timeMs);
    poeticLabel.tick(deltaMs);
  });

  if (hud) {
    hud.textContent = `${mosaicLayer.shards.length} shards \u00b7 ${threads.size} threads`;
  }

  (window as unknown as {
    __mosaic?: {
      app: MosaicApp;
      layer: MosaicLayer;
      threads: Map<string, GoldThread>;
    };
  }).__mosaic = { app: mosaic, layer: mosaicLayer, threads };
}

boot().catch((err) => {
  console.error("Failed to boot Mosaic", err);
});
