import { Application, Container, Graphics } from "pixi.js";

export interface MosaicAppLayers {
  background: Container;
  shards: Container;
  threads: Container;
  ui: Container;
  world: Container;
}

export class MosaicApp {
  readonly app: Application;
  readonly layers: MosaicAppLayers;
  private _backgroundGraphics: Graphics | null = null;

  constructor(app: Application) {
    this.app = app;
    const world = new Container();
    world.label = "world";
    world.sortableChildren = false;
    app.stage.addChild(world);

    const background = new Container();
    background.label = "bg";
    const shards = new Container();
    shards.label = "shards";
    const threads = new Container();
    threads.label = "threads";
    const ui = new Container();
    ui.label = "ui";

    world.addChild(background);
    world.addChild(shards);
    world.addChild(threads);
    world.addChild(ui);

    this.layers = { background, shards, threads, ui, world };
  }

  static async create(target: HTMLElement): Promise<MosaicApp> {
    const app = new Application();
    await app.init({
      background: 0x0e0500,
      resizeTo: target,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: "webgl",
    });
    target.appendChild(app.canvas);
    app.canvas.id = "mosaic-canvas";

    const instance = new MosaicApp(app);
    instance.paintBackground();
    window.addEventListener("resize", () => instance.paintBackground());
    return instance;
  }

  paintBackground(): void {
    const { width, height } = this.app.renderer.screen;
    if (!this._backgroundGraphics) {
      this._backgroundGraphics = new Graphics();
      this.layers.background.addChild(this._backgroundGraphics);
    }
    const g = this._backgroundGraphics;
    g.clear();
    g.rect(-width, -height, width * 3, height * 3);
    g.fill({ color: 0x0e0500, alpha: 1 });

    // Faint radial warmth at the center so the shards feel seated on parchment.
    const cx = width / 2;
    const cy = height / 2;
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r = Math.max(width, height) * (0.35 + 0.65 * t);
      g.circle(cx, cy, r);
      g.fill({ color: 0x1a0a04, alpha: 0.035 * (1 - t) });
    }
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }
}
