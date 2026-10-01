'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { EffectComposer, Pixelation } from '@react-three/postprocessing';
import type { PixelationEffect } from 'postprocessing';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CUBE_VIEW } from './act-blast';
import { CARD_COUNT, type CubeCard, FACES, styleAt, T } from './cube-beats';
import type { ProgressStore } from './runtime';
import { clamp01, span } from './runtime';

/*
 * The signature act, seven beats on one scroll store. One WebGL context, one post pass (Pixelation).
 * At any moment about three things draw: the dither backdrop, plus one or two of
 *  - 296 instanced blocks (B1 lattice, B5 GPU morph cube > sphere > knot > B, B6 flying into cards),
 *  - the smooth rounded cube (end of B1),
 *  - the net: six instanced card-thin faces that unfold on hinges (B2, B3),
 *  - a torus knot whose one shader draws six render styles, picked by a uniform (B4),
 *  - 30 instanced cards reading one poster atlas (B6, B7).
 * Links on the faces and cards are real DOM anchors in the act; this scene only moves them.
 */

export interface CubeHud {
  hoverFace: number;
  hoverCard: number;
}

const N = 8;
const SIZE = CUBE_VIEW.size;
const VOX = SIZE / N;
const COUNT = 296;
const TAU = Math.PI * 2;
const STEPS = [48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1];

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const quantPx = (g: number) => {
  if (g < 1.5) return 1;
  for (const s of STEPS) if (s <= g) return s;
  return 1;
};

/* ───────────── shape targets (precomputed once) ───────────── */

const B_GLYPH = ['11110', '10001', '10001', '11110', '10001', '10001', '11110'];

function buildTargets() {
  const cube: number[] = [];
  for (let x = 0; x < N; x++)
    for (let y = 0; y < N; y++)
      for (let z = 0; z < N; z++) {
        if (x > 0 && x < N - 1 && y > 0 && y < N - 1 && z > 0 && z < N - 1) continue;
        cube.push((x - (N - 1) / 2) * VOX, (y - (N - 1) / 2) * VOX, (z - (N - 1) / 2) * VOX);
      }
  const rnd = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const r = Math.sin(i * 91.7 + 3.1) * 43758.5453;
    rnd[i] = r - Math.floor(r);
  }
  // sphere: Fibonacci points
  const sphere = new Float32Array(COUNT * 4);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < COUNT; i++) {
    const y = 1 - (i / (COUNT - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    sphere.set([Math.cos(th) * r * 1.02, y * 1.02, Math.sin(th) * r * 1.02, 0.78], i * 4);
  }
  // torus knot (2,3): 74 rings of 4 blocks
  const knot = new Float32Array(COUNT * 4);
  const kp = (t: number, out: THREE.Vector3) => {
    const r = Math.cos(3 * t) + 2;
    return out.set(r * Math.cos(2 * t) * 0.36, r * Math.sin(2 * t) * 0.36, -Math.sin(3 * t) * 0.36);
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const bin = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < COUNT; i++) {
    const ring = Math.floor(i / 4);
    const k = i % 4;
    const t = (ring / 74) * TAU;
    kp(t, a);
    kp(t + 0.01, b);
    tan.subVectors(b, a).normalize();
    nrm.crossVectors(tan, Z).normalize();
    bin.crossVectors(tan, nrm).normalize();
    const ang = (k / 4) * TAU + ring * 0.4;
    const off = 0.11;
    knot.set(
      [
        a.x + (nrm.x * Math.cos(ang) + bin.x * Math.sin(ang)) * off,
        a.y + (nrm.y * Math.cos(ang) + bin.y * Math.sin(ang)) * off,
        a.z + (nrm.z * Math.cos(ang) + bin.z * Math.sin(ang)) * off,
        0.6,
      ],
      i * 4,
    );
  }
  // 'B' monogram: the 5x7 pixel glyph at 2x, three layers deep; spare blocks shrink to nothing
  const mono = new Float32Array(COUNT * 4);
  const cells: [number, number][] = [];
  B_GLYPH.forEach((row, y) =>
    [...row].forEach((bit, x) => {
      if (bit === '1') for (const dy of [0, 1]) for (const dx of [0, 1]) cells.push([x * 2 + dx, y * 2 + dy]);
    }),
  );
  const pitch = 1.9 / 14;
  const layers = 3;
  for (let i = 0; i < COUNT; i++) {
    const c = cells[i % cells.length];
    const layer = Math.floor(i / cells.length);
    if (layer >= layers) {
      mono.set([0, 0, 0, 0], i * 4);
      continue;
    }
    mono.set([(c[0] - 4.5) * pitch, (6.5 - c[1]) * pitch, (layer - (layers - 1) / 2) * pitch, (pitch / VOX) * 0.92], i * 4);
  }
  return { cube: new Float32Array(cube), sphere, knot, mono, rnd };
}

/* ───────────── shaders ───────────── */

const bgVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const bgFrag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  vec2 uv = vUv;
  float w = 0.5 + 0.5 * sin(uv.x * 9.0 + uTime * 0.7 + sin(uv.y * 6.0 - uTime * 0.4) * 1.6);
  w *= 0.35 + 0.65 * (0.5 + 0.5 * sin(uv.y * 4.0 + uTime * 0.3));
  float b = bayer8(gl_FragCoord.xy / 3.0);
  float v = step(b, w * 0.85);
  gl_FragColor = vec4(vec3(1.0), v * uOpacity);
}`;

/** Instanced, lit faces reading one atlas (net: 3x2 cells; cards: 6x5 cells). */
const instVert = /* glsl */ `
attribute float aIndex;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vObjN;
varying float vIdx;
void main() {
  vUv = uv;
  vObjN = normal;
  vIdx = aIndex;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const netFrag = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uLabel;
uniform float uHov[6];
varying vec2 vUv;
varying vec3 vN;
varying vec3 vObjN;
varying float vIdx;
void main() {
  int i = int(vIdx + 0.5);
  float h = uHov[i];
  vec3 paper = vec3(0.84);
  vec3 col = paper;
  if (vObjN.z > 0.5) {
    float cx = mod(vIdx, 3.0);
    float cy = floor(vIdx / 3.0);
    vec2 uv = vec2((cx + vUv.x) / 3.0, 1.0 - (cy + 1.0 - vUv.y) / 2.0);
    col = mix(paper, texture2D(uAtlas, uv).rgb, uLabel);
  } else if (vObjN.z < -0.5) {
    col = vec3(0.5);
  }
  vec3 L = normalize(vec3(0.35, 0.55, 0.9));
  float d = max(dot(normalize(vN), L), 0.0);
  col *= 0.42 + 0.58 * d + 0.18 * h;
  gl_FragColor = vec4(col, 1.0);
}`;

const cardFrag = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uHov[${CARD_COUNT}];
varying vec2 vUv;
varying vec3 vN;
varying vec3 vObjN;
varying float vIdx;
void main() {
  int i = int(vIdx + 0.5);
  float h = uHov[i];
  float cx = mod(vIdx, 6.0);
  float cy = floor(vIdx / 6.0);
  vec2 uv = vec2((cx + vUv.x) / 6.0, 1.0 - (cy + 1.0 - vUv.y) / 5.0);
  vec3 t = texture2D(uAtlas, uv).rgb;
  float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
  vec3 c = vec3(l) * (0.7 + 0.3 * h);
  vec2 e = min(vUv, 1.0 - vUv);
  float border = 1.0 - step(0.022, min(e.x * 1.6, e.y));
  c = mix(c, vec3(0.9), border * (0.25 + 0.75 * h));
  gl_FragColor = vec4(c, 1.0);
}`;

const knotVert = /* glsl */ `
varying vec3 vN;
varying vec3 vView;
varying vec2 vUv;
void main() {
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

/* Six render styles in one fragment shader. uA is the style on screen, uB the next one, and uWipe
   sweeps a slanted edge across the screen from A to B. Colours are written in sRGB and linearised. */
const knotFrag = /* glsl */ `
uniform float uA;
uniform float uB;
uniform float uWipe;
uniform vec2 uRes;
uniform float uDpr;
varying vec3 vN;
varying vec3 vView;
varying vec2 vUv;
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
float glyph(int n, vec2 p) {
  p = floor(p * vec2(-4.0, 4.0) + 2.5);
  if (clamp(p.x, 0.0, 4.0) == p.x && clamp(p.y, 0.0, 4.0) == p.y) {
    int a = int(round(p.x) + 5.0 * round(p.y));
    if (((n >> a) & 1) == 1) return 1.0;
  }
  return 0.0;
}
vec4 styleCol(int s, vec3 N, vec3 V, vec2 fc) {
  vec3 L = normalize(vec3(0.45, 0.65, 0.6));
  vec3 H = normalize(L + V);
  float d = max(dot(N, L), 0.0);
  float sp = pow(max(dot(N, H), 0.0), 48.0);
  float lum = clamp(0.06 + 0.78 * d + 0.5 * sp, 0.0, 1.0);
  vec3 ink = vec3(0.96);
  vec3 bg = vec3(0.031);
  if (s == 0) {
    float b = bayer8(fc / (2.0 * uDpr));
    return vec4(lin(lum > b ? ink : bg), 1.0);
  }
  if (s == 1) {
    vec2 p = mod(fc / (4.5 * uDpr), 2.0) - 1.0;
    int n = 0;
    if (lum > 0.1) n = 4096;
    if (lum > 0.2) n = 65600;
    if (lum > 0.32) n = 332772;
    if (lum > 0.45) n = 15255086;
    if (lum > 0.58) n = 23385164;
    if (lum > 0.72) n = 15252014;
    if (lum > 0.86) n = 13199452;
    return vec4(lin(mix(bg, ink, glyph(n, p))), 1.0);
  }
  if (s == 2) {
    float c = 9.0 * uDpr;
    vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * fc;
    vec2 g = mod(q, c) - 0.5 * c;
    float r = sqrt(lum) * 0.64 * c;
    float dotv = 1.0 - smoothstep(r - uDpr, r + uDpr, length(g));
    return vec4(lin(mix(bg, ink, dotv)), 1.0);
  }
  if (s == 3) {
    float fr = pow(1.0 - max(dot(N, V), 0.0), 2.2);
    float band = smoothstep(0.55, 0.62, abs(sin((fc.y / uRes.y + N.x * 0.22) * 26.0)));
    float sp2 = pow(max(dot(N, H), 0.0), 90.0);
    vec3 c = mix(vec3(0.07), vec3(0.92), fr) + band * 0.05 + sp2;
    return vec4(lin(clamp(c, 0.0, 1.0)), clamp(0.16 + 0.84 * fr + sp2, 0.0, 1.0));
  }
  if (s == 4) {
    vec2 g = vec2(vUv.x * 120.0, vUv.y * 10.0);
    vec2 w = fwidth(g);
    vec2 a = abs(fract(g - 0.5) - 0.5) / max(w, vec2(0.0001));
    float line = 1.0 - min(min(a.x, a.y), 1.0);
    line = max(line, 1.0 - smoothstep(0.08, 0.16, max(dot(N, V), 0.0)));
    return vec4(lin(mix(bg, ink * 0.95, line)), 1.0);
  }
  vec3 R = reflect(-V, N);
  float y = R.y;
  float sky = y > 0.0 ? mix(0.5, 1.0, pow(y, 0.6)) : mix(0.2, 0.02, pow(-y, 0.5));
  sky += smoothstep(0.75, 0.95, sin(atan(R.x, R.z) * 5.0)) * step(0.12, y) * 0.35;
  sky = mix(sky, 0.0, 1.0 - smoothstep(0.0, 0.035, abs(y)));
  return vec4(lin(vec3(clamp(sky + sp * 0.6, 0.0, 1.0))), 1.0);
}
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(vView);
  vec2 fc = gl_FragCoord.xy;
  float x = fc.x + (fc.y - uRes.y * 0.5) * 0.3;
  float edge = uWipe * (uRes.x * 1.4) - uRes.x * 0.2;
  int a = int(uA + 0.5);
  int b = int(uB + 0.5);
  vec4 col = x < edge ? styleCol(b, N, V, fc) : styleCol(a, N, V, fc);
  float seam = (uWipe > 0.0 && uWipe < 1.0) ? 1.0 - smoothstep(0.0, 2.0 * uDpr, abs(x - edge)) : 0.0;
  col = mix(col, vec4(1.0), seam);
  gl_FragColor = col;
}`;

const MORPH_HEAD = /* glsl */ `
attribute vec3 aCube;
attribute vec4 aSphere;
attribute vec4 aKnot;
attribute vec4 aMono;
attribute float aRnd;
uniform float uMorphOn;
uniform float uMorph;
uniform float uFit;
uniform float uVox;
`;
const MORPH_BODY = /* glsl */ `
#include <begin_vertex>
if (uMorphOn > 0.5) {
  float seg = min(floor(uMorph), 2.0);
  float f = clamp(uMorph - seg, 0.0, 1.0);
  float l = clamp(f * 1.4 - aRnd * 0.4, 0.0, 1.0);
  float e = l < 0.5 ? 4.0 * l * l * l : 1.0 - pow(-2.0 * l + 2.0, 3.0) / 2.0;
  vec4 cubeP = vec4(aCube, 0.9);
  vec4 A = seg < 0.5 ? cubeP : (seg < 1.5 ? aSphere : aKnot);
  vec4 B = seg < 0.5 ? aSphere : (seg < 1.5 ? aKnot : aMono);
  vec4 Pm = mix(A, B, e);
  Pm.z += sin(e * 3.14159) * (0.3 + aRnd) * 0.8;
  transformed = (transformed * uVox * Pm.w + Pm.xyz) * uFit;
}
`;

/* ───────────── atlases ───────────── */

const PIXEL_FONT = '"Web IBM VGA 8x16", ui-monospace, monospace';

function drawFaces(ctx: CanvasRenderingContext2D, counts: number[]) {
  const C = 256;
  FACES.forEach((f, i) => {
    const x0 = (i % 3) * C;
    const y0 = Math.floor(i / 3) * C;
    ctx.fillStyle = '#ececec';
    ctx.fillRect(x0, y0, C, C);
    ctx.strokeStyle = '#9a9a9a';
    ctx.lineWidth = 4;
    ctx.strokeRect(x0 + 2, y0 + 2, C - 4, C - 4);
    ctx.fillStyle = '#6a6a6a';
    ctx.font = `32px ${PIXEL_FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(`0${i + 1}`, x0 + 16, y0 + 14);
    ctx.fillStyle = '#101010';
    const px = 11;
    const ix = x0 + (C - px * 8) / 2;
    const iy = y0 + 56;
    f.icon.forEach((row, ry) =>
      [...row].forEach((bit, rx) => {
        if (bit === '1') ctx.fillRect(ix + rx * px, iy + ry * px, px, px);
      }),
    );
    ctx.textAlign = 'center';
    ctx.fillText(f.label, x0 + C / 2, y0 + 160);
    ctx.fillStyle = '#5a5a5a';
    ctx.fillText(`${counts[i] ?? 0} tools`, x0 + C / 2, y0 + 200);
  });
}

function makeFaceAtlas(counts: number[]) {
  const cv = document.createElement('canvas');
  cv.width = 768;
  cv.height = 512;
  const ctx = cv.getContext('2d')!;
  drawFaces(ctx, counts);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // the pixel font may arrive after the first draw
  document.fonts
    ?.load(`32px ${PIXEL_FONT}`)
    .then(() => {
      drawFaces(ctx, counts);
      tex.needsUpdate = true;
    })
    .catch(() => {});
  return tex;
}

const CW = 256;
const CH = 160;

function makeCardAtlas(cards: CubeCard[]) {
  const cv = document.createElement('canvas');
  cv.width = CW * 6;
  cv.height = CH * 5;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#161616';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.font = `16px ${PIXEL_FONT}`;
  ctx.textBaseline = 'top';
  cards.forEach((c, i) => {
    ctx.fillStyle = '#8a8a8a';
    ctx.fillText(c.title.slice(0, 24), (i % 6) * CW + 10, Math.floor(i / 6) * CH + 10);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let started = false;
  const load = () => {
    if (started) return;
    started = true;
    cards.forEach((c, i) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        ctx.drawImage(img, (i % 6) * CW, Math.floor(i / 6) * CH, CW, CH);
        tex.needsUpdate = true;
      };
      img.src = `/posters/${c.id}.webp`;
    });
  };
  return { tex, load };
}

/* ───────────── net hinges ───────────── */

// the flat net in unit squares: bounding size and centre, per layout (back face right, or under the bottom)
const WIDE = { w: 4, h: 3, cx: 0.5, cy: 0 };
const TALL = { w: 3, h: 4, cx: 0, cy: -0.5 };

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

/** Translate to the hinge, rotate, translate on: a face folding about an edge of its parent. */
function hinge(out: THREE.Matrix4, px: number, py: number, axis: THREE.Vector3, ang: number, tmp: THREE.Matrix4) {
  out.makeTranslation(px, py, 0);
  out.multiply(tmp.makeRotationAxis(axis, ang));
  out.multiply(tmp.makeTranslation(px, py, 0));
  return out;
}

/* ───────────── scene ───────────── */

export interface CubeSceneProps {
  store: ProgressStore;
  counts: number[];
  cards: CubeCard[];
  hud: RefObject<CubeHud>;
  faceLinks: RefObject<(HTMLAnchorElement | null)[]>;
  cardLinks: RefObject<(HTMLAnchorElement | null)[]>;
  onPx?: (px: number) => void;
}

type Rect = { x: number; y: number; w: number; h: number };

function Scene({ store, counts, cards, hud, faceLinks, cardLinks, onPx }: CubeSceneProps) {
  const hd = useRef<THREE.Mesh>(null);
  const hdMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const wire = useRef<THREE.LineSegments>(null);
  const pix = useRef<PixelationEffect>(null);
  const lastPx = useRef(-1);
  const frames = useRef(0);
  const blockMode = useRef<'cpu' | 'morph'>('cpu');
  const faceShown = useRef(true);
  const cardShown = useRef(true);
  const cardLoad = useRef<() => void>(() => {});
  const { camera, size } = useThree();

  const data = useMemo(buildTargets, []);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE, SIZE, SIZE)), []);
  const bgU = useMemo(() => ({ uTime: { value: 0 }, uOpacity: { value: 0.03 } }), []);

  /* blocks: standard material plus a vertex morph between precomputed targets */
  const blocks = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.setAttribute('aCube', new THREE.InstancedBufferAttribute(data.cube, 3));
    geo.setAttribute('aSphere', new THREE.InstancedBufferAttribute(data.sphere, 4));
    geo.setAttribute('aKnot', new THREE.InstancedBufferAttribute(data.knot, 4));
    geo.setAttribute('aMono', new THREE.InstancedBufferAttribute(data.mono, 4));
    geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(data.rnd, 1));
    const uniforms = { uMorphOn: { value: 0 }, uMorph: { value: 0 }, uFit: { value: 1 }, uVox: { value: VOX } };
    const mat = new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.55, metalness: 0.05 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = MORPH_HEAD + sh.vertexShader.replace('#include <begin_vertex>', MORPH_BODY);
    };
    mat.customProgramCacheKey = () => 'cube-morph-v1';
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return { mesh, uniforms };
  }, [data]);

  /* the net */
  const net = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 0.03);
    geo.setAttribute('aIndex', new THREE.InstancedBufferAttribute(new Float32Array([0, 1, 2, 3, 4, 5]), 1));
    const uniforms = { uAtlas: { value: null as THREE.Texture | null }, uLabel: { value: 0 }, uHov: { value: new Array<number>(6).fill(0) } };
    const mat = new THREE.ShaderMaterial({ vertexShader: instVert, fragmentShader: netFrag, uniforms });
    const mesh = new THREE.InstancedMesh(geo, mat, 6);
    mesh.frustumCulled = false;
    return { mesh, uniforms };
  }, []);
  useEffect(() => {
    const tex = makeFaceAtlas(counts);
    net.uniforms.uAtlas.value = tex;
    return () => tex.dispose();
  }, [net, counts]);

  /* the render-styles knot */
  const knot = useMemo(() => {
    const geo = new THREE.TorusKnotGeometry(0.62, 0.2, 240, 28);
    const uniforms = { uA: { value: 0 }, uB: { value: 1 }, uWipe: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uDpr: { value: 1 } };
    const mat = new THREE.ShaderMaterial({ vertexShader: knotVert, fragmentShader: knotFrag, uniforms, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return { mesh, uniforms };
  }, []);

  /* the 30 cards */
  const deck = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aIndex', new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: CARD_COUNT }, (_, i) => i)), 1));
    const uniforms = { uAtlas: { value: null as THREE.Texture | null }, uHov: { value: new Array<number>(CARD_COUNT).fill(0) } };
    const mat = new THREE.ShaderMaterial({ vertexShader: instVert, fragmentShader: cardFrag, uniforms });
    const mesh = new THREE.InstancedMesh(geo, mat, CARD_COUNT);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return { mesh, uniforms };
  }, []);
  useEffect(() => {
    const { tex, load } = makeCardAtlas(cards);
    deck.uniforms.uAtlas.value = tex;
    cardLoad.current = load;
    return () => tex.dispose();
  }, [deck, cards]);

  useEffect(
    () => () => {
      [blocks.mesh, net.mesh, knot.mesh, deck.mesh].forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      edges.dispose();
    },
    [blocks, net, knot, deck, edges],
  );

  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      m2: new THREE.Matrix4(),
      g: new THREE.Matrix4(),
      h: new THREE.Matrix4(),
      faces: Array.from({ length: 6 }, () => new THREE.Matrix4()),
      q: new THREE.Quaternion(),
      qc: new THREE.Quaternion(),
      qi: new THREE.Quaternion(),
      e: new THREE.Euler(),
      e2: new THREE.Euler(),
      s: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
      v: new THREE.Vector3(),
      buf: new THREE.Vector2(),
      hovF: new Float32Array(6),
      hovC: new Float32Array(CARD_COUNT),
      cardPos: Array.from({ length: CARD_COUNT }, () => new THREE.Vector3()),
    }),
    [],
  );

  useFrame((state, delta) => {
    const p = store.get();
    const t = state.clock.elapsedTime;
    const h = hud.current;
    const vw = size.width / Math.max(1, size.height);
    const visH = 2 * CUBE_VIEW.camZ * Math.tan((CUBE_VIEW.fov * Math.PI) / 360);
    const visW = visH * vw;
    const portrait = vw < 0.9;
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 12);

    // screen rect of a unit square under matrix m, in canvas CSS px
    const project = (m: THREE.Matrix4): Rect => {
      tmp.a.set(0, 0, 0).applyMatrix4(m).project(camera);
      tmp.b.set(0.5, 0.5, 0).applyMatrix4(m).project(camera);
      const cx = ((tmp.a.x + 1) / 2) * size.width;
      const cy = ((1 - tmp.a.y) / 2) * size.height;
      const w = Math.abs(tmp.b.x - tmp.a.x) * size.width;
      const hh = Math.abs(tmp.b.y - tmp.a.y) * size.height;
      return { x: cx - w / 2, y: cy - hh / 2, w, h: hh };
    };
    const place = (el: HTMLAnchorElement | null | undefined, r: Rect) => {
      if (!el) return;
      el.style.transform = `translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px)`;
      el.style.width = `${r.w.toFixed(1)}px`;
      el.style.height = `${r.h.toFixed(1)}px`;
    };
    const showLinks = (els: (HTMLAnchorElement | null)[] | null, on: boolean) =>
      els?.forEach((el) => {
        if (el) el.style.visibility = on ? 'visible' : 'hidden';
      });

    bgU.uTime.value = t;
    bgU.uOpacity.value = 0.03 * (1 - span(p, 0.9, 0.96));

    /* pixel size: B1 steps 48 > 1, a short spike hides each swap, the collapse coarsens again */
    const r1 = span(p, 0.015, 0.1);
    const px1 = r1 >= 1 ? 1 : STEPS[Math.min(STEPS.length - 1, Math.floor(r1 * STEPS.length))];
    const spike = Math.max(0, 1 - Math.abs(p - T.knotOn) / 0.014, 1 - Math.abs(p - T.blocksBack) / 0.014);
    const coll = span(p, 0.9, 0.95) * (1 - span(p, 0.965, 0.985));
    const px = Math.max(px1, quantPx(1 + 23 * spike), quantPx(1 + 11 * coll));
    if (pix.current) pix.current.granularity = px <= 1 ? 0 : px;
    if (px !== lastPx.current) {
      lastPx.current = px;
      onPx?.(px);
    }

    /* the cube's turn, continuous from act 01's drawing */
    const spin = span(p, 0.01, 0.3) * Math.PI * 1.4;
    tmp.e.set(CUBE_VIEW.rx + Math.sin(spin * 0.5) * 0.12, CUBE_VIEW.ry + spin, 0);
    tmp.qc.setFromEuler(tmp.e);

    if (wire.current) {
      wire.current.rotation.copy(tmp.e);
      (wire.current.material as THREE.LineBasicMaterial).opacity = 1 - span(p, 0.004, 0.03);
      wire.current.visible = p < 0.03;
    }

    const hdIn = span(p, 0.085, 0.115);
    if (hd.current && hdMat.current) {
      hd.current.rotation.copy(tmp.e);
      hdMat.current.opacity = hdIn;
      hd.current.visible = hdIn > 0 && p < T.netOn;
    }

    /* card grid: 6 by 5 on wide screens, 5 by 6 on tall ones */
    const cols = portrait ? 5 : 6;
    const rows = portrait ? 6 : 5;
    const areaW = visW * 0.9;
    const areaH = visH * (portrait ? 0.56 : 0.62);
    const cw = Math.min((areaW / cols) * 0.92, (areaH / rows) * 0.92 * 1.6);
    const chh = cw / 1.6;
    const gap = cw * 0.08;
    const yOff = visH * 0.05;
    for (let c = 0; c < CARD_COUNT; c++) {
      const col = c % cols;
      const row = Math.floor(c / cols);
      tmp.cardPos[c].set((col - (cols - 1) / 2) * (cw + gap), yOff + ((rows - 1) / 2 - row) * (chh + gap), 0);
    }

    /* ── blocks ── */
    const bm = blocks.mesh;
    bm.position.set(0, 0, 0);
    const fit = Math.min(1, (visW * 0.8) / 2.3, (visH * 0.62) / 2.1);
    const toCpu = () => {
      if (blockMode.current !== 'cpu') {
        blockMode.current = 'cpu';
        blocks.uniforms.uMorphOn.value = 0;
      }
      bm.rotation.set(0, 0, 0);
    };

    if (p < 0.12) {
      // B1: the lattice closes its gaps
      toCpu();
      const g = 0.42 * (1 - span(p, 0.015, 0.1));
      tmp.s.setScalar(VOX * (1 - g));
      for (let i = 0; i < COUNT; i++) {
        tmp.c.set(data.cube[i * 3], data.cube[i * 3 + 1], data.cube[i * 3 + 2]).applyEuler(tmp.e);
        tmp.m.compose(tmp.c, tmp.qc, tmp.s);
        bm.setMatrixAt(i, tmp.m);
      }
      bm.instanceMatrix.needsUpdate = true;
      bm.visible = hdIn < 1;
    } else if (p >= T.blocksBack && p < 0.645) {
      // B5: the GPU morph; instance matrices are identity, the vertex shader places every block
      if (blockMode.current !== 'morph') {
        blockMode.current = 'morph';
        tmp.m.identity();
        for (let i = 0; i < COUNT; i++) bm.setMatrixAt(i, tmp.m);
        bm.instanceMatrix.needsUpdate = true;
        blocks.uniforms.uMorphOn.value = 1;
      }
      blocks.uniforms.uMorph.value = span(p, 0.5, 0.535) + span(p, 0.545, 0.58) + span(p, 0.59, 0.625);
      blocks.uniforms.uFit.value = fit;
      const ang = CUBE_VIEW.ry + span(p, 0.48, 0.59) * Math.PI * 1.6;
      const settle = ease(span(p, 0.585, 0.625));
      const target = Math.round(ang / TAU) * TAU;
      bm.rotation.set(0.35 * (1 - settle), ang + (target - ang) * settle, 0);
      bm.visible = true;
    } else if (p >= 0.645 && p < 0.73) {
      // B6: the B bursts, each block flies to a slot on one of the 30 cards, then gives way to it
      toCpu();
      const shrink = 1 - span(p, 0.7, 0.725);
      const slot = Math.min(cw / 4, chh / 3) * 0.92;
      const ex = span(p, 0.645, 0.705);
      for (let i = 0; i < COUNT; i++) {
        const c = i % CARD_COUNT;
        const j = Math.floor(i / CARD_COUNT);
        const rnd = data.rnd[i];
        const e = ease(clamp01(ex * 1.35 - rnd * 0.35));
        const mw = data.mono[i * 4 + 3];
        tmp.a.set(data.mono[i * 4], data.mono[i * 4 + 1], data.mono[i * 4 + 2]).multiplyScalar(fit);
        tmp.b.copy(tmp.cardPos[c]);
        tmp.b.x += ((j % 4) - 1.5) * (cw / 4);
        tmp.b.y += (1 - Math.floor(j / 4)) * (chh / 3);
        tmp.c.lerpVectors(tmp.a, tmp.b, e);
        const arc = Math.sin(e * Math.PI);
        tmp.v.copy(tmp.a);
        if (tmp.v.lengthSq() < 1e-4) tmp.v.set(rnd - 0.5, 0.5 - rnd, 0.3);
        tmp.c.addScaledVector(tmp.v.normalize(), arc * 0.9);
        tmp.c.z += arc * (0.4 + rnd);
        tmp.e2.set(arc * (rnd - 0.5) * 4, arc * rnd * 3, 0);
        tmp.q.setFromEuler(tmp.e2);
        const sFrom = VOX * mw * fit;
        tmp.s.setScalar(Math.max(0.00001, (sFrom + (slot - sFrom) * e) * shrink));
        tmp.m.compose(tmp.c, tmp.q, tmp.s);
        bm.setMatrixAt(i, tmp.m);
      }
      bm.instanceMatrix.needsUpdate = true;
      bm.visible = shrink > 0;
    } else {
      toCpu();
      bm.visible = false;
    }

    /* ── net (B2, B3, and the refold into B4) ── */
    const nm = net.mesh;
    nm.position.set(0, 0, 0);
    const netOn = p >= T.netOn && p < T.knotOn;
    nm.visible = netOn;
    const unfold = Math.min(span(p, 0.13, 0.185), 1 - span(p, 0.28, 0.305));
    const facesLive = netOn && p >= T.facesLive[0] && p < T.facesLive[1] && unfold > 0.999;
    for (let f = 0; f < 6; f++) {
      tmp.hovF[f] += ((facesLive && h?.hoverFace === f ? 1 : 0) - tmp.hovF[f]) * k;
      net.uniforms.uHov.value[f] = tmp.hovF[f];
    }
    if (netOn) {
      const L = portrait ? TALL : WIDE;
      const eu = ease(unfold);
      const th1 = (1 - ease(clamp01(unfold * 1.3))) * (Math.PI / 2);
      const th2 = (1 - ease(clamp01(unfold * 1.3 - 0.3))) * (Math.PI / 2);
      const netS = Math.min((visW * 0.86) / L.w, (visH * 0.58) / L.h);
      const s = SIZE + (netS - SIZE) * eu;
      tmp.q.copy(tmp.qc).slerp(tmp.qi.identity(), eu);
      tmp.g.makeTranslation(0, visH * 0.05 * eu, 0);
      tmp.g.multiply(tmp.m.makeRotationFromQuaternion(tmp.q));
      tmp.g.multiply(tmp.m.makeScale(s, s, s));
      tmp.g.multiply(tmp.m.makeTranslation(-L.cx * eu, -L.cy * eu, 0.5 * (1 - eu)));
      const F = tmp.faces;
      F[0].identity();
      hinge(F[1], 0, 0.5, X, -th1, tmp.h);
      hinge(F[2], 0.5, 0, Y, th1, tmp.h);
      hinge(F[3], 0, -0.5, X, th1, tmp.h);
      hinge(F[4], -0.5, 0, Y, -th1, tmp.h);
      if (portrait) F[5].copy(F[3]).multiply(hinge(tmp.m2, 0, -0.5, X, th2, tmp.h));
      else F[5].copy(F[2]).multiply(hinge(tmp.m2, 0.5, 0, Y, th2, tmp.h));
      for (let f = 0; f < 6; f++) {
        const hv = tmp.hovF[f];
        tmp.m.makeTranslation(0, 0, hv * 0.18 * eu);
        tmp.m.multiply(tmp.g);
        tmp.m.multiply(F[f]);
        tmp.m.multiply(tmp.m2.makeScale(1 + 0.05 * hv, 1 + 0.05 * hv, 1));
        nm.setMatrixAt(f, tmp.m);
        if (facesLive) place(faceLinks.current?.[f], project(tmp.m));
      }
      nm.instanceMatrix.needsUpdate = true;
      net.uniforms.uLabel.value = span(p, 0.125, 0.16);
    }
    if (facesLive !== faceShown.current) {
      faceShown.current = facesLive;
      showLinks(faceLinks.current, facesLive);
      if (!facesLive && h) h.hoverFace = -1;
    }

    /* ── knot (B4): one mesh, six styles ── */
    const km = knot.mesh;
    km.position.set(0, visH * 0.03, 0);
    km.visible = p >= T.knotOn && p < T.blocksBack;
    if (km.visible) {
      const st = styleAt(p);
      knot.uniforms.uA.value = st.i;
      knot.uniforms.uB.value = st.next;
      knot.uniforms.uWipe.value = st.wipe;
      state.gl.getDrawingBufferSize(tmp.buf);
      knot.uniforms.uRes.value.copy(tmp.buf);
      knot.uniforms.uDpr.value = state.gl.getPixelRatio();
      km.rotation.set(0.5 + Math.sin(p * 9) * 0.25, p * 16 + t * 0.12, 0);
      km.scale.setScalar(Math.min(1, (visW * 0.78) / 2.0));
    }

    /* ── cards (B6, B7) ── */
    if (p > 0.4) cardLoad.current();
    const dm = deck.mesh;
    dm.position.set(0, 0, 0);
    dm.visible = p >= 0.69 && p < 0.99;
    const cardsLive = p >= T.cardsLive[0] && p < T.cardsLive[1];
    for (let c = 0; c < CARD_COUNT; c++) {
      tmp.hovC[c] += ((cardsLive && h?.hoverCard === c ? 1 : 0) - tmp.hovC[c]) * k;
      deck.uniforms.uHov.value[c] = tmp.hovC[c];
    }
    if (dm.visible) {
      for (let c = 0; c < CARD_COUNT; c++) {
        const o = c / CARD_COUNT;
        const cin = ease(span(p, 0.695 + o * 0.012, 0.712 + o * 0.012));
        const cout = ease(span(p, 0.88 + o * 0.035, 0.93 + o * 0.035));
        const hv = tmp.hovC[c];
        tmp.c.copy(tmp.cardPos[c]).multiplyScalar(1 - cout);
        tmp.c.z = hv * 0.2;
        const sc = cin * (1 - cout) * (1 + 0.06 * hv);
        tmp.s.set(Math.max(1e-5, cw * sc), Math.max(1e-5, chh * sc), 1);
        tmp.m.compose(tmp.c, tmp.qi.identity(), tmp.s);
        dm.setMatrixAt(c, tmp.m);
        if (cardsLive) place(cardLinks.current?.[c], project(tmp.m));
      }
      dm.instanceMatrix.needsUpdate = true;
    }
    if (cardsLive !== cardShown.current) {
      cardShown.current = cardsLive;
      showLinks(cardLinks.current, cardsLive);
      if (!cardsLive && h) h.hoverCard = -1;
    }

    /* warm-up: draw every program once, behind the camera, so no beat stalls on a shader compile */
    if (frames.current < 3) {
      frames.current++;
      for (const m of [nm, km, dm, bm]) {
        if (!m.visible) {
          m.visible = true;
          m.position.z = 100;
        }
      }
    }
  });

  return (
    <>
      <color attach="background" args={['#080808']} />
      <mesh position={[0, 0, -4]}>
        <planeGeometry args={[40, 24]} />
        <shaderMaterial vertexShader={bgVert} fragmentShader={bgFrag} uniforms={bgU} transparent depthWrite={false} />
      </mesh>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 5]} intensity={2.4} />
      <directionalLight position={[-4, -2, 2]} intensity={0.6} />
      <pointLight position={[0, 0, 0]} intensity={3} distance={3} />
      <lineSegments ref={wire} geometry={edges}>
        <lineBasicMaterial color="#f5f5f5" transparent />
      </lineSegments>
      <primitive object={blocks.mesh} />
      <RoundedBox ref={hd} args={[SIZE, SIZE, SIZE]} radius={0.09} smoothness={8} creaseAngle={0.4}>
        <meshPhysicalMaterial ref={hdMat} color="#f2f2f2" roughness={0.18} metalness={0.05} clearcoat={1} clearcoatRoughness={0.1} transparent side={THREE.DoubleSide} />
      </RoundedBox>
      <primitive object={net.mesh} />
      <primitive object={knot.mesh} />
      <primitive object={deck.mesh} />
      <EffectComposer multisampling={0}>
        <Pixelation ref={pix} granularity={48} />
      </EffectComposer>
    </>
  );
}

export default function CubeScene({ active, ...rest }: CubeSceneProps & { active: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 0, CUBE_VIEW.camZ], fov: CUBE_VIEW.fov, near: 0.05, far: 200 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ pointerEvents: 'none' }}
    >
      <Scene {...rest} />
    </Canvas>
  );
}
