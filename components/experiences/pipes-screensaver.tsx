'use client';

import { gsap } from 'gsap';
import { Component, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode, type RefObject } from 'react';
import type * as THREEType from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { BuiltWith } from '@/components/v2/experience-frame';

/*
 * 3D Pipes: the screensaver, rebuilt.
 *  - a grid occupancy array and a random walk that turns 30% of the time
 *  - segments are one InstancedMesh of cylinders, joints one InstancedMesh of spheres (2 draw calls)
 *  - classic: Phong; neon: a fresnel emissive shader, mix(core, edge, pow(1 - N·V, p)), plus Bloom
 *  - retro: the canvas renders at ~640x480 and is upscaled nearest-neighbour, then a custom Effect
 *    quantises to a 16-colour palette through a Bayer 4x4
 *  - god-rays sweep in on each new round; a full grid dissolves in block noise (GSAP) and restarts
 *
 * First paint: three + postprocessing are a large download, so they are imported dynamically. Until
 * the WebGL scene has drawn its first frames, a Canvas2D renderer draws the very same grower state
 * (same camera, same 16-colour Bayer pass, same rays and dissolve), then hands over without a restart.
 * The poster is server-rendered SVG of the same deterministic round: it grows pipes with CSS before
 * hydration; under reduced motion the dithered Canvas2D still takes over once the stage is measured
 * (no WebGL download).
 */

const TOOLS = ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'gsap'];
const MAX_SEG = 520;
const MAX_JOINT = 360;
const SEG_TIME = 0.055;
/** block-noise dissolve cell, in render pixels (~26 CSS px at a 1280-wide stage) */
const DISSOLVE_BLOCK = 16;
// a long lens, a fixed camera: Z runs foreshorten to stubs instead of reading as diagonals
const FOV = 18;
const PALETTE = ['#ff2e00', '#ff00a8', '#7b2cff', '#00b3ff', '#00e676', '#ffe600'];
const PAL16_HEX = ['#000000', '#404040', '#808080', '#c0c0c0', '#ffffff', ...PALETTE, '#801700', '#3d167f', '#005980', '#007339', '#807300'];
const DIRS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Vec3 = [number, number, number];
type Seg = { from: Vec3; dir: number; color: number };
type Joint = { at: Vec3; color: number };
type Head = { p: Vec3; dir: number; color: number; len: number; max: number };

/* Random-walk grower over an occupancy grid. */
class Grower {
  dims: Vec3;
  occ: Uint8Array;
  rng: () => number;
  segs: Seg[] = [];
  joints: Joint[] = [];
  heads: Head[] = [];
  pipes = 0;
  full = false;
  constructor(dims: Vec3, seed: number) {
    this.dims = dims;
    this.occ = new Uint8Array(dims[0] * dims[1] * dims[2]);
    this.rng = mulberry(seed);
  }
  idx(p: Vec3) {
    return p[0] + this.dims[0] * (p[1] + this.dims[1] * p[2]);
  }
  free(p: Vec3) {
    return p.every((v, i) => v >= 0 && v < this.dims[i]) && !this.occ[this.idx(p)];
  }
  addPipe() {
    for (let t = 0; t < 60; t++) {
      const p = [0, 1, 2].map((i) => Math.floor(this.rng() * this.dims[i])) as Vec3;
      if (!this.free(p)) continue;
      this.occ[this.idx(p)] = 1;
      const color = this.pipes++ % PALETTE.length;
      this.heads.push({ p, dir: Math.floor(this.rng() * 6), color, len: 0, max: 35 + Math.floor(this.rng() * 70) });
      this.pushJoint(p, color);
      return true;
    }
    this.full = true;
    return false;
  }
  pushJoint(at: Vec3, color: number) {
    if (this.joints.length < MAX_JOINT) this.joints.push({ at: [...at], color });
  }
  /** One tick: every head grows one segment. Returns false when the round is over. */
  step() {
    if (this.heads.length === 0 && !this.addPipe()) return false;
    for (let h = this.heads.length - 1; h >= 0; h--) {
      const head = this.heads[h];
      const next = (d: number) => head.p.map((v, i) => v + DIRS[d][i]) as Vec3;
      const options = [0, 1, 2, 3, 4, 5].filter((d) => this.free(next(d)));
      if (options.length === 0 || head.len >= head.max || this.segs.length >= MAX_SEG) {
        this.pushJoint(head.p, head.color);
        this.heads.splice(h, 1);
        continue;
      }
      let dir = head.dir;
      if (!options.includes(dir) || this.rng() < 0.3) {
        const turns = options.filter((d) => d !== head.dir);
        dir = turns.length ? turns[Math.floor(this.rng() * turns.length)] : options[0];
        this.pushJoint(head.p, head.color);
      }
      this.segs.push({ from: [...head.p], dir, color: head.color });
      head.p = next(dir);
      head.dir = dir;
      head.len++;
      this.occ[this.idx(head.p)] = 1;
    }
    if (this.heads.length === 0) {
      if (this.pipes >= 12 || this.segs.length >= MAX_SEG * 0.9) return false;
      this.addPipe();
    }
    return this.segs.length < MAX_SEG;
  }
}

/* ---------- shared controller: one grower, ticked by whichever renderer is live ---------- */

type Ctl = {
  grower: Grower;
  seed: number;
  round: number;
  acc: number;
  time: number;
  /** segments with index >= freshFrom are still extruding, by `grow` */
  freshFrom: number;
  grow: number;
  resetting: boolean;
  rays: number;
  dissolve: number;
  /** the WebGL scene has taken over ticking */
  threeLive: boolean;
  mode: 'none' | 'live' | 'still';
};

function newRound(ctl: Ctl, seed: number, dims: Vec3) {
  ctl.grower = new Grower(dims, seed);
  ctl.seed = seed;
  ctl.round++;
  ctl.acc = 0;
  ctl.freshFrom = 0;
  ctl.grow = 0.12;
  ctl.grower.addPipe();
}

function tick(ctl: Ctl, dt: number) {
  const step = Math.min(dt, 0.05);
  ctl.time += step;
  if (ctl.resetting) return;
  ctl.acc += step;
  const g = ctl.grower;
  let alive = true;
  while (ctl.acc >= SEG_TIME && alive) {
    ctl.acc -= SEG_TIME;
    ctl.freshFrom = g.segs.length;
    alive = g.step();
  }
  const k = Math.min(1, ctl.acc / SEG_TIME);
  ctl.grow = 0.12 + 0.88 * k * k; // slight ease-in on each extrusion
  if (!alive) {
    ctl.grow = 1;
    ctl.resetting = true;
    gsap
      .timeline({ delay: 1.2 })
      .to(ctl, { dissolve: 1.1, duration: 1.8, ease: 'steps(18)' })
      .add(() => {
        newRound(ctl, ctl.seed + 1, g.dims);
        ctl.dissolve = 0;
        ctl.rays = 1;
        ctl.resetting = false;
      })
      .to(ctl, { rays: 0, duration: 2.4, ease: 'power2.inOut' });
  }
}

/** Camera distance that fits the grid, shared by both renderers. */
function fitDist(dims: Vec3, aspect: number) {
  const t = Math.tan((FOV * Math.PI) / 360);
  return Math.max((dims[1] * 1.05) / 2 / t, (dims[0] * 1.05) / 2 / (t * aspect)) + dims[2] / 2;
}

/* ---------- Canvas2D renderer: the instant first paint ---------- */

const PAL_RGB = PALETTE.map(hexRgb);
const PAL16_RGB = PAL16_HEX.map(hexRgb);
const LUTS: (Uint8Array | null)[] = [null, null];
/** Nearest-of-16 lookup; the neon table leaves out the three greys, as the WebGL pass does. */
function lut(neon: boolean) {
  const hit = LUTS[neon ? 1 : 0];
  if (hit) return hit;
  const LUT = (LUTS[neon ? 1 : 0] = new Uint8Array(32 * 32 * 32));
  for (let r = 0; r < 32; r++)
    for (let g = 0; g < 32; g++)
      for (let b = 0; b < 32; b++) {
        let best = 0;
        let bd = 1e9;
        for (let i = 0; i < 16; i++) {
          if (neon && i > 0 && i < 4) continue;
          const [pr, pg, pb] = PAL16_RGB[i];
          const dr = (r / 31) * 255 - pr;
          const dg = (g / 31) * 255 - pg;
          const db = (b / 31) * 255 - pb;
          const d = dr * dr + dg * dg + db * db;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        LUT[(r << 10) | (g << 5) | b] = best;
      }
  return LUT;
}
const bayer2 = (x: number, y: number) => {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const v = fx * 0.5 + fy * fy * 0.75;
  return v - Math.floor(v);
};
const BAYER = Array.from({ length: 16 }, (_, i) => {
  const x = i & 3;
  const y = i >> 2;
  return bayer2(x * 0.5, y * 0.5) * 0.25 + bayer2(x, y) - 0.5;
});
const hash = (x: number, y: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const LIN = Array.from({ length: 256 }, (_, i) => Math.pow(i / 255, 2.2));

const rgb = (c: number[], k: number, add = 0) =>
  `rgb(${Math.min(255, c[0] * k + add) | 0},${Math.min(255, c[1] * k + add) | 0},${Math.min(255, c[2] * k + add) | 0})`;
const toWhite = (c: number[], t: number) => `rgb(${(c[0] + (255 - c[0]) * t) | 0},${(c[1] + (255 - c[1]) * t) | 0},${(c[2] + (255 - c[2]) * t) | 0})`;

type Item = { depth: number; kind: 0 | 1; idx: number; ax: number; ay: number; bx: number; by: number; r: number; color: number };

// where the Phong highlight lands on screen in the WebGL scene: the upper-left edge
const Lx = -0.45;
const Ly = -0.89;

/** Project the grower with the WebGL camera (fov 18, fitted distance, no sway) and depth-sort it. */
function buildItems(g: Grower, freshFrom: number, grow: number, W: number, H: number, aspect: number, time: number) {
  const f = H / 2 / Math.tan((FOV * Math.PI) / 360);
  const dist = fitDist(g.dims, aspect);
  void time;
  const off = g.dims.map((d) => (d - 1) / 2);
  const proj = (x: number, y: number, z: number) => {
    const depth = dist - z;
    return [W / 2 + (x * f) / depth, H / 2 - (y * f) / depth, depth];
  };
  const items: Item[] = [];
  for (let i = 0; i < g.segs.length; i++) {
    const s = g.segs[i];
    const len = i >= freshFrom ? grow : 1;
    const d = DIRS[s.dir];
    const x = s.from[0] - off[0];
    const y = s.from[1] - off[1];
    const z = s.from[2] - off[2];
    const [ax, ay, da] = proj(x, y, z);
    const [bx, by, db] = proj(x + d[0] * len, y + d[1] * len, z + d[2] * len);
    const depth = (da + db) / 2;
    items.push({ depth, kind: 0, idx: i, ax, ay, bx, by, r: (0.17 * f) / depth, color: s.color });
  }
  g.joints.forEach((j, i) => {
    const [ax, ay, depth] = proj(j.at[0] - off[0], j.at[1] - off[1], j.at[2] - off[2]);
    items.push({ depth, kind: 1, idx: i, ax, ay, bx: ax, by: ay, r: (0.25 * f) / depth, color: j.color });
  });
  items.sort((a, b) => b.depth - a.depth);
  return items;
}

/** A neon light tube in Canvas2D: dark-hue rim, saturated body, white-hot core, dimmer with depth. */
function drawNeon2d(ctx: CanvasRenderingContext2D, it: Item, c: number[], dk: number) {
  const hot = 0.8 * (1 - dk);
  const k = 1.1 - dk * 0.78;
  const rim = rgb(c, 0.42 * k);
  const body = rgb(c, Math.min(1, k));
  const core = toWhite(
    c.map((v) => v * Math.min(1, k)),
    hot,
  );
  const dx = it.bx - it.ax;
  const dy = it.by - it.ay;
  const L = Math.hypot(dx, dy);
  if (it.kind === 1 || L < 0.75) {
    const r = (it.kind === 1 ? it.r : it.r * 1.02) * (it.kind === 1 ? 0.46 : 0.5);
    const gr = ctx.createRadialGradient(it.ax, it.ay, 0, it.ax, it.ay, r);
    gr.addColorStop(0, core);
    gr.addColorStop(0.45, body);
    gr.addColorStop(0.8, body);
    gr.addColorStop(1, rim);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(it.ax, it.ay, r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const r = it.r * 0.5;
  const nx = -dy / L;
  const ny = dx / L;
  const mx = (it.ax + it.bx) / 2;
  const my = (it.ay + it.by) / 2;
  const gr = ctx.createLinearGradient(mx - nx * r, my - ny * r, mx + nx * r, my + ny * r);
  gr.addColorStop(0, rim);
  gr.addColorStop(0.18, body);
  gr.addColorStop(0.36, body);
  gr.addColorStop(0.5, core);
  gr.addColorStop(0.64, body);
  gr.addColorStop(0.82, body);
  gr.addColorStop(1, rim);
  ctx.strokeStyle = gr;
  ctx.lineWidth = r * 2;
  ctx.beginPath();
  ctx.moveTo(it.ax, it.ay);
  ctx.lineTo(it.bx, it.by);
  ctx.stroke();
}

function draw2d(ctx: CanvasRenderingContext2D, ctl: Ctl, W: number, H: number, neon: boolean) {
  const aspect = W / H;
  const items = buildItems(ctl.grower, ctl.freshFrom, ctl.grow, W, H, aspect, ctl.time);
  const dist = fitDist(ctl.grower.dims, aspect);
  const halfZ = ctl.grower.dims[2] / 2;
  const depthK = (d: number) => Math.min(1, Math.max(0, (d - dist + halfZ) / (2 * halfZ)));

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round';
  for (const it of items) {
    const c = PAL_RGB[it.color];
    if (neon) {
      drawNeon2d(ctx, it, c, depthK(it.depth));
      continue;
    }
    const dx = it.bx - it.ax;
    const dy = it.by - it.ay;
    const L = Math.hypot(dx, dy);
    if (it.kind === 1 || L < 0.75) {
      const r = it.kind === 1 ? it.r : it.r * 1.02;
      const gr = ctx.createRadialGradient(it.ax + Lx * r * 0.4, it.ay + Ly * r * 0.4, 0, it.ax, it.ay, r);
      gr.addColorStop(0, toWhite(c, 0.7));
      gr.addColorStop(0.3, rgb(c, 1));
      gr.addColorStop(1, rgb(c, 0.22));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(it.ax, it.ay, r, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    let nx = -dy / L;
    let ny = dx / L;
    if (nx * Lx + ny * Ly < 0) {
      nx = -nx;
      ny = -ny;
    }
    const mx = (it.ax + it.bx) / 2;
    const my = (it.ay + it.by) / 2;
    const gr = ctx.createLinearGradient(mx - nx * it.r, my - ny * it.r, mx + nx * it.r, my + ny * it.r);
    gr.addColorStop(0, rgb(c, 0.3));
    gr.addColorStop(0.3, rgb(c, 0.62));
    gr.addColorStop(0.55, rgb(c, 1));
    gr.addColorStop(0.78, toWhite(c, 0.85));
    gr.addColorStop(0.9, rgb(c, 1));
    gr.addColorStop(1, rgb(c, 0.75));
    ctx.strokeStyle = gr;
    ctx.lineWidth = it.r * 2;
    ctx.beginPath();
    ctx.moveTo(it.ax, it.ay);
    ctx.lineTo(it.bx, it.by);
    ctx.stroke();
  }
  if (neon) {
    // cheap bloom stand-in: a tight additive halo in the tube's own hue
    ctx.globalCompositeOperation = 'lighter';
    for (const it of items) {
      const c = PAL_RGB[it.color];
      const k = 1 - depthK(it.depth) * 0.7;
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.22 * k).toFixed(3)})`;
      ctx.lineWidth = it.r * 2.6;
      ctx.beginPath();
      ctx.moveTo(it.ax, it.ay);
      ctx.lineTo(it.bx + 0.01, it.by);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // retro pass: rays (added in linear light), Bayer 4x4, nearest of 16 colours, block dissolve
  const img = ctx.getImageData(0, 0, W, H);
  const px = img.data;
  const table = lut(neon);
  const rayTable = lut(false);
  const rays = ctl.rays;
  const dissolve = ctl.dissolve;
  const T = ctl.time;
  for (let y = 0; y < H; y++) {
    const py = H - 1 - y;
    const uy = (py + 0.5) / H;
    const brow = (py & 3) << 2;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      let r = px[o] / 255;
      let gg = px[o + 1] / 255;
      let b = px[o + 2] / 255;
      let tbl = table;
      if (rays > 0.002) {
        const ddx = ((x + 0.5) / W - 0.32) * aspect;
        const ddy = uy - 1.12;
        const a = Math.atan2(ddx, -ddy);
        let ray =
          Math.pow(Math.max(Math.cos(a * 11 + T * 0.5), 0), 6) * 0.55 + Math.pow(Math.max(Math.cos(a * 5 - T * 0.35 + 1.3), 0), 12) * 0.6;
        const t = Math.min(1, Math.max(0, (Math.hypot(ddx, ddy) - 1.7) / (0.1 - 1.7)));
        ray *= t * t * (3 - 2 * t) * rays * 0.55;
        if (ray > 0.02) tbl = rayTable;
        if (ray > 0.0005) {
          r = Math.pow(LIN[px[o]] + ray, 1 / 2.2);
          gg = Math.pow(LIN[px[o + 1]] + ray, 1 / 2.2);
          b = Math.pow(LIN[px[o + 2]] + ray, 1 / 2.2);
        }
      }
      const dth = BAYER[brow | (x & 3)] * 0.16;
      const qr = Math.round(Math.min(1, Math.max(0, r + dth)) * 31);
      const qg = Math.round(Math.min(1, Math.max(0, gg + dth)) * 31);
      const qb = Math.round(Math.min(1, Math.max(0, b + dth)) * 31);
      let pc = PAL16_RGB[tbl[(qr << 10) | (qg << 5) | qb]];
      if (dissolve > 0) {
        const hb = hash(Math.floor(x / DISSOLVE_BLOCK), Math.floor(py / DISSOLVE_BLOCK));
        if (hb < dissolve) pc = PAL16_RGB[0];
        else if (hb < dissolve + 0.09) pc = PAL16_RGB[4];
      }
      px[o] = pc[0];
      px[o + 1] = pc[1];
      px[o + 2] = pc[2];
      px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* ---------- SSR poster: painted with the HTML, before any script has run ---------- */

const STILL_SEED = 11;
const STILL_SEGS = 300;
const DIMS_LAND: Vec3 = [13, 9, 8];
const DIMS_PORT: Vec3 = [7, 13, 6];

type PosterEl = { k: 's' | 'j'; c: number; m: string; t: number };
const posterCache = new Map<string, { vb: string; els: PosterEl[] }>();
const n1 = (v: number) => Math.round(v * 10) / 10;

/**
 * The deterministic round (seed 11) projected exactly as the renderers do, as SVG <use> elements that
 * each appear at the tick they grow on. CSS reveals them in order, so the pipes grow before hydration;
 * under reduced motion they all show at once, which is the same pre-grown still the canvas draws.
 */
function poster(dims: Vec3) {
  const key = dims.join();
  const hit = posterCache.get(key);
  if (hit) return hit;
  const g = new Grower(dims, STILL_SEED);
  g.addPipe();
  const segStep: number[] = [];
  const jointStep: number[] = g.joints.map(() => 0);
  let step = 0;
  while (g.segs.length < STILL_SEGS) {
    step++;
    const alive = g.step();
    while (segStep.length < g.segs.length) segStep.push(step);
    while (jointStep.length < g.joints.length) jointStep.push(step);
    if (!alive) break;
  }
  const H = 480;
  const items = buildItems(g, g.segs.length, 1, 0, H, 4, 0);
  let half = 1;
  const els: PosterEl[] = [];
  for (const it of items) {
    half = Math.max(half, Math.abs(it.ax) + it.r, Math.abs(it.bx) + it.r);
    const t = n1((it.kind === 0 ? segStep[it.idx] : jointStep[it.idx]) * SEG_TIME * 100) / 100;
    const dx = it.bx - it.ax;
    const dy = it.by - it.ay;
    const L = Math.hypot(dx, dy);
    if (it.kind === 1 || L < 0.75) {
      const r = n1(it.kind === 1 ? it.r : it.r * 1.02);
      els.push({ k: 'j', c: it.color, m: `${r} 0 0 ${r} ${n1(it.ax)} ${n1(it.ay)}`, t });
      continue;
    }
    let nx = -dy / L;
    let ny = dx / L;
    if (nx * Lx + ny * Ly < 0) {
      nx = -nx;
      ny = -ny;
    }
    els.push({ k: 's', c: it.color, m: [dx, dy, nx * 2 * it.r, ny * 2 * it.r, it.ax, it.ay].map(n1).join(' '), t });
  }
  half = Math.ceil(half + 2);
  const out = { vb: `${-half} 0 ${half * 2} ${H}`, els };
  posterCache.set(key, out);
  return out;
}

const POSTER_CSS = `
.pp-poster{position:absolute;inset:0;background:#000;animation:pp-clock 1000s linear}
.pp-poster svg{position:absolute;inset:0;width:100%;height:100%}
.pp-land{display:block}.pp-port{display:none}
@container (max-aspect-ratio: 9/10){.pp-land{display:none}.pp-port{display:block}}
.pp-g{opacity:0;animation:pp-in 1ms steps(1) forwards}
.pp-rays{position:absolute;inset:0;background:repeating-conic-gradient(from 180deg at 32% -12%,#8c8c8c 0deg 2.5deg,transparent 5deg 32.7deg);-webkit-mask-image:radial-gradient(circle at 32% -12%,#000 25%,transparent 90%);mask-image:radial-gradient(circle at 32% -12%,#000 25%,transparent 90%);animation:pp-rays 2.6s steps(10) .4s both}
@keyframes pp-in{to{opacity:1}}
@keyframes pp-clock{from{opacity:1}to{opacity:1}}
@keyframes pp-rays{from{opacity:.6}to{opacity:0}}
.pp-still .pp-g{opacity:1;animation:none}.pp-still .pp-rays{display:none}
@media (prefers-reduced-motion: reduce){.pp-g{opacity:1;animation:none}.pp-rays{display:none}}
`;

function PosterSvg({ dims, uid, className }: { dims: Vec3; uid: string; className: string }) {
  const p = poster(dims);
  return (
    <svg className={className} viewBox={p.vb} preserveAspectRatio="xMidYMid meet" shapeRendering="crispEdges" aria-hidden>
      {p.els.map((e, i) => (
        <use
          key={i}
          href={`#${uid}${e.k}${e.c}`}
          transform={`matrix(${e.m})`}
          className="pp-g"
          style={e.t ? { animationDelay: `${e.t}s` } : undefined}
        />
      ))}
    </svg>
  );
}

function Poster({ uid, posterRef, still }: { uid: string; posterRef: RefObject<HTMLDivElement | null>; still: boolean }) {
  return (
    <div ref={posterRef} className={still ? 'pp-poster pp-still' : 'pp-poster'} aria-hidden>
      <style dangerouslySetInnerHTML={{ __html: POSTER_CSS }} />
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          {PAL_RGB.map((c, i) => (
            <linearGradient key={`g${i}`} id={`${uid}g${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={rgb(c, 0.3)} />
              <stop offset="0.3" stopColor={rgb(c, 0.62)} />
              <stop offset="0.55" stopColor={rgb(c, 1)} />
              <stop offset="0.78" stopColor={toWhite(c, 0.85)} />
              <stop offset="0.9" stopColor={rgb(c, 1)} />
              <stop offset="1" stopColor={rgb(c, 0.75)} />
            </linearGradient>
          ))}
          {PAL_RGB.map((c, i) => (
            <radialGradient key={`r${i}`} id={`${uid}r${i}`} cx="0.5" cy="0.5" r="0.5" fx={0.5 + Lx * 0.2} fy={0.5 + Ly * 0.2}>
              <stop offset="0" stopColor={toWhite(c, 0.7)} />
              <stop offset="0.3" stopColor={rgb(c, 1)} />
              <stop offset="1" stopColor={rgb(c, 0.22)} />
            </radialGradient>
          ))}
          {PAL_RGB.map((_, i) => (
            <rect key={`s${i}`} id={`${uid}s${i}`} x="-0.04" y="-0.5" width="1.08" height="1" fill={`url(#${uid}g${i})`} />
          ))}
          {PAL_RGB.map((_, i) => (
            <circle key={`j${i}`} id={`${uid}j${i}`} r="1" fill={`url(#${uid}r${i})`} />
          ))}
        </defs>
      </svg>
      <PosterSvg dims={DIMS_LAND} uid={uid} className="pp-land" />
      <PosterSvg dims={DIMS_PORT} uid={uid} className="pp-port" />
      <div className="pp-rays" />
    </div>
  );
}

/** How long the poster has been growing, read from its CSS clock animation (seconds). */
function posterElapsed(el: HTMLDivElement | null) {
  const a = el?.getAnimations?.().find((x) => (x as CSSAnimation).animationName === 'pp-clock');
  const t = Number(a?.currentTime ?? 0);
  return Number.isFinite(t) ? t / 1000 : 0;
}

/* ---------- WebGL renderer, loaded on demand ---------- */

type Mods = {
  THREE: typeof import('three');
  fiber: typeof import('@react-three/fiber');
  rpp: typeof import('@react-three/postprocessing');
  pp: typeof import('postprocessing');
};

const neonVert = /* glsl */ `
uniform vec3 uShrink;
varying vec3 vN;
varying vec3 vV;
varying vec3 vC;
varying float vDepth;
void main() {
  // light tubes are thinner than the glossy pipes: shrink the radius in local space
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position * uShrink, 1.0);
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vV = normalize(-mv.xyz);
  vDepth = -mv.z;
  #ifdef USE_INSTANCING_COLOR
    vC = instanceColor;
  #else
    vC = vec3(1.0);
  #endif
  gl_Position = projectionMatrix * mv;
}`;
const neonFrag = /* glsl */ `
uniform vec2 uDepth;
varying vec3 vN;
varying vec3 vV;
varying vec3 vC;
varying float vDepth;
void main() {
  float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 1.0);
  // depth cue: near tubes burn white-hot, far ones sink to their dark hue
  float dk = clamp((vDepth - uDepth.x) / (uDepth.y - uDepth.x), 0.0, 1.0);
  // mix(core, edge, pow(1 - N.V, p)), with the three stops on different palette entries:
  // white-hot core, saturated hue, dark-hue rim (linear values; the retro pass works in sRGB)
  vec3 core = mix(vC, vec3(1.0), 0.8 * (1.0 - dk));
  vec3 edge = vC;
  vec3 rim = vC * 0.16;
  vec3 col = mix(core, edge, smoothstep(0.02, 0.16, f));
  col = mix(col, rim, smoothstep(0.45, 0.9, f));
  col *= mix(1.1, 0.32, dk);
  gl_FragColor = vec4(col, 1.0);
}`;

const retroFrag = /* glsl */ `
#define DISSOLVE_BLOCK ${DISSOLVE_BLOCK.toFixed(1)}
uniform float uDissolve;
uniform float uRays;
uniform float uTime;
uniform float uNeon;
uniform vec3 uPal[16];
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  vec2 px = floor(uv * resolution);
  // intro god-rays: an angular cosine ray function from a spotlight above, added on top
  vec2 d = (uv - vec2(0.32, 1.12)) * vec2(aspect, 1.0);
  float a = atan(d.x, -d.y);
  float r = pow(max(cos(a * 11.0 + uTime * 0.5), 0.0), 6.0) * 0.55
          + pow(max(cos(a * 5.0 - uTime * 0.35 + 1.3), 0.0), 12.0) * 0.6;
  r *= smoothstep(1.7, 0.1, length(d)) * uRays;
  c += vec3(0.55) * r;
  // ordered dither, then nearest of 16 colours, compared in sRGB so darks don't collapse
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  c += (bayer4(px) - 0.5) * 0.16;
  vec3 best = uPal[0];
  float bd = 1e9;
  for (int i = 0; i < 16; i++) {
    // neon drops the three greys, so a dim halo stays on its hue (or black) instead of grey stipple
    // (the intro rays are white light, so they keep the greys)
    if (uNeon > 0.5 && r < 0.02 && i > 0 && i < 4) continue;
    vec3 e = c - uPal[i];
    float dd = dot(e, e);
    if (dd < bd) { bd = dd; best = uPal[i]; }
  }
  // block-noise dissolve (Day 003): each 16px block has a threshold; blocks about to go flash white
  float b = hash(floor(px / DISSOLVE_BLOCK));
  if (uDissolve > 0.0) {
    if (b < uDissolve) best = vec3(0.0);
    else if (b < uDissolve + 0.09) best = uPal[4];
  }
  outputColor = vec4(pow(best, vec3(2.2)), 1.0);
}`;

type PipesProps = { neon: boolean; running: boolean; version: number; ctlRef: RefObject<Ctl | null>; onReady: () => void };
type Stack = { Canvas: Mods['fiber']['Canvas']; Pipes: ComponentType<PipesProps> };

function makeStack({ THREE, fiber, rpp, pp }: Mods): Stack {
  const { useFrame, useThree } = fiber;
  const { Bloom, EffectComposer } = rpp;
  const QUATS = DIRS.map((d) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d)));
  const PAL16 = PAL16_HEX.map((h) => new THREE.Color().setStyle(h, THREE.SRGBColorSpace).convertLinearToSRGB()); // sRGB values
  const COLORS = PALETTE.map((h) => new THREE.Color(h));

  class RetroEffect extends pp.Effect {
    constructor() {
      super('RetroEffect', retroFrag, {
        uniforms: new Map<string, THREEType.Uniform>([
          ['uDissolve', new THREE.Uniform(0)],
          ['uRays', new THREE.Uniform(0)],
          ['uTime', new THREE.Uniform(0)],
          ['uNeon', new THREE.Uniform(0)],
          ['uPal', new THREE.Uniform(PAL16.map((c) => new THREE.Vector3(c.r, c.g, c.b)))],
        ]),
      });
    }
  }

  const segGeo = new THREE.CylinderGeometry(0.17, 0.17, 1, 16, 1, true);
  const jointGeo = new THREE.SphereGeometry(0.25, 18, 12);

  function Pipes({ neon, running, version, ctlRef, onReady }: PipesProps) {
    const { size, camera, invalidate } = useThree();
    const segRef = useRef<THREEType.InstancedMesh>(null);
    const jointRef = useRef<THREEType.InstancedMesh>(null);
    const [mats] = useState(() => ({
      phong: new THREE.MeshPhongMaterial({ color: '#ffffff', shininess: 70, specular: new THREE.Color('#ffffff') }),
      neon: new THREE.ShaderMaterial({
        vertexShader: neonVert,
        fragmentShader: neonFrag,
        toneMapped: false,
        uniforms: { uShrink: { value: new THREE.Vector3(0.5, 1, 0.5) }, uDepth: { value: new THREE.Vector2(10, 20) } },
      }),
      neonJoint: new THREE.ShaderMaterial({
        vertexShader: neonVert,
        fragmentShader: neonFrag,
        toneMapped: false,
        uniforms: { uShrink: { value: new THREE.Vector3(0.46, 0.46, 0.46) }, uDepth: { value: new THREE.Vector2(10, 20) } },
      }),
      fx: new RetroEffect(),
    }));
    const st = useRef({ round: -1, shownSegs: 0, shownJoints: 0, lastFresh: 0, frames: 0, dims: '' });
    const tmp = useRef({ m: new THREE.Matrix4(), p: new THREE.Vector3(), s: new THREE.Vector3(), q: new THREE.Quaternion() }).current;

    useEffect(() => () => void (mats.phong.dispose(), mats.neon.dispose(), mats.neonJoint.dispose(), mats.fx.dispose()), [mats]);

    // Hand-over to the parent happens from React, never from inside the r3f frame loop: the frame loop
    // only records that frames were drawn, and a mounted-guarded microtask reports it.
    const mounted = useRef(false);
    const onReadyRef = useRef(onReady);
    useEffect(() => {
      onReadyRef.current = onReady;
    });
    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);

    // prime colour buffers so both materials compile with instance colours
    useLayoutEffect(() => {
      for (let i = 0; i < MAX_SEG; i++) segRef.current!.setColorAt(i, COLORS[0]);
      for (let i = 0; i < MAX_JOINT; i++) jointRef.current!.setColorAt(i, COLORS[0]);
    }, []);

    // redraw on demand when the still changes
    useEffect(() => void invalidate(), [version, neon, invalidate]);

    const sync = (ctl: Ctl) => {
      const g = ctl.grower;
      const s = st.current;
      const seg = segRef.current!;
      const joint = jointRef.current!;
      if (s.round !== ctl.round) {
        s.round = ctl.round;
        s.shownSegs = 0;
        s.shownJoints = 0;
        s.lastFresh = 0;
      }
      const off = g.dims.map((d) => (d - 1) / 2);
      const start = Math.max(0, Math.min(s.shownSegs, s.lastFresh, ctl.freshFrom));
      for (let i = start; i < g.segs.length; i++) {
        const sg = g.segs[i];
        const len = i >= ctl.freshFrom ? ctl.grow : 1;
        const d = DIRS[sg.dir];
        tmp.p.set(sg.from[0] - off[0] + (d[0] * len) / 2, sg.from[1] - off[1] + (d[1] * len) / 2, sg.from[2] - off[2] + (d[2] * len) / 2);
        tmp.s.set(1, Math.max(0.001, len), 1);
        tmp.m.compose(tmp.p, QUATS[sg.dir], tmp.s);
        seg.setMatrixAt(i, tmp.m);
        seg.setColorAt(i, COLORS[sg.color]);
      }
      for (let i = Math.min(s.shownJoints, g.joints.length); i < g.joints.length; i++) {
        const j = g.joints[i];
        tmp.p.set(j.at[0] - off[0], j.at[1] - off[1], j.at[2] - off[2]);
        tmp.s.set(1, 1, 1);
        tmp.m.compose(tmp.p, tmp.q.identity(), tmp.s);
        joint.setMatrixAt(i, tmp.m);
        joint.setColorAt(i, COLORS[j.color]);
      }
      s.shownSegs = g.segs.length;
      s.shownJoints = g.joints.length;
      s.lastFresh = ctl.freshFrom;
      seg.count = g.segs.length;
      joint.count = g.joints.length;
      seg.instanceMatrix.needsUpdate = true;
      joint.instanceMatrix.needsUpdate = true;
      if (seg.instanceColor) seg.instanceColor.needsUpdate = true;
      if (joint.instanceColor) joint.instanceColor.needsUpdate = true;
    };

    useFrame((_, dt) => {
      const ctl = ctlRef.current;
      if (!ctl) return;
      if (running) {
        ctl.threeLive = true;
        tick(ctl, dt);
      }
      // camera fits the grid (same maths as the Canvas2D renderer)
      const key = `${ctl.grower.dims.join()}:${size.width}x${size.height}`;
      if (st.current.dims !== key) {
        st.current.dims = key;
        const cam = camera as THREEType.PerspectiveCamera;
        cam.position.set(0, 0, fitDist(ctl.grower.dims, size.width / size.height));
        cam.lookAt(0, 0, 0);
        cam.updateProjectionMatrix();
        const dist = cam.position.z;
        const half = ctl.grower.dims[2] / 2;
        mats.neon.uniforms.uDepth.value.set(dist - half, dist + half);
        mats.neonJoint.uniforms.uDepth.value.set(dist - half, dist + half);
      }
      const u = mats.fx.uniforms;
      u.get('uTime')!.value = ctl.time;
      u.get('uRays')!.value = ctl.rays;
      u.get('uDissolve')!.value = ctl.dissolve;
      u.get('uNeon')!.value = neon ? 1 : 0;
      sync(ctl);
      // hand over once two real frames have been drawn (the first one compiles the shaders)
      if (st.current.frames < 3) {
        if (!mounted.current) return void invalidate();
        st.current.frames++;
        if (st.current.frames === 3) queueMicrotask(() => mounted.current && onReadyRef.current());
        else invalidate();
      }
    });

    const segMat = neon ? mats.neon : mats.phong;
    const jointMat = neon ? mats.neonJoint : mats.phong;
    return (
      <>
        <color attach="background" args={['#000000']} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[6, 9, 8]} intensity={2.4} />
        <directionalLight position={[-7, -3, 4]} intensity={0.7} />
        <group>
          <instancedMesh ref={segRef} args={[segGeo, undefined, MAX_SEG]} material={segMat} frustumCulled={false} />
          <instancedMesh ref={jointRef} args={[jointGeo, undefined, MAX_JOINT]} material={jointMat} frustumCulled={false} />
        </group>
        <EffectComposer multisampling={0}>
          {neon ? <Bloom intensity={0.8} luminanceThreshold={0.2} luminanceSmoothing={0.15} mipmapBlur radius={0.32} /> : null}
          <primitive object={mats.fx} />
        </EffectComposer>
      </>
    );
  }

  return { Canvas: fiber.Canvas, Pipes };
}

let stackPromise: Promise<Stack> | null = null;
let stackCache: Stack | null = null;
function loadStack() {
  stackPromise ??= Promise.all([import('three'), import('@react-three/fiber'), import('@react-three/postprocessing'), import('postprocessing')]).then(
    ([THREE, fiber, rpp, pp]) => (stackCache = makeStack({ THREE, fiber, rpp, pp })),
  );
  return stackPromise;
}

/** If WebGL fails, the Canvas2D renderer simply keeps going. */
class GLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/* ---------- component ---------- */

export default function PipesScreensaver({ active, reducedMotion, progress }: ExperienceProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const ctlRef = useRef<Ctl | null>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const uid = `pp${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [neon, setNeon] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [stack, setStack] = useState<Stack | null>(null);
  const [painted, setPainted] = useState(false);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);

  const running = active && !reducedMotion && progress === undefined;
  const still = reducedMotion || progress !== undefined;
  const measured = box.w > 0 && box.h > 0;
  // Render ~480 lines tall and upscale nearest-neighbour: the 640x480 look at any size.
  const dpr = measured ? Math.min(1.75, Math.max(0.35, 480 / box.h)) : 1;
  const portrait = measured && box.w / box.h < 0.9;

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const fit = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // WebGL is wanted once the piece runs live or neon (Bloom) is asked for. The composed still under
  // reduced motion is the dithered Canvas2D frame (same projection, 640x480 upscale and 16-colour
  // Bayer pass), which replaces the SSR poster as soon as the stage is measured.
  const [wantGL, setWantGL] = useState(false);
  // Hosts often read prefers-reduced-motion in an effect, so the first pass can say "not reduced" for a
  // frame. Until `settled`, trust the media query and keep the poster up rather than start a live round.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(true), 120);
    return () => window.clearTimeout(id);
  }, []);
  const holdForReduced = () => !settled && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if ((!still && !holdForReduced()) || neon) setWantGL(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, neon, settled]);

  useEffect(() => {
    if (!wantGL) return;
    let alive = true;
    if (stackCache) setStack(stackCache);
    else loadStack().then((s) => alive && setStack(s), () => {});
    return () => {
      alive = false;
    };
  }, [wantGL]);

  // Rounds: a live round with an intro sweep of rays, or the deterministic pre-grown still.
  useLayoutEffect(() => {
    if (!measured || (!still && holdForReduced())) return;
    const dims = portrait ? DIMS_PORT : DIMS_LAND;
    const ctl = (ctlRef.current ??= {
      grower: new Grower(dims, STILL_SEED),
      seed: 0,
      round: 0,
      acc: 0,
      time: 0,
      freshFrom: 0,
      grow: 1,
      resetting: false,
      rays: 0,
      dissolve: 0,
      threeLive: false,
      mode: 'none',
    });
    const dimsChanged = ctl.grower.dims.join() !== dims.join();
    if (still) {
      const target = reducedMotion ? STILL_SEGS : Math.floor(Math.min(1, Math.max(0, progress!)) * MAX_SEG * 0.85);
      gsap.killTweensOf(ctl);
      ctl.resetting = false;
      if (ctl.mode !== 'still' || dimsChanged || ctl.seed !== STILL_SEED || target < ctl.grower.segs.length) newRound(ctl, STILL_SEED, dims);
      while (ctl.grower.segs.length < target && ctl.grower.step()) {
        /* grow */
      }
      ctl.freshFrom = ctl.grower.segs.length;
      ctl.grow = 1;
      ctl.time = 0;
      ctl.rays = reducedMotion ? 0 : Math.max(0, 1 - (progress ?? 1) * 5);
      ctl.dissolve = 0;
      ctl.mode = 'still';
      setVersion((v) => v + 1);
    } else if (ctl.mode !== 'live' || dimsChanged) {
      gsap.killTweensOf(ctl);
      ctl.resetting = false;
      ctl.dissolve = 0;
      ctl.rays = 1;
      const elapsed = ctl.mode === 'none' && !dimsChanged ? posterElapsed(posterRef.current) : 0;
      if (elapsed > 0.25) {
        // the server-rendered poster has been growing round 11 since first paint: carry on from there
        newRound(ctl, STILL_SEED, dims);
        const g = ctl.grower;
        const steps = Math.floor(elapsed / SEG_TIME);
        for (let i = 0; i < steps && g.segs.length < STILL_SEGS; i++) {
          ctl.freshFrom = g.segs.length;
          if (!g.step()) break;
        }
        ctl.acc = elapsed % SEG_TIME;
        ctl.grow = 1;
        gsap.timeline().to(ctl, { rays: 0, duration: 2.6, ease: 'power2.inOut' }, 0.4).time(Math.min(elapsed, 3));
      } else {
        newRound(ctl, 1 + Math.floor(Math.random() * 99991), dims);
        gsap.to(ctl, { rays: 0, duration: 2.6, ease: 'power2.inOut', delay: 0.4 });
      }
      ctl.mode = 'live';
      setVersion((v) => v + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured, portrait, still, reducedMotion, progress, settled]);

  useEffect(() => () => void (ctlRef.current && gsap.killTweensOf(ctlRef.current)), []);

  // Canvas2D renderer: paints on the first frame and runs until the WebGL scene has drawn.
  useEffect(() => {
    const cvs = cvsRef.current;
    const ctl = ctlRef.current;
    if (ready || !cvs || !ctl || !measured) return;
    const W = Math.max(1, Math.round(box.w * dpr));
    const H = Math.max(1, Math.round(box.h * dpr));
    if (cvs.width !== W || cvs.height !== H) {
      cvs.width = W;
      cvs.height = H;
    }
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    draw2d(ctx, ctl, W, H, neon);
    setPainted(true);
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.max(0, (t - last) / 1000);
      last = t;
      if (!ctl.threeLive) tick(ctl, dt);
      draw2d(ctx, ctl, W, H, neon);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, measured, box, dpr, neon, running, version]);

  const addPipe = () => {
    const c = ctlRef.current;
    if (!c || c.resetting) return;
    if (c.grower.heads.length < 5) c.grower.addPipe();
    setVersion((v) => v + 1);
  };

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full cursor-pointer overflow-hidden bg-black select-none"
      style={{ containerType: 'size' }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button,a')) return;
        addPipe();
      }}
    >
      {stack && measured && wantGL ? (
        <GLBoundary>
          <stack.Canvas
            dpr={dpr}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            camera={{ fov: FOV, near: 0.1, far: 100, position: [0, 0, 20] }}
            frameloop={running ? 'always' : 'demand'}
            onCreated={({ gl }) => void (gl.domElement.style.imageRendering = 'pixelated')}
            style={{ position: 'absolute', inset: 0 }}
          >
            <stack.Pipes neon={neon} running={running} version={version} ctlRef={ctlRef} onReady={() => setReady(true)} />
          </stack.Canvas>
        </GLBoundary>
      ) : null}
      <canvas
        ref={cvsRef}
        aria-hidden
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: 'pixelated', display: ready ? 'none' : 'block' }}
      />
      {painted ? null : <Poster uid={uid} posterRef={posterRef} still={reducedMotion} />}

      <div className="pixel pointer-events-auto absolute top-2 left-2 flex max-w-[calc(100%-16px)] flex-wrap gap-x-3 bg-black/80 px-2 py-1">
        <p className="text-[16px] leading-[16px] text-[#dfdfdf]">3D Pipes</p>
        <BuiltWith tools={TOOLS} />
      </div>
      <div className="font-w95 absolute right-2 bottom-2 flex gap-[2px] bg-w-face p-[3px] text-[11px] text-black" style={{ boxShadow: 'var(--w-bevel-out)' }}>
        {(['classic', 'neon'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={(m === 'neon') === neon}
            onClick={() => setNeon(m === 'neon')}
            className="h-[24px] bg-w-face px-3 capitalize"
            style={{ boxShadow: (m === 'neon') === neon ? 'var(--w-bevel-in)' : 'var(--w-bevel-out)' }}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
