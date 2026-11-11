import { BackgroundHost, createGround, type GroundInstance } from "./backgrounds";
import { COIN_PICKUP_REWARD, milestoneBonus } from "./rules";
import { sounds } from "./sound";

export type Phase = "lobby" | "ready" | "playing" | "paused" | "dying" | "over";

const W = 1920;
const H = 1080;

const PHYS = {
  gravity: 1900, // px/s²
  flap: -650, // px/s
  maxFall: 980,
  playerX: 520,
  faceSize: 124, // drawn height of the visible face (logical px)
  hitRadius: 46,
  pipeWidth: 132,
  pipeSpacing: 560, // distance between pipe pairs
  baseSpeed: 340,
  maxSpeed: 560,
  speedPerPoint: 6,
  maxGap: 300,
  minGap: 236,
  coinRadius: 26,
};

interface Pipe {
  x: number;
  top: number; // bottom edge of upper pipe
  bottom: number; // top edge of lower pipe
  passed: boolean;
  coin: { y: number; taken: boolean } | null;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: string;
}

interface FaceSprite {
  img: HTMLImageElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface EngineCallbacks {
  onPhase(phase: Phase): void;
  onScore(score: number): void;
  onCoins(coins: number): void;
  onGameOver(score: number, coins: number): void;
}

/** Crop to the visible (non-transparent) pixels so every face flies at the same size. */
function measureSprite(img: HTMLImageElement): FaceSprite {
  const full = { img, sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
  try {
    const S = 128;
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    const cx = c.getContext("2d", { willReadFrequently: true })!;
    cx.drawImage(img, 0, 0, S, S);
    const d = cx.getImageData(0, 0, S, S).data;
    let x0 = S,
      y0 = S,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++)
        if (d[(y * S + x) * 4 + 3]! > 24) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) return full;
    const kx = img.naturalWidth / S;
    const ky = img.naturalHeight / S;
    return { img, sx: x0 * kx, sy: y0 * ky, sw: (x1 - x0 + 1) * kx, sh: (y1 - y0 + 1) * ky };
  } catch {
    return full;
  }
}

export class GameEngine {
  readonly bg: BackgroundHost;
  private ground: GroundInstance | null = null;
  private gameCanvas: HTMLCanvasElement;
  private groundCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gctx: CanvasRenderingContext2D;
  private cb: EngineCallbacks;

  private raf: number | null = null;
  private last = 0;
  private dispW = 960;
  private dispH = 540;
  private groundTop = H * 0.89;

  phase: Phase = "lobby";
  private y = H * 0.45;
  private vy = 0;
  private angle = 0;
  private t = 0;
  private pipes: Pipe[] = [];
  private sinceLastPipe = 0;
  private score = 0;
  private coins = 0;
  private sparks: Spark[] = [];
  private shake = 0;
  private dyingTimer = 0;
  private sprite: FaceSprite | null = null;
  private spriteCache = new Map<string, FaceSprite>();
  private wantFace = "";

  constructor(opts: {
    bgContainer: HTMLElement;
    gameCanvas: HTMLCanvasElement;
    groundCanvas: HTMLCanvasElement;
    callbacks: EngineCallbacks;
  }) {
    this.bg = new BackgroundHost(opts.bgContainer);
    this.gameCanvas = opts.gameCanvas;
    this.groundCanvas = opts.groundCanvas;
    this.ctx = this.gameCanvas.getContext("2d")!;
    this.gctx = this.groundCanvas.getContext("2d")!;
    this.cb = opts.callbacks;
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  async init() {
    this.ground = await createGround(this.groundCanvas);
    this.applySize();
    this.start();
  }

  setFace(url: string) {
    this.wantFace = url;
    const cached = this.spriteCache.get(url);
    if (cached) {
      this.sprite = cached;
      return;
    }
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const s = measureSprite(img);
      this.spriteCache.set(url, s);
      if (this.wantFace === url) this.sprite = s;
    };
    img.src = url;
  }

  setDisplaySize(w: number, h: number) {
    this.dispW = w;
    this.dispH = h;
    this.applySize();
  }

  private applySize() {
    const dpr = Math.min(window.devicePixelRatio || 1, Math.max(window.innerWidth, window.innerHeight) <= 960 ? 1.5 : 2);
    this.gameCanvas.width = Math.min(W, Math.round(this.dispW * dpr));
    this.gameCanvas.height = Math.min(H, Math.round(this.dispH * dpr));
    this.bg.setDisplaySize(this.dispW, this.dispH);
    if (this.ground) {
      this.ground.resize(this.dispW, this.dispH);
      this.groundCanvas.width = Math.round(this.dispW * this.ground.dpr);
      this.groundCanvas.height = Math.round(this.dispH * this.ground.dpr);
      this.groundTop = (this.ground.getTopY() / this.dispH) * H;
    }
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.cb.onPhase(p);
  }

  private get speed() {
    return Math.min(PHYS.maxSpeed, PHYS.baseSpeed + this.score * PHYS.speedPerPoint);
  }

  toLobby() {
    this.pipes = [];
    this.sparks = [];
    this.setPhase("lobby");
  }

  newRun() {
    this.y = H * 0.45;
    this.vy = 0;
    this.angle = 0;
    this.pipes = [];
    this.sparks = [];
    this.sinceLastPipe = PHYS.pipeSpacing * 0.35;
    this.score = 0;
    this.coins = 0;
    this.shake = 0;
    this.cb.onScore(0);
    this.cb.onCoins(0);
    this.setPhase("ready");
  }

  flap() {
    if (this.phase === "ready") this.setPhase("playing");
    if (this.phase !== "playing") return;
    this.vy = PHYS.flap;
    sounds.playFlap();
  }

  pause() {
    if (this.phase === "playing" || this.phase === "ready") this.setPhase("paused");
  }

  resume() {
    if (this.phase === "paused") {
      this.last = performance.now();
      this.setPhase(this.score > 0 || this.pipes.length ? "playing" : "ready");
    }
  }

  private onVisibility = () => {
    if (document.hidden) this.pause();
    this.last = performance.now();
  };

  start() {
    if (this.raf !== null) return;
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.bg.destroy();
  }

  private frame(dt: number) {
    this.t += dt;
    const p = this.phase;
    const moving = p === "playing" || p === "ready" || p === "lobby";
    const worldSpeed = p === "lobby" ? PHYS.baseSpeed * 0.45 : moving ? this.speed : 0;

    // Background: original scripts use 240 px/s in the foreground at speed 1.
    this.bg.tick(dt, worldSpeed / 240);

    if (p === "playing") this.stepPlaying(dt);
    else if (p === "ready") {
      this.y = H * 0.45 + Math.sin(this.t * 4) * 14;
      this.angle = 0;
    } else if (p === "dying") this.stepDying(dt);

    if (p !== "paused") this.stepSparks(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);

    // Ground: scroll in display px/s so it stays locked to the pipes.
    if (this.ground) {
      this.ground.setSpeed(worldSpeed * (this.dispW / W));
      this.ground.update(dt);
      this.gctx.setTransform(1, 0, 0, 1, 0, 0);
      this.gctx.clearRect(0, 0, this.groundCanvas.width, this.groundCanvas.height);
      this.ground.render(this.gctx);
    }

    this.render();
  }

  private stepPlaying(dt: number) {
    this.vy = Math.min(PHYS.maxFall, this.vy + PHYS.gravity * dt);
    this.y += this.vy * dt;
    this.angle = this.vy < 0 ? Math.max(-0.35, this.vy * 0.0006) : Math.min(1.1, this.angle + dt * 2.6);

    if (this.y - PHYS.hitRadius < 0) {
      this.y = PHYS.hitRadius;
      this.vy = 0;
    }
    if (this.y + PHYS.hitRadius >= this.groundTop) {
      this.y = this.groundTop - PHYS.hitRadius;
      this.crash(true);
      return;
    }

    const move = this.speed * dt;
    this.sinceLastPipe += move;
    if (this.sinceLastPipe >= PHYS.pipeSpacing) {
      this.sinceLastPipe = 0;
      this.spawnPipe();
    }

    for (let i = this.pipes.length - 1; i >= 0; i--) {
      const pp = this.pipes[i]!;
      pp.x -= move;
      if (!pp.passed && pp.x + PHYS.pipeWidth < PHYS.playerX - PHYS.hitRadius) {
        pp.passed = true;
        this.score += 1;
        this.cb.onScore(this.score);
        const bonus = milestoneBonus(this.score);
        if (bonus) {
          this.coins += bonus;
          this.cb.onCoins(this.coins);
          sounds.playVictory();
        } else sounds.playScore();
      }
      if (pp.coin && !pp.coin.taken) {
        const cx = pp.x + PHYS.pipeWidth / 2;
        if (Math.hypot(cx - PHYS.playerX, pp.coin.y - this.y) < PHYS.hitRadius + PHYS.coinRadius) {
          pp.coin.taken = true;
          this.coins += COIN_PICKUP_REWARD;
          this.cb.onCoins(this.coins);
          sounds.playCoin();
          this.burst(cx, pp.coin.y);
        }
      }
      if (this.hitsPipe(pp)) {
        this.crash(false);
        return;
      }
      if (pp.x + PHYS.pipeWidth < -40) this.pipes.splice(i, 1);
    }
  }

  private hitsPipe(pp: Pipe) {
    const r = PHYS.hitRadius - 4;
    const lip = 10;
    const rx = pp.x - lip;
    const rw = PHYS.pipeWidth + lip * 2;
    const hit = (ry: number, rh: number) => {
      const cx = Math.max(rx, Math.min(PHYS.playerX, rx + rw));
      const cy = Math.max(ry, Math.min(this.y, ry + rh));
      return (PHYS.playerX - cx) ** 2 + (this.y - cy) ** 2 < r * r;
    };
    return hit(-200, pp.top + 200) || hit(pp.bottom, this.groundTop - pp.bottom + 50);
  }

  private spawnPipe() {
    const gap = Math.max(PHYS.minGap, PHYS.maxGap - this.score * 2.2);
    const margin = 110;
    const minTop = margin;
    const maxTop = this.groundTop - margin - gap;
    const top = minTop + Math.random() * Math.max(0, maxTop - minTop);
    this.pipes.push({
      x: W + 40,
      top,
      bottom: top + gap,
      passed: false,
      coin: Math.random() < 0.62 ? { y: top + gap * (0.3 + Math.random() * 0.4), taken: false } : null,
    });
  }

  private crash(onGround: boolean) {
    sounds.playHit();
    this.shake = 18;
    this.vy = onGround ? 0 : Math.max(this.vy, 120);
    this.dyingTimer = 0;
    this.setPhase("dying");
  }

  private stepDying(dt: number) {
    this.dyingTimer += dt;
    if (this.y + PHYS.hitRadius < this.groundTop) {
      this.vy = Math.min(PHYS.maxFall * 1.2, this.vy + PHYS.gravity * 1.3 * dt);
      this.y = Math.min(this.groundTop - PHYS.hitRadius, this.y + this.vy * dt);
      this.angle = Math.min(1.5, this.angle + dt * 5);
    }
    if (this.dyingTimer > 0.75) {
      this.setPhase("over");
      this.cb.onGameOver(this.score, this.coins);
    }
  }

  private burst(x: number, y: number) {
    const colors = ["#fde047", "#facc15", "#fff7c2", "#f59e0b"];
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 120 + Math.random() * 260;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60,
        life: 0,
        max: 0.45 + Math.random() * 0.3,
        r: 3 + Math.random() * 4,
        color: colors[i % colors.length]!,
      });
    }
  }

  private stepSparks(dt: number) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 500 * dt;
      if (s.life >= s.max) this.sparks.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- render

  private render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.gameCanvas.width, this.gameCanvas.height);
    if (this.phase === "lobby") return;
    ctx.setTransform(this.gameCanvas.width / W, 0, 0, this.gameCanvas.height / H, 0, 0);
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    for (const pp of this.pipes) this.drawPipe(ctx, pp);
    for (const pp of this.pipes) if (pp.coin && !pp.coin.taken) this.drawCoin(ctx, pp.x + PHYS.pipeWidth / 2, pp.coin.y);
    this.drawFace(ctx);
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.max(0, 1 - s.life / s.max);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** The face is drawn exactly as provided: no shadow, no wings, no bubbles. */
  private drawFace(ctx: CanvasRenderingContext2D) {
    const s = this.sprite;
    if (!s) return;
    const h = PHYS.faceSize;
    const w = (s.sw / s.sh) * h;
    const maxW = PHYS.faceSize * 1.25;
    const scale = w > maxW ? maxW / w : 1;
    ctx.save();
    ctx.translate(PHYS.playerX, this.y);
    ctx.rotate(this.angle);
    ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, (-w * scale) / 2, (-h * scale) / 2, w * scale, h * scale);
    ctx.restore();
  }

  private drawPipe(ctx: CanvasRenderingContext2D, pp: Pipe) {
    const x = pp.x;
    const pw = PHYS.pipeWidth;
    const lip = 12;
    const capH = 44;
    const body = ctx.createLinearGradient(x, 0, x + pw, 0);
    body.addColorStop(0, "#0b4a22");
    body.addColorStop(0.15, "#1b8a3e");
    body.addColorStop(0.4, "#4ade80");
    body.addColorStop(0.5, "#b7f7c9");
    body.addColorStop(0.62, "#2fb457");
    body.addColorStop(1, "#0a3d1c");
    const cap = ctx.createLinearGradient(x - lip, 0, x + pw + lip, 0);
    cap.addColorStop(0, "#0a3d1c");
    cap.addColorStop(0.15, "#22a04a");
    cap.addColorStop(0.42, "#6ee79a");
    cap.addColorStop(0.52, "#e3fde9");
    cap.addColorStop(0.7, "#22a04a");
    cap.addColorStop(1, "#08321a");
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#0b2a14";

    // upper
    ctx.fillStyle = body;
    ctx.fillRect(x, -10, pw, pp.top - capH + 10);
    ctx.strokeRect(x, -10, pw, pp.top - capH + 10);
    ctx.fillStyle = cap;
    this.roundRect(ctx, x - lip, pp.top - capH, pw + lip * 2, capH, 8);
    // lower
    const lowerH = this.groundTop - pp.bottom + 40;
    ctx.fillStyle = body;
    ctx.fillRect(x, pp.bottom + capH, pw, lowerH - capH);
    ctx.strokeRect(x, pp.bottom + capH, pw, lowerH - capH);
    ctx.fillStyle = cap;
    this.roundRect(ctx, x - lip, pp.bottom, pw + lip * 2, capH, 8);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
  }

  private drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const r = PHYS.coinRadius;
    const squash = Math.abs(Math.cos(this.t * 3.2)) * 0.75 + 0.25;
    ctx.save();
    ctx.translate(x, y + Math.sin(this.t * 4 + x * 0.01) * 5);
    ctx.scale(squash, 1);
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, "#fff6b0");
    g.addColorStop(0.55, "#facc15");
    g.addColorStop(1, "#b7791f");
    ctx.fillStyle = g;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#5c3a12";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#a16207";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
