import type { GoldThread } from "../rendering/GoldThread";
import type { MosaicLayer } from "../rendering/MosaicLayer";
import type { PoeticLabel } from "./PoeticLabel";

export interface HoverState {
  cursorWorld: [number, number] | null;
  hoveredShardId: string | null;
  hoveredThreadId: string | null;
}

interface HoverManagerOpts {
  mosaic: MosaicLayer;
  label: PoeticLabel;
  getThreads: () => Iterable<GoldThread>;
  worldToScreen?: (x: number, y: number) => { x: number; y: number };
}

export class HoverManager {
  private _state: HoverState = {
    cursorWorld: null,
    hoveredShardId: null,
    hoveredThreadId: null,
  };
  private _threadReach = 140;
  private _shardReach = 220;

  constructor(private opts: HoverManagerOpts) {}

  updateCursor(world: [number, number] | null): void {
    this._state.cursorWorld = world;
    if (!world) {
      this._state.hoveredShardId = null;
      this._state.hoveredThreadId = null;
      for (const t of this.opts.getThreads()) t.setStrength(0);
      this.opts.label.hide();
      return;
    }

    let closestShardId: string | null = null;
    let closestShardDist = Infinity;
    for (const sp of this.opts.mosaic.shards) {
      const dx = world[0] - sp.centerX;
      const dy = world[1] - sp.centerY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < sp.radius * 1.1 && d < closestShardDist) {
        closestShardDist = d;
        closestShardId = sp.shard.id;
      }
    }
    this._state.hoveredShardId = closestShardId;

    let closestThread: GoldThread | null = null;
    let closestThreadDist = Infinity;
    for (const t of this.opts.getThreads()) {
      const [mx, my] = t.midpoint();
      const dx = world[0] - mx;
      const dy = world[1] - my;
      const d = Math.sqrt(dx * dx + dy * dy);
      t.setStrength(Math.max(0, 1 - d / this._threadReach));
      if (d < closestThreadDist) {
        closestThreadDist = d;
        closestThread = t;
      }
    }

    if (closestThread && closestThreadDist < this._threadReach) {
      this._state.hoveredThreadId = closestThread.connection.id;
      const [mx, my] = closestThread.midpoint();
      this.opts.label.show(closestThread.connection.phrase, mx, my);
    } else {
      this._state.hoveredThreadId = null;
      this.opts.label.hide();
    }

    if (closestShardId && closestShardDist < this._shardReach) {
      // Keep shard hover state; threads can still coexist.
    }
  }

  get state(): HoverState {
    return this._state;
  }
}
