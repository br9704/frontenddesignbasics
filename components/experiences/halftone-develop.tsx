'use client';

import { Mesh, Program, RenderTarget, Renderer, Texture, Triangle } from 'ogl';
import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import type { ExperienceProps } from '@/lib/experiences/types';
import NextImage from 'next/image';
import Link from 'next/link';

/*
 * Halftone Develop: a darkroom for print.
 *  newsprint: four real halftone screens (C 15°, M 75°, Y 0°, K 45°) multiplied onto warm paper.
 *             The develop timeline brings in Y, then M, then C, then K while dots go coarse to fine.
 *             A relight pass (normals from a blurred luminance height map, Lambert + specular from
 *             the pointer) runs before the screens, so dots swell and shrink as the light passes.
 *  riso:      a looping print: dot columns carry the photo, a stippled sphere with warped
 *             longitude contours turns, and an overprint strip slides across. Phase loops 0..2π.
 *  game boy:  an 8x8 Bayer quantiser whose colour steps develop from 2 to 16.
 * Clicking paints the next plate in with a springy watercolour brush against paper noise.
 */

const TOOLS = ['ogl', 'glsl', 'gsap', 'next-image'];

// Crops are [left, top, right, bottom] in 0..1 of the source file, chosen so every plate is only
// photograph: no headline, nav, buttons, captions or card edges from the site it came from.
// Seasats: the water and drones below the headline and above the CTA, inside the rounded card.
const PHOTOS = [
  { src: '/examples/hero-seasats.jpg', crop: [0.016, 0.405, 0.84, 0.885], w: 1280, h: 800, name: 'Seasats', url: 'https://www.seasats.com/' },
  { src: '/examples/hero-klim.jpg', crop: [0.18, 0.07, 0.82, 0.99], w: 1280, h: 800, name: 'Klim Type Foundry', url: 'https://klim.co.nz' },
  // Oryzo: the cork coaster on the cutting mat, between the wordmark, the side copy and the caption card.
  { src: '/examples/3d-oryzo.jpg', crop: [0.225, 0.27, 0.635, 0.73], w: 1280, h: 800, name: 'Oryzo', url: 'https://oryzo.ai' },
] as const;

// The server-rendered poster shows exactly the same crop the canvas uses, cover-fitted with container
// query units, so nothing jumps when the canvas fades in over it.
const P0 = PHOTOS[0];
const P0_CW = P0.crop[2] - P0.crop[0];
const P0_CH = P0.crop[3] - P0.crop[1];
const P0_ASPECT = (P0.w * P0_CW) / (P0.h * P0_CH);

type Preset = 'newsprint' | 'riso' | 'gameboy';
const PRESETS: Preset[] = ['newsprint', 'riso', 'gameboy'];

const vertex = /* glsl */ `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

// Shared: noise, cover-fit and the watercolour brush mask.
const common = /* glsl */ `
uniform vec2 uRes;
uniform sampler2D uImgA;
uniform sampler2D uImgB;
uniform vec4 uCropA;
uniform vec4 uCropB;
uniform vec2 uSizeA;
uniform vec2 uSizeB;
uniform float uReveal;
uniform vec2 uPointer;

float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }

vec2 cover(vec2 uv, vec4 crop, vec2 size) {
  vec2 cs = size * (crop.zw - crop.xy);
  float ra = uRes.x / uRes.y, ia = cs.x / cs.y;
  vec2 s = ra > ia ? vec2(1.0, ia / ra) : vec2(ra / ia, 1.0);
  vec2 q = (uv - 0.5) * s + 0.5;
  // ogl flips images on upload: v runs bottom-up, crop is given top-down
  return vec2(mix(crop.x, crop.z, q.x), mix(1.0 - crop.w, 1.0 - crop.y, q.y));
}

// Brush weight for plate B. uReveal is a uniform, so the early outs are uniform branches:
// no fbm at all unless a plate is actually being painted in.
float brush(vec2 uv) {
  if (uReveal <= 0.0) return 0.0;
  if (uReveal >= 1.0) return 1.0;
  float n = fbm(uv * vec2(3.0, 5.0) + 3.7) * 0.55 + fbm(uv * 18.0) * 0.12;
  float edge = uv.x * 0.8 + (1.0 - uv.y) * 0.2 + n;
  return smoothstep(edge - 0.04, edge + 0.04, uReveal * 1.9 - 0.1);
}

vec3 photoA(vec2 uv, float bias) { return texture(uImgA, cover(uv, uCropA, uSizeA), bias).rgb; }
vec3 photoB(vec2 uv, float bias) { return texture(uImgB, cover(uv, uCropB, uSizeB), bias).rgb; }
vec3 photoMix(vec2 uv, float w) {
  vec3 a = photoA(uv, 0.0);
  if (w <= 0.0) return a;
  vec3 b = photoB(uv, 0.0);
  return w >= 1.0 ? b : mix(a, b, w);
}
`;

// Pass 1 (half resolution): the relit photo. Runs once per low-res texel, so the four
// halftone screens read one texture each instead of re-running the relight per ink.
const litFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
${common}

float heightAt(vec2 uv, float w) {
  const vec3 LUM = vec3(0.3, 0.59, 0.11);
  // Bias 2.0, not higher: coarser mips are 64px+ blocks and their gradients print as rectangular halos.
  float a = dot(photoA(uv, 2.0), LUM);
  if (w <= 0.0) return a;
  float b = dot(photoB(uv, 2.0), LUM);
  return mix(a, b, w);
}

void main() {
  vec2 uv = vUv;
  float w = brush(uv);
  vec3 c = photoMix(uv, w);
  vec2 e = 3.0 / uRes;
  float hl = heightAt(uv - vec2(e.x, 0.0), w), hr = heightAt(uv + vec2(e.x, 0.0), w);
  float hd = heightAt(uv - vec2(0.0, e.y), w), hu = heightAt(uv + vec2(0.0, e.y), w);
  // Clamp the slope: luminance edges (hard highlights, thin bright lines) would otherwise give
  // near-horizontal normals and print as heavy dot masses.
  vec2 g = clamp(vec2(hl - hr, hd - hu), -0.035, 0.035);
  vec3 N = normalize(vec3(g, 0.05));
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 dp = (uPointer - uv) * asp;
  vec3 L = normalize(vec3(dp, 0.3));
  float lam = max(dot(N, L), 0.0);
  float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 14.0);
  float pool = exp(-dot(dp, dp) * 9.0);
  // Relief = how much the surface normal turns toward or away from the light, beyond flat paper.
  float flat_ = L.z;
  float relief = lam - flat_;
  // Shade multiplies (K dots swell on slopes facing away and far from the light); light bleaches
  // toward paper (C, M and Y dots shrink under it). Pure scaling would cancel inside cmyk().
  vec3 col = c * clamp(0.8 + 0.2 * flat_ + 1.8 * relief, 0.6, 1.3);
  col = mix(col, vec3(1.0), clamp(pool * 0.42 + spec * (0.25 + 0.5 * pool), 0.0, 0.85));
  // Near-white stays bare paper: relight may add light there, never ink.
  float white = smoothstep(0.86, 0.96, min(c.r, min(c.g, c.b)));
  col = mix(col, max(col, c), white);
  col = mix(col, vec3(1.0), white * smoothstep(0.93, 0.98, min(c.r, min(c.g, c.b))));
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// Pass 2 (full resolution): halftone screens, riso loop, Game Boy dither.
const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
${common}
uniform sampler2D uLit;
uniform float uDpr;
uniform float uWin;
uniform vec4 uGain;
uniform float uCell;
uniform float uMode;
uniform float uSteps;
uniform float uPhase;
uniform float uTime;
uniform float uLatent;

const vec3 PAPER = vec3(0.984, 0.980, 0.957);
const vec3 INK_C = vec3(0.0, 0.70, 1.0);
const vec3 INK_M = vec3(1.0, 0.24, 0.62);
const vec3 INK_Y = vec3(1.0, 0.90, 0.0);
const vec3 INK_K = vec3(0.12, 0.11, 0.11);

vec3 lit(vec2 uv) { return texture(uLit, uv).rgb; }

vec4 cmyk(vec3 c) {
  float k = 1.0 - max(c.r, max(c.g, c.b));
  float d = max(1.0 - k, 1e-4);
  return vec4((1.0 - c.r - k) / d, (1.0 - c.g - k) / d, (1.0 - c.b - k) / d, k);
}

mat2 rot(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }

// One halftone screen: coverage of the dot nearest this pixel.
float screen(vec2 frag, float ang, int ch, float gain, float cell) {
  vec2 p = rot(ang) * frag / cell;
  vec2 id = floor(p);
  vec2 jit = (vec2(hash(id + float(ch) * 7.0), hash(id + 3.1)) - 0.5) * 0.12;
  vec2 cc = id + 0.5 + jit;
  vec2 cen = rot(-ang) * (cc * cell);
  vec4 ink = cmyk(pow(lit(cen / uRes), vec3(0.8)));
  float v = ch == 0 ? ink.x : ch == 1 ? ink.y : ch == 2 ? ink.z : ink.w;
  float r = sqrt(clamp(v * gain, 0.0, 1.0)) * 0.56;
  float d = length(p - cc);
  float aa = 1.2 / cell;
  return 1.0 - smoothstep(r - aa, r + aa, d);
}

vec3 newsprint(vec2 frag) {
  float cell = uCell * uDpr;
  vec3 col = PAPER;
  // Latent image: a faint sepia key of the photo while the plates are still coming in, so the
  // subject reads from the first beat. It fades out as the black plate lands.
  if (uLatent > 0.0) {
    float lum = dot(lit(frag / uRes), vec3(0.3, 0.59, 0.11));
    col *= mix(vec3(1.0), mix(vec3(0.62, 0.55, 0.47), vec3(1.0), smoothstep(0.08, 0.95, lum)), uLatent);
  }
  float y = screen(frag, 0.0, 2, uGain.z, cell);
  col *= mix(vec3(1.0), INK_Y, y * 0.95);
  float m = screen(frag, radians(75.0), 1, uGain.y, cell);
  col *= mix(vec3(1.0), INK_M, m * 0.9);
  float c = screen(frag, radians(15.0), 0, uGain.x, cell);
  col *= mix(vec3(1.0), INK_C, c * 0.9);
  float k = screen(frag, radians(45.0), 3, uGain.w, cell);
  col *= mix(vec3(1.0), INK_K, k * 0.92);
  return col;
}

float bayer8(vec2 p) {
  vec2 q = mod(floor(p), 8.0);
  float v = 0.0;
  // 8x8 Bayer built from three 2x2 levels
  for (int i = 0; i < 3; i++) {
    vec2 b = mod(floor(q / pow(2.0, float(i))), 2.0);
    float t = b.x == 0.0 ? (b.y == 0.0 ? 0.0 : 2.0) : (b.y == 0.0 ? 3.0 : 1.0);
    v += t * pow(4.0, float(2 - i));
  }
  return (v + 0.5) / 64.0;
}

vec3 gameboy(vec2 frag) {
  float px = 3.0 * uDpr;
  vec2 cellF = floor(frag / px);
  vec2 uv = (cellF + 0.5) * px / uRes;
  float l = dot(lit(uv), vec3(0.3, 0.59, 0.11));
  float steps = max(uSteps, 2.0);
  float q = floor(l * (steps - 1.0) + bayer8(cellF)) / (steps - 1.0);
  vec3 d0 = vec3(0.03, 0.09, 0.05), d1 = vec3(0.0, 0.52, 0.27), d2 = vec3(0.0, 0.90, 0.46), d3 = vec3(0.86, 1.0, 0.80);
  vec3 c = mix(d0, d1, smoothstep(0.0, 0.33, q));
  c = mix(c, d2, smoothstep(0.33, 0.66, q));
  return mix(c, d3, smoothstep(0.66, 1.0, q));
}

vec3 riso(vec2 frag, vec2 uv) {
  vec3 col = PAPER;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float dotS = 9.0 * uDpr;
  // 1. dot columns carry the photo (yellow drum)
  vec2 g = fract(frag / dotS) - 0.5;
  vec2 cuv = (floor(frag / dotS) + 0.5) * dotS / uRes;
  float lum = dot(lit(cuv), vec3(0.3, 0.59, 0.11));
  float rr = pow(1.0 - lum, 1.3) * 0.52;
  float colDot = 1.0 - smoothstep(rr - 0.08, rr + 0.08, length(g));
  col *= mix(vec3(1.0), vec3(0.0, 0.55, 1.0), colDot * 0.85);

  // 2. stippled sphere (blue drum) lit from the pointer
  vec2 sc = vec2(0.5 + 0.12 * sin(uPhase), 0.5 + 0.04 * cos(uPhase * 2.0));
  vec2 sp = (uv - sc) * asp / (uRes.x < uRes.y ? 0.24 : 0.3);
  float r2 = dot(sp, sp);
  if (r2 < 1.0) {
    vec3 n = vec3(sp, sqrt(1.0 - r2));
    vec3 L = normalize(vec3((uPointer - sc) * asp, 0.7));
    float shade = clamp(dot(n, L) * 0.8 + 0.25, 0.0, 1.0);
    col = mix(col, PAPER, 0.85);
    float st = hash(floor(frag / (1.5 * uDpr)));
    float stip = step(shade + 0.05, st);
    col *= mix(vec3(1.0), vec3(1.0, 0.24, 0.62), stip * 0.95);
    // 3. warped longitude contours (pink drum), turning with the phase
    float lon = asin(clamp(n.x, -1.0, 1.0)) * 7.0 + uPhase * 1.1147 + (fbm(n.xy * 3.0 + uPhase * 0.159) - 0.5) * 1.6;
    float w = abs(fract(lon) - 0.5);
    float line = 1.0 - smoothstep(0.0, fwidth(lon) * 1.2, w - 0.012);
    col *= mix(vec3(1.0), vec3(0.48, 0.17, 1.0), line * 0.9);
  }

  // 4. overprint strip (red) sliding on the loop
  float sy = 0.18 + 0.64 * (0.5 + 0.5 * sin(uPhase));
  float strip = smoothstep(0.004, 0.0, abs(uv.y - sy) - 0.035);
  vec3 yel = vec3(1.0, 0.90, 0.0);
  col = mix(col, col * yel, strip * 0.92);
  // registration marks
  vec2 m = abs((uv - vec2(0.94, 0.86)) * asp);
  float mark = (step(m.x, 0.018) * step(m.y, 0.0018) + step(m.y, 0.018) * step(m.x, 0.0018));
  col = mix(col, INK_K, clamp(mark, 0.0, 1.0));
  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 frag = gl_FragCoord.xy;
  vec3 col = uMode < 0.5 ? newsprint(frag) : uMode < 1.5 ? riso(frag, uv) : gameboy(frag);

  // paper tooth
  col *= 0.97 + 0.03 * noise(frag * 0.35);
  col += (hash(frag + fract(uTime) * 97.0) - 0.5) * 0.02;

  // reveal window: the true photo around the cursor
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float d = length((uv - uPointer) * asp);
  float win = uWin;
  float inside = 1.0 - smoothstep(win - 0.002, win, d);
  if (inside > 0.0) col = mix(col, photoMix(uv, brush(uv)), inside);
  float ring = smoothstep(0.003, 0.0, abs(d - win)) * step(0.001, win);
  col = mix(col, vec3(0.08), ring);
  fragColor = vec4(col, 1.0);
}`;

function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const INK_NAMES = ['Y', 'M', 'C', 'K'];

export default function HalftoneDevelop({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const [preset, setPreset] = useState<Preset>('newsprint');
  const posterEl = useRef<HTMLDivElement>(null);
  const statusEl = useRef<HTMLPreElement>(null);
  const plateEl = useRef<HTMLAnchorElement>(null);
  const api = useRef<{
    draw: () => void;
    start: () => void;
    stop: () => void;
    setDevelop: (p: number) => void;
    next: () => void;
    setMode: (m: number) => void;
    state: { develop: number; auto: boolean; manualUntil: number };
  } | null>(null);
  const activeRef = useRef(active);
  const reducedRef = useRef(reducedMotion);
  const progressRef = useRef(progress);
  activeRef.current = active;
  reducedRef.current = reducedMotion;
  progressRef.current = progress;
  const modeRef = useRef(0);
  modeRef.current = PRESETS.indexOf(preset);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const renderer = new Renderer({ dpr, alpha: false, antialias: false });
    const gl = renderer.gl;
    const canvas = gl.canvas;
    // Hidden until the first photo is on it: the server-rendered still print underneath shows until then.
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0';
    const poster = posterEl.current;
    if (poster) poster.after(canvas);
    else el.prepend(canvas);

    const blank = new Texture(gl, { image: new Uint8Array([240, 238, 230, 255]), width: 1, height: 1, generateMipmaps: false });
    const texCache: Texture[] = [];
    const sizes: [number, number][] = [];
    // Half-resolution target for the relight pass (one relight per texel, not per ink per pixel).
    const LIT_SCALE = 0.5;
    const litRT = new RenderTarget(gl, { width: 2, height: 2, depth: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR });
    // Uniform objects shared by both passes, so one write reaches both.
    const shared = {
      uRes: { value: [1, 1] },
      uImgA: { value: blank },
      uImgB: { value: blank },
      uCropA: { value: [...PHOTOS[0].crop] },
      uCropB: { value: [...PHOTOS[0].crop] },
      uSizeA: { value: [P0.w, P0.h] },
      uSizeB: { value: [P0.w, P0.h] },
      uReveal: { value: 0 },
      uPointer: { value: [0.62, 0.62] },
    };
    const geometry = new Triangle(gl);
    const litProgram = new Program(gl, { vertex, fragment: litFragment, uniforms: shared });
    const litMesh = new Mesh(gl, { geometry, program: litProgram });
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        ...shared,
        uLit: { value: litRT.texture },
        uDpr: { value: dpr },
        uWin: { value: 0 },
        uGain: { value: [1, 1, 1, 1] },
        uCell: { value: 7 },
        uMode: { value: 0 },
        uSteps: { value: 16 },
        uPhase: { value: 0.9 },
        uTime: { value: 0 },
        uLatent: { value: 0 },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    const U = program.uniforms;

    let disposed = false;
    const draw = () => {
      if (disposed || gl.isContextLost()) return;
      renderer.render({ scene: litMesh, target: litRT });
      renderer.render({ scene: mesh });
    };

    // Status and plate label are written straight to the DOM: no React state updates from the
    // rAF loop or from async image loads (they can land before mount or after unmount).
    let lastStatus = '';
    const writeStatus = () => {
      const node = statusEl.current;
      if (!node) return;
      const p = state.develop;
      const bar = Math.round(p * 12);
      const txt =
        U.uMode.value === 1
          ? '[riso loop] ∞'
          : `[${'█'.repeat(bar)}${'░'.repeat(12 - bar)}] ${INK_NAMES[Math.min(3, Math.floor(p * 4.4))]} ${Math.round(p * 100)}%`;
      if (txt !== lastStatus) node.textContent = lastStatus = txt;
    };
    const writePlate = (i: number) => {
      const a = plateEl.current;
      if (!a) return;
      a.textContent = PHOTOS[i].name;
      a.href = PHOTOS[i].url;
    };
    const state = { develop: 1, auto: true, manualUntil: 0 };

    // The develop timeline: Y, M, C, K in turn while the screen goes from coarse to fine.
    const dev = { y: 0, m: 0, c: 0, k: 0, cell: 18, steps: 2 };
    const tl = gsap.timeline({ paused: true });
    tl.to(dev, { y: 1, duration: 0.25, ease: 'power2.out' }, 0)
      .to(dev, { m: 1, duration: 0.25, ease: 'power2.out' }, 0.2)
      .to(dev, { c: 1, duration: 0.25, ease: 'power2.out' }, 0.4)
      .to(dev, { k: 1, duration: 0.25, ease: 'power2.out' }, 0.6)
      .to(dev, { cell: 6.5, duration: 0.85, ease: 'power2.inOut' }, 0)
      .to(dev, { steps: 16, duration: 0.85, ease: 'power1.in' }, 0)
      .to({}, { duration: 0.15 });
    const applyDevelop = (p: number) => {
      state.develop = p;
      tl.progress(p);
      U.uGain.value = [dev.c, dev.m, dev.y, dev.k];
      U.uCell.value = dev.cell;
      U.uSteps.value = Math.round(dev.steps);
      U.uLatent.value = 0.7 * (1 - dev.k);
      writeStatus();
    };
    applyDevelop(1);

    const load = (i: number) =>
      new Promise<Texture>((resolve) => {
        if (texCache[i]) return resolve(texCache[i]);
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          if (disposed) return resolve(blank);
          const t = new Texture(gl, { image: img, generateMipmaps: true, minFilter: gl.LINEAR_MIPMAP_LINEAR });
          texCache[i] = t;
          sizes[i] = [img.naturalWidth, img.naturalHeight];
          resolve(t);
        };
        img.onerror = () => resolve(blank);
        img.src = PHOTOS[i].src; // static file (60-160 KB): no optimiser round trip before the first frame
      });

    let current = 0;
    let target = 0; // the plate on screen or being painted in; the label follows this
    let revealTween: gsap.core.Tween | null = null;
    const swap = (i: number) => {
      target = i;
      load(i).then((t) => {
        if (disposed || target !== i) return;
        writePlate(i);
        // B becomes the incoming plate; A holds what is on screen now.
        U.uImgB.value = t;
        U.uCropB.value = [...PHOTOS[i].crop];
        U.uSizeB.value = sizes[i] ?? [PHOTOS[i].w, PHOTOS[i].h];
        U.uReveal.value = 0;
        revealTween?.kill();
        const finish = () => {
          U.uImgA.value = t;
          U.uCropA.value = [...PHOTOS[i].crop];
          U.uSizeA.value = sizes[i] ?? [PHOTOS[i].w, PHOTOS[i].h];
          U.uReveal.value = 0;
          current = i;
          draw();
        };
        if (reducedRef.current) {
          revealTween = null;
          finish();
        }
        else revealTween = gsap.to(U.uReveal, { value: 1, duration: 1.8, ease: 'elastic.out(1, 0.75)', onComplete: finish });
      });
    };
    load(0).then((t) => {
      if (disposed) return;
      if (target === 0) {
        U.uImgA.value = t;
        U.uImgB.value = t;
        U.uSizeA.value = sizes[0] ?? [P0.w, P0.h];
        U.uSizeB.value = sizes[0] ?? [P0.w, P0.h];
      }
      resize(); // sizes may have settled since mount; resize() also draws
      canvas.style.opacity = '1';
    });
    // warm the cache
    load(1);
    load(2);

    const resize = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      U.uRes.value = [gl.drawingBufferWidth, gl.drawingBufferHeight];
      litRT.setSize(Math.max(1, Math.ceil(gl.drawingBufferWidth * LIT_SCALE)), Math.max(1, Math.ceil(gl.drawingBufferHeight * LIT_SCALE)));
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Pointer light and reveal window.
    const ptr = { x: 0.62, y: 0.62, tx: 0.62, ty: 0.62, win: 0, twin: 0 };
    const onMove = (e: PointerEvent) => {
      if (reducedRef.current) return;
      const r = el.getBoundingClientRect();
      ptr.tx = (e.clientX - r.left) / r.width;
      ptr.ty = 1 - (e.clientY - r.top) / r.height;
      ptr.twin = r.width < 520 ? 0.09 : 0.075;
    };
    const onLeave = () => {
      ptr.twin = 0;
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);

    // Wheel scrubs the develop when no parent progress drives it, but only once engaged by a click.
    let engagedUntil = 0;
    const onEngage = () => {
      engagedUntil = performance.now() + 6000;
    };
    el.addEventListener('pointerdown', onEngage);
    const onWheel = (e: WheelEvent) => {
      if (progressRef.current !== undefined || U.uMode.value === 1) return;
      // Only scrub after the visitor has clicked the print; a plain page scroll always passes through.
      if (performance.now() > engagedUntil) return;
      engagedUntil = performance.now() + 2500;
      const p = Math.min(1, Math.max(0, state.develop + e.deltaY * 0.0009));
      if ((p === 0 && e.deltaY < 0) || (p === 1 && e.deltaY > 0 && state.develop === 1)) return;
      e.preventDefault();
      state.manualUntil = performance.now() + 4000;
      applyDevelop(p);
      if (reducedRef.current) draw();
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let autoT = 0; // seconds into the auto cycle
    const CYCLE = 12;
    const DEVELOP = 6.5; // seconds from the first plate (Y already down) to the full print; then hold
    const START = 0.25; // open each cycle with the yellow plate in, never on bare paper
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // Real elapsed time (capped only against tab-switch jumps), so slow GPUs still develop on schedule.
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      clock += dt;
      U.uTime.value = clock;
      const k = 1 - Math.exp(-dt * 9);
      ptr.x += (ptr.tx - ptr.x) * k;
      ptr.y += (ptr.ty - ptr.y) * k;
      ptr.win += (ptr.twin - ptr.win) * (1 - Math.exp(-dt * 12));
      U.uPointer.value = [ptr.x, ptr.y];
      U.uWin.value = ptr.win < 0.002 ? 0 : ptr.win;
      U.uPhase.value = (U.uPhase.value + dt * ((Math.PI * 2) / 9)) % (Math.PI * 2);

      const pr = progressRef.current;
      if (pr !== undefined) applyDevelop(pr);
      else if (now > state.manualUntil && U.uMode.value !== 1) {
        // Auto: open at START, develop for DEVELOP s, hold the print, then paint in the next plate.
        autoT += dt;
        if (autoT >= CYCLE) {
          autoT = 0;
          swap((target + 1) % PHOTOS.length);
        }
        applyDevelop(autoT >= DEVELOP ? 1 : START + (1 - START) * smooth(0, DEVELOP, autoT) * 0.999);
      }
      draw();
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    api.current = {
      draw,
      start,
      stop,
      setDevelop: applyDevelop,
      next: () => swap((target + 1) % PHOTOS.length),
      setMode: (m) => {
        U.uMode.value = m;
        writeStatus();
        draw();
      },
      state,
    };

    // Do not rely on the run/pause effect alone to start things: set the current state up here too,
    // so a late mount (slow hydration, StrictMode remount) still runs or shows the still print.
    U.uMode.value = modeRef.current;
    if (reducedRef.current) applyDevelop(progressRef.current ?? 1);
    if (activeRef.current && !reducedRef.current) start();
    else draw();

    return () => {
      disposed = true;
      stop();
      revealTween?.kill();
      tl.kill();
      ro.disconnect();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onEngage);
      texCache.forEach((t) => t && gl.deleteTexture(t.texture));
      gl.deleteTexture(blank.texture);
      gl.deleteTexture(litRT.texture.texture);
      gl.deleteFramebuffer(litRT.buffer);
      litProgram.remove();
      program.remove();
      mesh.geometry.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
      api.current = null;
    };
  }, []);

  // Run / pause / still.
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    if (active && !reducedMotion) a.start();
    else {
      a.stop();
      if (reducedMotion) {
        a.setDevelop(progress ?? 1);
        a.draw();
      }
    }
    return () => a.stop();
  }, [active, reducedMotion, progress]);

  useEffect(() => {
    api.current?.setMode(PRESETS.indexOf(preset));
    if (reducedMotion) api.current?.draw();
  }, [preset, reducedMotion]);

  const onClick = () => api.current?.next();

  return (
    <div ref={host} className="relative h-full w-full cursor-crosshair touch-pan-y select-none overflow-hidden bg-[#fbfaf4]" onClick={onClick}>
      {/* Still print shown before WebGL is up (server render, slow hydration, no WebGL): the photo seen
          through a 45° dot screen on warm paper. The canvas is inserted right after it and covers it. */}
      <div ref={posterEl} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ containerType: 'size' }}>
        {/* crop box: cover-fits PHOTOS[0].crop to the frame, like cover() in the shader */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: `max(100cqw, calc(100cqh * ${P0_ASPECT.toFixed(4)}))`, height: `max(100cqh, calc(100cqw / ${P0_ASPECT.toFixed(4)}))` }}
        >
          <div
            className="absolute"
            style={{
              left: `${(-P0.crop[0] / P0_CW) * 100}%`,
              top: `${(-P0.crop[1] / P0_CH) * 100}%`,
              width: `${100 / P0_CW}%`,
              height: `${100 / P0_CH}%`,
            }}
          >
            <NextImage
              src={P0.src}
              alt=""
              fill
              sizes="200vw"
              loading="eager"
              className="object-fill"
              style={{ filter: 'saturate(1.15) contrast(1.1)' }}
            />
          </div>
        </div>
        <div
          className="absolute"
          style={{
            inset: '-100%',
            backgroundImage: 'radial-gradient(circle at center, transparent 0 2.1px, #fbfaf4 3.3px)',
            backgroundSize: '7px 7px',
            transform: 'rotate(45deg)',
          }}
        />
      </div>
      <div className="pointer-events-none absolute top-3 left-3 max-w-[62%] bg-[#fbfaf4]/85 px-2 py-1 sm:top-4 sm:left-4">
        <p className="pixel text-[16px] leading-[16px] text-[#080808]">HALFTONE DEVELOP</p>
        <p className="pixel mt-1 text-[16px] leading-[16px] text-[#3a3a3a]">
          {preset === 'riso' ? 'move to relight · click for next plate' : 'scroll to develop · click for next plate'}
        </p>
        <p className="pixel mt-1 hidden text-[16px] leading-[16px] text-[#3a3a3a] sm:block">
          built with:{' '}
          {TOOLS.map((t, i) => (
            <span key={t}>
              {i > 0 && ' · '}
              <Link href={`/tools#${t}`} className="pointer-events-auto underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
                {t}
              </Link>
            </span>
          ))}
        </p>
      </div>
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1 sm:top-4 sm:right-4 sm:flex-row" onClick={(e) => e.stopPropagation()}>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPreset(p)}
            className={`pixel border px-2 py-1 text-[16px] leading-[16px] ${
              preset === p ? 'border-[#080808] bg-[#080808] text-[#fbfaf4]' : 'border-[#080808]/40 bg-[#fbfaf4]/85 text-[#080808] hover:border-[#080808]'
            }`}
          >
            {p === 'gameboy' ? 'game boy' : p}
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute right-3 bottom-16 bg-[#fbfaf4]/85 px-2 py-1 text-right sm:right-4 sm:bottom-4">
        <pre ref={statusEl} className="pixel text-[16px] leading-[16px] text-[#080808]">
          {`[${'█'.repeat(12)}] K 100%`}
        </pre>
        <p className="pixel mt-1 text-[16px] leading-[16px] text-[#3a3a3a]">
          plate:{' '}
          <a ref={plateEl} href={PHOTOS[0].url} target="_blank" rel="noreferrer" className="pointer-events-auto underline" onClick={(e) => e.stopPropagation()}>
            {PHOTOS[0].name}
          </a>
        </p>
      </div>
    </div>
  );
}
