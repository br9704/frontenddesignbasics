'use client';

/*
 * Zero to One
 * A faceted crystal turns on deep navy. Each facet refracts a neon scene behind it (red squiggles
 * and our wordmark) in its own way, with RGB fringes. Rings of type orbit at different tilts,
 * pulse taller in a travelling wave, and pass in front of and behind the gem.
 *
 * Pipeline: neon scene -> target (+ blurred copy); crystal -> distortion target
 * (R = distance to facet centroid, G = per-facet offset, B = N.L); a composite quad refracts the
 * neon through each facet. Ring halves are drawn before and after the crystal for depth order.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { cssFont, G1Bar, GLSL_HSV, loadFont, StillFrames } from './g1-shared';

const TOOLS = ['threejs', 'r3f', 'glsl', 'canvas2d', 'gsap'];
const BG = new THREE.Color('#050816');
const BG_RAW = new THREE.Vector3(0x05 / 255, 0x08 / 255, 0x16 / 255); // written straight to the canvas, no colour conversion
const RINGS = [
  { r: 1.72, tilt: [0.42, 0, 0.22], speed: 0.22 },
  { r: 2.08, tilt: [-0.3, 0, -0.5], speed: -0.16 },
  { r: 2.45, tilt: [1.2, 0.2, 0.1], speed: 0.12 },
  { r: 1.45, tilt: [-1.05, 0.4, 0.6], speed: -0.26 },
];

type Drive = { rough: number; rings: number[]; spacing: number; pointer: THREE.Vector2; twinkle: number; twinkleAt: number };

/* ─────────── shaders ─────────── */

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const blurFrag = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(uSrc, vUv).rgb * 0.227;
  c += texture2D(uSrc, vUv + uDir * 1.385).rgb * 0.316;
  c += texture2D(uSrc, vUv - uDir * 1.385).rgb * 0.316;
  c += texture2D(uSrc, vUv + uDir * 3.231).rgb * 0.070;
  c += texture2D(uSrc, vUv - uDir * 3.231).rgb * 0.070;
  gl_FragColor = vec4(c, 1.0);
}
`;

const crystalVert = /* glsl */ `
attribute vec3 aCentroid;
attribute float aMaxDist;
attribute float aSeed;
varying vec3 vPos;
varying vec3 vCentroid;
varying float vMax;
varying float vSeed;
varying vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPos = w.xyz;
  vCentroid = (modelMatrix * vec4(aCentroid, 1.0)).xyz;
  vMax = aMaxDist * length(modelMatrix[0].xyz);
  vSeed = aSeed;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const crystalFrag = /* glsl */ `
uniform float uTime;
varying vec3 vPos;
varying vec3 vCentroid;
varying float vMax;
varying float vSeed;
varying vec3 vN;
void main() {
  float d = clamp(distance(vPos, vCentroid) / max(vMax, 1e-4), 0.0, 1.0);
  float g = sin(uTime * (0.5 + vSeed * 0.6) + vSeed * 6.2831) * 0.5 + 0.5;
  float b = max(dot(normalize(vN), normalize(vec3(0.5, 0.8, 0.6))), 0.0);
  gl_FragColor = vec4(d, g, b, 1.0);
}
`;

const compositeFrag = /* glsl */ `
uniform sampler2D uNeon;
uniform sampler2D uBlur;
uniform sampler2D uDist;
uniform float uRough;
uniform float uCurve;
uniform float uTime;
uniform vec3 uBg;
uniform float uMode; // 0 background, 1 crystal
varying vec2 vUv;
vec3 neon(vec2 uv) { return texture2D(uNeon, uv).rgb + texture2D(uBlur, uv).rgb * 0.8; }
void main() {
  vec4 dm = texture2D(uDist, vUv);
  if (uMode < 0.5) {
    // the neon scene seen directly, dim, behind everything
    float v = smoothstep(0.95, 0.1, length(vUv - 0.5));
    vec3 col = uBg * mix(0.55, 1.35, v) + texture2D(uBlur, vUv).rgb * 0.3 + texture2D(uNeon, vUv).rgb * 0.07;
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  if (dm.a < 0.5) discard;
  float d = dm.r;
  float g = dm.g;
  float b = dm.b;
  float zoom = mix(0.42, 1.0, pow(d, 1.0 + uCurve * 5.0));
  vec2 c = vec2(0.5);
  vec2 uv = c + (vUv - c) * zoom + vec2((g - 0.5) * 0.16, (g - 0.5) * 0.03);
  uv += (fract(sin(dot(floor(vUv * 60.0), vec2(12.9, 78.2))) * 43758.5) - 0.5) * 0.04 * uRough;
  vec3 col;
  col.r = neon(c + (uv - c) * 1.000).r;
  col.g = neon(c + (uv - c) * 1.022).g;
  col.b = neon(c + (uv - c) * 1.045).b;
  vec3 frost = texture2D(uBlur, uv).rgb * 1.5;
  col = mix(col, frost, clamp((1.0 - b) * 0.35 + uRough, 0.0, 1.0));
  col += vec3(0.55, 0.7, 1.0) * smoothstep(0.82, 1.0, d) * 0.22;
  col += vec3(0.9, 0.95, 1.0) * pow(b, 14.0) * 0.5;
  col += uBg * 1.4 + vec3(0.02, 0.035, 0.09) * b;
  gl_FragColor = vec4(col, 1.0);
}
`;

const ringVert = /* glsl */ `
uniform float uTime;
uniform float uScale;
varying vec2 vUv;
varying float vViewZ;
void main() {
  vUv = uv;
  vec3 p = position;
  float wave = pow(max(sin(uv.x * 6.2831 * 10.0 / 4.0 - uTime * 1.6), 0.0), 3.0);
  p.y *= 1.0 + wave * 0.9;
  p *= uScale;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const ringFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uCenterZ;
uniform float uFront;
uniform float uTwinkle;
uniform float uTwinklePos;
varying vec2 vUv;
varying float vViewZ;
${GLSL_HSV}
void main() {
  bool front = vViewZ > uCenterZ;
  if (uFront > 0.5 && !front) discard;
  if (uFront < 0.5 && front) discard;
  float a = texture2D(uMap, vec2(vUv.x * 3.0, vUv.y)).r;
  float blink = 0.72 + 0.28 * sin(vUv.x * 60.0 - uTime * 3.0);
  float tw = exp(-pow((fract(vUv.x - uTwinklePos) - 0.5) * 9.0, 2.0)) * uTwinkle;
  a *= blink + tw * 1.8;
  a *= uFront > 0.5 ? 1.0 : 0.55;
  vec3 col = hsv2rgb(vec3(0.585, 1.0 - clamp(a, 0.0, 1.0), 1.0)) * a;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ─────────── textures ─────────── */

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  const font = `800 88px ${cssFont('--font-sans', 'Arial Black, sans-serif')}`;
  const draw = (blur: number, alpha: number) => {
    ctx.save();
    ctx.filter = blur ? `blur(${blur}px)` : 'none';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff';
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('ZERO TO ONE  ·', 512, 68);
    ctx.restore();
  };
  draw(14, 0.8);
  draw(0, 1);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function wordTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.font = `800 150px ${cssFont('--font-sans', 'Arial Black, sans-serif')}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#9fd8ff';
  ctx.filter = 'blur(10px)';
  ctx.fillText('0 TO 1', 512, 136);
  ctx.filter = 'none';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('0 TO 1', 512, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ─────────── crystal geometry ─────────── */

function crystalGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
  const pos = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 3.1 + 1.2) * Math.sin(v.y * 2.7 + 0.4) * Math.sin(v.z * 3.3 + 2.1);
    v.multiplyScalar(1 + n * 0.16);
    v.y *= 1.38;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const count = pos.count;
  const centroid = new Float32Array(count * 3);
  const maxD = new Float32Array(count);
  const seed = new Float32Array(count);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const m = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    m.copy(a).add(b).add(c).divideScalar(3);
    const md = Math.max(m.distanceTo(a), m.distanceTo(b), m.distanceTo(c));
    const s = Math.random();
    for (let k = 0; k < 3; k++) {
      centroid.set([m.x, m.y, m.z], (i + k) * 3);
      maxD[i + k] = md;
      seed[i + k] = s;
    }
  }
  g.setAttribute('aCentroid', new THREE.BufferAttribute(centroid, 3));
  g.setAttribute('aMaxDist', new THREE.BufferAttribute(maxD, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return g;
}

/** Wobbly closed loops for the neon scene, in a 2D plane. */
function squiggle(cx: number, cy: number, r: number, seed: number) {
  const pts: THREE.Vector3[] = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const w = 1 + 0.35 * Math.sin(a * 3 + seed) + 0.2 * Math.sin(a * 5 + seed * 2);
    pts.push(new THREE.Vector3(cx + Math.cos(a) * r * w, cy + Math.sin(a) * r * w * 1.25, 0));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5), 160, 0.018, 6, true);
}

/* ─────────── scene ─────────── */

function Gem({
  drive,
  running,
  lite,
  ringTex,
  wordTex,
  onDrawn,
}: {
  drive: React.RefObject<Drive>;
  running: boolean;
  lite: boolean;
  ringTex: THREE.Texture;
  wordTex: THREE.Texture;
  onDrawn: () => void;
}) {
  const { gl, size, camera, invalidate } = useThree();
  const drawn = useRef(false);
  const time = useRef(0);
  const dpr = gl.getPixelRatio();
  const W = Math.max(2, Math.floor(size.width * dpr));
  const H = Math.max(2, Math.floor(size.height * dpr));

  const targets = useMemo(() => {
    const neon = new THREE.WebGLRenderTarget(W, H, { samples: lite ? 0 : 4, type: THREE.HalfFloatType });
    const qa = new THREE.WebGLRenderTarget(Math.ceil(W / 4), Math.ceil(H / 4), { type: THREE.HalfFloatType, depthBuffer: false });
    const qb = new THREE.WebGLRenderTarget(Math.ceil(W / 4), Math.ceil(H / 4), { type: THREE.HalfFloatType, depthBuffer: false });
    const dist = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
    return { neon, qa, qb, dist };
  }, [W, H, lite]);
  useEffect(() => () => Object.values(targets).forEach((t) => t.dispose()), [targets]);

  // neon scene (2D, ortho)
  const neon = useMemo(() => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2e00').multiplyScalar(1.4) });
    const pink = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff00a8').multiplyScalar(1.2) });
    const geos = [
      squiggle(-0.2, 0.25, 0.42, 1),
      squiggle(0.25, -0.2, 0.36, 2.4),
      squiggle(0.05, 0.55, 0.22, 4.1),
      squiggle(-0.35, -0.5, 0.25, 5.3),
      squiggle(0.45, 0.4, 0.18, 7),
    ];
    geos.forEach((g, i) => group.add(new THREE.Mesh(g, i === 4 ? pink : red)));
    const wordMat = new THREE.MeshBasicMaterial({ map: wordTex, transparent: true, blending: THREE.AdditiveBlending });
    const wordGeo = new THREE.PlaneGeometry(1.5, 0.375);
    const word = new THREE.Mesh(wordGeo, wordMat);
    word.position.set(0, -0.02, 0.1);
    group.add(word);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -5, 5);
    return {
      scene,
      group,
      cam,
      dispose: () => {
        geos.forEach((g) => g.dispose());
        red.dispose();
        pink.dispose();
        wordMat.dispose();
        wordGeo.dispose();
      },
    };
  }, [wordTex]);
  useEffect(() => () => neon.dispose(), [neon]);

  // blur + crystal + composite
  const kit = useMemo(() => {
    const quad = new THREE.PlaneGeometry(2, 2);
    const blurMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: blurFrag,
      uniforms: { uSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
    const blurScene = new THREE.Scene();
    const blurMesh = new THREE.Mesh(quad, blurMat);
    blurMesh.frustumCulled = false;
    blurScene.add(blurMesh);
    const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const crystalGeo = crystalGeometry();
    const crystalMat = new THREE.ShaderMaterial({ vertexShader: crystalVert, fragmentShader: crystalFrag, uniforms: { uTime: { value: 0 } } });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    const crystalScene = new THREE.Scene();
    crystalScene.add(crystal);

    const mkComposite = (mode: number) =>
      new THREE.ShaderMaterial({
        vertexShader: quadVert,
        fragmentShader: compositeFrag,
        uniforms: {
          uNeon: { value: null },
          uBlur: { value: null },
          uDist: { value: null },
          uRough: { value: 1 },
          uCurve: { value: 0.35 },
          uTime: { value: 0 },
          uBg: { value: BG_RAW },
          uMode: { value: mode },
        },
        depthTest: false,
        depthWrite: false,
      });
    const bgMat = mkComposite(0);
    const gemMat = mkComposite(1);
    const main = new THREE.Scene();
    const bgQuad = new THREE.Mesh(quad, bgMat);
    bgQuad.renderOrder = 0;
    bgQuad.frustumCulled = false;
    const gemQuad = new THREE.Mesh(quad, gemMat);
    gemQuad.renderOrder = 2;
    gemQuad.frustumCulled = false;
    main.add(bgQuad, gemQuad);

    const ringMats: THREE.ShaderMaterial[] = [];
    const ringGroups: THREE.Group[] = [];
    const ringGeos: THREE.CylinderGeometry[] = [];
    RINGS.forEach((cfg) => {
      const geo = new THREE.CylinderGeometry(cfg.r, cfg.r, cfg.r / 4, 128, 10, true);
      ringGeos.push(geo);
      const holder = new THREE.Group();
      holder.rotation.set(cfg.tilt[0], cfg.tilt[1], cfg.tilt[2]);
      const spin = new THREE.Group();
      holder.add(spin);
      [0, 1].forEach((front) => {
        const m = new THREE.ShaderMaterial({
          vertexShader: ringVert,
          fragmentShader: ringFrag,
          uniforms: {
            uMap: { value: ringTex },
            uTime: { value: 0 },
            uScale: { value: 0 },
            uCenterZ: { value: -7 },
            uFront: { value: front },
            uTwinkle: { value: 0 },
            uTwinklePos: { value: 0 },
          },
          side: THREE.DoubleSide,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
        });
        ringMats.push(m);
        const mesh = new THREE.Mesh(geo, m);
        mesh.renderOrder = front ? 3 : 1;
        mesh.frustumCulled = false;
        spin.add(mesh);
      });
      ringGroups.push(spin);
      main.add(holder);
    });

    return {
      quad,
      blurMat,
      blurScene,
      orthoCam,
      crystal,
      crystalScene,
      crystalMat,
      bgMat,
      gemMat,
      main,
      ringMats,
      ringGroups,
      dispose: () => {
        quad.dispose();
        blurMat.dispose();
        crystalGeo.dispose();
        crystalMat.dispose();
        bgMat.dispose();
        gemMat.dispose();
        ringMats.forEach((m) => m.dispose());
        ringGeos.forEach((g) => g.dispose());
      },
    };
  }, [ringTex]);
  useEffect(() => () => kit.dispose(), [kit]);

  // With the loop on demand (reduced motion, off screen) nothing draws unless asked. Ask again
  // whenever the scene or its size changes, so the still frame lands once the textures and
  // targets exist, however late the canvas was sized.
  useEffect(() => {
    if (running) return;
    let raf = requestAnimationFrame(() => {
      invalidate();
      raf = requestAnimationFrame(() => invalidate());
    });
    invalidate();
    const ids = [120, 500].map((ms) => window.setTimeout(() => invalidate(), ms));
    return () => {
      cancelAnimationFrame(raf);
      ids.forEach(clearTimeout);
    };
  }, [running, invalidate, targets, kit, neon]);

  const tilt = useRef(new THREE.Vector2());
  const centre = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const d = drive.current;
    const step = running ? Math.min(dt, 0.05) : 0;
    time.current += step;
    const t = running ? time.current : 2.4;

    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const dist = 7.6 / Math.min(1, Math.max(aspect, 0.5) * 1.05);
    cam.position.set(0, 0, dist);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();

    // pointer tilts the crystal and shifts the neon behind it
    tilt.current.lerp(d.pointer, running ? 0.06 : 1);
    kit.crystal.rotation.set(0.25 + tilt.current.y * 0.35, t * 0.22 + tilt.current.x * 0.6, 0.12);
    neon.group.position.set(-tilt.current.x * 0.18, -tilt.current.y * 0.12, 0);
    neon.group.rotation.z = Math.sin(t * 0.15) * 0.08;
    neon.cam.left = -aspect;
    neon.cam.right = aspect;
    neon.cam.updateProjectionMatrix();
    const ns = aspect < 1 ? aspect * 1.05 : 1;
    neon.group.scale.setScalar(ns);

    // neon -> blur
    gl.setRenderTarget(targets.neon);
    gl.setClearColor('#000000', 1);
    gl.clear();
    gl.render(neon.scene, neon.cam);
    const bm = kit.blurMat.uniforms;
    const px = new THREE.Vector2(1 / targets.qa.width, 1 / targets.qa.height);
    let src: THREE.Texture = targets.neon.texture;
    for (const r of [1, 2.5]) {
      bm.uSrc.value = src;
      bm.uDir.value.set(px.x * r, 0);
      gl.setRenderTarget(targets.qa);
      gl.render(kit.blurScene, kit.orthoCam);
      bm.uSrc.value = targets.qa.texture;
      bm.uDir.value.set(0, px.y * r);
      gl.setRenderTarget(targets.qb);
      gl.render(kit.blurScene, kit.orthoCam);
      src = targets.qb.texture;
    }

    // crystal -> distortion map
    kit.crystalMat.uniforms.uTime.value = t;
    gl.setRenderTarget(targets.dist);
    gl.setClearColor('#000000', 0);
    gl.clear();
    gl.render(kit.crystalScene, cam);

    for (const m of [kit.bgMat, kit.gemMat]) {
      m.uniforms.uNeon.value = targets.neon.texture;
      m.uniforms.uBlur.value = targets.qb.texture;
      m.uniforms.uDist.value = targets.dist.texture;
      m.uniforms.uRough.value = d.rough;
      m.uniforms.uTime.value = t;
    }

    // rings
    centre.set(0, 0, 0).applyMatrix4(cam.matrixWorldInverse);
    if (running) d.twinkle *= 0.97;
    kit.ringGroups.forEach((g, i) => {
      g.rotation.y = t * RINGS[i].speed + i;
    });
    kit.ringMats.forEach((m, k) => {
      const i = Math.floor(k / 2);
      m.uniforms.uTime.value = t + i * 0.7;
      m.uniforms.uScale.value = (d.rings[i] ?? 0) * d.spacing * (i === 3 ? 1 : 1);
      m.uniforms.uCenterZ.value = centre.z;
      m.uniforms.uTwinkle.value = d.twinkle;
      m.uniforms.uTwinklePos.value = d.twinkleAt + i * 0.13;
    });

    gl.setRenderTarget(null);
    gl.setClearColor(BG, 1);
    gl.clear();
    gl.render(kit.main, cam);
    if (!drawn.current) {
      drawn.current = true;
      onDrawn();
    }
  }, 1);

  return null;
}

export default function CrystalTypeRings({ active, reducedMotion, progress }: ExperienceProps) {
  const running = active && !reducedMotion;
  const wrap = useRef<HTMLDivElement>(null);
  const [tex, setTex] = useState<{ ring: THREE.Texture; word: THREE.Texture } | null>(null);
  const drive = useRef<Drive>({ rough: 1, rings: RINGS.map(() => 0), spacing: 1, pointer: new THREE.Vector2(), twinkle: 0, twinkleAt: 0 });
  const started = useRef(false);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const last = useRef({ x: 0, y: 0, t: 0 });
  const [drawn, setDrawn] = useState(false);
  // Phones: fewer pixels and no MSAA on the neon target, so the first frame lands sooner.
  const [lite] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px), (pointer: coarse)').matches);

  useEffect(() => {
    let dead = false;
    let made: { ring: THREE.Texture; word: THREE.Texture } | null = null;
    loadFont(`800 88px ${cssFont('--font-sans', 'sans-serif')}`).then(() => {
      if (dead) return;
      made = { ring: ringTexture(), word: wordTexture() };
      setTex(made);
    });
    return () => {
      dead = true;
      made?.ring.dispose();
      made?.word.dispose();
    };
  }, []);

  // intro: rings scale in with a stagger while the shards settle into a gem
  useEffect(() => {
    const d = drive.current;
    if (reducedMotion) {
      tl.current?.kill();
      d.rough = 0;
      d.rings = RINGS.map(() => 1);
      return;
    }
    if (!active || started.current || !tex) return;
    started.current = true;
    const t = gsap.timeline({ delay: 0.3 });
    t.to(d, { rough: 0, duration: 2.4, ease: 'power3.inOut' }, 0);
    RINGS.forEach((_, i) => {
      const o = { v: 0 };
      t.to(o, { v: 1, duration: 1.6, ease: 'expo.out', onUpdate: () => (d.rings[i] = o.v) }, 0.4 + i * 0.22);
    });
    tl.current = t;
  }, [active, reducedMotion, tex]);
  useEffect(() => {
    if (!tl.current) return;
    if (running) tl.current.resume();
    else tl.current.pause();
  }, [running]);

  useEffect(() => {
    const target = progress === undefined ? 1 : 0.82 + progress * 0.45;
    if (reducedMotion) drive.current.spacing = target;
    else gsap.to(drive.current, { spacing: target, duration: 0.8, ease: 'power3.out' });
  }, [progress, reducedMotion]);

  const onMove = (e: React.PointerEvent) => {
    if (!running) return;
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    drive.current.pointer.set(x, y);
    const now = performance.now();
    const speed = Math.hypot(e.clientX - last.current.x, e.clientY - last.current.y) / Math.max(1, now - last.current.t);
    last.current = { x: e.clientX, y: e.clientY, t: now };
    drive.current.twinkle = Math.min(1, drive.current.twinkle + speed * 0.08);
    drive.current.twinkleAt = (x * 0.5 + 0.5) % 1;
  };

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden bg-[#050816]" onPointerMove={onMove}>
      <Canvas
        dpr={lite ? [1, 1.25] : [1, 1.75]}
        frameloop={running ? 'always' : 'demand'}
        camera={{ fov: 35, position: [0, 0, 7.6], near: 0.1, far: 50 }}
        gl={{ antialias: true }}
        onCreated={(st) => st.invalidate()}
      >
        {tex && <Gem drive={drive} running={running} lite={lite} ringTex={tex.ring} wordTex={tex.word} onDrawn={() => setDrawn(true)} />}
        <StillFrames running={running} deps={[tex]} />
      </Canvas>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-500 ${drawn ? 'opacity-0' : 'opacity-100'}`}
      >
        <pre className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">{'[██████░░░░░░] cutting the gem…'}</pre>
      </div>
      <G1Bar title="Zero to One" tools={TOOLS} />
    </div>
  );
}
