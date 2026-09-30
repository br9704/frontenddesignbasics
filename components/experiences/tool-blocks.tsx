'use client';

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { EffectComposer, Noise } from '@react-three/postprocessing';
import { BlendFunction, Effect } from 'postprocessing';
import gsap from 'gsap';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { ExperienceProps } from '@/lib/experiences/types';

/*
 * Tool Blocks: an isometric technical drawing of the toolkit.
 *  - Octree: branch(pos, size, depth ≤ 3) visits 8 octants and skips one corner. The root (4 u) splits into
 *    7 octants, each octant into 7 one-unit cells: 49 cells. 37 of them are the toolkit's tools, drawn as
 *    white keycaps with the name printed on the cap; the rest split once more into half-unit solid and
 *    wireframe cubes. GSAP grows it one level at a time; a parent's outline lingers as a dashed
 *    construction line. Faces are shaded 1 / 0.95 / 0.9 by normal (no lights).
 *  - Labels: printed only on a face the camera sees whole (ray-marched at build time), pre-stretched
 *    against the iso foreshortening so they read upright (anamorphic, like road markings). Phones print
 *    short names on tops and monograms on sides. Tools with no clean face sit inside, listed in the HUD.
 *  - Logo: the missing top-front octant is a dashed socket; the current tool's monogram (pixel font →
 *    traced SVG path → SVGLoader → ExtrudeGeometry) floats in it, draws its edges as a dashed line,
 *    flashes thermal, then fills with chrome and turns to face you.
 *  - Corrupted bands: a custom postprocessing Effect rolls clumps of torn rows up through the cluster's
 *    screen box only; torn rows shift in x blocks, sample a 358px grid with R/G/B split, re-seeded every ~3 s.
 *  - Waypoints: the timeline (or scrub) carries one black cube between three DOM slots, measured live.
 */

const TOOLS_USED = ['r3f', 'drei', 'postprocessing', 'glsl', 'gsap', 'canvas2d', 'svg'];

/*
 * The toolkit (toolkit/toolkit.json), in its own order:
 * id, label printed on the cap, short label (narrow screens), monogram (the mark + narrow side caps), full name, category.
 */
const TOOLS: [string, string, string, string, string, string][] = [
  ['gsap', 'GSAP', 'GSAP', 'GS', 'GSAP', 'motion'],
  ['lenis', 'Lenis', 'Lenis', 'Le', 'Lenis', 'motion'],
  ['motion', 'Motion', 'Motion', 'M', 'Motion (motion.dev)', 'motion'],
  ['scroll-world', 'ScrollWorld', 'SWorld', 'SW', 'Scroll World', 'motion'],
  ['scrollcraft', 'ScrollCraft', 'SCraft', 'SC', 'ScrollCraft', 'motion'],
  ['threejs', 'three.js', 'three', '3JS', 'three.js', '3d'],
  ['img2threejs', 'img2three', 'img2-3', 'i23', 'img2threejs', '3d'],
  ['threlte', 'Threlte', 'Threlte', 'Th', 'Threlte', '3d'],
  ['threeui', 'ThreeUI', 'ThreeUI', 'TUI', 'ThreeUI', '3d'],
  ['spline', 'Spline', 'Spline', 'Sp', 'Spline', '3d'],
  ['playcanvas', 'PlayCanvas', 'PlayCv', 'PC', 'PlayCanvas', '3d'],
  ['vectary', 'Vectary', 'Vectary', 'V', 'Vectary', '3d'],
  ['ogl', 'OGL', 'OGL', 'OGL', 'OGL', 'shaders'],
  ['shadergradient', 'ShaderGrad', 'ShGrad', 'SG', 'ShaderGradient', 'shaders'],
  ['getlayers', 'GetLayers', 'Layers', 'GL', 'GetLayers', 'shaders'],
  ['higgsfield', 'Higgsfield', 'Higgs', 'H', 'Higgsfield', 'ai'],
  ['react-bits', 'React Bits', 'RBits', 'RB', 'React Bits', 'components'],
  ['magic-ui', 'Magic UI', 'MagicUI', 'MU', 'Magic UI', 'components'],
  ['cult-ui', 'Cult UI', 'CultUI', 'CU', 'Cult UI', 'components'],
  ['21st', '21st.dev', '21st', '21', '21st.dev', 'components'],
  ['bklit', 'Bklit UI', 'Bklit', 'Bk', 'Bklit UI', 'components'],
  ['shadcn', 'shadcn/ui', 'shadcn', '//', 'shadcn/ui', 'components'],
  ['refero', 'Refero', 'Refero', 'Rf', 'Refero', 'research'],
  ['jitter', 'Jitter', 'Jitter', 'J', 'Jitter', 'research'],
  ['paper', 'Paper', 'Paper', 'P', 'Paper', 'research'],
  ['frontend-design', 'fe-design', 'fe-des', 'fd', 'frontend-design (official)', 'skills'],
  ['impeccable', 'impeccable', 'impec', 'im', 'impeccable', 'skills'],
  ['taste-skill', 'taste', 'taste', 'ta', 'taste-skill', 'skills'],
  ['ui-ux-pro-max', 'UI/UX Pro', 'UI/UX', 'UX', 'UI/UX Pro Max', 'skills'],
  ['web-design-guidelines', 'web guide', 'WIG', 'WG', 'Web Interface Guidelines', 'skills'],
  ['anthropic-example-skills', 'anthropic', 'anthro', 'A\\', 'Anthropic example skills', 'skills'],
  ['frontend-design-basics', 'fd-basics', 'fdb', 'fb', "frontend-design-basics (Bruno's)", 'skills'],
  ['context7', 'Context7', 'Ctx7', 'C7', 'Context7', 'infra'],
  ['playwright', 'Playwright', 'Playwr', 'PW', 'Playwright MCP', 'infra'],
  ['chrome-devtools', 'DevTools', 'DevT', 'DT', 'Chrome DevTools MCP', 'infra'],
  ['voicestudio', 'VoiceStudio', 'Voice', 'VS', 'VoiceStudio', 'media'],
  ['openwa', 'OpenWA', 'OpenWA', 'WA', 'OpenWA', 'media'],
];
/* when the drawing has fewer cleanly visible caps than tools, these sit inside the block (listed in the title block) */
const HIDE_ORDER = ['openwa', 'voicestudio', 'bklit', 'jitter', 'getlayers', 'vectary', 'threlte', 'cult-ui', 'higgsfield', 'refero', 'taste-skill'];

const INK = new THREE.Color('#080808');
const GROUND = '#f2f2ef';
const TILT = 0.15 * Math.PI;
const CAP = 0.92; // keycap size inside its 1 u cell

/* ---------------- octree ---------------- */
type Face = 'top' | 'z' | 'x' | null;
type Node = {
  pos: THREE.Vector3;
  size: number;
  depth: number;
  leaf: boolean;
  solid: boolean;
  delay: number;
  tool: number; // index into TOOLS, or -1
  face: Face; // where the name is printed
};
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
const octant = (pos: THREE.Vector3, size: number, o: number) => {
  const q = size / 4;
  return new THREE.Vector3(pos.x + (o & 1 ? q : -q), pos.y + (o & 2 ? q : -q), pos.z + (o & 4 ? q : -q));
};

/* the direction toward the camera in the cluster's own (un-rotated) frame */
const VIEW = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(TILT, -0.25 * Math.PI, 0)).invert());
const FACES: Exclude<Face, null>[] = ['top', 'z', 'x'];
const LABEL_ROT: Record<Exclude<Face, null>, THREE.Euler> = {
  top: new THREE.Euler(-Math.PI / 2, 0, Math.PI / 4),
  z: new THREE.Euler(0, 0, 0),
  x: new THREE.Euler(0, Math.PI / 2, 0),
};

/*
 * branch(pos, size, depth): root → 7 octants → 49 cells → half-unit cubes.
 * A name is printed only where every point of its label can see the camera: rays from a grid of points on
 * the label are marched toward the viewer through the occupied cells (and the socket, where the mark
 * floats). Caps that fail are never printed half-hidden: visible ones split into grey half-unit cubes (the
 * octree's texture, and the walls of the socket), hidden ones hold the tools listed as "inside".
 */
function buildCluster(seed: number): { nodes: Node[]; inside: number[] } {
  const r = rng(seed);
  const cells: THREE.Vector3[] = [];
  const nodes: Node[] = [];
  const root = new THREE.Vector3(0, 2, 0);
  nodes.push({ pos: root, size: 4, depth: 0, leaf: false, solid: true, delay: 0, tool: -1, face: null });
  const oct: THREE.Vector3[] = [];
  for (let o = 0; o < 8; o++) if (o !== 7) oct.push(octant(root, 4, o)); // skip the top-front corner: the socket
  oct.forEach((p) => {
    nodes.push({ pos: p, size: 2, depth: 1, leaf: false, solid: true, delay: r(), tool: -1, face: null });
    const skip = Math.floor(r() * 8);
    for (let o = 0; o < 8; o++) if (o !== skip) cells.push(octant(p, 2, o));
  });

  const key = (x: number, y: number, z: number) => `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  const occ = new Set(cells.map((c) => key(c.x, c.y, c.z)));
  const blocked = new Set(occ);
  for (const x of [0.5, 1.5]) for (const y of [2.5, 3.5]) for (const z of [0.5, 1.5]) blocked.add(key(x, y, z)); // the socket
  const p = new THREE.Vector3();
  const clean = (c: THREE.Vector3, face: Exclude<Face, null>) => {
    const own = key(c.x, c.y, c.z);
    const [w, h] = face === 'top' ? [TOP_W, TOP_H] : [SIDE_W, SIDE_H];
    const off = CAP / 2 + 0.01;
    for (let i = 0; i <= 6; i++)
      for (let j = 0; j <= 2; j++) {
        p.set((i / 6 - 0.5) * w, (j / 2 - 0.5) * h, 0).applyEuler(LABEL_ROT[face]);
        if (face === 'top') p.y += off;
        else if (face === 'z') p.z += off;
        else p.x += off;
        p.add(c);
        for (let t = 0.02; t < 9; t += 0.04) {
          const k = key(p.x + VIEW.x * t, p.y + VIEW.y * t, p.z + VIEW.z * t);
          if (k !== own && blocked.has(k)) return false;
        }
      }
    return true;
  };
  const info = cells.map((c) => {
    const exposed = !occ.has(key(c.x, c.y + 1, c.z)) || !occ.has(key(c.x, c.y, c.z + 1)) || !occ.has(key(c.x + 1, c.y, c.z));
    const face = FACES.find((f) => clean(c, f)) ?? null;
    return { c, face, exposed, rank: (face === 'top' ? 10 : face ? 5 : 0) + c.y * 0.3 + r() * 0.8 };
  });
  const byRank = info.map((_, i) => i).sort((a, b) => info[b].rank - info[a].rank);
  const printable = byRank.filter((i) => info[i].face);
  const nHidden = Math.max(0, TOOLS.length - printable.length);
  const hiddenIds = new Set(HIDE_ORDER.slice(0, nHidden));
  const inside = TOOLS.map((_, i) => i).filter((i) => hiddenIds.has(TOOLS[i][0]));
  // the printed tools, longest names first, so long names land on the big top faces
  const shown = TOOLS.map((_, i) => i)
    .filter((i) => !hiddenIds.has(TOOLS[i][0]))
    .sort((a, b) => TOOLS[b][1].length - TOOLS[a][1].length || a - b);
  const tops = printable.filter((i) => info[i].face === 'top');
  const sides = printable.filter((i) => info[i].face !== 'top');
  const assign = new Map<number, number>();
  const longFirst = shown.slice(0, tops.length);
  tops.forEach((ci, k) => assign.set(ci, longFirst[k]));
  shown.slice(tops.length).forEach((ti, k) => sides[k] !== undefined && assign.set(sides[k], ti));
  // tools inside the block: the hidden cells first
  const hiddenCells = byRank.filter((i) => !info[i].face).reverse();
  const hc = hiddenCells.filter((i) => !info[i].exposed).concat(hiddenCells.filter((i) => info[i].exposed));
  inside.forEach((ti, k) => hc[k] !== undefined && assign.set(hc[k], ti));

  info.forEach(({ c, face, exposed }, ci) => {
    const t = assign.get(ci);
    if (t !== undefined) {
      nodes.push({ pos: c, size: 1, depth: 2, leaf: true, solid: true, delay: r(), tool: t, face });
      return;
    }
    nodes.push({ pos: c, size: 1, depth: 2, leaf: !exposed, solid: false, delay: r(), tool: -1, face: null });
    if (!exposed) return;
    const skip = Math.floor(r() * 8);
    for (let o = 0; o < 8; o++) {
      if (o === skip) continue;
      nodes.push({ pos: octant(c, 1, o), size: 0.5, depth: 3, leaf: true, solid: r() > 0.3, delay: r(), tool: -1, face: null });
    }
  });
  return { nodes, inside };
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

/* Keycap: box edges plus an inset square on the top (the dish), in a 1 u box. */
function keycapLines() {
  const e = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const pts = Array.from(e.getAttribute('position').array as Float32Array);
  const a = 0.4,
    y = 0.501;
  pts.push(-a, y, -a, a, y, -a, a, y, -a, a, y, a, a, y, a, -a, y, a, -a, y, a, -a, y, -a);
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
  // chrome: a sky / horizon / ground environment read by the view normal and height, so even the
  // flat face carries the classic hard dark-under-light split
  float h = vP.y * 0.55 - vP.x * 0.12 + n.y * 0.9 + n.x * 0.25;
  vec3 sky = mix(vec3(0.55), vec3(1.0), smoothstep(0.0, 0.9, h));
  vec3 ground = mix(vec3(0.04), vec3(0.3), smoothstep(-1.2, -0.05, h));
  vec3 chrome = h > 0.0 ? sky : ground;
  chrome += smoothstep(0.08, 0.0, abs(h - 0.12)) * 0.35; // horizon glint
  chrome += pow(1.0 - abs(n.z), 3.0) * 0.3; // rim on the bevels
  // heat: a blurred falloff from the mark's centre, breathing
  float d = length(vP.xy) / 1.3;
  float heat = (1.0 - smoothstep(0.0, 1.0, d)) * (0.85 + 0.15 * sin(uTime * 9.0 + vP.x * 6.0));
  vec3 col = mix(chrome, ramp(0.3 + heat * 0.75), uHeat);
  gl_FragColor = vec4(col, max(uFill, uHeat * 0.95));
}`;

/*
 * Each tool's mark: its monogram set in the pixel font, traced pixel-edge by pixel-edge into an SVG path,
 * parsed with SVGLoader and extruded. So the mark in the socket always spells the tool named in the HUD.
 */
function monogramSVG(text: string): { svg: string; w: number; h: number } {
  const W = text.length * 8 + 4,
    H = 18;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.font = `16px 'Web IBM VGA 8x16', monospace`;
  g.textBaseline = 'top';
  g.fillStyle = '#000';
  g.fillText(text, 2, 1);
  const a = g.getImageData(0, 0, W, H).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && a[(y * W + x) * 4 + 3] > 110;
  // directed boundary edges (filled cell on the right, y down), chained into closed loops
  const out = new Map<string, [number, number][]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = `${x0},${y0}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push([x1, y1]);
  };
  let minX = W,
    minY = H,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!on(x, y)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
      if (!on(x, y - 1)) add(x, y, x + 1, y);
      if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!on(x - 1, y)) add(x, y + 1, x, y);
    }
  let d = '';
  for (const [start, list] of out) {
    while (list.length) {
      const [sx, sy] = start.split(',').map(Number);
      const pts: [number, number][] = [[sx, sy]];
      let cur = list.pop()!;
      while (!(cur[0] === sx && cur[1] === sy)) {
        pts.push(cur);
        const nx = out.get(`${cur[0]},${cur[1]}`);
        if (!nx || !nx.length) break;
        cur = nx.pop()!;
      }
      // drop collinear points; flip y so the shape is upright in three's y-up space
      const keep = pts.filter((q, i) => {
        const pr = pts[(i - 1 + pts.length) % pts.length],
          nx = pts[(i + 1) % pts.length];
        return !((pr[0] === q[0] && q[0] === nx[0]) || (pr[1] === q[1] && q[1] === nx[1]));
      });
      d += 'M' + keep.map(([x, y]) => `${x} ${H - y}`).join('L') + 'Z';
    }
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg"><path fill="#000" fill-rule="evenodd" d="${d}"/></svg>`, w: maxX - minX, h: maxY - minY };
}

type Mark = { geo: THREE.BufferGeometry; edgesGeo: THREE.BufferGeometry; total: number };
function buildMark(text: string, loader: SVGLoader): Mark {
  const { svg, w, h } = monogramSVG(text);
  const shapes = loader.parse(svg).paths.flatMap((p) => SVGLoader.createShapes(p));
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: 3, bevelEnabled: false, curveSegments: 1 });
  geo.center();
  const k = 1.5 / Math.max(w, h, 10); // fits the 2 u socket with room to turn
  geo.scale(k, k, k);
  geo.computeVertexNormals();
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25));
  edges.computeLineDistances();
  const ld = edges.geometry.getAttribute('lineDistance');
  return { geo, edgesGeo: edges.geometry, total: ld.count ? ld.getX(ld.count - 1) : 1 };
}

/* ---------------- corrupted-data bands (custom postprocessing Effect) ---------------- */
/*
 * Rows are grouped into clumps; a clump that fires tears a few adjacent rows. Only inside the cluster's
 * screen box (uBox), so the bands read as damage to the drawing, never as dirt on the empty ground. Inside a
 * torn row, each x block is shifted, sampled at 358 px with an R/G/B split, and some blocks smear one line
 * or print a shade darker.
 */
const corruptFrag = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uAmt;
uniform vec4 uBox;
uniform float uStill;
float h1(float x) { return fract(sin(x * 127.1 + uSeed * 311.7) * 43758.5453); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = inputColor;
  if (uv.x < uBox.x || uv.x > uBox.z || uv.y < uBox.y || uv.y > uBox.w) return;
  float bh = (uBox.w - uBox.y) / 30.0; // row height: a thirtieth of the cluster
  float y = (uv.y - uBox.y) / bh - uTime * 0.9;
  float row = floor(y);
  float clump = floor(y / 5.0);
  // the reduced-motion still keeps one fixed band across the socket floor, clear of the names and the mark
  float fx = (uv.x - uBox.x) / (uBox.z - uBox.x);
  if (uStill > 0.5) { if (row < 11.0 || row > 12.0 || fx < 0.3 || fx > 0.7) return; }
  else if (h1(clump + 91.0) > 0.3 * uAmt || h1(row) > 0.55) return;
  float nb = 5.0 + floor(h1(row + 11.0) * 9.0);
  float bx = floor(fx * nb);
  float r1 = h1(row * 7.31 + bx * 1.7);
  vec2 res = vec2(358.0, 358.0 * resolution.y / resolution.x);
  vec2 p = uv + vec2((r1 - 0.5) * 0.035, 0.0);
  if (h1(row * 3.3 + bx + 50.0) > 0.7) p.y = uBox.y + (row + uTime * 0.9 + 0.5) * bh; // smear one line
  vec2 q = (floor(p * res) + 0.5) / res;
  float o = (h1(row + 3.0) - 0.5) * 0.007;
  vec3 col = vec3(texture2D(inputBuffer, q + vec2(o, 0.0)).r, texture2D(inputBuffer, q).g, texture2D(inputBuffer, q - vec2(o, 0.0)).b);
  // a torn block of the drawing prints a shade darker, so the tear reads on white caps too
  if (h1(row * 5.7 + bx + 20.0) > 0.8) col *= 0.82;
  outputColor = vec4(col, 1.0);
}`;
class CorruptEffect extends Effect {
  constructor() {
    super('CorruptEffect', corruptFrag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uTime', new THREE.Uniform(0)],
        ['uSeed', new THREE.Uniform(1)],
        ['uAmt', new THREE.Uniform(1)],
        ['uBox', new THREE.Uniform(new THREE.Vector4(0, 0, 0, 0))],
        ['uStill', new THREE.Uniform(0)],
      ]),
    });
  }
}

/* ---------------- label textures ---------------- */
/*
 * A label printed on a plane of planeW × planeH world units. fx / fy are how much the camera
 * foreshortens the plane's two axes on screen; the glyphs are pre-stretched by the ratio so the name
 * reads with the pixel font's own proportions (the top face is squashed to ~0.45 by the 27° tilt).
 */
function labelTexture(text: string, planeW: number, planeH: number, fx: number, fy: number, W = 256, H = 128) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const sy = (planeW * fx) / W / ((planeH * fy) / H);
  let size = 64;
  const setFont = () => (g.font = `${size}px 'Web IBM VGA 8x16', monospace`);
  setFont();
  while ((g.measureText(text).width > W * 0.94 || size * sy > H * 0.92) && size > 8) {
    size -= 2;
    setFont();
  }
  g.fillStyle = '#080808';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(W / 2, H / 2 + size * sy * 0.04);
  g.scale(1, sy);
  g.fillText(text, 0, 0);
  g.fillText(text, 0.9, 0); // a touch of weight so it survives minification
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* label plane sizes (world units, in a 1 u cell) and their screen foreshortening */
const TOP_W = 0.9,
  TOP_H = 0.38;
const SIDE_W = 0.82,
  SIDE_H = 0.32;
const SIN_T = Math.sin(TILT),
  COS_T = Math.cos(TILT);
const SIDE_FX = Math.sqrt(0.5 + 0.5 * SIN_T * SIN_T);

const SEED = 20260914; // of the seeds scanned, one with the most caps that print cleanly (29 of 49 cells)
const { nodes: CLUSTER, inside: INSIDE } = buildCluster(SEED);
/* tools whose cap top faces the camera, in toolkit order: the autoplay walks through these */
const FEATURED = CLUSTER.filter((n) => n.tool >= 0 && n.face === 'top')
  .map((n) => n.tool)
  .sort((a, b) => a - b);

type Shared = {
  phase: { S: number; draw: number; fill: number; spin: number; slot: number };
  heat: number;
  mark: number;
  slots: { x: number; y: number }[];
  hover: number;
  onMark?: (tool: number) => void;
  onInteract?: () => void;
};

function Drawing({ reducedMotion, shared, fontsReady }: { reducedMotion: boolean; shared: React.MutableRefObject<Shared>; fontsReady: boolean }) {
  const { size, camera, invalidate } = useThree();
  const nodes = CLUSTER;

  const res = useMemo(() => {
    const face = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const line = new THREE.LineBasicMaterial({ color: INK });
    const cubeGeo = shadedBox(new THREE.Color('#dcdcd7'));
    const keyGeo = shadedBox(new THREE.Color('#ffffff'));
    const carrierGeo = shadedBox(new THREE.Color('#1a1a1a'));
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const crossGeo = wireCross();
    const capGeo = keycapLines();
    // construction outline: dashed edges with line distances
    const cons = new THREE.LineSegments(edgeGeo.clone());
    cons.computeLineDistances();
    const consGeo = cons.geometry;
    const consMat = dashMat(0.08, 0.06);
    // floor grid (dashed)
    const gridPts: number[] = [];
    const G = 8;
    for (let i = -G; i <= G; i++) gridPts.push(i, 0, -G, i, 0, G, -G, 0, i, G, 0, i);
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
    const gridObj = new THREE.LineSegments(gridGeo);
    gridObj.computeLineDistances();
    const gridMat = dashMat(0.12, 0.14, 0.3);
    // dimension lines along two base edges and one upright, with end ticks
    const dimPts: number[] = [];
    const d = 2.7;
    dimPts.push(-2, 0, d, 2, 0, d, -2, 0, d - 0.2, -2, 0, d + 0.2, 2, 0, d - 0.2, 2, 0, d + 0.2);
    dimPts.push(d, 0, -2, d, 0, 2, d - 0.2, 0, -2, d + 0.2, 0, -2, d - 0.2, 0, 2, d + 0.2, 0, 2);
    dimPts.push(-2.5, 0, 2.5, -2.5, 4, 2.5, -2.7, 0, 2.5, -2.3, 0, 2.5, -2.7, 4, 2.5, -2.3, 4, 2.5);
    const dimGeo = new THREE.BufferGeometry();
    dimGeo.setAttribute('position', new THREE.Float32BufferAttribute(dimPts, 3));
    const dimObj = new THREE.LineSegments(dimGeo);
    dimObj.computeLineDistances();
    const dimMat = dashMat(0.18, 0.08, 0.85);
    return { face, line, cubeGeo, keyGeo, carrierGeo, edgeGeo, crossGeo, capGeo, consGeo, consMat, gridGeo, gridMat, dimGeo, dimMat };
  }, []);

  // marks: each tool's monogram, SVG → extrude + dashed edges (needs the pixel font)
  const marks = useMemo(() => {
    const m = new Map<number, Mark>();
    if (!fontsReady) return m;
    const loader = new SVGLoader();
    TOOLS.forEach((t, i) => m.set(i, buildMark(t[3], loader)));
    return m;
  }, [fontsReady]);
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

  // one printed name per tool cap that the camera sees whole. Narrow screens print short names on the
  // tops and monograms on the sides, so every printed cap stays legible at phone size.
  const compact = size.width < 640;
  const labels = useMemo(() => {
    const m = new Map<number, THREE.CanvasTexture>();
    if (!fontsReady) return m;
    nodes.forEach((n) => {
      if (n.tool < 0 || !n.face) return;
      const [, label, short, mono] = TOOLS[n.tool];
      m.set(
        n.tool,
        n.face === 'top' ? labelTexture(compact ? short : label, TOP_W, TOP_H, 1, SIN_T) : labelTexture(compact ? mono : label, SIDE_W, SIDE_H, SIDE_FX, COS_T),
      );
    });
    return m;
  }, [fontsReady, nodes, compact]);
  const dimLabel = useMemo(() => (fontsReady ? labelTexture('4.000 u', 1.6, 0.4, 0.775, 0.5, 256, 64) : null), [fontsReady]);
  const effect = useMemo(() => new CorruptEffect(), []);

  useEffect(
    () => () => {
      Object.values(res).forEach((v) => (v as { dispose?: () => void }).dispose?.());
      markLine.dispose();
      markFill.dispose();
      effect.dispose();
    },
    [res, markLine, markFill, effect],
  );
  useEffect(
    () => () =>
      marks.forEach((m) => {
        m.geo.dispose();
        m.edgesGeo.dispose();
      }),
    [marks],
  );
  useEffect(
    () => () => {
      labels.forEach((t) => t.dispose());
      dimLabel?.dispose();
    },
    [labels, dimLabel],
  );

  // On demand (reduced motion) nothing redraws by itself: ask for frames as the pieces arrive
  // (fonts → labels, composer, measured slots), so the composed still is always drawn.
  useEffect(() => {
    invalidate();
    if (!reducedMotion) return;
    const ids = [50, 200, 600, 1200, 2500].map((ms) => window.setTimeout(() => invalidate(), ms));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [reducedMotion, labels, marks, invalidate]);

  // camera zoom: the cluster fills its side of the stage
  const narrow = size.width < size.height;
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    // narrow: the cluster (5.66 u across) fills the width; the floor grid may run off the sides
    cam.zoom = narrow ? Math.max(20, Math.min((size.width - 14) / 5.75, (size.height - 250) / 6.3)) : Math.max(20, Math.min((size.height - 96) / 6.5, (size.width - 330) / 7.6));
    cam.updateProjectionMatrix();
    invalidate();
  }, [size, narrow, camera, invalidate]);

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
  const faceQ = useMemo(() => new THREE.Quaternion(), []);
  const spinQ = useMemo(() => new THREE.Quaternion(), []);
  const upY = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const boxV = useMemo(() => new THREE.Vector3(), []);
  const selector = useRef<THREE.Group>(null);
  const socket = useRef<THREE.LineSegments>(null);
  const toolNode = useMemo(() => {
    const m = new Map<number, Node>();
    nodes.forEach((n) => n.tool >= 0 && m.set(n.tool, n));
    return m;
  }, [nodes]);

  useFrame((_, delta) => {
    const sh = shared.current;
    const ph = sh.phase;
    if (!reducedMotion) time.current += Math.min(delta, 0.05);
    const t = time.current;

    // octree presence from the continuous stage S (0 → 3.2): each level is born, then splits
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

    // mark: dashed draw, thermal flash, chrome fill, then turn to face the camera
    const mk = marks.get(sh.mark);
    if (mk && markMesh.current && markEdges.current) {
      markMesh.current.geometry = mk.geo;
      markEdges.current.geometry = mk.edgesGeo;
    }
    markLine.uniforms.uTotal.value = mk ? mk.total : 1;
    markLine.uniforms.uDraw.value = ph.draw;
    markLine.uniforms.uOffset.value = -t * 0.3;
    markFill.uniforms.uFill.value = ph.fill;
    markFill.uniforms.uHeat.value = sh.heat;
    markFill.uniforms.uTime.value = t;
    const mg = markGroup.current;
    const cg = cluster.current;
    if (mg && cg) {
      faceQ.copy(cg.quaternion).invert(); // the cluster is rotated to iso; counter-rotate to face the viewer
      // a three-quarter view while it draws (never edge-on), one full turn to face you as it fills
      spinQ.setFromAxisAngle(upY, (1 - ph.spin) * (Math.PI * 2 + 0.8));
      mg.quaternion.copy(faceQ).multiply(spinQ);
      mg.position.y = 3 + Math.sin(t * 1.2) * 0.05;
      mg.visible = S > 0.6 && !!mk;
    }

    // keycaps: the current tool rises out of the cluster, a hovered one presses down
    nodes.forEach((n) => {
      if (n.tool < 0) return;
      const k = keyRefs.current[n.tool];
      if (!k) return;
      const target = sh.hover === n.tool ? -0.05 : sh.mark === n.tool && n.face === 'top' && S > 2.4 ? 0.12 : 0;
      k.position.y += (target - k.position.y) * (reducedMotion ? 1 : 0.2);
    });

    if (socket.current) socket.current.visible = S > 1.2;

    // the current tool wears a dashed selection box, like a callout on the drawing
    const sel = selector.current;
    const cur = toolNode.get(sh.mark);
    if (sel) {
      sel.visible = !!cur && !!cur.face && S > 2.4;
      if (cur) {
        const k = keyRefs.current[cur.tool];
        sel.position.set(cur.pos.x, cur.pos.y + (k ? k.position.y : 0), cur.pos.z);
      }
    }

    // cluster: left of the slot column on wide screens, between the HUD and the slot row on narrow ones
    const cam = camera as THREE.OrthographicCamera;
    if (cg) {
      cg.position.x = narrow ? 0 : -150 / cam.zoom + 0.25;
      cg.position.y = -2 * COS_T + (narrow ? -12 : -8) / cam.zoom;
      cg.updateMatrixWorld();
      // the cluster's screen box, where the corrupted bands are allowed to run
      let x0 = 1,
        y0 = 1,
        x1 = 0,
        y1 = 0;
      for (let c = 0; c < 8; c++) {
        boxV.set(c & 1 ? 2 : -2, c & 2 ? 4 : 0.2, c & 4 ? 2 : -2).applyMatrix4(cg.matrixWorld).project(cam);
        const u = boxV.x * 0.5 + 0.5,
          v = boxV.y * 0.5 + 0.5;
        x0 = Math.min(x0, u);
        x1 = Math.max(x1, u);
        y0 = Math.min(y0, v);
        y1 = Math.max(y1, v);
      }
      (effect.uniforms.get('uBox')!.value as THREE.Vector4).set(x0, y0, x1, y1);
    }

    // carrier cube: between DOM slots
    const cr = carrier.current;
    if (cr && sh.slots.length === 3) {
      const f = ph.slot;
      const i0 = Math.min(1, Math.floor(f));
      const k = f - i0;
      const a = sh.slots[i0];
      const b = sh.slots[Math.min(2, i0 + 1)];
      const px = a.x + (b.x - a.x) * k;
      const py = a.y + (b.y - a.y) * k;
      const hop = Math.sin(k * Math.PI) * 26;
      cr.visible = true;
      cr.position.set((px - size.width / 2) / cam.zoom, (size.height / 2 - py + hop) / cam.zoom, 20);
      cr.rotation.set(TILT, -0.25 * Math.PI + f * Math.PI * 0.5, 0);
      cr.scale.setScalar(26 / cam.zoom);
    } else if (cr) cr.visible = false;

    effect.uniforms.get('uTime')!.value = t;
    effect.uniforms.get('uSeed')!.value = reducedMotion ? 3 : Math.floor(t / 3) + 1;
    effect.uniforms.get('uStill')!.value = reducedMotion ? 1 : 0;
  });

  // hover / click tweens live here, so killing them never touches the story timeline's own tweens
  const manual = useRef<gsap.core.Animation | null>(null);
  const flash = useRef<gsap.core.Animation | null>(null);
  useEffect(
    () => () => {
      manual.current?.kill();
      flash.current?.kill();
    },
    [],
  );

  const onKeyOver = (ti: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
    // reduced motion: hover changes nothing (no flash, no redraw); a click still selects and fills
    if (reducedMotion) return;
    const sh = shared.current;
    sh.hover = ti;
    sh.onInteract?.();
    if (sh.mark !== ti) {
      sh.mark = ti;
      sh.onMark?.(ti);
      manual.current?.kill();
      sh.phase.fill = 0;
      sh.phase.spin = 0;
      manual.current = gsap.fromTo(sh.phase, { draw: 0 }, { draw: 1, duration: 0.9, ease: 'power2.out' });
    }
    flash.current?.kill();
    flash.current = gsap
      .timeline()
      .to(sh, { heat: 1, duration: 0.25, ease: 'power2.out' })
      .to(sh, { heat: 0, duration: 1.1, ease: 'power2.in' }, '+=0.35');
  };
  const block = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation();
  const onKeyOut = () => {
    document.body.style.cursor = '';
    if (reducedMotion) return;
    shared.current.hover = -1;
  };
  const onKeyClick = (ti: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const sh = shared.current;
    sh.onInteract?.();
    if (sh.mark !== ti) {
      sh.mark = ti;
      sh.onMark?.(ti);
    }
    if (reducedMotion) {
      Object.assign(sh.phase, { draw: 1, fill: 1, spin: 1 });
      invalidate();
      return;
    }
    manual.current?.kill();
    manual.current = gsap
      .timeline()
      .to(sh.phase, { draw: 1, duration: 0.4, ease: 'power2.out' })
      .fromTo(sh.phase, { fill: 0, spin: 0 }, { fill: 1, spin: 1, duration: 1.1, ease: 'expo.out' });
  };

  return (
    <>
      <color attach="background" args={[GROUND]} />
      <group ref={cluster} rotation={[TILT, -0.25 * Math.PI, 0]}>
        <lineSegments geometry={res.gridGeo} material={res.gridMat} />
        <lineSegments geometry={res.dimGeo} material={res.dimMat} />
        {dimLabel && (
          <mesh position={[0, 0.01, 3.1]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.6, 0.4]} />
            <meshBasicMaterial map={dimLabel} transparent depthWrite={false} />
          </mesh>
        )}
        {nodes.map((n, i) => {
          const label = n.tool >= 0 ? labels.get(n.tool) : undefined;
          return (
            <group key={i} ref={(el) => void (nodeRefs.current[i] = el)} position={n.pos}>
              <group ref={(el) => void (solidRefs.current[i] = el)}>
                {n.tool >= 0 ? (
                  <group ref={(el) => void (keyRefs.current[n.tool] = el)}>
                    <group scale={CAP}>
                      <mesh geometry={res.keyGeo} material={res.face} onPointerOver={onKeyOver(n.tool)} onPointerOut={onKeyOut} onClick={onKeyClick(n.tool)} />
                      <lineSegments geometry={res.capGeo} material={res.line} />
                    </group>
                    {label && n.face === 'top' && (
                      <mesh position={[0, CAP / 2 + 0.004, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]} renderOrder={2}>
                        <planeGeometry args={[TOP_W, TOP_H]} />
                        <meshBasicMaterial map={label} transparent depthWrite={false} />
                      </mesh>
                    )}
                    {label && n.face === 'z' && (
                      <mesh position={[0, 0, CAP / 2 + 0.004]} renderOrder={2}>
                        <planeGeometry args={[SIDE_W, SIDE_H]} />
                        <meshBasicMaterial map={label} transparent depthWrite={false} />
                      </mesh>
                    )}
                    {label && n.face === 'x' && (
                      <mesh position={[CAP / 2 + 0.004, 0, 0]} rotation={[0, Math.PI / 2, 0]} renderOrder={2}>
                        <planeGeometry args={[SIDE_W, SIDE_H]} />
                        <meshBasicMaterial map={label} transparent depthWrite={false} />
                      </mesh>
                    )}
                  </group>
                ) : n.leaf && !n.solid ? (
                  <lineSegments geometry={res.crossGeo} material={res.line} />
                ) : (
                  <group scale={n.depth === 3 ? 0.9 : 1}>
                    {/* grey cubes block the pointer, so a hover never reaches a cap hidden behind them */}
                    <mesh geometry={res.cubeGeo} material={res.face} onPointerOver={block} onClick={block} />
                    <lineSegments geometry={res.edgeGeo} material={res.line} />
                  </group>
                )}
              </group>
              {!n.leaf && <lineSegments ref={(el) => void (consRefs.current[i] = el)} geometry={res.consGeo} material={res.consMat} visible={false} />}
            </group>
          );
        })}
        <group ref={selector} scale={1.16} visible={false}>
          <lineSegments geometry={res.consGeo} material={res.consMat} />
        </group>
        {/* the missing top-front octant is the socket the current tool's mark floats in, outlined in dashes */}
        <lineSegments ref={socket} position={[1, 3, 1]} scale={2} geometry={res.consGeo} material={res.consMat} visible={false} />
        <group ref={markGroup} position={[1, 3, 1]}>
          <mesh ref={markMesh} material={markFill} renderOrder={5} />
          <lineSegments ref={markEdges} material={markLine} renderOrder={6} />
        </group>
      </group>
      <group ref={carrier} visible={false}>
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

/* seconds: where the story reaches the composed state (fully grown, drawn, filled, facing you) */
const HOLD = 5.6;
const COMPOSED = { S: 3.2, draw: 1, fill: 1, spin: 1, slot: 2 };

export default function ToolBlocks({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [fontsReady, setFontsReady] = useState(false);
  const [slot, setSlot] = useState(0);
  const [tool, setTool] = useState(FEATURED[0] ?? 0);
  const shared = useRef<Shared>({ phase: { S: 0, draw: 0, fill: 0, spin: 0, slot: 0 }, heat: 0, mark: FEATURED[0] ?? 0, slots: [], hover: -1 });
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

  // interaction pauses the story for a few seconds; the resume timer below picks it up again
  useEffect(() => {
    const sh = shared.current;
    sh.onMark = (i) => setTool(i);
    sh.onInteract = () => {
      manualUntil.current = performance.now() + 4000;
      tlRef.current?.pause();
    };
    return () => {
      sh.onMark = undefined;
      sh.onInteract = undefined;
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

  // The whole story as one GSAP timeline: grow (level by level) → draw → thermal → fill → hold → collapse.
  useEffect(() => {
    const sh = shared.current;
    const ph = sh.phase;
    const tl = gsap.timeline({
      paused: true,
      repeat: -1,
      onRepeat: () => {
        // next loop, next tool
        const at = FEATURED.indexOf(sh.mark);
        sh.mark = FEATURED[(at + 1) % FEATURED.length];
        sh.onMark?.(sh.mark);
      },
    });
    tl.set(ph, { S: 0, draw: 0, fill: 0, spin: 0, slot: 0 }, 0)
      .to(ph, { S: 1, duration: 0.7, ease: 'power2.inOut' }, 0.15)
      .to(ph, { S: 2, duration: 0.75, ease: 'power2.inOut' }, 0.9)
      .to(ph, { S: 3.2, duration: 0.8, ease: 'power2.inOut' }, 1.7)
      .to(ph, { slot: 1, duration: 0.55, ease: 'power3.inOut' }, 2.45)
      .fromTo(ph, { draw: 0 }, { draw: 1, duration: 1.3, ease: 'power1.inOut' }, 2.55)
      .fromTo(sh, { heat: 0 }, { heat: 1, duration: 0.25, ease: 'power2.out' }, 3.8)
      .to(sh, { heat: 0, duration: 0.9, ease: 'power2.in' }, 4.15)
      .to(ph, { slot: 2, duration: 0.55, ease: 'power3.inOut' }, 3.95)
      .fromTo(ph, { fill: 0, spin: 0 }, { fill: 1, spin: 1, duration: 1.2, ease: 'expo.out' }, 4.05)
      .to({}, { duration: 1.4 }, 5.25)
      .to(ph, { S: 0, fill: 0, draw: 0, spin: 0, slot: 0, duration: 0.7, ease: 'power3.in' }, 6.65);
    tlRef.current = tl;
    if (reducedMotion) {
      // the composed still: step [03] fill, full octree, chrome mark facing you, carrier in slot 3
      tl.time(HOLD);
      Object.assign(ph, COMPOSED);
      sh.heat = 0;
      invalidateRef.current();
    }
    return () => {
      tl.kill();
    };
  }, [reducedMotion]);

  // drive: parent progress, or autoplay
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (progress !== undefined && !reducedMotion) {
      tl.pause();
      tl.time(Math.min(1, Math.max(0, progress)) * HOLD);
      invalidateRef.current();
      return;
    }
    if (!active || reducedMotion) {
      tl.pause();
      return;
    }
    tl.play();
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

  // wheel scrubs the timeline; autoplay resumes after a pause in input
  useEffect(() => {
    const el = host.current;
    if (!el || progress !== undefined) return;
    const onWheel = (e: WheelEvent) => {
      const tl = tlRef.current;
      if (!tl || reducedMotion) return;
      e.preventDefault();
      tl.pause();
      manualUntil.current = performance.now() + 3500;
      tl.time(Math.min(HOLD, Math.max(0, tl.time() + e.deltaY * 0.004)));
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

  const [, , , , full, cat] = TOOLS[tool] ?? TOOLS[0];

  return (
    <div ref={host} className="relative h-full w-full select-none overflow-hidden" style={{ background: GROUND }}>
      <Canvas
        orthographic
        dpr={[1, 2]}
        frameloop={!active ? 'never' : reducedMotion ? 'demand' : 'always'}
        camera={{ position: [0, 0, 50], zoom: 50, near: 0.1, far: 200 }}
        gl={{ antialias: true }}
        style={{ position: 'absolute', inset: 0 }}
        onCreated={(s) => {
          invalidateRef.current = () => s.invalidate();
          s.invalidate();
        }}
      >
        <Drawing reducedMotion={reducedMotion} shared={shared} fontsReady={fontsReady} />
      </Canvas>

      <div className="pointer-events-none absolute top-3 right-3 left-3 sm:top-4 sm:left-4 sm:right-auto sm:max-w-[70%]">
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
        <p className="pixel mt-3 text-[16px] leading-[16px] text-[#080808]" aria-live="polite">
          <span className="text-[#080808]/55">[{String(tool + 1).padStart(2, '0')}/{TOOLS.length}]</span> {full}
          <span className="text-[#080808]/55"> · {cat}</span>
        </p>
      </div>

      {/* title block: the tools whose caps sit inside the cluster, where no name can be read */}
      {INSIDE.length > 0 && (
        <p className="pixel pointer-events-none absolute bottom-4 left-4 hidden max-w-[72%] text-[16px] leading-[16px] text-[#080808]/55 sm:block">
          inside: {INSIDE.map((i) => TOOLS[i][1]).join(' · ')}
        </p>
      )}

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
      <p className="pixel pointer-events-none absolute top-3 right-3 hidden text-[16px] leading-[16px] text-[#080808]/60 sm:top-4 sm:right-4 sm:block">
        hover a key · click to fill
      </p>
      <p className="pixel pointer-events-none absolute top-3 right-3 text-[16px] leading-[16px] text-[#080808]/60 sm:hidden">tap a key</p>
    </div>
  );
}
