import { Container, Graphics, Text } from "pixi.js";

/**
 * A soft, serif-typed label that fades in (300ms) and out (500ms) near
 * a point in world space. Re-used for every hovered thread \u2014 we keep
 * a single instance per app to avoid spamming Text creations.
 */
export class PoeticLabel {
  readonly view: Container;
  private readonly _text: Text;
  private readonly _bg: Graphics;
  private _alpha = 0;
  private _target = 0;
  private _inSpeed = 1 / 300;
  private _outSpeed = 1 / 500;
  private _visible = false;

  constructor() {
    this.view = new Container();
    this.view.label = "poetic-label";
    this.view.alpha = 0;

    this._bg = new Graphics();
    this.view.addChild(this._bg);

    this._text = new Text({
      text: "",
      style: {
        fontFamily: "Georgia, serif",
        fontSize: 16,
        fill: 0xf5e6c8,
        align: "center",
        fontStyle: "italic",
        letterSpacing: 0.3,
      },
    });
    this._text.anchor.set(0.5);
    this.view.addChild(this._text);
  }

  show(phrase: string, x: number, y: number): void {
    if (!this._visible || this._text.text !== phrase) {
      this._text.text = phrase;
      const w = this._text.width + 26;
      const h = this._text.height + 12;
      this._bg.clear();
      this._bg.roundRect(-w / 2, -h / 2, w, h, 10);
      this._bg.fill({ color: 0x0e0500, alpha: 0.72 });
      this._bg.roundRect(-w / 2, -h / 2, w, h, 10);
      this._bg.stroke({ color: 0xffd700, width: 0.7, alpha: 0.45 });
    }
    this.view.x = x;
    this.view.y = y - 26;
    this._target = 1;
    this._visible = true;
  }

  hide(): void {
    this._target = 0;
    this._visible = false;
  }

  tick(deltaMs: number): void {
    const speed = this._target > this._alpha ? this._inSpeed : this._outSpeed;
    const step = deltaMs * speed;
    if (this._target > this._alpha) {
      this._alpha = Math.min(this._target, this._alpha + step);
    } else {
      this._alpha = Math.max(this._target, this._alpha - step);
    }
    this.view.alpha = this._alpha;
  }
}
