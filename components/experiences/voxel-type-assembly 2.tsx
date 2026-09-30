'use client';

/*
 * Type Blocks
 * A word built from isometric type blocks: a see-through condensed letter on the front, an index
 * number on the side and a solid cap on top. Blocks drop in one at a time over a tilted tile floor,
 * then burst into a cloud of voxel cubes that reassembles as the next word.
 * Hover a block to glitch its glyph (the noise dropout threshold falls). Click to re-roll the word.
 */
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { cssFont, G1Bar, GLSL_HASH, GLSL_SNOISE, loadFont, PixelButton, StillFrames } from './g1-shared';

const TOOLS = ['threejs', 'r3f', 'drei', 'glsl', 'gsap', 'canvas2d'];
const WORDS = ['TYPE', 'BLOCKS', 'VOXEL', 'SHADER', 'MOTION', 'PIXEL', 'GRID', 'KERNING', 'SCROLL', 'INDEX'];
const GAP = 1.32;
const DROP = 7;

type Font = { family: string; squeeze: number };
type BlockState = { y: number; scale: number; hover: number; hoverTarget: number };
type Vox = { scatter: number; gather: number; shrink: number; visible: number };

/* ─────────── font + textures ─────────── */

function detectFont(): Font {
  const c = document.createElement('canvas').getContext('2d')!;
  c.font = '72px monospace';
  const base = c.measureText('MWMWMW').width;
  c.font = '72px "DIN Condensed", monospace';
  const din = c.measureText('MWMWMW').width;
  if (Math.abs(din - base) > 1) return { family: '"DIN Condensed"', squeeze: 1 };
  return { family: cssFont('--font-sans', 'Arial Narrow, sans-serif'), squeeze: 0.6 };
}

function faceCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  draw(ctx, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function glyph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, font: Font) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(font.squeeze, 1);
  ctx.font = `700 ${size}px ${font.family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, size * 0.06);
  ctx.restore();
}

function blockTextures(letter: string, index: number, font: Font) {
  const front = faceCanvas((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(245,245,245,0.22)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    ctx.fillStyle = '#f5f5f5';
    glyph(ctx, letter, w / 2, h / 2, 112, font);
  });
  const right = faceCanvas((ctx, w, h) => {
    ctx.fillStyle = '#cfcfcf';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#080808';
    glyph(ctx, String(index + 1).padStart(3, '0'), w / 2, h / 2, 64, font);
  });
  return { front, right };
}

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  const cells = 3;
  const s = 512 / cells;
  const tints = ['#0c0c0c', '#111111', '#0a0a0a', '#151515', '#0e0e0e', '#1a1a1a', '#0b0b0b', '#121212', '#0d0d0d'];
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      ctx.fillStyle = tints[(i * 5 + j * 7) % tints.length];
      ctx.fillRect(i * s, j * s, s, s);
    }
  ctx.strokeStyle = '#2c2c2c';
  ctx.lineWidth = 2;
  for (let k = 0; k <= cells; k++) {
    ctx.beginPath();
    ctx.moveTo(k * s, 0);
    ctx.lineTo(k * s, 512);
    ctx.moveTo(0, k * s);
    ctx.lineTo(512, k * s);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ─────────── layout ─────────── */

function layout(word: string, narrow: boolean) {
  const n = word.length;
  const rows = narrow && n > 3 ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const pos: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / perRow);
    const k = i - r * perRow;
    const count = r === rows - 1 ? n - r * perRow : perRow;
    const x = (k - (count - 1) / 2) * GAP + (rows === 2 ? (r === 0 ? -0.45 : 0.45) : 0);
    const z = rows === 2 ? (r === 0 ? -1.45 : 1.45) : 0;
    pos.push(new THREE.Vector3(x, 0, z));
  }
  return { pos, width: perRow * GAP + 1.4, depth: rows };
}

/** Sample each letter on a grid: voxel targets that sit exactly where that letter's block stands. */
function voxelTargets(word: string, pos: THREE.Vector3[], font: Font) {
  const c = document.createElement('canvas');
  const W = 64;
  const H = 96;
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const out: { p: THREE.Vector3; letter: number }[] = [];
  const step = 4;
  for (let i = 0; i < word.length; i++) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    glyph(ctx, word[i], W / 2, H / 2, 104, font);
    const data = ctx.getImageData(0, 0, W, H).data;
    for (let y = 0; y < H; y += step)
      for (let x = 0; x < W; x += step) {
        if (data[(y * W + x) * 4 + 3] < 120) continue;
        const lx = ((x + step / 2) / W - 0.5) * 1.05;
        const ly = (1 - (y + step / 2) / H) * 1.5;
        for (let layer = 0; layer < 2; layer++) out.push({ p: new THREE.Vector3(pos[i].x + lx, ly, pos[i].z + (layer - 0.5) * 0.07), letter: i });
      }
  }
  return out;
}

/* ─────────── shaders ─────────── */

const faceVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const faceFrag = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uUseMap;
uniform float uThreshold;
uniform float uGlitch;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
${GLSL_HASH}
${GLSL_SNOISE}
void main() {
  vec2 uv = vUv;
  float row = floor(uv.y * 14.0);
  float tick = floor(uTime * 14.0);
  uv.x += (step(0.72, hash12(vec2(row, tick + uSeed))) - 0.5) * 0.16 * uGlitch;
  vec2 px = floor(uv * 20.0) / 20.0;
  float n = snoise(vec3(px * 3.2, uTime * 0.7 + uSeed)) * 0.5 + 0.5;
  if (n > uThreshold) discard;
  vec4 c = uUseMap > 0.5 ? texture2D(uMap, uv) : vec4(uColor, 1.0);
  if (c.a < 0.4) discard;
  gl_FragColor = vec4(c.rgb, 1.0);
  #include <colorspace_fragment>
}
`;

const voxVert = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aMid;
attribute vec3 aEnd;
attribute float aDelay;
attribute float aLetter;
uniform float uScatter;
uniform float uGather;
uniform float uShrink;
uniform float uVisible;
varying float vShade;
float expoOut(float t) { return t >= 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * t); }
float expoInOut(float t) {
  if (t <= 0.0) return 0.0; if (t >= 1.0) return 1.0;
  return t < 0.5 ? pow(2.0, 20.0 * t - 10.0) / 2.0 : (2.0 - pow(2.0, -20.0 * t + 10.0)) / 2.0;
}
void main() {
  float ls = clamp((uScatter - aDelay * 0.35) / 0.65, 0.0, 1.0);
  float lg = clamp((uGather - aDelay * 0.45) / 0.55, 0.0, 1.0);
  vec3 p = mix(aStart, aMid, expoOut(ls));
  p = mix(p, aEnd, expoInOut(lg));
  float s = uVisible * (1.0 - smoothstep(aLetter, aLetter + 0.9, uShrink));
  s *= mix(1.0, 1.35, sin(ls * 3.1416));
  vShade = normal.y > 0.5 ? 1.0 : (abs(normal.x) > 0.5 ? 0.62 : 0.8);
  gl_Position = projectionMatrix * viewMatrix * vec4(position * s + p, 1.0);
}
`;
const voxFrag = /* glsl */ `
varying float vShade;
void main() { gl_FragColor = vec4(vec3(0.96) * vShade, 1.0); }
`;

function faceMaterial(opts: { map?: THREE.Texture; color?: string; seed: number }) {
  return new THREE.ShaderMaterial({
    vertexShader: faceVert,
    fragmentShader: faceFrag,
    uniforms: {
      uMap: { value: opts.map ?? null },
      uColor: { value: new THREE.Color(opts.color ?? '#ffffff') },
      uUseMap: { value: opts.map ? 1 : 0 },
      uThreshold: { value: 0.9 },
      uGlitch: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: opts.seed },
    },
    side: THREE.DoubleSide,
  });
}

/* ─────────── scene ─────────── */

type Ctrl = { blocks: BlockState[]; vox: Vox; time: number };

function TypeBlock({
  letter,
  index,
  font,
  position,
  ctrl,
  running,
}: {
  letter: string;
  index: number;
  font: Font;
  position: THREE.Vector3;
  ctrl: React.RefObject<Ctrl>;
  running: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const { tex, mats } = useMemo(() => {
    const tex = blockTextures(letter, index, font);
    const seed = index * 7.13 + letter.charCodeAt(0) * 0.37;
    return {
      tex,
      mats: {
        front: faceMaterial({ map: tex.front, seed }),
        right: faceMaterial({ map: tex.right, seed: seed + 3 }),
        top: faceMaterial({ color: '#f5f5f5', seed: seed + 6 }),
      },
    };
  }, [letter, index, font]);
  useEffect(
    () => () => {
      tex.front.dispose();
      tex.right.dispose();
      Object.values(mats).forEach((m) => m.dispose());
    },
    [tex, mats],
  );

  useFrame((_, dt) => {
    const b = ctrl.current?.blocks[index];
    const g = group.current;
    if (!b || !g) return;
    if (running) b.hover += (b.hoverTarget - b.hover) * Math.min(1, dt * 10);
    g.position.set(position.x, position.y + b.y + 0.5, position.z);
    g.scale.setScalar(Math.max(0.0001, b.scale));
    const t = ctrl.current!.time;
    for (const m of Object.values(mats)) {
      m.uniforms.uTime.value = t;
      m.uniforms.uThreshold.value = 0.9 - b.hover * 0.42;
      m.uniforms.uGlitch.value = b.hover;
    }
    if (shadow.current) {
      const h = Math.min(1, b.y / DROP);
      shadow.current.scale.setScalar((1.3 - h * 0.7) * b.scale);
      (shadow.current.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - h) * b.scale;
    }
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const b = ctrl.current?.blocks[index];
    if (b) b.hoverTarget = 1;
  };
  const out = () => {
    const b = ctrl.current?.blocks[index];
    if (b) b.hoverTarget = 0;
  };

  return (
    <>
      <mesh ref={shadow} position={[position.x, 0.005, position.z]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[1.25, 1.25]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.5} depthWrite={false} alphaMap={SHADOW_TEX()} />
      </mesh>
      <group ref={group} rotation={[0, -Math.PI / 4, 0]} onPointerOver={over} onPointerOut={out}>
        <mesh position={[0, 0, 0.5]} material={mats.front}>
          <planeGeometry args={[1, 1]} />
        </mesh>
        <mesh position={[0.5, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={mats.right}>
          <planeGeometry args={[1, 1]} />
        </mesh>
        <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.top}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      </group>
    </>
  );
}

let shadowTex: THREE.Texture | null = null;
function SHADOW_TEX() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

function Voxels({ data, ctrl }: { data: VoxData | null; ctrl: React.RefObject<Ctrl> }) {
  const { geo, mat } = useMemo(() => {
    const geo = new THREE.InstancedBufferGeometry();
    const box = new THREE.BoxGeometry(0.052, 0.052, 0.052);
    geo.index = box.index;
    geo.setAttribute('position', box.getAttribute('position'));
    geo.setAttribute('normal', box.getAttribute('normal'));
    const mat = new THREE.ShaderMaterial({
      vertexShader: voxVert,
      fragmentShader: voxFrag,
      uniforms: { uScatter: { value: 0 }, uGather: { value: 0 }, uShrink: { value: 0 }, uVisible: { value: 0 } },
    });
    return { geo, mat };
  }, []);
  useEffect(() => {
    if (!data) return;
    geo.setAttribute('aStart', new THREE.InstancedBufferAttribute(data.start, 3));
    geo.setAttribute('aMid', new THREE.InstancedBufferAttribute(data.mid, 3));
    geo.setAttribute('aEnd', new THREE.InstancedBufferAttribute(data.end, 3));
    geo.setAttribute('aDelay', new THREE.InstancedBufferAttribute(data.delay, 1));
    geo.setAttribute('aLetter', new THREE.InstancedBufferAttribute(data.letter, 1));
    geo.instanceCount = data.count;
  }, [data, geo]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(() => {
    const v = ctrl.current?.vox;
    if (!v) return;
    mat.uniforms.uScatter.value = v.scatter;
    mat.uniforms.uGather.value = v.gather;
    mat.uniforms.uShrink.value = v.shrink;
    mat.uniforms.uVisible.value = v.visible;
  });
  if (!data) return null;
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}

type VoxData = { start: Float32Array; mid: Float32Array; end: Float32Array; delay: Float32Array; letter: Float32Array; count: number };

function buildVoxels(fromPos: THREE.Vector3[], toWord: string, toPos: THREE.Vector3[], font: Font): VoxData {
  const targets = voxelTargets(toWord, toPos, font);
  const count = targets.length;
  const start = new Float32Array(count * 3);
  const mid = new Float32Array(count * 3);
  const end = new Float32Array(count * 3);
  const delay = new Float32Array(count);
  const letter = new Float32Array(count);
  let maxD = 0;
  for (const t of targets) maxD = Math.max(maxD, Math.hypot(t.p.x, t.p.y - 0.75));
  targets.forEach((t, i) => {
    const src = fromPos[i % fromPos.length] ?? new THREE.Vector3();
    const sx = src.x + (Math.random() - 0.5) * 0.9;
    const sy = 0.5 + (Math.random() - 0.5) * 0.9;
    const sz = src.z + (Math.random() - 0.5) * 0.9;
    start.set([sx, sy, sz], i * 3);
    const dir = new THREE.Vector3(sx, sy - 0.2, sz).normalize();
    const r = 1.1 + Math.random() * 2.0;
    mid.set([sx + dir.x * r + (Math.random() - 0.5) * 1.6, sy + 0.6 + Math.random() * 1.8, sz + dir.z * r + (Math.random() - 0.5) * 1.6], i * 3);
    end.set([t.p.x, t.p.y, t.p.z], i * 3);
    delay[i] = Math.hypot(t.p.x, t.p.y - 0.75) / (maxD || 1);
    letter[i] = t.letter;
  });
  return { start, mid, end, delay, letter, count };
}

function Rig({ width, depth }: { width: number; depth: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    cam.position.set(0, 50, 100).normalize().multiplyScalar(60);
    cam.lookAt(0, 0.55, 0);
    const needW = width + 0.6;
    const needH = 3.2 + (depth - 1) * 2.6;
    cam.zoom = Math.min(size.width / needW, size.height / needH) * 0.92;
    cam.updateProjectionMatrix();
  }, [camera, size, width, depth]);
  return null;
}

/* ─────────── component ─────────── */

export default function VoxelTypeAssembly({ active, reducedMotion, progress }: ExperienceProps) {
  const running = active && !reducedMotion;
  const wrap = useRef<HTMLDivElement>(null);
  const [font, setFont] = useState<Font | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [word, setWord] = useState(WORDS[0]);
  const [counter, setCounter] = useState(0);
  const [vox, setVox] = useState<VoxData | null>(null);
  const floor = useMemo(() => (typeof document === 'undefined' ? null : floorTexture()), []);
  useEffect(() => () => floor?.dispose(), [floor]);

  const ctrl = useRef<Ctrl>({ blocks: [], vox: { scatter: 0, gather: 0, shrink: 0, visible: 0 }, time: 0 });
  const tl = useRef<gsap.core.Timeline | null>(null);
  const wordIdx = useRef(0);
  const wordRef = useRef(word);
  wordRef.current = word;
  const runningRef = useRef(running);
  runningRef.current = running;
  const pending = useRef('');
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    let dead = false;
    const f0 = detectFont();
    loadFont(`700 72px ${f0.family}`).then(() => !dead && setFont(detectFont()));
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width / Math.max(1, e.contentRect.height) < 0.85));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lay = useMemo(() => layout(word, narrow), [word, narrow]);
  if (ctrl.current.blocks.length !== word.length) {
    ctrl.current.blocks = Array.from({ length: word.length }, () => ({ y: reducedMotion ? 0 : DROP, scale: 1, hover: 0, hoverTarget: 0 }));
  }

  // one full cycle: drop the current word in, hold, burst into voxels, gather as the next word
  const cycle = (from: string, first: boolean, to?: string) => {
    tl.current?.kill();
    const c = ctrl.current;
    const next = to ?? WORDS[(wordIdx.current = (wordIdx.current + 1) % WORDS.length)];
    pending.current = next;
    const t = gsap.timeline({ paused: !runningRef.current });
    if (first) {
      c.blocks.forEach((b) => ((b.y = DROP), (b.scale = 1)));
      t.to(c.blocks, {
        y: 0,
        duration: 0.8,
        ease: 'back.out(1.7)',
        stagger: 0.14,
      });
      t.to({}, { duration: 2.2 });
    }
    // burst
    const fromPos = layout(from, narrow).pos;
    const toLay = layout(next, narrow);
    t.call(() => {
      if (!font) return;
      c.vox.scatter = 0;
      c.vox.gather = 0;
      c.vox.shrink = 0;
      setVox(buildVoxels(fromPos, next, toLay.pos, font));
    });
    t.to(c.blocks, { scale: 0, duration: 0.22, ease: 'power2.in', stagger: 0.035 }, '+=0.05');
    t.set(c.vox, { visible: 1 }, '<');
    t.to(c.vox, { scatter: 1, duration: 1.0, ease: 'none' }, '<');
    t.to(c.vox, { gather: 1, duration: 1.5, ease: 'none' }, '-=0.45');
    t.to({}, { duration: 0.5 });
    // swap in the next word's blocks, dropping onto the voxel letters as they dissolve
    t.call(() => {
      c.blocks = Array.from({ length: next.length }, () => ({ y: DROP, scale: 1, hover: 0, hoverTarget: 0 }));
      setWord(next);
    });
    t.to({}, { duration: 0.05 });
    t.add(() => {
      const d = gsap.timeline();
      d.to(c.blocks, { y: 0, duration: 0.8, ease: 'back.out(1.7)', stagger: 0.14 });
      d.to(c.vox, { shrink: next.length, duration: 0.14 * next.length + 0.5, ease: 'none' }, 0.25);
      d.set(c.vox, { visible: 0 });
      d.to({}, { duration: 2.6 });
      d.call(() => {
        if (progressRef.current === undefined) cycle(next, false);
      });
      tl.current = d;
      if (!runningRef.current) d.pause();
    });
    tl.current = t;
    if (runningRef.current) t.play();
  };

  // start when the font is ready
  useEffect(() => {
    if (!font) return;
    if (reducedMotion) {
      tl.current?.kill();
      ctrl.current.blocks.forEach((b) => ((b.y = 0), (b.scale = 1)));
      ctrl.current.vox.visible = 0;
      setCounter(wordRef.current.length);
      return;
    }
    cycle(wordRef.current, true);
    return () => {
      tl.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [font, reducedMotion, narrow]);

  useEffect(() => {
    const t = tl.current;
    if (!t) return;
    if (running) t.play();
    else t.pause();
  }, [running]);

  // external progress picks the word (for the home journey)
  useEffect(() => {
    if (progress === undefined || !font) return;
    const i = Math.min(WORDS.length - 1, Math.floor(progress * WORDS.length));
    if (WORDS[i] !== pending.current && !reducedMotion) {
      wordIdx.current = i;
      cycle(wordRef.current, false, WORDS[i]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, font]);

  const reroll = () => {
    if (!font) return;
    const pool = WORDS.filter((w) => w !== wordRef.current);
    const next = pool[Math.floor(Math.random() * pool.length)];
    wordIdx.current = WORDS.indexOf(next);
    if (reducedMotion) {
      ctrl.current.blocks = Array.from({ length: next.length }, () => ({ y: 0, scale: 1, hover: 0, hoverTarget: 0 }));
      setWord(next);
      setCounter(next.length);
      return;
    }
    ctrl.current.blocks.forEach((b) => ((b.y = 0), (b.scale = 1)));
    cycle(wordRef.current, false, next);
  };

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden bg-[#080808]">
      <Canvas
        orthographic
        dpr={[1, 1.75]}
        frameloop={running ? 'always' : 'demand'}
        camera={{ position: [0, 27, 54], zoom: 60, near: 0.1, far: 200 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => gl.setClearColor('#080808', 1)}
        onClick={reroll}
        className="cursor-pointer"
      >
        <Rig width={lay.width} depth={lay.depth} />
        <Clock ctrl={ctrl} running={running} onLanded={setCounter} />
        {floor && (
          <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[0, 0, 0]}>
            <planeGeometry args={[48, 48]} />
            <meshBasicMaterial map={floor} />
          </mesh>
        )}
        {font &&
          word
            .split('')
            .map((ch, i) => <TypeBlock key={`${word}-${i}`} letter={ch} index={i} font={font} position={lay.pos[i]} ctrl={ctrl} running={running} />)}
        <Voxels data={vox} ctrl={ctrl} />
        <StillFrames running={running} deps={[font, word, narrow]} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,#080808_92%)]" />
      <G1Bar title="Type Blocks" tools={TOOLS}>
        <span className="pixel bg-[#080808]/80 px-2 py-1 text-[16px] leading-[16px] text-[var(--v-ink)]">
          [{String(counter).padStart(3, '0')}/{String(word.length).padStart(3, '0')}]
        </span>
        <PixelButton onClick={reroll} label="re-roll the word">
          re-roll
        </PixelButton>
      </G1Bar>
    </div>
  );
}

function Clock({ ctrl, running, onLanded }: { ctrl: React.RefObject<Ctrl>; running: boolean; onLanded: (n: number) => void }) {
  const last = useRef(-1);
  useFrame((_, dt) => {
    if (running) ctrl.current.time += Math.min(dt, 0.05);
    // the index counter ticks up as each block lands
    const n = ctrl.current.blocks.filter((b) => b.y < 0.05 && b.scale > 0.5).length;
    if (n !== last.current) {
      last.current = n;
      onLanded(n);
    }
  });
  return null;
}
