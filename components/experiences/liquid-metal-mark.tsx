'use client';

import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner } from './g3-kit';

/*
 * Liquid Metal Mark: one raymarched chrome object that melts between four plain marks
 * (a circle, a square, the letter F, a star). Each mark is a signed distance field; the morph
 * mixes two fields, adds a noise "melt" that peaks halfway, and spins the object one full turn so
 * it always lands facing you. The chrome is only a reflection of a made-up photo studio: two tall
 * softboxes, a ceiling panel, a horizon line and a key light that follows the pointer.
 * It renders at half resolution and about 20 frames a second, which is plenty for liquid.
 */

const TOOLS = ['ogl', 'glsl'];
const MARKS = ['circle', 'square', 'F', 'star'];
const GLYPH = ['○', '□', 'F', '☆'];
const FPS = 20;

const vert = /* glsl */ `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const frag = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uA;
uniform float uB;
uniform float uT;
uniform float uRot;
uniform vec2 uLight;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdBox2(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-0.809016994375, -0.587785252292);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
float sdF(vec2 p) {
  float d = sdBox2(p - vec2(-0.3, 0.0), vec2(0.13, 0.72));
  d = min(d, sdBox2(p - vec2(0.07, 0.59), vec2(0.44, 0.13)));
  d = min(d, sdBox2(p - vec2(-0.02, 0.02), vec2(0.32, 0.12)));
  return d;
}
// extrude a 2D field to depth h with rounded edges of radius r
float slab(vec3 p, float d2, float h, float r) {
  vec2 w = vec2(d2 + r, abs(p.z) - h + r);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - r;
}
float mark(float i, vec3 p) {
  if (i < 0.5) return length(p) - 0.74;
  if (i < 1.5) { vec3 q = abs(p) - vec3(0.5); return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - 0.12; }
  if (i < 2.5) return slab(p, sdF(p.xy), 0.22, 0.09);
  return slab(p, sdStar5(p.xy + vec2(0.0, 0.06), 0.86, 0.45), 0.2, 0.1);
}
float map(vec3 p) {
  float melt = sin(3.14159265 * uT);
  p.xz *= rot(uRot);
  p.yz *= rot(0.12 * sin(uTime * 0.5));
  // it sags and ripples while it melts
  p.y += melt * 0.1 * sin(p.x * 3.0 + uTime * 1.3);
  float e = uT * uT * (3.0 - 2.0 * uT);
  float d = mix(mark(uA, p), mark(uB, p), e);
  d += melt * 0.07 * sin(p.x * 5.0 + uTime * 2.0) * sin(p.y * 4.0 - uTime * 1.7) * sin(p.z * 5.0 + uTime);
  d += 0.006 * sin(p.y * 9.0 + uTime * 2.2);
  return d;
}
vec3 normal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0015;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}
// the studio the chrome reflects, in grey only: dark room, two tall softboxes, a ceiling panel,
// a horizon line and a key light that follows the pointer
float env(vec3 d) {
  float c = mix(0.004, 0.03, smoothstep(-0.1, 0.9, d.y));
  c += 0.7 * exp(-abs(d.y + 0.04) * 30.0);
  float front = smoothstep(-0.2, 0.3, d.z);
  float tall = smoothstep(-0.25, -0.05, d.y) * smoothstep(0.85, 0.6, d.y);
  c += 4.0 * smoothstep(0.11, 0.08, abs(d.x - 0.6)) * tall * front;
  c += 2.2 * smoothstep(0.07, 0.05, abs(d.x + 0.72)) * tall * front;
  c += 2.8 * smoothstep(0.84, 0.9, d.y) * smoothstep(0.5, 0.25, abs(d.x));
  vec3 L = normalize(vec3(uLight, 0.9));
  c += 6.0 * pow(max(dot(d, L), 0.0), 80.0);
  c *= mix(0.12, 1.0, smoothstep(-0.5, 0.0, d.y));
  return c;
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

float shade(vec3 p, vec3 rd) {
  vec3 n = normal(p);
  vec3 r = reflect(rd, n);
  float fr = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
  float c = env(r) * mix(0.72, 1.0, fr);
  vec3 L = normalize(vec3(uLight, 0.9));
  c += 0.02 * max(dot(n, L), 0.0);
  c = 1.0 - exp(-c * 1.15);
  return pow(c, 0.4545);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(uv, -1.45));
  // background in display space: the page black with a soft pool of light behind the mark
  float bg = 0.031 + 0.035 * smoothstep(0.85, 0.0, length(uv * vec2(0.8, 1.0)));
  // pixel footprint per unit distance, for a soft (anti-aliased) silhouette at half resolution
  float pa = 1.0 / (min(uRes.x, uRes.y) * 1.45);
  float t = 1.6;
  float hit = 0.0;
  float edge = 1e9;
  float tEdge = 0.0;
  for (int i = 0; i < 72; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < 0.0012) { hit = 1.0; break; }
    float e = d / (t * pa);
    if (e < edge) { edge = e; tEdge = t; }
    t += d * 0.8;
    if (t > 5.0) break;
  }
  float col = bg;
  if (hit > 0.5) col = shade(ro + rd * t, rd);
  else if (edge < 1.5) col = mix(shade(ro + rd * tEdge, rd), bg, smoothstep(0.0, 1.5, edge));
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(vec3(col), 1.0);
}
`;

/* ─────────── timing ─────────── */

const HOLD_P = 0.07;
const MORPH_P = (1 - HOLD_P * 4) / 3;
/** Parent progress onto 0..3 (circle → square → F → star), holding on each mark. */
function progressToMorph(p: number) {
  let k = Math.min(1, Math.max(0, p));
  for (let i = 0; i < 3; i++) {
    if (k < HOLD_P) return i;
    k -= HOLD_P;
    if (k < MORPH_P) return i + k / MORPH_P;
    k -= MORPH_P;
  }
  return 3;
}
const HOLD = 1.6;
const MORPH = 2.0;
/** Own clock: 0..4, looping star back to circle. */
function clockToMorph(t: number) {
  const per = HOLD + MORPH;
  const cyc = t % (per * 4);
  const i = Math.floor(cyc / per);
  const f = cyc - i * per;
  return i + (f < HOLD ? 0 : (f - HOLD) / MORPH);
}

export default function LiquidMetalMark({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const api = useRef<{ start: () => void; stop: () => void; draw: () => void } | null>(null);
  const activeRef = useRef(active);
  const reducedRef = useRef(reducedMotion);
  const progressRef = useRef(progress);
  activeRef.current = active;
  reducedRef.current = reducedMotion;
  progressRef.current = progress;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // half resolution on purpose: liquid chrome has no fine detail, and it is a full-screen raymarch
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.5;
    const renderer = new Renderer({ dpr, alpha: false, antialias: false, powerPreference: 'high-performance' });
    const gl = renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    el.prepend(canvas);
    gl.clearColor(0.03, 0.03, 0.03, 1);

    const geometry = new Triangle(gl);
    const U = {
      uRes: { value: [1, 1] as number[] },
      uTime: { value: 0 },
      uA: { value: 0 },
      uB: { value: 1 },
      uT: { value: 0 },
      uRot: { value: 0 },
      uLight: { value: [0.35, 0.45] as number[] },
    };
    const program = new Program(gl, { vertex: vert, fragment: frag, uniforms: U });
    const mesh = new Mesh(gl, { geometry, program });

    const state = { clock: 0, m: progressRef.current !== undefined ? progressToMorph(progressRef.current) : 0, shown: -1 };
    const light = { x: 0.35, y: 0.45, tx: 0.35, ty: 0.45 };

    const writeReadout = (a: number, b: number, t: number) => {
      const shown = t < 0.5 ? a : b;
      if (shown === state.shown || !readout.current) return;
      state.shown = shown;
      readout.current.textContent = MARKS.map((_, i) => (i === shown ? `[${GLYPH[i]}]` : ` ${GLYPH[i]} `)).join('') + `  ${MARKS[shown]}`;
    };

    const draw = () => {
      const reduced = reducedRef.current;
      const pr = progressRef.current;
      let m: number;
      if (pr !== undefined) m = progressToMorph(pr);
      else if (reduced) m = 3;
      else m = clockToMorph(state.clock);
      if (reduced) m = Math.round(m);
      state.m = m;
      const mm = ((m % 4) + 4) % 4;
      const a = Math.min(3, Math.floor(mm + 1e-6));
      const t = mm - a;
      const b = (a + 1) % 4;
      const e = t * t * (3 - 2 * t);
      U.uA.value = a;
      U.uB.value = b;
      U.uT.value = t;
      U.uTime.value = reduced ? 0 : state.clock;
      // one full turn per morph so every mark lands facing you; a slow sway on top
      U.uRot.value = e * Math.PI * 2 + (reduced ? 0.38 : 0.38 * Math.sin(state.clock * 0.45));
      U.uLight.value = [light.x, light.y];
      renderer.render({ scene: mesh });
      writeReadout(a, b, t);
    };

    const resize = () => {
      renderer.setSize(Math.max(1, el.clientWidth), Math.max(1, el.clientHeight));
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      U.uRes.value = [gl.drawingBufferWidth, gl.drawingBufferHeight];
      if (!raf) draw();
    };

    const onMove = (e: PointerEvent) => {
      if (reducedRef.current) return;
      const r = el.getBoundingClientRect();
      light.tx = ((e.clientX - r.left) / r.width - 0.5) * 2.2;
      light.ty = (0.5 - (e.clientY - r.top) / r.height) * 2.0 + 0.2;
    };
    const onLeave = () => {
      light.tx = 0.35;
      light.ty = 0.45;
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);

    let raf = 0;
    let last = 0;
    let acc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      acc += dt;
      if (acc < 1 / FPS - 0.004) return;
      const step = Math.min(acc, 0.15);
      acc = 0;
      state.clock += step;
      const k = 1 - Math.exp(-step * 6);
      light.x += (light.tx - light.x) * k;
      light.y += (light.ty - light.y) * k;
      draw();
    };
    const start = () => {
      if (raf) return;
      last = performance.now();
      acc = 1;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    api.current = { start, stop, draw };
    if (activeRef.current && !reducedRef.current) start();
    else draw();

    return () => {
      stop();
      ro.disconnect();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      program.remove();
      geometry.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
      api.current = null;
    };
  }, []);

  // run / pause / still; a parent progress change while paused still redraws
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    if (active && !reducedMotion) a.start();
    else {
      a.stop();
      a.draw();
    }
  }, [active, reducedMotion, progress]);

  return (
    <div ref={host} className="relative h-full w-full touch-pan-y overflow-hidden bg-[var(--v-bg)] select-none">
      <Corner title="Liquid Metal Mark" tools={TOOLS} />
      <div className="pointer-events-none absolute right-3 bottom-3 left-3 flex items-end justify-between gap-3">
        <div ref={readout} className="pixel bg-[var(--v-bg)]/80 px-2 py-1 text-[16px] leading-[16px] whitespace-pre text-[var(--v-ink)]">
          [○] □  F  ☆   circle
        </div>
        <p className="pixel hidden bg-[var(--v-bg)]/80 px-2 py-1 text-[16px] leading-[16px] text-[var(--v-dim)] sm:block">move to shift the light</p>
      </div>
    </div>
  );
}
