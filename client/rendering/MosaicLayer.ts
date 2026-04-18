import { Container, Graphics } from "pixi.js";
import { ShardSprite } from "./ShardSprite";
import { GOLD } from "../utils/colorUtils";
import type { Shard } from "../../src/types";

interface MosaicLayerOpts {
  container: Container;
  worldWidth: number;
  worldHeight: number;
}

export class MosaicLayer {
  readonly container: Container;
  readonly worldWidth: number;
  readonly worldHeight: number;
  private readonly _shards = new Map<string, ShardSprite>();
  private _shimmers: Array<{ g: Graphics; ttl: number; max: number }> = [];

  constructor(opts: MosaicLayerOpts) {
    this.container = opts.container;
    this.worldWidth = opts.worldWidth;
    this.worldHeight = opts.worldHeight;
  }

  get shards(): ShardSprite[] {
    return Array.from(this._shards.values());
  }

  get(id: string): ShardSprite | undefined {
    return this._shards.get(id);
  }

  async upsert(shard: Shard): Promise<ShardSprite> {
    const existing = this._shards.get(shard.id);
    if (existing) {
      await existing.setShard(shard);
      return existing;
    }
    const sprite = new ShardSprite({
      shard,
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
    });
    this._shards.set(shard.id, sprite);
    this.container.addChild(sprite.view);
    this._spawnShimmer(sprite);
    return sprite;
  }

  remove(id: string): void {
    const sp = this._shards.get(id);
    if (!sp) return;
    sp.destroy();
    this._shards.delete(id);
  }

  private _spawnShimmer(sprite: ShardSprite): void {
    const g = new Graphics();
    g.x = sprite.centerX;
    g.y = sprite.centerY;
    g.alpha = 0.9;
    const ttl = 900;
    this.container.addChild(g);
    this._shimmers.push({ g, ttl, max: ttl });
  }

  tick(
    timeMs: number,
    deltaMs: number,
    cursorWorld: [number, number] | null,
    hoveredId: string | null
  ): void {
    for (const sprite of this._shards.values()) {
      sprite.tick(timeMs, cursorWorld, sprite.shard.id === hoveredId);
    }

    if (this._shimmers.length === 0) return;
    const next: typeof this._shimmers = [];
    for (const s of this._shimmers) {
      s.ttl -= deltaMs;
      if (s.ttl <= 0) {
        s.g.destroy();
        continue;
      }
      const progress = 1 - s.ttl / s.max;
      const radius = 30 + progress * 180;
      const alpha = (1 - progress) * 0.55;
      s.g.clear();
      s.g.circle(0, 0, radius);
      s.g.stroke({ color: GOLD, width: 3 * (1 - progress), alpha });
      next.push(s);
    }
    this._shimmers = next;
  }

  resize(worldWidth: number, worldHeight: number): void {
    (this as { worldWidth: number }).worldWidth = worldWidth;
    (this as { worldHeight: number }).worldHeight = worldHeight;
    for (const sprite of this._shards.values()) {
      sprite.view.x = sprite.shard.position_x * worldWidth;
      sprite.view.y = sprite.shard.position_y * worldHeight;
      (sprite as unknown as { centerX: number }).centerX =
        sprite.shard.position_x * worldWidth;
      (sprite as unknown as { centerY: number }).centerY =
        sprite.shard.position_y * worldHeight;
    }
  }
}
