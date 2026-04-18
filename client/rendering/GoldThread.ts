import { Container, Graphics } from "pixi.js";
import { GlowFilter } from "pixi-filters";
import type { Connection } from "../../src/types";
import type { ShardSprite } from "./ShardSprite";

/**
 * A single gold Bezier thread connecting two shards' edges, with a
 * `GlowFilter` whose outer strength responds to cursor proximity.
 */
export class GoldThread {
  readonly view: Container;
  readonly graphics: Graphics;
  readonly glow: GlowFilter;
  readonly connection: Connection;

  private _strength = 0;
  private _targetStrength = 0;
  private _anchorA: [number, number];
  private _anchorB: [number, number];
  private _controlOffset: number;
  private _shardA: ShardSprite;
  private _shardB: ShardSprite;

  constructor(conn: Connection, shardA: ShardSprite, shardB: ShardSprite) {
    this.connection = conn;
    this._shardA = shardA;
    this._shardB = shardB;

    this.view = new Container();
    this.view.label = `thread:${conn.id}`;

    this.graphics = new Graphics();
    this.view.addChild(this.graphics);

    this.glow = new GlowFilter({
      distance: 15,
      outerStrength: 0.4,
      innerStrength: 0.2,
      color: 0xffd700,
      quality: 0.15,
    });
    this.graphics.filters = [this.glow];

    this._anchorA = pickEdgeAnchor(shardA, shardB);
    this._anchorB = pickEdgeAnchor(shardB, shardA);

    const seed = (hashString(conn.id) % 1000) / 1000;
    this._controlOffset = 40 + seed * 60;

    this.redraw();
  }

  setStrength(target: number): void {
    this._targetStrength = Math.max(0, Math.min(1, target));
  }

  midpoint(): [number, number] {
    return [
      (this._anchorA[0] + this._anchorB[0]) / 2,
      (this._anchorA[1] + this._anchorB[1]) / 2,
    ];
  }

  endpoints(): [[number, number], [number, number]] {
    return [this._anchorA, this._anchorB];
  }

  tick(_timeMs: number): void {
    const delta = this._targetStrength - this._strength;
    this._strength += delta * 0.12;
    this.glow.outerStrength = 0.4 + this._strength * 2.4;
    this.glow.innerStrength = 0.15 + this._strength * 0.55;
    this.glow.alpha = 0.4 + this._strength * 0.6;
    this.graphics.alpha = 0.55 + this._strength * 0.45;
  }

  refreshEndpoints(): void {
    this._anchorA = pickEdgeAnchor(this._shardA, this._shardB);
    this._anchorB = pickEdgeAnchor(this._shardB, this._shardA);
    this.redraw();
  }

  private redraw(): void {
    const [ax, ay] = this._anchorA;
    const [bx, by] = this._anchorB;

    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const nx = -dy / len;
    const ny = dx / len;
    const bowX = midX + nx * this._controlOffset;
    const bowY = midY + ny * this._controlOffset;

    this.graphics.clear();
    this.graphics.moveTo(ax, ay);
    this.graphics.quadraticCurveTo(bowX, bowY, bx, by);
    this.graphics.stroke({ color: 0xffd700, width: 2.2, alpha: 1 });
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

function pickEdgeAnchor(
  from: ShardSprite,
  toward: ShardSprite
): [number, number] {
  const [fx, fy] = from.centerPoint();
  const [tx, ty] = toward.centerPoint();
  const dx = tx - fx;
  const dy = ty - fy;
  const angle = Math.atan2(dy, dx);

  let best: [number, number] = from.centerPoint();
  let bestScore = Infinity;
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const edge = from.edgePoint(t);
    const ea = Math.atan2(edge[1] - fy, edge[0] - fx);
    const diff = Math.abs(wrapAngle(ea - angle));
    if (diff < bestScore) {
      bestScore = diff;
      best = edge;
    }
  }
  return best;
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
