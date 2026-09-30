'use client';

/*
 * Kinetic Poster: a full-bleed type poster in three beats, one WebGL context.
 *  01 strips (Day 034) One BufferGeometry of thin quads. Each row is cut into 4 slices with a little x/y
 *                      jitter; the slices sample a canvas atlas (hairline serif + heavy grotesk) and every 4
 *                      share a seed: u = fract(u + seed + t*(0.05 + seed*0.2)). Around a wobbling blob:
 *                      GPU simplex displacement, a 3-stop ramp indexed by N·L with grain, dark fresnel rim.
 *                      Scroll speed feeds a speed uniform through gsap.quickTo. Letters near the cursor get
 *                      bolder (a max-of-taps dilation in the shader).
 *  02 melt    (Day 002) per-letter planes drop in on a GSAP stagger, then melt out of sync: a spiky
 *                      noise column drags the ink down into grainy powder.
 *  03 wall    (Day 018) PlaneGeometry(1,1,1,100) turned rotateY(-0.9), rows of type waving in depth, and
 *                      a pow-8 sharpened noise smear pushing colour through the letters.
 * Click anywhere to change the palette.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner, GLSL_NOISE, useCanvasFonts, useEnergy, type Energy } from './g3-kit';

const TOOLS = ['r3f', 'drei', 'glsl', 'gsap', 'lenis', 'canvas2d', 'css'];
const BEATS = [
  { name: '01 / strips', dur: 8 },
  { name: '02 / melt', dur: 5.5 },
  { name: '03 / wall', dur: 6.5 },
];
const TOTAL = BEATS.reduce((a, b) => a + b.dur, 0);

type Fonts = { sans: string; display: string; mono: string; pixel: string };
type Palette = { bg: string; ink: string; a: string; b: string; c: string; rim: string; s1: string; s2: string };
// Only --c-1..--c-6, #080808 and #ffffff. Text on colour is #080808 or #ffffff.
const PALETTES: Palette[] = [
  { bg: '#ffe600', ink: '#080808', a: '#ff00a8', b: '#00b3ff', c: '#ffffff', rim: '#080808', s1: '#00b3ff', s2: '#ff2e00' },
  { bg: '#00b3ff', ink: '#080808', a: '#ffe600', b: '#ff00a8', c: '#ffffff', rim: '#080808', s1: '#ffe600', s2: '#ff2e00' },
  { bg: '#080808', ink: '#ffffff', a: '#7b2cff', b: '#00e676', c: '#ffffff', rim: '#080808', s1: '#00b3ff', s2: '#ff2e00' },
  { bg: '#ff00a8', ink: '#080808', a: '#ffe600', b: '#00b3ff', c: '#ffffff', rim: '#080808', s1: '#00e676', s2: '#ffe600' },
];

function v3(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/* ───────────── atlases ───────────── */

function tex(c: HTMLCanvasElement, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  if (repeat) t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

function buildAtlases(f: Fonts) {
  // Strip atlas: two lines, each an exact repeat unit so fract() tiles seamlessly.
  const LH = 256;
  const serif = `300 206px ${f.display}`;
  const heavy = `900 196px ${f.sans}`;
  const m = document.createElement('canvas').getContext('2d')!;
  const width = (font: string, s: string, sp: string) => {
    m.font = font;
    m.letterSpacing = sp;
    return m.measureText(s).width;
  };
  const units = [
    [
      { s: 'NOISE', font: serif, sp: '6px' },
      { s: 'ADDICT', font: heavy, sp: '-4px' },
    ],
    [
      { s: 'ADDICT', font: serif, sp: '6px' },
      { s: 'NOISE', font: heavy, sp: '-4px' },
    ],
  ];
  const gap = 34;
  const lineW = units.map((u) => u.reduce((a, p) => a + width(p.font, p.s, p.sp) + gap, 0));
  const W = Math.ceil(Math.max(...lineW));
  const strips = document.createElement('canvas');
  strips.width = W;
  strips.height = LH * 2;
  const sc = strips.getContext('2d')!;
  sc.fillStyle = '#000';
  sc.fillRect(0, 0, W, LH * 2);
  sc.fillStyle = '#fff';
  sc.textBaseline = 'alphabetic';
  units.forEach((u, li) => {
    let x = gap / 2;
    u.forEach((p) => {
      sc.font = p.font;
      sc.letterSpacing = p.sp;
      sc.fillText(p.s, x, li * LH + 200);
      x += width(p.font, p.s, p.sp) + gap;
    });
  });

  // Melt letters: one cell per letter, room below for the drip.
  const word = 'melt';
  const cellW = 300;
  const cellH = 600;
  const melt = document.createElement('canvas');
  melt.width = cellW * word.length;
  melt.height = cellH;
  const mc = melt.getContext('2d')!;
  mc.fillStyle = '#000';
  mc.fillRect(0, 0, melt.width, cellH);
  mc.fillStyle = '#fff';
  mc.font = `400 330px ${f.display}`;
  mc.textAlign = 'center';
  mc.textBaseline = 'alphabetic';
  [...word].forEach((ch, i) => mc.fillText(ch, i * cellW + cellW / 2, 250));

  // Wall: rows of the word, faux-italic.
  const wall = document.createElement('canvas');
  wall.width = 1200;
  wall.height = 2048;
  const wc = wall.getContext('2d')!;
  wc.fillStyle = '#000';
  wc.fillRect(0, 0, 1200, 2048);
  wc.fillStyle = '#fff';
  wc.font = `500 300px ${f.sans}`;
  wc.letterSpacing = '-8px';
  for (let r = 0; r < 8; r++) {
    wc.save();
    wc.translate(80, 220 + r * 256);
    wc.transform(1, 0, -0.2, 1, 0, 0);
    wc.fillText('kinetic', 0, 0);
    wc.restore();
  }
  return {
    strips: tex(strips),
    stripFrac: lineW.map((w) => w / W),
    stripAspect: lineW.map((w) => w / LH),
    melt: tex(melt),
    meltCount: word.length,
    meltAspect: cellW / cellH,
    wall: (() => {
      const t = tex(wall);
      t.wrapT = THREE.RepeatWrapping;
      return t;
    })(),
  };
}

/* ───────────── shaders ───────────── */

const STRIP_VERT = /* glsl */ `
attribute float aSeed;
attribute float aJit;
attribute float aLine;
attribute vec2 aV;      // v range of this slice in the atlas
attribute float aDir;
varying float vSeed, vJit, vLine, vDir;
varying vec2 vRange;
varying vec2 vWorld;
varying float vLocalY;
void main() {
  vSeed = aSeed; vJit = aJit; vLine = aLine; vDir = aDir; vRange = aV;
  vLocalY = uv.y;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xy;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const STRIP_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uT, uRowH, uAlpha, uBold;
uniform vec2 uFrac, uAspect, uPtr;
uniform vec3 uInk;
varying float vSeed, vJit, vLine, vDir;
varying vec2 vRange;
varying vec2 vWorld;
varying float vLocalY;
float ink(vec2 st) { return texture2D(uAtlas, st).r; }
void main() {
  float frac = mix(uFrac.x, uFrac.y, vLine);
  float asp = mix(uAspect.x, uAspect.y, vLine);
  float u = vWorld.x / (uRowH * asp);
  u = fract(u + vSeed + vJit + vDir * uT * (0.05 + vSeed * 0.2));
  vec2 st = vec2(u * frac, mix(vRange.x, vRange.y, vLocalY));
  float d = length(vWorld - uPtr) / uRowH;
  float bold = uBold * smoothstep(3.2, 0.0, d);
  float a = ink(st);
  if (bold > 0.01) {
    float o = bold * 0.0035;
    a = max(a, max(ink(st + vec2(o, 0.0)), ink(st - vec2(o, 0.0))));
    a = max(a, max(ink(st + vec2(0.0, o * 2.0)), ink(st - vec2(0.0, o * 2.0))));
  }
  gl_FragColor = vec4(uInk, smoothstep(0.25, 0.75, a) * uAlpha);
}
`;

const BLOB_VERT = /* glsl */ `
uniform float uT, uR;
varying vec3 vN;
varying vec3 vView;
${GLSL_NOISE}
float disp(vec3 p) { return snoise(p * 0.95 + vec3(0.0, uT * 0.2, uT * 0.08)) * 0.17 + snoise(p * 1.9 - uT * 0.15) * 0.035; }
vec3 place(vec3 n) { return n * (1.0 + disp(n)); }
void main() {
  vec3 n = normalize(position);
  vec3 p = place(n);
  vec3 t = normalize(cross(n, abs(n.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
  vec3 b = normalize(cross(n, t));
  float e = 0.02;
  vec3 p1 = place(normalize(n + t * e));
  vec3 p2 = place(normalize(n + b * e));
  vec3 nn = normalize(cross(p1 - p, p2 - p));
  if (dot(nn, n) < 0.0) nn = -nn;
  vN = normalize(normalMatrix * nn);
  vec4 mv = modelViewMatrix * vec4(p * uR, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;
const BLOB_FRAG = /* glsl */ `
uniform vec3 uA, uB, uC, uRim;
uniform float uAlpha;
varying vec3 vN;
varying vec3 vView;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vView);
  vec3 L = normalize(vec3(-0.45, 0.6, 0.75));
  float g = (hash(gl_FragCoord.xy) - 0.5) * 0.09;
  float ndl = clamp(dot(N, L) * 0.5 + 0.5 + g, 0.0, 1.0);
  vec3 ramp = ndl < 0.5 ? mix(uA, uB, ndl * 2.0) : mix(uB, uC, (ndl - 0.5) * 2.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  vec3 col = mix(ramp, uRim, clamp(fres * 1.1, 0.0, 1.0));
  gl_FragColor = vec4(col, uAlpha);
}
`;

const MELT_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uIndex, uCount, uMelt, uT, uAlpha;
uniform vec3 uInk;
varying vec2 vUv;
${GLSL_NOISE}
void main() {
  vec2 uv = vUv;
  float seed = uIndex * 7.13;
  // spiky columns: n = pow(noise*2, 10)-ish, clamped
  float col = clamp(snoise(vec2(uv.x * 7.0 + seed, seed)) * 0.5 + 0.5, 0.0, 1.0);
  float spike = pow(col * 1.25, 6.0);
  float drip = uMelt * (0.08 + 0.75 * spike);
  vec2 st = uv;
  st.y += drip * smoothstep(0.0, 1.0, 1.0 - uv.y + 0.4);
  st.x += 0.02 * uMelt * snoise(vec2(uv.y * 12.0 - uT, seed));
  vec2 atlas = vec2((uIndex + st.x) / uCount, st.y);
  float a = (st.x < 0.0 || st.x > 1.0 || st.y > 1.0) ? 0.0 : texture2D(uTex, atlas).r;
  // grainy powder: more holes the further it has run
  float h = fract(sin(dot(floor(gl_FragCoord.xy / 1.5) + floor(uT * 12.0), vec2(12.9898, 78.233))) * 43758.5453);
  float powder = uMelt * smoothstep(0.1, 0.9, drip) * 1.2 + uMelt * 0.15;
  a *= step(powder * 0.9, h);
  a *= 1.0 - smoothstep(0.75, 1.0, uMelt);
  gl_FragColor = vec4(uInk, smoothstep(0.3, 0.7, a) * uAlpha);
}
`;
const PLAIN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const WALL_VERT = /* glsl */ `
uniform float uT, uDepth, uRepY;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  p.z += uDepth * (1.0 + sin(uv.y * 10.0 * uRepY / 2.0 + uT * 1.4)) * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;
const WALL_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uT, uAlpha, uRepY;
uniform vec3 uInk, uS1, uS2;
varying vec2 vUv;
${GLSL_NOISE}
void main() {
  vec2 uv = vUv;
  float n = snoise(vec2(uv.x * 1.6 - uT * 0.12, uv.y * 2.4 + uT * 0.2)) * 0.5 + 0.5;
  float smear = pow(n, 8.0) * 6.0;
  smear = clamp(smear, 0.0, 1.0);
  vec2 st = vec2(uv.x, uv.y * uRepY);
  st.y += smear * 0.035 * sin(uv.x * 20.0 + uT);
  st.x -= smear * 0.02;
  float a = texture2D(uTex, st).r;
  float a2 = texture2D(uTex, st + vec2(0.0, smear * 0.02)).r;
  a = max(a, a2 * smear);
  vec3 streak = mix(uS1, uS2, smoothstep(0.2, 0.9, snoise(vec2(uv.y * 6.0, uT * 0.3)) * 0.5 + 0.5));
  vec3 c = mix(uInk, streak, smear);
  gl_FragColor = vec4(c, smoothstep(0.3, 0.7, a) * uAlpha);
}
`;

/* ───────────── geometry ───────────── */

function stripGeometry(vw: number, vh: number, rowH: number) {
  const rows = Math.ceil(vh / rowH) + 1;
  const SL = 4;
  const n = rows * SL;
  const pos = new Float32Array(n * 4 * 3);
  const uv = new Float32Array(n * 4 * 2);
  const seed = new Float32Array(n * 4);
  const jit = new Float32Array(n * 4);
  const line = new Float32Array(n * 4);
  const vr = new Float32Array(n * 4 * 2);
  const dir = new Float32Array(n * 4);
  const idx: number[] = [];
  let rnd = 7;
  const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  const x0 = -vw / 2 - rowH;
  const x1 = vw / 2 + rowH;
  const top = (rows * rowH) / 2;
  let q = 0;
  for (let r = 0; r < rows; r++) {
    const s = rand();
    const ln = r % 2;
    for (let k = 0; k < SL; k++, q++) {
      const sh = rowH / SL;
      const gap = sh * 0.07;
      const yj = (rand() - 0.5) * sh * 0.25;
      const yTop = top - r * rowH - k * sh + yj;
      const yBot = yTop - sh + gap;
      const xj = (rand() - 0.5) * rowH * 0.03;
      const jv = (rand() - 0.5) * 0.014;
      const corners = [
        [x0 + xj, yBot, 0, 0],
        [x1 + xj, yBot, 1, 0],
        [x1 + xj, yTop, 1, 1],
        [x0 + xj, yTop, 0, 1],
      ];
      // atlas: line ln occupies v in [1-(ln+1)*0.5, 1-ln*0.5]; slice k from the top
      const lv0 = 1 - (ln + 1) * 0.5;
      const vTop = lv0 + 0.5 * (1 - k / SL);
      const vBot = lv0 + 0.5 * (1 - (k + 1) / SL);
      corners.forEach((c, ci) => {
        const vi = q * 4 + ci;
        pos.set([c[0], c[1], 0], vi * 3);
        uv.set([c[2], c[3]], vi * 2);
        seed[vi] = s;
        jit[vi] = jv;
        line[vi] = ln;
        vr.set([vBot, vTop], vi * 2);
        dir[vi] = ln ? -1 : 1;
      });
      const b = q * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aJit', new THREE.BufferAttribute(jit, 1));
  g.setAttribute('aLine', new THREE.BufferAttribute(line, 1));
  g.setAttribute('aV', new THREE.BufferAttribute(vr, 2));
  g.setAttribute('aDir', new THREE.BufferAttribute(dir, 1));
  g.setIndex(idx);
  return g;
}

/* ───────────── scene ───────────── */

function Scene({
  atlas,
  palette,
  active,
  reduced,
  progress,
  energy,
  step,
  pointer,
  onBeat,
}: {
  atlas: ReturnType<typeof buildAtlases>;
  palette: Palette;
  active: boolean;
  reduced: boolean;
  progress?: number;
  energy: RefObject<Energy>;
  step: (dt: number) => number;
  pointer: RefObject<{ x: number; y: number; inside: boolean }>;
  onBeat: (b: number) => void;
}) {
  const { viewport, invalidate, scene } = useThree();
  const vw = viewport.width;
  const vh = viewport.height;
  const rowH = Math.min(vh / 7.5, vw / 4.6);
  const blobR = Math.min(vw, vh) * 0.26;

  const cols = useRef({
    bg: v3(palette.bg),
    ink: v3(palette.ink),
    a: v3(palette.a),
    b: v3(palette.b),
    c: v3(palette.c),
    rim: v3(palette.rim),
    s1: v3(palette.s1),
    s2: v3(palette.s2),
  });
  const bgColor = useMemo(() => new THREE.Color(), []);

  const stripMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: STRIP_VERT,
        fragmentShader: STRIP_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uAtlas: { value: atlas.strips },
          uT: { value: 0 },
          uRowH: { value: 1 },
          uAlpha: { value: 1 },
          uBold: { value: 0 },
          uFrac: { value: new THREE.Vector2(atlas.stripFrac[0], atlas.stripFrac[1]) },
          uAspect: { value: new THREE.Vector2(atlas.stripAspect[0], atlas.stripAspect[1]) },
          uPtr: { value: new THREE.Vector2(9999, 9999) },
          uInk: { value: cols.current.ink },
        },
      }),
    [atlas],
  );
  const blobMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BLOB_VERT,
        fragmentShader: BLOB_FRAG,
        transparent: true,
        uniforms: {
          uT: { value: 0 },
          uR: { value: 1 },
          uAlpha: { value: 1 },
          uA: { value: cols.current.a },
          uB: { value: cols.current.b },
          uC: { value: cols.current.c },
          uRim: { value: cols.current.rim },
        },
      }),
    [],
  );
  const meltMats = useMemo(
    () =>
      Array.from(
        { length: atlas.meltCount },
        (_, i) =>
          new THREE.ShaderMaterial({
            vertexShader: PLAIN_VERT,
            fragmentShader: MELT_FRAG,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            uniforms: {
              uTex: { value: atlas.melt },
              uIndex: { value: i },
              uCount: { value: atlas.meltCount },
              uMelt: { value: 0 },
              uT: { value: 0 },
              uAlpha: { value: 0 },
              uInk: { value: cols.current.ink },
            },
          }),
      ),
    [atlas],
  );
  const wallMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: WALL_VERT,
        fragmentShader: WALL_FRAG,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        uniforms: {
          uTex: { value: atlas.wall },
          uT: { value: 0 },
          uDepth: { value: 0.3 },
          uRepY: { value: 2 },
          uAlpha: { value: 0 },
          uInk: { value: cols.current.ink },
          uS1: { value: cols.current.s1 },
          uS2: { value: cols.current.s2 },
        },
      }),
    [atlas],
  );
  const stripGeo = useMemo(() => stripGeometry(vw, vh, rowH), [vw, vh, rowH]);
  useEffect(() => () => stripGeo.dispose(), [stripGeo]);
  useEffect(
    () => () => {
      stripMat.dispose();
      blobMat.dispose();
      meltMats.forEach((m) => m.dispose());
      wallMat.dispose();
    },
    [stripMat, blobMat, meltMats, wallMat],
  );

  // palette crossfade (GSAP tweens the vec3s in place)
  useEffect(() => {
    const C = cols.current;
    const to = { bg: palette.bg, ink: palette.ink, a: palette.a, b: palette.b, c: palette.c, rim: palette.rim, s1: palette.s1, s2: palette.s2 };
    (Object.keys(to) as (keyof typeof to)[]).forEach((k) => {
      const t = v3(to[k]);
      if (reduced) C[k].copy(t);
      else gsap.to(C[k], { x: t.x, y: t.y, z: t.z, duration: 0.7, ease: 'power2.inOut', onUpdate: invalidate });
    });
    invalidate();
  }, [palette, reduced, invalidate]);

  // speed uniform through gsap.quickTo, fed by scroll velocity
  const speed = useRef({ v: 1 });
  const speedTo = useMemo(() => gsap.quickTo(speed.current, 'v', { duration: 0.6, ease: 'power3.out' }), []);
  const bold = useRef({ v: 0 });
  const boldTo = useMemo(() => gsap.quickTo(bold.current, 'v', { duration: 0.4, ease: 'power2.out' }), []);

  const meltRefs = useRef<(THREE.Mesh | null)[]>([]);
  const blobRef = useRef<THREE.Mesh>(null);
  const S = useRef({ t: 0, scroll: 0, beat: -1, meltTl: null as gsap.core.Timeline | null });

  // Melt choreography as a paused GSAP timeline, scrubbed by beat-local time.
  const meltLayout = useMemo(() => {
    const h = Math.min(vh * 0.62, vw * 0.5);
    const w = h * atlas.meltAspect;
    return Array.from({ length: atlas.meltCount }, (_, i) => {
      const k = i - (atlas.meltCount - 1) / 2;
      return { x: k * w * 0.52, y: -k * h * 0.2 - h * 0.04, w, h };
    });
  }, [vw, vh, atlas]);
  const meltState = useRef(Array.from({ length: atlas.meltCount }, () => ({ y: 0, a: 0, m: 0 })));
  useEffect(() => {
    const st = meltState.current;
    const tl = gsap.timeline({ paused: true });
    st.forEach((s, i) => {
      tl.fromTo(s, { y: vh * 0.9, a: 0 }, { y: 0, a: 1, duration: 1.2, ease: 'expo.out' }, 0.1 + i * 0.1);
      // out of sync: seeded delays
      const d = 1.9 + ((i * 0.37) % 1) * 1.1;
      tl.fromTo(s, { m: 0 }, { m: 1, duration: 2.2, ease: 'power2.in' }, d);
    });
    tl.set({}, {}, BEATS[1].dur);
    S.current.meltTl = tl;
    return () => {
      tl.kill();
    };
  }, [vh]);

  const applyColours = () => {
    const C = cols.current;
    bgColor.setRGB(C.bg.x, C.bg.y, C.bg.z, THREE.SRGBColorSpace);
    scene.background = bgColor;
  };

  const render = (beat: number, local: number, t: number, e: number, fadeIn: number) => {
    applyColours();
    stripMat.uniforms.uT.value = S.current.scroll;
    stripMat.uniforms.uRowH.value = rowH;
    stripMat.uniforms.uAlpha.value = beat === 0 ? fadeIn : 0;
    stripMat.uniforms.uBold.value = bold.current.v;
    const ptr = pointer.current;
    (stripMat.uniforms.uPtr.value as THREE.Vector2).set(ptr.x * vw * 0.5, ptr.y * vh * 0.5);

    const blob = blobRef.current;
    if (blob) {
      blob.visible = beat !== 2;
      blobMat.uniforms.uT.value = t;
      const breathe = 1 + Math.sin(t * 1.3) * 0.03;
      blobMat.uniforms.uR.value = (beat === 1 ? blobR * 0.8 : blobR) * breathe;
      blobMat.uniforms.uAlpha.value = beat === 2 ? 0 : 1;
    }

    const tl = S.current.meltTl;
    if (tl) tl.time(beat === 1 ? local : 0);
    meltMats.forEach((m, i) => {
      const s = meltState.current[i];
      m.uniforms.uT.value = t;
      m.uniforms.uMelt.value = s.m;
      m.uniforms.uAlpha.value = beat === 1 ? s.a : 0;
      const mesh = meltRefs.current[i];
      if (mesh) {
        mesh.visible = beat === 1;
        mesh.position.y = meltLayout[i].y + s.y;
      }
    });

    wallMat.uniforms.uT.value = t;
    wallMat.uniforms.uAlpha.value = beat === 2 ? fadeIn : 0;
    wallMat.uniforms.uDepth.value = Math.min(vw, vh) * 0.12 * (1 + e);
  };

  // Reduced motion: the strips poster, composed, blob mid-breath.
  useEffect(() => {
    if (!reduced) return;
    S.current.scroll = 3.1;
    onBeat(0);
    render(0, 2, 2.2, 0, 1);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, vw, vh, palette, atlas]);

  useFrame((_, rawDt) => {
    if (reduced) {
      render(0, 2, 2.2, 0, 1);
      return;
    }
    const dt = Math.min(rawDt, 1 / 20);
    const s = S.current;
    const e = step(dt);
    if (active) s.t += dt;
    speedTo(1 + e * 5);
    boldTo(pointer.current.inside ? 1 : 0);
    s.scroll += dt * speed.current.v;

    let beat = 0;
    let local = 0;
    if (progress !== undefined) {
      const p = Math.min(0.9999, Math.max(0, progress)) * 3;
      beat = Math.floor(p);
      local = (p - beat) * BEATS[beat].dur;
    } else {
      let c = s.t % TOTAL;
      while (c >= BEATS[beat].dur) {
        c -= BEATS[beat].dur;
        beat++;
      }
      local = c;
    }
    if (beat !== s.beat) {
      s.beat = beat;
      onBeat(beat);
    }
    const fadeIn = progress !== undefined ? 1 : Math.min(1, local / 0.5, (BEATS[beat].dur - local) / 0.4);
    render(beat, local, s.t, e, Math.max(0, fadeIn));
  });

  // wall sized to the word: width from the height of the frame, rows repeat down a tall plane
  const wallW = Math.min(vh * 1.25, vw * 1.6);
  const wallH = Math.max(vh, vw) * 2.6;
  wallMat.uniforms.uRepY.value = wallH / (wallW * (2048 / 1200));
  return (
    <>
      <mesh geometry={stripGeo} renderOrder={3}>
        <primitive object={stripMat} attach="material" />
      </mesh>
      <mesh ref={blobRef} renderOrder={2} position={[0, 0, -blobR * 1.2]}>
        <sphereGeometry args={[1, 128, 64]} />
        <primitive object={blobMat} attach="material" />
      </mesh>
      {meltLayout.map((l, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meltRefs.current[i] = m;
          }}
          position={[l.x, l.y, 0]}
          renderOrder={4}
        >
          <planeGeometry args={[l.w, l.h]} />
          <primitive object={meltMats[i]} attach="material" />
        </mesh>
      ))}
      <mesh position={[vw * 0.04, 0, -wallW * 0.15]} rotation={[0, -0.9, 0]} renderOrder={1}>
        <planeGeometry args={[wallW, wallH, 1, 100]} />
        <primitive object={wallMat} attach="material" />
      </mesh>
    </>
  );
}

/* ───────────── root ───────────── */

export default function KineticPoster({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const fonts = useCanvasFonts();
  const { energy, step } = useEnergy(host, active && !reducedMotion);
  const pointer = useRef({ x: 0, y: 0, inside: false });
  const [beat, setBeat] = useState(0);
  const [pi, setPi] = useState(0);
  const atlas = useMemo(() => (fonts ? buildAtlases(fonts) : null), [fonts]);
  useEffect(
    () => () => {
      if (!atlas) return;
      atlas.strips.dispose();
      atlas.melt.dispose();
      atlas.wall.dispose();
    },
    [atlas],
  );

  useEffect(() => {
    const el = host.current;
    if (!el || reducedMotion) return;
    const onMove = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      pointer.current.x = ((e.clientX - b.left) / b.width) * 2 - 1;
      pointer.current.y = -(((e.clientY - b.top) / b.height) * 2 - 1);
      pointer.current.inside = true;
    };
    const onLeave = () => (pointer.current.inside = false);
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [reducedMotion]);

  const pal = PALETTES[pi];
  const dark = pal.bg === '#080808';

  return (
    <div
      ref={host}
      className="relative h-full w-full cursor-pointer overflow-hidden"
      style={{ background: pal.bg, touchAction: 'pan-y' }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')) return;
        setPi((p) => (p + 1) % PALETTES.length);
      }}
    >
      {atlas && (
        <Canvas
          dpr={[1, 1.75]}
          frameloop={active && !reducedMotion ? 'always' : 'demand'}
          camera={{ position: [0, 0, 5], fov: 35 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <Scene
            atlas={atlas}
            palette={pal}
            active={active}
            reduced={reducedMotion}
            progress={progress}
            energy={energy}
            step={step}
            pointer={pointer}
            onBeat={setBeat}
          />
        </Canvas>
      )}
      <Corner title="Kinetic Poster" tools={TOOLS} />
      <div
        className="pixel pointer-events-none absolute top-3 right-3 z-20 px-2 py-1 text-right text-[16px] leading-[16px] max-sm:top-auto max-sm:bottom-3"
        style={{ background: dark ? '#ffffff' : '#080808', color: dark ? '#080808' : '#ffffff' }}
      >
        <p>{BEATS[beat].name}</p>
        <p className="opacity-70">click: palette {pi + 1}/4</p>
      </div>
    </div>
  );
}
