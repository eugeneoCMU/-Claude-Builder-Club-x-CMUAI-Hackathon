import type { WsEvent } from "../../src/types";

type Listener = (event: WsEvent) => void;

/**
 * Minimal auto-reconnecting WebSocket wrapper. Attempts to connect with
 * exponential backoff (up to 15s) and dispatches messages to subscribers.
 */
export class WebSocketClient {
  private _ws: WebSocket | null = null;
  private _listeners: Listener[] = [];
  private _backoffMs = 1000;
  private _closed = false;
  private _connectTimer: number | null = null;
  private _pingTimer: number | null = null;

  constructor(private url: string) {}

  connect(): void {
    if (this._ws || this._closed) return;
    const ws = new WebSocket(this.url);
    this._ws = ws;

    ws.addEventListener("open", () => {
      console.info(`[ws] connected ${this.url}`);
      this._backoffMs = 1000;
      this._pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
        }
      }, 25_000);
    });

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type?: string };
        if (msg?.type === "pong") return;
        for (const listener of this._listeners) listener(msg as WsEvent);
      } catch {
        // drop malformed
      }
    });

    ws.addEventListener("close", () => {
      this._ws = null;
      if (this._pingTimer) clearInterval(this._pingTimer);
      this._pingTimer = null;
      if (this._closed) return;
      console.warn(
        `[ws] disconnected, retrying in ${this._backoffMs}ms`
      );
      this._connectTimer = window.setTimeout(() => {
        this._connectTimer = null;
        this.connect();
      }, this._backoffMs);
      this._backoffMs = Math.min(this._backoffMs * 2, 15_000);
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }

  onMessage(listener: Listener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  close(): void {
    this._closed = true;
    if (this._connectTimer) clearTimeout(this._connectTimer);
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._ws?.close();
  }
}
