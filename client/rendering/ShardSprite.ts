import {
  Assets,
  Container,
  Graphics,
  Sprite,
  Texture,
  type Filter,
} from "pixi.js";
import { generateShardPolygon, polygonPointAt } from "../utils/shapeUtils";
import { GOLD, GOLD_WARM, placeholderColors } from "../utils/colorUtils";
import type { Shard } from "../../src/types";

/** World-space size of a shard (before `shard.scale`). */
export const SHARD_SIZE = 220;

export interface ShardSpriteOpts {
  shard: Shard;
  worldWidth: number;
  worldHeight: number;
}

export class ShardSprite {
  readonly shard: Shard;
  readonly view: Container;
  readonly maskGraphics: Graphics;
  readonly edgeGlow: Graphics;
  readonly placeholder: Graphics;

  /** Normalized polygon in [0,1]^2, computed once from shape_seed. */
  readonly polygon: [number, number][];

  /** World coords of the sprite center (already includes the .scale factor). */
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;

  /** Edge-anchor points relative to `view` for gold thread endpoints. */
  private _edgeCache = new Map<string, [number, number]>();

  private sprite: Sprite | null = null;
  private _breathePhase: number;
  private _hoverFactor = 0;
  private _targetHover = 0;
  private _filterSet = false;

  constructor(opts: ShardSpriteOpts) {
    this.shard = opts.shard;
    this.polygon = generateShardPolygon(opts.shard.shape_seed);

    this._breathePhase = (opts.shard.shape_seed % 1000) / 1000;

    this.centerX = opts.shard.position_x * opts.worldWidth;
    this.centerY = opts.shard.position_y * opts.worldHeight;

    const size = SHARD_SIZE * opts.shard.scale;
    this.radius = size * 0.5;

    this.view = new Container();
    this.view.label = `shard:${opts.shard.id}`;
    this.view.x = this.centerX;
    this.view.y = this.centerY;
    this.view.rotation = opts.shard.rotation;
    this.view.eventMode = "static";
    this.view.cursor = "pointer";
    this.view.alpha = 0;

    this.edgeGlow = new Graphics();
    this.view.addChild(this.edgeGlow);

    this.maskGraphics = new Graphics();
    this.maskGraphics.renderable = false;
    this.view.addChild(this.maskGraphics);

    this.placeholder = new Graphics();
    this.view.addChild(this.placeholder);

    this.drawShapes(size);

    if (opts.shard.image_url) {
      this.loadImage(opts.shard.image_url, size).catch((err) => {
        console.warn(`Failed to load shard image ${opts.shard.id}:`, err);
      });
    }
  }

  /**
   * Update the underlying shard metadata. Called when the same shard id
   * arrives via WebSocket after its image has finished generating.
   */
  async setShard(shard: Shard): Promise<void> {
    (this as { shard: Shard }).shard = shard;
    const size = SHARD_SIZE * shard.scale;
    if (shard.image_url && !this.sprite) {
      await this.loadImage(shard.image_url, size);
    }
  }

  private drawShapes(size: number): void {
    const half = size / 2;
    const toLocal = (p: [number, number]): [number, number] => [
      (p[0] - 0.5) * size,
      (p[1] - 0.5) * size,
    ];
    const pts = this.polygon.map(toLocal);

    this.maskGraphics.clear();
    this.maskGraphics.poly(pts.flat());
    this.maskGraphics.fill(0xffffff);

    const { base, accent } = placeholderColors(
      `${this.shard.regret} ${this.shard.proud} ${this.shard.dream}`
    );
    this.placeholder.clear();
    this.placeholder.poly(pts.flat());
    this.placeholder.fill({ color: base, alpha: 1 });
    this.placeholder.poly(pts.flat());
    this.placeholder.stroke({ color: accent, width: 1.5, alpha: 0.45 });

    // Edge glow — draw the polygon stroke in gold so proximity reveals a seam.
    this.edgeGlow.clear();
    this.edgeGlow.poly(pts.flat());
    this.edgeGlow.stroke({ color: GOLD_WARM, width: 2, alpha: 0.0 });

    // Pre-compute a few canonical edge anchors relative to view center.
    this._edgeCache.clear();
    for (const label of [
      "n",
      "ne",
      "e",
      "se",
      "s",
      "sw",
      "w",
      "nw",
    ]) {
      const t = {
        n: 0.25,
        ne: 0.125,
        e: 0,
        se: 0.875,
        s: 0.75,
        sw: 0.625,
        w: 0.5,
        nw: 0.375,
      }[label]!;
      const p = polygonPointAt(this.polygon, t);
      this._edgeCache.set(label, toLocal(p));
    }
    // Silence unused-var warning for half.
    void half;
  }

  private async loadImage(url: string, size: number): Promise<void> {
    const texture = await Assets.load<Texture>(url);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = size;
    sprite.height = size;
    sprite.mask = this.maskGraphics;
    this.view.addChild(sprite);
    this.sprite = sprite;
    this.placeholder.alpha = 0;
  }

  setFilters(filters: Filter[]): void {
    if (this._filterSet) return;
    this.view.filters = filters;
    this._filterSet = true;
  }

  /**
   * Per-frame update. Call from the animation loop.
   *
   * @param timeMs current elapsed time in ms
   * @param cursorWorld cursor in world coords, null when offscreen
   * @param hovered whether this specific shard is the hovered one
   */
  tick(
    timeMs: number,
    cursorWorld: [number, number] | null,
    hovered: boolean
  ): void {
    const phase = (timeMs / 3500 + this._breathePhase) % 1;
    const breathe = 1 + 0.015 * Math.sin(phase * Math.PI * 2);

    let proximity = 0;
    let edgeAlpha = 0;
    if (cursorWorld) {
      const dx = cursorWorld[0] - this.centerX;
      const dy = cursorWorld[1] - this.centerY;
      const d = Math.sqrt(dx * dx + dy * dy);
      const reach = this.radius * 2.4;
      if (d < reach) {
        proximity = Math.pow(1 - d / reach, 2);
      }
    }

    this._targetHover = hovered ? 1 : proximity;
    this._hoverFactor += (this._targetHover - this._hoverFactor) * 0.18;

    const hoverScale = 1 + 0.06 * this._hoverFactor;
    this.view.scale.set(breathe * hoverScale);

    edgeAlpha = 0.1 + 0.6 * this._hoverFactor;
    if (hovered) edgeAlpha = Math.min(1, edgeAlpha + 0.25);

    const size = SHARD_SIZE * this.shard.scale;
    const toLocal = (p: [number, number]): [number, number] => [
      (p[0] - 0.5) * size,
      (p[1] - 0.5) * size,
    ];
    this.edgeGlow.clear();
    this.edgeGlow.poly(this.polygon.map(toLocal).flat());
    this.edgeGlow.stroke({
      color: hovered ? GOLD : GOLD_WARM,
      width: 2 + 3 * this._hoverFactor,
      alpha: edgeAlpha,
    });

    if (this.view.alpha < 1) {
      this.view.alpha = Math.min(1, this.view.alpha + 0.04);
    }
  }

  /**
   * Returns the global (world-space) coordinate of an edge point at
   * parametric position `t` in [0,1) on the polygon. Used by gold threads
   * so they anchor to the shard silhouette instead of its center.
   */
  edgePoint(t: number): [number, number] {
    const size = SHARD_SIZE * this.shard.scale;
    const local = polygonPointAt(this.polygon, t);
    const lx = (local[0] - 0.5) * size;
    const ly = (local[1] - 0.5) * size;
    const cos = Math.cos(this.shard.rotation);
    const sin = Math.sin(this.shard.rotation);
    return [
      this.centerX + lx * cos - ly * sin,
      this.centerY + lx * sin + ly * cos,
    ];
  }

  /** Convenience: the shard center in world coordinates. */
  centerPoint(): [number, number] {
    return [this.centerX, this.centerY];
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
