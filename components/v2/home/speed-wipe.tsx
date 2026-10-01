'use client';

import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';
import { activeAct, ready, scroller, useReducedMotion } from './runtime';
import { stageOf } from './transitions';

/*
 * Speed wipe: a full-screen shader that plays for about half a second whenever the act on screen
 * changes. Its look follows the stage of the act you arrive in:
 *   win95  -> CRT power-off: the picture squeezes to a line, then a dot, then opens again
 *   mono   -> pixel sort: dithered columns streak across in the scroll direction
 *   colour -> ink bleed: a wet, noisy front of colour washes over and drains away
 * Scroll speed (Lenis velocity) sets the intensity: faster scroll = more RGB split, more smear,
 * and a slightly shorter wipe. One OGL context, made lazily after the preloader and kept; the canvas
 * is display:none between wipes, so it costs nothing while idle. pointer-events none throughout.
 * Reduced motion: nothing is mounted.
 */

const vertex = /* glsl */ `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

const fragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uT;      // 0..1 through the wipe
uniform float uV;      // 0..1 scroll speed
uniform float uDir;    // 1 scrolling down, -1 up
uniform float uStage;  // 0 win95, 1 mono, 2 colour
uniform float uTime;
uniform float uSeed;

float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

// Premultiplied colour of the wipe at uv.
vec4 crt(vec2 uv) {
  // k: 0 -> 1 -> 0; the picture squeezes to a line, then a dot, then opens again
  float k = sin(3.14159 * uT);
  vec2 p = uv - 0.5;
  float aspect = uRes.x / uRes.y;
  p.x *= aspect;
  float h = mix(0.5, 0.003, smoothstep(0.0, 0.8, k));
  float w = mix(0.5 * aspect, 0.006, smoothstep(0.8, 1.0, k));
  float inside = step(abs(p.y), h) * step(abs(p.x), w);
  // phosphor: only the collapsed line flares white; the edges glow; the dark is not quite black
  float flare = smoothstep(0.75, 1.0, k) * 0.9;
  float edgeY = exp(-abs(abs(p.y) - h) * 160.0) * step(abs(p.x), w);
  float edgeX = exp(-abs(abs(p.x) - w) * 120.0) * step(abs(p.y), h + 0.01) * smoothstep(0.8, 1.0, k);
  float glow = clamp(edgeY + edgeX, 0.0, 1.0);
  float scan = 0.88 + 0.12 * sin(uv.y * uRes.y * 1.5708);
  vec3 phos = vec3(0.93, 0.96, 1.0);
  float a = max(mix(0.86, flare, inside), glow);
  vec3 c = phos * clamp(glow + inside * flare, 0.0, 1.0) * scan;
  return vec4(min(c, vec3(a)), a);
}

vec4 sortd(vec2 uv) {
  float cell = 6.0;
  vec2 px = floor(uv * uRes / cell);
  float yy = uDir > 0.0 ? uv.y : 1.0 - uv.y;
  float r = hash(vec2(px.x, uSeed));
  float L = 0.18 + 0.32 * r + 0.45 * uV;
  float head = mix(-0.25, 1.25 + L, uT) + (r - 0.5) * (0.12 + 0.25 * uV);
  float g = (yy - (head - L)) / L;               // 0 at tail, 1 at head
  if (g < 0.0 || g > 1.0) return vec4(0.0);
  float on = step(bayer4(px), g * g);
  float a = smoothstep(0.0, 0.3, g) * 0.96;
  float headBar = step(0.965, g);
  vec3 c = mix(vec3(0.03), vec3(0.96), max(on, headBar));
  return vec4(c * a, a);
}

vec4 bleed(vec2 uv) {
  vec2 q = uv * vec2(uRes.x / uRes.y, 1.0);
  float yy = uDir > 0.0 ? uv.y : 1.0 - uv.y;
  float W = 0.4 + 0.45 * uV;
  float head = mix(-0.25, 1.3 + W, uT);
  float n = fbm(q * 2.6 + vec2(uSeed * 7.0, uTime * 0.6));
  float d = yy - head + (n - 0.5) * (0.35 + 0.3 * uV);
  float front = 1.0 - smoothstep(-0.004, 0.004, d);
  float tail = smoothstep(-W, -W + 0.18 + 0.1 * n, d);
  float a = front * tail;
  if (a <= 0.0) return vec4(0.0);
  float m = fbm(q * 1.4 + uSeed * 3.1);
  vec3 c1 = vec3(1.0, 0.0, 0.66);
  vec3 c2 = vec3(0.0, 0.7, 1.0);
  vec3 c3 = vec3(1.0, 0.9, 0.0);
  vec3 c4 = vec3(0.48, 0.17, 1.0);
  vec3 c = m < 0.42 ? mix(c1, c4, smoothstep(0.3, 0.42, m)) : m < 0.55 ? mix(c4, c2, smoothstep(0.42, 0.55, m)) : mix(c2, c3, smoothstep(0.55, 0.7, m));
  // wet rim: ink pools darker at the leading edge, paper grain everywhere
  float rim = exp(d * 60.0);
  c *= 1.0 - 0.35 * rim;
  c *= 0.9 + 0.1 * hash(floor(uv * uRes / 2.0));
  return vec4(c * a, a);
}

vec4 layer(vec2 uv) {
  if (uStage < 0.5) return crt(uv);
  if (uStage < 1.5) return sortd(uv);
  return bleed(uv);
}

void main() {
  vec2 uv = vUv;
  // smear along the axis the page is moving, stronger the faster you scroll
  if (uStage < 0.5) {
    uv.x += uV * 0.04 * (hash(vec2(floor(uv.y * 160.0), floor(uTime * 30.0))) - 0.5);
  } else {
    uv.y -= uDir * uV * 0.07 * hash(vec2(floor(uv.x * 90.0), uSeed));
  }
  vec2 off = vec2(0.002 + 0.02 * uV, 0.0);
  vec4 a = layer(uv - off);
  vec4 b = layer(uv);
  vec4 c = layer(uv + off);
  float al = max(max(a.a, b.a), c.a);
  gl_FragColor = vec4(min(vec3(a.r, b.g, c.b), vec3(al)), al);
}`;

const STAGE_N = { win95: 0, mono: 1, colour: 2 } as const;

/** Scroll speed in px per frame: Lenis's own velocity when it runs, else a smoothed native delta. */
let nativeVel = 0;
function readVelocity() {
  const l = scroller.current as unknown as { velocity?: number } | null;
  return Math.abs(l && typeof l.velocity === 'number' ? l.velocity : nativeVel);
}
const norm = (v: number) => Math.min(1, v / 55);

export function SpeedWipe() {
  const reduced = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || reduced) return;

    let renderer: Renderer | null = null;
    let program: Program | null = null;
    let mesh: Mesh | null = null;
    let raf = 0;
    let running = false;
    let endedAt = 0;
    let prev = activeAct.get();

    const init = () => {
      if (renderer) return true;
      try {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.6;
        renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: false, depth: false, dpr, powerPreference: 'low-power' });
        const gl = renderer.gl;
        gl.clearColor(0, 0, 0, 0);
        const cv = gl.canvas as HTMLCanvasElement;
        cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
        cv.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          renderer = null;
          program = null;
          mesh = null;
          cv.remove();
        });
        el.appendChild(cv);
        program = new Program(gl, {
          vertex,
          fragment,
          depthTest: false,
          depthWrite: false,
          uniforms: {
            uRes: { value: [1, 1] },
            uT: { value: 0 },
            uV: { value: 0 },
            uDir: { value: 1 },
            uStage: { value: 0 },
            uTime: { value: 0 },
            uSeed: { value: 0 },
          },
        });
        mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
        return true;
      } catch {
        renderer = null;
        return false;
      }
    };

    const resize = () => {
      if (!renderer || !program) return;
      renderer.setSize(window.innerWidth, window.innerHeight);
      program.uniforms.uRes.value = [renderer.gl.drawingBufferWidth, renderer.gl.drawingBufferHeight];
    };

    const play = (to: number, dir: number) => {
      if (!init() || !renderer || !program || !mesh) return;
      resize();
      const v0 = norm(readVelocity());
      const dur = 580 - 220 * v0;
      const u = program.uniforms;
      u.uStage.value = STAGE_N[stageOf(to)];
      u.uDir.value = dir;
      u.uSeed.value = Math.random() * 100;
      let v = v0;
      const t0 = performance.now();
      running = true;
      el.style.display = 'block';
      const frame = (now: number) => {
        const t = (now - t0) / dur;
        if (t >= 1 || !renderer || !mesh) {
          running = false;
          endedAt = now;
          el.style.display = 'none';
          return;
        }
        // speed can build during the wipe; it never drops faster than it eases
        v = Math.max(norm(readVelocity()), v * 0.94);
        u.uT.value = t;
        u.uV.value = v;
        u.uTime.value = now / 1000;
        renderer.render({ scene: mesh });
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };

    const offAct = activeAct.subscribe(() => {
      const to = activeAct.get();
      const from = prev;
      prev = to;
      if (to === from || ready.get() < 1 || document.hidden) return;
      // one wipe at a time; a rail jump across several acts plays once
      if (running) {
        if (program) program.uniforms.uStage.value = STAGE_N[stageOf(to)];
        return;
      }
      if (performance.now() - endedAt < 120) return;
      play(to, to > from ? 1 : -1);
    });

    // compile the shader while the browser is idle after the preloader, so the first wipe never hitches
    let idle = 0;
    let idleIsRic = false;
    const warm = () => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
      const run = () => {
        if (init() && renderer && program && mesh) {
          resize();
          program.uniforms.uT.value = 0;
          renderer.render({ scene: mesh });
        }
      };
      idleIsRic = !!ric;
      idle = ric ? ric(run) : window.setTimeout(run, 600);
    };
    const offReady = ready.subscribe(() => ready.get() >= 1 && warm());
    if (ready.get() >= 1) warm();

    let lastY = window.scrollY;
    let lastT = performance.now();
    const onScroll = () => {
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      nativeVel = nativeVel * 0.6 + (Math.abs(window.scrollY - lastY) / dt) * 16.7 * 0.4;
      lastY = window.scrollY;
      lastT = now;
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      offAct();
      offReady();
      cancelAnimationFrame(raf);
      if (idleIsRic) (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idle);
      else window.clearTimeout(idle);
      window.removeEventListener('scroll', onScroll);
      if (renderer) {
        const gl = renderer.gl;
        (gl.canvas as HTMLCanvasElement).remove();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      renderer = null;
      el.style.display = 'none';
    };
  }, [reduced]);

  if (reduced) return null;
  return <div ref={host} aria-hidden data-speed-wipe className="pointer-events-none fixed inset-0 z-[58]" style={{ display: 'none' }} />;
}
