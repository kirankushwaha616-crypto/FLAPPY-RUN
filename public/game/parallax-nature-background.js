/**
 * Flappy Face - Standalone Realistic Nature Parallax Background Engine
 * Pure HTML5 Canvas, 16:9 (1920x1080 logical space), zero external assets.
 */
(function (global) {
  'use strict';

  const LOGICAL_WIDTH = 1920;
  const LOGICAL_HEIGHT = 1080;
  const TWO_PI = Math.PI * 2;

  // Default visual theme (customizable via setBackgroundTheme)
  const DEFAULT_THEME = {
    sky: {
      zenith: '#2c69a8',
      upperMid: '#4f91cd',
      lowerMid: '#86bee8',
      horizon: '#d8f0fa',
      hazeGlow: '#fff7df'
    },
    sun: {
      x: 1460,
      y: 235,
      coreRadius: 68,
      glowRadius: 560,
      coreColor: '#fffef5',
      midGlowColor: 'rgba(255, 244, 198, 0.48)',
      outerGlowColor: 'rgba(255, 232, 168, 0)'
    },
    clouds: {
      highlight: '#ffffff',
      body: '#f4f8fc',
      shadow: '#b8cde0',
      deepShadow: '#9ab4cc'
    },
    farMountains: {
      ridgeTop: '#567fa3',
      ridgeBase: '#8fb4cf',
      sunlitFacet: 'rgba(225, 242, 255, 0.28)',
      shadedFacet: 'rgba(42, 71, 102, 0.34)',
      mistColor: 'rgba(205, 231, 245, 0.78)'
    },
    nearMountains: {
      ridgeTop: '#3c6e78',
      ridgeBase: '#699ca1',
      sunlitFacet: 'rgba(182, 224, 198, 0.22)',
      shadedFacet: 'rgba(24, 52, 62, 0.38)',
      mistColor: 'rgba(184, 220, 228, 0.62)'
    },
    midHills: {
      hillTop: '#4e8c45',
      hillBase: '#2d5c34',
      treeDark: '#234c2b',
      treeMid: '#376f37',
      treeHighlight: '#76b356',
      valleyMist: 'rgba(195, 228, 214, 0.42)'
    },
    nearHills: {
      hillTop: '#64a83e',
      hillBase: '#275928',
      foliageDark: '#1b451f',
      foliageMid: '#33702c',
      foliageLight: '#82c347',
      rimLight: '#b8e26b'
    },
    foreground: {
      soilDark: '#143316',
      meadowBase: '#265c23',
      meadowTop: '#4f9934',
      grassDark: '#1d4d1d',
      grassMid: '#3d852c',
      grassLight: '#6eb83b',
      grassTip: '#a7df58',
      flowerWhite: '#fff9e6',
      flowerYellow: '#ffd84d'
    }
  };

  /**
   * Deterministic seeded PRNG (Mulberry32) so regenerated layers look consistent
   * across resizes and sessions without visual popping.
   */
  function createSeededRandom(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Evaluates a periodic Fourier series at horizontal coordinate x in [0, width].
   * Guarantees exact height and derivative continuity at x = 0 and x = width.
   */
  function evaluatePeriodicCurve(x, width, baseHeight, harmonics) {
    let y = baseHeight;
    const normalizedAngle = (x / width) * TWO_PI;
    for (let i = 0; i < harmonics.length; i++) {
      const h = harmonics[i];
      y += Math.sin(normalizedAngle * h.freq + h.phase) * h.amp;
    }
    return y;
  }

  /**
   * Helper that executes a drawing callback at x - width, x, and x + width
   * so any shape near the tile edges wraps seamlessly without clipping seams.
   */
  function drawWrappedHorizontal(ctx, x, width, margin, drawCallback) {
    drawCallback(x);
    if (x < margin) {
      drawCallback(x + width);
    }
    if (x > width - margin) {
      drawCallback(x - width);
    }
  }

  /**
   * Creates an offscreen canvas of given dimensions.
   */
  function createOffscreenBuffer(width, height) {
    const buffer = document.createElement('canvas');
    buffer.width = width;
    buffer.height = height;
    return buffer;
  }

  class NatureParallaxBackground {
    constructor(canvasElement) {
      this.canvas = canvasElement;
      this.ctx = this.canvas.getContext('2d', { alpha: false });

      this.theme = JSON.parse(JSON.stringify(DEFAULT_THEME));

      // Base speed in logical pixels per second (at speed multiplier = 1.0)
      this.baseScrollSpeed = 240;
      this.speedMultiplier = 1.0;

      this.isRunning = false;
      this.rafId = null;
      this.lastTimestamp = 0;
      this.renderScale = 1;

      // Parallax layer definitions (ordered back-to-front)
      this.layers = [
        {
          id: 'farClouds',
          parallaxFactor: 0.05,
          offset: 0,
          buffer: null
        },
        {
          id: 'nearClouds',
          parallaxFactor: 0.11,
          offset: 0,
          buffer: null
        },
        {
          id: 'farMountains',
          parallaxFactor: 0.18,
          offset: 0,
          buffer: null
        },
        {
          id: 'nearMountains',
          parallaxFactor: 0.30,
          offset: 0,
          buffer: null
        },
        {
          id: 'midHills',
          parallaxFactor: 0.48,
          offset: 0,
          buffer: null
        },
        {
          id: 'cloudShadows',
          parallaxFactor: 0.54,
          offset: 0,
          buffer: null
        },
        {
          id: 'nearHills',
          parallaxFactor: 0.72,
          offset: 0,
          buffer: null
        },
        {
          id: 'foregroundGrass',
          parallaxFactor: 1.0,
          offset: 0,
          buffer: null
        }
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
     * Bakes all procedural layers into offscreen buffers for high-speed rendering.
     */
    bakeAllLayers() {
      this.staticSkyBuffer = this._bakeSkyAndSun();

      const layerBuilders = {
        farClouds: () => this._bakeCloudLayer(101, 14, 115, 290, 0.68, 0.75),
        nearClouds: () => this._bakeCloudLayer(202, 11, 155, 360, 0.92, 1.0),
        farMountains: () => this._bakeMountainLayer(303, {
          baseY: 575,
          harmonics: [
            { freq: 1, amp: 68, phase: 0.4 },
            { freq: 2, amp: 52, phase: 1.9 },
            { freq: 3, amp: 36, phase: 3.1 },
            { freq: 5, amp: 24, phase: 0.8 },
            { freq: 8, amp: 14, phase: 2.4 },
            { freq: 13, amp: 7, phase: 4.2 }
          ],
          topColor: this.theme.farMountains.ridgeTop,
          baseColor: this.theme.farMountains.ridgeBase,
          sunlitColor: this.theme.farMountains.sunlitFacet,
          shadedColor: this.theme.farMountains.shadedFacet,
          mistColor: this.theme.farMountains.mistColor,
          bottomY: 850,
          ridgeStep: 24
        }),
        nearMountains: () => this._bakeMountainLayer(404, {
          baseY: 665,
          harmonics: [
            { freq: 1, amp: 54, phase: 2.2 },
            { freq: 2, amp: 46, phase: 0.7 },
            { freq: 4, amp: 30, phase: 4.0 },
            { freq: 6, amp: 19, phase: 1.5 },
            { freq: 9, amp: 11, phase: 3.6 }
          ],
          topColor: this.theme.nearMountains.ridgeTop,
          baseColor: this.theme.nearMountains.ridgeBase,
          sunlitColor: this.theme.nearMountains.sunlitFacet,
          shadedColor: this.theme.nearMountains.shadedFacet,
          mistColor: this.theme.nearMountains.mistColor,
          bottomY: 900,
          ridgeStep: 30
        }),
        midHills: () => this._bakeMidForestHills(505),
        cloudShadows: () => this._bakeCloudShadowLayer(606),
        nearHills: () => this._bakeNearWoodlandHills(707),
        foregroundGrass: () => this._bakeForegroundMeadow(808)
      };

      for (let i = 0; i < this.layers.length; i++) {
        const layer = this.layers[i];
        if (layerBuilders[layer.id]) {
          layer.buffer = layerBuilders[layer.id]();
        }
      }
    }

    /**
     * Bakes the static sky gradient, atmospheric horizon glow, solar disc, and soft sunbeams.
     */
    _bakeSkyAndSun() {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const { sky, sun } = this.theme;

      // Main vertical sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT * 0.82);
      skyGrad.addColorStop(0.0, sky.zenith);
      skyGrad.addColorStop(0.35, sky.upperMid);
      skyGrad.addColorStop(0.68, sky.lowerMid);
      skyGrad.addColorStop(0.92, sky.horizon);
      skyGrad.addColorStop(1.0, sky.hazeGlow);

      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      // Subtle atmospheric sun rays
      ctx.save();
      ctx.translate(sun.x, sun.y);
      const rayCount = 14;
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 0.95 + 0.15;
        const spread = 0.045 + (i % 3) * 0.018;
        const rayGrad = ctx.createRadialGradient(0, 0, 20, 0, 0, 1100);
        rayGrad.addColorStop(0, 'rgba(255, 250, 224, 0.09)');
        rayGrad.addColorStop(0.5, 'rgba(255, 245, 205, 0.03)');
        rayGrad.addColorStop(1, 'rgba(255, 245, 205, 0)');

        ctx.fillStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 1150, angle - spread, angle + spread);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Wide solar atmospheric scattering
      const outerGlow = ctx.createRadialGradient(
        sun.x,
        sun.y,
        sun.coreRadius * 0.4,
        sun.x,
        sun.y,
        sun.glowRadius
      );
      outerGlow.addColorStop(0.0, sun.coreColor);
      outerGlow.addColorStop(0.14, 'rgba(255, 251, 225, 0.85)');
      outerGlow.addColorStop(0.35, sun.midGlowColor);
      outerGlow.addColorStop(1.0, sun.outerGlowColor);

      ctx.fillStyle = outerGlow;
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      return buffer;
    }

    /**
     * Bakes a seamless volumetric cloud layer with sunlit tops and shaded bases.
     */
    _bakeCloudLayer(seed, count, minY, maxY, opacity, scale) {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(seed);
      const { clouds } = this.theme;

      ctx.save();
      ctx.globalAlpha = opacity;

      for (let i = 0; i < count; i++) {
        const clusterX = rand() * LOGICAL_WIDTH;
        const clusterY = minY + rand() * (maxY - minY);
        const clusterWidth = (180 + rand() * 210) * scale;
        const clusterHeight = (46 + rand() * 48) * scale;
        const puffs = 14 + Math.floor(rand() * 10);

        const puffData = [];
        for (let p = 0; p < puffs; p++) {
          const t = (p / (puffs - 1)) * 2 - 1; // -1 to 1 across cloud width
          const domeFactor = Math.sqrt(Math.max(0.1, 1 - t * t));
          const offsetX = t * (clusterWidth * 0.5) + (rand() - 0.5) * 32 * scale;
          const offsetY =
            -domeFactor * clusterHeight * (0.45 + rand() * 0.55) +
            (rand() - 0.5) * 14 * scale;
          const radius = (28 + domeFactor * 44 + rand() * 22) * scale;
          puffData.push({ offsetX, offsetY, radius });
        }

        drawWrappedHorizontal(ctx, clusterX, LOGICAL_WIDTH, 380, (drawX) => {
          // Pass 1: Deep lower underbelly shadow
          for (let p = 0; p < puffData.length; p++) {
            const pf = puffData[p];
            const px = drawX + pf.offsetX;
            const py = clusterY + pf.offsetY * 0.55 + 12 * scale;
            const grad = ctx.createRadialGradient(
              px,
              py,
              pf.radius * 0.1,
              px,
              py,
              pf.radius
            );
            grad.addColorStop(0, clouds.deepShadow);
            grad.addColorStop(0.65, clouds.shadow);
            grad.addColorStop(1, 'rgba(184, 205, 224, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(px, py, pf.radius, 0, TWO_PI);
            ctx.fill();
          }

          // Pass 2: Soft ivory body
          for (let p = 0; p < puffData.length; p++) {
            const pf = puffData[p];
            const px = drawX + pf.offsetX;
            const py = clusterY + pf.offsetY;
            const grad = ctx.createRadialGradient(
              px,
              py - pf.radius * 0.2,
              pf.radius * 0.1,
              px,
              py,
              pf.radius * 0.95
            );
            grad.addColorStop(0, clouds.body);
            grad.addColorStop(0.7, 'rgba(244, 248, 252, 0.85)');
            grad.addColorStop(1, 'rgba(244, 248, 252, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(px, py, pf.radius * 0.95, 0, TWO_PI);
            ctx.fill();
          }

          // Pass 3: Crisp sunlit top rim
          for (let p = 0; p < puffData.length; p++) {
            const pf = puffData[p];
            const px = drawX + pf.offsetX + 5 * scale;
            const py = clusterY + pf.offsetY - pf.radius * 0.24;
            const r = pf.radius * 0.78;
            const grad = ctx.createRadialGradient(px, py, r * 0.05, px, py, r);
            grad.addColorStop(0, clouds.highlight);
            grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.65)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, TWO_PI);
            ctx.fill();
          }
        });
      }

      ctx.restore();
      return buffer;
    }

    /**
     * Bakes a realistic mountain range with directional sunlit/shaded facets and valley mist.
     */
    _bakeMountainLayer(seed, config) {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(seed);

      const {
        baseY,
        harmonics,
        topColor,
        baseColor,
        sunlitColor,
        shadedColor,
        mistColor,
        bottomY,
        ridgeStep
      } = config;

      // Precompute periodic height map
      const heights = new Float32Array(LOGICAL_WIDTH + 1);
      let minPeakY = LOGICAL_HEIGHT;
      for (let x = 0; x <= LOGICAL_WIDTH; x++) {
        const h = evaluatePeriodicCurve(x, LOGICAL_WIDTH, baseY, harmonics);
        heights[x] = h;
        if (h < minPeakY) minPeakY = h;
      }

      // Fill main mountain silhouette
      const bodyGrad = ctx.createLinearGradient(0, minPeakY, 0, bottomY);
      bodyGrad.addColorStop(0, topColor);
      bodyGrad.addColorStop(0.72, baseColor);
      bodyGrad.addColorStop(1, mistColor);

      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(0, bottomY);
      for (let x = 0; x <= LOGICAL_WIDTH; x += 2) {
        ctx.lineTo(x, heights[x]);
      }
      ctx.lineTo(LOGICAL_WIDTH, bottomY);
      ctx.closePath();
      ctx.fill();

      // Clip inside the mountain silhouette to draw geological facets and atmospheric haze
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, bottomY);
      for (let x = 0; x <= LOGICAL_WIDTH; x += 2) {
        ctx.lineTo(x, heights[x]);
      }
      ctx.lineTo(LOGICAL_WIDTH, bottomY);
      ctx.closePath();
      ctx.clip();

      // Draw directional sunlit & shaded ridge facets along peaks
      for (let x = 0; x < LOGICAL_WIDTH; x += ridgeStep) {
        const nextX = (x + ridgeStep) % LOGICAL_WIDTH;
        const prevX = (x - ridgeStep + LOGICAL_WIDTH) % LOGICAL_WIDTH;
        const yCenter = heights[x];
        const yLeft = heights[prevX];
        const yRight = heights[nextX];

        // Local peak or prominent ridge spine
        if (yCenter <= yLeft + 6 || yCenter <= yRight + 6) {
          const ridgeLength = 140 + rand() * 160;
          const spineOffset = (rand() - 0.5) * 28;

          drawWrappedHorizontal(ctx, x, LOGICAL_WIDTH, 220, (drawX) => {
            const spineBottomX = drawX + spineOffset;
            const spineBottomY = yCenter + ridgeLength;

            // Right-facing slope (facing the sun at x=1460 -> sunlit)
            const sunGrad = ctx.createLinearGradient(
              drawX,
              yCenter,
              drawX + ridgeStep * 1.8,
              spineBottomY
            );
            sunGrad.addColorStop(0, sunlitColor);
            sunGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = sunGrad;
            ctx.beginPath();
            ctx.moveTo(drawX, yCenter);
            ctx.lineTo(drawX + ridgeStep * 1.9, yRight + ridgeLength * 0.65);
            ctx.lineTo(spineBottomX, spineBottomY);
            ctx.closePath();
            ctx.fill();

            // Left-facing slope (shaded)
            const shadeGrad = ctx.createLinearGradient(
              drawX,
              yCenter,
              drawX - ridgeStep * 1.8,
              spineBottomY
            );
            shadeGrad.addColorStop(0, shadedColor);
            shadeGrad.addColorStop(1, 'rgba(20, 40, 60, 0)');
            ctx.fillStyle = shadeGrad;
            ctx.beginPath();
            ctx.moveTo(drawX, yCenter);
            ctx.lineTo(drawX - ridgeStep * 1.9, yLeft + ridgeLength * 0.65);
            ctx.lineTo(spineBottomX, spineBottomY);
            ctx.closePath();
            ctx.fill();
          });
        }
      }

      // Soft base atmospheric mist blending mountains into the valley below
      const mistGrad = ctx.createLinearGradient(0, baseY - 20, 0, bottomY);
      mistGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      mistGrad.addColorStop(0.65, mistColor);
      mistGrad.addColorStop(1, mistColor);
      ctx.fillStyle = mistGrad;
      ctx.fillRect(0, baseY - 20, LOGICAL_WIDTH, bottomY - baseY + 20);

      ctx.restore();
      return buffer;
    }

    /**
     * Bakes mid-distance rolling hills covered in dense coniferous & deciduous forests.
     */
    _bakeMidForestHills(seed) {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(seed);
      const { midHills } = this.theme;

      const harmonics = [
        { freq: 1, amp: 42, phase: 1.1 },
        { freq: 2, amp: 28, phase: 3.8 },
        { freq: 3, amp: 18, phase: 0.5 },
        { freq: 5, amp: 10, phase: 2.6 }
      ];
      const baseY = 765;
      const bottomY = 965;

      const heights = new Float32Array(LOGICAL_WIDTH + 1);
      for (let x = 0; x <= LOGICAL_WIDTH; x++) {
        heights[x] = evaluatePeriodicCurve(x, LOGICAL_WIDTH, baseY, harmonics);
      }

      // Draw tree line along the ridge crest first
      for (let x = 0; x < LOGICAL_WIDTH; x += 14) {
        const y = heights[x];
        const treeHeight = 22 + rand() * 26;
        const treeWidth = 12 + rand() * 10;
        const isPine = rand() > 0.35;

        drawWrappedHorizontal(ctx, x, LOGICAL_WIDTH, 60, (drawX) => {
          if (isPine) {
            this._drawConiferTree(
              ctx,
              drawX,
              y + 8,
              treeWidth,
              treeHeight,
              midHills.treeDark,
              midHills.treeMid,
              midHills.treeHighlight
            );
          } else {
            this._drawDeciduousCanopy(
              ctx,
              drawX,
              y + 4,
              treeWidth * 0.9,
              midHills.treeDark,
              midHills.treeMid,
              midHills.treeHighlight
            );
          }
        });
      }

      // Main rolling hill body
      const hillGrad = ctx.createLinearGradient(0, baseY - 60, 0, bottomY);
      hillGrad.addColorStop(0, midHills.hillTop);
      hillGrad.addColorStop(0.55, midHills.hillBase);
      hillGrad.addColorStop(1, '#1d4024');

      ctx.fillStyle = hillGrad;
      ctx.beginPath();
      ctx.moveTo(0, bottomY);
      for (let x = 0; x <= LOGICAL_WIDTH; x += 2) {
        ctx.lineTo(x, heights[x]);
      }
      ctx.lineTo(LOGICAL_WIDTH, bottomY);
      ctx.closePath();
      ctx.fill();

      // Secondary forest tiers scattered across the hillside for lush depth
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, bottomY);
      for (let x = 0; x <= LOGICAL_WIDTH; x += 2) {
        ctx.lineTo(x, heights[x]);
      }
      ctx.lineTo(LOGICAL_WIDTH, bottomY);
      ctx.closePath();
      ctx.clip();

      // Sunlit rolling sub-ridges on the hillside
      for (let band = 0; band < 3; band++) {
        const bandOffset = 32 + band * 38;
        const bandGrad = ctx.createLinearGradient(
          0,
          baseY + bandOffset - 35,
          0,
          baseY + bandOffset + 55
        );
        bandGrad.addColorStop(0, 'rgba(134, 196, 92, 0.25)');
        bandGrad.addColorStop(1, 'rgba(35, 76, 43, 0)');

        ctx.fillStyle = bandGrad;
        ctx.beginPath();
        ctx.moveTo(0, bottomY);
        for (let x = 0; x <= LOGICAL_WIDTH; x += 4) {
          const wave =
            Math.sin((x / LOGICAL_WIDTH) * TWO_PI * (band + 2) + band * 1.7) * 16;
          ctx.lineTo(x, heights[x] + bandOffset + wave);
        }
        ctx.lineTo(LOGICAL_WIDTH, bottomY);
        ctx.closePath();
        ctx.fill();
      }

      // Forest clusters inside the hill body
      const treeCount = 190;
      for (let i = 0; i < treeCount; i++) {
        const tx = rand() * LOGICAL_WIDTH;
        const hillY = heights[Math.floor(tx)];
        const ty = hillY + 14 + rand() * 95;
        const scale = 0.8 + ((ty - hillY) / 110) * 0.55;

        drawWrappedHorizontal(ctx, tx, LOGICAL_WIDTH, 70, (drawX) => {
          if (rand() > 0.4) {
            this._drawConiferTree(
              ctx,
              drawX,
              ty,
              14 * scale,
              28 * scale,
              midHills.treeDark,
              midHills.treeMid,
              midHills.treeHighlight
            );
          } else {
            this._drawDeciduousCanopy(
              ctx,
              drawX,
              ty - 6 * scale,
              13 * scale,
              midHills.treeDark,
              midHills.treeMid,
              midHills.treeHighlight
            );
          }
        });
      }

      // Soft valley mist at the base of the middle hills
      const mistGrad = ctx.createLinearGradient(0, baseY + 55, 0, bottomY);
      mistGrad.addColorStop(0, 'rgba(195, 228, 214, 0)');
      mistGrad.addColorStop(1, midHills.valleyMist);
      ctx.fillStyle = mistGrad;
      ctx.fillRect(0, baseY + 55, LOGICAL_WIDTH, bottomY - baseY);

      ctx.restore();
      return buffer;
    }

    /**
     * Bakes a subtle, seamless cloud-shadow & sun-dapple layer that drifts over the hills.
     */
    _bakeCloudShadowLayer(seed) {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(seed);

      for (let i = 0; i < 7; i++) {
        const sx = rand() * LOGICAL_WIDTH;
        const sy = 760 + rand() * 190;
        const rx = 180 + rand() * 160;
        const ry = 38 + rand() * 32;

        drawWrappedHorizontal(ctx, sx, LOGICAL_WIDTH, 360, (drawX) => {
          ctx.save();
          ctx.translate(drawX, sy);
          ctx.scale(1, ry / rx);
          const grad = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
          grad.addColorStop(0, 'rgba(14, 36, 24, 0.16)');
          grad.addColorStop(0.6, 'rgba(14, 36, 24, 0.07)');
          grad.addColorStop(1, 'rgba(14, 36, 24, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, rx, 0, TWO_PI);
          ctx.fill();
          ctx.restore();
        });
      }

      return buffer;
    }

    /**
     * Bakes the closer lush green hills with sunlit deciduous canopies and bushes.
     */
    _bakeNearWoodlandHills(seed) {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(seed);
      const { nearHills } = this.theme;

      const harmonics = [
        { freq: 1, amp: 36, phase: 4.2 },
        { freq: 2, amp: 24, phase: 1.5 },
        { freq: 3, amp: 14, phase: 2.9 },
        { freq: 6, amp: 6, phase: 0.7 }
      ];
      const baseY = 865;
      const bottomY = 1040;

      const heights = new Float32Array(LOGICAL_WIDTH + 1);
      for (let x = 0; x <= LOGICAL_WIDTH; x++) {
        heights[x] = evaluatePeriodicCurve(x, LOGICAL_WIDTH, baseY, harmonics);
      }

      // Canopy bushes along the crest of the near hills
      for (let x = 0; x < LOGICAL_WIDTH; x += 22) {
        const y = heights[x];
        const radius = 16 + rand() * 16;
        drawWrappedHorizontal(ctx, x, LOGICAL_WIDTH, 80, (drawX) => {
          this._drawDeciduousCanopy(
            ctx,
            drawX,
            y + 2,
            radius,
            nearHills.foliageDark,
            nearHills.foliageMid,
            nearHills.foliageLight
          );
        });
      }

      // Lush hill body gradient
      const hillGrad = ctx.createLinearGradient(0, baseY - 45, 0, bottomY);
      hillGrad.addColorStop(0, nearHills.hillTop);
      hillGrad.addColorStop(0.5, nearHills.foliageMid);
      hillGrad.addColorStop(1, nearHills.hillBase);

      ctx.fillStyle = hillGrad;
      ctx.beginPath();
      ctx.moveTo(0, bottomY);
      for (let x = 0; x <= LOGICAL_WIDTH; x += 2) {
        ctx.lineTo(x, heights[x]);
      }
      ctx.lineTo(LOGICAL_WIDTH, bottomY);
      ctx.closePath();
      ctx.fill();

      // Sunlit rim highlight along the top contour of the near hills
      ctx.save();
      ctx.strokeStyle = 'rgba(184, 226, 107, 0.35)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let x = 0; x <= LOGICAL_WIDTH; x += 2) {
        if (x === 0) ctx.moveTo(x, heights[x] + 2);
        else ctx.lineTo(x, heights[x] + 2);
      }
      ctx.stroke();
      ctx.restore();

      // Layered bushes and woodland clusters across the near hill slope
      const bushCount = 135;
      for (let i = 0; i < bushCount; i++) {
        const bx = rand() * LOGICAL_WIDTH;
        const hillY = heights[Math.floor(bx)];
        const by = hillY + 12 + rand() * 75;
        const radius = 14 + rand() * 18;

        drawWrappedHorizontal(ctx, bx, LOGICAL_WIDTH, 90, (drawX) => {
          this._drawDeciduousCanopy(
            ctx,
            drawX,
            by,
            radius,
            nearHills.foliageDark,
            nearHills.foliageMid,
            nearHills.foliageLight
          );
        });
      }

      return buffer;
    }

    /**
     * Bakes the foreground meadow with multi-layered grass blades and subtle wildflowers.
     */
    _bakeForegroundMeadow(seed) {
      const buffer = createOffscreenBuffer(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const ctx = buffer.getContext('2d');
      const rand = createSeededRandom(seed);
      const { foreground } = this.theme;

      const harmonics = [
        { freq: 1, amp: 14, phase: 0.8 },
        { freq: 2, amp: 10, phase: 2.7 },
        { freq: 4, amp: 6, phase: 1.2 },
        { freq: 7, amp: 3, phase: 4.5 }
      ];
      const baseY = 982;

      const heights = new Float32Array(LOGICAL_WIDTH + 1);
      for (let x = 0; x <= LOGICAL_WIDTH; x++) {
        heights[x] = evaluatePeriodicCurve(x, LOGICAL_WIDTH, baseY, harmonics);
      }

      // Pass 1: Back-row dark grass blades rising above the meadow contour
      this._drawGrassBladePass(ctx, rand, heights, {
        count: 1300,
        minHeight: 24,
        maxHeight: 52,
        minWidth: 3.2,
        maxWidth: 5.5,
        yOffsetMin: -4,
        yOffsetMax: 18,
        baseColor: foreground.grassDark,
        tipColor: foreground.grassMid
      });

      // Solid foreground meadow ground fill
      const groundGrad = ctx.createLinearGradient(0, baseY - 20, 0, LOGICAL_HEIGHT);
      groundGrad.addColorStop(0, foreground.meadowTop);
      groundGrad.addColorStop(0.45, foreground.meadowBase);
      groundGrad.addColorStop(1, foreground.soilDark);

      ctx.fillStyle = groundGrad;
      ctx.beginPath();
      ctx.moveTo(0, LOGICAL_HEIGHT);
      for (let x = 0; x <= LOGICAL_WIDTH; x += 2) {
        ctx.lineTo(x, heights[x]);
      }
      ctx.lineTo(LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.closePath();
      ctx.fill();

      // Pass 2: Mid-tone lush grass blades across the meadow
      this._drawGrassBladePass(ctx, rand, heights, {
        count: 1600,
        minHeight: 22,
        maxHeight: 56,
        minWidth: 2.8,
        maxWidth: 5.0,
        yOffsetMin: 0,
        yOffsetMax: 85,
        baseColor: foreground.grassDark,
        tipColor: foreground.grassLight
      });

      // Pass 3: Sunlit foreground grass blades with golden-green tips
      this._drawGrassBladePass(ctx, rand, heights, {
        count: 950,
        minHeight: 26,
        maxHeight: 62,
        minWidth: 2.4,
        maxWidth: 4.4,
        yOffsetMin: 2,
        yOffsetMax: 95,
        baseColor: foreground.grassMid,
        tipColor: foreground.grassTip
      });

      // Pass 4: Subtle natural wildflowers & clover highlights
      const flowerCount = 85;
      for (let i = 0; i < flowerCount; i++) {
        const fx = rand() * LOGICAL_WIDTH;
        const groundY = heights[Math.floor(fx)];
        const fy = groundY - 6 + rand() * 58;
        const radius = 2.2 + rand() * 2.6;
        const isYellow = rand() > 0.45;

        drawWrappedHorizontal(ctx, fx, LOGICAL_WIDTH, 20, (drawX) => {
          ctx.fillStyle = isYellow ? foreground.flowerYellow : foreground.flowerWhite;
          ctx.beginPath();
          ctx.arc(drawX, fy, radius, 0, TWO_PI);
          ctx.fill();
        });
      }

      return buffer;
    }

    /**
     * Helper to draw a single layered conifer/pine spire with sunlit right side and shaded left side.
     */
    _drawConiferTree(ctx, x, baseY, width, height, darkColor, midColor, lightColor) {
      const topY = baseY - height;

      // Shaded left half
      ctx.fillStyle = darkColor;
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x - width * 0.55, baseY);
      ctx.lineTo(x, baseY - 2);
      ctx.closePath();
      ctx.fill();

      // Sunlit right half
      const sunGrad = ctx.createLinearGradient(x, topY, x + width * 0.55, baseY);
      sunGrad.addColorStop(0, lightColor);
      sunGrad.addColorStop(0.65, midColor);
      sunGrad.addColorStop(1, darkColor);

      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x + width * 0.55, baseY);
      ctx.lineTo(x, baseY - 2);
      ctx.closePath();
      ctx.fill();
    }

    /**
     * Helper to draw a soft, rounded deciduous tree/bush canopy cluster with top-right sunlight.
     */
    _drawDeciduousCanopy(ctx, x, y, radius, darkColor, midColor, lightColor) {
      // Base shadow puff
      ctx.fillStyle = darkColor;
      ctx.beginPath();
      ctx.arc(x - radius * 0.22, y + radius * 0.18, radius * 0.88, 0, TWO_PI);
      ctx.arc(x + radius * 0.25, y + radius * 0.2, radius * 0.82, 0, TWO_PI);
      ctx.fill();

      // Main mid-tone foliage
      ctx.fillStyle = midColor;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.92, 0, TWO_PI);
      ctx.arc(x - radius * 0.35, y + radius * 0.08, radius * 0.72, 0, TWO_PI);
      ctx.arc(x + radius * 0.35, y + radius * 0.06, radius * 0.76, 0, TWO_PI);
      ctx.fill();

      // Sunlit upper-right crown highlight
      const highlightGrad = ctx.createRadialGradient(
        x + radius * 0.22,
        y - radius * 0.28,
        radius * 0.08,
        x + radius * 0.1,
        y - radius * 0.1,
        radius * 0.85
      );
      highlightGrad.addColorStop(0, lightColor);
      highlightGrad.addColorStop(0.65, midColor);
      highlightGrad.addColorStop(1, 'rgba(51, 112, 44, 0)');

      ctx.fillStyle = highlightGrad;
      ctx.beginPath();
      ctx.arc(x + radius * 0.12, y - radius * 0.12, radius * 0.82, 0, TWO_PI);
      ctx.fill();
    }

    /**
     * Helper to draw a batch of curved procedural grass blades.
     */
    _drawGrassBladePass(ctx, rand, heights, opts) {
      const {
        count,
        minHeight,
        maxHeight,
        minWidth,
        maxWidth,
        yOffsetMin,
        yOffsetMax,
        baseColor,
        tipColor
      } = opts;

      const grassGrad = ctx.createLinearGradient(
        0,
        LOGICAL_HEIGHT - 150,
        0,
        LOGICAL_HEIGHT
      );
      grassGrad.addColorStop(0, tipColor);
      grassGrad.addColorStop(1, baseColor);
      ctx.fillStyle = grassGrad;

      for (let i = 0; i < count; i++) {
        const gx = rand() * LOGICAL_WIDTH;
        const contourY = heights[Math.floor(gx)];
        const gy = contourY + yOffsetMin + rand() * (yOffsetMax - yOffsetMin);
        const bladeHeight = minHeight + rand() * (maxHeight - minHeight);
        const halfWidth = (minWidth + rand() * (maxWidth - minWidth)) * 0.5;
        const bend = (rand() - 0.38) * 22; // Slight natural breeze lean

        drawWrappedHorizontal(ctx, gx, LOGICAL_WIDTH, 40, (drawX) => {
          ctx.beginPath();
          ctx.moveTo(drawX - halfWidth, gy);
          ctx.quadraticCurveTo(
            drawX + bend * 0.45,
            gy - bladeHeight * 0.55,
            drawX + bend,
            gy - bladeHeight
          );
          ctx.quadraticCurveTo(
            drawX + halfWidth + bend * 0.35,
            gy - bladeHeight * 0.5,
            drawX + halfWidth,
            gy
          );
          ctx.closePath();
          ctx.fill();
        });
      }
    }

    /**
     * Handles responsive 16:9 canvas sizing and careful devicePixelRatio scaling.
     */
    resize() {
      if (!this.canvas) return;

      const rect = this.canvas.getBoundingClientRect();
      const displayWidth = Math.max(1, Math.round(rect.width));
      const displayHeight = Math.max(1, Math.round(rect.height));

      // Cap devicePixelRatio on mobile/small viewports to prevent excessive GPU load
      const rawDpr = window.devicePixelRatio || 1;
      const isMobileViewport = Math.max(window.innerWidth, window.innerHeight) <= 960;
      const effectiveDpr = Math.min(rawDpr, isMobileViewport ? 1.5 : 2.0);

      // Clamp maximum physical buffer dimensions to 1920x1080
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

      this.renderScale = this.canvas.width / LOGICAL_WIDTH;
      this.renderFrame();
    }

    /**
     * Advances layer scroll positions from right to left.
     */
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

    /**
     * Renders the composite parallax scene onto the main canvas.
     */
    renderFrame() {
      const ctx = this.ctx;
      if (!ctx || !this.staticSkyBuffer) return;

      ctx.save();
      ctx.scale(this.renderScale, this.canvas.height / LOGICAL_HEIGHT);

      // 1. Draw static sky and sun layer
      ctx.drawImage(this.staticSkyBuffer, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      // 2. Draw scrolling parallax layers from back to front (right-to-left scrolling)
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

      // Clamp delta time to 50ms max to prevent jumps after tab switches
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

    // =========================================================================
    // Public Integration API Methods
    // =========================================================================

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

    /**
     * Sets the scrolling speed multiplier.
     * - 1.0 = normal arcade scrolling speed (240 logical px/s in foreground)
     * - 0.0 = paused scrolling
     * - 2.0 = double speed
     */
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

    /**
     * Merges custom theme colors into the active theme and rebakes the offscreen layers.
     */
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

  // Initialize when DOM is ready and expose clean global integration hooks
  function initBackgroundEngine() {
    const canvas = document.getElementById('nature-background-canvas');
    if (!canvas) return;

    const instance = new NatureParallaxBackground(canvas);

    // Structured controller object
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

    // Direct global helper functions for effortless integration
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
