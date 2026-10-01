'use client';

/*
 * Velocity Ribbon Type: one long plane (480 x 8 segments) bent in the vertex shader into a floating
 * ribbon and twisted around its own length. The headline is a Canvas2D strip that repeats along it.
 * Speed comes from wheel and drag deltas inside the piece (or from progress changes when the page
 * drives it): it winds the twist tighter, stretches the letters along the ribbon (fewer repeats),
 * pushes the text along and splits the colour channels a little. Everything eases back when you stop.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner, useCanvasFonts } from './g3-kit';

const TOOLS = ['r3f', 'threejs', 'glsl', 'canvas2d'];
const LEN = 18;
const WID = 1.15;
const BG = '#0d0a14';
const FRONT = '#ffe14a';
const FRONT_INK = '#0d0a14';
const BACK = '#ff2fa8';
const BACK_INK = '#fbf7ee';
/** text tiles along the ribbon at rest; speed lowers it, which stretches each letter */
const REPEAT = 3.2;

/** The shader writes colour straight out (no colour management), so keep the hex values as they are. */
const raw = (hex: string) => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);

function drawStrip(family: string) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#fff';
  let size = 100;
  g.font = `900 ${size}px ${family}`;
  const word = 'MOVE FAST';
  const gap = 64;
  const fit = (cv.width - gap) / g.measureText(word).width;
  size = Math.min(104, Math.floor(size * fit));
  g.font = `900 ${size}px ${family}`;
  g.textBaseline = 'middle';
  const tw = g.measureText(word).width;
  const x0 = (cv.width - gap - tw) / 2;
  g.fillText(word, x0, cv.height / 2 + size * 0.04);
  // a drawn separator: a four-point star
  const cx = cv.width - gap / 2;
  const cy = cv.height / 2;
  const r = 16;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.3 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

const vert = /* glsl */ `
uniform float uTime;
uniform float uTwist;
uniform float uWave;
uniform float uLag;
varying vec2 vUv;
varying float vFace;
varying float vDepth;
void main() {
  vec3 p = position;
  float x = p.x;
  // twist around the length: a wound base plus a travelling wobble
  float a = x * uTwist + sin(x * 0.42 - uTime * 0.9) * 0.7 * uWave + uTime * 0.15;
  float y = p.y * cos(a);
  float z = p.y * sin(a);
  // the centre line floats in a slow S, and bows with speed (the lag)
  vec3 c = vec3(
    x,
    sin(x * 0.34 + uTime * 0.35) * 0.8 + uLag * (1.0 - (x * x) / 81.0) * 0.9,
    cos(x * 0.27 + uTime * 0.25) * 1.3 - 0.6
  );
  vec3 pos = c + vec3(0.0, y, z);
  vFace = cos(a);
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
precision highp float;
uniform sampler2D uText;
uniform float uRepeat;
uniform float uOffset;
uniform float uSplit;
uniform vec3 uFront;
uniform vec3 uFrontInk;
uniform vec3 uBack;
uniform vec3 uBackInk;
uniform vec3 uFog;
varying vec2 vUv;
varying float vFace;
varying float vDepth;
void main() {
  float u = vUv.x * uRepeat - uOffset;
  // the back face reads the strip mirrored, so flip it to keep the words the right way round
  float uu = gl_FrontFacing ? u : -u;
  vec2 st = vec2(uu, vUv.y);
  float tr = texture2D(uText, st + vec2(uSplit, 0.0)).r;
  float tg = texture2D(uText, st).r;
  float tb = texture2D(uText, st - vec2(uSplit, 0.0)).r;
  vec3 bg = gl_FrontFacing ? uFront : uBack;
  vec3 ink = gl_FrontFacing ? uFrontInk : uBackInk;
  vec3 col = vec3(mix(bg.r, ink.r, tr), mix(bg.g, ink.g, tg), mix(bg.b, ink.b, tb));
  // thin edge rules along both sides
  float e = smoothstep(0.02, 0.05, vUv.y) * smoothstep(0.02, 0.05, 1.0 - vUv.y);
  col = mix(ink, col, e);
  // shade by how square the ribbon faces the camera, then fade into the background with depth
  col *= 0.5 + 0.5 * abs(vFace);
  col = mix(col, uFog, smoothstep(10.0, 17.0, vDepth));
  gl_FragColor = vec4(col, 1.0);
}`;

type Drive = { raw: number; v: number; offset: number; last?: number; dragging: boolean; lx: number; ly: number };

function Ribbon({
  active,
  reduced,
  progress,
  drive,
  tex,
  readout,
}: {
  active: boolean;
  reduced: boolean;
  progress?: number;
  drive: React.MutableRefObject<Drive>;
  tex: THREE.Texture;
  readout: React.RefObject<HTMLSpanElement | null>;
}) {
  const { size, invalidate } = useThree();
  const prog = useRef(progress);
  prog.current = progress;
  const mesh = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(LEN, WID, 480, 8), []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.DoubleSide,
        uniforms: {
          uText: { value: tex },
          uTime: { value: 0 },
          uTwist: { value: 0.5 },
          uWave: { value: 1 },
          uLag: { value: 0 },
          uRepeat: { value: REPEAT },
          uOffset: { value: 0 },
          uSplit: { value: 0 },
          uFront: { value: raw(FRONT) },
          uFrontInk: { value: raw(FRONT_INK) },
          uBack: { value: raw(BACK) },
          uBackInk: { value: raw(BACK_INK) },
          uFog: { value: raw(BG) },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    mat.uniforms.uText.value = tex;
  }, [mat, tex]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  // reduced motion renders on demand: ask a few times so the first compile never eats the only frame
  useEffect(() => {
    if (!active) return;
    let n = 0;
    let raf = 0;
    const tick = () => {
      invalidate();
      if (++n < 8) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [active, reduced, tex, size.width, size.height, invalidate]);

  const time = useRef(0);
  const frame = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const U = mat.uniforms;
    const portrait = size.width < size.height * 0.9;
    if (mesh.current) {
      mesh.current.rotation.set(0.12, portrait ? 0.1 : -0.12, portrait ? -1.12 : -0.26);
      mesh.current.scale.setScalar(portrait ? 0.92 : 1);
    }
    if (reduced) {
      // a composed still: a firm twist, stretched a touch, no split
      U.uTime.value = 1.4;
      U.uTwist.value = 0.62;
      U.uWave.value = 1;
      U.uLag.value = 0.25;
      U.uRepeat.value = REPEAT * 0.8;
      U.uOffset.value = 0.18;
      U.uSplit.value = 0;
      if (readout.current) readout.current.textContent = 'speed 0.00';
      return;
    }
    const d = drive.current;
    const p = prog.current;
    if (p !== undefined) {
      // velocity from progress changes
      if (d.last !== undefined) d.raw += (p - d.last) * 40;
      d.last = p;
    } else d.last = undefined;
    d.raw = Math.max(-6, Math.min(6, d.raw));
    d.raw *= Math.exp(-dt * 2.6);
    d.v += (d.raw - d.v) * (1 - Math.exp(-dt * 7));
    const s = Math.min(Math.abs(d.v), 4);
    time.current += dt;
    d.offset += (0.18 + d.v * 0.9) * dt;
    U.uTime.value = time.current;
    U.uTwist.value = 0.32 + s * 0.42;
    U.uWave.value = 1 + s * 0.5;
    U.uLag.value += (Math.max(-2, Math.min(2, -d.v * 0.6)) - U.uLag.value) * (1 - Math.exp(-dt * 5));
    U.uRepeat.value = REPEAT / (1 + s * 0.55);
    U.uOffset.value = d.offset;
    U.uSplit.value = Math.min(0.02, s * 0.005);
    if (readout.current && ++frame.current % 6 === 0) {
      readout.current.textContent = `speed ${s.toFixed(2)} · twist ${U.uTwist.value.toFixed(2)} · stretch x${(REPEAT / U.uRepeat.value).toFixed(2)}`;
    }
  });

  return <mesh ref={mesh} geometry={geo} material={mat} frustumCulled={false} />;
}

export default function VelocityRibbon({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const drive = useRef<Drive>({ raw: 0, v: 0, offset: 0, dragging: false, lx: 0, ly: 0 });
  const fonts = useCanvasFonts();
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!fonts) return;
    const t = drawStrip(fonts.sans);
    setTex(t);
    return () => t.dispose();
  }, [fonts]);

  // wheel: read the delta only, never block the page scroll
  useEffect(() => {
    const el = host.current;
    if (!el || reducedMotion) return;
    const onWheel = (e: WheelEvent) => {
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      drive.current.raw += (dy + e.deltaX) * 0.004;
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, [reducedMotion]);

  const onDown = (e: React.PointerEvent) => {
    if (reducedMotion) return;
    const d = drive.current;
    d.dragging = true;
    d.lx = e.clientX;
    d.ly = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drive.current;
    if (!d.dragging) return;
    const dx = e.clientX - d.lx;
    const dy = e.clientY - d.ly;
    d.lx = e.clientX;
    d.ly = e.clientY;
    // drag right or down pushes forward, left or up pulls back
    d.raw += (dx + dy) * 0.018;
  };
  const onUp = () => {
    drive.current.dragging = false;
  };

  return (
    <div
      ref={host}
      className="relative h-full w-full cursor-grab touch-pan-y select-none overflow-hidden active:cursor-grabbing"
      style={{ background: `radial-gradient(120% 90% at 50% 45%, #1c1330 0%, ${BG} 70%)` }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
    >
      {tex && (
        <Canvas
          flat
          dpr={[1, 1.5]}
          frameloop={!active ? 'never' : reducedMotion ? 'demand' : 'always'}
          camera={{ position: [0, 0, 9], fov: 40, near: 0.1, far: 40 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <Ribbon active={active} reduced={reducedMotion} progress={progress} drive={drive} tex={tex} readout={readout} />
        </Canvas>
      )}
      <Corner title="Velocity Ribbon Type" tools={TOOLS} />
      <div className="pixel pointer-events-none absolute right-3 bottom-3 left-3 flex flex-wrap items-end justify-between gap-2 text-[16px] leading-[16px]">
        <span ref={readout} className="bg-[var(--v-bg)]/85 px-2 py-1 text-[var(--v-soft)]">
          speed 0.00
        </span>
        <span className="bg-[var(--v-bg)]/85 px-2 py-1 text-[var(--v-soft)]">
          {reducedMotion ? 'still: reduced motion' : progress !== undefined ? 'scroll faster' : 'scroll or drag'}
        </span>
      </div>
    </div>
  );
}
