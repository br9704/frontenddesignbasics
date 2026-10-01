'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner, GLSL_NOISE } from './g3-kit';
import { StillFrames } from './g1-shared';

/*
 * Particle Portrait: 60k points (30k under 640px) sampled from three posters on this site.
 * Each image is importance-sampled on the CPU once (bright, saturated pixels get more points), and
 * every point carries its position and colour in all three pictures as attributes. The vertex shader
 * mixes between two of them and pushes each point along a curl-noise field on the way, so the
 * picture blows apart into a swirl and settles into the next one. Nothing moves on the CPU per frame.
 */

const TOOLS = ['threejs', 'r3f', 'glsl', 'canvas2d'];
const BG = '#07060d';
const IMAGES = [
  { src: '/posters/colour-riot.webp', name: 'colour riot' },
  { src: '/posters/neon-block-city.webp', name: 'neon block city' },
  { src: '/posters/light-painting.webp', name: 'light painting' },
];
// The posters are screenshots of cards: crop off the title bar, caption and corner labels.
const CROP = { x0: 0.02, y0: 0.105, x1: 0.98, y1: 0.87 };
const SRC_W = 960;
const SRC_H = 600;
const ASPECT = ((CROP.x1 - CROP.x0) * SRC_W) / ((CROP.y1 - CROP.y0) * SRC_H);
const SAMPLE_W = 320;
const SAMPLE_H = Math.round(SAMPLE_W / ASPECT);

type Built = { n: number; pos: Float32Array[]; col: Uint8Array[]; seed: Float32Array };
type Drive = {
  running: boolean;
  reduced: boolean;
  progress: number | undefined;
  m: number;
  clock: number;
  ptr: THREE.Vector2;
  ptrOn: number;
  ptrTarget: number;
};

/** Display width of the picture in CSS px: contain, a little over-wide on portrait screens. */
function fitWidth(vw: number, vh: number) {
  return Math.min(vw * (vw < vh ? 1.3 : 0.94), vh * 0.92 * ASPECT);
}

/* ─────────── sampling ─────────── */

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

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

/** Importance-sample n points from one image: xyz positions (image space) and rgb bytes, sorted by brightness. */
function sampleImage(img: HTMLImageElement, n: number, seed: number) {
  const c = document.createElement('canvas');
  c.width = SAMPLE_W;
  c.height = SAMPLE_H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const sw = img.naturalWidth || SRC_W;
  const sh = img.naturalHeight || SRC_H;
  ctx.drawImage(img, CROP.x0 * sw, CROP.y0 * sh, (CROP.x1 - CROP.x0) * sw, (CROP.y1 - CROP.y0) * sh, 0, 0, SAMPLE_W, SAMPLE_H);
  const px = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
  const count = SAMPLE_W * SAMPLE_H;
  const cdf = new Float64Array(count);
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const r = px[i * 4] / 255;
    const g = px[i * 4 + 1] / 255;
    const b = px[i * 4 + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    acc += 0.015 + Math.pow(lum, 1.4) + sat * 0.35;
    cdf[i] = acc;
  }
  const rnd = mulberry(seed);
  const picks: { i: number; x: number; y: number; l: number }[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const t = rnd() * acc;
    let lo = 0;
    let hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    const x = lo % SAMPLE_W;
    const y = (lo / SAMPLE_W) | 0;
    const l = px[lo * 4] * 0.2126 + px[lo * 4 + 1] * 0.7152 + px[lo * 4 + 2] * 0.0722;
    picks[k] = { i: lo, x: x + rnd(), y: y + rnd(), l };
  }
  // Sorting by brightness pairs bright with bright across pictures, so the swirl has a direction.
  picks.sort((a, b) => a.l - b.l);
  const pos = new Float32Array(n * 3);
  const col = new Uint8Array(n * 3);
  for (let k = 0; k < n; k++) {
    const p = picks[k];
    pos[k * 3] = (p.x / SAMPLE_W - 0.5) * ASPECT;
    pos[k * 3 + 1] = 0.5 - p.y / SAMPLE_H;
    pos[k * 3 + 2] = (rnd() - 0.5) * 0.02;
    col[k * 3] = px[p.i * 4];
    col[k * 3 + 1] = px[p.i * 4 + 1];
    col[k * 3 + 2] = px[p.i * 4 + 2];
  }
  return { pos, col };
}

async function build(n: number): Promise<Built> {
  const imgs = await Promise.all(IMAGES.map((i) => loadImage(i.src)));
  const pos: Float32Array[] = [];
  const col: Uint8Array[] = [];
  imgs.forEach((img, k) => {
    const s = sampleImage(img, n, 11 + k * 97);
    pos.push(s.pos);
    col.push(s.col);
  });
  const rnd = mulberry(7);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) seed[i] = rnd();
  return { n, pos, col, seed };
}

/* ─────────── shaders ─────────── */

const vert = /* glsl */ `
${GLSL_NOISE}
attribute vec3 aP0; attribute vec3 aP1; attribute vec3 aP2;
attribute vec3 aC0; attribute vec3 aC1; attribute vec3 aC2;
attribute float aSeed;
uniform vec3 uFrom; uniform vec3 uTo; // one-hot picture selectors
uniform float uT;
uniform float uTime;
uniform vec2 uFit;
uniform float uSize;
uniform vec2 uPtr;
uniform float uPtrOn;
varying vec3 vCol;
varying float vA;

vec3 snoiseVec3(vec3 x) {
  return vec3(snoise(x), snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)), snoise(vec3(x.z + 74.2, x.x - 124.4, x.y + 99.4)));
}
vec3 curl(vec3 p) {
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0), dy = vec3(0.0, e, 0.0), dz = vec3(0.0, 0.0, e);
  vec3 px0 = snoiseVec3(p - dx), px1 = snoiseVec3(p + dx);
  vec3 py0 = snoiseVec3(p - dy), py1 = snoiseVec3(p + dy);
  vec3 pz0 = snoiseVec3(p - dz), pz1 = snoiseVec3(p + dz);
  float x = py1.z - py0.z - pz1.y + pz0.y;
  float y = pz1.x - pz0.x - px1.z + px0.z;
  float z = px1.y - px0.y - py1.x + py0.x;
  return vec3(x, y, z) / (2.0 * e);
}

void main() {
  vec3 a = aP0 * uFrom.x + aP1 * uFrom.y + aP2 * uFrom.z;
  vec3 b = aP0 * uTo.x + aP1 * uTo.y + aP2 * uTo.z;
  vec3 ca = aC0 * uFrom.x + aC1 * uFrom.y + aC2 * uFrom.z;
  vec3 cb = aC0 * uTo.x + aC1 * uTo.y + aC2 * uTo.z;

  // each point leaves a little later than the last, so the picture peels rather than jumps
  float lt = clamp((uT - aSeed * 0.35) / 0.65, 0.0, 1.0);
  float e = lt * lt * (3.0 - 2.0 * lt);
  float s = sin(3.14159265 * lt);
  vec3 p = mix(a, b, e);
  if (s > 0.001) {
    vec3 c = curl(p * 1.7 + vec3(0.0, 0.0, uTime * 0.12 + aSeed * 0.5));
    p += c * s * 0.055 + vec3(0.0, 0.0, s * (aSeed - 0.5) * 0.7);
  }
  // a gentle breathing drift while settled
  p.z += 0.015 * sin(uTime * 0.8 + aSeed * 40.0);

  // the pointer pushes points aside
  vec2 d = p.xy - uPtr;
  float f = exp(-dot(d, d) / 0.012) * uPtrOn;
  p.xy += normalize(d + 1e-4) * f * 0.07;
  p.z += f * 0.25;

  float w = 1.0 / max(0.3, 1.0 - p.z * 0.45);
  gl_Position = vec4(p.xy * uFit * w, 0.0, 1.0);
  gl_PointSize = uSize * w * (1.0 + s * 0.2);
  vCol = mix(ca, cb, e) + s * 0.12;
  vA = 0.92 - s * 0.25;
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vCol;
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = dot(q, q);
  if (r > 0.25) discard;
  float a = smoothstep(0.25, 0.08, r) * vA;
  gl_FragColor = vec4(vCol, a);
}
`;

/* ─────────── timing ─────────── */

/** Parent progress onto the morph (0..2), with holds so every picture is readable. */
function progressToMorph(p: number) {
  const k = Math.min(1, Math.max(0, p));
  if (k < 0.15) return 0;
  if (k < 0.45) return (k - 0.15) / 0.3;
  if (k < 0.55) return 1;
  if (k < 0.85) return 1 + (k - 0.55) / 0.3;
  return 2;
}
const HOLD = 2.4;
const MORPH = 3.2;
const PERIOD = HOLD + MORPH;
/** Own clock: hold, morph, next picture; loops back to the first. Returns 0..3. */
function clockToMorph(t: number) {
  const cyc = t % (PERIOD * 3);
  const i = Math.floor(cyc / PERIOD);
  const f = cyc - i * PERIOD;
  return i + (f < HOLD ? 0 : (f - HOLD) / MORPH);
}

/* ─────────── points ─────────── */

const ONE_HOT = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

function Points({ data, drive, label }: { data: Built; drive: RefObject<Drive>; label: RefObject<HTMLParagraphElement | null> }) {
  const size = useThree((s) => s.size);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    data.pos.forEach((p, i) => g.setAttribute(`aP${i}`, new THREE.BufferAttribute(p, 3)));
    data.col.forEach((c, i) => g.setAttribute(`aC${i}`, new THREE.BufferAttribute(c, 3, true)));
    g.setAttribute('aSeed', new THREE.BufferAttribute(data.seed, 1));
    // `position` sets the draw count for three; the shader never reads it
    g.setAttribute('position', new THREE.BufferAttribute(data.pos[0], 3));
    return g;
  }, [data]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uFrom: { value: ONE_HOT[0].clone() },
          uTo: { value: ONE_HOT[1].clone() },
          uT: { value: 0 },
          uTime: { value: 0 },
          uFit: { value: new THREE.Vector2(1, 1) },
          uSize: { value: 2 },
          uPtr: { value: new THREE.Vector2(9, 9) },
          uPtrOn: { value: 0 },
        },
      }),
    [],
  );
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const lastLabel = useRef(-1);

  useFrame((state, delta) => {
    const d = drive.current;
    const dpr = state.viewport.dpr;
    const dt = d.running ? Math.min(delta, 0.1) : 0;
    d.clock += dt;

    let target: number;
    if (d.progress !== undefined) target = progressToMorph(d.progress);
    else if (d.reduced) target = 0;
    else target = clockToMorph(d.clock);
    if (d.reduced) target = Math.round(target);
    if (d.progress !== undefined && d.running) {
      d.m += (target - d.m) * (1 - Math.exp(-dt * 6));
      if (Math.abs(target - d.m) < 1e-4) d.m = target;
    } else d.m = target;

    const m = ((d.m % 3) + 3) % 3;
    const i = Math.min(2, Math.floor(m + 1e-6));
    const t = m - i;
    const u = mat.uniforms;
    (u.uFrom.value as THREE.Vector3).copy(ONE_HOT[i]);
    (u.uTo.value as THREE.Vector3).copy(ONE_HOT[(i + 1) % 3]);
    u.uT.value = t;
    u.uTime.value = d.clock;

    const vw = size.width;
    const vh = size.height;
    const wd = fitWidth(vw, vh);
    (u.uFit.value as THREE.Vector2).set((2 * wd) / (ASPECT * vw), (2 * wd) / (ASPECT * vh));
    u.uSize.value = Math.max(1.5, Math.sqrt((wd * (wd / ASPECT)) / data.n) * 1.55) * dpr;

    d.ptrOn += (d.ptrTarget - d.ptrOn) * (d.running ? 1 - Math.exp(-dt * 8) : 1);
    u.uPtrOn.value = d.reduced ? 0 : d.ptrOn;
    (u.uPtr.value as THREE.Vector2).copy(d.ptr);

    const shown = t < 0.5 ? i : (i + 1) % 3;
    if (shown !== lastLabel.current && label.current) {
      lastLabel.current = shown;
      label.current.textContent = `${String(shown + 1).padStart(2, '0')} / 03 · ${IMAGES[shown].name}`;
    }
  });

  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/* ─────────── component ─────────── */

export default function ParticlePortrait({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLParagraphElement>(null);
  const [data, setData] = useState<Built | null>(null);
  const [failed, setFailed] = useState(false);
  const running = active && !reducedMotion;
  const drive = useRef<Drive>({
    running,
    reduced: reducedMotion,
    progress,
    m: progress !== undefined ? progressToMorph(progress) : 0,
    clock: 0,
    ptr: new THREE.Vector2(9, 9),
    ptrOn: 0,
    ptrTarget: 0,
  });
  drive.current.running = running;
  drive.current.reduced = reducedMotion;
  drive.current.progress = progress;

  useEffect(() => {
    let dead = false;
    const w = host.current?.clientWidth || window.innerWidth;
    build(w < 640 ? 30000 : 60000)
      .then((b) => !dead && setData(b))
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
    };
  }, []);

  const onMove = (e: ReactPointerEvent) => {
    if (reducedMotion) return;
    const el = host.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const wd = fitWidth(r.width, r.height);
    const hd = wd / ASPECT;
    drive.current.ptr.set(((e.clientX - r.left - r.width / 2) / wd) * ASPECT, -(e.clientY - r.top - r.height / 2) / hd);
    drive.current.ptrTarget = 1;
  };
  const onLeave = () => {
    drive.current.ptrTarget = 0;
  };

  return (
    <div
      ref={host}
      className="relative h-full w-full touch-pan-y overflow-hidden select-none"
      style={{ background: BG }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      {data && (
        <Canvas
          style={{ position: 'absolute', inset: 0 }}
          dpr={[1, 1.5]}
          frameloop={running ? 'always' : 'demand'}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => gl.setClearColor(BG, 1)}
        >
          <Points data={data} drive={drive} label={label} />
          <StillFrames running={running} deps={[progress, reducedMotion]} />
        </Canvas>
      )}
      {!data && (
        <p className="pixel absolute inset-0 grid place-items-center text-[16px] leading-[16px] text-[#8a8a8a]">
          {failed ? 'the pictures did not load' : '[████░░░░] sampling pictures'}
        </p>
      )}
      <Corner title="Particle Portrait" tools={TOOLS} />
      <div className="pointer-events-none absolute right-3 bottom-3 left-3 flex items-end justify-between gap-3">
        <p ref={label} className="pixel bg-[#07060d]/80 px-2 py-1 text-[16px] leading-[16px] text-[#f5f5f5]">
          01 / 03 · {IMAGES[0].name}
        </p>
        <p className="pixel hidden bg-[#07060d]/80 px-2 py-1 text-[16px] leading-[16px] text-[#b0b0b0] sm:block">
          {data ? `${Math.round(data.n / 1000)}k points · move to push` : ''}
        </p>
      </div>
    </div>
  );
}
