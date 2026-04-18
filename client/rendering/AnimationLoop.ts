import type { Application, Ticker } from "pixi.js";

export type FrameCallback = (timeMs: number, deltaMs: number) => void;

/**
 * Thin wrapper around PIXI's Ticker. Subscribers receive (timeMs, deltaMs).
 * Only one instance per Application.
 */
export class AnimationLoop {
  private _subs: FrameCallback[] = [];
  private _accumMs = 0;
  private _lastNow = performance.now();
  private _bound = false;

  constructor(private app: Application) {}

  add(cb: FrameCallback): () => void {
    this._subs.push(cb);
    if (!this._bound) this.attach();
    return () => {
      this._subs = this._subs.filter((f) => f !== cb);
    };
  }

  private attach(): void {
    this.app.ticker.add(this._onFrame);
    this._bound = true;
  }

  private _onFrame = (_ticker: Ticker): void => {
    const now = performance.now();
    const deltaMs = Math.max(0, now - this._lastNow);
    this._lastNow = now;
    this._accumMs += deltaMs;
    for (const cb of this._subs) cb(this._accumMs, deltaMs);
  };
}
