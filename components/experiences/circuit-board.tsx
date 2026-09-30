'use client';

/*
 * Circuit Board: DOM chips wired with SVG traces over an OGL shader board.
 *  - Traces: quadratic paths 'M sx,sy Q cx,cy-curv ex,ey' measured from the chips on resize. Each is drawn
 *    as a faint base plus a userSpaceOnUse linearGradient whose x1/x2 GSAP slides along, so a light pulse
 *    travels input → CPU → output.
 *  - Shader (OGL, one fullscreen triangle): a laser beam with flare, wisps and fog aimed at the CPU
 *    (uBeamPos), a slow topographic contour map (fract(h*N) with fwidth AA, every 4th line brighter), and
 *    a kintsugi mode: Voronoi F2-F1 edges at three frequencies glowing black → amber → white as they reveal.
 *  - One chained GSAP timeline powers it on: beam, flare + fog, CPU glow, contours and traces, then pulses.
 */

import gsap from 'gsap';
import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner } from './g3-kit';

const TOOLS = ['svg', 'css', 'gsap', 'ogl', 'glsl'];
const INPUTS = ['gsap', 'ogl', 'svg'];
const OUTPUTS = ['site', 'deck', 'game'];

const VERT = /* glsl */ `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uBeam, uHit, uFog, uContour, uKin, uKinOn;
uniform vec2 uBeamPos; // px, GL origin (bottom-left)
out vec4 fragColor;

const vec3 C1 = vec3(1.0, 0.18, 0.0);     // --c-1
const vec3 C2 = vec3(1.0, 0.0, 0.659);    // --c-2
const vec3 C3 = vec3(0.482, 0.173, 1.0);  // --c-3
const vec3 C4 = vec3(0.0, 0.702, 1.0);    // --c-4
const vec3 C6 = vec3(1.0, 0.902, 0.0);    // --c-6

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.03; a *= 0.5; }
  return v;
}
// Voronoi: x = F2 - F1 edge distance, yz = nearest cell id
vec3 voronoi(vec2 p) {
  vec2 n = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash2(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; id = n + g; }
      else if (d < f2) { f2 = d; }
    }
  return vec3(sqrt(f2) - sqrt(f1), id);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  float asp = uRes.x / uRes.y;
  float t = uTime;
  vec3 col = vec3(0.031);

  // topographic board
  vec2 p = (uv - 0.5) * vec2(asp, 1.0) * 2.0;
  float h = fbm(p * 0.8 + vec2(t * 0.012, -t * 0.009)) + 0.15 * fbm(p * 2.5 - t * 0.02);
  float N = 16.0;
  float hn = h * N;
  float d = abs(fract(hn) - 0.5);
  float w = fwidth(hn);
  float line = smoothstep(0.5 - w * 1.5, 0.5, d);
  float major = step(abs(mod(floor(hn + 0.5), 4.0)), 0.5);
  float rad = length((uv - uBeamPos / uRes) * vec2(asp, 1.0));
  float reveal = 1.0 - smoothstep(uContour * 1.9 - 0.25, uContour * 1.9, rad);
  vec3 topo = mix(C4, C3, uv.y);
  topo = mix(topo, mix(C6, C1, 0.35), uKinOn);
  col += line * mix(0.16, 0.5, major) * reveal * topo * (1.0 - 0.5 * uKinOn);
  col += topo * 0.035 * smoothstep(0.35, 0.75, h) * reveal;

  // laser beam from the top edge down to the CPU
  vec2 bp = uBeamPos / uRes;
  float dx = (uv.x - bp.x) * asp;
  float yEnd = 1.0 - uBeam * (1.0 - bp.y);
  float inBeam = smoothstep(yEnd - 0.004, yEnd + 0.03, uv.y) * step(bp.y - 0.002, uv.y);
  float along = clamp((uv.y - bp.y) / max(0.001, 1.0 - bp.y), 0.0, 1.0);
  float wisp = noise(vec2(dx * 38.0, uv.y * 7.0 - t * 2.6));
  float core = exp(-abs(dx) * 520.0) * 1.3;
  float glow = exp(-abs(dx) * (26.0 + along * 30.0)) * (0.35 + 0.45 * wisp);
  float beam = (core + glow) * inBeam * mix(1.0, 0.35, along);
  vec3 beamCol = mix(C3, C2, 0.35 + 0.3 * wisp);
  col += beam * mix(beamCol, vec3(1.0), clamp(core, 0.0, 1.0));

  // flare where it lands
  vec2 fd = (uv - bp) * vec2(asp, 1.0);
  float flare = exp(-abs(fd.y) * 110.0) * exp(-abs(fd.x) * 5.5) * 0.9 + exp(-length(fd) * 16.0) * 0.8;
  col += flare * uHit * mix(C2, vec3(1.0), exp(-length(fd) * 40.0));

  // fog pooling around the hit
  float fog = fbm(fd * 5.0 + vec2(t * 0.25, -t * 0.12)) * exp(-length(fd * vec2(0.9, 2.2)) * 3.2);
  col += fog * uFog * 0.55 * mix(C3, C4, fbm(fd * 3.0 - t * 0.1));

  // kintsugi: molten gold cracks, revealed cell by cell outward from the CPU
  if (uKinOn > 0.001) {
    vec2 kp = (uv - bp) * vec2(asp, 1.0) * 2.2;
    vec3 v1 = voronoi(kp);
    vec3 v2 = voronoi(kp * 2.1 + 3.7);
    vec3 v3 = voronoi(kp * 4.3 + 9.1);
    float order = clamp(length(v1.yz / 3.0) * 0.28 + hash(v1.yz) * 0.45, 0.0, 1.0);
    float rev1 = smoothstep(order, order + 0.08, uKin * 1.15);
    float rev2 = smoothstep(order + 0.12, order + 0.2, uKin * 1.15);
    float rev3 = smoothstep(order + 0.24, order + 0.32, uKin * 1.15);
    float g = exp(-v1.x * 34.0) * rev1 + exp(-v2.x * 52.0) * 0.55 * rev2 + exp(-v3.x * 80.0) * 0.25 * rev3;
    g *= 0.85 + 0.15 * sin(t * 2.0 + hash(v1.yz) * 6.28);
    vec3 amber = mix(C1, C6, 0.55);
    vec3 gold = mix(vec3(0.0), amber, smoothstep(0.0, 0.5, g));
    gold = mix(gold, vec3(1.0, 0.97, 0.88), smoothstep(0.6, 1.2, g));
    col = mix(col, col * 0.6 + gold, uKinOn * clamp(g * 1.4, 0.0, 1.0));
  }

  // grain
  col += (hash(frag + fract(t) * 91.0) - 0.5) * 0.025;
  fragColor = vec4(col, 1.0);
}`;

type Route = { d: string; sx: number; ex: number; len: number };
type Layout = { w: number; h: number; s: number; routes: Route[] };

function hexShadow(color: string, on: number) {
  return on ? `0 0 0 1px ${color}, 0 0 22px ${color}66, inset 0 0 16px ${color}55` : '0 0 0 1px #ffffff1a, 0 0 0px #00000000, inset 0 0 0px #00000000';
}

export default function CircuitBoard({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const glHost = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]); // 0..2 inputs, 3 cpu, 4..6 outputs
  const baseRefs = useRef<(SVGPathElement | null)[]>([]);
  const gradRefs = useRef<(SVGLinearGradientElement | null)[]>([]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [kintsugi, setKintsugi] = useState(false);
  const u = useRef({
    uTime: { value: 0 },
    uBeam: { value: 0 },
    uHit: { value: 0 },
    uFog: { value: 0 },
    uContour: { value: 0 },
    uKin: { value: 0 },
    uKinOn: { value: 0 },
    uBeamPos: { value: [0, 0] as number[] },
    uRes: { value: [1, 1] as number[] },
  });
  const drawRef = useRef<() => void>(() => {});
  const beamCss = useRef([0, 0]);
  const pulseProg = useRef<{ p: number }[]>([0, 1, 2, 3, 4, 5].map(() => ({ p: -1 })));

  /* ── measure chips → routes ── */
  const measure = useCallback(() => {
    const el = host.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    const r = (i: number) => {
      const c = chipRefs.current[i]!.getBoundingClientRect();
      return { l: c.left - b.left, r: c.right - b.left, cy: c.top - b.top + c.height / 2, cx: c.left - b.left + c.width / 2, t: c.top - b.top };
    };
    const cpu = r(3);
    const routes: Route[] = [];
    const curv = (i: number) => (i - 1) * Math.min(60, b.height * 0.08);
    for (let i = 0; i < 3; i++) {
      const a = r(i);
      const sx = a.r,
        sy = a.cy,
        ex = cpu.l,
        ey = cpu.cy + (i - 1) * Math.min(22, b.height * 0.03);
      const cx = (sx + ex) / 2,
        cy = (sy + ey) / 2 - curv(i) * -1;
      routes.push({ d: `M ${sx},${sy} Q ${cx},${cy - curv(i) * 0.4} ${ex},${ey}`, sx, ex, len: 0 });
    }
    for (let i = 0; i < 3; i++) {
      const o = r(4 + i);
      const sx = cpu.r,
        sy = cpu.cy + (i - 1) * Math.min(22, b.height * 0.03),
        ex = o.l,
        ey = o.cy;
      const cx = (sx + ex) / 2,
        cy = (sy + ey) / 2;
      routes.push({ d: `M ${sx},${sy} Q ${cx},${cy + curv(i) * 0.4} ${ex},${ey}`, sx, ex, len: 0 });
    }
    beamCss.current = [cpu.cx, b.height - cpu.t];
    setLayout((prev) => ({ w: b.width, h: b.height, s: prev?.s ?? 56, routes }));
  }, []);

  // chip size from the container
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const b = el.getBoundingClientRect();
      setSize({ w: b.width, h: b.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (size.w) measure();
  }, [size, measure]);

  const s = Math.round(Math.max(40, Math.min(68, Math.min(size.w, size.h) * 0.1)));
  const cpuS = Math.round(s * 1.9);
  const portrait = size.h > size.w * 1.15;
  const inX = portrait ? 0.14 : 0.16;
  const rowsY = portrait ? [0.4, 0.55, 0.7] : [0.36, 0.56, 0.76];
  const cpuY = portrait ? 0.55 : 0.56;

  /* ── gradient pulses ── */
  const setGrad = useCallback(
    (i: number, p: number) => {
      const g = gradRefs.current[i];
      const r = layout?.routes[i];
      if (!g || !r) return;
      const span = r.ex - r.sx;
      const bw = Math.max(40, span * 0.32);
      const c = r.sx - bw + (span + bw * 2) * p;
      g.setAttribute('x1', String(c - bw));
      g.setAttribute('x2', String(c + bw));
    },
    [layout],
  );

  const pulse = useCallback(
    (i: number, delay = 0) =>
      gsap.fromTo(
        pulseProg.current[i],
        { p: 0 },
        { p: 1, duration: 1.0, delay, ease: 'power1.inOut', overwrite: true, onUpdate: () => setGrad(i, pulseProg.current[i].p) },
      ),
    [setGrad],
  );

  /* ── OGL board ── */
  useEffect(() => {
    const el = glHost.current;
    if (!el) return;
    const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 1.75), alpha: false, webgl: 2 });
    const gl = renderer.gl;
    gl.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    el.appendChild(gl.canvas);
    const program = new Program(gl, { vertex: VERT, fragment: FRAG, uniforms: u.current });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
    const draw = () => {
      const k = gl.canvas.width / Math.max(1, el.clientWidth);
      u.current.uBeamPos.value = [beamCss.current[0] * k, beamCss.current[1] * k];
      renderer.render({ scene: mesh });
    };
    drawRef.current = draw;
    const resize = () => {
      const b = el.getBoundingClientRect();
      renderer.setSize(Math.max(1, b.width), Math.max(1, b.height));
      u.current.uRes.value = [gl.canvas.width, gl.canvas.height];
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    return () => {
      ro.disconnect();
      drawRef.current = () => {};
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      gl.canvas.remove();
    };
  }, []);

  /* ── power-on timeline ── */
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const loopRef = useRef<gsap.core.Timeline | null>(null);
  useEffect(() => {
    if (!layout) return;
    const U = u.current;
    const chips = chipRefs.current;
    const bases = baseRefs.current.filter(Boolean) as SVGPathElement[];
    bases.forEach((p) => {
      const L = p.getTotalLength();
      p.style.strokeDasharray = `${L}`;
    });
    const cyan = '#00b3ff'; // --c-4 (hex so GSAP can tween the shadow)
    const mag = '#ff00a8'; // --c-2
    const tl = gsap.timeline({ paused: true });
    tl.to(U.uBeam, { value: 1, duration: 1.1, ease: 'power2.in' })
      .to(U.uHit, { value: 1, duration: 0.3, ease: 'power2.out' }, '>-0.05')
      .to(U.uFog, { value: 1, duration: 1.2, ease: 'power2.out' }, '<')
      .to(chips[3], { boxShadow: hexShadow(mag, 1), borderColor: mag, duration: 0.5 }, '<0.1')
      .to(U.uContour, { value: 1, duration: 2.4, ease: 'power2.inOut' }, '<')
      .fromTo(
        bases,
        { strokeDashoffset: (i, t: SVGPathElement) => t.getTotalLength() },
        { strokeDashoffset: 0, duration: 0.9, stagger: 0.08, ease: 'power2.out' },
        '<0.2',
      )
      .to(chips.slice(0, 3), { boxShadow: hexShadow(cyan, 1), borderColor: cyan, duration: 0.4, stagger: 0.12 }, '<0.3')
      .to(chips.slice(4, 7), { boxShadow: hexShadow(mag, 1), borderColor: mag, duration: 0.4, stagger: 0.12 }, '>0.2');
    tlRef.current = tl;

    const loop = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.5 });
    [0, 1, 2].forEach((i) => loop.add(pulse(i), i * 0.14));
    [3, 4, 5].forEach((i) => loop.add(pulse(i), 0.95 + (i - 3) * 0.14));
    loopRef.current = loop;

    if (reducedMotion) {
      tl.progress(1);
      // composed still: every trace lit with its pulse mid-route
      for (let i = 0; i < 6; i++) setGrad(i, 0.55);
      drawRef.current();
    }
    return () => {
      tl.kill();
      loop.kill();
    };
  }, [layout, reducedMotion, pulse, setGrad]);

  /* ── play / pause / progress ── */
  useEffect(() => {
    const tl = tlRef.current;
    const loop = loopRef.current;
    if (!tl || !loop || reducedMotion) return;
    if (progress !== undefined) {
      tl.progress(Math.min(1, progress * 1.6));
      if (kintsugi) u.current.uKin.value = Math.max(0, Math.min(1, (progress - 0.35) / 0.6));
    }
    if (!active) {
      tl.pause();
      loop.pause();
      return;
    }
    if (progress === undefined && tl.progress() < 1) tl.play();
    loop.play();
  }, [active, reducedMotion, progress, layout, kintsugi]);

  /* ── kintsugi toggle ── */
  useEffect(() => {
    const U = u.current;
    if (reducedMotion) {
      U.uKinOn.value = kintsugi ? 1 : 0;
      U.uKin.value = kintsugi ? 1 : 0;
      drawRef.current();
      return;
    }
    gsap.to(U.uKinOn, { value: kintsugi ? 1 : 0, duration: 0.8, ease: 'power2.inOut', overwrite: true });
    if (progress === undefined) {
      if (kintsugi) gsap.fromTo(U.uKin, { value: 0 }, { value: 1, duration: 4.5, ease: 'power1.inOut', overwrite: true });
    }
  }, [kintsugi, reducedMotion, progress]);

  /* ── render loop ── */
  useEffect(() => {
    if (!active || reducedMotion) {
      drawRef.current();
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      u.current.uTime.value += Math.min(0.05, (now - last) / 1000);
      last = now;
      drawRef.current();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reducedMotion]);

  useEffect(() => drawRef.current(), [layout]);

  const chipBase: React.CSSProperties = {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    background: 'var(--v-surface)',
    border: '1px solid rgba(255,255,255,0.14)',
    boxShadow: hexShadow('#000000', 0),
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  };

  const refire = (idx: number) => {
    if (reducedMotion) return;
    if (idx === 3) [0, 1, 2, 3, 4, 5].forEach((i) => pulse(i, i < 3 ? 0 : 0.8));
    else if (idx < 3) {
      pulse(idx);
      [3, 4, 5].forEach((i) => pulse(i, 0.85));
    } else pulse(idx - 1);
  };

  return (
    <div ref={host} className="relative h-full w-full overflow-hidden bg-[var(--v-bg)] select-none">
      <div ref={glHost} className="absolute inset-0" aria-hidden />

      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <linearGradient
              key={i}
              id={`cb-g-${i}`}
              ref={(g) => {
                gradRefs.current[i] = g;
              }}
              gradientUnits="userSpaceOnUse"
              x1="-200"
              x2="-100"
              y1="0"
              y2="0"
            >
              <stop offset="0" stopColor={i < 3 ? '#00b3ff' : '#ff00a8'} stopOpacity="0" />
              <stop offset="0.35" stopColor={i < 3 ? '#00b3ff' : '#ff00a8'} />
              <stop offset="0.55" stopColor="#ffffff" />
              <stop offset="0.75" stopColor={i < 3 ? '#7b2cff' : '#ffe600'} />
              <stop offset="1" stopColor={i < 3 ? '#7b2cff' : '#ffe600'} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {layout?.routes.map((r, i) => (
          <g key={i}>
            <path
              ref={(p) => {
                baseRefs.current[i] = p;
              }}
              d={r.d}
              fill="none"
              stroke="rgba(255,255,255,0.16)"
              strokeWidth={1.5}
            />
            <path d={r.d} fill="none" stroke={`url(#cb-g-${i})`} strokeWidth={7} strokeLinecap="round" opacity={0.28} />
            <path d={r.d} fill="none" stroke={`url(#cb-g-${i})`} strokeWidth={2.2} strokeLinecap="round" />
          </g>
        ))}
      </svg>

      {size.w > 0 &&
        [...INPUTS, 'cpu', ...OUTPUTS].map((label, i) => {
          const isCpu = i === 3;
          const x = i < 3 ? inX : i === 3 ? 0.5 : 1 - inX;
          const y = i < 3 ? rowsY[i] : i === 3 ? cpuY : rowsY[i - 4];
          const w = isCpu ? cpuS : s;
          return (
            <div
              key={label}
              ref={(d) => {
                chipRefs.current[i] = d;
              }}
              onPointerEnter={() => refire(i)}
              onClick={() => refire(i)}
              style={{ ...chipBase, left: `${x * 100}%`, top: `${y * 100}%`, width: w, height: w }}
            >
              {isCpu && (
                <>
                  {/* pins */}
                  <span
                    className="absolute inset-x-[14%] -top-[7px] h-[6px]"
                    style={{ background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.35) 0 3px, transparent 3px 9px)' }}
                  />
                  <span
                    className="absolute inset-x-[14%] -bottom-[7px] h-[6px]"
                    style={{ background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.35) 0 3px, transparent 3px 9px)' }}
                  />
                </>
              )}
              <div className="text-center">
                <p className={`pixel text-[16px] leading-[16px] ${isCpu ? 'text-white' : 'text-[var(--v-soft)]'}`}>{label}</p>
                {isCpu && <p className="pixel mt-1 text-[16px] leading-[16px] text-[var(--v-dim)]">{cpuS > 100 ? 'frontend' : 'fe'}</p>}
              </div>
            </div>
          );
        })}

      <Corner title="Circuit Board" tools={TOOLS} />
      <button
        type="button"
        onClick={() => setKintsugi((k) => !k)}
        aria-pressed={kintsugi}
        className="pixel absolute top-3 right-3 z-20 border px-2 py-1 text-[16px] leading-[16px] transition-colors"
        style={{
          background: kintsugi ? '#ffe600' : 'var(--v-bg)',
          color: kintsugi ? '#080808' : 'var(--v-ink)',
          borderColor: kintsugi ? '#ffe600' : 'var(--v-steel)',
        }}
      >
        [{kintsugi ? 'x' : ' '}] kintsugi
      </button>
    </div>
  );
}
