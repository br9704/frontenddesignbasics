'use client';

/*
 * Reference Globe
 * A dotted globe built from a land mask drawn in code (coarse coastline polygons rasterised onto a
 * Fibonacci sphere), with soft arcs between studios this guide studies. Every studio city was checked
 * on the studio's own site. One draw call for all dots (land and studios), one for all arcs.
 * Drag to spin with inertia; hover or tap a studio dot to read its name and follow its link.
 * Arcs behind the globe are dimmed by an analytic ray-sphere test in the shader, so no depth pass.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as RPointerEvent, type RefObject } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { StillFrames } from './g1-shared';
import { Corner } from './g3-kit';

const TOOLS = ['threejs', 'r3f', 'glsl'];
const FOV = 35;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
const DOTS = 16000;
const SEG = 56;
const START_YAW = (20 * Math.PI) / 180; // puts the North Atlantic in front
const START_TILT = (28 * Math.PI) / 180;

/* ─────────── studios (city checked on each studio's own site) ─────────── */

type Studio = { name: string; city: string; url: string; lat: number; lon: number };
const STUDIOS: Studio[] = [
  { name: 'Lusion', city: 'Bristol', url: 'https://lusion.co', lat: 51.454, lon: -2.588 },
  { name: 'Locomotive', city: 'Montreal', url: 'https://locomotive.ca', lat: 45.502, lon: -73.567 },
  { name: '14islands', city: 'Stockholm', url: 'https://14islands.com', lat: 59.329, lon: 18.069 },
  { name: 'Klim Type Foundry', city: 'Wellington', url: 'https://klim.co.nz', lat: -41.287, lon: 174.776 },
  { name: 'Grilli Type', city: 'Lucerne', url: 'https://www.grillitype.com', lat: 47.05, lon: 8.309 },
  { name: 'makemepulse', city: 'Paris', url: 'https://makemepulse.com', lat: 48.857, lon: 2.352 },
  { name: 'monopo london', city: 'London', url: 'https://monopo.london', lat: 51.507, lon: -0.128 },
  { name: 'poppr', city: 'Ghent', url: 'https://poppr.be', lat: 51.054, lon: 3.717 },
  { name: 'Work & Co', city: 'Brooklyn', url: 'https://work.co', lat: 40.678, lon: -73.944 },
  { name: 'Instrument', city: 'Portland', url: 'https://www.instrument.com', lat: 45.515, lon: -122.678 },
  { name: 'Noomo Agency', city: 'Los Angeles', url: 'https://noomoagency.com', lat: 34.052, lon: -118.244 },
];
const ARCS: [number, number][] = [
  [0, 8],
  [8, 1],
  [1, 9],
  [9, 10],
  [10, 3],
  [3, 2],
  [2, 7],
  [7, 4],
  [4, 5],
  [5, 6],
  [6, 2],
  [6, 8],
  [5, 3],
];

/* ─────────── land mask: coarse coastlines as [lon, lat] rings ─────────── */

type Ring = number[][];
const LAND: Ring[] = [
  // North America
  [[-168, 66], [-162, 70], [-156, 71.3], [-140, 70], [-128, 70], [-115, 68.5], [-95, 72], [-82, 73], [-80, 63], [-94, 59], [-90, 57], [-82, 55], [-79, 52], [-77, 60], [-70, 60], [-64, 60], [-61, 55], [-56, 52], [-60, 47], [-66, 45], [-70, 42], [-74, 40], [-76, 35], [-81, 31], [-80, 26], [-82, 26], [-84, 30], [-89, 30], [-94, 29], [-97, 26], [-97, 21], [-94, 18], [-90, 21], [-87, 21], [-88, 16], [-84, 15], [-83, 10], [-79, 9], [-77, 8], [-80, 7], [-85, 10], [-88, 13], [-92, 15], [-96, 16], [-105, 20], [-110, 23.5], [-117, 32], [-121, 35], [-124, 40], [-124, 46], [-123, 49], [-127, 51], [-133, 56], [-140, 60], [-147, 61], [-152, 59], [-158, 57], [-162, 55], [-165, 54], [-158, 58], [-162, 60], [-165, 62], [-166, 64]],
  // Canadian Arctic and Baffin
  [[-120, 72], [-100, 74], [-90, 76], [-75, 80], [-62, 82], [-90, 82], [-120, 77]],
  [[-80, 73], [-68, 70], [-62, 67], [-65, 62], [-77, 64], [-90, 70]],
  // Greenland and Iceland
  [[-73, 78], [-60, 82], [-30, 83], [-20, 80], [-18, 75], [-22, 70], [-30, 68], [-40, 65], [-43, 60], [-50, 63], [-54, 67], [-56, 72], [-66, 76]],
  [[-24, 65], [-22, 66.4], [-15, 66.5], [-13.5, 65], [-18, 63.4], [-22, 63.8]],
  // South America
  [[-77, 8], [-72, 12], [-64, 11], [-60, 8], [-52, 5], [-50, 0], [-44, -2], [-35, -5], [-35, -9], [-39, -15], [-40, -22], [-48, -26], [-53, -34], [-58, -38], [-62, -39], [-65, -42], [-66, -47], [-69, -51], [-68, -55], [-72, -54], [-75, -48], [-73, -40], [-71, -30], [-70, -18], [-76, -14], [-81, -6], [-80, -2], [-79, 1], [-78, 5]],
  // Africa and Madagascar
  [[-17, 21], [-16, 28], [-9, 33], [-6, 36], [3, 37], [10, 37], [11, 33], [20, 31], [25, 32], [32, 31], [35, 28], [39, 22], [43, 13], [51, 12], [48, 5], [40, -2], [40, -10], [40, -15], [35, -24], [32, -29], [27, -34], [20, -35], [18, -32], [12, -18], [13, -10], [9, -1], [9, 4], [4, 6], [-4, 5], [-8, 4], [-13, 8], [-17, 14]],
  [[49, -12], [50.5, -15.5], [47, -25], [44, -24], [44, -17]],
  // Eurasia
  [[-10, 36], [-9, 43], [-2, 43.5], [-1, 46], [-5, 48], [2, 51], [5, 53], [8, 54], [10, 57.7], [10.5, 56], [12, 54], [20, 55], [21, 57], [24, 59], [29, 60], [23, 60], [22, 63], [25, 65.5], [21, 65], [18, 62.5], [19, 60], [16, 56], [13, 55.5], [12, 56.5], [11, 59], [8, 58], [5, 58.5], [5, 62], [12, 66], [17, 69], [25, 71], [31, 70], [40, 67], [44, 68], [60, 69], [70, 73], [80, 73], [100, 77], [112, 74], [130, 72], [140, 73], [160, 70], [180, 68], [180, 65], [178, 62], [170, 60], [163, 57], [156, 51], [158, 58], [160, 61], [155, 59], [142, 59], [137, 54], [141, 52], [140, 48], [135, 43], [130, 42], [129, 35], [126, 35], [125, 38], [122, 40], [121, 39], [119, 37], [122, 37], [120, 33], [122, 30], [121, 28], [117, 23], [110, 21], [108, 21], [106, 18], [109, 12], [105, 9], [100, 13], [100, 8], [104, 1], [101, 3], [98, 8], [98, 16], [94, 17], [92, 22], [88, 22], [85, 20], [80, 15], [78, 8], [76, 10], [73, 17], [72, 21], [67, 25], [62, 25], [57, 26], [56, 24], [59, 22], [52, 17], [45, 13], [43, 15], [39, 22], [35, 28], [34, 31], [36, 35], [30, 36], [27, 37], [26, 40], [29, 41], [23, 40], [24, 38], [21, 37], [19, 42], [13.5, 45.5], [12, 44], [16, 40], [15.6, 38], [12, 41.5], [10, 44], [7, 43.5], [3, 43], [3, 42], [0, 40], [0, 38], [-2, 37], [-5, 36]],
  // British Isles
  [[-5, 50], [1, 51], [1.7, 52.7], [0, 53.5], [-2, 56], [-2, 57.7], [-3, 58.6], [-5, 58.6], [-6, 57], [-5, 55], [-3, 54.5], [-3, 53.3], [-4.5, 52], [-5, 51.6], [-4, 51.3], [-5.7, 50]],
  [[-6, 52], [-6, 54], [-7.5, 55.2], [-10, 54], [-10, 51.5]],
  // Japan
  [[130, 31], [131, 34], [135, 34], [140, 35], [141, 38], [142, 41], [140, 41], [140, 38], [137, 37], [133, 35.5], [130, 33.5]],
  [[140, 42], [141, 45], [145, 43.5], [143, 42]],
  // South East Asia
  [[95, 5.5], [98, 4], [104, -2], [106, -6], [102, -4], [99, 0]],
  [[109, 1], [111, -3], [116, -4], [119, 1], [117, 7], [113, 3]],
  [[105, -6], [114, -7], [114, -8.5], [106, -7.5]],
  [[120, 18], [122, 18], [124, 12], [126, 7], [122, 7], [120, 14]],
  [[131, -1], [138, -2], [145, -4], [150, -10], [143, -9], [138, -8], [134, -4]],
  // Australia and New Zealand
  [[113, -22], [114, -26], [115, -34], [118, -35], [124, -34], [129, -31.5], [134, -32], [138, -35], [140, -38], [146, -39], [150, -37], [153, -31], [153, -25], [146, -19], [145, -15], [142, -11], [141, -17], [136, -15], [137, -12], [132, -11], [129, -15], [125, -14], [122, -18], [114, -21]],
  [[145, -41], [148, -41], [147, -43.5]],
  [[173, -35], [175, -37], [178, -38], [177, -39.5], [175, -41.6], [174.5, -41], [174, -39]],
  [[172.5, -40.5], [174.3, -41.5], [173, -43], [171, -45], [169, -46.6], [166.5, -46], [168, -44], [171, -42]],
];
const WATER: Ring[] = [
  [[28, 42], [28, 46], [33, 46.5], [38, 47], [41, 42], [36, 41.5], [30, 41]], // Black Sea
  [[47, 45], [50, 47], [53, 45], [53, 40], [54, 37], [50, 37], [49, 40], [47, 42]], // Caspian
];

type Poly = { ring: Ring; minX: number; maxX: number; minY: number; maxY: number };
const box = (ring: Ring): Poly => ({
  ring,
  minX: Math.min(...ring.map((p) => p[0])),
  maxX: Math.max(...ring.map((p) => p[0])),
  minY: Math.min(...ring.map((p) => p[1])),
  maxY: Math.max(...ring.map((p) => p[1])),
});
function inside(poly: Poly, x: number, y: number) {
  if (x < poly.minX || x > poly.maxX || y < poly.minY || y > poly.maxY) return false;
  const r = poly.ring;
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function isLand(lon: number, lat: number, land: Poly[], water: Poly[]) {
  if (lat < -71) return true; // Antarctica, as a band
  if (water.some((p) => inside(p, lon, lat))) return false;
  return land.some((p) => inside(p, lon, lat));
}

const D2R = Math.PI / 180;
function toVec(lat: number, lon: number, r = 1) {
  const la = lat * D2R;
  const lo = lon * D2R;
  return new THREE.Vector3(r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo));
}

/* ─────────── geometry builders ─────────── */

function buildDots() {
  const land = LAND.map(box);
  const water = WATER.map(box);
  const pos: number[] = [];
  const kind: number[] = [];
  const seed: number[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < DOTS; i++) {
    const y = 1 - (2 * (i + 0.5)) / DOTS;
    const r = Math.sqrt(1 - y * y);
    const th = i * golden;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    const lat = Math.asin(y) / D2R;
    const lon = Math.atan2(x, z) / D2R;
    if (!isLand(lon, lat, land, water)) continue;
    pos.push(x, y, z);
    kind.push(-1);
    seed.push(((i * 0.6180339) % 1 + 1) % 1);
  }
  // studio dots go last, sitting just above the surface; kind = studio index
  STUDIOS.forEach((s, i) => {
    const v = toVec(s.lat, s.lon, 1.004);
    pos.push(v.x, v.y, v.z);
    kind.push(i);
    seed.push(i / STUDIOS.length);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.1);
  return g;
}

function arcPoint(a: THREE.Vector3, b: THREE.Vector3, ang: number, t: number) {
  const s = Math.sin(ang);
  const p = s < 1e-4 ? a.clone() : a.clone().multiplyScalar(Math.sin((1 - t) * ang) / s).add(b.clone().multiplyScalar(Math.sin(t * ang) / s));
  const lift = 0.06 + 0.32 * (ang / Math.PI);
  return p.normalize().multiplyScalar(1.004 + lift * Math.sin(Math.PI * t));
}

function buildArcs() {
  const pos: number[] = [];
  const prev: number[] = [];
  const next: number[] = [];
  const side: number[] = [];
  const tt: number[] = [];
  const arc: number[] = [];
  const idx: number[] = [];
  ARCS.forEach(([ia, ib], k) => {
    const a = toVec(STUDIOS[ia].lat, STUDIOS[ia].lon);
    const b = toVec(STUDIOS[ib].lat, STUDIOS[ib].lon);
    const ang = a.angleTo(b);
    const pts = Array.from({ length: SEG + 1 }, (_, i) => arcPoint(a, b, ang, i / SEG));
    const base = pos.length / 3;
    pts.forEach((p, i) => {
      const pp = pts[Math.max(0, i - 1)];
      const pn = pts[Math.min(SEG, i + 1)];
      for (const sd of [-1, 1]) {
        pos.push(p.x, p.y, p.z);
        prev.push(pp.x, pp.y, pp.z);
        next.push(pn.x, pn.y, pn.z);
        side.push(sd);
        tt.push(i / SEG);
        arc.push(k);
      }
      if (i < SEG) {
        const v = base + i * 2;
        idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPrev', new THREE.Float32BufferAttribute(prev, 3));
  g.setAttribute('aNext', new THREE.Float32BufferAttribute(next, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
  g.setAttribute('aArc', new THREE.Float32BufferAttribute(arc, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.5);
  return g;
}

/* ─────────── shaders ─────────── */

// 1.0 when the unit sphere at the origin sits between the camera and world point p
const GLSL_OCCLUDED = /* glsl */ `
float occluded(vec3 p) {
  vec3 d = p - cameraPosition;
  float L = length(d);
  d /= L;
  float b = dot(cameraPosition, d);
  float c = dot(cameraPosition, cameraPosition) - 1.0;
  float disc = b * b - c;
  if (disc <= 0.0) return 0.0;
  float t0 = -b - sqrt(disc);
  return (t0 > 0.0 && t0 < L - 0.004) ? 1.0 : 0.0;
}
`;

const dotVert = /* glsl */ `
attribute float aKind;
attribute float aSeed;
uniform float uGlobePx;
uniform float uDpr;
uniform float uTime;
uniform float uHover;
uniform float uCamDist;
varying float vAlpha;
varying float vStudio;
varying float vHover;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(w.xyz);
  float facing = dot(n, normalize(cameraPosition - w.xyz));
  gl_Position = projectionMatrix * viewMatrix * w;
  float persp = uCamDist / gl_Position.w;
  vStudio = step(-0.5, aKind);
  vHover = vStudio * (1.0 - step(0.5, abs(aKind - uHover)));
  float size;
  if (vStudio > 0.5) {
    float beat = 0.5 + 0.5 * sin(uTime * 2.2 + aSeed * 6.28);
    size = uGlobePx * (0.05 + 0.012 * beat + 0.03 * vHover);
    vAlpha = facing > 0.0 ? 1.0 : 0.16;
  } else {
    size = uGlobePx * 0.0135 * (0.85 + 0.3 * aSeed);
    vAlpha = mix(0.07, 0.72, smoothstep(-0.15, 0.45, facing));
  }
  gl_PointSize = max(1.0, size * uDpr * persp);
}
`;
const dotFrag = /* glsl */ `
varying float vAlpha;
varying float vStudio;
varying float vHover;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float a;
  if (vStudio > 0.5) {
    float core = 1.0 - smoothstep(0.34, 0.44, r);
    float ring = smoothstep(0.62, 0.7, r) * (1.0 - smoothstep(0.82, 0.95, r));
    float halo = (1.0 - r) * 0.25;
    a = max(max(core, ring * (0.7 + 0.3 * vHover)), halo);
  } else {
    a = 1.0 - smoothstep(0.55, 1.0, r);
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.96), a * vAlpha);
}
`;

const arcVert = /* glsl */ `
attribute vec3 aPrev;
attribute vec3 aNext;
attribute float aSide;
attribute float aT;
attribute float aArc;
uniform vec2 uRes;
uniform float uWidth;
varying float vT;
varying float vSide;
varying float vArc;
varying float vOcc;
${GLSL_OCCLUDED}
void main() {
  mat4 mvp = projectionMatrix * viewMatrix * modelMatrix;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec4 c = mvp * vec4(position, 1.0);
  vec4 cp = mvp * vec4(aPrev, 1.0);
  vec4 cn = mvp * vec4(aNext, 1.0);
  float aspect = uRes.x / uRes.y;
  vec2 sp = cp.xy / cp.w; sp.x *= aspect;
  vec2 sn = cn.xy / cn.w; sn.x *= aspect;
  vec2 dir = sn - sp;
  dir = length(dir) > 1e-6 ? normalize(dir) : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  nrm.x /= aspect;
  c.xy += nrm * aSide * (uWidth / uRes.y) * c.w;
  gl_Position = c;
  vT = aT;
  vSide = aSide;
  vArc = aArc;
  vOcc = occluded(w.xyz);
}
`;
const arcFrag = /* glsl */ `
uniform float uDraw;
uniform float uTime;
uniform float uPulse;
uniform float uCount;
varying float vT;
varying float vSide;
varying float vArc;
varying float vOcc;
void main() {
  // each arc draws in turn as uDraw goes 0 -> 1
  float start = (vArc / uCount) * 0.6;
  float local = clamp((uDraw - start) / 0.4, 0.0, 1.0);
  if (vT > local) discard;
  float across = 1.0 - vSide * vSide;
  float a = 0.42 * across;
  // bright head while drawing
  a += across * 0.9 * exp(-(local - vT) * 18.0) * step(local, 0.999);
  // a travelling comet once drawn
  float pp = fract(uTime * 0.16 + vArc * 0.618);
  float tail = smoothstep(pp - 0.22, pp, vT) * step(vT, pp);
  a += uPulse * across * tail * tail * 0.95;
  a *= mix(1.0, 0.07, vOcc);
  gl_FragColor = vec4(vec3(0.97), a);
}
`;

/* ─────────── scene ─────────── */

type Drive = {
  yaw: number;
  tilt: number;
  vYaw: number;
  vTilt: number;
  dragging: boolean;
  lastInput: number;
  dragYaw: number;
  draw: number;
  screen: { x: number; y: number; front: boolean }[];
  hover: number;
};

function Globe({
  drive,
  running,
  reducedMotion,
  progress,
  tipRef,
}: {
  drive: MutableRefObject<Drive>;
  running: boolean;
  reducedMotion: boolean;
  progress?: number;
  tipRef: RefObject<HTMLDivElement | null>;
}) {
  const { camera, size, gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const dotsGeo = useMemo(buildDots, []);
  const arcsGeo = useMemo(buildArcs, []);
  const studioLocal = useMemo(() => STUDIOS.map((s) => toVec(s.lat, s.lon, 1.004)), []);
  const wv = useMemo(() => new THREE.Vector3(), []);
  const toCam = useMemo(() => new THREE.Vector3(), []);
  const clock = useRef(0);

  // keep the whole globe in frame on tall, narrow containers
  const dist = Math.max(3.7, 3.7 / (size.width / Math.max(1, size.height)));
  const globePx = size.height / 2 / (dist * TAN);

  const dotMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: dotVert,
        fragmentShader: dotFrag,
        uniforms: {
          uGlobePx: { value: 200 },
          uDpr: { value: 1 },
          uTime: { value: 0 },
          uHover: { value: -1 },
          uCamDist: { value: 3.7 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  const arcMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: arcVert,
        fragmentShader: arcFrag,
        uniforms: {
          uRes: { value: new THREE.Vector2(1, 1) },
          uWidth: { value: 2.2 },
          uDraw: { value: 0 },
          uTime: { value: 0 },
          uPulse: { value: 0 },
          uCount: { value: ARCS.length },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        // the ribbon is expanded in screen space, so its winding flips with direction: draw both sides
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(
    () => () => {
      dotsGeo.dispose();
      arcsGeo.dispose();
      dotMat.dispose();
      arcMat.dispose();
    },
    [dotsGeo, arcsGeo, dotMat, arcMat],
  );

  useEffect(() => {
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    dotMat.uniforms.uGlobePx.value = globePx;
    dotMat.uniforms.uCamDist.value = dist;
    dotMat.uniforms.uDpr.value = gl.getPixelRatio();
    arcMat.uniforms.uRes.value.set(size.width, size.height);
    arcMat.uniforms.uWidth.value = size.width < 480 ? 1.8 : 2.4;
  }, [camera, dist, globePx, size.width, size.height, gl, dotMat, arcMat]);

  useFrame((_, dtRaw) => {
    const d = drive.current;
    const dt = Math.min(dtRaw, 1 / 20);
    const g = group.current;
    if (!g) return;
    const now = performance.now();

    if (running) {
      clock.current += dt;
      if (!d.dragging) {
        // inertia
        d.yaw += d.vYaw * dt;
        d.dragYaw += d.vYaw * dt;
        d.tilt += d.vTilt * dt;
        const k = Math.exp(-dt * 2.4);
        d.vYaw *= k;
        d.vTilt *= k;
        // settle the tilt back and drift slowly when idle
        const idle = now - d.lastInput > 1400;
        if (idle) d.tilt += (START_TILT - d.tilt) * (1 - Math.exp(-dt * 0.8));
        if (progress === undefined && idle) d.yaw -= dt * 0.09 * Math.min(1, (now - d.lastInput - 1400) / 1500);
      }
      if (progress === undefined) d.draw = Math.min(1, d.draw + dt / 3.2);
    }
    if (reducedMotion) d.draw = 1;
    else if (progress !== undefined) d.draw = Math.min(1, Math.max(0, progress) * 1.25);
    d.tilt = Math.max(-0.4, Math.min(0.95, d.tilt));

    // progress turns the globe too, on top of any drag
    const yaw = progress !== undefined && !reducedMotion ? START_YAW - progress * 2.2 + d.dragYaw : d.yaw;
    g.rotation.set(d.tilt, yaw, 0, 'XYZ');
    g.updateMatrixWorld();

    dotMat.uniforms.uTime.value = clock.current;
    dotMat.uniforms.uHover.value = d.hover;
    arcMat.uniforms.uTime.value = clock.current;
    arcMat.uniforms.uPulse.value = running && d.draw >= 1 ? 1 : 0;
    arcMat.uniforms.uDraw.value = d.draw;

    // studio screen positions, for hover and the label
    studioLocal.forEach((v, i) => {
      wv.copy(v).applyMatrix4(g.matrixWorld);
      toCam.copy(camera.position).sub(wv);
      const front = wv.dot(toCam) > 0;
      wv.project(camera);
      d.screen[i] = { x: ((wv.x + 1) / 2) * size.width, y: ((1 - wv.y) / 2) * size.height, front };
    });
    const tip = tipRef.current;
    if (tip && d.hover >= 0 && d.screen[d.hover]) {
      const s = d.screen[d.hover];
      const flip = s.x > size.width - 190;
      tip.style.transform = `translate(${Math.round(flip ? s.x - 14 : s.x + 14)}px, ${Math.round(s.y - 14)}px) translate(${flip ? '-100%' : '0'}, -100%)`;
      tip.style.opacity = s.front ? '1' : '0.35';
    }
  });

  return (
    <group ref={group}>
      <points geometry={dotsGeo} material={dotMat} renderOrder={1} frustumCulled={false} />
      <mesh geometry={arcsGeo} material={arcMat} renderOrder={2} frustumCulled={false} />
    </group>
  );
}

/* ─────────── component ─────────── */

export default function ReferenceGlobe({ active, reducedMotion, progress }: ExperienceProps) {
  const running = active && !reducedMotion;
  const drive = useRef<Drive>({
    yaw: START_YAW,
    tilt: START_TILT,
    vYaw: 0,
    vTilt: 0,
    dragging: false,
    lastInput: -1e9,
    dragYaw: 0,
    draw: reducedMotion ? 1 : 0,
    screen: [],
    hover: -1,
  });
  const [hover, setHover] = useState(-1);
  const [redraw, setRedraw] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const ptr = useRef({ id: -1, x: 0, y: 0, sx: 0, sy: 0, t: 0, moved: false });

  useEffect(() => {
    if (reducedMotion) drive.current.draw = 1;
    invalidateRef.current?.();
  }, [reducedMotion, progress]);

  const show = (i: number) => {
    drive.current.hover = i;
    setHover(i);
    if (!running) invalidateRef.current?.();
  };

  const local = (e: RPointerEvent) => {
    const r = host.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const nearest = (x: number, y: number, radius: number) => {
    let best = -1;
    let bd = radius;
    drive.current.screen.forEach((s, i) => {
      if (!s?.front) return;
      const dd = Math.hypot(s.x - x, s.y - y);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    return best;
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('a')) return;
    const p = local(e);
    ptr.current = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), moved: false };
    const d = drive.current;
    d.dragging = true;
    d.vYaw = 0;
    d.vTilt = 0;
    d.lastInput = performance.now();
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const p = local(e);
    const d = drive.current;
    const w = host.current?.clientWidth ?? 400;
    if (d.dragging && e.pointerId === ptr.current.id) {
      const now = performance.now();
      const dx = p.x - ptr.current.x;
      const dy = p.y - ptr.current.y;
      const dtS = Math.max(1, now - ptr.current.t) / 1000;
      const k = (Math.PI * 1.1) / Math.max(320, w);
      d.yaw += dx * k;
      d.dragYaw += dx * k;
      d.tilt += dy * k;
      d.vYaw = d.vYaw * 0.4 + ((dx * k) / dtS) * 0.6;
      d.vTilt = d.vTilt * 0.4 + ((dy * k) / dtS) * 0.6;
      ptr.current.x = p.x;
      ptr.current.y = p.y;
      ptr.current.t = now;
      d.lastInput = now;
      if (Math.hypot(p.x - ptr.current.sx, p.y - ptr.current.sy) > 6) ptr.current.moved = true;
      if (!running) {
        // no inertia when still: the globe moves only while you drag
        d.vYaw = 0;
        d.vTilt = 0;
        invalidateRef.current?.();
      }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const n = nearest(p.x, p.y, 20);
    if (n >= 0) {
      if (n !== d.hover) show(n);
    } else if (d.hover >= 0) {
      // keep the label while the pointer heads for its link
      const s = d.screen[d.hover];
      if (!s || Math.hypot(s.x - p.x, s.y - p.y) > 110) show(-1);
    }
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== ptr.current.id) return;
    const d = drive.current;
    d.dragging = false;
    ptr.current.id = -1;
    // a quiet release (finger held still before lifting) should not fling
    if (performance.now() - ptr.current.t > 90) {
      d.vYaw = 0;
      d.vTilt = 0;
    }
    if (!running) {
      d.vYaw = 0;
      d.vTilt = 0;
    }
    if (!ptr.current.moved) {
      const p = local(e);
      show(nearest(p.x, p.y, e.pointerType === 'mouse' ? 20 : 30));
    }
    setRedraw((r) => r + 1);
  };

  const studio = hover >= 0 ? STUDIOS[hover] : null;

  return (
    <div
      ref={host}
      className="relative h-full w-full touch-pan-y select-none overflow-hidden bg-[var(--v-bg)] text-[var(--v-ink)]"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse' && !drive.current.dragging) show(-1);
      }}
      style={{ cursor: hover >= 0 ? 'pointer' : 'grab' }}
    >
      <Canvas
        dpr={[1, 1.5]}
        frameloop={running ? 'always' : 'demand'}
        camera={{ fov: FOV, position: [0, 0, 3.7], near: 0.1, far: 20 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl, invalidate }) => {
          gl.setClearColor(0x000000, 0);
          invalidateRef.current = invalidate;
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Globe drive={drive} running={running} reducedMotion={reducedMotion} progress={progress} tipRef={tip} />
        <StillFrames running={running} deps={[redraw, progress, reducedMotion]} />
      </Canvas>

      <Corner title="Reference Globe" tools={TOOLS} />

      <div
        ref={tip}
        className="pointer-events-auto absolute top-0 left-0 z-20 max-w-[180px] border border-[var(--v-steel)] bg-[var(--v-bg)]/90 px-2 py-1.5"
        style={{ visibility: studio ? 'visible' : 'hidden', transform: 'translate(-999px, -999px)' }}
        aria-hidden={!studio}
      >
        {studio && (
          <>
            <p className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">{studio.name}</p>
            <p className="mt-0.5 text-[12px] leading-4 text-[var(--v-dim)]">{studio.city}</p>
            <a
              href={studio.url}
              target="_blank"
              rel="noreferrer"
              className="pixel mt-1 block truncate text-[16px] leading-[16px] text-[var(--v-soft)] underline-offset-4 hover:text-[var(--v-ink)] hover:underline"
            >
              {studio.url.replace(/^https:\/\/(www\.)?/, '')} ↗
            </a>
          </>
        )}
      </div>

      <p className="pixel pointer-events-none absolute right-3 bottom-3 left-3 z-10 text-[16px] leading-[16px] text-[var(--v-dim)]">
        {STUDIOS.length} studios I study. Drag to spin, hover or tap a dot.
      </p>

      <ul className="sr-only">
        {STUDIOS.map((s) => (
          <li key={s.url}>
            <a href={s.url}>
              {s.name}, {s.city}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
