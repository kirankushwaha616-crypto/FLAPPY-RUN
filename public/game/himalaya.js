/**
 * Flappy Face - Photorealistic Procedural Nature Parallax Engine
 * Uses per-pixel volumetric cloud ray-marching, 3D normal-mapped ridged multifractal
 * alpine terrain, Rayleigh atmospheric scattering, and botanical foliage synthesis.
 * Pure HTML5 Canvas, 16:9 (1920x1080 logical space), zero external image dependencies.
 */
(function (global) {
  'use strict';

  const LOGICAL_WIDTH = 1920;
  const LOGICAL_HEIGHT = 1080;
  const TWO_PI = Math.PI * 2;

  // Photorealistic natural color palette & atmospheric parameters (customizable via setBackgroundTheme)
  const DEFAULT_THEME = {
    sky: {
      zenith: [26, 68, 128],
      upperMid: [56, 114, 178],
      lowerMid: [112, 168, 218],
      horizon: [212, 234, 246],
      sunGlow: [255, 246, 214]
    },
    sun: {
      x: 1480,
      y: 220,
      dirX: 0.56,
      dirY: -0.46,
      dirZ: 0.69,
      lightColor: [255, 247, 224],
      ambientSkyColor: [125, 168, 215]
    },
    clouds: {
      sunlitTop: [255, 253, 248],
      silverLining: [255, 250, 235],
      ambientMid: [208, 222, 238],
      deepBaseShadow: [118, 142, 172],
      warmBounce: [232, 220, 210]
    },
    farMountains: {
      rockDark: [48, 64, 88],
      rockLight: [104, 122, 145],
      snowSunlit: [252, 253, 255],
      snowShade: [162, 188, 220],
      hazeColor: [196, 224, 242],
      hazeStrength: 0.68
    },
    nearMountains: {
      rockDark: [42, 56, 68],
      rockLight: [96, 112, 118],
      pineDark: [26, 52, 48],
      pineLight: [64, 104, 78],
      hazeColor: [178, 212, 226],
      hazeStrength: 0.42
    },
    midHills: {
      canopyDark: [22, 50, 34],
      canopyMid: [46, 88, 48],
      canopySunlit: [112, 162, 74],
      mistColor: [188, 218, 216]
    },
    nearHills: {
      canopyDark: [18, 44, 24],
      canopyMid: [42, 86, 36],
      canopySunlit: [122, 178, 66],
      subsurfaceGold: [176, 216, 84]
    },
    foreground: {
      soilDark: '#0f2411',
      meadowDark: '#1b421a',
      meadowMid: '#316e24',
      meadowLight: '#5ca135',
      meadowSunlit: '#9ad44b',
      seedGold: '#e8cf74',
      daisyPetal: '#fffdf7',
      daisyCenter: '#f5b82e',
      buttercup: '#ffda38'
    }
  };

  // ===========================================================================
  // Math & Color Utilities
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

  function drawWrappedHorizontal(ctx, x, width, margin, drawCallback) {
    drawCallback(x);
    if (x < margin) drawCallback(x + width);
    if (x > width - margin) drawCallback(x - width);
  }

  // ===========================================================================
  // Seamless Horizontally-Periodic 2D Gradient Noise & Multifractal Generator
  // ===========================================================================

  class PeriodicNoise2D {
    constructor(seed = 1337) {
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

    /**
     * Evaluates 2D gradient noise that is strictly periodic over u in [0, 1)
     * with integer horizontal period `periodX`.
     */
    sample(u, v, periodX, offsetY = 0) {
      const px = u * periodX;
      const py = v * periodX + offsetY;

      const x0 = Math.floor(px);
      const y0 = Math.floor(py);

      const fx = px - x0;
      const fy = py - y0;

      // Exact modulo wrap guarantees C2 continuity across x = 0 and x = LOGICAL_WIDTH
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

      // Quintic Hermite interpolation
      const uu = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
      const vv = fy * fy * fy * (fy * (fy * 6 - 15) + 10);

      const nx0 = n00 + uu * (n10 - n00);
      const nx1 = n01 + uu * (n11 - n01);

      return (nx0 + vv * (nx1 - nx0)) * 1.4142;
    }

    /**
     * Multi-octave Fractional Brownian Motion (fBM), periodic over u in [0, 1).
     */
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

    /**
     * Multi-octave Ridged Multifractal noise for sharp alpine mountain ridges and crags.
     */
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

    /**
     * Billow noise (rounded puffy cellular structures) for cumulus clouds and tree canopies.
     */
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
  // Main Photorealistic Nature Parallax Background Class
  // ===========================================================================

  class NatureParallaxBackground {
    constructor(canvasElement) {
      this.canvas = canvasElement;
      this.ctx = this.canvas.getContext('2d', { alpha: false });

      this.theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
      this.noise = new PeriodicNoise2D(948271);

      // Base foreground speed in logical pixels per second
      this.baseScrollSpeed = 240;
      this.speedMultiplier = 1.0;

      this.isRunning = false;
      this.rafId = null;
      this.lastTimestamp = 0;
      this.renderScaleX = 1;
      this.renderScaleY = 1;

      // 8 Independent Parallax Layers ordered back-to-front
      this.layers = [
        { id: 'cirrusClouds', parallaxFactor: 0.03, offset: 0, buffer: null },
        { id: 'farCumulus', parallaxFactor: 0.07, offset: 0, buffer: null },
        { id: 'nearCumulus', parallaxFactor: 0.13, offset: 0, buffer: null },
        { id: 'farMountains', parallaxFactor: 0.20, offset: 0, buffer: null },
        { id: 'nearMountains', parallaxFactor: 0.33, offset: 0, buffer: null },
        { id: 'midHills', parallaxFactor: 0.50, offset: 0, buffer: null },
        { id: 'sunbeamsAndShadows', parallaxFactor: 0.58, offset: 0, buffer: null },
        { id: 'nearHills', parallaxFactor: 0.74, offset: 0, buffer: null },
        { id: 'foregroundGrass', parallaxFactor: 1.00, offset: 0, buffer: null }
      ];

      this.staticSkyBuffer = null;

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

    /**
     * Synthesizes all procedural layers into offscreen buffers.
     */
    bakeAllLayers() {
      this.staticSkyBuffer = this._bakeAtmosphericSky();

      const builders = {
        cirrusClouds: () => this._bakeCirrusLayer(),
        farCumulus: () =>
          this._bakeVolumetricCumulusLayer({
            seedOffset: 12.4,
            basePeriod: 4,
            minY: 95,
            maxY: 430,
            coverage: 0.44,
            opacity: 0.82
          }),
        nearCumulus: () =>
          this._bakeVolumetricCumulusLayer({
            seedOffset: 68.9,
            basePeriod: 3,
            minY: 55,
            maxY: 465,
            coverage: 0.47,
            opacity: 0.96
          }),
        farMountains: () => this._bakeAlpineMountainLayer(),
        nearMountains: () => this._bakeSubAlpineCragsLayer(),
        midHills: () => this._bakeMidForestHillsLayer(),
        sunbeamsAndShadows: () => this._bakeSunbeamsAndCloudShadows(),
        nearHills: () => this._bakeNearWoodlandLayer(),
        foregroundGrass: () => this._bakeForegroundMeadowLayer()
      };

      for (let i = 0; i < this.layers.length; i++) {
        const layer = this.layers[i];
        if (builders[layer.id]) {
          layer.buffer = builders[layer.id]();
        }
      }
    }

    // =========================================================================
    // Layer 0: Physical Rayleigh/Mie Sky Dome & Solar Corona
    // =========================================================================
    _bakeAtmosphericSky() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const imgData = ctx.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const data = imgData.data;

      const { sky, sun } = this.theme;

      // Precompute vertical Rayleigh gradient table
      const rLut = new Float32Array(LOGICAL_HEIGHT);
      const gLut = new Float32Array(LOGICAL_HEIGHT);
      const bLut = new Float32Array(LOGICAL_HEIGHT);

      for (let y = 0; y < LOGICAL_HEIGHT; y++) {
        const t = clamp(y / (LOGICAL_HEIGHT * 0.82), 0, 1);
        let c0, c1, localT;
        if (t < 0.35) {
          c0 = sky.zenith;
          c1 = sky.upperMid;
          localT = t / 0.35;
        } else if (t < 0.72) {
          c0 = sky.upperMid;
          c1 = sky.lowerMid;
          localT = (t - 0.35) / 0.37;
        } else {
          c0 = sky.lowerMid;
          c1 = sky.horizon;
          localT = (t - 0.72) / 0.28;
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

          // Physical Mie forward-scattering solar aureole + warm horizon bloom
          const mie = Math.exp(-dist * 0.0024) * 0.65 + Math.exp(-dist * 0.009) * 0.45;
          const core = smoothstep(78, 18, dist);

          let r = lerp(baseR, glowR, clamp(mie, 0, 1)) + core * 45;
          let g = lerp(baseG, glowG, clamp(mie, 0, 1)) + core * 42;
          let b = lerp(baseB, glowB, clamp(mie * 0.85, 0, 1)) + core * 35;

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
    // Layer 1: High-Altitude Domain-Warped Wispy Cirrus Clouds
    // =========================================================================
    _bakeCirrusLayer() {
      const w = 960;
      const h = 220;
      const smallBuf = createOffscreenBuffer(w, h);
      const smallCtx = smallBuf.getContext('2d');
      const imgData = smallCtx.createImageData(w, h);
      const data = imgData.data;

      const noise = this.noise;
      let idx = 0;

      for (let y = 0; y < h; y++) {
        const v = (y / h) * 0.18;
        const vertFade = Math.sin((y / h) * Math.PI);

        for (let x = 0; x < w; x++) {
          const u = x / w;

          // Anisotropic domain warp for wind-sheared ice crystal streaks
          const warpX = noise.fbm(u, v * 1.8, 4, 3, 0.5, 5.2) * 0.06;
          const warpY = noise.fbm(u, v * 1.8, 4, 3, 0.5, 19.8) * 0.03;

          const streak = noise.ridged(u + warpX, v * 2.4 + warpY, 6, 4, 0.55, 41.3);
          const mask = noise.fbm(u, v, 3, 3, 0.5, 88.1);

          const density = smoothstep(0.56, 0.88, streak * (0.55 + mask * 0.65)) * vertFade;

          if (density > 0.005) {
            data[idx++] = 255;
            data[idx++] = 253;
            data[idx++] = 250;
            data[idx++] = clamp(density * 145, 0, 255);
          } else {
            idx += 4;
          }
        }
      }

      smallCtx.putImageData(imgData, 0, 0);

      const fullBuffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = fullBuffer.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(smallBuf, 0, 15, LOGICAL_WIDTH, 410);
      return fullBuffer;
    }

    // =========================================================================
    // Layer 2 & 3: Volumetric Ray-Marched Cumulus Clouds (Beer-Lambert Scattering)
    // =========================================================================
    _bakeVolumetricCumulusLayer(config) {
      const { seedOffset, basePeriod, minY, maxY, coverage, opacity } = config;
      const bandHeight = maxY - minY;

      // Render volumetric shader at half-res (960px wide) then upscale with bicubic smoothing
      const w = 960;
      const h = Math.round(bandHeight * 0.5);
      const smallBuf = createOffscreenBuffer(w, h);
      const smallCtx = smallBuf.getContext('2d');
      const imgData = smallCtx.createImageData(w, h);
      const data = imgData.data;

      const noise = this.noise;
      const { clouds, sun } = this.theme;

      // Precompute cloud density field so ray-marching toward the sun is fast
      const densityField = new Float32Array(w * h);

      for (let y = 0; y < h; y++) {
        const ny = y / h; // 0 = top of cloud band, 1 = flat condensation base
        const v = ny * 0.26;

        // Cumulus vertical profile: rounded dome top, flat condensation base at bottom
        const topProfile = smoothstep(0.0, 0.38, ny);
        const baseProfile = smoothstep(1.0, 0.78, ny);
        const verticalEnvelope = topProfile * baseProfile;

        for (let x = 0; x < w; x++) {
          const u = x / w;

          // Domain warping for cauliflower-like turbulent cumulus billows
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

          // Combine macro domes with billow lobes and subtract lower threshold toward cloud top
          const heightBias = (1.0 - ny) * 0.16;
          const raw =
            (macroShape * 0.62 + billowTurbulence * 0.28 + microDetail * 0.10) *
              verticalEnvelope -
            heightBias;

          const d = smoothstep(coverage, coverage + 0.26, raw);
          densityField[y * w + x] = d;
        }
      }

      // Ray-march each active cloud pixel toward the sun to compute optical depth
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

          // March 6 steps along sun vector to integrate optical depth
          let opticalDepth = 0;
          for (let s = 1; s <= 6; s++) {
            const sx = ((Math.round(x + sunStepX * s * s * 0.35) % w) + w) % w;
            const sy = Math.round(y + sunStepY * s * s * 0.35);
            if (sy >= 0 && sy < h) {
              opticalDepth += densityField[sy * w + sx] * 0.32;
            }
          }

          // Beer-Lambert Law direct sunlight transmittance + powder silver-lining effect
          const transmittance = Math.exp(-opticalDepth * 2.8);
          const powderEffect = 1.0 - Math.exp(-d * 4.2);
          const directSun = clamp(transmittance * (0.65 + 0.35 * powderEffect), 0, 1);

          // Silver lining forward scattering on thin sunlit rims
          const silverLining = Math.pow(transmittance, 3.0) * (1.0 - d * 0.65);

          // Vertical ambient occlusion (darker slate-blue toward flat cloud base)
          const ambientHeight = clamp(1.0 - ny * 0.85, 0.15, 1.0);

          // Blend deep base shadow -> ambient mid -> sunlit top -> silver lining
          let r = lerp(clouds.deepBaseShadow[0], clouds.ambientMid[0], ambientHeight);
          let g = lerp(clouds.deepBaseShadow[1], clouds.ambientMid[1], ambientHeight);
          let b = lerp(clouds.deepBaseShadow[2], clouds.ambientMid[2], ambientHeight);

          // Warm horizon earth-bounce on lower cloud bellies
          const bounceFactor = smoothstep(0.55, 0.95, ny) * (1.0 - directSun) * 0.35;
          r = lerp(r, clouds.warmBounce[0], bounceFactor);
          g = lerp(g, clouds.warmBounce[1], bounceFactor);
          b = lerp(b, clouds.warmBounce[2], bounceFactor);

          // Direct solar illumination
          r = lerp(r, clouds.sunlitTop[0], directSun);
          g = lerp(g, clouds.sunlitTop[1], directSun);
          b = lerp(b, clouds.sunlitTop[2], directSun);

          // Rim silver lining
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
    // Layer 4: Distant Snow-Capped Alpine Range (3D Normal-Mapped Multifractal)
    // =========================================================================
    _bakeAlpineMountainLayer() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const imgData = ctx.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const data = imgData.data;

      const noise = this.noise;
      const { farMountains, sun } = this.theme;
      const bottomY = 845;

      // 1. Compute periodic ridged multifractal skyline profile
      const ridgeY = new Float32Array(LOGICAL_WIDTH);
      let minRidgeY = LOGICAL_HEIGHT;

      for (let x = 0; x < LOGICAL_WIDTH; x++) {
        const u = x / LOGICAL_WIDTH;
        const macro = noise.ridged(u, 0.12, 3, 6, 0.54, 14.2);
        const secondary = noise.fbm(u, 0.25, 2, 4, 0.5, 91.7) * 0.5 + 0.5;
        const crags = noise.ridged(u, 0.45, 12, 4, 0.48, 53.9);

        const h = 415 + (1.0 - macro) * 215 + (secondary - 0.5) * 65 - crags * 24;
        ridgeY[x] = h;
        if (h < minRidgeY) minRidgeY = h;
      }

      const startY = Math.max(0, Math.floor(minRidgeY) - 2);

      // Helper to evaluate 3D interior ridge protrusion heightfield H(x, y)
      const evalTerrainRelief = (x, y) => {
        const wrappedX = ((x % LOGICAL_WIDTH) + LOGICAL_WIDTH) % LOGICAL_WIDTH;
        const u = wrappedX / LOGICAL_WIDTH;
        const v = y / LOGICAL_WIDTH;
        const depthFromCrest = Math.max(0, y - ridgeY[wrappedX]);

        // Diagonal geological spurs descending from peaks
        const spurU = u + (depthFromCrest / LOGICAL_WIDTH) * 0.22;
        const primarySpurs = noise.ridged(spurU, v * 0.85, 5, 5, 0.55, 108.4);
        const couloirs = noise.ridged(u - (depthFromCrest / LOGICAL_WIDTH) * 0.15, v * 1.4, 10, 4, 0.5, 211.9);
        const rockStrata = noise.fbm(u, v * 3.5, 16, 3, 0.5, 304.2);

        return primarySpurs * 68 + couloirs * 28 + rockStrata * 9 - depthFromCrest * 0.32;
      };

      // 2. Shade every mountain pixel using 3D finite-difference normals + snow/rock materials + Rayleigh haze
      for (let x = 0; x < LOGICAL_WIDTH; x++) {
        const crestY = Math.floor(ridgeY[x]);
        const u = x / LOGICAL_WIDTH;

        for (let y = crestY; y < bottomY; y++) {
          const depth = y - crestY;
          const v = y / LOGICAL_WIDTH;

          // Finite difference 3D surface normal
          const hL = evalTerrainRelief(x - 2, y);
          const hR = evalTerrainRelief(x + 2, y);
          const hU = evalTerrainRelief(x, y - 2);
          const hD = evalTerrainRelief(x, y + 2);

          let nx = (hL - hR) * 0.14;
          let ny = (hU - hD) * 0.14;
          let nz = 1.0;
          const invLen = 1.0 / Math.hypot(nx, ny, nz);
          nx *= invLen;
          ny *= invLen;
          nz *= invLen;

          // Directional Lambertian sunlight + sky dome ambient
          const ndotl = clamp(nx * sun.dirX + ny * sun.dirY + nz * sun.dirZ, 0, 1);
          const skyAmb = clamp(0.5 - ny * 0.5, 0.2, 1.0);

          // Snow accumulation mask: high altitude, couloir gullies, and gentler slopes
          const altitudeFactor = clamp(1.0 - (y - 430) / 310, 0, 1);
          const gullyNoise = noise.ridged(u + depth * 0.00015, v * 1.6, 12, 3, 0.5, 412.6);
          const snowScore =
            altitudeFactor * 0.65 +
            nz * 0.42 +
            gullyNoise * 0.35 -
            Math.max(0, nx) * 0.18;
          const snowMask = smoothstep(0.68, 0.86, snowScore);

          // Base rock color (lit vs shaded granite)
          const rockDiffuse = clamp(ndotl * 1.15 + skyAmb * 0.22, 0, 1);
          let r = lerp(farMountains.rockDark[0], farMountains.rockLight[0], rockDiffuse);
          let g = lerp(farMountains.rockDark[1], farMountains.rockLight[1], rockDiffuse);
          let b = lerp(farMountains.rockDark[2], farMountains.rockLight[2], rockDiffuse);

          // Snow color (sunlit snow vs cool sky-lit blue snow shadow)
          const snowLight = clamp(ndotl * 1.1 + 0.15, 0, 1);
          const sr = lerp(farMountains.snowShade[0], farMountains.snowSunlit[0], snowLight);
          const sg = lerp(farMountains.snowShade[1], farMountains.snowSunlit[1], snowLight);
          const sb = lerp(farMountains.snowShade[2], farMountains.snowSunlit[2], snowLight);

          r = lerp(r, sr, snowMask);
          g = lerp(g, sg, snowMask);
          b = lerp(b, sb, snowMask);

          // Rayleigh aerial perspective + valley mist toward mountain base
          const valleyMist = smoothstep(620, bottomY, y);
          const haze = clamp(
            farMountains.hazeStrength * 0.52 + valleyMist * 0.46,
            0,
            0.94
          );

          r = lerp(r, farMountains.hazeColor[0], haze);
          g = lerp(g, farMountains.hazeColor[1], haze);
          b = lerp(b, farMountains.hazeColor[2], haze);

          // Anti-aliased crest edge (1.5px feather)
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
    // Layer 5: Near Rugged Crags & Sub-Alpine Timberline
    // =========================================================================
    _bakeSubAlpineCragsLayer() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const imgData = ctx.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const data = imgData.data;

      const noise = this.noise;
      const { nearMountains, sun } = this.theme;
      const bottomY = 910;

      const ridgeY = new Float32Array(LOGICAL_WIDTH);
      let minRidgeY = LOGICAL_HEIGHT;

      for (let x = 0; x < LOGICAL_WIDTH; x++) {
        const u = x / LOGICAL_WIDTH;
        const primary = noise.ridged(u, 0.34, 4, 5, 0.52, 77.3);
        const undulation = noise.fbm(u, 0.18, 2, 4, 0.5, 19.4);
        const microCrag = noise.ridged(u, 0.82, 16, 3, 0.45, 145.8);

        const h = 555 + (1.0 - primary) * 165 + undulation * 48 - microCrag * 16;
        ridgeY[x] = h;
        if (h < minRidgeY) minRidgeY = h;
      }

      const startY = Math.max(0, Math.floor(minRidgeY) - 2);

      const evalCragRelief = (x, y) => {
        const wrappedX = ((x % LOGICAL_WIDTH) + LOGICAL_WIDTH) % LOGICAL_WIDTH;
        const u = wrappedX / LOGICAL_WIDTH;
        const v = y / LOGICAL_WIDTH;
        const depth = Math.max(0, y - ridgeY[wrappedX]);

        const spurs = noise.ridged(u - depth * 0.00012, v * 0.95, 6, 5, 0.54, 512.1);
        const cliffs = noise.fbm(u * 1.5, v * 2.8, 12, 4, 0.5, 619.4);
        const canopyBump = noise.billow(u, v * 1.4, 28, 3, 0.5, 701.8);

        return spurs * 55 + cliffs * 22 + canopyBump * 12 - depth * 0.28;
      };

      for (let x = 0; x < LOGICAL_WIDTH; x++) {
        const crestY = Math.floor(ridgeY[x]);
        const u = x / LOGICAL_WIDTH;

        for (let y = crestY; y < bottomY; y++) {
          const v = y / LOGICAL_WIDTH;

          const hL = evalCragRelief(x - 2, y);
          const hR = evalCragRelief(x + 2, y);
          const hU = evalCragRelief(x, y - 2);
          const hD = evalCragRelief(x, y + 2);

          let nx = (hL - hR) * 0.15;
          let ny = (hU - hD) * 0.15;
          let nz = 1.0;
          const invLen = 1.0 / Math.hypot(nx, ny, nz);
          nx *= invLen;
          ny *= invLen;
          nz *= invLen;

          const ndotl = clamp(nx * sun.dirX + ny * sun.dirY + nz * sun.dirZ, 0, 1);

          // Timberline transition: lower and gentler slopes are covered in dense spruce forest
          const elevationNorm = clamp((y - 580) / 240, 0, 1);
          const forestNoise = noise.fbm(u, v * 1.5, 16, 4, 0.5, 812.3);
          const timberMask = smoothstep(0.38, 0.68, elevationNorm * 0.75 + nz * 0.4 + forestNoise * 0.35);

          // Rock color
          let rr = lerp(nearMountains.rockDark[0], nearMountains.rockLight[0], ndotl);
          let rg = lerp(nearMountains.rockDark[1], nearMountains.rockLight[1], ndotl);
          let rb = lerp(nearMountains.rockDark[2], nearMountains.rockLight[2], ndotl);

          // Sub-alpine pine canopy color
          const pr = lerp(nearMountains.pineDark[0], nearMountains.pineLight[0], ndotl);
          const pg = lerp(nearMountains.pineDark[1], nearMountains.pineLight[1], ndotl);
          const pb = lerp(nearMountains.pineDark[2], nearMountains.pineLight[2], ndotl);

          let r = lerp(rr, pr, timberMask);
          let g = lerp(rg, pg, timberMask);
          let b = lerp(rb, pb, timberMask);

          // Atmospheric distance haze & valley mist
          const mist = smoothstep(690, bottomY, y);
          const haze = clamp(nearMountains.hazeStrength * 0.55 + mist * 0.48, 0, 0.88);

          r = lerp(r, nearMountains.hazeColor[0], haze);
          g = lerp(g, nearMountains.hazeColor[1], haze);
          b = lerp(b, nearMountains.hazeColor[2], haze);

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
    // Layer 6: Mid-Distance Forest Hills (Normal-Lit Canopy + Botanical Spires)
    // =========================================================================
    _bakeMidForestHillsLayer() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(50501);
      const noise = this.noise;
      const { midHills, sun } = this.theme;
      const bottomY = 975;

      const ridgeY = new Float32Array(LOGICAL_WIDTH);
      let minRidgeY = LOGICAL_HEIGHT;

      for (let x = 0; x < LOGICAL_WIDTH; x++) {
        const u = x / LOGICAL_WIDTH;
        const hillWave = noise.fbm(u, 0.42, 3, 4, 0.5, 312.7);
        const subRidge = noise.ridged(u, 0.65, 6, 3, 0.5, 419.2);
        const h = 745 + hillWave * 82 - subRidge * 28;
        ridgeY[x] = h;
        if (h < minRidgeY) minRidgeY = h;
      }

      // 1. Per-pixel 3D normal-mapped forest canopy carpet across the rolling hillside
      const imgData = ctx.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const data = imgData.data;

      const evalCanopyHeight = (x, y) => {
        const wrappedX = ((x % LOGICAL_WIDTH) + LOGICAL_WIDTH) % LOGICAL_WIDTH;
        const u = wrappedX / LOGICAL_WIDTH;
        const v = y / LOGICAL_WIDTH;
        const macroRoll = noise.fbm(u, v * 0.9, 5, 3, 0.5, 910.4) * 42;
        const crownBumps = noise.billow(u, v * 1.4, 32, 4, 0.55, 955.2) * 18;
        return macroRoll + crownBumps;
      };

      for (let x = 0; x < LOGICAL_WIDTH; x++) {
        const crestY = Math.floor(ridgeY[x]);
        for (let y = crestY; y < bottomY; y++) {
          const hL = evalCanopyHeight(x - 2, y);
          const hR = evalCanopyHeight(x + 2, y);
          const hU = evalCanopyHeight(x, y - 2);
          const hD = evalCanopyHeight(x, y + 2);

          let nx = (hL - hR) * 0.16;
          let ny = (hU - hD) * 0.16;
          let nz = 1.0;
          const invLen = 1.0 / Math.hypot(nx, ny, nz);
          nx *= invLen;
          ny *= invLen;
          nz *= invLen;

          const ndotl = clamp(nx * sun.dirX + ny * sun.dirY + nz * sun.dirZ, 0, 1);
          const light = Math.pow(ndotl, 1.15);

          let r, g, b;
          if (light < 0.45) {
            const t = light / 0.45;
            r = lerp(midHills.canopyDark[0], midHills.canopyMid[0], t);
            g = lerp(midHills.canopyDark[1], midHills.canopyMid[1], t);
            b = lerp(midHills.canopyDark[2], midHills.canopyMid[2], t);
          } else {
            const t = (light - 0.45) / 0.55;
            r = lerp(midHills.canopyMid[0], midHills.canopySunlit[0], t);
            g = lerp(midHills.canopyMid[1], midHills.canopySunlit[1], t);
            b = lerp(midHills.canopyMid[2], midHills.canopySunlit[2], t);
          }

          // Valley mist pooling at the foot of the hills
          const valleyMist = smoothstep(820, bottomY, y) * 0.45;
          r = lerp(r, midHills.mistColor[0], valleyMist);
          g = lerp(g, midHills.mistColor[1], valleyMist);
          b = lerp(b, midHills.mistColor[2], valleyMist);

          const idx = (y * LOGICAL_WIDTH + x) * 4;
          data[idx] = clamp(r, 0, 255);
          data[idx + 1] = clamp(g, 0, 255);
          data[idx + 2] = clamp(b, 0, 255);
          data[idx + 3] = 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // 2. Stamp detailed botanical conifer spires & oak crowns along the ridge skyline and slopes
      for (let x = 0; x < LOGICAL_WIDTH; x += 9) {
        const y = ridgeY[x] + 6 + (rand() - 0.5) * 6;
        const treeH = 26 + rand() * 32;
        const treeW = 12 + rand() * 11;
        const isConifer = rand() > 0.28;

        drawWrappedHorizontal(ctx, x, LOGICAL_WIDTH, 60, (drawX) => {
          if (isConifer) {
            this._drawBotanicalSpruce(
              ctx,
              drawX,
              y,
              treeW,
              treeH,
              midHills.canopyDark,
              midHills.canopyMid,
              midHills.canopySunlit,
              rand
            );
          } else {
            this._drawBotanicalOakCanopy(
              ctx,
              drawX,
              y - treeH * 0.35,
              treeW * 0.95,
              midHills.canopyDark,
              midHills.canopyMid,
              midHills.canopySunlit,
              rand
            );
          }
        });
      }

      return buffer;
    }

    // =========================================================================
    // Layer 7: Atmospheric Crepuscular Sunbeams & Drifting Cloud Shadows
    // =========================================================================
    _bakeSunbeamsAndCloudShadows() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(60609);

      // Diagonal crepuscular god-rays slanting down from the sun direction
      const beamCount = 11;
      for (let i = 0; i < beamCount; i++) {
        const bx = rand() * LOGICAL_WIDTH;
        const beamWidth = 75 + rand() * 125;
        const alpha = 0.045 + rand() * 0.055;

        drawWrappedHorizontal(ctx, bx, LOGICAL_WIDTH, 480, (drawX) => {
          const grad = ctx.createLinearGradient(drawX + 180, 360, drawX - 240, 980);
          grad.addColorStop(0.0, 'rgba(255, 250, 218, 0)');
          grad.addColorStop(0.35, `rgba(255, 248, 210, ${alpha})`);
          grad.addColorStop(0.75, `rgba(255, 244, 195, ${alpha * 0.65})`);
          grad.addColorStop(1.0, 'rgba(255, 244, 195, 0)');

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(drawX + 140, 360);
          ctx.lineTo(drawX + 140 + beamWidth, 360);
          ctx.lineTo(drawX - 240 + beamWidth * 1.45, 980);
          ctx.lineTo(drawX - 240, 980);
          ctx.closePath();
          ctx.fill();
        });
      }

      // Soft drifting cloud shadows over the middle and near hills
      for (let i = 0; i < 8; i++) {
        const sx = rand() * LOGICAL_WIDTH;
        const sy = 740 + rand() * 210;
        const rx = 190 + rand() * 170;
        const ry = 36 + rand() * 34;

        drawWrappedHorizontal(ctx, sx, LOGICAL_WIDTH, 380, (drawX) => {
          ctx.save();
          ctx.translate(drawX, sy);
          ctx.scale(1, ry / rx);
          const grad = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
          grad.addColorStop(0, 'rgba(8, 24, 16, 0.18)');
          grad.addColorStop(0.6, 'rgba(8, 24, 16, 0.08)');
          grad.addColorStop(1, 'rgba(8, 24, 16, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, rx, 0, TWO_PI);
          ctx.fill();
          ctx.restore();
        });
      }

      return buffer;
    }

    // =========================================================================
    // Layer 8: Near Woodland Slope (Botanical Trees with Subsurface Scattering)
    // =========================================================================
    _bakeNearWoodlandLayer() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(70703);
      const noise = this.noise;
      const { nearHills, sun } = this.theme;
      const bottomY = 1045;

      const ridgeY = new Float32Array(LOGICAL_WIDTH);
      for (let x = 0; x < LOGICAL_WIDTH; x++) {
        const u = x / LOGICAL_WIDTH;
        const wave = noise.fbm(u, 0.72, 3, 4, 0.5, 514.6);
        ridgeY[x] = 868 + wave * 56;
      }

      // 1. Per-pixel normal-mapped lush woodland slope
      const imgData = ctx.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const data = imgData.data;

      const evalSlopeCanopy = (x, y) => {
        const wrappedX = ((x % LOGICAL_WIDTH) + LOGICAL_WIDTH) % LOGICAL_WIDTH;
        const u = wrappedX / LOGICAL_WIDTH;
        const v = y / LOGICAL_WIDTH;
        return (
          noise.billow(u, v * 1.3, 24, 4, 0.55, 622.1) * 22 +
          noise.fbm(u, v, 8, 3, 0.5, 711.9) * 30
        );
      };

      for (let x = 0; x < LOGICAL_WIDTH; x++) {
        const crestY = Math.floor(ridgeY[x]);
        for (let y = crestY; y < bottomY; y++) {
          const hL = evalSlopeCanopy(x - 2, y);
          const hR = evalSlopeCanopy(x + 2, y);
          const hU = evalSlopeCanopy(x, y - 2);
          const hD = evalSlopeCanopy(x, y + 2);

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
            r = lerp(nearHills.canopyDark[0], nearHills.canopyMid[0], t);
            g = lerp(nearHills.canopyDark[1], nearHills.canopyMid[1], t);
            b = lerp(nearHills.canopyDark[2], nearHills.canopyMid[2], t);
          } else {
            const t = (ndotl - 0.45) / 0.55;
            r = lerp(nearHills.canopyMid[0], nearHills.canopySunlit[0], t);
            g = lerp(nearHills.canopyMid[1], nearHills.canopySunlit[1], t);
            b = lerp(nearHills.canopyMid[2], nearHills.canopySunlit[2], t);
          }

          const idx = (y * LOGICAL_WIDTH + x) * 4;
          data[idx] = clamp(r, 0, 255);
          data[idx + 1] = clamp(g, 0, 255);
          data[idx + 2] = clamp(b, 0, 255);
          data[idx + 3] = 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // 2. Botanical woodland trees & leaf-cluster shrubs along the ridge and slope
      const treePositions = [];
      for (let x = 0; x < LOGICAL_WIDTH; x += 18) {
        const y = ridgeY[x] + 8 + rand() * 58;
        treePositions.push({ x: x + (rand() - 0.5) * 12, y, scale: 0.85 + rand() * 0.55 });
      }
      treePositions.sort((a, b) => a.y - b.y);

      for (let i = 0; i < treePositions.length; i++) {
        const t = treePositions[i];
        const isSpruce = rand() > 0.62;
        drawWrappedHorizontal(ctx, t.x, LOGICAL_WIDTH, 95, (drawX) => {
          if (isSpruce) {
            this._drawBotanicalSpruce(
              ctx,
              drawX,
              t.y,
              22 * t.scale,
              52 * t.scale,
              nearHills.canopyDark,
              nearHills.canopyMid,
              nearHills.canopySunlit,
              rand
            );
          } else {
            this._drawBotanicalOakCanopy(
              ctx,
              drawX,
              t.y - 16 * t.scale,
              24 * t.scale,
              nearHills.canopyDark,
              nearHills.canopyMid,
              nearHills.subsurfaceGold,
              rand,
              true
            );
          }
        });
      }

      return buffer;
    }

    // =========================================================================
    // Layer 9: Hyper-Detailed Foreground Botanical Meadow
    // =========================================================================
    _bakeForegroundMeadowLayer() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(80805);
      const noise = this.noise;
      const { foreground } = this.theme;

      const contourY = new Float32Array(LOGICAL_WIDTH + 1);
      for (let x = 0; x <= LOGICAL_WIDTH; x++) {
        const u = (x % LOGICAL_WIDTH) / LOGICAL_WIDTH;
        contourY[x] = 976 + noise.fbm(u, 0.91, 4, 4, 0.5, 819.3) * 24;
      }

      // Pass 1: Deep shadow grass & fern silhouettes rising behind the soil crest
      this._drawBotanicalGrassPass(ctx, rand, contourY, {
        count: 1650,
        minH: 28,
        maxH: 64,
        minW: 2.6,
        maxW: 4.8,
        yMin: -4,
        yMax: 22,
        baseColor: foreground.soilDark,
        tipColor: foreground.meadowDark,
        highlightColor: null
      });

      // Rich organic meadow ground fill
      const groundGrad = ctx.createLinearGradient(0, 955, 0, LOGICAL_HEIGHT);
      groundGrad.addColorStop(0.0, foreground.meadowMid);
      groundGrad.addColorStop(0.45, foreground.meadowDark);
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

      // Pass 2: Dense mid-tone emerald meadow grass
      this._drawBotanicalGrassPass(ctx, rand, contourY, {
        count: 2200,
        minH: 26,
        maxH: 68,
        minW: 2.2,
        maxW: 4.4,
        yMin: 2,
        yMax: 96,
        baseColor: foreground.meadowDark,
        tipColor: foreground.meadowLight,
        highlightColor: null
      });

      // Pass 3: Sun-kissed foreground grass blades with central specular mid-rib
      this._drawBotanicalGrassPass(ctx, rand, contourY, {
        count: 1450,
        minH: 30,
        maxH: 74,
        minW: 2.0,
        maxW: 3.8,
        yMin: 4,
        yMax: 102,
        baseColor: foreground.meadowMid,
        tipColor: foreground.meadowSunlit,
        highlightColor: 'rgba(218, 248, 142, 0.45)'
      });

      // Pass 4: Feathery golden foxtail / timothy grass seed plumes
      const plumeCount = 140;
      for (let i = 0; i < plumeCount; i++) {
        const px = rand() * LOGICAL_WIDTH;
        const py = contourY[Math.floor(px)] + rand() * 85;
        const h = 42 + rand() * 45;
        const bend = (rand() - 0.32) * 28;

        drawWrappedHorizontal(ctx, px, LOGICAL_WIDTH, 50, (drawX) => {
          const tipX = drawX + bend;
          const tipY = py - h;

          // Stalk
          ctx.strokeStyle = foreground.meadowLight;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(drawX, py);
          ctx.quadraticCurveTo(drawX + bend * 0.4, py - h * 0.55, tipX, tipY);
          ctx.stroke();

          // Feathery golden seed head
          ctx.fillStyle = foreground.seedGold;
          const angle = Math.atan2(-h * 0.45, bend * 0.6);
          ctx.save();
          ctx.translate(tipX, tipY);
          ctx.rotate(angle + Math.PI * 0.5);
          ctx.beginPath();
          ctx.ellipse(0, 5, 2.3, 8.5, 0, 0, TWO_PI);
          ctx.fill();
          ctx.restore();
        });
      }

      // Pass 5: Multi-petaled wildflowers (Oxeye Daisies & Meadow Buttercups)
      const flowerCount = 95;
      for (let i = 0; i < flowerCount; i++) {
        const fx = rand() * LOGICAL_WIDTH;
        const fy = contourY[Math.floor(fx)] - 4 + rand() * 78;
        const scale = 0.75 + rand() * 0.65;
        const isDaisy = rand() > 0.45;

        drawWrappedHorizontal(ctx, fx, LOGICAL_WIDTH, 30, (drawX) => {
          if (isDaisy) {
            // Subtle drop shadow
            ctx.fillStyle = 'rgba(12, 32, 14, 0.35)';
            ctx.beginPath();
            ctx.arc(drawX, fy + 1.5, 4.2 * scale, 0, TWO_PI);
            ctx.fill();

            // Radiating white petals
            ctx.fillStyle = foreground.daisyPetal;
            const petals = 8;
            for (let p = 0; p < petals; p++) {
              const a = (p / petals) * TWO_PI;
              const px = drawX + Math.cos(a) * 3.2 * scale;
              const py = fy + Math.sin(a) * 2.4 * scale;
              ctx.beginPath();
              ctx.arc(px, py, 1.5 * scale, 0, TWO_PI);
              ctx.fill();
            }

            // Golden disc center
            ctx.fillStyle = foreground.daisyCenter;
            ctx.beginPath();
            ctx.arc(drawX, fy, 1.8 * scale, 0, TWO_PI);
            ctx.fill();
          } else {
            // Glossy golden buttercup
            ctx.fillStyle = foreground.buttercup;
            ctx.beginPath();
            ctx.arc(drawX, fy, 2.6 * scale, 0, TWO_PI);
            ctx.fill();
            ctx.fillStyle = '#fff5a8';
            ctx.beginPath();
            ctx.arc(drawX + 0.6 * scale, fy - 0.6 * scale, 1.1 * scale, 0, TWO_PI);
            ctx.fill();
          }
        });
      }

      return buffer;
    }

    // =========================================================================
    // Botanical Tree & Foliage Micro-Renderers
    // =========================================================================

    /**
     * Renders a multi-tiered botanical spruce/pine tree with individual branch whorls
     * and directional sunlight (no flat geometric triangles).
     */
    _drawBotanicalSpruce(ctx, x, baseY, width, height, darkRGB, midRGB, lightRGB, rand) {
      const darkStr = `rgb(${darkRGB[0]}, ${darkRGB[1]}, ${darkRGB[2]})`;
      const midStr = `rgb(${midRGB[0]}, ${midRGB[1]}, ${midRGB[2]})`;
      const lightStr = `rgb(${lightRGB[0]}, ${lightRGB[1]}, ${lightRGB[2]})`;

      // Dark wooden trunk core
      ctx.fillStyle = '#1b1612';
      ctx.fillRect(x - 1.2, baseY - height * 0.85, 2.4, height * 0.85);

      const tiers = 9;
      for (let t = 0; t < tiers; t++) {
        const progress = t / (tiers - 1); // 0 = bottom tier, 1 = top leader
        const tierY = baseY - progress * height * 0.88;
        const tierSpan = width * (1.0 - progress * 0.82) * (0.85 + rand() * 0.25);
        const droop = 4 + (1.0 - progress) * 6;

        // Shaded left bough clusters
        ctx.fillStyle = darkStr;
        for (let b = 0; b < 4; b++) {
          const frac = (b + 1) / 4;
          const bx = x - tierSpan * 0.55 * frac;
          const by = tierY + droop * frac + (rand() - 0.5) * 2.5;
          const r = (2.8 + (1.0 - progress) * 3.4) * (1.1 - frac * 0.35);
          ctx.beginPath();
          ctx.arc(bx, by, r, 0, TWO_PI);
          ctx.fill();
        }

        // Mid-tone center boughs
        ctx.fillStyle = midStr;
        ctx.beginPath();
        ctx.arc(x + (rand() - 0.5) * 2, tierY, 3.2 + (1.0 - progress) * 3.8, 0, TWO_PI);
        ctx.fill();

        // Sunlit right bough clusters
        ctx.fillStyle = lightStr;
        for (let b = 0; b < 4; b++) {
          const frac = (b + 1) / 4;
          const bx = x + tierSpan * 0.55 * frac;
          const by = tierY + droop * frac * 0.85 + (rand() - 0.5) * 2.5;
          const r = (2.6 + (1.0 - progress) * 3.2) * (1.1 - frac * 0.35);
          ctx.beginPath();
          ctx.arc(bx, by, r, 0, TWO_PI);
          ctx.fill();
        }
      }

      // Leader spire tip
      ctx.fillStyle = midStr;
      ctx.beginPath();
      ctx.arc(x, baseY - height * 0.95, 2.2, 0, TWO_PI);
      ctx.fill();
    }

    /**
     * Renders an organic deciduous tree crown composed of dozens of dapple-lit leaf clumps,
     * ambient occlusion crevices, and optional visible trunk/branches.
     */
    _drawBotanicalOakCanopy(
      ctx,
      x,
      y,
      radius,
      darkRGB,
      midRGB,
      lightRGB,
      rand,
      drawTrunk = false
    ) {
      if (drawTrunk) {
        ctx.strokeStyle = '#2b221b';
        ctx.lineWidth = Math.max(2, radius * 0.14);
        ctx.beginPath();
        ctx.moveTo(x, y + radius * 1.15);
        ctx.lineTo(x - radius * 0.05, y + radius * 0.1);
        ctx.stroke();
      }

      const darkStr = `rgb(${darkRGB[0]}, ${darkRGB[1]}, ${darkRGB[2]})`;
      const midStr = `rgb(${midRGB[0]}, ${midRGB[1]}, ${midRGB[2]})`;
      const lightStr = `rgb(${lightRGB[0]}, ${lightRGB[1]}, ${lightRGB[2]})`;

      const subDomes = 5;
      for (let d = 0; d < subDomes; d++) {
        const angle = (d / subDomes) * TWO_PI + rand() * 0.5;
        const dist = radius * (0.25 + rand() * 0.35);
        const cx = x + Math.cos(angle) * dist * 1.15;
        const cy = y + Math.sin(angle) * dist * 0.75;
        const subR = radius * (0.45 + rand() * 0.25);

        // Pass 1: Deep interior leaf-cluster ambient occlusion
        ctx.fillStyle = darkStr;
        for (let i = 0; i < 9; i++) {
          const a = rand() * TWO_PI;
          const rDist = rand() * subR * 0.85;
          const lx = cx - subR * 0.15 + Math.cos(a) * rDist;
          const ly = cy + subR * 0.2 + Math.sin(a) * rDist * 0.8;
          ctx.beginPath();
          ctx.arc(lx, ly, subR * (0.28 + rand() * 0.22), 0, TWO_PI);
          ctx.fill();
        }

        // Pass 2: Mid-tone foliage mass
        ctx.fillStyle = midStr;
        for (let i = 0; i < 10; i++) {
          const a = rand() * TWO_PI;
          const rDist = rand() * subR * 0.78;
          const lx = cx + Math.cos(a) * rDist;
          const ly = cy + Math.sin(a) * rDist * 0.8;
          ctx.beginPath();
          ctx.arc(lx, ly, subR * (0.25 + rand() * 0.22), 0, TWO_PI);
          ctx.fill();
        }

        // Pass 3: Sunlit upper-right leaf clusters with warm subsurface translucency
        ctx.fillStyle = lightStr;
        for (let i = 0; i < 8; i++) {
          const a = -Math.PI * 0.65 + rand() * Math.PI * 0.95;
          const rDist = rand() * subR * 0.72;
          const lx = cx + subR * 0.22 + Math.cos(a) * rDist;
          const ly = cy - subR * 0.22 + Math.sin(a) * rDist * 0.8;
          ctx.beginPath();
          ctx.arc(lx, ly, subR * (0.18 + rand() * 0.2), 0, TWO_PI);
          ctx.fill();
        }
      }
    }

    /**
     * Renders a dense pass of curved botanical grass blades with optional specular mid-ribs.
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

      const grad = ctx.createLinearGradient(0, LOGICAL_HEIGHT - 165, 0, LOGICAL_HEIGHT);
      grad.addColorStop(0, tipColor);
      grad.addColorStop(1, baseColor);

      for (let i = 0; i < count; i++) {
        const gx = rand() * LOGICAL_WIDTH;
        const groundY = contourY[Math.floor(gx)];
        const gy = groundY + yMin + rand() * (yMax - yMin);
        const h = minH + rand() * (maxH - minH);
        const halfW = (minW + rand() * (maxW - minW)) * 0.5;
        const bend = (rand() - 0.34) * 26;

        drawWrappedHorizontal(ctx, gx, LOGICAL_WIDTH, 45, (drawX) => {
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
            ctx.lineWidth = 0.7;
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
      const effectiveSpeed = this.baseScrollSpeed * this.speedMultiplier;
      if (effectiveSpeed === 0) return;

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

    renderFrame() {
      const ctx = this.ctx;
      if (!ctx || !this.staticSkyBuffer) return;

      ctx.save();
      ctx.scale(this.renderScaleX, this.renderScaleY);

      // 1. Draw physical atmospheric sky & solar corona
      ctx.drawImage(this.staticSkyBuffer, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      // 2. Composite seamless parallax layers from back to front (right-to-left scrolling)
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
      }

      ctx.restore();
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
