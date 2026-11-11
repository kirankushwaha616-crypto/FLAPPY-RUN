/**
 * Flappy Face - Ultra-Realistic Dense Giant Jungle & Nature Parallax Engine
 * Features:
 * - Ray-marched volumetric clouds & physical Rayleigh/Mie sky scattering
 * - 3D normal-mapped misty mountain ridges
 * - Multi-plane dense rainforest / woodland with towering 500px-880px ancient trees
 * - 3D cylindrical bark shading, buttress roots, mossy limbs & hanging liana vines
 * - Subsurface-scattered individual leaf clusters, giant ferns, and cathedral god-rays
 * Pure HTML5 Canvas, 16:9 (1920x1080 logical space), zero external image URLs.
 */
(function (global) {
  'use strict';

  const LOGICAL_WIDTH = 1920;
  const LOGICAL_HEIGHT = 1080;
  const TWO_PI = Math.PI * 2;

  // Default Photorealistic Dense Jungle Palette (customizable via setBackgroundTheme)
  const DEFAULT_THEME = {
    sky: {
      zenith: [22, 64, 118],
      upperMid: [48, 108, 166],
      lowerMid: [104, 166, 208],
      horizon: [208, 236, 232],
      sunGlow: [255, 248, 212]
    },
    sun: {
      x: 1440,
      y: 210,
      dirX: 0.56,
      dirY: -0.46,
      dirZ: 0.69
    },
    clouds: {
      sunlitTop: [255, 253, 246],
      silverLining: [255, 250, 232],
      ambientMid: [204, 222, 234],
      deepBaseShadow: [112, 138, 166],
      warmBounce: [218, 226, 210]
    },
    mountains: {
      rockDark: [42, 66, 78],
      rockLight: [96, 126, 134],
      snowSunlit: [248, 252, 250],
      snowShade: [156, 188, 206],
      hazeColor: [188, 224, 222],
      hazeStrength: 0.72
    },
    distantJungle: {
      canopyDark: [18, 48, 38],
      canopyMid: [38, 82, 54],
      canopyLight: [88, 142, 76],
      mistColor: [176, 216, 208]
    },
    midForest: {
      trunkDark: '#16120e',
      trunkMid: '#2d231b',
      trunkLight: '#524432',
      canopyOcclusion: [8, 26, 14],
      canopyDark: [16, 46, 22],
      canopyMid: [34, 78, 32],
      canopySunlit: [96, 154, 52],
      canopyRim: [152, 204, 72],
      mistColor: 'rgba(178, 222, 198, 0.36)'
    },
    giantTrees: {
      barkShadow: '#120d0a',
      barkCore: '#261c15',
      barkWarm: '#453325',
      barkSunlit: '#6e583f',
      mossShadow: '#1d3b1a',
      mossSunlit: '#6ba832',
      leafDeepShadow: '#061709',
      leafShadow: '#113016',
      leafMid: '#245922',
      leafBright: '#589e2e',
      leafSubsurface: '#a6e048',
      vineDark: '#132e14',
      vineLight: '#4e8c2b'
    },
    foreground: {
      soilDark: '#071408',
      earthMid: '#122b13',
      fernDark: '#0d2910',
      fernMid: '#24591e',
      fernSunlit: '#6cb832',
      grassDark: '#0f2e11',
      grassMid: '#296621',
      grassBright: '#62ad30',
      grassGoldTip: '#aae34f',
      flowerPetal: '#fffdf2',
      flowerCenter: '#f7b928',
      orchidPink: '#ff7eb6'
    }
  };

  // ===========================================================================
  // Utility Functions & Seeded PRNG
  // ===========================================================================

  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function createSeededRandom(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createOffscreenBuffer(width, height) {
    const buffer = document.createElement('canvas');
    buffer.width = width;
    buffer.height = height;
    return buffer;
  }

  /**
   * Executes a drawing callback at x, x + width, and x - width whenever an object
   * is within `margin` pixels of the tile boundary, ensuring 100% seamless looping.
   */
  function drawWrappedHorizontal(ctx, x, width, margin, drawCallback) {
    drawCallback(x);
    if (x < margin) drawCallback(x + width);
    if (x > width - margin) drawCallback(x - width);
  }

  // ===========================================================================
  // Seamless Horizontally-Periodic 2D Gradient Noise & Multifractal Generator
  // ===========================================================================

  class PeriodicNoise2D {
    constructor(seed = 2026) {
      const rand = createSeededRandom(seed);
      this.perm = new Uint8Array(512);
      this.gradX = new Float32Array(256);
      this.gradY = new Float32Array(256);

      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        p[i] = i;
        const angle = rand() * TWO_PI;
        this.gradX[i] = Math.cos(angle);
        this.gradY[i] = Math.sin(angle);
      }

      for (let i = 255; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = p[i];
        p[i] = p[j];
        p[j] = tmp;
      }

      for (let i = 0; i < 512; i++) {
        this.perm[i] = p[i & 255];
      }
    }

    sample(u, v, periodX, offsetY = 0) {
      const px = u * periodX;
      const py = v * periodX + offsetY;

      const x0 = Math.floor(px);
      const y0 = Math.floor(py);

      const fx = px - x0;
      const fy = py - y0;

      let ix0 = x0 % periodX;
      if (ix0 < 0) ix0 += periodX;
      const ix1 = (ix0 + 1) % periodX;

      const iy0 = y0 & 255;
      const iy1 = (y0 + 1) & 255;

      const perm = this.perm;
      const gx = this.gradX;
      const gy = this.gradY;

      const h00 = perm[(ix0 & 255) + perm[iy0]];
      const h10 = perm[(ix1 & 255) + perm[iy0]];
      const h01 = perm[(ix0 & 255) + perm[iy1]];
      const h11 = perm[(ix1 & 255) + perm[iy1]];

      const n00 = gx[h00] * fx + gy[h00] * fy;
      const n10 = gx[h10] * (fx - 1) + gy[h10] * fy;
      const n01 = gx[h01] * fx + gy[h01] * (fy - 1);
      const n11 = gx[h11] * (fx - 1) + gy[h11] * (fy - 1);

      const uu = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
      const vv = fy * fy * fy * (fy * (fy * 6 - 15) + 10);

      const nx0 = n00 + uu * (n10 - n00);
      const nx1 = n01 + uu * (n11 - n01);

      return (nx0 + vv * (nx1 - nx0)) * 1.4142;
    }

    fbm(u, v, basePeriodX, octaves = 5, persistence = 0.5, offsetY = 0) {
      let total = 0;
      let amp = 0.5;
      let norm = 0;
      let period = basePeriodX;
      let shiftY = offsetY;

      for (let i = 0; i < octaves; i++) {
        total += this.sample(u, v, period, shiftY) * amp;
        norm += amp;
        amp *= persistence;
        period *= 2;
        shiftY += 37.41;
      }
      return total / norm;
    }

    ridged(u, v, basePeriodX, octaves = 6, persistence = 0.52, offsetY = 0) {
      let total = 0;
      let amp = 0.5;
      let weight = 1.0;
      let norm = 0;
      let period = basePeriodX;
      let shiftY = offsetY;

      for (let i = 0; i < octaves; i++) {
        let signal = 1.0 - Math.abs(this.sample(u, v, period, shiftY));
        signal = signal * signal * weight;
        weight = clamp(signal * 1.9, 0.15, 1.0);
        total += signal * amp;
        norm += amp;
        amp *= persistence;
        period *= 2;
        shiftY += 53.19;
      }
      return total / norm;
    }

    billow(u, v, basePeriodX, octaves = 5, persistence = 0.5, offsetY = 0) {
      let total = 0;
      let amp = 0.5;
      let norm = 0;
      let period = basePeriodX;
      let shiftY = offsetY;

      for (let i = 0; i < octaves; i++) {
        const signal = Math.abs(this.sample(u, v, period, shiftY));
        total += signal * amp;
        norm += amp;
        amp *= persistence;
        period *= 2;
        shiftY += 29.73;
      }
      return total / norm;
    }
  }

  // ===========================================================================
  // Main Photorealistic Dense Jungle Background Class
  // ===========================================================================

  class NatureParallaxBackground {
    constructor(canvasElement) {
      this.canvas = canvasElement;
      this.ctx = this.canvas.getContext('2d', { alpha: false });

      this.theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
      this.noise = new PeriodicNoise2D(7919);

      // Base foreground speed in logical pixels per second
      this.baseScrollSpeed = 240;
      this.speedMultiplier = 1.0;

      this.isRunning = false;
      this.rafId = null;
      this.lastTimestamp = 0;
      this.elapsedTime = 0;
      this.renderScaleX = 1;
      this.renderScaleY = 1;

      // 9 Independent Parallax Layers ordered back-to-front for deep jungle immersion
      this.layers = [
        { id: 'farClouds', parallaxFactor: 0.05, offset: 0, buffer: null },
        { id: 'nearClouds', parallaxFactor: 0.10, offset: 0, buffer: null },
        { id: 'mistyMountains', parallaxFactor: 0.17, offset: 0, buffer: null },
        { id: 'distantJungleWall', parallaxFactor: 0.28, offset: 0, buffer: null },
        { id: 'midBackTallForest', parallaxFactor: 0.44, offset: 0, buffer: null },
        { id: 'cathedralSunbeams', parallaxFactor: 0.54, offset: 0, buffer: null },
        { id: 'giantAncientTrees', parallaxFactor: 0.68, offset: 0, buffer: null },
        { id: 'nearJungleCanopyAndFerns', parallaxFactor: 0.85, offset: 0, buffer: null },
        { id: 'foregroundJungleFloor', parallaxFactor: 1.00, offset: 0, buffer: null }
      ];

      this.staticSkyBuffer = null;

      // Lightweight zero-allocation floating sunlit jungle pollen/spore motes
      this.motes = this._initJungleMotes(55);

      this._boundAnimate = this._animate.bind(this);
      this._boundResize = this.resize.bind(this);
      this._boundVisibilityChange = this._onVisibilityChange.bind(this);

      this._init();
    }

    _init() {
      this.bakeAllLayers();
      this.resize();

      window.addEventListener('resize', this._boundResize, { passive: true });
      document.addEventListener('visibilitychange', this._boundVisibilityChange);

      if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
        this.resizeObserver = new ResizeObserver(this._boundResize);
        this.resizeObserver.observe(this.canvas.parentElement);
      }

      this.start();
    }

    _initJungleMotes(count) {
      const rand = createSeededRandom(99123);
      const arr = [];
      for (let i = 0; i < count; i++) {
        arr.push({
          x: rand() * LOGICAL_WIDTH,
          y: 160 + rand() * 780,
          radius: 1.1 + rand() * 2.2,
          speedFactor: 0.52 + rand() * 0.35,
          driftPhase: rand() * TWO_PI,
          driftAmp: 12 + rand() * 22,
          alpha: 0.25 + rand() * 0.55
        });
      }
      return arr;
    }

    /**
     * Bakes all procedural pixel-shader and botanical layers into offscreen canvases.
     */
    bakeAllLayers() {
      this.staticSkyBuffer = this._bakeAtmosphericSky();

      const builders = {
        farClouds: () =>
          this._bakeVolumetricCumulusLayer({
            seedOffset: 14.8,
            basePeriod: 4,
            minY: 50,
            maxY: 390,
            coverage: 0.45,
            opacity: 0.80
          }),
        nearClouds: () =>
          this._bakeVolumetricCumulusLayer({
            seedOffset: 82.3,
            basePeriod: 3,
            minY: 25,
            maxY: 430,
            coverage: 0.48,
            opacity: 0.94
          }),
        mistyMountains: () => this._bakeMistyMountainLayer(),
        distantJungleWall: () => this._bakeDistantJungleWallLayer(),
        midBackTallForest: () => this._bakeMidBackTallForestLayer(),
        cathedralSunbeams: () => this._bakeCathedralSunbeamsLayer(),
        giantAncientTrees: () => this._bakeGiantAncientTreesLayer(),
        nearJungleCanopyAndFerns: () => this._bakeNearJungleCanopyLayer(),
        foregroundJungleFloor: () => this._bakeForegroundJungleFloorLayer()
      };

      for (let i = 0; i < this.layers.length; i++) {
        const layer = this.layers[i];
        if (builders[layer.id]) {
          layer.buffer = builders[layer.id]();
        }
      }
    }

    // =========================================================================
    // Layer 0: Physical Rayleigh/Mie Sky Dome & Tropical Solar Bloom
    // =========================================================================
    _bakeAtmosphericSky() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const imgData = ctx.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const data = imgData.data;

      const { sky, sun } = this.theme;

      const rLut = new Float32Array(LOGICAL_HEIGHT);
      const gLut = new Float32Array(LOGICAL_HEIGHT);
      const bLut = new Float32Array(LOGICAL_HEIGHT);

      for (let y = 0; y < LOGICAL_HEIGHT; y++) {
        const t = clamp(y / (LOGICAL_HEIGHT * 0.78), 0, 1);
        let c0, c1, localT;
        if (t < 0.35) {
          c0 = sky.zenith;
          c1 = sky.upperMid;
          localT = t / 0.35;
        } else if (t < 0.70) {
          c0 = sky.upperMid;
          c1 = sky.lowerMid;
          localT = (t - 0.35) / 0.35;
        } else {
          c0 = sky.lowerMid;
          c1 = sky.horizon;
          localT = (t - 0.70) / 0.30;
        }
        localT = smoothstep(0, 1, localT);
        rLut[y] = lerp(c0[0], c1[0], localT);
        gLut[y] = lerp(c0[1], c1[1], localT);
        bLut[y] = lerp(c0[2], c1[2], localT);
      }

      const sunX = sun.x;
      const sunY = sun.y;
      const glowR = sky.sunGlow[0];
      const glowG = sky.sunGlow[1];
      const glowB = sky.sunGlow[2];

      let idx = 0;
      for (let y = 0; y < LOGICAL_HEIGHT; y++) {
        const baseR = rLut[y];
        const baseG = gLut[y];
        const baseB = bLut[y];
        const dy = y - sunY;
        const dy2 = dy * dy;

        for (let x = 0; x < LOGICAL_WIDTH; x++) {
          const dx = x - sunX;
          const dist = Math.sqrt(dx * dx + dy2);

          const mie = Math.exp(-dist * 0.0022) * 0.68 + Math.exp(-dist * 0.0085) * 0.45;
          const core = smoothstep(82, 16, dist);

          const r = lerp(baseR, glowR, clamp(mie, 0, 1)) + core * 48;
          const g = lerp(baseG, glowG, clamp(mie, 0, 1)) + core * 44;
          const b = lerp(baseB, glowB, clamp(mie * 0.86, 0, 1)) + core * 36;

          data[idx++] = clamp(r, 0, 255);
          data[idx++] = clamp(g, 0, 255);
          data[idx++] = clamp(b, 0, 255);
          data[idx++] = 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);
      return buffer;
    }

    // =========================================================================
    // Layer 1 & 2: Ray-Marched Volumetric Cumulus Clouds (Beer-Lambert Law)
    // =========================================================================
    _bakeVolumetricCumulusLayer(config) {
      const { seedOffset, basePeriod, minY, maxY, coverage, opacity } = config;
      const bandHeight = maxY - minY;

      const w = 960;
      const h = Math.round(bandHeight * 0.5);
      const smallBuf = createOffscreenBuffer(w, h);
      const smallCtx = smallBuf.getContext('2d');
      const imgData = smallCtx.createImageData(w, h);
      const data = imgData.data;

      const noise = this.noise;
      const { clouds, sun } = this.theme;
      const densityField = new Float32Array(w * h);

      for (let y = 0; y < h; y++) {
        const ny = y / h;
        const v = ny * 0.25;
        const topProfile = smoothstep(0.0, 0.36, ny);
        const baseProfile = smoothstep(1.0, 0.78, ny);
        const verticalEnvelope = topProfile * baseProfile;

        for (let x = 0; x < w; x++) {
          const u = x / w;
          const wx = noise.fbm(u, v, basePeriod, 3, 0.5, seedOffset) * 0.035;
          const wy = noise.fbm(u, v, basePeriod, 3, 0.5, seedOffset + 31.7) * 0.035;

          const macroShape =
            noise.fbm(u + wx, v + wy, basePeriod, 4, 0.52, seedOffset + 71.2) * 0.5 + 0.5;
          const billowTurbulence = noise.billow(
            u + wx * 0.6,
            v + wy * 0.6,
            basePeriod * 2,
            4,
            0.5,
            seedOffset + 113.5
          );
          const microDetail =
            noise.fbm(u, v, basePeriod * 4, 3, 0.5, seedOffset + 190.4) * 0.5 + 0.5;

          const heightBias = (1.0 - ny) * 0.15;
          const raw =
            (macroShape * 0.62 + billowTurbulence * 0.28 + microDetail * 0.10) *
              verticalEnvelope -
            heightBias;

          densityField[y * w + x] = smoothstep(coverage, coverage + 0.25, raw);
        }
      }

      const sunStepX = sun.dirX * 4.5;
      const sunStepY = sun.dirY * 4.5;

      let idx = 0;
      for (let y = 0; y < h; y++) {
        const ny = y / h;
        for (let x = 0; x < w; x++) {
          const d = densityField[y * w + x];
          if (d <= 0.004) {
            idx += 4;
            continue;
          }

          let opticalDepth = 0;
          for (let s = 1; s <= 6; s++) {
            const sx = ((Math.round(x + sunStepX * s * s * 0.35) % w) + w) % w;
            const sy = Math.round(y + sunStepY * s * s * 0.35);
            if (sy >= 0 && sy < h) {
              opticalDepth += densityField[sy * w + sx] * 0.32;
            }
          }

          const transmittance = Math.exp(-opticalDepth * 2.8);
          const powderEffect = 1.0 - Math.exp(-d * 4.2);
          const directSun = clamp(transmittance * (0.65 + 0.35 * powderEffect), 0, 1);
          const silverLining = Math.pow(transmittance, 3.0) * (1.0 - d * 0.65);
          const ambientHeight = clamp(1.0 - ny * 0.85, 0.15, 1.0);

          let r = lerp(clouds.deepBaseShadow[0], clouds.ambientMid[0], ambientHeight);
          let g = lerp(clouds.deepBaseShadow[1], clouds.ambientMid[1], ambientHeight);
          let b = lerp(clouds.deepBaseShadow[2], clouds.ambientMid[2], ambientHeight);

          const bounceFactor = smoothstep(0.55, 0.95, ny) * (1.0 - directSun) * 0.35;
          r = lerp(r, clouds.warmBounce[0], bounceFactor);
          g = lerp(g, clouds.warmBounce[1], bounceFactor);
          b = lerp(b, clouds.warmBounce[2], bounceFactor);

          r = lerp(r, clouds.sunlitTop[0], directSun);
          g = lerp(g, clouds.sunlitTop[1], directSun);
          b = lerp(b, clouds.sunlitTop[2], directSun);

          r = lerp(r, clouds.silverLining[0], silverLining * 0.55);
          g = lerp(g, clouds.silverLining[1], silverLining * 0.55);
          b = lerp(b, clouds.silverLining[2], silverLining * 0.55);

          const alpha = smoothstep(0.0, 0.22, d) * opacity;

          data[idx++] = clamp(r, 0, 255);
          data[idx++] = clamp(g, 0, 255);
          data[idx++] = clamp(b, 0, 255);
          data[idx++] = clamp(alpha * 255, 0, 255);
        }
      }

      smallCtx.putImageData(imgData, 0, 0);

      const fullBuffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = fullBuffer.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(smallBuf, 0, minY, LOGICAL_WIDTH, bandHeight);
      return fullBuffer;
    }

    // =========================================================================
    // Layer 3: Distant 3D Normal-Mapped Misty Mountains
    // =========================================================================
    _bakeMistyMountainLayer() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const imgData = ctx.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const data = imgData.data;

      const noise = this.noise;
      const { mountains, sun } = this.theme;
      const bottomY = 760;

      const ridgeY = new Float32Array(LOGICAL_WIDTH);
      let minRidgeY = LOGICAL_HEIGHT;

      for (let x = 0; x < LOGICAL_WIDTH; x++) {
        const u = x / LOGICAL_WIDTH;
        const macro = noise.ridged(u, 0.14, 3, 6, 0.54, 14.2);
        const secondary = noise.fbm(u, 0.25, 2, 4, 0.5, 91.7) * 0.5 + 0.5;
        const h = 360 + (1.0 - macro) * 195 + (secondary - 0.5) * 55;
        ridgeY[x] = h;
        if (h < minRidgeY) minRidgeY = h;
      }

      const startY = Math.max(0, Math.floor(minRidgeY) - 2);

      const evalRelief = (x, y) => {
        const wrappedX = ((x % LOGICAL_WIDTH) + LOGICAL_WIDTH) % LOGICAL_WIDTH;
        const u = wrappedX / LOGICAL_WIDTH;
        const v = y / LOGICAL_WIDTH;
        const depth = Math.max(0, y - ridgeY[wrappedX]);
        const spurU = u + (depth / LOGICAL_WIDTH) * 0.2;
        const spurs = noise.ridged(spurU, v * 0.85, 5, 5, 0.55, 108.4);
        const gullies = noise.ridged(u - (depth / LOGICAL_WIDTH) * 0.14, v * 1.4, 10, 4, 0.5, 211.9);
        return spurs * 64 + gullies * 26 - depth * 0.3;
      };

      for (let x = 0; x < LOGICAL_WIDTH; x++) {
        const crestY = Math.floor(ridgeY[x]);
        const u = x / LOGICAL_WIDTH;

        for (let y = crestY; y < bottomY; y++) {
          const v = y / LOGICAL_WIDTH;
          const hL = evalRelief(x - 2, y);
          const hR = evalRelief(x + 2, y);
          const hU = evalRelief(x, y - 2);
          const hD = evalRelief(x, y + 2);

          let nx = (hL - hR) * 0.14;
          let ny = (hU - hD) * 0.14;
          let nz = 1.0;
          const invLen = 1.0 / Math.hypot(nx, ny, nz);
          nx *= invLen;
          ny *= invLen;
          nz *= invLen;

          const ndotl = clamp(nx * sun.dirX + ny * sun.dirY + nz * sun.dirZ, 0, 1);
          const altitudeFactor = clamp(1.0 - (y - 375) / 260, 0, 1);
          const gullyNoise = noise.ridged(u, v * 1.6, 12, 3, 0.5, 412.6);
          const snowMask = smoothstep(
            0.70,
            0.88,
            altitudeFactor * 0.65 + nz * 0.4 + gullyNoise * 0.3
          );

          let r = lerp(mountains.rockDark[0], mountains.rockLight[0], ndotl);
          let g = lerp(mountains.rockDark[1], mountains.rockLight[1], ndotl);
          let b = lerp(mountains.rockDark[2], mountains.rockLight[2], ndotl);

          const sr = lerp(mountains.snowShade[0], mountains.snowSunlit[0], ndotl);
          const sg = lerp(mountains.snowShade[1], mountains.snowSunlit[1], ndotl);
          const sb = lerp(mountains.snowShade[2], mountains.snowSunlit[2], ndotl);

          r = lerp(r, sr, snowMask);
          g = lerp(g, sg, snowMask);
          b = lerp(b, sb, snowMask);

          const valleyMist = smoothstep(540, bottomY, y);
          const haze = clamp(mountains.hazeStrength * 0.55 + valleyMist * 0.45, 0, 0.95);

          r = lerp(r, mountains.hazeColor[0], haze);
          g = lerp(g, mountains.hazeColor[1], haze);
          b = lerp(b, mountains.hazeColor[2], haze);

          const edgeAlpha = clamp(y - ridgeY[x] + 1.2, 0, 1);
          const idx = (y * LOGICAL_WIDTH + x) * 4;
          data[idx] = clamp(r, 0, 255);
          data[idx + 1] = clamp(g, 0, 255);
          data[idx + 2] = clamp(b, 0, 255);
          data[idx + 3] = Math.round(edgeAlpha * 255);
        }
      }

      ctx.putImageData(imgData, 0, 0, 0, startY, LOGICAL_WIDTH, bottomY - startY);
      return buffer;
    }

    // =========================================================================
    // Layer 4: Distant Dense Jungle Canopy Wall & Rising Rainforest Mist
    // =========================================================================
    _bakeDistantJungleWallLayer() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(30301);
      const noise = this.noise;
      const { distantJungle, sun } = this.theme;
      const bottomY = 890;

      // High canopy horizon so the forest feels deep and enveloping
      const ridgeY = new Float32Array(LOGICAL_WIDTH);
      for (let x = 0; x < LOGICAL_WIDTH; x++) {
        const u = x / LOGICAL_WIDTH;
        const hill = noise.fbm(u, 0.35, 3, 4, 0.5, 214.5) * 65;
        const crowns = noise.billow(u, 0.8, 24, 3, 0.55, 298.1) * 26;
        ridgeY[x] = 560 + hill - crowns;
      }

      // Per-pixel 3D normal-mapped deep rainforest canopy carpet
      const imgData = ctx.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const data = imgData.data;

      const evalCanopy = (x, y) => {
        const wrappedX = ((x % LOGICAL_WIDTH) + LOGICAL_WIDTH) % LOGICAL_WIDTH;
        const u = wrappedX / LOGICAL_WIDTH;
        const v = y / LOGICAL_WIDTH;
        return (
          noise.billow(u, v * 1.35, 28, 4, 0.58, 512.7) * 28 +
          noise.fbm(u, v * 0.7, 6, 3, 0.5, 601.3) * 35
        );
      };

      for (let x = 0; x < LOGICAL_WIDTH; x++) {
        const crestY = Math.floor(ridgeY[x]);
        for (let y = crestY; y < bottomY; y++) {
          const hL = evalCanopy(x - 2, y);
          const hR = evalCanopy(x + 2, y);
          const hU = evalCanopy(x, y - 2);
          const hD = evalCanopy(x, y + 2);

          let nx = (hL - hR) * 0.16;
          let ny = (hU - hD) * 0.16;
          let nz = 1.0;
          const invLen = 1.0 / Math.hypot(nx, ny, nz);
          nx *= invLen;
          ny *= invLen;
          nz *= invLen;

          const ndotl = clamp(nx * sun.dirX + ny * sun.dirY + nz * sun.dirZ, 0, 1);

          let r, g, b;
          if (ndotl < 0.45) {
            const t = ndotl / 0.45;
            r = lerp(distantJungle.canopyDark[0], distantJungle.canopyMid[0], t);
            g = lerp(distantJungle.canopyDark[1], distantJungle.canopyMid[1], t);
            b = lerp(distantJungle.canopyDark[2], distantJungle.canopyMid[2], t);
          } else {
            const t = (ndotl - 0.45) / 0.55;
            r = lerp(distantJungle.canopyMid[0], distantJungle.canopyLight[0], t);
            g = lerp(distantJungle.canopyMid[1], distantJungle.canopyLight[1], t);
            b = lerp(distantJungle.canopyMid[2], distantJungle.canopyLight[2], t);
          }

          // Humid jungle mist rising from the valley floor
          const mist = smoothstep(640, bottomY, y) * 0.58 + 0.18;
          r = lerp(r, distantJungle.mistColor[0], mist);
          g = lerp(g, distantJungle.mistColor[1], mist);
          b = lerp(b, distantJungle.mistColor[2], mist);

          const edgeAlpha = clamp(y - ridgeY[x] + 1.5, 0, 1);
          const idx = (y * LOGICAL_WIDTH + x) * 4;
          data[idx] = clamp(r, 0, 255);
          data[idx + 1] = clamp(g, 0, 255);
          data[idx + 2] = clamp(b, 0, 255);
          data[idx + 3] = Math.round(edgeAlpha * 255);
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // Stamp emergent giant canopy domes along the ridge top
      for (let x = 0; x < LOGICAL_WIDTH; x += 26) {
        const y = ridgeY[x] + 12 + (rand() - 0.5) * 14;
        const crownR = 32 + rand() * 36;
        drawWrappedHorizontal(ctx, x, LOGICAL_WIDTH, 120, (drawX) => {
          this._drawLayeredLeafCanopy(
            ctx,
            drawX,
            y,
            crownR,
            'rgb(24, 58, 44)',
            'rgb(44, 88, 58)',
            'rgb(74, 124, 72)',
            'rgb(118, 166, 92)',
            rand
          );
        });
      }

      return buffer;
    }

    // =========================================================================
    // Layer 5: Mid-Back Towering Timber Forest (420px - 620px Tall Trees!)
    // =========================================================================
    _bakeMidBackTallForestLayer() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(40409);
      const noise = this.noise;
      const { midForest } = this.theme;

      // Dense dark forest understory backdrop
      const baseContour = new Float32Array(LOGICAL_WIDTH + 1);
      for (let x = 0; x <= LOGICAL_WIDTH; x++) {
        const u = (x % LOGICAL_WIDTH) / LOGICAL_WIDTH;
        baseContour[x] = 695 + noise.fbm(u, 0.52, 4, 4, 0.5, 311.4) * 48;
      }

      const understoryGrad = ctx.createLinearGradient(0, 640, 0, 980);
      understoryGrad.addColorStop(0.0, 'rgb(20, 52, 28)');
      understoryGrad.addColorStop(0.45, 'rgb(12, 34, 18)');
      understoryGrad.addColorStop(1.0, 'rgb(7, 20, 11)');

      ctx.fillStyle = understoryGrad;
      ctx.beginPath();
      ctx.moveTo(0, 990);
      for (let x = 0; x <= LOGICAL_WIDTH; x += 2) {
        ctx.lineTo(x, baseContour[x]);
      }
      ctx.lineTo(LOGICAL_WIDTH, 990);
      ctx.closePath();
      ctx.fill();

      // Generate 58 towering mid-ground forest trees (400px to 620px tall)
      const trees = [];
      const count = 58;
      for (let i = 0; i < count; i++) {
        const x = (i / count) * LOGICAL_WIDTH + (rand() - 0.5) * 28;
        const wrappedX = ((x % LOGICAL_WIDTH) + LOGICAL_WIDTH) % LOGICAL_WIDTH;
        const baseY = 855 + rand() * 110;
        const height = 410 + rand() * 230; // Reaches up to y = 240 - 450!
        const trunkWidth = 18 + rand() * 22;
        const isConifer = rand() > 0.68;
        trees.push({ x: wrappedX, baseY, height, trunkWidth, isConifer });
      }

      // Sort by baseY so closer trees overlap slightly deeper ones
      trees.sort((a, b) => a.baseY - b.baseY);

      const occStr = `rgb(${midForest.canopyOcclusion.join(',')})`;
      const darkStr = `rgb(${midForest.canopyDark.join(',')})`;
      const midStr = `rgb(${midForest.canopyMid.join(',')})`;
      const sunStr = `rgb(${midForest.canopySunlit.join(',')})`;
      const rimStr = `rgb(${midForest.canopyRim.join(',')})`;

      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        drawWrappedHorizontal(ctx, t.x, LOGICAL_WIDTH, 320, (drawX) => {
          if (t.isConifer) {
            this._drawGiantRedwoodConifer(
              ctx,
              drawX,
              t.baseY,
              t.trunkWidth * 4.2,
              t.height,
              midForest.trunkDark,
              midForest.trunkMid,
              darkStr,
              midStr,
              sunStr,
              rand
            );
          } else {
            this._drawAncientJungleTree(ctx, {
              x: drawX,
              baseY: t.baseY,
              height: t.height,
              trunkWidth: t.trunkWidth,
              crownRadius: 85 + rand() * 55,
              barkShadow: midForest.trunkDark,
              barkCore: midForest.trunkMid,
              barkSunlit: midForest.trunkLight,
              mossColor: 'rgb(52, 98, 42)',
              leafOcc: occStr,
              leafDark: darkStr,
              leafMid: midStr,
              leafBright: sunStr,
              leafRim: rimStr,
              vineCount: 2 + Math.floor(rand() * 3),
              rand
            });
          }
        });
      }

      // Weaving jungle mist band at the base of the mid-back trees
      const mistGrad = ctx.createLinearGradient(0, 740, 0, 980);
      mistGrad.addColorStop(0.0, 'rgba(178, 222, 198, 0)');
      mistGrad.addColorStop(0.55, midForest.mistColor);
      mistGrad.addColorStop(1.0, 'rgba(145, 195, 168, 0.12)');
      ctx.fillStyle = mistGrad;
      ctx.fillRect(0, 740, LOGICAL_WIDTH, 240);

      return buffer;
    }

    // =========================================================================
    // Layer 6: Cathedral Crepuscular Sunbeams (God-Rays) Piercing Canopy
    // =========================================================================
    _bakeCathedralSunbeamsLayer() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(50507);

      // Dramatic diagonal shafts of warm sunlight slanting through canopy gaps
      const rayCount = 16;
      for (let i = 0; i < rayCount; i++) {
        const topX = rand() * LOGICAL_WIDTH;
        const widthTop = 45 + rand() * 95;
        const widthBottom = widthTop * (1.6 + rand() * 0.7);
        const slant = -280 - rand() * 140;
        const alpha = 0.05 + rand() * 0.065;

        drawWrappedHorizontal(ctx, topX, LOGICAL_WIDTH, 520, (drawX) => {
          const grad = ctx.createLinearGradient(drawX, 60, drawX + slant, 990);
          grad.addColorStop(0.0, 'rgba(255, 252, 220, 0)');
          grad.addColorStop(0.18, `rgba(255, 248, 204, ${alpha})`);
          grad.addColorStop(0.65, `rgba(235, 245, 180, ${alpha * 0.75})`);
          grad.addColorStop(1.0, 'rgba(210, 235, 165, 0)');

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(drawX, 60);
          ctx.lineTo(drawX + widthTop, 60);
          ctx.lineTo(drawX + slant + widthBottom, 990);
          ctx.lineTo(drawX + slant, 990);
          ctx.closePath();
          ctx.fill();
        });
      }

      return buffer;
    }

    // =========================================================================
    // Layer 7: Mid-Near GIANT Ancient Jungle Trees (620px - 880px Tall!)
    // =========================================================================
    _bakeGiantAncientTreesLayer() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(60611);
      const { giantTrees } = this.theme;

      // Rich undulating jungle hill bank supporting the giant trees
      const bankGrad = ctx.createLinearGradient(0, 865, 0, 1045);
      bankGrad.addColorStop(0.0, '#183d1b');
      bankGrad.addColorStop(0.5, '#0e2611');
      bankGrad.addColorStop(1.0, '#071409');

      ctx.fillStyle = bankGrad;
      ctx.beginPath();
      ctx.moveTo(0, 1050);
      for (let x = 0; x <= LOGICAL_WIDTH; x += 4) {
        const u = (x % LOGICAL_WIDTH) / LOGICAL_WIDTH;
        const y = 895 + this.noise.fbm(u, 0.75, 4, 3, 0.5, 709.2) * 34;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(LOGICAL_WIDTH, 1050);
      ctx.closePath();
      ctx.fill();

      // Generate 22 Massive Hero-Scale Ancient Trees across the 1920px span
      const giantList = [];
      const treeCount = 22;
      for (let i = 0; i < treeCount; i++) {
        const x = (i / treeCount) * LOGICAL_WIDTH + (rand() - 0.5) * 42;
        const wrappedX = ((x % LOGICAL_WIDTH) + LOGICAL_WIDTH) % LOGICAL_WIDTH;
        const baseY = 935 + rand() * 75;
        // Towering heights between 640px and 880px so crowns soar high into the top of the screen!
        const height = 640 + rand() * 240;
        const trunkWidth = 38 + rand() * 36;
        const crownRadius = 135 + rand() * 75;
        giantList.push({ x: wrappedX, baseY, height, trunkWidth, crownRadius });
      }

      giantList.sort((a, b) => a.baseY - b.baseY);

      for (let i = 0; i < giantList.length; i++) {
        const gt = giantList[i];
        // Use 460px wrap margin so huge spreading boughs and canopies wrap seamlessly
        drawWrappedHorizontal(ctx, gt.x, LOGICAL_WIDTH, 460, (drawX) => {
          this._drawAncientJungleTree(ctx, {
            x: drawX,
            baseY: gt.baseY,
            height: gt.height,
            trunkWidth: gt.trunkWidth,
            crownRadius: gt.crownRadius,
            barkShadow: giantTrees.barkShadow,
            barkCore: giantTrees.barkCore,
            barkWarm: giantTrees.barkWarm,
            barkSunlit: giantTrees.barkSunlit,
            mossColor: giantTrees.mossSunlit,
            leafOcc: giantTrees.leafDeepShadow,
            leafDark: giantTrees.leafShadow,
            leafMid: giantTrees.leafMid,
            leafBright: giantTrees.leafBright,
            leafRim: giantTrees.leafSubsurface,
            vineCount: 5 + Math.floor(rand() * 5),
            detailedBark: true,
            rand
          });
        });
      }

      // Dense understory bushes & young saplings between the massive trunks
      for (let x = 0; x < LOGICAL_WIDTH; x += 28) {
        const by = 895 + rand() * 65;
        const r = 34 + rand() * 32;
        drawWrappedHorizontal(ctx, x + (rand() - 0.5) * 18, LOGICAL_WIDTH, 120, (drawX) => {
          this._drawLayeredLeafCanopy(
            ctx,
            drawX,
            by,
            r,
            giantTrees.leafDeepShadow,
            giantTrees.leafShadow,
            giantTrees.leafMid,
            giantTrees.leafBright,
            rand,
            giantTrees.leafSubsurface
          );
        });
      }

      return buffer;
    }

    // =========================================================================
    // Layer 8: Top Canopy Overhang & Near Jungle Ferns / Sub-Canopy
    // =========================================================================
    _bakeNearJungleCanopyLayer() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(70719);
      const { giantTrees, foreground } = this.theme;

      // 1. Top Canopy Roof Overhang (hanging branches, vines & sunlit leaves at top of screen)
      for (let x = 0; x < LOGICAL_WIDTH; x += 38) {
        const dropY = -15 + rand() * 95;
        const radius = 58 + rand() * 56;
        const vineLen = 85 + rand() * 165;

        drawWrappedHorizontal(ctx, x, LOGICAL_WIDTH, 220, (drawX) => {
          // Hanging jungle vine / liana from the upper canopy
          if (rand() > 0.35) {
            this._drawHangingVine(
              ctx,
              drawX + (rand() - 0.5) * 30,
              Math.max(0, dropY),
              vineLen,
              giantTrees.vineDark,
              giantTrees.vineLight,
              giantTrees.leafSubsurface,
              rand
            );
          }

          this._drawLayeredLeafCanopy(
            ctx,
            drawX,
            dropY,
            radius,
            giantTrees.leafDeepShadow,
            giantTrees.leafShadow,
            giantTrees.leafMid,
            giantTrees.leafBright,
            rand,
            giantTrees.leafSubsurface
          );
        });
      }

      // 2. Near-ground giant arching jungle ferns & tropical broadleaves (y = 890 - 1020)
      for (let x = 0; x < LOGICAL_WIDTH; x += 26) {
        const fy = 955 + rand() * 45;
        const fernScale = 0.85 + rand() * 0.65;
        drawWrappedHorizontal(ctx, x + (rand() - 0.5) * 16, LOGICAL_WIDTH, 140, (drawX) => {
          this._drawBotanicalFernRosette(
            ctx,
            drawX,
            fy,
            fernScale,
            foreground.fernDark,
            foreground.fernMid,
            foreground.fernSunlit,
            rand
          );
        });
      }

      return buffer;
    }

    // =========================================================================
    // Layer 9: Hyper-Detailed Foreground Jungle Floor (Moss, Ferns, Grass, Orchids)
    // =========================================================================
    _bakeForegroundJungleFloorLayer() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(80831);
      const noise = this.noise;
      const { foreground } = this.theme;

      const contourY = new Float32Array(LOGICAL_WIDTH + 1);
      for (let x = 0; x <= LOGICAL_WIDTH; x++) {
        const u = (x % LOGICAL_WIDTH) / LOGICAL_WIDTH;
        contourY[x] = 978 + noise.fbm(u, 0.92, 4, 4, 0.5, 819.3) * 22;
      }

      // Pass 1: Deep shadow grass & jungle shoots behind soil contour
      this._drawBotanicalGrassPass(ctx, rand, contourY, {
        count: 1800,
        minH: 32,
        maxH: 72,
        minW: 2.8,
        maxW: 5.2,
        yMin: -6,
        yMax: 22,
        baseColor: foreground.soilDark,
        tipColor: foreground.grassDark,
        highlightColor: null
      });

      // Rich organic jungle floor earth & moss fill
      const groundGrad = ctx.createLinearGradient(0, 955, 0, LOGICAL_HEIGHT);
      groundGrad.addColorStop(0.0, foreground.grassMid);
      groundGrad.addColorStop(0.4, foreground.earthMid);
      groundGrad.addColorStop(1.0, foreground.soilDark);

      ctx.fillStyle = groundGrad;
      ctx.beginPath();
      ctx.moveTo(0, LOGICAL_HEIGHT);
      for (let x = 0; x <= LOGICAL_WIDTH; x += 2) {
        ctx.lineTo(x, contourY[x]);
      }
      ctx.lineTo(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.closePath();
      ctx.fill();

      // Mossy forest boulders & fallen root logs along the floor
      for (let i = 0; i < 24; i++) {
        const rx = rand() * LOGICAL_WIDTH;
        const ry = contourY[Math.floor(rx)] + 10 + rand() * 38;
        const rw = 28 + rand() * 44;
        const rh = 14 + rand() * 20;

        drawWrappedHorizontal(ctx, rx, LOGICAL_WIDTH, 90, (drawX) => {
          const rockGrad = ctx.createRadialGradient(
            drawX + rw * 0.2,
            ry - rh * 0.3,
            3,
            drawX,
            ry,
            rw
          );
          rockGrad.addColorStop(0.0, '#629c3b'); // Mossy sunlit top
          rockGrad.addColorStop(0.45, '#2b4f26');
          rockGrad.addColorStop(1.0, '#101c12');

          ctx.fillStyle = rockGrad;
          ctx.beginPath();
          ctx.ellipse(drawX, ry, rw, rh, (rand() - 0.5) * 0.25, 0, TWO_PI);
          ctx.fill();
        });
      }

      // Pass 2: Dense mid-tone jungle grass
      this._drawBotanicalGrassPass(ctx, rand, contourY, {
        count: 2300,
        minH: 28,
        maxH: 74,
        minW: 2.4,
        maxW: 4.8,
        yMin: 0,
        yMax: 95,
        baseColor: foreground.grassDark,
        tipColor: foreground.grassBright,
        highlightColor: null
      });

      // Pass 3: Foreground compound fern fronds & broad elephant-ear leaves
      for (let i = 0; i < 55; i++) {
        const fx = rand() * LOGICAL_WIDTH;
        const fy = contourY[Math.floor(fx)] + 12 + rand() * 68;
        const scale = 0.7 + rand() * 0.65;

        drawWrappedHorizontal(ctx, fx, LOGICAL_WIDTH, 130, (drawX) => {
          this._drawBotanicalFernRosette(
            ctx,
            drawX,
            fy,
            scale,
            foreground.fernDark,
            foreground.fernMid,
            foreground.fernSunlit,
            rand
          );
        });
      }

      // Pass 4: Sun-drenched foreground grass blades with golden-green specular veins
      this._drawBotanicalGrassPass(ctx, rand, contourY, {
        count: 1500,
        minH: 34,
        maxH: 82,
        minW: 2.0,
        maxW: 4.0,
        yMin: 4,
        yMax: 102,
        baseColor: foreground.grassMid,
        tipColor: foreground.grassGoldTip,
        highlightColor: 'rgba(220, 250, 140, 0.48)'
      });

      // Pass 5: Forest wildflowers & jungle orchids
      for (let i = 0; i < 90; i++) {
        const wx = rand() * LOGICAL_WIDTH;
        const wy = contourY[Math.floor(wx)] - 4 + rand() * 78;
        const scale = 0.8 + rand() * 0.65;
        const type = rand();

        drawWrappedHorizontal(ctx, wx, LOGICAL_WIDTH, 35, (drawX) => {
          if (type > 0.35) {
            ctx.fillStyle = foreground.flowerPetal;
            for (let p = 0; p < 7; p++) {
              const a = (p / 7) * TWO_PI;
              ctx.beginPath();
              ctx.arc(
                drawX + Math.cos(a) * 3.2 * scale,
                wy + Math.sin(a) * 2.4 * scale,
                1.5 * scale,
                0,
                TWO_PI
              );
              ctx.fill();
            }
            ctx.fillStyle = foreground.flowerCenter;
            ctx.beginPath();
            ctx.arc(drawX, wy, 1.8 * scale, 0, TWO_PI);
            ctx.fill();
          } else {
            ctx.fillStyle = foreground.orchidPink;
            ctx.beginPath();
            ctx.arc(drawX, wy, 2.8 * scale, 0, TWO_PI);
            ctx.fill();
            ctx.fillStyle = '#fff0f7';
            ctx.beginPath();
            ctx.arc(drawX + 0.7 * scale, wy - 0.7 * scale, 1.2 * scale, 0, TWO_PI);
            ctx.fill();
          }
        });
      }

      return buffer;
    }

    // =========================================================================
    // Botanical Giant Tree, Bark, Vine, Fern & Leaf Cluster Micro-Renderers
    // =========================================================================

    /**
     * Renders a towering ancient broadleaf jungle tree with:
     * - Flared buttress roots
     * - 3D cylindrical normal-shaded trunk & gnarled primary limbs
     * - Longitudinal bark fissures and sunlit green moss strips
     * - Hanging catenary jungle vines (lianas)
     * - Multi-layered botanical leaf canopies with golden-green subsurface scattering
     */
    _drawAncientJungleTree(ctx, cfg) {
      const {
        x,
        baseY,
        height,
        trunkWidth,
        crownRadius,
        barkShadow,
        barkCore,
        barkWarm = '#3d2d20',
        barkSunlit,
        mossColor,
        leafOcc,
        leafDark,
        leafMid,
        leafBright,
        leafRim,
        vineCount = 4,
        detailedBark = false,
        rand
      } = cfg;

      const crownCenterY = baseY - height * 0.78;
      const crownCenterX = x + (rand() - 0.48) * 36;

      // 1. Draw deep back-layer canopy shadow mass behind the upper trunk & limbs
      this._drawLayeredLeafCanopy(
        ctx,
        crownCenterX - crownRadius * 0.18,
        crownCenterY + crownRadius * 0.12,
        crownRadius * 0.95,
        leafOcc,
        leafDark,
        leafMid,
        leafBright,
        rand
      );

      // 2. Draw primary gnarled trunk with flared buttress roots & 3D cylindrical gradient
      const halfW = trunkWidth * 0.5;
      const topHalfW = trunkWidth * 0.18;
      const rootSpread = trunkWidth * 1.45;

      const trunkGrad = ctx.createLinearGradient(x - halfW, baseY, x + halfW, baseY);
      trunkGrad.addColorStop(0.0, barkShadow);
      trunkGrad.addColorStop(0.38, barkCore);
      trunkGrad.addColorStop(0.68, barkWarm);
      trunkGrad.addColorStop(0.88, barkSunlit);
      trunkGrad.addColorStop(1.0, mossColor);

      ctx.fillStyle = trunkGrad;
      ctx.beginPath();
      ctx.moveTo(x - rootSpread, baseY + 12);
      ctx.quadraticCurveTo(
        x - halfW * 0.95,
        baseY - height * 0.25,
        crownCenterX - topHalfW,
        crownCenterY
      );
      ctx.lineTo(crownCenterX + topHalfW, crownCenterY);
      ctx.quadraticCurveTo(
        x + halfW * 0.95,
        baseY - height * 0.25,
        x + rootSpread * 0.9,
        baseY + 12
      );
      ctx.closePath();
      ctx.fill();

      // 3. Draw longitudinal bark crevices, root ridges & sunlit moss patches on giant trunks
      if (detailedBark) {
        ctx.save();
        ctx.strokeStyle = barkShadow;
        ctx.lineWidth = 1.6;
        const fissures = 7;
        for (let f = 0; f < fissures; f++) {
          const t = (f / (fissures - 1)) * 1.6 - 0.8;
          const startX = x + t * rootSpread * 0.75;
          const endX = crownCenterX + t * topHalfW * 0.9;
          ctx.beginPath();
          ctx.moveTo(startX, baseY + 8);
          ctx.quadraticCurveTo(
            x + t * halfW + (rand() - 0.5) * 8,
            baseY - height * 0.38,
            endX,
            crownCenterY + 10
          );
          ctx.stroke();
        }

        // Sunlit emerald moss clinging to the right (sun-facing) side of the trunk
        ctx.strokeStyle = mossColor;
        ctx.lineWidth = trunkWidth * 0.09;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + halfW * 0.65, baseY - height * 0.08);
        ctx.quadraticCurveTo(
          x + halfW * 0.48,
          baseY - height * 0.42,
          crownCenterX + topHalfW * 0.7,
          crownCenterY + 25
        );
        ctx.stroke();
        ctx.restore();
      }

      // 4. Draw 4 to 6 massive spreading primary limbs reaching outward into the canopy
      const branchSpecs = [
        { dir: -1, startFrac: 0.58, span: crownRadius * 1.15, rise: 0.16, thick: trunkWidth * 0.34 },
        { dir: 1, startFrac: 0.62, span: crownRadius * 1.22, rise: 0.18, thick: trunkWidth * 0.36 },
        { dir: -1, startFrac: 0.74, span: crownRadius * 0.92, rise: 0.22, thick: trunkWidth * 0.26 },
        { dir: 1, startFrac: 0.76, span: crownRadius * 0.98, rise: 0.24, thick: trunkWidth * 0.28 },
        { dir: 0.2, startFrac: 0.82, span: crownRadius * 0.45, rise: 0.28, thick: trunkWidth * 0.22 }
      ];

      const subCanopyCenters = [];

      for (let b = 0; b < branchSpecs.length; b++) {
        const br = branchSpecs[b];
        const byStart = baseY - height * br.startFrac;
        const bxStart = lerp(x, crownCenterX, br.startFrac);
        const bxEnd = bxStart + br.dir * br.span + (rand() - 0.5) * 24;
        const byEnd = byStart - height * br.rise + (rand() - 0.5) * 18;
        const ctrlX = (bxStart + bxEnd) * 0.5 + br.dir * 18;
        const ctrlY = byStart - height * br.rise * 0.32;

        // Shaded underside of limb
        ctx.strokeStyle = barkShadow;
        ctx.lineWidth = br.thick;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bxStart, byStart);
        ctx.quadraticCurveTo(ctrlX, ctrlY, bxEnd, byEnd);
        ctx.stroke();

        // Sunlit top bark & moss rim on upper side of limb
        ctx.strokeStyle = br.dir >= 0 ? mossColor : barkWarm;
        ctx.lineWidth = br.thick * 0.42;
        ctx.beginPath();
        ctx.moveTo(bxStart, byStart - br.thick * 0.22);
        ctx.quadraticCurveTo(ctrlX, ctrlY - br.thick * 0.22, bxEnd, byEnd - br.thick * 0.15);
        ctx.stroke();

        subCanopyCenters.push({
          x: bxEnd,
          y: byEnd,
          r: crownRadius * (0.52 + rand() * 0.22)
        });

        // Hang jungle liana vines from the heavy horizontal boughs
        if (b < vineCount) {
          const vx = lerp(bxStart, bxEnd, 0.45 + rand() * 0.45);
          const vy = lerp(byStart, byEnd, 0.45 + rand() * 0.45);
          const vLen = 75 + rand() * 145;
          this._drawHangingVine(
            ctx,
            vx,
            vy,
            vLen,
            '#102611',
            '#3c7322',
            leafRim,
            rand
          );
        }
      }

      // 5. Render dense multi-tiered leaf clusters over each limb and the central crown
      subCanopyCenters.push({
        x: crownCenterX,
        y: crownCenterY - crownRadius * 0.18,
        r: crownRadius * 0.78
      });

      for (let c = 0; c < subCanopyCenters.length; c++) {
        const sc = subCanopyCenters[c];
        this._drawLayeredLeafCanopy(
          ctx,
          sc.x,
          sc.y,
          sc.r,
          leafOcc,
          leafDark,
          leafMid,
          leafBright,
          rand,
          leafRim
        );
      }
    }

    /**
     * Renders a multi-layered botanical leaf dome made of individual serrated leaf sprays,
     * deep interior occlusion crevices, and backlit subsurface-scattered golden-green tips.
     */
    _drawLayeredLeafCanopy(
      ctx,
      cx,
      cy,
      radius,
      occColor,
      darkColor,
      midColor,
      brightColor,
      rand,
      rimColor = null
    ) {
      const lobes = 6;
      for (let l = 0; l < lobes; l++) {
        const lobeAngle = (l / lobes) * TWO_PI + rand() * 0.45;
        const lobeDist = radius * (0.22 + rand() * 0.34);
        const lx = cx + Math.cos(lobeAngle) * lobeDist * 1.22;
        const ly = cy + Math.sin(lobeAngle) * lobeDist * 0.72;
        const lobeR = radius * (0.44 + rand() * 0.22);

        // Pass 1: Deep canopy interior occlusion shadow
        ctx.fillStyle = occColor;
        for (let i = 0; i < 8; i++) {
          const a = rand() * TWO_PI;
          const d = rand() * lobeR * 0.82;
          const px = lx - lobeR * 0.14 + Math.cos(a) * d;
          const py = ly + lobeR * 0.18 + Math.sin(a) * d * 0.78;
          ctx.beginPath();
          ctx.ellipse(
            px,
            py,
            lobeR * (0.28 + rand() * 0.16),
            lobeR * (0.20 + rand() * 0.14),
            (rand() - 0.5) * 0.8,
            0,
            TWO_PI
          );
          ctx.fill();
        }

        // Pass 2: Shaded under-leaf clusters
        ctx.fillStyle = darkColor;
        for (let i = 0; i < 10; i++) {
          const a = rand() * TWO_PI;
          const d = rand() * lobeR * 0.85;
          const px = lx + Math.cos(a) * d;
          const py = ly + Math.sin(a) * d * 0.75;
          ctx.beginPath();
          ctx.ellipse(
            px,
            py,
            lobeR * (0.24 + rand() * 0.15),
            lobeR * (0.16 + rand() * 0.12),
            (rand() - 0.5) * 1.1,
            0,
            TWO_PI
          );
          ctx.fill();
        }

        // Pass 3: Rich mid-tone chlorophyll leaf sprays
        ctx.fillStyle = midColor;
        for (let i = 0; i < 12; i++) {
          const a = rand() * TWO_PI;
          const d = rand() * lobeR * 0.80;
          const px = lx + lobeR * 0.08 + Math.cos(a) * d;
          const py = ly - lobeR * 0.06 + Math.sin(a) * d * 0.72;
          ctx.beginPath();
          ctx.ellipse(
            px,
            py,
            lobeR * (0.20 + rand() * 0.14),
            lobeR * (0.12 + rand() * 0.10),
            (rand() - 0.5) * 1.4,
            0,
            TWO_PI
          );
          ctx.fill();
        }

        // Pass 4: Sunlit upper-right leaf clusters
        ctx.fillStyle = brightColor;
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI * 0.7 + rand() * Math.PI * 1.05;
          const d = rand() * lobeR * 0.75;
          const px = lx + lobeR * 0.18 + Math.cos(a) * d;
          const py = ly - lobeR * 0.18 + Math.sin(a) * d * 0.72;
          ctx.beginPath();
          ctx.ellipse(
            px,
            py,
            lobeR * (0.15 + rand() * 0.12),
            lobeR * (0.09 + rand() * 0.08),
            (rand() - 0.5) * 1.5,
            0,
            TWO_PI
          );
          ctx.fill();
        }

        // Pass 5: Translucent golden-green subsurface-scattered rim leaves facing the sun
        if (rimColor) {
          ctx.fillStyle = rimColor;
          for (let i = 0; i < 6; i++) {
            const a = -Math.PI * 0.55 + rand() * Math.PI * 0.75;
            const d = lobeR * (0.45 + rand() * 0.42);
            const px = lx + lobeR * 0.24 + Math.cos(a) * d;
            const py = ly - lobeR * 0.24 + Math.sin(a) * d * 0.68;
            ctx.beginPath();
            ctx.ellipse(
              px,
              py,
              lobeR * (0.11 + rand() * 0.08),
              lobeR * (0.06 + rand() * 0.05),
              a + 0.4,
              0,
              TWO_PI
            );
            ctx.fill();
          }
        }
      }
    }

    /**
     * Renders a towering redwood/spruce conifer with dozens of individual horizontal bough whorls.
     */
    _drawGiantRedwoodConifer(
      ctx,
      x,
      baseY,
      width,
      height,
      barkDark,
      barkMid,
      leafDark,
      leafMid,
      leafSun,
      rand
    ) {
      // Tall tapering trunk
      const trunkW = width * 0.16;
      const trunkGrad = ctx.createLinearGradient(x - trunkW, baseY, x + trunkW, baseY);
      trunkGrad.addColorStop(0, barkDark);
      trunkGrad.addColorStop(0.7, barkMid);
      trunkGrad.addColorStop(1, '#594734');

      ctx.fillStyle = trunkGrad;
      ctx.beginPath();
      ctx.moveTo(x - trunkW * 0.9, baseY);
      ctx.lineTo(x - 2, baseY - height * 0.95);
      ctx.lineTo(x + 2, baseY - height * 0.95);
      ctx.lineTo(x + trunkW * 0.9, baseY);
      ctx.closePath();
      ctx.fill();

      const tiers = 22;
      for (let t = 0; t < tiers; t++) {
        const p = t / (tiers - 1);
        const ty = baseY - height * (0.18 + p * 0.78);
        const span = width * (1.0 - p * 0.82) * (0.85 + rand() * 0.28);
        const droop = 8 + (1.0 - p) * 14;

        // Left shaded boughs
        ctx.fillStyle = leafDark;
        for (let b = 0; b < 5; b++) {
          const frac = b / 4;
          const bx = x - span * 0.52 * frac;
          const by = ty + droop * frac + (rand() - 0.5) * 4;
          const r = (5 + (1.0 - p) * 8) * (1.1 - frac * 0.35);
          ctx.beginPath();
          ctx.ellipse(bx, by, r * 1.35, r * 0.75, -0.25, 0, TWO_PI);
          ctx.fill();
        }

        // Center mid-tone boughs
        ctx.fillStyle = leafMid;
        ctx.beginPath();
        ctx.ellipse(
          x + (rand() - 0.5) * 4,
          ty,
          (7 + (1.0 - p) * 10) * 1.2,
          6 + (1.0 - p) * 7,
          0,
          0,
          TWO_PI
        );
        ctx.fill();

        // Right sunlit boughs
        ctx.fillStyle = leafSun;
        for (let b = 0; b < 5; b++) {
          const frac = b / 4;
          const bx = x + span * 0.52 * frac;
          const by = ty + droop * 0.85 * frac + (rand() - 0.5) * 4;
          const r = (4.5 + (1.0 - p) * 7.5) * (1.1 - frac * 0.35);
          ctx.beginPath();
          ctx.ellipse(bx, by, r * 1.35, r * 0.75, 0.25, 0, TWO_PI);
          ctx.fill();
        }
      }
    }

    /**
     * Renders a hanging jungle liana vine with small sunlit epiphyte leaves along its stem.
     */
    _drawHangingVine(ctx, x, startY, length, darkColor, lightColor, rimColor, rand) {
      const sway = (rand() - 0.45) * 28;
      const endX = x + sway;
      const endY = startY + length;
      const ctrlX = x + sway * 0.65;
      const ctrlY = startY + length * 0.55;

      ctx.strokeStyle = darkColor;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
      ctx.stroke();

      // Small vine leaves along the hanging stem
      const leafSteps = Math.floor(length / 16);
      for (let i = 1; i < leafSteps; i++) {
        const t = i / leafSteps;
        const invT = 1 - t;
        const lx = invT * invT * x + 2 * invT * t * ctrlX + t * t * endX;
        const ly = invT * invT * startY + 2 * invT * t * ctrlY + t * t * endY;
        const side = i % 2 === 0 ? 1 : -1;

        ctx.fillStyle = side > 0 ? rimColor : lightColor;
        ctx.beginPath();
        ctx.ellipse(lx + side * 4.5, ly, 4.8, 2.2, side * 0.45, 0, TWO_PI);
        ctx.fill();
      }
    }

    /**
     * Renders a detailed jungle fern rosette with arching compound fronds and individual pinnae.
     */
    _drawBotanicalFernRosette(ctx, x, baseY, scale, darkColor, midColor, sunColor, rand) {
      const frondCount = 7;
      for (let f = 0; f < frondCount; f++) {
        const norm = f / (frondCount - 1) - 0.5; // -0.5 to 0.5
        const spreadX = norm * 95 * scale + (rand() - 0.5) * 10;
        const archHeight = (42 + (1.0 - Math.abs(norm)) * 34) * scale;
        const tipX = x + spreadX;
        const tipY = baseY - archHeight * 0.35;
        const ctrlX = x + spreadX * 0.52;
        const ctrlY = baseY - archHeight;

        const isSunlit = norm > 0.05;
        ctx.strokeStyle = isSunlit ? midColor : darkColor;
        ctx.lineWidth = 1.6 * scale;
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
        ctx.stroke();

        // Pinnae (leaflets) along each fern frond
        const pinnae = 10;
        ctx.fillStyle = isSunlit ? sunColor : midColor;
        for (let p = 1; p < pinnae; p++) {
          const t = p / pinnae;
          const invT = 1 - t;
          const px = invT * invT * x + 2 * invT * t * ctrlX + t * t * tipX;
          const py = invT * invT * baseY + 2 * invT * t * ctrlY + t * t * tipY;
          const pSize = (1.0 - t * 0.65) * 6.5 * scale;

          ctx.beginPath();
          ctx.ellipse(px, py - pSize * 0.5, pSize, pSize * 0.38, norm * 0.8, 0, TWO_PI);
          ctx.fill();
        }
      }
    }

    /**
     * Renders a batch of curved botanical grass blades with optional central veins.
     */
    _drawBotanicalGrassPass(ctx, rand, contourY, opts) {
      const {
        count,
        minH,
        maxH,
        minW,
        maxW,
        yMin,
        yMax,
        baseColor,
        tipColor,
        highlightColor
      } = opts;

      const grad = ctx.createLinearGradient(0, LOGICAL_HEIGHT - 175, 0, LOGICAL_HEIGHT);
      grad.addColorStop(0, tipColor);
      grad.addColorStop(1, baseColor);

      for (let i = 0; i < count; i++) {
        const gx = rand() * LOGICAL_WIDTH;
        const groundY = contourY[Math.floor(gx)];
        const gy = groundY + yMin + rand() * (yMax - yMin);
        const h = minH + rand() * (maxH - minH);
        const halfW = (minW + rand() * (maxW - minW)) * 0.5;
        const bend = (rand() - 0.34) * 28;

        drawWrappedHorizontal(ctx, gx, LOGICAL_WIDTH, 48, (drawX) => {
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(drawX - halfW, gy);
          ctx.quadraticCurveTo(drawX + bend * 0.42, gy - h * 0.54, drawX + bend, gy - h);
          ctx.quadraticCurveTo(
            drawX + halfW + bend * 0.36,
            gy - h * 0.5,
            drawX + halfW,
            gy
          );
          ctx.closePath();
          ctx.fill();

          if (highlightColor && rand() > 0.55) {
            ctx.strokeStyle = highlightColor;
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(drawX, gy - h * 0.15);
            ctx.quadraticCurveTo(
              drawX + bend * 0.4,
              gy - h * 0.52,
              drawX + bend,
              gy - h
            );
            ctx.stroke();
          }
        });
      }
    }

    // =========================================================================
    // Responsive Display, Animation Loop & Integration API
    // =========================================================================

    resize() {
      if (!this.canvas) return;

      const rect = this.canvas.getBoundingClientRect();
      const displayWidth = Math.max(1, Math.round(rect.width));
      const displayHeight = Math.max(1, Math.round(rect.height));

      const rawDpr = window.devicePixelRatio || 1;
      const isMobileViewport = Math.max(window.innerWidth, window.innerHeight) <= 960;
      const effectiveDpr = Math.min(rawDpr, isMobileViewport ? 1.5 : 2.0);

      const targetWidth = Math.min(
        LOGICAL_WIDTH,
        Math.round(displayWidth * effectiveDpr)
      );
      const targetHeight = Math.min(
        LOGICAL_HEIGHT,
        Math.round(displayHeight * effectiveDpr)
      );

      if (
        this.canvas.width !== targetWidth ||
        this.canvas.height !== targetHeight
      ) {
        this.canvas.width = targetWidth;
        this.canvas.height = targetHeight;
      }

      this.renderScaleX = this.canvas.width / LOGICAL_WIDTH;
      this.renderScaleY = this.canvas.height / LOGICAL_HEIGHT;
      this.renderFrame();
    }

    update(dt) {
      this.elapsedTime += dt;
      const effectiveSpeed = this.baseScrollSpeed * this.speedMultiplier;

      if (effectiveSpeed !== 0) {
        for (let i = 0; i < this.layers.length; i++) {
          const layer = this.layers[i];
          layer.offset =
            (layer.offset + effectiveSpeed * layer.parallaxFactor * dt) %
            LOGICAL_WIDTH;
          if (layer.offset < 0) {
            layer.offset += LOGICAL_WIDTH;
          }
        }
      }

      // Update floating sunlit jungle pollen/spore motes
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i];
        m.x -= (effectiveSpeed * m.speedFactor + 14) * dt;
        if (m.x < 0) m.x += LOGICAL_WIDTH;
      }
    }

    renderFrame() {
      const ctx = this.ctx;
      if (!ctx || !this.staticSkyBuffer) return;

      ctx.save();
      ctx.scale(this.renderScaleX, this.renderScaleY);

      // 1. Draw static sky & solar bloom
      ctx.drawImage(this.staticSkyBuffer, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      // 2. Draw scrolling parallax layers from back to front
      for (let i = 0; i < this.layers.length; i++) {
        const layer = this.layers[i];
        if (!layer.buffer) continue;

        const x = -layer.offset;
        ctx.drawImage(layer.buffer, x, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        if (x < 0) {
          ctx.drawImage(
            layer.buffer,
            x + LOGICAL_WIDTH,
            0,
            LOGICAL_WIDTH,
            LOGICAL_HEIGHT
          );
        }

        // Render sunlit floating forest pollen right after the cathedral sunbeams layer
        if (layer.id === 'cathedralSunbeams') {
          this._renderJungleMotes(ctx);
        }
      }

      ctx.restore();
    }

    _renderJungleMotes(ctx) {
      ctx.fillStyle = 'rgba(245, 255, 190, 0.55)';
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i];
        const py = m.y + Math.sin(this.elapsedTime * 1.4 + m.driftPhase) * m.driftAmp;
        ctx.beginPath();
        ctx.arc(m.x, py, m.radius, 0, TWO_PI);
        ctx.fill();
      }
    }

    _animate(timestamp) {
      if (!this.isRunning) return;

      if (!this.lastTimestamp) {
        this.lastTimestamp = timestamp;
      }

      const dt = Math.min(0.05, Math.max(0, (timestamp - this.lastTimestamp) / 1000));
      this.lastTimestamp = timestamp;

      this.update(dt);
      this.renderFrame();

      this.rafId = window.requestAnimationFrame(this._boundAnimate);
    }

    _onVisibilityChange() {
      if (document.hidden) {
        if (this.rafId !== null) {
          window.cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }
      } else if (this.isRunning) {
        this.lastTimestamp = 0;
        if (this.rafId === null) {
          this.rafId = window.requestAnimationFrame(this._boundAnimate);
        }
      }
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      this.lastTimestamp = 0;
      if (!document.hidden && this.rafId === null) {
        this.rafId = window.requestAnimationFrame(this._boundAnimate);
      }
    }

    stop() {
      this.isRunning = false;
      if (this.rafId !== null) {
        window.cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }

    setSpeed(speed) {
      const numericSpeed = Number(speed);
      if (!Number.isFinite(numericSpeed)) return;
      this.speedMultiplier = Math.max(0, numericSpeed);
    }

    getSpeed() {
      return this.speedMultiplier;
    }

    reset() {
      for (let i = 0; i < this.layers.length; i++) {
        this.layers[i].offset = 0;
      }
      this.lastTimestamp = 0;
      this.renderFrame();
    }

    setTheme(customTheme) {
      if (!customTheme || typeof customTheme !== 'object') return;
      const mergeDeep = (target, source) => {
        for (const key of Object.keys(source)) {
          if (
            source[key] &&
            typeof source[key] === 'object' &&
            !Array.isArray(source[key]) &&
            target[key]
          ) {
            mergeDeep(target[key], source[key]);
          } else {
            target[key] = source[key];
          }
        }
      };
      mergeDeep(this.theme, customTheme);
      this.bakeAllLayers();
      this.renderFrame();
    }
  }

  function initBackgroundEngine() {
    const canvas = document.getElementById('nature-background-canvas');
    if (!canvas) return;

    const instance = new NatureParallaxBackground(canvas);

    global.FlappyBackground = {
      instance,
      setSpeed: (speed) => instance.setSpeed(speed),
      getSpeed: () => instance.getSpeed(),
      start: () => instance.start(),
      stop: () => instance.stop(),
      resize: () => instance.resize(),
      reset: () => instance.reset(),
      setTheme: (theme) => instance.setTheme(theme)
    };

    global.setBackgroundSpeed = (speed) => instance.setSpeed(speed);
    global.startBackground = () => instance.start();
    global.stopBackground = () => instance.stop();
    global.resizeBackground = () => instance.resize();
    global.resetBackground = () => instance.reset();
    global.setBackgroundTheme = (theme) => instance.setTheme(theme);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBackgroundEngine);
  } else {
    initBackgroundEngine();
  }
})(window);
