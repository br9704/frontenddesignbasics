'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { useEffect, useRef, useState } from 'react';
import type { ExperienceProps } from '@/lib/experiences/types';
import { CornerLabel, Cycler } from './g2-ui';

/*
 * Dither Wave: a two-tone ordered-dither field.
 * The grid is computed from gl_FragCoord BEFORE any transform, so dots never swim: only the source
 * field under them moves. Canvas runs at 1 canvas px = 1 CSS px with image-rendering: pixelated,
 * so every dot lands on whole device pixels.
 */

const PATTERNS = ['bayer 2', 'bayer 4', 'bayer 8', 'blue noise', 'halftone', 'crosshatch'] as const;
const SOURCES = ['swirl', 'hills', 'sphere', 'ferrofluid'] as const;
const FORMULA = [
  'step(bayer2(cell)/4., lum)',
  'step(bayer4(cell)/16., lum)',
  'step(bayer8(cell)/64., lum)',
  'step(ign(cell), lum)',
  'dot r = sqrt(lum) * pitch',
  'lines += step(level, lum)',
];

const vertex = /* glsl */ `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

const fragment = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uPx;
uniform float uTime;
uniform float uPattern;
uniform float uSrcA;
uniform float uSrcB;
uniform float uSrcMix;
uniform vec2 uPtr;
uniform float uHole;
uniform float uFlicker;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = r * p * 2.03; a *= 0.5; }
  return v;
}
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

// Recursive Bayer: exact 2x2, 4x4, 8x8 threshold matrices without array constructors.
float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
// Interleaved gradient noise: a cheap blue-noise-like threshold.
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

float swirl(vec2 p, float t) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float ph = 3.0 * a - 10.0 * pow(r, 0.8) + t * 1.2 + 0.6 * sin(t * 0.35 + r * 3.0);
  // sharp leading edge, long dithered tail: each arm reads as a lit ribbon
  float saw = fract(ph / 6.2832);
  float v = smoothstep(0.0, 0.08, saw) * pow(1.0 - saw, 1.6);
  float env = smoothstep(1.6, 0.25, r);
  float core = smoothstep(0.04, 0.32, r);
  return v * env * core * 1.25 + 0.04 * env;
}

float hills(vec2 p, float t) {
  // Night sky glowing at the horizon, a low sun, then five ridges: far = hazy and light, near = dark with a lit rim.
  float lum = 0.02 + 0.3 * smoothstep(0.85, 0.05, p.y);
  float sun = length(p - vec2(0.42, 0.3));
  lum = max(lum, smoothstep(0.23, 0.215, sun) * 0.95);
  lum += 0.18 * smoothstep(0.6, 0.22, sun);
  for (int k = 0; k < 5; k++) {
    float i = float(k);
    float amp = 0.07 + 0.03 * i;
    float h = 0.26 - 0.24 * i
      + amp * sin(p.x * (1.1 + 0.45 * i) + t * (0.22 + 0.1 * i) + i * 1.7)
      + amp * 0.5 * sin(p.x * (2.9 + 0.8 * i) - t * (0.35 + 0.08 * i) + i * 2.3);
    if (p.y < h) {
      float depth = h - p.y;
      float base = 0.5 - 0.1 * i;
      lum = base * exp(-depth * (2.5 + i)) + smoothstep(0.035, 0.0, depth) * (0.55 + 0.1 * i);
    }
  }
  return lum;
}

float sphere(vec2 p, float t) {
  float lum = 0.035 * (1.0 - length(p) * 0.4);
  // floor plane with a contact shadow
  if (p.y < -0.74) {
    float fy = clamp((-0.74 - p.y) * 3.0, 0.0, 1.0);
    lum = 0.32 - 0.22 * fy;
    vec2 s = vec2((p.x + 0.12 * cos(t * 0.6)) / 0.78, (p.y + 0.8) / 0.09);
    lum *= smoothstep(0.2, 1.3, dot(s, s));
  }
  vec2 q = (p - vec2(0.0, 0.04)) / 0.7;
  float r2 = dot(q, q);
  if (r2 < 1.0) {
    float z = sqrt(1.0 - r2);
    vec3 n = vec3(q, z);
    vec3 l = normalize(vec3(cos(t * 0.6) * 1.3, 0.55, 0.5 + 0.55 * sin(t * 0.6)));
    float diff = max(dot(n, l), 0.0);
    float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 48.0);
    float c = cos(t * 0.4), s = sin(t * 0.4);
    vec3 nr = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
    float lon = atan(nr.x, nr.z), lat = asin(clamp(nr.y, -1.0, 1.0));
    float tex = step(0.0, sin(lon * 5.0) * sin(lat * 5.0));
    lum = 0.02 + pow(diff, 1.3) * (0.66 + 0.2 * tex) + spec * 0.45 + pow(1.0 - z, 4.0) * 0.12;
  }
  return lum;
}

float ferro(vec2 p, float t) {
  // two opposed flowing fields, smooth-min joined; only the iso band lights up
  vec2 q = p * 1.35;
  float n1 = fbm(q + vec2(t * 0.16, t * 0.05));
  float n2 = fbm(q * 1.12 + vec2(4.0 - t * 0.14, 3.0 - t * 0.07));
  float peaks = smin(n1, n2, 0.1);
  float band = clamp((0.075 - abs((peaks - 0.36) * 2.0)) * 14.0, 0.0, 1.0);
  float body = smoothstep(0.36, 0.22, peaks);
  float sheen = body * smoothstep(0.24, 0.34, peaks) * 0.35;
  return band + sheen + body * 0.018;
}

float source(float id, vec2 p, float t) {
  if (id < 0.5) return swirl(p, t);
  if (id < 1.5) return hills(p, t);
  if (id < 2.5) return sphere(p, t);
  return ferro(p, t);
}

float field(vec2 frag) {
  float m = min(uRes.x, uRes.y);
  vec2 p = (frag - 0.5 * uRes) / m * 2.0;
  float a = source(uSrcA, p, uTime);
  float l = a;
  if (uSrcMix > 0.001) l = mix(a, source(uSrcB, p, uTime), uSrcMix);
  float h = smoothstep(0.03, 0.26, length((frag - uPtr) / m));
  l *= mix(1.0, h, uHole);
  return clamp(l, 0.0, 1.0);
}

void main() {
  float px = max(1.0, floor(uPx + 0.5));
  vec2 cell = floor(gl_FragCoord.xy / px);   // snapped first: the grid never moves
  vec2 center = (cell + 0.5) * px;
  float ink = 0.0;
  float lum = 0.0;
  if (uPattern < 0.5) { lum = field(center); ink = step(bayer2(cell) + 0.125, lum); }
  else if (uPattern < 1.5) { lum = field(center); ink = step(bayer4(cell) + 0.03125, lum); }
  else if (uPattern < 2.5) { lum = field(center); ink = step(bayer8(cell) + 0.0078125, lum); }
  else if (uPattern < 3.5) { lum = field(center); ink = step(ign(cell), lum); }
  else if (uPattern < 4.5) {
    // halftone: a 45 degree grid of round dots (pitch = 5 cells), each sized by the field at its own centre
    float pitch = px * 5.0;
    mat2 rot = mat2(0.7071, -0.7071, 0.7071, 0.7071);
    vec2 q = rot * floor(gl_FragCoord.xy);
    vec2 g = (floor(q / pitch) + 0.5) * pitch;
    lum = field(g * rot);
    ink = step(length(q - g), sqrt(lum) * pitch * 0.62);
  } else {
    lum = field(center);
    float l1 = 1.0 - step(0.5, mod(cell.x + cell.y, 5.0));
    float l2 = 1.0 - step(0.5, mod(cell.x - cell.y, 5.0));
    float l3 = 1.0 - step(0.5, mod(cell.y, 3.0));
    ink = max(max(l1 * step(0.14, lum), l2 * step(0.36, lum)), max(l3 * step(0.6, lum), step(0.84, lum)));
  }
  vec3 bg = vec3(0.031);
  vec3 fg = vec3(0.961);
  vec3 col = mix(bg, fg, ink);
  // flickering underlay: a few cells blink between frames, only where the field is dark
  float f = hash(cell + floor(uTime * 5.0) * vec2(7.13, 3.71));
  float under = step(1.0 - uFlicker * (0.25 + lum), f) * (1.0 - ink);
  col = mix(col, vec3(0.172), under);
  gl_FragColor = vec4(col, 1.0);
}`;

const STILL_T = 4.2;

export default function DitherWave({ active, reducedMotion, progress }: ExperienceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [pattern, setPattern] = useState(2);
  const [source, setSource] = useState(0);
  const [res, setRes] = useState(4); // px size target, 1..12
  const api = useRef<{
    setPattern: (i: number) => void;
    setSource: (i: number) => void;
    setRes: (px: number) => void;
    setProgress: (p: number | undefined) => void;
    setActive: (a: boolean) => void;
  } | null>(null);
  const activeRef = useRef(active);
  const progressRef = useRef(progress);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    gsap.registerPlugin(ScrollTrigger);
    const reduced = reducedMotion;

    const renderer = new Renderer({ dpr: 1, alpha: false, antialias: false });
    const gl = renderer.gl;
    gl.canvas.style.cssText = 'position:absolute;left:0;top:0;display:block;image-rendering:pixelated;';
    host.prepend(gl.canvas);

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uRes: { value: [1, 1] },
        uPx: { value: 12 },
        uTime: { value: STILL_T },
        uPattern: { value: 2 },
        uSrcA: { value: 0 },
        uSrcB: { value: 0 },
        uSrcMix: { value: 0 },
        uPtr: { value: [-9999, -9999] },
        uHole: { value: 0 },
        uFlicker: { value: 0.035 },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
    const u = program.uniforms;

    // Tweened state. `resolve` blends chunky (12px) to the dial value: scroll or parent progress drive it.
    const st = { dial: 4, resolve: reduced ? 1 : 0, mix: 0, hole: 0 };
    const ptrTarget = [-9999, -9999];
    let ptr = [-9999, -9999];
    let h = 1;

    const draw = () => {
      u.uPx.value = 12 + (st.dial - 12) * st.resolve;
      u.uSrcMix.value = st.mix;
      u.uHole.value = st.hole;
      renderer.render({ scene: mesh });
    };

    const resize = () => {
      const r = host.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width));
      h = Math.max(1, Math.floor(r.height));
      renderer.setSize(w, h);
      u.uRes.value = [w, h];
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // Scroll scrubs chunky -> fine as the card enters the viewport (unless a parent drives progress).
    let st1: ScrollTrigger | null = null;
    if (!reduced) {
      st1 = ScrollTrigger.create({
        trigger: host,
        start: 'top bottom',
        end: 'center center',
        scrub: 0.8,
        onUpdate: (s) => {
          if (progressRef.current === undefined) st.resolve = s.progress;
        },
      });
      st.resolve = st1.progress;
      if (progressRef.current !== undefined) st.resolve = progressRef.current;
    }

    const onMove = (e: PointerEvent) => {
      if (reduced) return;
      const b = host.getBoundingClientRect();
      ptrTarget[0] = e.clientX - b.left;
      ptrTarget[1] = b.height - (e.clientY - b.top);
      if (ptr[0] < -1000) ptr = [ptrTarget[0], ptrTarget[1]];
      gsap.to(st, { hole: 1, duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
    };
    const onLeave = () => {
      if (reduced) return;
      gsap.to(st, { hole: 0, duration: 0.8, ease: 'power2.out', overwrite: 'auto' });
    };
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);

    let raf = 0;
    let last = performance.now();
    let t = STILL_T;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      u.uTime.value = t;
      ptr[0] += (ptrTarget[0] - ptr[0]) * 0.12;
      ptr[1] += (ptrTarget[1] - ptr[1]) * 0.12;
      u.uPtr.value = [ptr[0], ptr[1]];
      draw();
      raf = requestAnimationFrame(loop);
    };
    const play = () => {
      if (raf || reduced || !activeRef.current || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const pause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVis = () => (document.hidden ? pause() : play());
    document.addEventListener('visibilitychange', onVis);

    const dur = reduced ? 0 : 1;
    api.current = {
      setPattern: (i) => {
        u.uPattern.value = i;
        draw();
      },
      setSource: (i) => {
        gsap.killTweensOf(st, 'mix');
        // settle any running crossfade, then fade from the current field to the new one
        if (st.mix > 0.5) u.uSrcA.value = u.uSrcB.value;
        st.mix = 0;
        u.uSrcB.value = i;
        gsap.to(st, {
          mix: 1,
          duration: 0.9 * dur,
          ease: 'power2.inOut',
          onUpdate: draw,
          onComplete: () => {
            u.uSrcA.value = i;
            st.mix = 0;
            draw();
          },
        });
      },
      setRes: (px) => gsap.to(st, { dial: px, duration: 0.8 * dur, ease: 'power3.inOut', onUpdate: draw, overwrite: 'auto' }),
      setProgress: (p) => {
        if (p === undefined || reduced) return;
        st.resolve = Math.min(1, Math.max(0, p * 1.6));
        draw();
      },
      setActive: (a) => (a ? play() : pause()),
    };
    host.dataset.motion = reduced ? 'still' : 'live';
    play();

    return () => {
      api.current = null;
      pause();
      st1?.kill();
      gsap.killTweensOf(st);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      gl.canvas.remove();
    };
  }, [reducedMotion]);

  useEffect(() => {
    activeRef.current = active;
    api.current?.setActive(active);
  }, [active]);
  useEffect(() => {
    progressRef.current = progress;
    api.current?.setProgress(progress);
  }, [progress]);
  useEffect(() => api.current?.setPattern(pattern), [pattern]);
  useEffect(() => api.current?.setSource(source), [source]);
  useEffect(() => {
    api.current?.setRes(res);
  }, [res]);

  const cyc = (n: number, len: number, d: number) => (n + d + len) % len;

  return (
    <div ref={hostRef} className="@container relative h-full w-full touch-pan-y overflow-hidden bg-[#080808] select-none">
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
        <CornerLabel title="Dither Wave" tools={['ogl', 'glsl', 'gsap']} />
        <div className="pointer-events-none flex max-w-full flex-col items-end gap-[6px]">
          <Cycler name="pattern" value={PATTERNS[pattern]} onPrev={() => setPattern((p) => cyc(p, 6, -1))} onNext={() => setPattern((p) => cyc(p, 6, 1))} />
          <Cycler name="source" value={SOURCES[source]} onPrev={() => setSource((s) => cyc(s, 4, -1))} onNext={() => setSource((s) => cyc(s, 4, 1))} />
          <label className="pixel pointer-events-auto flex items-center gap-2 border border-[#2c2c2c] bg-[#080808]/85 px-2 py-[4px] text-[16px] leading-[16px] text-[#f5f5f5]">
            <span className="text-[#8a8a8a]">res:</span>
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={13 - res}
              aria-label="resolution: pixel size from 12 to 1"
              onChange={(e) => setRes(13 - Number(e.target.value))}
              className="h-4 w-[96px] cursor-pointer accent-[#f5f5f5]"
            />
            <span className="w-[4ch] text-right">{res}px</span>
          </label>
          <p className="pixel hidden bg-[#080808]/85 px-2 py-[4px] text-[16px] leading-[16px] text-[#8a8a8a] @2xl:block">out = {FORMULA[pattern]}</p>
        </div>
      </div>
    </div>
  );
}
