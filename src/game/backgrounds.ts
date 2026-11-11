/**
 * Hosts the user's original background scripts (served unchanged from /public/game).
 *
 * Each background script self-initialises on `#nature-background-canvas` and exposes
 * `window.FlappyBackground`. We let it build itself, then stop its private animation
 * loop and drive `update(dt)` + `renderFrame()` from the single game loop, so only one
 * requestAnimationFrame runs. Ground.js declares a global `ScrollingGround` class that
 * we instantiate on our own ground canvas.
 */

interface BgInstance {
  canvas: HTMLCanvasElement;
  renderScale?: number;
  renderScaleX?: number;
  renderScaleY?: number;
  resizeObserver?: ResizeObserver;
  _boundResize: () => void;
  _boundVisibilityChange: () => void;
  update(dt: number): void;
  renderFrame(): void;
  stop(): void;
  setSpeed(s: number): void;
}

export interface GroundInstance {
  dpr: number;
  viewportWidth: number;
  viewportHeight: number;
  update(dt: number): void;
  render(ctx?: CanvasRenderingContext2D): void;
  resize(w?: number, h?: number): void;
  setSpeed(px: number): void;
  getTopY(): number;
}

declare global {
  interface Window {
    FlappyBackground?: { instance: BgInstance };
  }
}

const LOGICAL_W = 1920;
const LOGICAL_H = 1080;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.dataset["flappyBg"] = "1";
    el.onload = () => {
      el.remove();
      resolve();
    };
    el.onerror = () => {
      el.remove();
      reject(new Error(`Failed to load ${src}`));
    };
    document.body.appendChild(el);
  });
}

let groundScriptPromise: Promise<void> | null = null;

export class BackgroundHost {
  private container: HTMLElement;
  private bg: BgInstance | null = null;
  private token = 0;
  private dispW = 960;
  private dispH = 540;
  currentScript: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /** Swap to another original background script. Resolves when it is ready. */
  async show(script: string): Promise<void> {
    if (script === this.currentScript && this.bg) return;
    const myToken = ++this.token;
    this.currentScript = script;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;";
    canvas.setAttribute("aria-hidden", "true");

    // Only one element may carry the id the original scripts look for.
    const prevCanvas = this.bg?.canvas ?? null;
    prevCanvas?.removeAttribute("id");
    canvas.id = "nature-background-canvas";
    this.container.appendChild(canvas);

    try {
      await loadScript(script);
    } catch (e) {
      canvas.remove();
      throw e;
    }
    const inst = window.FlappyBackground?.instance;
    canvas.removeAttribute("id");
    if (!inst || inst.canvas !== canvas) {
      canvas.remove();
      return;
    }
    this.detach(inst);
    if (myToken !== this.token) {
      canvas.remove();
      return;
    }
    const prev = this.bg;
    this.bg = inst;
    this.resizeBg();
    inst.renderFrame();
    if (prev) prev.canvas.remove();
  }

  /** Remove the background's own loop/listeners; the game loop drives it instead. */
  private detach(inst: BgInstance) {
    inst.stop();
    window.removeEventListener("resize", inst._boundResize);
    document.removeEventListener("visibilitychange", inst._boundVisibilityChange);
    inst.resizeObserver?.disconnect();
  }

  setDisplaySize(w: number, h: number) {
    this.dispW = w;
    this.dispH = h;
    this.resizeBg();
  }

  /** Same sizing rules as the original resize(), but based on our measured stage size. */
  private resizeBg() {
    const inst = this.bg;
    if (!inst) return;
    const rawDpr = window.devicePixelRatio || 1;
    const isMobile = Math.max(window.innerWidth, window.innerHeight) <= 960;
    const dpr = Math.min(rawDpr, isMobile ? 1.5 : 2);
    const w = Math.min(LOGICAL_W, Math.round(this.dispW * dpr));
    const h = Math.min(LOGICAL_H, Math.round(this.dispH * dpr));
    if (inst.canvas.width !== w || inst.canvas.height !== h) {
      inst.canvas.width = w;
      inst.canvas.height = h;
    }
    // Nature uses renderScale; Himalaya & Jungle use renderScaleX/Y.
    inst.renderScale = inst.canvas.width / LOGICAL_W;
    inst.renderScaleX = inst.canvas.width / LOGICAL_W;
    inst.renderScaleY = inst.canvas.height / LOGICAL_H;
    inst.renderFrame();
  }

  /** speed: 1 = the original's normal arcade speed. */
  tick(dt: number, speed: number) {
    const inst = this.bg;
    if (!inst) return;
    inst.setSpeed(speed);
    inst.update(dt);
    inst.renderFrame();
  }

  destroy() {
    this.token++;
    this.bg?.canvas.remove();
    this.bg = null;
    this.currentScript = null;
  }
}

export async function createGround(canvas: HTMLCanvasElement): Promise<GroundInstance> {
  if (!groundScriptPromise) groundScriptPromise = loadScript("/game/ground.js");
  await groundScriptPromise;
  // Ground.js declares a global (script-scope) class, not a window property.
  const Ctor = new Function("return typeof ScrollingGround !== 'undefined' ? ScrollingGround : null")() as
    | (new (c: HTMLCanvasElement, o: Record<string, number>) => GroundInstance)
    | null;
  if (!Ctor) throw new Error("ScrollingGround not available");
  // Same options the original Ground.js uses for its own auto-init.
  return new Ctor(canvas, { heightRatio: 0.11, grassRatio: 0.22, speed: 220 });
}
