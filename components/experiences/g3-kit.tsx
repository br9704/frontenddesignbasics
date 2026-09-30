'use client';

/*
 * Shared helpers for the g3 experiences (flying-type, circuit-board, easing-lab, kinetic-poster,
 * wave-extrude-type). Small on purpose: font resolution for canvas text, a motion-energy meter fed by
 * scroll / wheel / pointer (and a global Lenis instance when the page has one), GLSL noise, and the
 * corner label.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { BuiltWith } from '@/components/v2/experience-frame';

/* ───────────────────────── fonts ───────────────────────── */

const FACE_MATCH = {
  'font-sans': { re: /schibsted/i, fallback: '"Helvetica Neue", Arial, sans-serif' },
  'font-display': { re: /newsreader/i, fallback: 'Georgia, serif' },
  'font-mono': { re: /plex.?mono/i, fallback: 'ui-monospace, Menlo, monospace' },
  'font-pixel': { re: /vga/i, fallback: 'ui-monospace, monospace' },
} as const;

/**
 * Resolve the real font-family string for one of our faces. next/font hashes the family names, so we
 * look them up in document.fonts by name; a class probe is the second try; a system stack the last.
 */
export function resolveFamily(className: keyof typeof FACE_MATCH): string {
  if (typeof document === 'undefined') return 'sans-serif';
  const { re, fallback } = FACE_MATCH[className];
  let found = '';
  document.fonts.forEach((f) => {
    const fam = f.family.replace(/^["']|["']$/g, '');
    if (!found && re.test(fam) && !/fallback/i.test(fam)) found = fam;
  });
  if (found) return `"${found}", ${fallback}`;
  const probe = document.createElement('span');
  probe.className = className;
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const fam = getComputedStyle(probe).fontFamily;
  probe.remove();
  return fam && re.test(fam) ? fam : fallback;
}

/** Wait for the faces we draw into canvases, then return their family strings. */
export function useCanvasFonts() {
  const [fonts, setFonts] = useState<null | { sans: string; display: string; mono: string; pixel: string }>(null);
  useEffect(() => {
    let dead = false;
    const f = {
      sans: resolveFamily('font-sans'),
      display: resolveFamily('font-display'),
      mono: resolveFamily('font-mono'),
      pixel: resolveFamily('font-pixel'),
    };
    const loads = [
      `900 80px ${f.sans}`,
      `700 80px ${f.sans}`,
      `300 80px ${f.display}`,
      `200 80px ${f.display}`,
      `italic 400 80px ${f.display}`,
      `500 80px ${f.mono}`,
      `16px ${f.pixel}`,
    ].map((q) => document.fonts.load(q).catch(() => []));
    const timeout = new Promise((r) => setTimeout(r, 1500));
    Promise.race([Promise.all(loads), timeout]).then(() => !dead && setFonts(f));
    return () => {
      dead = true;
    };
  }, []);
  return fonts;
}

/* ───────────────────────── motion energy ───────────────────────── */

export interface Energy {
  /** smoothed magnitude, roughly 0..1.5 */
  value: number;
  /** smoothed signed scroll direction, -1..1 */
  dir: number;
  raw: number;
  rawDir: number;
}

/**
 * Scroll velocity as a single number. Reads a global Lenis instance (window.lenis / window.__lenis)
 * when the page has one, otherwise window scroll deltas; wheel and pointer speed over the host add in.
 * Call step(dt) once per frame to decay and smooth.
 */
export function useEnergy(host: RefObject<HTMLElement | null>, enabled: boolean) {
  const e = useRef<Energy>({ value: 0, dir: 1, raw: 0, rawDir: 1 });
  useEffect(() => {
    if (!enabled) return;
    const el = host.current;
    let lastY = window.scrollY;
    const onScroll = () => {
      const dy = window.scrollY - lastY;
      lastY = window.scrollY;
      e.current.raw = Math.min(2, e.current.raw + Math.abs(dy) * 0.006);
      if (dy) e.current.rawDir = Math.sign(dy);
    };
    const onWheel = (ev: WheelEvent) => {
      e.current.raw = Math.min(2, e.current.raw + Math.abs(ev.deltaY) * 0.003);
      if (ev.deltaY) e.current.rawDir = Math.sign(ev.deltaY);
    };
    const onMove = (ev: PointerEvent) => {
      const s = Math.hypot(ev.movementX || 0, ev.movementY || 0);
      e.current.raw = Math.min(2, e.current.raw + s * 0.0025);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    el?.addEventListener('wheel', onWheel, { passive: true });
    el?.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      el?.removeEventListener('wheel', onWheel);
      el?.removeEventListener('pointermove', onMove);
    };
  }, [host, enabled]);

  const step = (dt: number) => {
    const s = e.current;
    const w = window as unknown as { lenis?: { velocity?: number }; __lenis?: { velocity?: number } };
    const lv = w.lenis?.velocity ?? w.__lenis?.velocity;
    if (typeof lv === 'number' && lv !== 0) {
      s.raw = Math.max(s.raw, Math.min(2, Math.abs(lv) * 0.04));
      s.rawDir = Math.sign(lv);
    }
    const k = 1 - Math.exp(-dt * 6);
    s.value += (s.raw - s.value) * k;
    s.dir += (s.rawDir - s.dir) * k;
    s.raw *= Math.exp(-dt * 3.2);
    return s.value;
  };
  return { energy: e, step };
}

/* ───────────────────────── GLSL ───────────────────────── */

/** 2D + 3D simplex noise (Ashima / Stefan Gustavson, MIT) and a hash. */
export const GLSL_NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

/* ───────────────────────── label ───────────────────────── */

/** Small pixel-font corner label: title plus the built-with tools. */
export function Corner({ title, tools, className = '' }: { title: string; tools: string[]; className?: string }) {
  return (
    <div className={`pointer-events-auto absolute top-3 left-3 z-20 max-w-[calc(100%-24px)] bg-[var(--v-bg)]/85 px-2 py-1 ${className}`}>
      <p className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">{title}</p>
      <BuiltWith tools={tools} className="hidden sm:block" />
    </div>
  );
}

/** Centre-out decode: returns the string at progress p (0..1) with ░▒▓█ glyphs for unresolved chars. */
const GLYPHS = '░▒▓█';
export function decodeAt(text: string, p: number, seed = 0) {
  const mid = (text.length - 1) / 2;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') {
      out += ' ';
      continue;
    }
    const d = mid > 0 ? Math.abs(i - mid) / mid : 0; // 0 centre, 1 edges
    const start = d * 0.45;
    const resolve = start + 0.4;
    if (p >= resolve) out += ch;
    else if (p >= start) out += GLYPHS[Math.floor((p * 40 + i * 7 + seed) % 4)];
    else out += ' ';
  }
  return out;
}
