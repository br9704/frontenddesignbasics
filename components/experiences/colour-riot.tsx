'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Noise } from '@react-three/postprocessing';
import gsap from 'gsap';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';

/*
 * Colour Riot: the loud finale, in one WebGL context.
 *  1. Stable fluids at half resolution: advect, splat, curl + vorticity, divergence, 32 Jacobi
 *     pressure iterations, gradient subtract. Dye is splatted in the six palette inks. When you stop
 *     stirring, an AutoDriver pointer takes over and eases in over 0.25 s.
 *  2. Under the dye, a random-weight CPPN (three mat4 layers) paints an idle field, re-seeded per visit.
 *  3. Polar god-rays burst in on entry (GSAP tweens density and intensity).
 *  4. Translucent neon panels slide through each other on a GSAP stagger, smearing behind them.
 *  5. A tunnel of sticker icons (canvas-drawn atlas on an InstancedMesh) flies out of the vanishing point.
 * Bloom and grain from postprocessing finish it.
 */

const TOOLS = ['threejs', 'r3f', 'postprocessing', 'glsl', 'gsap'];
const PALETTE = ['#ff2e00', '#ff00a8', '#7b2cff', '#00b3ff', '#00e676', '#ffe600'];
const PAL = PALETTE.map((h) => new THREE.Color(h));
// Pressure-settle steps for the reduced-motion still (18 Jacobi passes each: cheap, one frame).
const SETTLE = 40;

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const advectFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVel;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uDt;
uniform float uDiss;
void main() {
  vec2 coord = vUv - uDt * texture2D(uVel, vUv).xy * uTexel;
  gl_FragColor = texture2D(uSrc, coord) / (1.0 + uDiss * uDt);
}`;

const splatFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform float uAspect;
uniform vec3 uColor;
uniform vec2 uPoint;
uniform float uRadius;
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 s = exp(-dot(p, p) / uRadius) * uColor;
  gl_FragColor = vec4(texture2D(uSrc, vUv).xyz + s, 1.0);
}`;

const curlFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVel;
uniform vec2 uTexel;
void main() {
  float L = texture2D(uVel, vUv - vec2(uTexel.x, 0.0)).y;
  float R = texture2D(uVel, vUv + vec2(uTexel.x, 0.0)).y;
  float T = texture2D(uVel, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture2D(uVel, vUv - vec2(0.0, uTexel.y)).x;
  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const vortFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVel;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uCurlAmt;
uniform float uDt;
void main() {
  float L = texture2D(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture2D(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture2D(uCurl, vUv - vec2(0.0, uTexel.y)).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 0.0001;
  f *= uCurlAmt * C;
  f.y *= -1.0;
  vec2 v = texture2D(uVel, vUv).xy + f * uDt;
  gl_FragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`;

const divFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVel;
uniform vec2 uTexel;
void main() {
  float L = texture2D(uVel, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uVel, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture2D(uVel, vUv + vec2(0.0, uTexel.y)).y;
  float B = texture2D(uVel, vUv - vec2(0.0, uTexel.y)).y;
  vec2 C = texture2D(uVel, vUv).xy;
  if (vUv.x - uTexel.x < 0.0) L = -C.x;
  if (vUv.x + uTexel.x > 1.0) R = -C.x;
  if (vUv.y + uTexel.y > 1.0) T = -C.y;
  if (vUv.y - uTexel.y < 0.0) B = -C.y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const pressureFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uP;
uniform sampler2D uDiv;
uniform vec2 uTexel;
void main() {
  float L = texture2D(uP, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uP, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture2D(uP, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture2D(uP, vUv - vec2(0.0, uTexel.y)).x;
  float d = texture2D(uDiv, vUv).x;
  gl_FragColor = vec4((L + R + B + T - d) * 0.25, 0.0, 0.0, 1.0);
}`;

const gradFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uP;
uniform sampler2D uVel;
uniform vec2 uTexel;
void main() {
  float L = texture2D(uP, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uP, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture2D(uP, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture2D(uP, vUv - vec2(0.0, uTexel.y)).x;
  vec2 v = texture2D(uVel, vUv).xy - vec2(R - L, T - B);
  gl_FragColor = vec4(v, 0.0, 1.0);
}`;

const scaleFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform float uK;
void main() { gl_FragColor = texture2D(uSrc, vUv) * uK; }`;

// Display: CPPN idle field under the dye, mapped into the palette.
const displayFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uDye;
uniform sampler2D uVel;
uniform float uTime;
uniform float uAspect;
uniform mat4 uW1;
uniform mat4 uW2;
uniform mat4 uW3;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform float uDyeMax;
float sig(float x) { return 1.0 / (1.0 + exp(-x)); }
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 1.6;
  vec4 x = vec4(p.x, p.y, length(p) * 1.4, sin(uTime * 0.13) * 0.8);
  vec4 h = tanh(uW1 * x * 1.7);
  h = sin(uW2 * h * 2.1 + uTime * 0.05);
  vec4 o = uW3 * h;
  vec3 w = vec3(sig(o.x * 2.0), sig(o.y * 2.0), sig(o.z * 2.0));
  vec3 bg = mix(uA, uB, smoothstep(0.2, 0.8, w.x));
  bg = mix(bg, uC, smoothstep(0.35, 0.9, w.y) * 0.8);
  bg *= 0.05 + 0.2 * w.z;
  vec2 q = vUv - 0.5;
  bg *= 1.0 - dot(q, q) * 1.2;

  vec3 dye = max(texture2D(uDye, vUv).rgb, 0.0);
  // Keep the inks readable: push mixed ink back toward its hue, then cap the brightest channel
  // (hue-preserving) so stacked splats never clip to a white bloom blob.
  float dl = dot(dye, vec3(0.3333));
  dye = max(mix(vec3(dl), dye, 1.35), 0.0);
  float dm = max(max(dye.r, dye.g), dye.b);
  dye *= uDyeMax / max(uDyeMax, dm);
  float speed = length(texture2D(uVel, vUv).xy) * 0.0022;
  vec3 hot = mix(uA, uC, clamp(speed, 0.0, 1.0));
  vec3 col = bg * (1.0 - clamp(dot(dye, vec3(0.33)), 0.0, 0.85)) + dye + hot * clamp(speed - 0.4, 0.0, 1.0) * 0.25;
  float cm = max(max(col.r, col.g), col.b);
  col *= min(1.0, (uDyeMax + 0.08) / max(cm, 0.0001));
  gl_FragColor = vec4(col, 1.0);
}`;

const raysFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform float uDensity;
uniform float uIntensity;
uniform vec2 uOrigin;
uniform vec3 uP0;
uniform vec3 uP1;
uniform vec3 uP2;
uniform vec3 uP3;
float h(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 p = (vUv - uOrigin) * vec2(uAspect, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  vec2 ring = vec2(cos(a), sin(a)) * uDensity;
  float n = n2(ring + vec2(uTime * 0.35, -uTime * 0.2));
  float m = n2(ring * 2.3 - vec2(uTime * 0.2, 0.0));
  float rays = pow(n, 4.0) * 1.5 + pow(m, 6.0);
  float fall = exp(-r * 1.9) * smoothstep(0.0, 0.1, r);
  float t = fract(a / 6.28318 + 0.5 + n * 0.3);
  vec3 c = t < 0.25 ? mix(uP0, uP1, t * 4.0) : t < 0.5 ? mix(uP1, uP2, t * 4.0 - 1.0) : t < 0.75 ? mix(uP2, uP3, t * 4.0 - 2.0) : mix(uP3, uP0, t * 4.0 - 3.0);
  float core = exp(-r * r * 60.0) * 0.8;
  gl_FragColor = vec4(c * (rays * fall + core) * uIntensity, 1.0);
}`;

const panelVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// The plane is 3x wider than the panel; the body sits in the middle third, the smear trails behind.
const panelFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uVel;
uniform float uAlpha;
uniform float uSeed;
float h(float x) { return fract(sin(x * 91.7 + uSeed) * 43758.5); }
void main() {
  vec2 p = vec2(vUv.x * 3.0 - 1.5, vUv.y);
  vec2 q = abs(vec2(p.x, p.y - 0.5)) - vec2(0.5, 0.5);
  float rr = 0.06;
  float d = length(max(q + rr, 0.0)) - rr + min(max(q.x + rr, q.y + rr), 0.0);
  float body = 1.0 - smoothstep(-0.004, 0.004, d);
  float edge = smoothstep(0.03, 0.0, abs(d + 0.012)) * body;
  float dir = -sign(uVel);
  float behind = (p.x * dir) - 0.5;
  float row = floor(vUv.y * 22.0);
  float streak = 0.55 + 0.45 * h(row);
  float smear = behind > 0.0 ? exp(-behind / (0.05 + abs(uVel) * 0.9 * streak)) * step(abs(p.y - 0.5), 0.5) : 0.0;
  float a = body * (0.32 + 0.25 * vUv.y) + edge * 0.7 + smear * 0.55 * min(abs(uVel) * 2.4, 1.0);
  gl_FragColor = vec4(uColor * a * uAlpha, 1.0);
}`;

const stickerVert = /* glsl */ `
attribute float aIcon;
attribute float aSeed;
varying vec2 vUv;
varying float vFade;
void main() {
  float col = mod(aIcon, 4.0);
  float row = floor(aIcon / 4.0);
  vUv = (vec2(col, 3.0 - row) + uv) / 4.0;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  float depth = -mv.z;
  vFade = smoothstep(46.0, 30.0, depth) * smoothstep(0.6, 2.2, depth);
  gl_Position = projectionMatrix * mv;
}`;

const stickerFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying float vFade;
uniform sampler2D uAtlas;
void main() {
  vec4 c = texture2D(uAtlas, vUv);
  if (c.a * vFade < 0.02) discard;
  gl_FragColor = vec4(c.rgb, c.a * vFade);
}`;

/* ---------- sticker atlas: 16 icons drawn on a canvas ---------- */
function drawAtlas(): HTMLCanvasElement {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S * 4;
  c.height = S * 4;
  const g = c.getContext('2d')!;
  const shapes: ((g: CanvasRenderingContext2D) => void)[] = [
    (g) => star(g, 5, 46, 20),
    (g) => {
      g.moveTo(0, 38);
      g.bezierCurveTo(-60, -6, -26, -52, 0, -22);
      g.bezierCurveTo(26, -52, 60, -6, 0, 38);
    },
    (g) => {
      g.moveTo(10, -48);
      g.lineTo(-26, 6);
      g.lineTo(-2, 6);
      g.lineTo(-12, 48);
      g.lineTo(28, -10);
      g.lineTo(4, -10);
      g.closePath();
    },
    (g) => g.arc(0, 0, 40, 0, Math.PI * 2),
    (g) => {
      g.moveTo(0, -44);
      g.lineTo(44, 34);
      g.lineTo(-44, 34);
      g.closePath();
    },
    (g) => {
      g.moveTo(0, -46);
      g.lineTo(40, -23);
      g.lineTo(40, 23);
      g.lineTo(0, 46);
      g.lineTo(-40, 23);
      g.lineTo(-40, -23);
      g.closePath();
    },
    (g) => star(g, 8, 44, 28),
    (g) => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.moveTo(Math.cos(a) * 26 + 16, Math.sin(a) * 26);
        g.arc(Math.cos(a) * 26, Math.sin(a) * 26, 16, 0, Math.PI * 2);
      }
    },
    (g) => {
      g.moveTo(-40, -12);
      g.lineTo(6, -12);
      g.lineTo(6, -34);
      g.lineTo(44, 0);
      g.lineTo(6, 34);
      g.lineTo(6, 12);
      g.lineTo(-40, 12);
      g.closePath();
    },
    (g) => {
      g.moveTo(0, -46);
      g.lineTo(34, 0);
      g.lineTo(0, 46);
      g.lineTo(-34, 0);
      g.closePath();
    },
    (g) => {
      g.arc(0, 0, 42, 0.6, Math.PI * 2 - 0.6);
      g.arc(16, 0, 32, Math.PI * 2 - 0.9, 0.9, true);
      g.closePath();
    },
    (g) => {
      g.moveTo(-30, -44);
      g.lineTo(-30, 30);
      g.lineTo(-12, 14);
      g.lineTo(2, 46);
      g.lineTo(14, 40);
      g.lineTo(0, 10);
      g.lineTo(24, 10);
      g.closePath();
    },
    (g) => star(g, 12, 44, 34),
    (g) => g.roundRect(-38, -38, 76, 76, 16),
    (g) => {
      g.ellipse(0, 0, 46, 16, -0.4, 0, Math.PI * 2);
    },
    (g) => star(g, 4, 48, 12),
  ];
  function star(g: CanvasRenderingContext2D, n: number, R: number, r: number) {
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 ? r : R;
      if (i === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath();
  }
  shapes.forEach((fn, i) => {
    const x = (i % 4) * S + S / 2;
    const y = Math.floor(i / 4) * S + S / 2;
    g.save();
    g.translate(x, y);
    g.lineJoin = 'round';
    g.beginPath();
    fn(g);
    // sticker: fat white die-cut edge, then ink, then a dark keyline
    g.lineWidth = 16;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.fill();
    g.fillStyle = PALETTE[i % PALETTE.length];
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#080808';
    g.stroke();
    // eyes on a few, for character
    if (i % 5 === 3) {
      g.fillStyle = '#080808';
      g.beginPath();
      g.arc(-10, -4, 4.5, 0, Math.PI * 2);
      g.arc(10, -4, 4.5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  });
  return c;
}

/* ---------- helpers ---------- */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randMat(r: () => number, scale: number) {
  const m = new THREE.Matrix4();
  m.set(...(Array.from({ length: 16 }, () => (r() * 2 - 1) * scale) as Parameters<THREE.Matrix4['set']>));
  return m;
}

type DoubleFBO = { read: THREE.WebGLRenderTarget; write: THREE.WebGLRenderTarget; swap: () => void };
function makeTarget(w: number, h: number) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
}
function makeDouble(w: number, h: number): DoubleFBO {
  const d = { read: makeTarget(w, h), write: makeTarget(w, h), swap: () => {} };
  d.swap = () => {
    const t = d.read;
    d.read = d.write;
    d.write = t;
  };
  return d;
}

type Shared = {
  pointer: { x: number; y: number; px: number; py: number; moved: boolean; lastMove: number; down: boolean };
  hover: boolean;
  seed: number;
  reseed: number;
  invalidate?: () => void;
};

function Riot({
  active,
  reducedMotion,
  progress,
  shared,
  lite,
  onReady,
}: {
  active: boolean;
  reducedMotion: boolean;
  progress?: number;
  shared: React.MutableRefObject<Shared>;
  lite: boolean;
  onReady: () => void;
}) {
  const { gl, size, invalidate, setDpr } = useThree();
  // Lite (phones, coarse pointers): smaller sim, fewer pressure iterations, less ink per splat.
  // `iters` also drops at runtime when the device (or a busy GPU) cannot hold the full 32 Jacobi passes.
  const iters = useRef(lite ? 14 : 32);
  useEffect(() => {
    iters.current = lite ? 14 : 32;
  }, [lite]);
  const INK = lite ? 0.2 : 0.32;

  /* ---------- fluid ---------- */
  const sim = useMemo(() => {
    const aspect = size.width / Math.max(1, size.height);
    const long = lite
      ? Math.min(224, Math.max(96, Math.round(Math.max(size.width, size.height) * 0.3)))
      : Math.min(512, Math.max(128, Math.round(Math.max(size.width, size.height) * 0.5)));
    const w = aspect >= 1 ? long : Math.round(long * aspect);
    const h = aspect >= 1 ? Math.round(long / aspect) : long;
    const texel = new THREE.Vector2(1 / w, 1 / h);
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    const mats = {
      advect: mk(advectFrag, { uVel: { value: null }, uSrc: { value: null }, uTexel: { value: texel }, uDt: { value: 0.016 }, uDiss: { value: 0 } }),
      splat: mk(splatFrag, {
        uSrc: { value: null },
        uAspect: { value: aspect },
        uColor: { value: new THREE.Vector3() },
        uPoint: { value: new THREE.Vector2() },
        uRadius: { value: 0.003 },
      }),
      curl: mk(curlFrag, { uVel: { value: null }, uTexel: { value: texel } }),
      vort: mk(vortFrag, { uVel: { value: null }, uCurl: { value: null }, uTexel: { value: texel }, uCurlAmt: { value: 22 }, uDt: { value: 0.016 } }),
      div: mk(divFrag, { uVel: { value: null }, uTexel: { value: texel } }),
      pressure: mk(pressureFrag, { uP: { value: null }, uDiv: { value: null }, uTexel: { value: texel } }),
      grad: mk(gradFrag, { uP: { value: null }, uVel: { value: null }, uTexel: { value: texel } }),
      scale: mk(scaleFrag, { uSrc: { value: null }, uK: { value: 0.8 } }),
    };
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mats.advect);
    quad.frustumCulled = false;
    scene.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return {
      w,
      h,
      aspect,
      texel,
      mats,
      scene,
      quad,
      cam,
      vel: makeDouble(w, h),
      dye: makeDouble(w, h),
      pres: makeDouble(w, h),
      div: makeTarget(w, h),
      curl: makeTarget(w, h),
    };
    // Rebuild only on a real size change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.round(size.width / 40), Math.round(size.height / 40), lite]);

  useEffect(
    () => () => {
      Object.values(sim.mats).forEach((m) => m.dispose());
      [sim.vel.read, sim.vel.write, sim.dye.read, sim.dye.write, sim.pres.read, sim.pres.write, sim.div, sim.curl].forEach((t) => t.dispose());
      sim.quad.geometry.dispose();
    },
    [sim],
  );

  const pass = (mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) => {
    sim.quad.material = mat;
    gl.setRenderTarget(target);
    gl.render(sim.scene, sim.cam);
  };
  const splat = (x: number, y: number, dx: number, dy: number, color: THREE.Color, radius = 0.0028) => {
    const m = sim.mats.splat;
    m.uniforms.uAspect.value = sim.aspect;
    m.uniforms.uPoint.value.set(x, y);
    m.uniforms.uRadius.value = radius * (sim.aspect < 1 ? 1.6 : 1);
    m.uniforms.uSrc.value = sim.vel.read.texture;
    m.uniforms.uColor.value.set(dx, dy, 0);
    pass(m, sim.vel.write);
    sim.vel.swap();
    m.uniforms.uSrc.value = sim.dye.read.texture;
    m.uniforms.uColor.value.set(color.r * INK, color.g * INK, color.b * INK);
    pass(m, sim.dye.write);
    sim.dye.swap();
  };
  const step = (dt: number, n = iters.current) => {
    const M = sim.mats;
    M.curl.uniforms.uVel.value = sim.vel.read.texture;
    pass(M.curl, sim.curl);
    M.vort.uniforms.uVel.value = sim.vel.read.texture;
    M.vort.uniforms.uCurl.value = sim.curl.texture;
    M.vort.uniforms.uDt.value = dt;
    pass(M.vort, sim.vel.write);
    sim.vel.swap();
    M.div.uniforms.uVel.value = sim.vel.read.texture;
    pass(M.div, sim.div);
    M.scale.uniforms.uSrc.value = sim.pres.read.texture;
    M.scale.uniforms.uK.value = 0.8;
    pass(M.scale, sim.pres.write);
    sim.pres.swap();
    M.pressure.uniforms.uDiv.value = sim.div.texture;
    for (let i = 0; i < n; i++) {
      M.pressure.uniforms.uP.value = sim.pres.read.texture;
      pass(M.pressure, sim.pres.write);
      sim.pres.swap();
    }
    M.grad.uniforms.uP.value = sim.pres.read.texture;
    M.grad.uniforms.uVel.value = sim.vel.read.texture;
    pass(M.grad, sim.vel.write);
    sim.vel.swap();
    M.advect.uniforms.uDt.value = dt;
    M.advect.uniforms.uVel.value = sim.vel.read.texture;
    M.advect.uniforms.uSrc.value = sim.vel.read.texture;
    M.advect.uniforms.uDiss.value = 0.25;
    pass(M.advect, sim.vel.write);
    sim.vel.swap();
    M.advect.uniforms.uVel.value = sim.vel.read.texture;
    M.advect.uniforms.uSrc.value = sim.dye.read.texture;
    M.advect.uniforms.uDiss.value = 0.55;
    pass(M.advect, sim.dye.write);
    sim.dye.swap();
  };

  /* ---------- display, rays, panels, tunnel ---------- */
  const display = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: quadVert,
        fragmentShader: displayFrag,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uDye: { value: null },
          uVel: { value: null },
          uTime: { value: 0 },
          uAspect: { value: 1 },
          uW1: { value: new THREE.Matrix4() },
          uW2: { value: new THREE.Matrix4() },
          uW3: { value: new THREE.Matrix4() },
          uA: { value: PAL[2].clone() },
          uB: { value: PAL[1].clone() },
          uC: { value: PAL[3].clone() },
          uDyeMax: { value: 0.85 },
        },
      }),
    [],
  );
  const rays = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: quadVert,
        fragmentShader: raysFrag,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uAspect: { value: 1 },
          uDensity: { value: 2 },
          uIntensity: { value: 0 },
          uOrigin: { value: new THREE.Vector2(0.5, 0.5) },
          uP0: { value: PAL[5].clone() },
          uP1: { value: PAL[0].clone() },
          uP2: { value: PAL[1].clone() },
          uP3: { value: PAL[3].clone() },
        },
      }),
    [],
  );

  const PANELS = 6;
  const panels = useMemo(
    () =>
      Array.from(
        { length: PANELS },
        (_, i) =>
          new THREE.ShaderMaterial({
            vertexShader: panelVert,
            fragmentShader: panelFrag,
            transparent: true,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
            uniforms: { uColor: { value: PAL[[1, 2, 3, 4, 5, 0][i]].clone() }, uVel: { value: 0 }, uAlpha: { value: 1 }, uSeed: { value: i * 13.1 } },
          }),
      ),
    [],
  );
  const panelRefs = useRef<(THREE.Mesh | null)[]>([]);
  const panelState = useMemo(() => Array.from({ length: PANELS }, (_, i) => ({ x: -1.2 + i * 0.05, prev: 0 })), []);

  const COUNT = 90;
  const tunnel = useMemo(() => {
    const atlas = new THREE.CanvasTexture(drawAtlas());
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 4;
    const mat = new THREE.ShaderMaterial({
      vertexShader: stickerVert,
      fragmentShader: stickerFrag,
      transparent: true,
      depthWrite: false,
      uniforms: { uAtlas: { value: atlas } },
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    const r = rng(7);
    const icon = new Float32Array(COUNT);
    const seed = new Float32Array(COUNT);
    const items = Array.from({ length: COUNT }, (_, i) => {
      icon[i] = i % 16;
      seed[i] = r();
      return { a: r() * Math.PI * 2, rad: 1.6 + r() * 3.2, z: -r() * 44, spin: (r() - 0.5) * 2.4, rot: r() * 6.28, s: 0.32 + r() * 0.3 };
    });
    geo.setAttribute('aIcon', new THREE.InstancedBufferAttribute(icon, 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    return { atlas, mat, geo, items };
  }, []);
  const inst = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(
    () => () => {
      display.dispose();
      rays.dispose();
      panels.forEach((p) => p.dispose());
      tunnel.mat.dispose();
      tunnel.geo.dispose();
      tunnel.atlas.dispose();
    },
    [display, rays, panels, tunnel],
  );

  /* ---------- seeding (per visit, and on click) ---------- */
  const clearSim = () => {
    const M = sim.mats.scale;
    M.uniforms.uK.value = 0;
    for (const d of [sim.vel, sim.dye, sim.pres]) {
      M.uniforms.uSrc.value = d.read.texture;
      pass(M, d.write);
      d.swap();
    }
  };
  const seedAll = (seed: number) => {
    const r = rng(seed);
    display.uniforms.uW1.value = randMat(r, 1.4);
    display.uniforms.uW2.value = randMat(r, 1.2);
    display.uniforms.uW3.value = randMat(r, 1.6);
    const order = [0, 1, 2, 3, 4, 5].sort(() => r() - 0.5);
    display.uniforms.uA.value.copy(PAL[order[0]]);
    display.uniforms.uB.value.copy(PAL[order[1]]);
    display.uniforms.uC.value.copy(PAL[order[2]]);
    rays.uniforms.uP0.value.copy(PAL[order[3]]);
    rays.uniforms.uP1.value.copy(PAL[order[0]]);
    rays.uniforms.uP2.value.copy(PAL[order[4]]);
    rays.uniforms.uP3.value.copy(PAL[order[1]]);
    rays.uniforms.uOrigin.value.set(0.42 + r() * 0.16, 0.44 + r() * 0.14);
    // a burst of dye so the field never starts empty
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      splat(0.2 + r() * 0.6, 0.2 + r() * 0.6, Math.cos(a) * 900, Math.sin(a) * 900, PAL[order[i % 6]], 0.0035);
    }
    gl.setRenderTarget(null);
  };

  const seeded = useRef(-1);
  const reseedSeen = useRef(0);
  const time = useRef(0);
  const auto = useRef({ w: 0, x: 0.5, y: 0.5, px: 0.5, py: 0.5 });
  const splatIdx = useRef(0);
  const tunnelT = useRef({ z: 0, spin: 0, k: 1 });

  // Entry: rays burst in, then settle. Panels start their stagger.
  // Runs again if reduced motion resolves after mount, so the still composition always applies.
  useEffect(() => {
    const u = rays.uniforms;
    if (reducedMotion) {
      u.uDensity.value = 6;
      u.uIntensity.value = 0.38;
      panelState.forEach((p, i) => {
        p.x = -0.9 + i * 0.36;
        p.prev = p.x;
      });
      invalidate();
      return;
    }
    const tl = gsap.timeline();
    tl.fromTo(u.uIntensity, { value: 0 }, { value: 2.4, duration: 0.9, ease: 'expo.out' }, 0)
      .fromTo(u.uDensity, { value: 1.5 }, { value: 7, duration: 2.6, ease: 'power3.out' }, 0)
      .to(u.uIntensity, { value: 0.38, duration: 2.2, ease: 'power2.inOut' }, 1.0);
    const pt = gsap.timeline({ repeat: -1, yoyo: true, repeatDelay: 0.5 });
    panelState.forEach((p, i) => {
      pt.fromTo(p, { x: -1.3 }, { x: 1.3, duration: 1.7, ease: 'power3.inOut' }, i * 0.1);
    });
    return () => {
      tl.kill();
      pt.kill();
    };
  }, [rays, panelState, reducedMotion, invalidate]);

  const readySent = useRef(false);
  const frames = useRef(0);
  const perf = useRef({ ema: 1 / 60, n: 0, degraded: false });

  // Under frameloop 'demand' nothing asks for a frame on its own. Keep asking every animation frame
  // until the first real frame has drawn (the shaders, the composer and the r3f root may still be
  // compiling on a slow device, and an invalidate before then is dropped), then a few more so the
  // composer settles. Runs again once active, on a motion change and after a resize.
  useEffect(() => {
    shared.current.invalidate = invalidate;
    if (!active) return;
    let after = 0;
    let raf = 0;
    const tick = () => {
      invalidate();
      if (readySent.current) after++;
      if (after < 4) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [active, reducedMotion, invalidate, shared, sim]);

  // A rebuilt sim (resize) starts empty: seed it again.
  useEffect(() => {
    seeded.current = -1;
  }, [sim]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const sh = shared.current;
    // The poster fades once one real frame is on screen (this is the frame after the first render),
    // before any of the heavier work below, so a slow frame can never keep the poster up.
    frames.current++;
    if (frames.current >= 2 && !readySent.current) {
      readySent.current = true;
      onReady();
    }
    // Adaptive quality: if frames stay slow (weak GPU, or a busy one), drop to lite pressure
    // iterations and DPR 1 instead of crawling.
    if (!reducedMotion && !perf.current.degraded && frames.current > 3) {
      const pf = perf.current;
      pf.ema += (Math.min(delta, 0.5) - pf.ema) * 0.1;
      pf.n++;
      if (pf.n > 30 && pf.ema > 1 / 28) {
        pf.degraded = true;
        iters.current = 14;
        setDpr(1);
      }
    }
    if (seeded.current !== sh.seed) {
      seeded.current = sh.seed;
      reseedSeen.current = sh.reseed;
      clearSim();
      seedAll(sh.seed + sh.reseed * 7919);
      if (reducedMotion) {
        for (let i = 0; i < SETTLE; i++) step(0.016, 18);
        gl.setRenderTarget(null);
      }
    }
    if (reseedSeen.current !== sh.reseed) {
      reseedSeen.current = sh.reseed;
      if (reducedMotion) {
        // still frame: a fresh composition, settled, no animation
        clearSim();
        seedAll(sh.seed + sh.reseed * 7919);
        for (let i = 0; i < SETTLE; i++) step(0.016, 18);
        gl.setRenderTarget(null);
      } else {
        seedAll(sh.seed + sh.reseed * 7919);
        gsap.fromTo(rays.uniforms.uIntensity, { value: 2.2 }, { value: 0.38, duration: 1.8, ease: 'power2.out' });
      }
    }

    if (!reducedMotion) {
      time.current += dt;
      // Pointer stirring, or the AutoDriver when idle.
      const p = sh.pointer;
      const now = performance.now();
      const idle = now - p.lastMove > 1400;
      const a = auto.current;
      a.w += ((idle ? 1 : 0) - a.w) * (1 - Math.exp(-dt / 0.25));
      const t = time.current;
      const ax = 0.5 + 0.32 * Math.sin(t * 0.7) * Math.cos(t * 0.23);
      const ay = 0.5 + 0.28 * Math.sin(t * 0.53 + 1.3);
      const tx = ax * a.w + p.x * (1 - a.w);
      const ty = ay * a.w + p.y * (1 - a.w);
      const dx = tx - a.px;
      const dy = ty - a.py;
      a.px = tx;
      a.py = ty;
      if (Math.abs(dx) + Math.abs(dy) > 0.0004) {
        splatIdx.current = (splatIdx.current + 1) % 600;
        const col = PAL[Math.floor(splatIdx.current / 100) % 6];
        splat(tx, ty, dx * 5200, dy * 5200, col);
      }
      step(dt);
      gl.setRenderTarget(null);
    }

    const T = progress !== undefined ? progress * 18 : time.current;
    display.uniforms.uDye.value = sim.dye.read.texture;
    display.uniforms.uVel.value = sim.vel.read.texture;
    display.uniforms.uTime.value = T;
    display.uniforms.uDyeMax.value = lite ? 0.72 : 0.85;
    display.uniforms.uAspect.value = size.width / size.height;
    rays.uniforms.uTime.value = T;
    rays.uniforms.uAspect.value = size.width / size.height;

    // panels
    const narrow = size.width < size.height;
    panelState.forEach((p, i) => {
      const m = panelRefs.current[i];
      if (!m) return;
      const v = (p.x - p.prev) / Math.max(dt, 1 / 120);
      p.prev = p.x;
      const mat = m.material as THREE.ShaderMaterial;
      // Reduced motion: a fixed trailing smear, set outright so every still frame is identical.
      if (reducedMotion) mat.uniforms.uVel.value = 0.35;
      else mat.uniforms.uVel.value += (v * 0.35 - mat.uniforms.uVel.value) * 0.3;
      m.position.x = p.x * (narrow ? 0.7 : 1.3) + (narrow ? 0 : 0.9);
      m.position.y = (i - (PANELS - 1) / 2) * (narrow ? 0.34 : 0.3);
    });

    // tunnel
    const im = inst.current;
    if (im) {
      // accumulate distance so a change of speed (hover = timeScale 0.2) never jumps
      if (!reducedMotion) {
        tunnelT.current.k += ((sh.hover ? 0.2 : 1) - tunnelT.current.k) * (1 - Math.exp(-dt * 4));
        tunnelT.current.z += dt * 9 * tunnelT.current.k;
        tunnelT.current.spin += dt * tunnelT.current.k;
      }
      tunnel.items.forEach((it, i) => {
        let z = it.z + (progress !== undefined ? progress * 44 : tunnelT.current.z);
        z = ((z % 44) + 44) % 44;
        const zz = -44 + z + 6;
        dummy.position.set(Math.cos(it.a) * it.rad, Math.sin(it.a) * it.rad * (narrow ? 1.25 : 0.85), zz);
        dummy.rotation.set(0, 0, it.rot + tunnelT.current.spin * it.spin);
        dummy.scale.setScalar(it.s);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh frustumCulled={false} renderOrder={0} material={display}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <mesh frustumCulled={false} renderOrder={1} material={rays}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      {/* panels sit below the ray origin so the fluid there does not swallow them */}
      <group rotation={[0.08, -0.55, 0.04]} position={[0, size.width < size.height ? -1.25 : -0.95, 0.5]}>
        {panels.map((m, i) => (
          <mesh key={i} ref={(el) => void (panelRefs.current[i] = el)} renderOrder={2 + i} material={m}>
            <planeGeometry args={[3.6, 0.22]} />
          </mesh>
        ))}
      </group>
      <instancedMesh ref={inst} args={[tunnel.geo, tunnel.mat, COUNT]} frustumCulled={false} renderOrder={10} />
    </>
  );
}

export default function ColourRiot({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const shared = useRef<Shared>({
    pointer: { x: 0.5, y: 0.5, px: 0.5, py: 0.5, moved: false, lastMove: -1e9, down: false },
    hover: false,
    seed: 0,
    reseed: 0,
  });
  // Phones and coarse pointers get the lite path: smaller sim, fewer Jacobi iterations, lower DPR,
  // a higher bloom threshold so the palette never clips to white.
  const [lite, setLite] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px), (pointer: coarse)');
    const update = () => setLite(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  // A cheap CSS poster in the palette covers the canvas until WebGL has drawn its first frame.
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);

  // Seed per visit (fixed under reduced motion so the still is composed and repeatable).
  useEffect(() => {
    shared.current.seed = reducedMotion ? 20260929 : Math.floor(Math.random() * 1e9);
  }, [reducedMotion]);

  const onMove = (e: React.PointerEvent) => {
    if (reducedMotion) return;
    const r = host.current!.getBoundingClientRect();
    const p = shared.current.pointer;
    p.x = (e.clientX - r.left) / r.width;
    p.y = 1 - (e.clientY - r.top) / r.height;
    p.lastMove = performance.now();
  };

  return (
    <div
      ref={host}
      className="relative h-full w-full touch-pan-y select-none overflow-hidden bg-black"
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerEnter={() => (shared.current.hover = true)}
      onPointerLeave={() => (shared.current.hover = false)}
      onClick={() => {
        shared.current.reseed += 1;
        shared.current.invalidate?.();
      }}
    >
      <Canvas
        dpr={lite ? [1, 1.25] : [1, 1.75]}
        frameloop={!active ? 'never' : reducedMotion ? 'demand' : 'always'}
        camera={{ position: [0, 0, 6], fov: 50, near: 0.1, far: 80 }}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Riot active={active} reducedMotion={reducedMotion} progress={progress} shared={shared} lite={lite} onReady={onReady} />
        <EffectComposer multisampling={0}>
          <Bloom intensity={lite ? 0.4 : 0.55} luminanceThreshold={lite ? 0.82 : 0.66} luminanceSmoothing={0.3} mipmapBlur />
          <Noise opacity={0.05} premultiply />
        </EffectComposer>
      </Canvas>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: ready ? 0 : 1,
          transition: reducedMotion ? 'none' : 'opacity 700ms ease-out',
          background: [
            'radial-gradient(60% 45% at 50% 48%, rgba(255,230,0,0.35), transparent 60%)',
            'radial-gradient(45% 35% at 28% 30%, rgba(255,0,168,0.55), transparent 70%)',
            'radial-gradient(50% 40% at 74% 64%, rgba(0,179,255,0.5), transparent 70%)',
            'radial-gradient(40% 30% at 30% 78%, rgba(123,44,255,0.55), transparent 70%)',
            'radial-gradient(35% 28% at 78% 24%, rgba(255,46,0,0.45), transparent 70%)',
            'radial-gradient(30% 25% at 52% 90%, rgba(0,230,118,0.35), transparent 70%)',
            '#050505',
          ].join(','),
        }}
      />

      {/* The title lives in whatever frames the piece (lab footer, /make card); only the tool tag sits on the canvas. */}
      <div className="pointer-events-none absolute top-3 left-3 max-w-[calc(100%-24px)] bg-black/55 px-2 py-1 sm:top-4 sm:left-4 sm:max-w-[70%]">
        <p className="pixel text-[16px] leading-[16px] text-white/80">
          built with:{' '}
          {TOOLS.map((t, i) => (
            <span key={t}>
              {i > 0 && ' · '}
              <Link href={`/tools#${t}`} className="pointer-events-auto hover:underline" onClick={(e) => e.stopPropagation()}>
                {t}
              </Link>
            </span>
          ))}
        </p>
      </div>
      <p className="pixel pointer-events-none absolute right-3 bottom-3 bg-black/55 px-2 py-1 text-[16px] leading-[16px] text-white/80 sm:right-4 sm:bottom-4">
        stir · click to re-seed
      </p>
    </div>
  );
}
