import type { Application, Container } from "pixi.js";

interface ZoomPanOpts {
  app: Application;
  world: Container;
  minScale?: number;
  maxScale?: number;
  lowDetailScale?: number;
  onCursorMove?: (world: [number, number] | null) => void;
  onScaleChange?: (scale: number, lowDetail: boolean) => void;
}

export class ZoomPanControls {
  private _scale = 1;
  private _tx = 0;
  private _ty = 0;
  private _dragging = false;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _dragStartTx = 0;
  private _dragStartTy = 0;
  private readonly minScale: number;
  private readonly maxScale: number;
  private readonly lowDetailScale: number;

  constructor(private opts: ZoomPanOpts) {
    this.minScale = opts.minScale ?? 0.2;
    this.maxScale = opts.maxScale ?? 4;
    this.lowDetailScale = opts.lowDetailScale ?? 0.3;
    this.attach();
    this.apply();
  }

  get scale(): number {
    return this._scale;
  }

  get isLowDetail(): boolean {
    return this._scale < this.lowDetailScale;
  }

  setCenter(worldX: number, worldY: number): void {
    const { width, height } = this.opts.app.renderer.screen;
    this._tx = width / 2 - worldX * this._scale;
    this._ty = height / 2 - worldY * this._scale;
    this.apply();
  }

  private attach(): void {
    const canvas = this.opts.app.canvas;
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    window.addEventListener("blur", this.onUp);
    canvas.addEventListener("pointerleave", () => {
      this.opts.onCursorMove?.(null);
    });
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.opts.app.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const worldX = (screenX - this._tx) / this._scale;
    const worldY = (screenY - this._ty) / this._scale;

    const factor = Math.exp(-e.deltaY * 0.0012);
    const newScale = clamp(this._scale * factor, this.minScale, this.maxScale);
    this._scale = newScale;

    this._tx = screenX - worldX * newScale;
    this._ty = screenY - worldY * newScale;

    this.apply();
    this.opts.onScaleChange?.(newScale, this.isLowDetail);
    this.opts.onCursorMove?.([worldX, worldY]);
  };

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this._dragging = true;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    this._dragStartTx = this._tx;
    this._dragStartTy = this._ty;
  };

  private onMove = (e: PointerEvent): void => {
    const rect = this.opts.app.canvas.getBoundingClientRect();
    if (this._dragging) {
      this._tx = this._dragStartTx + (e.clientX - this._dragStartX);
      this._ty = this._dragStartTy + (e.clientY - this._dragStartY);
      this.apply();
    }
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const insideX = screenX >= 0 && screenX <= rect.width;
    const insideY = screenY >= 0 && screenY <= rect.height;
    if (insideX && insideY) {
      const worldX = (screenX - this._tx) / this._scale;
      const worldY = (screenY - this._ty) / this._scale;
      this.opts.onCursorMove?.([worldX, worldY]);
    } else {
      this.opts.onCursorMove?.(null);
    }
  };

  private onUp = (): void => {
    this._dragging = false;
  };

  private apply(): void {
    this.opts.world.scale.set(this._scale);
    this.opts.world.x = this._tx;
    this.opts.world.y = this._ty;
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
