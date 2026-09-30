'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from '@react-three/postprocessing';
import { gsap } from 'gsap';
import { Effect } from 'postprocessing';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { BuiltWith } from '@/components/v2/experience-frame';

/*
 * Pixel Blast: a drifting cloud of square pixels, dithered with a recursive Bayer 8x8.
 *  - field: 5-octave fBm quantised per cell, thresholded by Bayer, thinned at the edges
 *  - clicks: a 10-slot ring buffer of shockwaves (uClickPos / uClickTimes)
 *  - pointer: a 64px Canvas2D trail (velocity in R/G, intensity in B) feeds a custom postprocessing
 *    Effect that warps mainUv, so the lattice smears like liquid
 *  - misprint: the headline as a riso offset (black / red / blue), picked by alpha priority,
 *    with dead pixels and GSAP-breathing low-res tiles; hover pixelates it
 */

const TOOLS = ['threejs', 'postprocessing', 'glsl', 'canvas2d', 'gsap'];
const SHAPES = [
  { id: 0, label: '■', name: 'square' },
  { id: 1, label: '●', name: 'circle' },
  { id: 2, label: '▲', name: 'triangle' },
  { id: 3, label: '◆', name: 'diamond' },
];

const vert = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uRes;
uniform float uDpr;
uniform float uPixel;
uniform float uShape;
uniform vec2 uClickPos[10];
uniform float uClickTimes[10];
uniform float uMix;
uniform float uThresh;
uniform float uHover;
uniform vec2 uPointer;
uniform sampler2D uText;
uniform float uTextAspect;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

float cellMask(vec2 l) {
  if (uShape < 0.5) return step(max(abs(l.x), abs(l.y)), 0.4);
  if (uShape < 1.5) return step(length(l), 0.44);
  if (uShape < 2.5) return step(-0.36, l.y) * step(abs(l.x), (0.42 - l.y) * 0.58);
  return step(abs(l.x) + abs(l.y), 0.48);
}

vec3 field(vec2 fc) {
  vec2 cell = floor(fc / uPixel);
  vec2 cc = (cell + 0.5) * uPixel;
  vec2 l = fract(fc / uPixel) - 0.5;
  vec2 p = cc / uRes.y * 2.6;
  float t = uTime;
  float n = fbm(p + vec2(t * 0.045, -t * 0.03) + fbm(p * 0.6 - t * 0.02) * 0.8);

  vec2 uv = cc / uRes;
  vec2 e = min(uv, 1.0 - uv) * vec2(uRes.x / uRes.y, 1.0);
  float edge = smoothstep(0.0, 0.42, min(e.x, e.y));
  float v = (n * 1.55 - 0.42) * edge;

  float ring = 0.0;
  for (int i = 0; i < 10; i++) {
    float age = uTime - uClickTimes[i];
    if (age < 0.0 || age > 2.6) continue;
    float d = length(cc - uClickPos[i] * uRes);
    float r = age * uRes.y * 0.42;
    float thick = uPixel * 3.0 + age * uPixel * 2.0;
    ring += (1.0 - smoothstep(0.0, thick, abs(d - r))) * (1.0 - age / 2.6);
  }
  v += ring * 0.9;

  float on = step(bayer8(cell) + 0.03, v) * cellMask(l);
  vec3 bg = vec3(0.172);                 // --w-desk
  float h = hash(cell + 3.7);
  vec3 grey = n > 0.62 ? vec3(0.874) : n > 0.5 ? vec3(0.753) : vec3(0.502);
  vec3 col = h < 0.13 ? vec3(0.0, 0.702, 1.0) : grey;   // one hue: --c-4
  col = mix(col, vec3(1.0), clamp(ring, 0.0, 1.0));
  return mix(bg, col, on);
}

float textA(vec2 uv) {
  float aspect = uRes.x / uRes.y;
  float tw = aspect > 1.0 ? 0.74 : 0.92;
  float th = tw * aspect / uTextAspect;
  vec2 tuv = (uv - 0.5) / vec2(tw, th) + 0.5;
  if (tuv.x < 0.0 || tuv.x > 1.0 || tuv.y < 0.0 || tuv.y > 1.0) return 0.0;
  return texture2D(uText, tuv).a;
}

vec3 misprint(vec2 fc) {
  float t = uTime;
  // low-res tiles, their share breathes (GSAP drives uThresh); hover pixelates around the pointer
  float q = 1.0;
  float blk = hash(floor(fc / (56.0 * uDpr)) + floor(t * 1.5) * 3.1);
  if (blk < uThresh) q = 10.0 * uDpr;
  float hp = uHover * (1.0 - smoothstep(0.0, 240.0 * uDpr, distance(fc, uPointer * uRes)));
  q = max(q, floor(1.0 + hp * 18.0 * uDpr));
  vec2 qfc = (floor(fc / q) + 0.5) * q;
  vec2 uv = qfc / uRes;
  // flow-field wobble
  vec2 flow = vec2(vnoise(uv * 5.0 + t * 0.35), vnoise(uv * 5.0 + 9.3 - t * 0.3)) - 0.5;
  vec2 nuv = uv + flow * 0.006;

  float aK = textA(nuv);
  float aR = textA(nuv + vec2(-0.005, 0.01));
  float aB = textA(nuv + vec2(0.005, -0.005));

  vec3 paper = vec3(1.0);
  vec3 col = paper;
  // dead pixels: block noise over the threshold, with an offset shadow
  float bs = 9.0 * uDpr;
  vec2 b0 = floor(fc / bs);
  vec2 b1 = floor((fc + vec2(-bs * 0.5, bs * 0.5)) / bs);
  float tt = floor(t * 2.0);
  float d0 = step(0.88, vnoise(b0 * 0.45 + tt * 5.7)) * step(0.62, hash(b0 + tt));
  float d1 = step(0.88, vnoise(b1 * 0.45 + tt * 5.7)) * step(0.62, hash(b1 + tt));
  if (d1 > 0.5 && d0 < 0.5) col = vec3(0.753);
  if (d0 > 0.5) col = vec3(1.0, 0.18, 0.0);               // --c-1
  // alpha priority, not blending: black over red over blue
  if (aB > 0.5) col = vec3(0.482, 0.173, 1.0);              // --c-3
  if (aR > 0.5) col = vec3(1.0, 0.18, 0.0);                 // --c-1
  if (aK > 0.5) col = vec3(0.03);
  return col;
}

// palette is authored in sRGB; the composer expects linear and encodes on output
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec3 a = field(fc);
  if (uMix <= 0.0) { gl_FragColor = vec4(toLinear(a), 1.0); return; }
  vec3 b = misprint(fc);
  // pixel-block dissolve between the two modes
  float blk = hash(floor(fc / (24.0 * uDpr)));
  gl_FragColor = vec4(toLinear(mix(a, b, step(blk, uMix * 1.02))), 1.0);
}
`;

/* Custom postprocessing effect: the trail texture warps mainUv. */
const trailFrag = /* glsl */ `
uniform sampler2D uTrail;
uniform float uStrength;
void mainUv(inout vec2 uv) {
  vec4 t = texture2D(uTrail, uv);
  uv -= (t.rg - 0.5) * 2.0 * t.b * uStrength;
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = inputColor;
}
`;

class TrailEffect extends Effect {
  constructor(tex: THREE.Texture) {
    super('TrailEffect', trailFrag, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uTrail', new THREE.Uniform(tex)],
        ['uStrength', new THREE.Uniform(0.09)],
      ]),
    });
  }
}

type Shared = {
  uniforms: Record<string, THREE.IUniform>;
  trail: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; last: { x: number; y: number } | null };
  clickIdx: number;
  time: number;
};

function Scene({ shared, running, fixedTime }: { shared: Shared; running: boolean; fixedTime: number | null }) {
  const { size, gl, invalidate } = useThree();
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    return g;
  }, []);
  const mat = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: shared.uniforms, depthTest: false, depthWrite: false }),
    [shared],
  );
  const effect = useMemo(() => new TrailEffect(shared.trail.tex), [shared]);

  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
      effect.dispose();
    },
    [geo, mat, effect],
  );

  useEffect(() => {
    const dpr = gl.getPixelRatio();
    const u = shared.uniforms;
    u.uRes.value.set(size.width * dpr, size.height * dpr);
    u.uDpr.value = dpr;
    u.uPixel.value = Math.max(5, Math.round(Math.min(size.width, size.height) / 95)) * dpr;
    invalidate();
  }, [size, gl, shared, invalidate]);

  useFrame((_, dt) => {
    const u = shared.uniforms;
    if (fixedTime !== null) shared.time = fixedTime;
    else if (running) shared.time += Math.min(dt, 0.05);
    u.uTime.value = shared.time;
    // fade the trail towards neutral (R=G=0.5, B=0)
    const { ctx, tex } = shared.trail;
    if (running) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(128,128,0,0.06)';
      ctx.fillRect(0, 0, 64, 64);
      tex.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh geometry={geo} material={mat} frustumCulled={false} />
      <EffectComposer multisampling={0}>
        <primitive object={effect} />
      </EffectComposer>
    </>
  );
}

export default function PixelBlast({ active, reducedMotion, progress }: ExperienceProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [shape, setShape] = useState(0);
  const [mode, setMode] = useState<'field' | 'misprint'>('field');
  const invalidateRef = useRef<() => void>(() => {});

  const shared = useMemo<Shared>(() => {
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : (null as unknown as HTMLCanvasElement);
    const ctx = canvas ? canvas.getContext('2d')! : (null as unknown as CanvasRenderingContext2D);
    if (canvas) {
      canvas.width = 64;
      canvas.height = 64;
      ctx.fillStyle = 'rgb(128,128,0)';
      ctx.fillRect(0, 0, 64, 64);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    const textTex = new THREE.Texture();
    return {
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uDpr: { value: 1 },
        uPixel: { value: 8 },
        uShape: { value: 0 },
        uClickPos: { value: Array.from({ length: 10 }, () => new THREE.Vector2(-9, -9)) },
        uClickTimes: { value: new Array(10).fill(-99) },
        uMix: { value: 0 },
        uThresh: { value: 0.08 },
        uHover: { value: 0 },
        uPointer: { value: new THREE.Vector2(0.5, 0.5) },
        uText: { value: textTex },
        uTextAspect: { value: 2 },
      },
      trail: { canvas, ctx, tex, last: null },
      clickIdx: 0,
      time: 7.5,
    };
  }, []);

  // Headline texture in the VGA pixel font.
  useEffect(() => {
    let cancelled = false;
    const family = "'Web IBM VGA 8x16'";
    const draw = () => {
      if (cancelled) return;
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 512;
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, 1024, 512);
      g.fillStyle = '#000';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `128px ${family}, monospace`;
      ['FRONTEND', 'DESIGN', 'BASICS'].forEach((w, i) => g.fillText(w, 512, 110 + i * 146));
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.LinearFilter;
      const old = shared.uniforms.uText.value as THREE.Texture;
      shared.uniforms.uText.value = t;
      old.dispose();
      invalidateRef.current();
    };
    document.fonts.load(`128px ${family}`).then(draw, draw);
    return () => {
      cancelled = true;
      (shared.uniforms.uText.value as THREE.Texture).dispose();
      shared.trail.tex.dispose();
    };
  }, [shared]);

  // Shape + mode, tweened by GSAP (mode change is a stepped pixel dissolve).
  useEffect(() => {
    shared.uniforms.uShape.value = shape;
    invalidateRef.current();
  }, [shape, shared]);
  useEffect(() => {
    const target = mode === 'misprint' ? 1 : 0;
    if (reducedMotion) {
      shared.uniforms.uMix.value = target;
      invalidateRef.current();
      return;
    }
    const tw = gsap.to(shared.uniforms.uMix, { value: target, duration: 0.9, ease: 'steps(14)', onUpdate: () => invalidateRef.current() });
    return () => void tw.kill();
  }, [mode, reducedMotion, shared]);

  // Misprint low-res tiles breathe.
  useEffect(() => {
    if (reducedMotion || !active || progress !== undefined) return;
    const tw = gsap.fromTo(shared.uniforms.uThresh, { value: 0.04 }, { value: 0.34, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    return () => void tw.kill();
  }, [active, reducedMotion, progress, shared]);

  // Pointer: trail, clicks, hover. Reduced motion keeps the composed still.
  useEffect(() => {
    if (reducedMotion) return;
    const el = wrapRef.current!;
    const trail = shared.trail;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      shared.uniforms.uPointer.value.set(p.x, 1 - p.y);
      const last = trail.last ?? p;
      const vx = Math.max(-1, Math.min(1, (p.x - last.x) * 18));
      const vy = Math.max(-1, Math.min(1, (p.y - last.y) * 18));
      trail.last = p;
      const speed = Math.min(1, Math.hypot(vx, vy) * 1.5);
      const g = trail.ctx;
      const cx = p.x * 64;
      const cy = p.y * 64;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, 7);
      const rgb = `${Math.round(128 + vx * 127)},${Math.round(128 - vy * 127)},${Math.round(255 * speed)}`;
      grad.addColorStop(0, `rgba(${rgb},0.9)`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad;
      g.fillRect(cx - 8, cy - 8, 16, 16);
      trail.tex.needsUpdate = true;
      if (mode === 'misprint') {
        const pr = shared.uniforms.uPointer.value;
        const overText = Math.abs(pr.x - 0.5) < 0.42 && Math.abs(pr.y - 0.5) < 0.3;
        gsap.to(shared.uniforms.uHover, {
          value: overText ? 1 : 0,
          duration: 0.4,
          ease: 'power2.out',
          overwrite: true,
          onUpdate: () => invalidateRef.current(),
        });
      }
      invalidateRef.current();
    };
    const onLeave = () => {
      trail.last = null;
      gsap.to(shared.uniforms.uHover, { value: 0, duration: 0.4, overwrite: true });
    };
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button,a')) return;
      const p = local(e);
      const i = shared.clickIdx++ % 10;
      shared.uniforms.uClickPos.value[i].set(p.x, 1 - p.y);
      shared.uniforms.uClickTimes.value[i] = shared.time;
      invalidateRef.current();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerdown', onDown);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerdown', onDown);
    };
  }, [shared, mode, reducedMotion]);

  // A first shockwave so the card announces itself.
  useEffect(() => {
    if (reducedMotion || progress !== undefined) return;
    const u = shared.uniforms;
    u.uClickPos.value[9].set(0.5, 0.5);
    u.uClickTimes.value[9] = shared.time + 0.6;
  }, [reducedMotion, progress, shared]);

  const running = active && !reducedMotion && progress === undefined;
  const fixedTime = reducedMotion ? 7.5 : progress !== undefined ? 4 + progress * 30 : null;
  useEffect(() => {
    invalidateRef.current();
  }, [progress, reducedMotion]);

  return (
    <div ref={wrapRef} className="relative h-full w-full cursor-crosshair overflow-hidden bg-w-desk select-none">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        frameloop={running ? 'always' : 'demand'}
        onCreated={({ invalidate }) => void (invalidateRef.current = () => invalidate())}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Scene shared={shared} running={running} fixedTime={fixedTime} />
      </Canvas>

      <div className="pixel pointer-events-auto absolute top-2 left-2 flex max-w-[calc(100%-16px)] flex-wrap gap-x-3 bg-black/80 px-2 py-1">
        <p className="text-[16px] leading-[16px] text-[#dfdfdf]">Pixel Blast</p>
        <BuiltWith tools={TOOLS} />
      </div>

      <div
        className="font-w95 absolute right-2 bottom-2 flex flex-wrap items-center justify-end gap-[2px] bg-w-face p-[3px] text-[11px] text-black"
        style={{ boxShadow: 'var(--w-bevel-out)' }}
      >
        {SHAPES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-label={`cell shape ${s.name}`}
            aria-pressed={shape === s.id}
            onClick={() => setShape(s.id)}
            className="grid h-[24px] w-[26px] place-items-center bg-w-face"
            style={{ boxShadow: shape === s.id ? 'var(--w-bevel-in)' : 'var(--w-bevel-out)' }}
          >
            {s.label}
          </button>
        ))}
        <span className="mx-1 h-[20px] w-px bg-w-shadow" />
        <button
          type="button"
          aria-pressed={mode === 'misprint'}
          onClick={() => setMode((m) => (m === 'field' ? 'misprint' : 'field'))}
          className="h-[24px] bg-w-face px-2"
          style={{ boxShadow: mode === 'misprint' ? 'var(--w-bevel-in)' : 'var(--w-bevel-out)' }}
        >
          {mode === 'misprint' ? 'Field' : 'Misprint'}
        </button>
      </div>
    </div>
  );
}
