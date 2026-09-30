'use client';

/*
 * Wave Extrude Type (Day 031 / 032): a word of solid letters seen from an isometric orthographic camera.
 * Each letter is extruded as a stack of 72 textured slices (one InstancedBufferGeometry, so the glyph is our
 * own display face drawn to a canvas, no font JSON needed). In the vertex shader every slice at depth v of
 * letter i moves by  y += amp * sin(v*k - i + time),  so the extrusion bends like a ribbon and the wave rolls
 * from the first letter to the last. The fragment shader fades the depth with a noise-warped v and a
 * dithered (airbrush) discard, so the deep ends dissolve into the paper behind a crisp front face.
 * Scroll energy drives the phase, pointer y sets the amplitude, click swaps the word (retract, re-extrude).
 * An EXIT preset (white on violet, cubic fade) is kept for the colour stage.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner, GLSL_NOISE, useCanvasFonts, useEnergy, type Energy } from './g3-kit';

const TOOLS = ['r3f', 'drei', 'glsl', 'gsap', 'svg'];
const WORDS = ['WAVE', 'DEPTH', 'RIBBON', 'SIGNAL'];
const SLICES = 72;
const CELL_H = 256;
const WORLD_H = 140; // world height of one glyph cell

type Preset = { name: string; paper: string; ink: string; side: string; fadePow: number };
const PRESETS: Preset[] = [
  { name: 'mono', paper: '#f5f5f5', ink: '#080808', side: '#2c2c2c', fadePow: 1.0 },
  { name: 'exit', paper: '#7b2cff', ink: '#ffffff', side: '#b0b0b0', fadePow: 3.0 },
];

function v3(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/* ───────────── word → atlas + instanced slices ───────────── */

function buildWord(word: string, family: string) {
  const font = `800 200px ${family}`;
  const m = document.createElement('canvas').getContext('2d')!;
  m.font = font;
  const capH = m.measureText('H').actualBoundingBoxAscent || 145;
  const pad = 14;
  const widths = [...word].map((ch) => Math.ceil(m.measureText(ch).width) + pad * 2);
  const W = widths.reduce((a, b) => a + b, 0);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = CELL_H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, CELL_H);
  ctx.fillStyle = '#fff';
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  let x = 0;
  const rects: { u0: number; u1: number; x0: number; w: number }[] = [];
  const scale = WORLD_H / CELL_H;
  const total = W * scale;
  [...word].forEach((ch, i) => {
    ctx.fillText(ch, x + pad, CELL_H / 2 + capH / 2);
    rects.push({ u0: x / W, u1: (x + widths[i]) / W, x0: x * scale - total / 2, w: widths[i] * scale });
    x += widths[i];
  });
  const texture = new THREE.CanvasTexture(c);
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  const n = word.length * SLICES;
  const aLetter = new Float32Array(n);
  const aV = new Float32Array(n);
  const aRect = new Float32Array(n * 4);
  let k = 0;
  // back to front, so the front face is the last written at equal depth
  for (let s = SLICES - 1; s >= 0; s--)
    for (let i = 0; i < word.length; i++, k++) {
      aLetter[k] = i;
      aV[k] = s / (SLICES - 1);
      aRect.set([rects[i].u0, rects[i].u1, rects[i].x0, rects[i].w], k * 4);
    }
  geo.setAttribute('aLetter', new THREE.InstancedBufferAttribute(aLetter, 1));
  geo.setAttribute('aV', new THREE.InstancedBufferAttribute(aV, 1));
  geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(aRect, 4));
  geo.instanceCount = n;
  base.dispose();
  return { texture, geo, total, capWorld: capH * scale, count: word.length };
}

/* ───────────── shaders ───────────── */

const VERT = /* glsl */ `
attribute float aLetter;
attribute float aV;
attribute vec4 aRect; // u0, u1, x0, width
uniform float uT, uAmp, uDepth, uExtrude, uCellH;
varying vec2 vUv;
varying float vV;
void main() {
  float v = aV * uExtrude;
  vec3 p;
  p.x = aRect.z + (position.x + 0.5) * aRect.w;
  p.y = position.y * uCellH;
  p.z = -v * uDepth;
  // the ribbon: phase shifts with depth and with the letter index
  p.y += uAmp * 0.3 * uCellH * sin(v * 3.2 - aLetter * 0.85 + uT);
  p.x += uAmp * 0.04 * uCellH * cos(v * 2.4 - aLetter * 0.85 + uT);
  vUv = vec2(mix(aRect.x, aRect.y, position.x + 0.5), uv.y);
  vV = aV;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;
const FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uPaper, uInk, uSide;
uniform float uT, uFadePow, uExtrude;
varying vec2 vUv;
varying float vV;
${GLSL_NOISE}
void main() {
  float a = texture2D(uTex, vUv).r;
  if (a < 0.5) discard;
  // noise-warped depth, then an airbrush (dithered) dissolve
  float v = vV + 0.1 * snoise(vec2(vUv.x * 14.0, vV * 1.2 + uT * 0.25));
  float fade = pow(smoothstep(0.0, 1.0, v), uFadePow);
  float r = hash12(floor(gl_FragCoord.xy));
  if (vV > 0.0 && r < fade * 1.05) discard;
  vec3 side = mix(uSide, uPaper, 0.15 + 0.55 * fade);
  side *= 1.0 - 0.3 * v * (hash12(vUv * 500.0) - 0.5);
  vec3 col = vV == 0.0 ? uInk : side;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ───────────── scene ───────────── */

function Scene({
  word,
  preset,
  active,
  reduced,
  progress,
  energy,
  step,
  pointer,
  extrude,
}: {
  word: ReturnType<typeof buildWord>;
  preset: Preset;
  active: boolean;
  reduced: boolean;
  progress?: number;
  energy: RefObject<Energy>;
  step: (dt: number) => number;
  pointer: RefObject<{ y: number; inside: boolean }>;
  extrude: { value: number };
}) {
  const { camera, size, invalidate, scene } = useThree();
  const depth = word.capWorld * 1.9;

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.DoubleSide,
        uniforms: {
          uTex: { value: word.texture },
          uT: { value: 1.2 },
          uAmp: { value: 0 },
          uDepth: { value: depth },
          uExtrude: extrude,
          uCellH: { value: WORLD_H },
          uPaper: { value: v3(preset.paper) },
          uInk: { value: v3(preset.ink) },
          uSide: { value: v3(preset.side) },
          uFadePow: { value: preset.fadePow },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [word],
  );
  useEffect(() => () => mat.dispose(), [mat]);

  // preset colours
  const bg = useMemo(() => new THREE.Color(), []);
  useEffect(() => {
    mat.uniforms.uPaper.value = v3(preset.paper);
    mat.uniforms.uInk.value = v3(preset.ink);
    mat.uniforms.uSide.value = v3(preset.side);
    mat.uniforms.uFadePow.value = preset.fadePow;
    const p = v3(preset.paper);
    bg.setRGB(p.x, p.y, p.z, THREE.SRGBColorSpace);
    scene.background = bg;
    invalidate();
  }, [preset, mat, bg, scene, invalidate]);

  // fit the word: isometric-ish orthographic camera at (-300, 200, 500)
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    cam.position.set(-300, 200, 500);
    cam.near = -5000;
    cam.far = 5000;
    cam.lookAt(0, -depth * 0.1, -depth * 0.5);
    const needW = word.total * 0.86 + depth * 0.45;
    const needH = WORLD_H * 2.1 + depth * 0.35;
    cam.zoom = Math.min(size.width / needW, size.height / needH) * (size.width < 600 ? 0.88 : 0.94);
    cam.updateProjectionMatrix();
    invalidate();
  }, [camera, size, word, depth, invalidate]);

  // on enter, GSAP tweens the amplitude from 0 to full
  const amp = useRef({ v: 0, target: 1 });
  const entered = useRef(false);
  useEffect(() => {
    if (reduced) {
      amp.current.v = 1;
      return;
    }
    if (active && !entered.current) {
      entered.current = true;
      gsap.fromTo(amp.current, { v: 0 }, { v: 1, duration: 2.2, ease: 'power3.out' });
    }
  }, [active, reduced]);

  const S = useRef({ t: 1.2, phase: 0 });
  useEffect(() => {
    if (!reduced) return;
    mat.uniforms.uT.value = 1.2;
    mat.uniforms.uAmp.value = 1;
    mat.uniforms.uDepth.value = depth;
    invalidate();
  }, [reduced, mat, depth, invalidate]);

  useFrame((_, rawDt) => {
    if (reduced) return;
    const dt = Math.min(rawDt, 1 / 20);
    const e = step(dt);
    const s = S.current;
    if (active) s.t += dt;
    // scroll energy pushes the phase forward; pointer y sets the amplitude
    s.phase += dt * (1.1 + e * 4.5);
    const py = pointer.current.inside ? 0.35 + (1 - (pointer.current.y + 1) / 2) * 1.15 : 1;
    amp.current.target += (py - amp.current.target) * Math.min(1, dt * 3);
    mat.uniforms.uT.value = progress !== undefined ? progress * Math.PI * 4 : s.phase;
    mat.uniforms.uAmp.value = amp.current.v * amp.current.target;
    mat.uniforms.uDepth.value = depth;
  });

  return (
    <mesh geometry={word.geo} frustumCulled={false}>
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

/* ───────────── SVG readout ───────────── */

function WaveReadout({ color }: { color: string }) {
  const d = useMemo(() => {
    let s = '';
    for (let i = 0; i <= 60; i++) {
      const x = (i / 60) * 96;
      const y = 12 - Math.sin((i / 60) * Math.PI * 4) * 8;
      s += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return s;
  }, []);
  return (
    <svg width="96" height="24" viewBox="0 0 96 24" aria-hidden className="block">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/* ───────────── root ───────────── */

export default function WaveExtrudeType({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const fonts = useCanvasFonts();
  const { energy, step } = useEnergy(host, active && !reducedMotion);
  const pointer = useRef({ y: 0, inside: false });
  const [wi, setWi] = useState(0);
  const [pi, setPi] = useState(0);
  const extrude = useMemo(() => ({ value: 1 }), []);
  const busy = useRef(false);
  const lockTimer = useRef(0);

  const word = useMemo(() => (fonts ? buildWord(WORDS[wi % WORDS.length], fonts.sans) : null), [fonts, wi]);
  useEffect(
    () => () => {
      if (!word) return;
      word.texture.dispose();
      word.geo.dispose();
    },
    [word],
  );

  // after a swap: re-extrude. Any earlier tween on `extrude` is killed first, and the click lock is always released here.
  const first = useRef(true);
  useEffect(() => {
    if (!word) return;
    gsap.killTweensOf(extrude);
    busy.current = false;
    if (first.current || reducedMotion) {
      first.current = false;
      extrude.value = 1;
      return;
    }
    gsap.fromTo(extrude, { value: 0 }, { value: 1, duration: 1.2, ease: 'expo.out' });
  }, [word, extrude, reducedMotion]);
  useEffect(() => () => void gsap.killTweensOf(extrude), [extrude]);

  // the lock only covers the short retract; a counter (not a toggle) so every swap is a new word
  const swap = () => {
    if (busy.current) return;
    gsap.killTweensOf(extrude);
    if (reducedMotion) {
      setWi((w) => w + 1);
      return;
    }
    busy.current = true;
    const release = () => void (busy.current = false);
    gsap.to(extrude, {
      value: 0,
      duration: 0.4,
      ease: 'power2.in',
      onComplete: () => {
        release();
        setWi((w) => w + 1);
      },
      onInterrupt: release,
    });
    // belt and braces: never stay locked if the tween is dropped (StrictMode remount, tab hidden)
    window.clearTimeout(lockTimer.current);
    lockTimer.current = window.setTimeout(release, 900);
  };

  useEffect(() => {
    const el = host.current;
    if (!el || reducedMotion) return;
    const onMove = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
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

  const preset = PRESETS[pi];
  const onDark = preset.name === 'exit';

  return (
    <div
      ref={host}
      className="relative h-full w-full cursor-pointer overflow-hidden"
      style={{ background: preset.paper, touchAction: 'pan-y' }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button')) return;
        swap();
      }}
    >
      {word && (
        <Canvas
          orthographic
          dpr={[1, 1.75]}
          frameloop={active && !reducedMotion ? 'always' : 'demand'}
          camera={{ position: [-300, 200, 500], zoom: 1, near: -5000, far: 5000 }}
          gl={{ antialias: true, alpha: false }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <Scene
            word={word}
            preset={preset}
            active={active}
            reduced={reducedMotion}
            progress={progress}
            energy={energy}
            step={step}
            pointer={pointer}
            extrude={extrude}
          />
        </Canvas>
      )}
      <Corner title="Wave Extrude Type" tools={TOOLS} />
      <div className="absolute right-3 bottom-3 z-20 flex items-end gap-2">
        <div className="pixel px-2 py-1 text-right text-[16px] leading-[16px]" style={{ background: '#080808', color: '#f5f5f5' }}>
          <WaveReadout color="#f5f5f5" />
          <p className="mt-1">click: next word</p>
        </div>
        <button
          type="button"
          onClick={() => setPi((p) => (p + 1) % PRESETS.length)}
          aria-pressed={onDark}
          className="pixel border px-2 py-1 text-[16px] leading-[16px]"
          style={{ background: '#080808', color: '#f5f5f5', borderColor: '#080808' }}
        >
          [{preset.name}]
        </button>
      </div>
    </div>
  );
}
