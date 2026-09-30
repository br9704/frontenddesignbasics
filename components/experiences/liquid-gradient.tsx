'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { C, NOISE2, SNOISE3, raw } from './g2-glsl';
import { CornerLabel } from './g2-ui';

/*
 * Gradient Lab: big colour as a lab.
 * 00/01 are a displaced silk mesh seen from a steep angle (3D simplex along the normal, ramp by height).
 * 02..06 are fullscreen fields: domain-warped ink, predawn horizon, prismatic orb, fluted glass, stochastic grain.
 * Presets are small JSON objects; GSAP tweens every uniform (colours, speed, strength, camera) between them,
 * and mode weights crossfade, so it morphs rather than cuts.
 */

type Preset = {
  name: string;
  w: [number, number, number, number, number]; // ink, predawn, orb, fluted, grain (all 0 = the silk mesh)
  c1: string;
  c2: string;
  c3: string;
  bg: string;
  speed: number;
  strength: number;
  density: number;
  frequency: number;
  polar: number; // degrees from straight down
  azimuth: number;
  distance: number;
  grain: number;
};

function shade(hex: string, k: number) {
  // mix toward ink in plain sRGB numbers (raw colours, see g2-glsl raw)
  return '#' + raw(C.ink).lerp(raw(hex), k).getHexString(THREE.LinearSRGBColorSpace);
}

const PRESETS: Preset[] = [
  {
    name: 'Halo',
    w: [0, 0, 0, 0, 0],
    c1: shade(C.violet, 0.22),
    c2: C.violet,
    c3: C.magenta,
    bg: shade(C.violet, 0.12),
    speed: 0.35,
    strength: 0.55,
    density: 1.3,
    frequency: 1.6,
    polar: 52,
    azimuth: -10,
    distance: 5.2,
    grain: 0.09,
  },
  {
    name: 'Silk',
    w: [0, 0, 0, 0, 0],
    c1: shade(C.cyan, 0.18),
    c2: C.cyan,
    c3: '#ffffff',
    bg: shade(C.cyan, 0.1),
    speed: 0.28,
    strength: 0.8,
    density: 0.9,
    frequency: 2.4,
    polar: 68,
    azimuth: 38,
    distance: 4.3,
    grain: 0.1,
  },
  {
    name: 'Ink',
    w: [1, 0, 0, 0, 0],
    c1: shade(C.violet, 0.7),
    c2: C.cyan,
    c3: '#ffffff',
    bg: C.ink,
    speed: 0.5,
    strength: 0.6,
    density: 1.2,
    frequency: 2,
    polar: 40,
    azimuth: 0,
    distance: 5,
    grain: 0.07,
  },
  {
    name: 'Predawn',
    w: [0, 1, 0, 0, 0],
    c1: '#ff1f4a',
    c2: shade(C.violet, 0.42),
    c3: shade(C.violet, 0.1),
    bg: C.ink,
    speed: 0.6,
    strength: 0.6,
    density: 1.2,
    frequency: 2,
    polar: 40,
    azimuth: 0,
    distance: 5,
    grain: 0.08,
  },
  {
    name: 'Prism',
    w: [0, 0, 1, 0, 0],
    c1: C.red,
    c2: C.yellow,
    c3: C.cyan,
    bg: C.ink,
    speed: 0.6,
    strength: 0.6,
    density: 1.2,
    frequency: 2,
    polar: 40,
    azimuth: 0,
    distance: 5,
    grain: 0.08,
  },
  {
    name: 'Fluted',
    w: [0, 0, 0, 1, 0],
    c1: C.magenta,
    c2: C.red,
    c3: C.yellow,
    bg: shade(C.violet, 0.55),
    speed: 0.5,
    strength: 0.6,
    density: 1.2,
    frequency: 2,
    polar: 40,
    azimuth: 0,
    distance: 5,
    grain: 0.06,
  },
  {
    name: 'Grain',
    w: [0, 0, 0, 0, 1],
    c1: C.yellow,
    c2: C.red,
    c3: C.magenta,
    bg: C.violet,
    speed: 0.5,
    strength: 0.6,
    density: 1.2,
    frequency: 2,
    polar: 40,
    azimuth: 0,
    distance: 5,
    grain: 0.03,
  },
];

const heroVertex = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uStrength;
uniform float uDensity;
uniform float uFrequency;
uniform vec2 uSeed;
uniform vec2 uPtr;
uniform float uPtrAmt;
varying float vH;
varying vec3 vN;
varying vec3 vView;
varying float vDepth;
${SNOISE3}
float disp(vec2 p) {
  float t = uTime * uSpeed;
  float n = snoise(vec3(p * uDensity * 0.32 + uSeed, t * 0.55));
  float fold = sin(p.x * uFrequency * 0.45 + p.y * 0.22 + t * 1.2 + n * 1.6);
  float bump = exp(-dot(p - uPtr, p - uPtr) * 0.5) * uPtrAmt * 0.35;
  return (n * 0.6 + fold * 0.4) * uStrength + bump;
}
void main() {
  vec2 p = position.xy;
  float h = disp(p);
  float e = 0.05;
  float hx = disp(p + vec2(e, 0.0));
  float hy = disp(p + vec2(0.0, e));
  vec3 n = normalize(vec3(-(hx - h) / e, -(hy - h) / e, 1.0));
  vH = h / max(uStrength, 0.001);
  vN = normalize(normalMatrix * n);
  vec4 mv = modelViewMatrix * vec4(p, h, 1.0);
  vView = -mv.xyz;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const heroFragment = /* glsl */ `
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uBg;
uniform float uGrain;
uniform float uTime;
varying float vH;
varying vec3 vN;
varying vec3 vView;
varying float vDepth;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  float h = clamp(vH * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = h < 0.5 ? mix(uC1, uC2, h * 2.0) : mix(uC2, uC3, h * 2.0 - 1.0);
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);
  vec3 l = normalize(vec3(0.35, 0.8, 0.45));
  float diff = dot(n, l) * 0.5 + 0.5;
  float spec = pow(max(dot(reflect(-l, n), v), 0.0), 22.0);
  col *= 0.5 + 0.65 * diff;
  col += spec * 0.28 * (0.4 + h);
  col = mix(col, uBg, smoothstep(7.0, 15.0, vDepth));
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

const quadVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const quadFragment = /* glsl */ `
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uSeed;
uniform vec2 uPtr;
uniform float uPtrAmt;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uBg;
uniform float uGrain;
uniform float uW0;
uniform float uW1;
uniform float uW2;
uniform float uW3;
uniform float uW4;
varying vec2 vUv;
${NOISE2}
${SNOISE3}
vec3 ramp3(float x) { return x < 0.5 ? mix(uC1, uC2, x * 2.0) : mix(uC2, uC3, x * 2.0 - 1.0); }

vec3 inkMode(vec2 p, float t) {
  vec2 q = p * 1.5 + uSeed;
  float n = fbm(q + 4.0 * fbm(q + 4.0 * fbm(q + vec2(t * 0.05, -t * 0.03))));
  float v = pow(n * 1.5, 6.0);
  vec3 c = ramp3(clamp(n * 1.6 - 0.35, 0.0, 1.0));
  return mix(uBg, c, clamp(v, 0.0, 1.15));
}
vec3 predawnMode(vec2 uv, float t) {
  float y = uv.y + (vnoise(vec2(uv.x * 1.5 + uSeed.x, t * 0.12)) - 0.5) * 0.3;
  float d = length(vec2((uv.x - 0.5 - 0.1 * sin(t * 0.07 + uSeed.y)) * 0.85, y + 0.28));
  vec3 col = mix(uBg, uC3, smoothstep(1.35, 0.95, d));
  col = mix(col, uC2, smoothstep(1.05, 0.6, d));
  col = mix(col, uC1, smoothstep(0.66, 0.3, d));
  return col;
}
vec3 orbMode(vec2 p, float t) {
  vec2 q = (p - vec2(0.18, 0.0)) / 0.72;
  float glow = smoothstep(1.0, 0.0, length(q));
  float a = t * 0.1 + uSeed.x;
  vec2 o = vec2(cos(a), sin(a)) * 0.08;
  float r = snoise(vec3(q * 1.1 + o + uSeed, t * 0.12)) * 0.5 + 0.5;
  float g = snoise(vec3(q * 1.1 + uSeed, t * 0.12)) * 0.5 + 0.5;
  float b = snoise(vec3(q * 1.1 - o + uSeed, t * 0.12)) * 0.5 + 0.5;
  vec3 k = smoothstep(0.42, 0.92, vec3(r, g, b)) * glow * 1.5 + glow * glow * 0.05;
  return uBg + k.r * uC1 + k.g * uC2 * 0.7 + k.b * uC3;
}
vec3 blobs(vec2 q, float t) {
  vec3 col = uBg;
  vec2 c1 = vec2(sin(t * 0.21 + uSeed.x) * 0.7, cos(t * 0.17) * 0.4);
  vec2 c2 = vec2(cos(t * 0.13 + uSeed.y) * 0.8, sin(t * 0.23) * 0.5);
  vec2 c3 = vec2(sin(t * 0.11 + 2.0) * 0.5, -0.4 + cos(t * 0.19) * 0.3);
  col = mix(col, uC1, smoothstep(1.1, 0.0, length(q - c1)));
  col = mix(col, uC2, smoothstep(0.9, 0.0, length(q - c2)) * 0.85);
  col = mix(col, uC3, smoothstep(0.7, 0.0, length(q - c3)) * 0.8);
  return col;
}
vec3 flutedMode(vec2 uv, vec2 p, float t) {
  float n = floor(9.0 * uRes.x / uRes.y + 3.0);
  float s = fract(uv.x * n);
  vec2 q = p;
  q.x += (s - 0.5) * 0.22;
  vec3 col = blobs(q, t) * (0.82 + 0.3 * s);
  col += pow(1.0 - abs(s - 0.5) * 2.0, 12.0) * 0.16;
  col *= mix(0.72, 1.0, smoothstep(0.0, 0.07, s) * smoothstep(1.0, 0.9, s));
  return col;
}
vec3 grainMode(vec2 uv, vec2 p, float t) {
  float f = fbm(p * 0.8 + uSeed + vec2(t * 0.05, -t * 0.035));
  f = clamp((f - 0.3) * 2.2 + (0.5 - uv.y) * 0.5, 0.0, 1.0);
  float x = f * 3.0 + (hash21(gl_FragCoord.xy) - 0.5) * 1.1;
  float i = floor(clamp(x, 0.0, 3.99));
  return i < 0.5 ? uBg : i < 1.5 ? uC3 : i < 2.5 ? uC2 : uC1;
}

void main() {
  float sum = uW0 + uW1 + uW2 + uW3 + uW4;
  if (sum < 0.002) discard;
  float t = uTime;
  vec2 uv = vUv;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 p = (uv - 0.5) * asp * 2.0;
  // gentle pointer warp
  vec2 d = p - uPtr;
  p -= d * 0.22 * exp(-dot(d, d) * 2.2) * uPtrAmt;
  uv = p / asp * 0.5 + 0.5;
  vec3 col = vec3(0.0);
  if (uW0 > 0.001) col += inkMode(p, t) * uW0;
  if (uW1 > 0.001) col += predawnMode(uv, t) * uW1;
  if (uW2 > 0.001) col += orbMode(p, t) * uW2;
  if (uW3 > 0.001) col += flutedMode(uv, p, t) * uW3;
  if (uW4 > 0.001) col += grainMode(uv, p, t) * uW4;
  col /= max(sum, 0.001);
  col += (hash21(gl_FragCoord.xy + fract(t * 7.0) * 131.0) - 0.5) * uGrain;
  gl_FragColor = vec4(col, clamp(sum, 0.0, 1.0));
}`;

const STILL_T = 14;

function makeUniforms(seed: [number, number]) {
  const p = PRESETS[0];
  return {
    uTime: { value: STILL_T },
    uRes: { value: new THREE.Vector2(1, 1) },
    uSeed: { value: new THREE.Vector2(...seed) },
    uPtr: { value: new THREE.Vector2(0, 0) },
    uPtrAmt: { value: 0 },
    uC1: { value: raw(p.c1) },
    uC2: { value: raw(p.c2) },
    uC3: { value: raw(p.c3) },
    uBg: { value: raw(p.bg) },
    uGrain: { value: p.grain },
    uSpeed: { value: p.speed },
    uStrength: { value: p.strength },
    uDensity: { value: p.density },
    uFrequency: { value: p.frequency },
    uW0: { value: 0 },
    uW1: { value: 0 },
    uW2: { value: 0 },
    uW3: { value: 0 },
    uW4: { value: 0 },
  };
}
type U = ReturnType<typeof makeUniforms>;

function Scene({
  U,
  idx,
  reduced,
  cam,
  ptr,
}: {
  U: U;
  idx: number;
  reduced: boolean;
  cam: { polar: number; azimuth: number; distance: number };
  ptr: { x: number; y: number; amt: number };
}) {
  const { camera, size, invalidate } = useThree();
  const hero = useRef<THREE.Mesh>(null);
  const first = useRef(true);
  // Both materials share the one uniforms object; built imperatively so nothing clones it.
  const heroMat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: heroVertex, fragmentShader: heroFragment, uniforms: U }), [U]);
  const quadMat = useMemo(
    () =>
      new THREE.ShaderMaterial({ vertexShader: quadVertex, fragmentShader: quadFragment, uniforms: U, transparent: true, depthTest: false, depthWrite: false }),
    [U],
  );
  useEffect(
    () => () => {
      heroMat.dispose();
      quadMat.dispose();
    },
    [heroMat, quadMat],
  );

  useEffect(() => {
    const p = PRESETS[idx];
    const d = reduced || first.current ? 0 : 1.6;
    first.current = false;
    const ease = 'power3.inOut';
    const tl = gsap.timeline({ onUpdate: invalidate, onComplete: invalidate });
    const col = (c: THREE.Color, hex: string) => {
      const t = raw(hex);
      tl.to(c, { r: t.r, g: t.g, b: t.b, duration: d, ease }, 0);
    };
    col(U.uC1.value, p.c1);
    col(U.uC2.value, p.c2);
    col(U.uC3.value, p.c3);
    col(U.uBg.value, p.bg);
    tl.to(U.uGrain, { value: p.grain, duration: d, ease }, 0);
    tl.to(U.uSpeed, { value: p.speed, duration: d, ease }, 0);
    tl.to(U.uStrength, { value: p.strength, duration: d, ease }, 0);
    tl.to(U.uDensity, { value: p.density, duration: d, ease }, 0);
    tl.to(U.uFrequency, { value: p.frequency, duration: d, ease }, 0);
    (['uW0', 'uW1', 'uW2', 'uW3', 'uW4'] as const).forEach((k, i) => tl.to(U[k], { value: p.w[i], duration: d, ease }, 0));
    tl.to(cam, { polar: p.polar, azimuth: p.azimuth, distance: p.distance, duration: d * 1.2, ease }, 0);
    if (d === 0) tl.progress(1);
    invalidate();
    return () => {
      tl.kill();
    };
  }, [idx, reduced, U, cam, invalidate]);

  useEffect(() => {
    U.uRes.value.set(size.width, size.height);
    invalidate();
  }, [size, U, invalidate]);

  useFrame((_, dt) => {
    if (!reduced) U.uTime.value += Math.min(dt, 0.05);
    U.uPtr.value.x += (ptr.x - U.uPtr.value.x) * 0.06;
    U.uPtr.value.y += (ptr.y - U.uPtr.value.y) * 0.06;
    U.uPtrAmt.value += (ptr.amt - U.uPtrAmt.value) * 0.05;
    const sum = U.uW0.value + U.uW1.value + U.uW2.value + U.uW3.value + U.uW4.value;
    if (hero.current) hero.current.visible = sum < 0.999;
    // spherical camera around the silk; the pointer adds a small parallax
    const polar = THREE.MathUtils.degToRad(Math.max(8, cam.polar + U.uPtr.value.y * -4 * U.uPtrAmt.value));
    const az = THREE.MathUtils.degToRad(cam.azimuth + U.uPtr.value.x * 6 * U.uPtrAmt.value);
    const narrow = size.width / size.height < 0.9 ? 1.35 : 1;
    const r = cam.distance * narrow;
    camera.position.set(r * Math.sin(polar) * Math.sin(az), r * Math.cos(polar), r * Math.sin(polar) * Math.cos(az));
    camera.lookAt(0, 0, 0);
  });

  return (
    <>
      <mesh ref={hero} rotation-x={-Math.PI / 2} material={heroMat}>
        <planeGeometry args={[22, 22, 160, 260]} />
      </mesh>
      <mesh frustumCulled={false} renderOrder={1} material={quadMat}>
        <planeGeometry args={[2, 2]} />
      </mesh>
    </>
  );
}

export default function GradientLab({ active, reducedMotion, progress }: ExperienceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const touched = useRef(0);
  const U = useMemo(() => makeUniforms([Math.random() * 40, Math.random() * 40]), []);
  const cam = useMemo(() => ({ polar: PRESETS[0].polar, azimuth: PRESETS[0].azimuth, distance: PRESETS[0].distance }), []);
  const ptr = useMemo(() => ({ x: 0, y: 0, amt: 0 }), []);
  const N = PRESETS.length;

  // parent progress picks the preset
  useEffect(() => {
    if (progress === undefined) return;
    setIdx(Math.min(N - 1, Math.floor(progress * N)));
  }, [progress, N]);

  // autoplay through presets when nobody is steering
  useEffect(() => {
    if (!active || reducedMotion || progress !== undefined) return;
    const id = window.setInterval(() => {
      if (performance.now() - touched.current > 12000) setIdx((i) => (i + 1) % N);
    }, 6500);
    return () => window.clearInterval(id);
  }, [active, reducedMotion, progress, N]);

  // title swap
  useEffect(() => {
    const el = titleRef.current;
    if (!el || reducedMotion) return;
    const tw = gsap.fromTo(el.children, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.9, ease: 'expo.out', stagger: 0.06 });
    return () => {
      tw.kill();
    };
  }, [idx, reducedMotion]);

  const go = (d: number) => {
    touched.current = performance.now();
    setIdx((i) => (i + d + N) % N);
  };

  const onMove = (e: React.PointerEvent) => {
    if (reducedMotion) return;
    const b = hostRef.current!.getBoundingClientRect();
    const ax = b.width / b.height;
    ptr.x = ((e.clientX - b.left) / b.width - 0.5) * 2 * ax;
    ptr.y = (0.5 - (e.clientY - b.top) / b.height) * 2;
    ptr.amt = 1;
  };

  const p = PRESETS[idx];
  const num = String(idx).padStart(2, '0');

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full touch-pan-y overflow-hidden bg-[#080808] select-none"
      onPointerMove={onMove}
      onPointerLeave={() => (ptr.amt = 0)}
    >
      <Canvas
        className="!absolute inset-0"
        linear
        flat
        dpr={[1, 1.75]}
        frameloop={active && !reducedMotion ? 'always' : 'demand'}
        camera={{ fov: 35, near: 0.1, far: 60, position: [0, 4, 3] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={[C.ink]} />
        <Scene U={U} idx={idx} reduced={reducedMotion} cam={cam} ptr={ptr} />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
        <CornerLabel title="Gradient Lab" tools={['threejs', 'r3f', 'glsl', 'gsap']} tone="colour" />
        <div className="pixel pointer-events-auto flex items-stretch border border-white/30 bg-[#080808]/70 text-[16px] leading-[16px] text-white">
          <button type="button" aria-label="previous preset" onClick={() => go(-1)} className="px-3 py-[6px] hover:bg-white hover:text-[#080808]">
            ◂
          </button>
          <span className="min-w-[11ch] py-[6px] text-center" aria-live="polite">
            {num} {p.name}
          </span>
          <button type="button" aria-label="next preset" onClick={() => go(1)} className="px-3 py-[6px] hover:bg-white hover:text-[#080808]">
            ▸
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-white sm:left-8" style={{ textShadow: '0 1px 18px rgba(8,8,8,.35)' }}>
        <div ref={titleRef} key={idx}>
          <p className="pixel text-[16px] leading-[16px]">
            [{num}/{String(N - 1).padStart(2, '0')}]
          </p>
          <p className="font-display text-[clamp(40px,9vw,112px)] leading-[0.95] italic">{p.name}</p>
        </div>
        <div className="mt-4 flex gap-[6px]" aria-hidden>
          {PRESETS.map((q, i) => (
            <span key={q.name} className={`block h-[6px] transition-all duration-500 ${i === idx ? 'w-8 bg-white' : 'w-[6px] bg-white/45'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
