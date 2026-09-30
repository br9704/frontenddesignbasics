'use client';

/*
 * Shape-Aware ASCII
 * A lit 3D subject (a dodecahedron, then a breathing sphere of points) is drawn only in monospace
 * glyphs. Each character cell takes 6 samples inside it and 10 in its neighbours to build a shape
 * vector. Where the cell has real local contrast (an edge, a crease, a point) it picks the glyph
 * whose own vector is nearest, so edges resolve into / \ ( | that follow the silhouette. Flat faces
 * keep a plain tone ramp. A split handle compares that with the ramp everywhere.
 *
 * Pass 1: subject -> useFBO scene target (sized in cells). Pass 2: one fragment per 6x10 cell ->
 * glyph index. Pass 3: stamp glyphs from an atlas baked at runtime from our mono font. Finish: a
 * postprocessing Effect splits R/G/B radially (scales 1.00 / 1.12 / 1.24) around the pointer.
 */
import { useFBO } from '@react-three/drei';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { Effect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { cssFont, G1Bar, GLSL_SNOISE, loadFont, StillFrames } from './g1-shared';

const TOOLS = ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'canvas2d', 'gsap'];
const FIRST = 32;
const COUNT = 95; // printable ASCII 32..126, all baked and vectorised
// a tone ramp without long horizontal strokes, so flat faces read as tone, not scanlines
const RAMP = ' .:;+*o#%@';
// the glyphs the shape matcher may pick on edges: strokes with a clear direction, no letters, no fills
const SHAPE_SET = new Set(' .,\'`-_|/\\()');
const CELL_ASPECT = 10 / 6; // cells are 6 x 10 px at the default size
const ATLAS_COLS = 10;
const TILE_W = 40;
const TILE_H = 64;

// 6 sampling circles inside a cell (x, y from top-left, normalised) and 10 outside it
const INNER: [number, number][] = [
  [0.28, 0.2],
  [0.72, 0.16],
  [0.28, 0.5],
  [0.72, 0.5],
  [0.28, 0.84],
  [0.72, 0.8],
];
const RX = 0.2;
const RY = 0.12;

type Glyphs = { atlas: THREE.CanvasTexture; vectors: THREE.DataTexture };

/** Bake the glyph atlas and each glyph's 6-D shape vector from the mono font. */
function bakeGlyphs(family: string): Glyphs {
  const atlasC = document.createElement('canvas');
  atlasC.width = TILE_W * ATLAS_COLS;
  atlasC.height = TILE_H * ATLAS_COLS;
  const a = atlasC.getContext('2d')!;
  a.fillStyle = '#000';
  a.fillRect(0, 0, atlasC.width, atlasC.height);
  a.fillStyle = '#fff';
  a.textAlign = 'center';
  a.textBaseline = 'middle';
  a.font = `500 ${TILE_H * 0.8}px ${family}`;

  const probe = document.createElement('canvas');
  const PW = 30;
  const PH = 50;
  probe.width = PW;
  probe.height = PH;
  const p = probe.getContext('2d', { willReadFrequently: true })!;
  p.textAlign = 'center';
  p.textBaseline = 'middle';
  p.font = `500 ${PH * 0.8}px ${family}`;

  const raw: number[][] = [];
  const orient: [number, number][] = [];
  for (let i = 0; i < COUNT; i++) {
    const ch = String.fromCharCode(FIRST + i);
    const tx = i % ATLAS_COLS;
    const ty = Math.floor(i / ATLAS_COLS);
    a.fillText(ch, tx * TILE_W + TILE_W / 2, ty * TILE_H + TILE_H / 2 + TILE_H * 0.03);

    p.fillStyle = '#000';
    p.fillRect(0, 0, PW, PH);
    p.fillStyle = '#fff';
    p.fillText(ch, PW / 2, PH / 2 + PH * 0.03);
    const d = p.getImageData(0, 0, PW, PH).data;
    const v = INNER.map(([cx, cy]) => {
      let sum = 0;
      let n = 0;
      for (let y = 0; y < PH; y++)
        for (let x = 0; x < PW; x++) {
          const dx = ((x + 0.5) / PW - cx) / RX;
          const dy = ((y + 0.5) / PH - cy) / RY;
          if (dx * dx + dy * dy > 1) continue;
          sum += d[(y * PW + x) * 4] / 255;
          n++;
        }
      return n ? sum / n : 0;
    });
    raw.push(v);
    // the glyph's own stroke direction from its ink's second moments (y up), as a doubled angle
    let m = 0, mx = 0, my = 0;
    for (let y = 0; y < PH; y++)
      for (let x = 0; x < PW; x++) {
        const w = d[(y * PW + x) * 4] / 255;
        m += w;
        mx += w * x;
        my += w * (PH - y);
      }
    let c20 = 0, c02 = 0, c11 = 0;
    if (m > 0) {
      mx /= m;
      my /= m;
      for (let y = 0; y < PH; y++)
        for (let x = 0; x < PW; x++) {
          const w = d[(y * PW + x) * 4] / 255;
          const dx = x - mx;
          const dy = PH - y - my;
          c20 += w * dx * dx;
          c02 += w * dy * dy;
          c11 += w * dx * dy;
        }
    }
    const tr = c20 + c02;
    orient.push(tr > 0 ? [(c20 - c02) / tr, (2 * c11) / tr] : [0, 0]);
  }
  // normalise each component by its max so the vectors span 0..1
  const max = [0, 0, 0, 0, 0, 0];
  raw.forEach((v) => v.forEach((x, k) => (max[k] = Math.max(max[k], x))));
  const data = new Float32Array(COUNT * 2 * 4);
  raw.forEach((v, i) => {
    const allowed = SHAPE_SET.has(String.fromCharCode(FIRST + i));
    const n = v.map((x, k) => (allowed ? (max[k] ? x / max[k] : 0) : 99));
    data.set([n[0], n[1], n[2], n[3]], i * 4);
    data.set([n[4], n[5], orient[i][0], orient[i][1]], (COUNT + i) * 4);
  });
  const vectors = new THREE.DataTexture(data, COUNT, 2, THREE.RGBAFormat, THREE.FloatType);
  vectors.minFilter = vectors.magFilter = THREE.NearestFilter;
  vectors.needsUpdate = true;

  const atlas = new THREE.CanvasTexture(atlasC);
  atlas.generateMipmaps = false;
  atlas.minFilter = THREE.LinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.colorSpace = THREE.NoColorSpace;
  return { atlas, vectors };
}

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const rampBranch = RAMP.split('')
  .map((c, i) => `if (r == ${i.toFixed(1)}) idx = ${(c.charCodeAt(0) - FIRST).toFixed(1)};`)
  .join('\n  ');

const cellFrag = /* glsl */ `
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uVectors;
uniform vec2 uGrid;
uniform float uSplit;
uniform float uGate;
varying vec2 vUv;

// the scene target is half float: clamp, or a specular hot spot above 1.0 reads as a false edge
float lum(vec2 uv) { vec3 c = texture2D(uScene, uv).rgb; return clamp(dot(c, vec3(0.299, 0.587, 0.114)), 0.0, 1.0); }
// sample an ellipse centred at (x, y from top) in cell space
float circ(vec2 cell, vec2 c) {
  vec2 r = vec2(${RX.toFixed(3)}, ${RY.toFixed(3)}) * 0.55;
  float s = 0.0;
  s += lum((cell + vec2(c.x, 1.0 - c.y)) / uGrid);
  s += lum((cell + vec2(c.x + r.x, 1.0 - c.y)) / uGrid);
  s += lum((cell + vec2(c.x - r.x, 1.0 - c.y)) / uGrid);
  s += lum((cell + vec2(c.x, 1.0 - c.y + r.y)) / uGrid);
  s += lum((cell + vec2(c.x, 1.0 - c.y - r.y)) / uGrid);
  return s / 5.0;
}
float enhance(float v, float e) { float m = max(v, e); return m <= 1e-4 ? 0.0 : pow(v / m, 2.2) * m; }
float rampIdx(float mean) {
  float idx = 0.0;
  float r = floor(clamp(pow(mean, 0.72), 0.0, 0.999) * ${RAMP.length.toFixed(1)});
  ${rampBranch}
  return idx;
}

void main() {
  vec2 cell = floor(vUv * uGrid);
  float v0 = circ(cell, vec2(0.28, 0.20));
  float v1 = circ(cell, vec2(0.72, 0.16));
  float v2 = circ(cell, vec2(0.28, 0.50));
  float v3 = circ(cell, vec2(0.72, 0.50));
  float v4 = circ(cell, vec2(0.28, 0.84));
  float v5 = circ(cell, vec2(0.72, 0.80));
  float mean = (v0 + v1 + v2 + v3 + v4 + v5) / 6.0;
  float idx = rampIdx(mean);
  if ((cell.x + 0.5) / uGrid.x >= uSplit) {
    // 10 external samples in the neighbours
    float t0 = circ(cell, vec2(0.28, -0.12)), t1 = circ(cell, vec2(0.72, -0.12));
    float b0 = circ(cell, vec2(0.28, 1.12)), b1 = circ(cell, vec2(0.72, 1.12));
    float l0 = circ(cell, vec2(-0.16, 0.20)), l1 = circ(cell, vec2(-0.16, 0.50)), l2 = circ(cell, vec2(-0.16, 0.84));
    float r0 = circ(cell, vec2(1.16, 0.16)), r1 = circ(cell, vec2(1.16, 0.50)), r2 = circ(cell, vec2(1.16, 0.80));
    // only cells an edge actually crosses get a shape: contrast among the 6 inner samples
    float hi = max(max(max(v0, v1), max(v2, v3)), max(v4, v5));
    float lo = min(min(min(v0, v1), min(v2, v3)), min(v4, v5));
    float contrast = (hi - lo) / max(hi, 0.12);
    if (contrast > uGate && hi - lo > 0.2) {
      // edge direction from the 16 samples (pixel units, y up); the tangent is perpendicular
      float gx = ((v1 + v3 + v5 + r0 + r1 + r2) - (v0 + v2 + v4 + l0 + l1 + l2)) / 5.3;
      float gy = ((t0 + t1 + v0 + v1) - (v4 + v5 + b0 + b1)) / 9.4;
      vec2 tng = vec2(-gy, gx);
      float tl = dot(tng, tng);
      vec2 dir = tl > 1e-6 ? vec2(tng.x * tng.x - tng.y * tng.y, 2.0 * tng.x * tng.y) / tl : vec2(0.0);
      // directional contrast enhancement against the neighbours
      v0 = enhance(v0, max(t0, l0));
      v1 = enhance(v1, max(t1, r0));
      v2 = enhance(v2, l1);
      v3 = enhance(v3, r1);
      v4 = enhance(v4, max(b0, l2));
      v5 = enhance(v5, max(b1, r2));
      float M = max(max(max(v0, v1), max(v2, v3)), max(v4, v5));
      if (M > 1e-4) {
        v0 /= M; v1 /= M; v2 /= M; v3 /= M; v4 /= M; v5 /= M;
      }
      vec4 a = vec4(v0, v1, v2, v3);
      vec2 b = vec2(v4, v5);
      float best = 1e9;
      for (int i = 0; i < ${COUNT}; i++) {
        float u = (float(i) + 0.5) / ${COUNT.toFixed(1)};
        vec4 ga = texture2D(uVectors, vec2(u, 0.25));
        vec4 gb = texture2D(uVectors, vec2(u, 0.75));
        vec4 da = a - ga;
        vec2 db = b - gb.xy;
        // shape distance plus a penalty when the glyph's stroke runs across the edge
        float e = length(gb.zw);
        float d = dot(da, da) + dot(db, db) + 2.4 * (e - dot(gb.zw, dir));
        if (d < best) { best = d; idx = float(i); }
      }
      // edges read brighter than the face tone next to them
      mean = max(mean, hi * 0.9);
    }
  }
  gl_FragColor = vec4(idx / 255.0, mean, 0.0, 1.0);
}
`;

const stampFrag = /* glsl */ `
precision highp float;
uniform sampler2D uCells;
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform float uLight;
varying vec2 vUv;

float glyphAt(vec2 uv) {
  vec2 g = uv * uGrid;
  vec2 cell = floor(g);
  vec2 local = clamp(fract(g), 0.02, 0.98);
  vec4 c = texture2D(uCells, (cell + 0.5) / uGrid);
  float idx = floor(c.r * 255.0 + 0.5);
  float tx = mod(idx, ${ATLAS_COLS.toFixed(1)});
  float ty = floor(idx / ${ATLAS_COLS.toFixed(1)});
  vec2 auv = vec2((tx + local.x) / ${ATLAS_COLS.toFixed(1)}, 1.0 - (ty + 1.0 - local.y) / ${ATLAS_COLS.toFixed(1)});
  float ink = texture2D(uAtlas, auv).r;
  return ink * mix(0.5, 1.0, smoothstep(0.0, 0.35, c.g));
}
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

void main() {
  float ink = glyphAt(vUv);
  vec3 bg = mix(vec3(0.031), vec3(0.961), uLight);
  vec3 fg = mix(vec3(0.961), vec3(0.031), uLight);
  // dark strokes on a light ground read thinner, so light mode inks a little heavier
  ink = mix(ink, sqrt(ink), uLight * 0.6);
  vec3 col = mix(bg, fg, ink);
  // the split line lives in the DOM, outside the chroma pass
  // the composer works in linear light and converts back to sRGB on output
  gl_FragColor = vec4(toLinear(col), 1.0);
}
`;

/** Radial chroma: R, G and B are read at radial scales 1.00, 1.12 and 1.24 around the pointer. */
const chromaFrag = /* glsl */ `
uniform vec2 uCenter;
uniform float uAmount;
uniform float uAspect;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 d = uv - uCenter;
  float r = length(d * vec2(uAspect, 1.0));
  // zero across the body of the subject, rising only toward its silhouette and beyond
  float k = uAmount * 0.2 * smoothstep(0.22, 0.45, r);
  float g = texture2D(inputBuffer, uCenter + d / (1.0 + 0.12 * k)).g;
  float b = texture2D(inputBuffer, uCenter + d / (1.0 + 0.24 * k)).b;
  outputColor = vec4(inputColor.r, g, b, inputColor.a);
}
`;
class RadialChromaEffect extends Effect {
  constructor() {
    super('RadialChroma', chromaFrag, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uCenter', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
        ['uAmount', new THREE.Uniform(0.25)],
        ['uAspect', new THREE.Uniform(1)],
      ]),
    });
  }
}

const pointsVert = /* glsl */ `
uniform float uTime;
uniform float uScale;
varying float vN;
varying float vFront;
varying float vShade;
${GLSL_SNOISE}
void main() {
  vec3 p = normalize(position);
  float n = snoise(p * 1.6 + vec3(0.0, 0.0, uTime * 0.35)) * 0.5 + 0.5;
  vec3 pos = p * (1.0 + n * 0.38);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  // points on the far side of the sphere fade and shrink so the front reads as a shell
  vec3 nv = normalize(normalMatrix * p);
  vFront = smoothstep(-0.35, 0.5, dot(nv, normalize(-mv.xyz)));
  // a key light from the upper left, so the ball has a lit side and a shadow side
  vShade = 0.22 + 0.78 * max(dot(nv, normalize(vec3(-0.55, 0.6, 0.6))), 0.0);
  vN = n;
  gl_PointSize = (1.0 + 6.0 * pow(1.0 - n, 2.0)) * uScale * mix(0.6, 1.0, vFront);
  gl_Position = projectionMatrix * mv;
}
`;
const pointsFrag = /* glsl */ `
varying float vN;
varying float vFront;
varying float vShade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  // each point is a small lit bead: shaded by the key light, dimmer on the far side
  float bead = 1.0 - r2 * 0.8;
  gl_FragColor = vec4(vec3(vShade * bead * (0.8 + 0.2 * (1.0 - vN)) * mix(0.3, 1.0, vFront)), 1.0);
}
`;

type Drive = {
  split: number;
  chroma: number;
  light: number;
  rotX: number;
  rotY: number;
  velX: number;
  velY: number;
  dragging: boolean;
  morph: number; // 0 dodecahedron, 1 points sphere
  center: THREE.Vector2;
};

function Pipeline({
  drive,
  glyphs,
  running,
  cellPx,
  onReady,
}: {
  drive: React.RefObject<Drive>;
  glyphs: Glyphs;
  running: boolean;
  cellPx: number;
  onReady: () => void;
}) {
  const { gl, size, viewport } = useThree();
  const subject = useMemo(() => new THREE.Scene(), []);
  const subjectCam = useMemo(() => new THREE.PerspectiveCamera(32, 1, 0.1, 50), []);
  const orthoCam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const time = useRef(0);
  const dodeca = useRef<THREE.Group>(null);
  const points = useRef<THREE.Points>(null);
  const readySent = useRef(false);
  const tmpC = useMemo(() => new THREE.Vector2(), []);

  const grid = useMemo(() => {
    const cw = cellPx;
    const ch = Math.round(cellPx * CELL_ASPECT);
    return new THREE.Vector2(Math.max(8, Math.floor(size.width / cw)), Math.max(6, Math.floor(size.height / ch)));
  }, [size.width, size.height, cellPx]);

  // pass 1 renders into a target sized in whole cells; pass 2 writes one texel per cell
  const sceneRT = useFBO(Math.round(grid.x * cellPx), Math.round(grid.y * Math.round(cellPx * CELL_ASPECT)), { samples: 4 });
  const cellRT = useFBO(grid.x, grid.y, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
  });

  const passes = useMemo(() => {
    const cellMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: cellFrag,
      uniforms: {
        uScene: { value: null },
        uVectors: { value: glyphs.vectors },
        uGrid: { value: new THREE.Vector2() },
        uSplit: { value: 0.5 },
        uGate: { value: 0.42 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const stampMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: stampFrag,
      uniforms: {
        uCells: { value: null },
        uAtlas: { value: glyphs.atlas },
        uGrid: { value: new THREE.Vector2() },
        uLight: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(2, 2);
    const cellScene = new THREE.Scene();
    cellScene.add(new THREE.Mesh(geo, cellMat));
    const stampScene = new THREE.Scene();
    stampScene.add(new THREE.Mesh(geo, stampMat));
    return { cellMat, stampMat, cellScene, stampScene, geo };
  }, [glyphs]);
  useEffect(
    () => () => {
      passes.cellMat.dispose();
      passes.stampMat.dispose();
      passes.geo.dispose();
    },
    [passes],
  );

  // the finish: a postprocessing composer with the radial chroma Effect
  const post = useMemo(() => {
    const composer = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    const chroma = new RadialChromaEffect();
    composer.addPass(new RenderPass(passes.stampScene, orthoCam));
    composer.addPass(new EffectPass(orthoCam, chroma));
    return { composer, chroma };
  }, [gl, passes, orthoCam]);
  useEffect(() => () => post.composer.dispose(), [post]);
  useEffect(() => {
    post.composer.setSize(size.width, size.height, false);
  }, [post, size.width, size.height, viewport.dpr]);

  const pointsMat = useMemo(
    () =>
      new THREE.ShaderMaterial({ vertexShader: pointsVert, fragmentShader: pointsFrag, uniforms: { uTime: { value: 0 }, uScale: { value: 1 } } }),
    [],
  );
  useEffect(() => () => pointsMat.dispose(), [pointsMat]);
  // Day 021: points on an icosphere, one per unique vertex (the polyhedron repeats shared corners)
  const sphereGeo = useMemo(() => {
    const src = new THREE.IcosahedronGeometry(1, 15);
    const pos = src.getAttribute('position');
    const seen = new Set<string>();
    const out: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(x, y, z);
    }
    src.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    return g;
  }, []);
  // the dodecahedron's 30 edges as thick bars, so the shape matcher has real lines to follow
  const edges = useMemo(() => {
    const g = new THREE.DodecahedronGeometry(1.25, 0);
    const e = new THREE.EdgesGeometry(g, 1);
    g.dispose();
    const pos = e.getAttribute('position');
    const mats: THREE.Matrix4[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < pos.count; i += 2) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      const len = a.distanceTo(b);
      const q = new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize());
      mats.push(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1)));
    }
    e.dispose();
    const geo = new THREE.CylinderGeometry(0.015, 0.015, 1, 6, 1);
    return { geo, mats };
  }, []);
  const edgeRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = edgeRef.current;
    if (!m) return;
    edges.mats.forEach((mt, i) => m.setMatrixAt(i, mt));
    m.instanceMatrix.needsUpdate = true;
  }, [edges]);
  useEffect(() => () => edges.geo.dispose(), [edges]);
  useEffect(() => () => sphereGeo.dispose(), [sphereGeo]);

  useFrame((_, dt) => {
    const d = drive.current;
    const step = running ? Math.min(dt, 0.05) : 0;
    time.current += step;
    // rotation with inertia; idle spin when nobody is dragging
    if (running) {
      if (!d.dragging) {
        d.velY += (0.0045 - d.velY) * 0.02;
        d.velX *= 0.95;
      }
      d.rotY += d.velY;
      d.rotX = THREE.MathUtils.clamp(d.rotX + d.velX, -1.1, 1.1);
    }
    const m = d.morph;
    if (dodeca.current) {
      dodeca.current.rotation.set(d.rotX + 0.45, d.rotY, 0.2);
      dodeca.current.scale.setScalar(Math.max(0.0001, 1 - m));
      dodeca.current.visible = m < 0.999;
    }
    if (points.current) {
      points.current.rotation.set(d.rotX * 0.8, d.rotY * 0.8, 0);
      points.current.scale.setScalar(Math.max(0.0001, m));
      points.current.visible = m > 0.001;
    }
    pointsMat.uniforms.uTime.value = time.current;
    // points sized against the cell (1..7 cells), so neighbours overlap into a solid shaded shell
    pointsMat.uniforms.uScale.value = cellPx * 1.4;

    // fit: the subject spans about two thirds of the frame height (and of the width on phones)
    const aspect = size.width / size.height;
    subjectCam.aspect = aspect;
    const halfH = Math.max(1.85, 1.5 / aspect);
    subjectCam.position.set(0, 0, halfH / Math.tan(THREE.MathUtils.degToRad(16)));
    subjectCam.lookAt(0, 0, 0);
    subjectCam.updateProjectionMatrix();

    gl.setRenderTarget(sceneRT);
    gl.setClearColor('#000000', 1);
    gl.clear();
    gl.render(subject, subjectCam);

    passes.cellMat.uniforms.uScene.value = sceneRT.texture;
    passes.cellMat.uniforms.uGrid.value.copy(grid);
    passes.cellMat.uniforms.uSplit.value = d.split;
    gl.setRenderTarget(cellRT);
    gl.render(passes.cellScene, orthoCam);

    const su = passes.stampMat.uniforms;
    su.uCells.value = cellRT.texture;
    su.uGrid.value.copy(grid);
    su.uLight.value = d.light;

    const cu = post.chroma.uniforms;
    // the fringe centre leans toward the pointer but stays near the subject, so it sits on the rim
    tmpC.set(0.5 + (d.center.x - 0.5) * 0.3, 0.5 + (d.center.y - 0.5) * 0.3);
    (cu.get('uCenter')!.value as THREE.Vector2).lerp(tmpC, running ? 0.08 : 1);
    cu.get('uAmount')!.value = d.chroma;
    cu.get('uAspect')!.value = aspect;
    gl.setRenderTarget(null);
    post.composer.render(dt);

    if (!readySent.current) {
      readySent.current = true;
      onReady();
    }
  }, 1);

  return createPortal(
    <>
      <ambientLight intensity={0.1} />
      <directionalLight position={[-3, 5, 4]} intensity={1.9} />
      <directionalLight position={[5, -3, 1]} intensity={0.25} />
      <pointLight position={[2.2, 1.6, 3.2]} intensity={7} decay={2} distance={0} />
      <group ref={dodeca}>
        <mesh>
          <dodecahedronGeometry args={[1.22, 0]} />
          <meshStandardMaterial color="#d8d8d8" flatShading roughness={0.55} metalness={0} />
        </mesh>
        <instancedMesh ref={edgeRef} args={[edges.geo, undefined, edges.mats.length]}>
          <meshBasicMaterial color="#ffffff" />
        </instancedMesh>
      </group>
      <points ref={points} geometry={sphereGeo} material={pointsMat} />
    </>,
    subject,
  );
}

/** Tone-aware toggle: the pressed one is always the filled pill, in dark and light alike. */
function Toggle({ on, onClick, children, label }: { on?: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={`pixel border px-2 py-1 text-[16px] leading-[16px] transition-colors ${
        on
          ? 'border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]'
          : 'border-[var(--v-steel)] bg-[var(--v-bg)] text-[var(--v-soft)] hover:border-[var(--v-soft)] hover:text-[var(--v-ink)]'
      }`}
    >
      {children}
    </button>
  );
}

// the chrome flips with the stage: in light mode the tokens invert inside this experience only
const LIGHT_TOKENS = {
  '--v-bg': '#f5f5f5',
  '--v-ink': '#080808',
  '--v-soft': '#3a3a3a',
  '--v-dim': '#555555',
  '--v-steel': '#9a9a9a',
  '--v-line': '#d4d4d4',
  '--v-surface': '#ececec',
} as CSSProperties;

export default function Ascii3D({ active, reducedMotion, progress }: ExperienceProps) {
  const running = active && !reducedMotion;
  const wrap = useRef<HTMLDivElement>(null);
  const [glyphs, setGlyphs] = useState<Glyphs | null>(null);
  const [ready, setReady] = useState(false);
  const [split, setSplit] = useState(0.5);
  const [light, setLight] = useState(false);
  const [cell, setCell] = useState(6);
  const [chroma, setChroma] = useState(0.25);
  const [subject, setSubject] = useState<0 | 1>(0);
  const [picked, setPicked] = useState(false);
  const drive = useRef<Drive>({
    split: 0.5,
    chroma: 0.25,
    light: 0,
    rotX: 0.2,
    rotY: 0.6,
    velX: 0,
    velY: 0.0045,
    dragging: false,
    morph: 0,
    center: new THREE.Vector2(0.5, 0.5),
  });
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let dead = false;
    const made: Glyphs[] = [];
    const fam = cssFont('--font-mono', 'Menlo, monospace');
    const spec = `500 40px ${fam}`;
    // bake right away with whatever face is there (the mono font or its fallback), so the first
    // glyph frame never waits on the network; re-bake once if the real font lands later
    let fontIn = false;
    try {
      fontIn = document.fonts.check(spec);
    } catch {
      /* treat as not loaded */
    }
    const first = bakeGlyphs(fam);
    made.push(first);
    setGlyphs(first);
    if (!fontIn) {
      loadFont(spec).then(() => {
        if (dead) return;
        const next = bakeGlyphs(fam);
        made.push(next);
        setGlyphs(next);
      });
    }
    return () => {
      dead = true;
      made.forEach((g) => {
        g.atlas.dispose();
        g.vectors.dispose();
      });
    };
  }, []);

  useEffect(() => {
    const d = drive.current;
    d.split = split;
    d.light = light ? 1 : 0;
    d.chroma = chroma;
  }, [split, light, chroma]);

  // on /lab the page chrome (header and footer) sits right around the stage: flip its tokens too, so
  // light mode is one light page rather than a white panel between black bars. Cards are left alone.
  useEffect(() => {
    const host = wrap.current?.closest('[data-experience]')?.parentElement;
    if (!light || !host || host.tagName !== 'MAIN') return;
    const prev = Object.keys(LIGHT_TOKENS).map((k) => [k, host.style.getPropertyValue(k)] as const);
    Object.entries(LIGHT_TOKENS).forEach(([k, v]) => host.style.setProperty(k, String(v)));
    return () => prev.forEach(([k, v]) => (v ? host.style.setProperty(k, v) : host.style.removeProperty(k)));
  }, [light]);

  // subject swaps: GSAP morph, auto every 7 s until the visitor picks one or a parent drives progress
  useEffect(() => {
    const tween = gsap.to(drive.current, { morph: subject, duration: reducedMotion ? 0 : 1.4, ease: 'expo.inOut' });
    return () => {
      tween.kill();
    };
  }, [subject, reducedMotion]);
  useEffect(() => {
    if (!running || picked || progress !== undefined) return;
    const id = window.setInterval(() => setSubject((s) => (s ? 0 : 1)), 7000);
    return () => clearInterval(id);
  }, [running, picked, progress]);
  useEffect(() => {
    if (progress === undefined) return;
    setSubject(progress > 0.5 ? 1 : 0);
    drive.current.rotY = 0.6 + progress * Math.PI * 2;
  }, [progress]);
  useEffect(() => {
    if (reducedMotion) {
      drive.current.rotX = 0.2;
      drive.current.rotY = 0.6;
    }
  }, [reducedMotion]);
  const pick = (s: 0 | 1) => {
    setPicked(true);
    setSubject(s);
  };

  const onDown = (e: React.PointerEvent) => {
    if (!running) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drive.current.dragging = true;
    last.current = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: React.PointerEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r && running) drive.current.center.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
    if (!drive.current.dragging) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    drive.current.velY = dx * 0.004;
    drive.current.velX = dy * 0.004;
  };
  const onUp = () => {
    drive.current.dragging = false;
  };

  // the split handle
  const dragSplit = (e: React.PointerEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    setSplit(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };

  const sliderCls = 'pixel flex items-center gap-2 border border-[var(--v-steel)] bg-[var(--v-bg)] px-2 py-1 text-[16px] leading-[16px] text-[var(--v-soft)]';

  return (
    <div ref={wrap} className={`relative h-full w-full touch-pan-y overflow-hidden ${light ? 'bg-[#f5f5f5]' : 'bg-[#080808]'}`}>
      <Canvas
        dpr={[1, 1.75]}
        frameloop={running ? 'always' : 'demand'}
        gl={{ antialias: false }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
        className="cursor-grab active:cursor-grabbing"
      >
        {glyphs && <Pipeline drive={drive} glyphs={glyphs} running={running} cellPx={cell} onReady={() => setReady(true)} />}
        <StillFrames running={running} deps={[glyphs, split, light, cell, chroma, subject]} />
      </Canvas>

      {/* cold start: an ASCII placeholder and the split line until the first glyph frame lands */}
      {!ready && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="absolute inset-y-0 w-px bg-[var(--v-ink)] opacity-80" style={{ left: `${split * 100}%` }} />
          <pre className="pixel bg-[#080808] px-2 text-[16px] leading-[16px] text-[var(--v-soft)]">
            {'   ____\n  /    \\\n /      \\\n \\      /\n  \\____/\n\n[####....] baking glyphs'}
          </pre>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0" style={light ? LIGHT_TOKENS : undefined}>
        {/* the ramp | shape divider, drawn in the DOM so the chroma pass never splits it */}
        {ready && <span aria-hidden className="absolute inset-y-0 w-px bg-[var(--v-ink)] opacity-70" style={{ left: `${split * 100}%` }} />}
        {/* split handle, parked at the bottom edge so it never covers the subject */}
        <div
          role="slider"
          aria-label="ramp versus shape split"
          aria-valuenow={Math.round(split * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setSplit((s) => Math.max(0, s - 0.05));
            if (e.key === 'ArrowRight') setSplit((s) => Math.min(1, s + 0.05));
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            dragSplit(e);
          }}
          onPointerMove={(e) => e.buttons && dragSplit(e)}
          className="pointer-events-auto absolute bottom-3 z-10 -translate-x-1/2 cursor-ew-resize touch-none select-none"
          style={{ left: `clamp(80px, ${split * 100}%, calc(100% - 80px))` }}
        >
          <span className="pixel block border border-[var(--v-ink)] bg-[var(--v-bg)] px-1 text-[16px] leading-[16px] whitespace-nowrap text-[var(--v-ink)]">
            ramp ◂▸ shape
          </span>
        </div>

        <G1Bar title="Shape-Aware ASCII" tools={TOOLS} tone={light ? 'light' : 'dark'}>
          <Toggle on={subject === 0} onClick={() => pick(0)}>
            dodeca
          </Toggle>
          <Toggle on={subject === 1} onClick={() => pick(1)}>
            sphere
          </Toggle>
          <Toggle on={light} onClick={() => setLight((l) => !l)} label="invert tone">
            {light ? 'light' : 'dark'}
          </Toggle>
          <label className={sliderCls}>
            cell
            <input
              type="range"
              min={5}
              max={14}
              step={1}
              value={cell}
              onChange={(e) => setCell(Number(e.target.value))}
              className="w-16 accent-[var(--v-ink)]"
            />
          </label>
          <label className={sliderCls}>
            chroma
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={chroma}
              onChange={(e) => setChroma(Number(e.target.value))}
              className="w-16 accent-[var(--v-ink)]"
            />
          </label>
        </G1Bar>
      </div>
    </div>
  );
}
