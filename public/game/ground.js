/**
 * ScrollingGround
 * Original lush arcade grass + earthy stone-soil theme,
 * calibrated to the sleek height & grass-to-soil proportions.
 */
class ScrollingGround {
  /**
   * @param {HTMLCanvasElement} canvas - Target game canvas
   * @param {Object} [options] - Configuration options
   * @param {number} [options.heightRatio=0.11] - Ground height as fraction of canvas height (~11%)
   * @param {number|null} [options.groundHeight=null] - Fixed ground height in px (overrides heightRatio if set)
   * @param {number} [options.grassRatio=0.22] - Grass thickness as fraction of total ground height (~22%)
   * @param {number|null} [options.grassThickness=null] - Fixed grass thickness in px (overrides grassRatio if set)
   * @param {number} [options.speed=220] - Horizontal scroll speed in logical pixels per second
   * @param {number} [options.tileWidth=512] - Seamless repeating tile width in logical pixels
   * @param {number} [options.seed=1337] - Deterministic seed for procedural stones & turf details
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.config = {
      heightRatio: options.heightRatio ?? 0.11,
      groundHeight: options.groundHeight ?? null,
      grassRatio: options.grassRatio ?? 0.22,
      grassThickness: options.grassThickness ?? null,
      speed: options.speed ?? 220,
      tileWidth: options.tileWidth ?? 512,
      seed: options.seed ?? 1337,
    };

    // Runtime state
    this.scrollOffset = 0;
    this.isRunning = false;
    this._rafId = null;
    this._lastTimestamp = 0;

    // Logical dimensions (CSS pixels)
    this.viewportWidth = 1280;
    this.viewportHeight = 720;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Computed layout metrics
    this.currentGroundHeight = 80;
    this.currentGrassThickness = 18;
    this.groundTopY = 640;
    this.topCrownPadding = 5;

    // Offscreen seamless tile buffer
    this.tileCanvas = document.createElement("canvas");
    this.tileCtx = this.tileCanvas.getContext("2d");

    this.resize();
  }

  /**
   * Deterministic Pseudo-Random Number Generator (Mulberry32)
   */
  _createPRNG(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Evaluates a 100% periodic wave across [0, tileWidth] using integer harmonics
   */
  _periodicWave(x, tileWidth, harmonics) {
    const omega = (Math.PI * 2) / tileWidth;
    let sum = 0;
    for (let i = 0; i < harmonics.length; i++) {
      const h = harmonics[i];
      sum += h.amp * Math.sin(omega * h.freq * x + h.phase);
    }
    return sum;
  }

  /**
   * Executes a drawing callback at x, x - tileWidth, and x + tileWidth
   * so any stone, highlight, or grass tuft crossing the tile seam wraps seamlessly
   */
  _drawWrapped(tileWidth, x, drawCallback) {
    drawCallback(x);
    if (x < tileWidth * 0.25) {
      drawCallback(x + tileWidth);
    } else if (x > tileWidth * 0.75) {
      drawCallback(x - tileWidth);
    }
  }

  /**
   * Recomputes dimensions and rebuilds the pre-rendered seamless ground tile
   */
  resize(width, height) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (width && height) {
      this.viewportWidth = width;
      this.viewportHeight = height;
    } else {
      const rect = this.canvas.getBoundingClientRect();
      this.viewportWidth = rect.width || this.canvas.width || 1280;
      this.viewportHeight = rect.height || this.canvas.height || 720;

      this.canvas.width = Math.round(this.viewportWidth * this.dpr);
      this.canvas.height = Math.round(this.viewportHeight * this.dpr);
    }

    // Calibrated ground height (~11% of canvas height) & slim grass thickness (~22% of ground)
    this.currentGroundHeight =
      this.config.groundHeight !== null
        ? this.config.groundHeight
        : Math.max(48, Math.round(this.viewportHeight * this.config.heightRatio));

    this.currentGrassThickness =
      this.config.grassThickness !== null
        ? this.config.grassThickness
        : Math.max(10, Math.round(this.currentGroundHeight * this.config.grassRatio));

    this.groundTopY = this.viewportHeight - this.currentGroundHeight;

    this._buildSeamlessTile();
  }

  /**
   * Builds the high-DPI procedural tile with the original lush green grass & earthy stone-soil theme
   */
  _buildSeamlessTile() {
    const W = this.config.tileWidth;
    const H = this.currentGroundHeight;
    const G = this.currentGrassThickness;
    const pad = this.topCrownPadding;
    const totalTileH = H + pad;

    this.tileCanvas.width = Math.round(W * this.dpr);
    this.tileCanvas.height = Math.round(totalTileH * this.dpr);

    const ctx = this.tileCtx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, W, totalTileH);

    const rand = this._createPRNG(this.config.seed);

    // Smooth organic harmonics for top grass crown and lower scalloped edge
    const topCrownHarmonics = [
      { freq: 2, amp: 0.9, phase: 0.4 },
      { freq: 5, amp: 0.55, phase: 1.9 },
      { freq: 9, amp: 0.28, phase: 3.1 },
    ];

    const grassBottomHarmonics = [
      { freq: 2, amp: G * 0.09, phase: 0.2 },
      { freq: 4, amp: G * 0.08, phase: 1.5 },
      { freq: 7, amp: G * 0.055, phase: 4.2 },
      { freq: 11, amp: G * 0.03, phase: 2.7 },
    ];

    const topYAt = (x) => pad + this._periodicWave(x, W, topCrownHarmonics);
    const grassBottomYAt = (x) =>
      pad + G + this._periodicWave(x, W, grassBottomHarmonics);

    // =========================================================================
    // 1. SOIL / GROUND WALL BASE
    // =========================================================================
    ctx.beginPath();
    ctx.moveTo(0, pad + G * 0.4);
    ctx.lineTo(W, pad + G * 0.4);
    ctx.lineTo(W, totalTileH);
    ctx.lineTo(0, totalTileH);
    ctx.closePath();

    const soilGrad = ctx.createLinearGradient(0, pad + G * 0.4, 0, totalTileH);
    soilGrad.addColorStop(0.0, "#764626");
    soilGrad.addColorStop(0.32, "#63381c");
    soilGrad.addColorStop(0.72, "#4e2a14");
    soilGrad.addColorStop(1.0, "#3b1e0d");
    ctx.fillStyle = soilGrad;
    ctx.fill();

    // =========================================================================
    // 2. LAYERED SUBTERRANEAN SOIL STRATA (SMOOTH UNDULATING BANDS)
    // =========================================================================
    const soilDepth = H - G;
    const strataConfigs = [
      {
        yBase: pad + G + soilDepth * 0.28,
        thickness: soilDepth * 0.24,
        color: "rgba(138, 86, 46, 0.16)",
        harmonics: [
          { freq: 1, amp: soilDepth * 0.06, phase: 0.8 },
          { freq: 3, amp: soilDepth * 0.035, phase: 2.1 },
        ],
      },
      {
        yBase: pad + G + soilDepth * 0.56,
        thickness: soilDepth * 0.28,
        color: "rgba(38, 17, 6, 0.24)",
        harmonics: [
          { freq: 2, amp: soilDepth * 0.05, phase: 1.4 },
          { freq: 4, amp: soilDepth * 0.025, phase: 4.0 },
        ],
      },
      {
        yBase: pad + G + soilDepth * 0.82,
        thickness: soilDepth * 0.25,
        color: "rgba(26, 11, 4, 0.30)",
        harmonics: [
          { freq: 1, amp: soilDepth * 0.04, phase: 3.5 },
          { freq: 3, amp: soilDepth * 0.03, phase: 0.3 },
        ],
      },
    ];

    const step = 4;
    for (const band of strataConfigs) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += step) {
        const y = band.yBase + this._periodicWave(x, W, band.harmonics);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let x = W; x >= 0; x -= step) {
        const y =
          band.yBase +
          band.thickness +
          this._periodicWave(x, W, band.harmonics) * 0.8;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = band.color;
      ctx.fill();
    }

    // Soft organic soil mottling pockets (wrapped horizontally)
    const pocketCount = 24;
    for (let i = 0; i < pocketCount; i++) {
      const px = rand() * W;
      const py = pad + G + 5 + rand() * Math.max(8, soilDepth - 10);
      const rx = 12 + rand() * 24;
      const ry = 3 + rand() * 6.5;
      const isDark = rand() > 0.45;
      const fill = isDark
        ? `rgba(42, 19, 7, ${0.1 + rand() * 0.12})`
        : `rgba(150, 96, 54, ${0.08 + rand() * 0.1})`;

      this._drawWrapped(W, px, (drawX) => {
        ctx.beginPath();
        ctx.ellipse(drawX, py, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
      });
    }

    // =========================================================================
    // 3. EMBEDDED STONES, PEBBLES & MINERAL GRANULES
    // =========================================================================
    const stonePalettes = [
      { base: "#8c725a", highlight: "#ab927a", shadow: "#594534" },
      { base: "#7a614b", highlight: "#997f67", shadow: "#4d3a2a" },
      { base: "#988068", highlight: "#b59e86", shadow: "#63503d" },
      { base: "#6b533e", highlight: "#876e58", shadow: "#423122" },
    ];

    const stoneScale = Math.min(1, Math.max(0.65, soilDepth / 65));
    const stoneCount = Math.max(14, Math.round((W * Math.max(28, soilDepth)) / 2200));
    for (let i = 0; i < stoneCount; i++) {
      const sx = rand() * W;
      const minY = pad + G + 7;
      const maxY = totalTileH - 6;
      if (maxY <= minY) break;

      const sy = minY + rand() * (maxY - minY);
      const radiusX = (4.0 + rand() * 8.0) * stoneScale;
      const radiusY = radiusX * (0.58 + rand() * 0.25);
      const tilt = (rand() - 0.5) * 0.45;
      const palette = stonePalettes[Math.floor(rand() * stonePalettes.length)];

      this._drawWrapped(W, sx, (drawX) => {
        ctx.save();
        ctx.translate(drawX, sy);
        ctx.rotate(tilt);

        // Recessed dirt socket shadow beneath stone
        ctx.beginPath();
        ctx.ellipse(0, 1.8, radiusX * 1.05, radiusY * 1.05, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(30, 13, 4, 0.42)";
        ctx.fill();

        // Stone body
        ctx.beginPath();
        ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.fillStyle = palette.base;
        ctx.fill();

        // Lower-right inner shade
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ctx.ellipse(
          radiusX * 0.22,
          radiusY * 0.28,
          radiusX * 0.95,
          radiusY * 0.85,
          0,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = palette.shadow;
        ctx.fill();

        // Upper-left warm specular highlight
        ctx.beginPath();
        ctx.ellipse(
          -radiusX * 0.22,
          -radiusY * 0.28,
          radiusX * 0.65,
          radiusY * 0.48,
          0,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = palette.highlight;
        ctx.fill();
        ctx.restore();

        ctx.restore();
      });
    }

    // Subtle tiny soil granules/pebbles
    const granuleCount = 50;
    for (let i = 0; i < granuleCount; i++) {
      const gx = rand() * W;
      const gy = pad + G + 4 + rand() * Math.max(6, soilDepth - 7);
      const gr = 1.0 + rand() * 1.8;
      const isLight = rand() > 0.5;
      const color = isLight
        ? "rgba(168, 118, 78, 0.35)"
        : "rgba(38, 17, 6, 0.42)";

      this._drawWrapped(W, gx, (drawX) => {
        ctx.beginPath();
        ctx.arc(drawX, gy, gr, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
    }

    // =========================================================================
    // 4. CAST SHADOW IMMEDIATELY UNDER THE GRASS OVERHANG
    // =========================================================================
    const shadowDrop = Math.max(4, G * 0.28);
    ctx.beginPath();
    ctx.moveTo(0, pad + G * 0.5);
    ctx.lineTo(W, pad + G * 0.5);
    for (let x = W; x >= 0; x -= 2) {
      ctx.lineTo(x, grassBottomYAt(x) + shadowDrop);
    }
    ctx.closePath();

    const castShadowGrad = ctx.createLinearGradient(
      0,
      pad + G * 0.75,
      0,
      pad + G + shadowDrop + 3
    );
    castShadowGrad.addColorStop(0.0, "rgba(25, 10, 3, 0.58)");
    castShadowGrad.addColorStop(0.7, "rgba(32, 14, 4, 0.32)");
    castShadowGrad.addColorStop(1.0, "rgba(32, 14, 4, 0.0)");
    ctx.fillStyle = castShadowGrad;
    ctx.fill();

    // =========================================================================
    // 5. GRASS SURFACE & SCALLOPED TURF OVERHANG
    // =========================================================================
    ctx.save();
    ctx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const y = topYAt(x);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let x = W; x >= 0; x -= 2) {
      ctx.lineTo(x, grassBottomYAt(x));
    }
    ctx.closePath();

    // Main lush green body gradient
    const grassGrad = ctx.createLinearGradient(0, pad, 0, pad + G * 1.15);
    grassGrad.addColorStop(0.0, "#7ce23b");
    grassGrad.addColorStop(0.28, "#58c027");
    grassGrad.addColorStop(0.72, "#3f9c1b");
    grassGrad.addColorStop(1.0, "#2d7812");
    ctx.fillStyle = grassGrad;
    ctx.fill();

    // Clip interior details to the grass body silhouette
    ctx.clip();

    // Mid-tone scalloped turf volume cushions inside the grass strip
    const midWaveHarmonics = [
      { freq: 3, amp: G * 0.08, phase: 1.1 },
      { freq: 6, amp: G * 0.06, phase: 2.9 },
      { freq: 10, amp: G * 0.035, phase: 0.5 },
    ];
    ctx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const y =
        pad + G * 0.52 + this._periodicWave(x, W, midWaveHarmonics);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(W, pad + G * 1.4);
    ctx.lineTo(0, pad + G * 1.4);
    ctx.closePath();
    ctx.fillStyle = "rgba(36, 104, 14, 0.38)";
    ctx.fill();

    // Subtle organic grass blade accents inside the turf strip
    const tuftCount = 34;
    for (let i = 0; i < tuftCount; i++) {
      const tx = rand() * W;
      const ty = pad + G * (0.3 + rand() * 0.45);
      const bladeH = Math.max(4, G * (0.24 + rand() * 0.16));
      const bladeW = 1.8 + rand() * 1.5;
      const lean = (rand() - 0.35) * 3.8;
      const isBright = rand() > 0.45;

      this._drawWrapped(W, tx, (drawX) => {
        ctx.beginPath();
        ctx.moveTo(drawX - bladeW, ty);
        ctx.quadraticCurveTo(
          drawX + lean * 0.5,
          ty - bladeH * 0.7,
          drawX + lean,
          ty - bladeH
        );
        ctx.quadraticCurveTo(
          drawX + bladeW * 0.6 + lean * 0.4,
          ty - bladeH * 0.45,
          drawX + bladeW,
          ty
        );
        ctx.closePath();
        ctx.fillStyle = isBright
          ? "rgba(162, 245, 85, 0.28)"
          : "rgba(32, 92, 12, 0.26)";
        ctx.fill();
      });
    }

    // Warm sunlit top rim bevel along the upper edge of the grass
    const bevelThickness = Math.max(3, G * 0.26);
    ctx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const y = topYAt(x);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let x = W; x >= 0; x -= 2) {
      const bevelWave =
        Math.sin(((Math.PI * 2) / W) * 4 * x + 0.7) * (bevelThickness * 0.18);
      ctx.lineTo(x, topYAt(x) + bevelThickness + bevelWave);
    }
    ctx.closePath();

    const bevelGrad = ctx.createLinearGradient(
      0,
      pad - 2,
      0,
      pad + bevelThickness + 2
    );
    bevelGrad.addColorStop(0.0, "rgba(192, 255, 102, 0.85)");
    bevelGrad.addColorStop(0.65, "rgba(152, 236, 68, 0.45)");
    bevelGrad.addColorStop(1.0, "rgba(124, 214, 52, 0.0)");
    ctx.fillStyle = bevelGrad;
    ctx.fill();

    ctx.restore();

    // =========================================================================
    // 6. CRISP UNDERSIDE LIP HIGHLIGHT & TOP CROWN MICRO-TUFTS
    // =========================================================================
    ctx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const y = grassBottomYAt(x);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(31, 84, 11, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Soft, sparse rounded grass crown tips along the very top edge
    const crownTuftCount = 22;
    for (let i = 0; i < crownTuftCount; i++) {
      const cx = (i / crownTuftCount) * W + (rand() - 0.5) * 12;
      const baseTopY = topYAt(cx) + 1.0;
      const tipH = 1.8 + rand() * 2.0;
      const tipW = 3.0 + rand() * 2.5;
      const slant = (rand() - 0.3) * 2.5;

      this._drawWrapped(W, cx, (drawX) => {
        ctx.beginPath();
        ctx.moveTo(drawX - tipW, baseTopY);
        ctx.quadraticCurveTo(
          drawX,
          baseTopY - tipH * 1.15,
          drawX + slant,
          baseTopY - tipH
        );
        ctx.quadraticCurveTo(
          drawX + tipW * 0.5,
          baseTopY - tipH * 0.4,
          drawX + tipW,
          baseTopY
        );
        ctx.closePath();
        ctx.fillStyle = "#9ef050";
        ctx.fill();
      });
    }

    ctx.restore();
  }

  /**
   * Advances horizontal ground scroll position using delta time
   */
  update(dt) {
    if (dt <= 0) return;
    const safeDt = Math.min(dt, 0.1);
    const tileW = this.config.tileWidth;

    this.scrollOffset = (this.scrollOffset + this.config.speed * safeDt) % tileW;
    if (this.scrollOffset < 0) {
      this.scrollOffset += tileW;
    }
  }

  /**
   * Renders the seamless ground onto the provided 2D canvas context
   */
  render(targetCtx = this.ctx) {
    const tileW = this.config.tileWidth;
    const totalTileH = this.currentGroundHeight + this.topCrownPadding;
    const drawY = this.groundTopY - this.topCrownPadding;

    targetCtx.save();
    const isIdentityTransform = targetCtx.getTransform().a === 1;
    if (isIdentityTransform && this.canvas.width !== this.viewportWidth) {
      targetCtx.scale(this.dpr, this.dpr);
    }

    let startX = -this.scrollOffset;
    while (startX < this.viewportWidth) {
      targetCtx.drawImage(
        this.tileCanvas,
        0,
        0,
        this.tileCanvas.width,
        this.tileCanvas.height,
        startX,
        drawY,
        tileW + 0.5,
        totalTileH
      );
      startX += tileW;
    }

    targetCtx.restore();
  }

  /**
   * Returns the logical Y coordinate of the top collision surface of the ground
   */
  getTopY() {
    return this.groundTopY;
  }

  /**
   * Helper to check if a bounding circle or box touches the ground plane
   */
  isColliding(bottomY) {
    return bottomY >= this.groundTopY;
  }

  /**
   * Updates scrolling speed dynamically from the host game
   */
  setSpeed(speedPxPerSecond) {
    this.config.speed = Math.max(0, Number(speedPxPerSecond) || 0);
  }

  /**
   * Updates ground height or grass thickness and regenerates the seamless tile
   */
  setConfig(newOptions = {}) {
    Object.assign(this.config, newOptions);
    this.resize(this.viewportWidth, this.viewportHeight);
  }

  /**
   * Resets scroll offset to the initial position
   */
  reset() {
    this.scrollOffset = 0;
    if (!this.isRunning) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.render();
    }
  }

  /**
   * Starts the standalone animation loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._lastTimestamp = performance.now();

    const loop = (now) => {
      if (!this.isRunning) return;
      const dt = (now - this._lastTimestamp) / 1000;
      this._lastTimestamp = now;

      this.update(dt);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.render();

      this._rafId = requestAnimationFrame(loop);
    };

    this._rafId = requestAnimationFrame(loop);
  }

  /**
   * Stops the standalone animation loop
   */
  stop() {
    this.isRunning = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }
}

// Automatically initialize with the original theme and calibrated height proportions
document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  if (!canvas) return;

  const ground = new ScrollingGround(canvas, {
    heightRatio: 0.11, // Sleek total ground height matching your screenshot
    grassRatio: 0.22,  // Slim lush grass strip + rich earthy soil body
    speed: 220,
  });

  ground.start();

  window.addEventListener("resize", () => {
    ground.resize();
    if (!ground.isRunning) {
      ground.render();
    }
  });
});
