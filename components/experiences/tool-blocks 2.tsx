'use client';

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { EffectComposer, Noise } from '@react-three/postprocessing';
import { BlendFunction, Effect } from 'postprocessing';
import gsap from 'gsap';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';

/*
 * Tool Blocks: an isometric technical drawing of the toolkit.
 *  - Octree: branch(pos, size, depth ≤ 3) visits 8 octants and skips one corner. GSAP grows it one
 *    level at a time; a parent splits into its children while its outline lingers as a dashed
 *    construction line. Solid leaves are shaded by face (1 / 0.95 / 0.9, no lights); 30% are wireframes.
 *  - Keycaps: eight tools sit on a dashed dimension grid, names printed on their tops. Hover gives the
 *    logo a thermal-glow flash (the one colour in mono); click fills it with chrome.
 *  - Logo: an extruded mark whose edges draw themselves as a dashed line, then fill and turn to face you.
 *  - Corrupted bands: a custom postprocessing Effect rolls row-block noise up the screen; hit rows sample
 *    a 358px grid with R/G/B split, re-seeded every ~3 s.
 *  - Waypoints: scroll (or the timeline) carries one black cube between three DOM slots, measured live.
 */

const TOOLS_USED = ['r3f', 'drei', 'postprocessing', 'glsl', 'gsap', 'canvas2d', 'svg'];

const KEYS = [
  { id: 'gsap', name: 'GSAP' },
  { id: 'threejs', name: 'three.js' },
  { id: 'ogl', name: 'OGL' },
  { id: 'lenis', name: 'Lenis' },
  { id: 'react-bits', name: 'React Bits' },
  { id: 'shadcn', name: 'shadcn/ui' },
  { id: 'paper', name: 'Paper' },
  { id: 'spline', name: 'Spline' },
];

const INK = new THREE.Color('#080808');
const GROUND = '#f2f2ef';

/* ---------------- octree ---------------- */
type Node = { pos: THREE.Vector3; size: number; depth: number; leaf: boolean; solid: boolean; delay: number; parent: number };
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function buildOctree(seed: number, D = 3): Node[] {
  const r = rng(seed);
  const nodes: Node[] = [];
  const branch = (pos: THREE.Vector3, size: number, depth: number, parent: number) => {
    const idx = nodes.length;
    const split = depth < D && (depth === 0 || r() < (depth === 1 ? 0.62 : 0.42));
    nodes.push({ pos, size, depth, leaf: !split, solid: r() > 0.3, delay: r(), parent });
    if (!split) return;
    // skip one corner: the top front one at the root (the classic notch), random below
    const skip = depth === 0 ? 7 : Math.floor(r() * 8);
    for (let o = 0; o < 8; o++) {
      if (o === skip) continue;
      const q = size / 4;
      const p = new THREE.Vector3(pos.x + (o & 1 ? q : -q), pos.y + (o & 2 ? q : -q), pos.z + (o & 4 ? q : -q));
      branch(p, size / 2, depth + 1, idx);
    }
  };
  branch(new THREE.Vector3(0, 2, 0), 4, 0, -1);
  return nodes;
}

/* Box with per-face vertex colours: top 1, front 0.95, side 0.9 (fake shading, no lights). */
function shadedBox(base: THREE.Color) {
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const n = g.getAttribute('normal');
  const cols = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const nx = n.getX(i),
      ny = n.getY(i),
      nz = n.getZ(i);
    const k = ny > 0.5 ? 1 : nz > 0.5 ? 0.95 : nx > 0.5 ? 0.9 : ny < -0.5 ? 0.82 : 0.88;
    cols[i * 3] = base.r * k;
    cols[i * 3 + 1] = base.g * k;
    cols[i * 3 + 2] = base.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

/* Edges plus an X on every face, like a drafting wireframe. */
function wireCross() {
  const e = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const pts = Array.from(e.getAttribute('position').array as Float32Array);
  const h = 0.5;
  const faces: [number, number, number][][] = [
    [
      [-h, -h, h],
      [h, h, h],
      [h, -h, h],
      [-h, h, h],
    ],
    [
      [h, -h, -h],
      [h, h, h],
      [h, -h, h],
      [h, h, -h],
    ],
    [
      [-h, h, -h],
      [h, h, h],
      [-h, h, h],
      [h, h, -h],
    ],
  ];
  faces.forEach((f) => f.forEach((v) => pts.push(...v)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

/* ---------------- dashed line material with offset + draw progress ---------------- */
const dashVert = /* glsl */ `
attribute float lineDistance;
varying float vD;
void main() { vD = lineDistance; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const dashFrag = /* glsl */ `
uniform vec3 uColor; uniform float uDash; uniform float uGap; uniform float uOffset; uniform float uDraw; uniform float uTotal; uniform float uOpacity;
varying float vD;
void main() {
  if (vD > uDraw * uTotal) discard;
  if (mod(vD + uOffset, uDash + uGap) > uDash) discard;
  gl_FragColor = vec4(uColor, uOpacity);
}`;
function dashMat(dash: number, gap: number, opacity = 1, color = INK) {
  return new THREE.ShaderMaterial({
    vertexShader: dashVert,
    fragmentShader: dashFrag,
    transparent: opacity < 1,
    uniforms: {
      uColor: { value: color.clone() },
      uDash: { value: dash },
      uGap: { value: gap },
      uOffset: { value: 0 },
      uDraw: { value: 1 },
      uTotal: { value: 1e6 },
      uOpacity: { value: opacity },
    },
  });
}

/* ---------------- logo: chrome fill with a thermal flash ---------------- */
const fillVert = /* glsl */ `
varying vec3 vN; varying vec3 vP;
void main() { vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const fillFrag = /* glsl */ `
uniform float uFill; uniform float uHeat; uniform float uTime;
varying vec3 vN; varying vec3 vP;
vec3 ramp(float t) {
  // 7-stop thermal ramp
  vec3 c0 = vec3(0.03), c1 = vec3(0.10, 0.05, 0.45), c2 = vec3(0.48, 0.17, 1.0), c3 = vec3(1.0, 0.0, 0.66);
  vec3 c4 = vec3(1.0, 0.18, 0.0), c5 = vec3(1.0, 0.90, 0.0), c6 = vec3(1.0);
  t = clamp(t, 0.0, 1.0) * 6.0;
  if (t < 1.0) return mix(c0, c1, t);
  if (t < 2.0) return mix(c1, c2, t - 1.0);
  if (t < 3.0) return mix(c2, c3, t - 2.0);
  if (t < 4.0) return mix(c3, c4, t - 3.0);
  if (t < 5.0) return mix(c4, c5, t - 4.0);
  return mix(c5, c6, t - 5.0);
}
void main() {
  vec3 n = normalize(vN);
  // chrome: a banded studio environment read by the view normal
  float band = 0.5 + 0.5 * sin(n.y * 7.0 + n.x * 2.5 + 1.2);
  float rim = pow(1.0 - abs(n.z), 2.0);
  vec3 chrome = mix(vec3(0.12), vec3(0.97), smoothstep(0.25, 0.85, band)) + rim * 0.25;
  // heat: a blurred falloff from the mark's centre, breathing
  float d = length(vP.xy) / 1.2;
  float heat = (1.0 - smoothstep(0.0, 1.0, d)) * (0.8 + 0.2 * sin(uTime * 9.0 + vP.x * 6.0));
  vec3 col = mix(chrome, ramp(heat * 1.1), uHeat);
  gl_FragColor = vec4(col, uFill);
}`;

/* Hand-drawn marks (our own shapes), one per keycap. */
function markShape(i: number): THREE.Shape {
  const s = new THREE.Shape();
  const hole = (fn: (p: THREE.Path) => void) => {
    const p = new THREE.Path();
    fn(p);
    s.holes.push(p);
  };
  switch (i % 8) {
    case 0: // ring with a notch
      s.absarc(0, 0, 1, 0.35, Math.PI * 2 - 0.35, false);
      s.lineTo(Math.cos(-0.35) * 0.55, Math.sin(-0.35) * 0.55);
      s.absarc(0, 0, 0.55, -0.35, -Math.PI * 2 + 0.35, true);
      s.closePath();
      break;
    case 1: // triangle in triangle
      s.moveTo(0, 1.05);
      s.lineTo(1.05, -0.8);
      s.lineTo(-1.05, -0.8);
      s.closePath();
      hole((p) => {
        p.moveTo(0, -0.45);
        p.lineTo(0.42, 0.3);
        p.lineTo(-0.42, 0.3);
        p.closePath();
      });
      break;
    case 2: // circle with a round hole
      s.absarc(0, 0, 1, 0, Math.PI * 2, false);
      hole((p) => p.absarc(0, 0, 0.45, 0, Math.PI * 2, true));
      break;
    case 3: // plus with a square eye
      s.moveTo(-0.35, 1);
      s.lineTo(0.35, 1);
      s.lineTo(0.35, 0.35);
      s.lineTo(1, 0.35);
      s.lineTo(1, -0.35);
      s.lineTo(0.35, -0.35);
      s.lineTo(0.35, -1);
      s.lineTo(-0.35, -1);
      s.lineTo(-0.35, -0.35);
      s.lineTo(-1, -0.35);
      s.lineTo(-1, 0.35);
      s.lineTo(-0.35, 0.35);
      s.closePath();
      hole((p) => {
        p.moveTo(-0.14, -0.14);
        p.lineTo(-0.14, 0.14);
        p.lineTo(0.14, 0.14);
        p.lineTo(0.14, -0.14);
        p.closePath();
      });
      break;
    case 4: // atom-ish diamond
      s.moveTo(0, 1.1);
      s.lineTo(0.8, 0);
      s.lineTo(0, -1.1);
      s.lineTo(-0.8, 0);
      s.closePath();
      hole((p) => {
        p.moveTo(0, 0.45);
        p.lineTo(0.3, 0);
        p.lineTo(0, -0.45);
        p.lineTo(-0.3, 0);
        p.closePath();
      });
      break;
    case 5: // slash in a square
      s.moveTo(-0.95, -0.95);
      s.lineTo(0.95, -0.95);
      s.lineTo(0.95, 0.95);
      s.lineTo(-0.95, 0.95);
      s.closePath();
      hole((p) => {
        p.moveTo(-0.55, -0.7);
        p.lineTo(-0.25, -0.7);
        p.lineTo(0.55, 0.7);
        p.lineTo(0.25, 0.7);
        p.closePath();
      });
      break;
    case 6: // quarter-circle sheet
      s.moveTo(-0.9, -0.9);
      s.lineTo(0.9, -0.9);
      s.absarc(-0.9, -0.9, 1.8, 0, Math.PI / 2, false);
      s.closePath();
      hole((p) => p.absarc(-0.1, -0.1, 0.35, 0, Math.PI * 2, true));
      break;
    default: // hexagon ring
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        if (k === 0) s.moveTo(Math.cos(a), Math.sin(a));
        else s.lineTo(Math.cos(a), Math.sin(a));
      }
      s.closePath();
      hole((p) => {
        for (let k = 5; k >= 0; k--) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          if (k === 5) p.moveTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5);
          else p.lineTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5);
        }
        p.closePath();
      });
  }
  return s;
}

/* ---------------- corrupted-data bands (custom postprocessing Effect) ---------------- */
const corruptFrag = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uAmt;
float h1(float x) { return fract(sin(x * 127.1 + uSeed * 311.7) * 43758.5453); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float y = uv.y - uTime * 0.05;
  float band = floor(y * 42.0);
  float big = floor(y * 6.0);
  float n = h1(band) * 0.55 + h1(big + 100.0) * 0.45;
  if (n > 0.19 * uAmt + 0.0001) { outputColor = inputColor; return; }
  vec2 res = vec2(358.0, 358.0 * resolution.y / resolution.x);
  float shift = (h1(band + 7.0) - 0.5) * 0.05;
  vec2 q = (floor((uv + vec2(shift, 0.0)) * res) + 0.5) / res;
  float o = (h1(band + 3.0) - 0.5) * 0.006;
  float r = texture2D(inputBuffer, q + vec2(o, 0.0)).r;
  float g = texture2D(inputBuffer, q).g;
  float b = texture2D(inputBuffer, q - vec2(o, 0.0)).b;
  outputColor = vec4(r, g, b, 1.0);
}`;
class CorruptEffect extends Effect {
  constructor() {
    super('CorruptEffect', corruptFrag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uTime', new THREE.Uniform(0)],
        ['uSeed', new THREE.Uniform(1)],
        ['uAmt', new THREE.Uniform(1)],
      ]),
    });
  }
}

/* ---------------- label textures ---------------- */
function labelTexture(text: string, w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#080808';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 64;
  g.font = `${size}px 'Web IBM VGA 8x16', monospace`;
  while (g.measureText(text).width > w * 0.84 && size > 16) {
    size -= 4;
    g.font = `${size}px 'Web IBM VGA 8x16', monospace`;
  }
  g.fillText(text, w / 2, h / 2);
  g.fillText(text, w / 2 + 1.5, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

type Shared = {
  phase: { S: number; draw: number; fill: number; spin: number; slot: number };
  heat: number;
  mark: number;
  slots: { x: number; y: number }[];
  hover: number;
};

function Drawing({ reducedMotion, shared, fontsReady }: { reducedMotion: boolean; shared: React.MutableRefObject<Shared>; fontsReady: boolean }) {
  const { size, camera, invalidate } = useThree();
  const nodes = useMemo(() => buildOctree(20260929), []);

  const res = useMemo(() => {
    const face = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const keyFace = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const line = new THREE.LineBasicMaterial({ color: INK });
    const cubeGeo = shadedBox(new THREE.Color('#e4e4e0'));
    const keyGeo = shadedBox(new THREE.Color('#ffffff'));
    const carrierGeo = shadedBox(new THREE.Color('#1a1a1a'));
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const crossGeo = wireCross();
    // construction outline: dashed edges with line distances
    const cons = new THREE.LineSegments(edgeGeo.clone());
    cons.computeLineDistances();
    const consGeo = cons.geometry;
    const consMat = dashMat(0.08, 0.06);
    // floor grid (dashed)
    const gridPts: number[] = [];
    const G = 8;
    for (let i = -G; i <= G; i++) {
      gridPts.push(i, 0, -G, i, 0, G, -G, 0, i, G, 0, i);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
    const gridObj = new THREE.LineSegments(gridGeo);
    gridObj.computeLineDistances();
    const gridMat = dashMat(0.12, 0.14, 0.28);
    // dimension lines along two base edges of the cluster, with end ticks
    const dimPts: number[] = [];
    const d = 2.9;
    dimPts.push(-2, 0, d, 2, 0, d, -2, 0, d - 0.25, -2, 0, d + 0.25, 2, 0, d - 0.25, 2, 0, d + 0.25);
    dimPts.push(d, 0, -2, d, 0, 2, d - 0.25, 0, -2, d + 0.25, 0, -2, d - 0.25, 0, 2, d + 0.25, 0, 2);
    dimPts.push(-2.6, 0, 2.6, -2.6, 4, 2.6, -2.85, 0, 2.6, -2.35, 0, 2.6, -2.85, 4, 2.6, -2.35, 4, 2.6);
    const dimGeo = new THREE.BufferGeometry();
    dimGeo.setAttribute('position', new THREE.Float32BufferAttribute(dimPts, 3));
    const dimObj = new THREE.LineSegments(dimGeo);
    dimObj.computeLineDistances();
    const dimMat = dashMat(0.18, 0.08, 0.8);
    return { face, keyFace, line, cubeGeo, keyGeo, carrierGeo, edgeGeo, crossGeo, consGeo, consMat, gridGeo, gridMat, dimGeo, dimMat };
  }, []);

  // marks: extrude + dashed edges
  const marks = useMemo(
    () =>
      KEYS.map((_, i) => {
        const geo = new THREE.ExtrudeGeometry(markShape(i), {
          depth: 0.32,
          bevelEnabled: true,
          bevelSize: 0.04,
          bevelThickness: 0.04,
          bevelSegments: 2,
          curveSegments: 28,
        });
        geo.center();
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25));
        edges.computeLineDistances();
        const ld = edges.geometry.getAttribute('lineDistance');
        const total = ld.getX(ld.count - 1);
        return { geo, edgesGeo: edges.geometry, total };
      }),
    [],
  );
  const markLine = useMemo(() => dashMat(0.09, 0.05), []);
  const markFill = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: fillVert,
        fragmentShader: fillFrag,
        transparent: true,
        uniforms: { uFill: { value: 0 }, uHeat: { value: 0 }, uTime: { value: 0 } },
      }),
    [],
  );

  const labels = useMemo(() => (fontsReady ? KEYS.map((k) => labelTexture(k.name, 512, 128)) : []), [fontsReady]);
  const dimLabel = useMemo(() => (fontsReady ? labelTexture('4.000 u', 256, 64) : null), [fontsReady]);
  const effect = useMemo(() => new CorruptEffect(), []);

  useEffect(
    () => () => {
      Object.values(res).forEach((v) => (v as { dispose?: () => void }).dispose?.());
      marks.forEach((m) => {
        m.geo.dispose();
        m.edgesGeo.dispose();
      });
      markLine.dispose();
      markFill.dispose();
      effect.dispose();
    },
    [res, marks, markLine, markFill, effect],
  );
  useEffect(
    () => () => {
      labels.forEach((t) => t.dispose());
      dimLabel?.dispose();
    },
    [labels, dimLabel],
  );
  useEffect(() => invalidate(), [labels, invalidate]);

  // camera zoom: fit the drawing
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    const narrow = size.width < size.height;
    cam.zoom = narrow ? size.width / 15 : Math.min(size.width / 23, size.height / 14.5);
    cam.updateProjectionMatrix();
    invalidate();
  }, [size, camera, invalidate]);

  const nodeRefs = useRef<(THREE.Group | null)[]>([]);
  const solidRefs = useRef<(THREE.Object3D | null)[]>([]);
  const consRefs = useRef<(THREE.Object3D | null)[]>([]);
  const markGroup = useRef<THREE.Group>(null);
  const markMesh = useRef<THREE.Mesh>(null);
  const markEdges = useRef<THREE.LineSegments>(null);
  const carrier = useRef<THREE.Group>(null);
  const cluster = useRef<THREE.Group>(null);
  const keyRefs = useRef<(THREE.Group | null)[]>([]);
  const time = useRef(0);
  const shownMark = useRef(-1);
  const faceQ = useMemo(() => new THREE.Quaternion(), []);
  const spinQ = useMemo(() => new THREE.Quaternion(), []);

  useFrame((_, delta) => {
    const sh = shared.current;
    const ph = sh.phase;
    if (!reducedMotion) time.current += Math.min(delta, 0.05);
    const t = time.current;
    const narrow = size.width < size.height;

    // octree presence from the continuous stage S
    const S = ph.S;
    nodes.forEach((n, i) => {
      const g = nodeRefs.current[i];
      if (!g) return;
      const born = n.depth === 0 ? 1 : THREE.MathUtils.clamp((S - (n.depth - 1) - n.delay * 0.45) / 0.4, 0, 1);
      const split = !n.leaf && S > n.depth + 0.02;
      const e = born * born * (3 - 2 * born);
      g.visible = e > 0.001;
      g.scale.setScalar(n.size * (0.2 + 0.8 * e));
      const solid = solidRefs.current[i];
      if (solid) solid.visible = !split;
      const cons = consRefs.current[i];
      if (cons) cons.visible = split && S < n.depth + 0.95;
    });
    res.consMat.uniforms.uOffset.value = -t * 0.25;
    res.gridMat.uniforms.uOffset.value = -t * 0.12;
    res.dimMat.uniforms.uOffset.value = t * 0.2;

    // mark: dashed draw, then chrome fill, then turn to face the camera
    if (shownMark.current !== sh.mark) shownMark.current = sh.mark;
    const mk = marks[sh.mark];
    if (markMesh.current && markEdges.current) {
      markMesh.current.geometry = mk.geo;
      markEdges.current.geometry = mk.edgesGeo;
    }
    markLine.uniforms.uTotal.value = mk.total;
    markLine.uniforms.uDraw.value = ph.draw;
    markLine.uniforms.uOffset.value = -t * 0.3;
    markFill.uniforms.uFill.value = ph.fill;
    markFill.uniforms.uHeat.value = sh.heat;
    markFill.uniforms.uTime.value = t;
    const mg = markGroup.current;
    const cg = cluster.current;
    if (mg && cg) {
      // the cluster group is rotated to iso; counter-rotate so the mark can face the viewer
      faceQ.copy(cg.quaternion).invert();
      spinQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (1 - ph.spin) * Math.PI * 1.5);
      mg.quaternion.copy(faceQ).multiply(spinQ);
      mg.position.y = 6.7 + Math.sin(t * 1.2) * 0.08;
    }

    // keycaps: hovered one presses down
    KEYS.forEach((_, i) => {
      const k = keyRefs.current[i];
      if (!k) return;
      const target = sh.hover === i ? -0.12 : 0;
      k.position.y += (target - k.position.y) * (reducedMotion ? 1 : 0.25);
    });

    // cluster sits left of the slot column on wide screens
    if (cg) {
      const cam = camera as THREE.OrthographicCamera;
      const halfW = size.width / 2 / cam.zoom;
      cg.position.x = narrow ? 0 : -halfW * 0.16;
      cg.position.y = narrow ? -0.2 : -1.6;
    }

    // carrier cube: between DOM slots
    const cr = carrier.current;
    if (cr && sh.slots.length === 3) {
      const cam = camera as THREE.OrthographicCamera;
      const f = ph.slot;
      const i0 = Math.min(1, Math.floor(f));
      const k = f - i0;
      const a = sh.slots[i0];
      const b = sh.slots[Math.min(2, i0 + 1)];
      const px = a.x + (b.x - a.x) * k;
      const py = a.y + (b.y - a.y) * k;
      const hop = Math.sin(k * Math.PI) * 26;
      cr.position.set((px - size.width / 2) / cam.zoom, (size.height / 2 - py + hop) / cam.zoom, 20);
      cr.rotation.set(0.15 * Math.PI, -0.25 * Math.PI + f * Math.PI * 0.5, 0);
      cr.scale.setScalar(28 / cam.zoom);
    }

    effect.uniforms.get('uTime')!.value = t;
    effect.uniforms.get('uSeed')!.value = reducedMotion ? 3 : Math.floor(t / 3) + 1;
  });

  // two rows along the front edges of the grid, like a keyboard seen from the corner
  const keyPos = (i: number) => {
    // two staggered rows of iso keycaps, running level across the screen in front of the cluster
    const k = i % 4;
    const back = i < 4;
    const u = -3.55 + k * 2.37 + (back ? 0 : 1.18);
    const v = back ? 4.7 : 5.95;
    const r = Math.SQRT1_2;
    return new THREE.Vector3(u * r + v * r, 0.25, -u * r + v * r);
  };
  const onKeyOver = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const sh = shared.current;
    sh.hover = i;
    document.body.style.cursor = 'pointer';
    if (sh.mark !== i) {
      sh.mark = i;
      if (!reducedMotion) gsap.fromTo(sh.phase, { draw: 0 }, { draw: 1, duration: 0.9, ease: 'power2.out', overwrite: 'auto' });
    }
    if (!reducedMotion) {
      gsap.killTweensOf(sh, 'heat');
      gsap.timeline().to(sh, { heat: 1, duration: 0.25, ease: 'power2.out' }).to(sh, { heat: 0, duration: 1.1, ease: 'power2.in' }, '+=0.35');
    }
    invalidate();
  };
  const onKeyOut = () => {
    shared.current.hover = -1;
    document.body.style.cursor = '';
    invalidate();
  };
  const onKeyClick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const sh = shared.current;
    sh.mark = i;
    if (reducedMotion) {
      sh.phase.draw = 1;
      sh.phase.fill = 1;
      sh.phase.spin = 1;
      invalidate();
      return;
    }
    gsap
      .timeline()
      .to(sh.phase, { draw: 1, duration: 0.4, ease: 'power2.out', overwrite: 'auto' })
      .fromTo(sh.phase, { fill: 0, spin: 0 }, { fill: 1, spin: 1, duration: 1.1, ease: 'expo.out' });
  };

  return (
    <>
      <color attach="background" args={[GROUND]} />
      <group ref={cluster} rotation={[0.15 * Math.PI, -0.25 * Math.PI, 0]}>
        <lineSegments geometry={res.gridGeo} material={res.gridMat} />
        <lineSegments geometry={res.dimGeo} material={res.dimMat} />
        {dimLabel && (
          <mesh position={[0, 0.01, 3.35]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[2, 0.5]} />
            <meshBasicMaterial map={dimLabel} transparent depthWrite={false} />
          </mesh>
        )}
        {nodes.map((n, i) => (
          <group key={i} ref={(el) => void (nodeRefs.current[i] = el)} position={n.pos}>
            <group ref={(el) => void (solidRefs.current[i] = el)}>
              {n.leaf && !n.solid ? (
                <lineSegments geometry={res.crossGeo} material={res.line} />
              ) : (
                <>
                  <mesh geometry={res.cubeGeo} material={res.face} />
                  <lineSegments geometry={res.edgeGeo} material={res.line} />
                </>
              )}
            </group>
            {!n.leaf && <lineSegments ref={(el) => void (consRefs.current[i] = el)} geometry={res.consGeo} material={res.consMat} visible={false} />}
          </group>
        ))}
        {KEYS.map((k, i) => {
          const p = keyPos(i);
          return (
            <group key={k.id} position={p}>
              <group ref={(el) => void (keyRefs.current[i] = el)}>
                <group scale={[1.62, 0.5, 1.62]}>
                  <mesh geometry={res.keyGeo} material={res.keyFace} onPointerOver={onKeyOver(i)} onPointerOut={onKeyOut} onClick={onKeyClick(i)} />
                  <lineSegments geometry={res.edgeGeo} material={res.line} />
                </group>
                {labels[i] && (
                  <mesh position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
                    <planeGeometry args={[2.2, 0.55]} />
                    <meshBasicMaterial map={labels[i]} transparent depthWrite={false} />
                  </mesh>
                )}
              </group>
            </group>
          );
        })}
        <group ref={markGroup} position={[0, 6.7, 0]} scale={1.1}>
          <mesh ref={markMesh} geometry={marks[0].geo} material={markFill} renderOrder={5} />
          <lineSegments ref={markEdges} geometry={marks[0].edgesGeo} material={markLine} renderOrder={6} />
        </group>
      </group>
      <group ref={carrier}>
        <mesh geometry={res.carrierGeo}>
          <meshBasicMaterial vertexColors />
        </mesh>
        <lineSegments geometry={res.edgeGeo}>
          <lineBasicMaterial color="#f5f5f5" />
        </lineSegments>
      </group>
      <EffectComposer multisampling={0}>
        <primitive object={effect} />
        <Noise opacity={0.07} blendFunction={BlendFunction.MULTIPLY} premultiply={false} />
      </EffectComposer>
    </>
  );
}

const SLOTS = [
  { n: '01', t: 'grow', d: 'octree, level by level' },
  { n: '02', t: 'draw', d: 'dashed edges trace the mark' },
  { n: '03', t: 'fill', d: 'chrome, turned to face you' },
];

export default function ToolBlocks({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [fontsReady, setFontsReady] = useState(false);
  const [slot, setSlot] = useState(0);
  const shared = useRef<Shared>({ phase: { S: 0, draw: 0, fill: 0, spin: 0, slot: 0 }, heat: 0, mark: 0, slots: [], hover: -1 });
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const manualUntil = useRef(0);
  const invalidateRef = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    document.fonts
      .load(`48px 'Web IBM VGA 8x16'`)
      .catch(() => null)
      .then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // measure the DOM slots (their centres, relative to the stage)
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      shared.current.slots = slotRefs.current.map((s) => {
        const b = s?.getBoundingClientRect();
        return b ? { x: b.left - r.left + 22, y: b.top - r.top + b.height / 2 } : { x: 0, y: 0 };
      });
      invalidateRef.current();
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // The whole story as one GSAP timeline: grow (level by level) → draw → fill → hold → collapse.
  useEffect(() => {
    const ph = shared.current.phase;
    const tl = gsap.timeline({ paused: true });
    tl.to(ph, { slot: 0, duration: 0.01 }, 0)
      .to(ph, { S: 1, duration: 0.9, ease: 'power2.inOut' }, 0.2)
      .to(ph, { S: 2, duration: 0.9, ease: 'power2.inOut' }, 1.2)
      .to(ph, { S: 3.2, duration: 1.1, ease: 'power2.inOut' }, 2.2)
      .to(ph, { slot: 1, duration: 0.7, ease: 'power3.inOut' }, 3.3)
      .fromTo(ph, { draw: 0 }, { draw: 1, duration: 1.8, ease: 'power1.inOut' }, 3.5)
      .to(ph, { slot: 2, duration: 0.7, ease: 'power3.inOut' }, 5.3)
      .fromTo(ph, { fill: 0, spin: 0 }, { fill: 1, spin: 1, duration: 1.3, ease: 'expo.out' }, 5.5)
      .to({}, { duration: 2.6 }, 6.8)
      .to(ph, { S: 0, fill: 0, draw: 0, spin: 0, slot: 0, duration: 0.9, ease: 'power3.in' }, 9.4);
    tlRef.current = tl;
    if (reducedMotion) {
      tl.progress(0.84);
      invalidateRef.current();
    }
    return () => {
      tl.kill();
    };
  }, [reducedMotion]);

  // drive: parent progress, wheel scrub, or autoplay
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (progress !== undefined) {
      tl.pause();
      tl.progress(Math.min(0.84, progress * 0.84));
      invalidateRef.current();
      return;
    }
    if (!active || reducedMotion) {
      tl.pause();
      return;
    }
    tl.play();
    tl.repeat(-1);
    return () => void tl.pause();
  }, [active, reducedMotion, progress]);

  // slot label follows the carrier
  useEffect(() => {
    if (reducedMotion) {
      setSlot(2);
      return;
    }
    const tick = () => {
      const s = Math.round(shared.current.phase.slot);
      setSlot((p) => (p === s ? p : s));
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [reducedMotion]);

  // wheel scrubs the timeline
  useEffect(() => {
    const el = host.current;
    if (!el || progress !== undefined) return;
    const onWheel = (e: WheelEvent) => {
      const tl = tlRef.current;
      if (!tl) return;
      e.preventDefault();
      tl.pause();
      manualUntil.current = performance.now() + 3500;
      tl.progress(Math.min(0.84, Math.max(0, tl.progress() + e.deltaY * 0.0006)));
      invalidateRef.current();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    const resume = setInterval(() => {
      const tl = tlRef.current;
      if (tl && !reducedMotion && active && performance.now() > manualUntil.current && tl.paused()) tl.play();
    }, 500);
    return () => {
      el.removeEventListener('wheel', onWheel);
      clearInterval(resume);
    };
  }, [progress, reducedMotion, active]);

  return (
    <div ref={host} className="relative h-full w-full select-none overflow-hidden" style={{ background: GROUND }}>
      <Canvas
        orthographic
        dpr={[1, 1.75]}
        frameloop={!active ? 'never' : reducedMotion ? 'demand' : 'always'}
        camera={{ position: [0, 0, 50], zoom: 50, near: 0.1, far: 200 }}
        gl={{ antialias: true }}
        style={{ position: 'absolute', inset: 0 }}
        onCreated={(s) => (invalidateRef.current = () => s.invalidate())}
      >
        <Drawing reducedMotion={reducedMotion} shared={shared} fontsReady={fontsReady} />
      </Canvas>

      <div className="pointer-events-none absolute top-3 left-3 max-w-[70%] sm:top-4 sm:left-4">
        <p className="pixel text-[16px] leading-[16px] text-[#080808]">TOOL BLOCKS</p>
        <p className="pixel mt-1 hidden text-[16px] leading-[16px] text-[#555] sm:block">
          built with:{' '}
          {TOOLS_USED.map((t, i) => (
            <span key={t}>
              {i > 0 && ' · '}
              <Link href={`/tools#${t}`} className="pointer-events-auto hover:text-[#080808] hover:underline">
                {t}
              </Link>
            </span>
          ))}
        </p>
      </div>

      {/* DOM slots the carrier cube travels between */}
      <div className="pointer-events-none absolute right-3 bottom-4 left-3 flex justify-between gap-2 sm:top-1/2 sm:right-6 sm:bottom-auto sm:left-auto sm:w-[240px] sm:-translate-y-1/2 sm:flex-col sm:gap-10">
        {SLOTS.map((s, i) => (
          <div key={s.n} ref={(el) => void (slotRefs.current[i] = el)} className="flex min-w-0 items-center gap-3">
            <div className={`h-[44px] w-[44px] shrink-0 border border-dashed ${slot === i ? 'border-[#080808]' : 'border-[#080808]/35'}`} />
            <div className="min-w-0">
              <p className={`pixel text-[16px] leading-[16px] ${slot === i ? 'text-[#080808]' : 'text-[#080808]/45'}`}>
                [{s.n}] {s.t}
              </p>
              <p className="pixel mt-1 hidden text-[16px] leading-[16px] text-[#080808]/55 sm:block">{s.d}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="pixel pointer-events-none absolute top-3 right-3 text-[16px] leading-[16px] text-[#080808]/60 sm:top-4 sm:right-4">
        hover a key · click to fill
      </p>
    </div>
  );
}
