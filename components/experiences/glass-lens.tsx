'use client';

import { MeshTransmissionMaterial } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { C, SNOISE3, raw } from './g2-glsl';
import { CornerLabel, Cycler } from './g2-ui';

/*
 * Liquid Lens: a wobbling glass lens over a wall of scrolling type.
 * The type wall is sampled analytically from one strip texture: rows from floor(uv.y*rows), each scrolled
 * at its own speed. Blur comes from the texture's mip chain (a bias that rises toward the rim).
 * blob:   UVs scale round the centre (refraction-like) and each channel scales by base + A*cos(d*L*freq_c).
 * square: an aspect-correct max() mask, barrel distortion and radial RGB offsets, colour inside, grey outside.
 * fluted: fract(x*N) prism offsets over colour.
 * disc:   drei MeshTransmissionMaterial on a rounded cylinder built in code.
 */

const MODES = ['blob', 'square', 'fluted', 'disc'] as const;
const LINES = ['Light bends around every letter', 'glass remembers what it magnifies', 'Look closer and the words move'];

const vertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;

const fragment = /* glsl */ `
uniform sampler2D uStrip;
uniform float uStripAspect;
uniform float uTime;
uniform vec2 uRes;
uniform float uRows;
uniform vec2 uLens;
uniform float uRadius;
uniform float uShow;
uniform float uMode;
uniform float uAberr;
uniform vec3 uFreq;
uniform float uBase;
uniform vec3 uPal[6];
varying vec2 vUv;
${SNOISE3}

float rowHash(float r) { return fract(sin(r * 91.7) * 4375.85); }

// returns x = text mask, y = row index
vec2 typeAt(vec2 uv, float bias) {
  float row = floor(uv.y * uRows);
  float band = row / uRows;
  float ly = fract(uv.y * uRows);
  float sub = mod(row, 3.0);
  float h = rowHash(row);
  float dir = mod(row, 2.0) < 0.5 ? 1.0 : -1.0;
  float rowPx = uRes.y / uRows;
  float u = uv.x * uRes.x / rowPx / uStripAspect;
  u += dir * uTime * (0.012 + 0.03 * h) + 0.4 * band;
  float v = 1.0 - (sub + 1.0) / 3.0 + ly / 3.0;
  float m = texture2D(uStrip, vec2(u, v), bias).r;
  return vec2(m, row);
}

vec3 rowColour(float row) {
  float k = mod(row, 6.0);
  vec3 c = uPal[0];
  if (k > 0.5) c = uPal[1];
  if (k > 1.5) c = uPal[2];
  if (k > 2.5) c = uPal[3];
  if (k > 3.5) c = uPal[4];
  if (k > 4.5) c = uPal[5];
  return c;
}

// white type (0) or grey poster (1); colour=1 shows the poster in full colour
vec3 field(vec2 uv, float bias, float colour) {
  vec2 t = typeAt(uv, bias);
  float dim = 0.55 + 0.45 * rowHash(t.y + 3.0);
  vec3 white = mix(vec3(0.031), vec3(0.95) * dim, t.x);
  vec3 bg = rowColour(t.y);
  vec3 ink = (mod(t.y, 6.0) > 1.5 && mod(t.y, 6.0) < 2.5) ? vec3(1.0) : vec3(0.031);
  vec3 poster = mix(bg, ink, t.x);
  float g = dot(poster, vec3(0.299, 0.587, 0.114));
  vec3 grey = vec3(g * 0.85 + 0.03);
  vec3 p = mix(grey, poster, colour);
  return mix(white, p, uBase);
}

void main() {
  vec2 uv = vUv;
  float t = uTime;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 pc = (uv - uLens) * asp;
  float R = max(uRadius * uShow, 1e-4);
  // sine wobble on the base, so the grey world breathes too
  vec2 buv = uv + vec2(sin(uv.y * 18.0 + t * 0.8), cos(uv.x * 14.0 + t * 0.6)) * 0.0012 * uBase;
  vec3 col = field(buv, 0.0, 0.0);

  if (uMode < 0.5) {
    // BLOB: breathing outline, pulse frequency follows sin(t)
    float ang = atan(pc.y, pc.x);
    float wob = snoise(vec3(cos(ang) * 0.9, sin(ang) * 0.9, t * 0.45)) * (0.06 + 0.03 * sin(t * 1.3));
    float r = R * (1.0 + wob);
    float d = length(pc) / r;
    col *= 1.0 - 0.45 * smoothstep(1.45, 1.0, d) * uShow;
    if (d < 1.02) {
      float z = sqrt(max(0.0, 1.0 - d * d));
      float bend = 0.58 + 1.5 * (1.0 - z);
      float A = (0.05 + uAberr) * pow(d, 2.0);
      vec3 sc = bend + A * cos(d * 9.0 * uFreq);
      float bias = 3.5 * pow(d, 5.0);
      vec3 lens;
      lens.r = field(uLens + (uv - uLens) * sc.r, bias, 0.0).r;
      lens.g = field(uLens + (uv - uLens) * sc.g, bias, 0.0).g;
      lens.b = field(uLens + (uv - uLens) * sc.b, bias, 0.0).b;
      // thin-film sheen and a specular only in a thin ring
      vec3 film = 0.5 + 0.5 * cos(6.2832 * (d * 1.6 + vec3(0.0, 0.33, 0.67)) + t * 0.6 + uFreq * 0.4);
      lens += film * smoothstep(0.55, 1.0, d) * 0.22;
      vec2 nd = pc / max(length(pc), 1e-4);
      float ring = smoothstep(0.86, 0.95, d) * smoothstep(1.0, 0.96, d);
      lens += ring * (0.35 + 0.65 * max(0.0, dot(nd, normalize(vec2(-0.6, 0.8))))) * 0.9;
      float spot = exp(-dot(pc / r - vec2(-0.38, 0.42), pc / r - vec2(-0.38, 0.42)) * 40.0);
      lens += spot * 0.5;
      col = mix(col, lens, smoothstep(1.0, 0.975, d));
    }
  } else if (uMode < 1.5) {
    // SQUARE: aspect-correct max() mask, barrel + radial RGB
    float S = R * 0.92;
    float m = max(abs(pc.x), abs(pc.y));
    col *= 1.0 - 0.35 * smoothstep(S * 1.35, S, m) * uShow;
    if (m < S) {
      vec2 q = pc / S;
      float r2 = dot(q, q);
      vec2 bq = q * (0.72 + 0.16 * r2);
      float o = (0.012 + uAberr * 0.25) * r2;
      vec3 lens;
      lens.r = field(uLens + bq * (1.0 + o) * S / asp, 0.0, 1.0).r;
      lens.g = field(uLens + bq * S / asp, 0.0, 1.0).g;
      lens.b = field(uLens + bq * (1.0 - o) * S / asp, 0.0, 1.0).b;
      float edge = step(S - 1.5 / uRes.y, m);
      col = mix(lens, vec3(1.0), edge);
    }
  } else if (uMode < 2.5) {
    // FLUTED: a tall reeded panel, fract(x*N) prism offsets over colour
    vec2 half_ = vec2(R * 0.85, R * 1.25);
    vec2 a = abs(pc) - half_ + 0.04;
    float box = length(max(a, 0.0)) + min(max(a.x, a.y), 0.0) - 0.04;
    col *= 1.0 - 0.3 * smoothstep(0.12, 0.0, box) * uShow;
    if (box < 0.0) {
      // each reed magnifies the slice behind its own centre, and splits the channels a little
      float N = 7.0;
      float cw = half_.x * 2.0 / N;
      float fx = (pc.x + half_.x) / cw;
      float s = fract(fx);
      float cx = (floor(fx) + 0.5) * cw - half_.x;
      float k = 0.5 - uAberr;
      vec3 lens;
      lens.r = field(uLens + vec2(cx + (s - 0.5) * cw * k * 1.08, pc.y) / asp, 0.6, 1.0).r;
      lens.g = field(uLens + vec2(cx + (s - 0.5) * cw * k, pc.y) / asp, 0.6, 1.0).g;
      lens.b = field(uLens + vec2(cx + (s - 0.5) * cw * k * 0.92, pc.y) / asp, 0.6, 1.0).b;
      lens *= 0.78 + 0.32 * sin(s * 3.1416);
      lens += pow(1.0 - abs(s - 0.3) * 2.0, 12.0) * 0.35;
      lens *= mix(0.6, 1.0, smoothstep(0.0, 0.05, s) * smoothstep(1.0, 0.95, s));
      col = mix(col, lens, smoothstep(0.0, -0.003, box));
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function roundedDisc(radius: number, height: number, bevel: number) {
  const pts: THREE.Vector2[] = [];
  const h = height / 2;
  pts.push(new THREE.Vector2(0, -h));
  // bottom bevel: -90deg to 0deg round (radius - bevel, -h + bevel)
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, -h + bevel + Math.sin(a) * bevel));
  }
  // top bevel: 0deg to 90deg round (radius - bevel, h - bevel)
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, h - bevel + Math.sin(a) * bevel));
  }
  pts.push(new THREE.Vector2(0, h));
  const g = new THREE.LatheGeometry(pts, 96);
  g.rotateX(Math.PI / 2);
  return g;
}

function Disc({ lens, reduced }: { lens: { x: number; y: number; show: number; radius: number }; reduced: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const { viewport, size } = useThree();
  const geo = useMemo(() => roundedDisc(1, 0.42, 0.16), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const t = reduced ? 3 : state.clock.elapsedTime;
    m.position.set((lens.x - 0.5) * viewport.width, (lens.y - 0.5) * viewport.height, 0);
    const s = lens.radius * viewport.height * lens.show * (size.width < size.height ? 1.15 : 1);
    m.scale.setScalar(Math.max(0.001, s));
    m.rotation.set(0.35 + Math.sin(t * 0.7) * 0.18, -0.3 + Math.cos(t * 0.5) * 0.22, 0);
  });
  return (
    <mesh ref={ref} geometry={geo}>
      <MeshTransmissionMaterial
        samples={6}
        resolution={512}
        thickness={0.9}
        roughness={0.02}
        transmission={1}
        ior={1.45}
        chromaticAberration={0.9}
        anisotropy={0.2}
        distortion={0.35}
        distortionScale={0.4}
        temporalDistortion={0.08}
        iridescence={1}
        iridescenceIOR={1.3}
        iridescenceThicknessRange={[100, 800]}
        backside
        backsideThickness={0.4}
        color="#ffffff"
      />
    </mesh>
  );
}

type Live = { x: number; y: number; tx: number; ty: number; show: number; radius: number; aberr: number; hover: number; inside: boolean };

function Scene({ mode, reduced, live, strip, stripAspect }: { mode: number; reduced: boolean; live: Live; strip: THREE.Texture | null; stripAspect: number }) {
  const { size, invalidate } = useThree();
  // Material built once, imperatively: its own uniforms object is the single source of truth.
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uStrip: { value: null as THREE.Texture | null },
          uStripAspect: { value: 8 },
          uTime: { value: 6 },
          uRes: { value: new THREE.Vector2(1, 1) },
          uRows: { value: 15 },
          uLens: { value: new THREE.Vector2(0.6, 0.5) },
          uRadius: { value: 0.26 },
          uShow: { value: 1 },
          uMode: { value: 0 },
          uAberr: { value: 0 },
          uFreq: { value: new THREE.Vector3(1.0, 1.35, 1.7) },
          uBase: { value: 0 },
          uPal: { value: [C.cyan, C.magenta, C.violet, C.yellow, C.green, C.red].map((h) => raw(h)) },
        },
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  const U = mat.uniforms as {
    uStrip: { value: THREE.Texture | null };
    uStripAspect: { value: number };
    uTime: { value: number };
    uRes: { value: THREE.Vector2 };
    uRows: { value: number };
    uLens: { value: THREE.Vector2 };
    uRadius: { value: number };
    uShow: { value: number };
    uMode: { value: number };
    uAberr: { value: number };
    uFreq: { value: THREE.Vector3 };
    uBase: { value: number };
  };

  useEffect(() => {
    U.uStrip.value = strip;
    U.uStripAspect.value = stripAspect;
    invalidate();
  }, [strip, stripAspect, U, invalidate]);

  useEffect(() => {
    U.uRes.value.set(size.width, size.height);
    U.uRows.value = Math.max(9, Math.round(size.height / 46));
    invalidate();
  }, [size, U, invalidate]);

  // GSAP scrubs the three per-channel frequencies, so the rim colours keep shifting
  useEffect(() => {
    if (reduced) return;
    const tl = gsap.timeline({ repeat: -1, yoyo: true, defaults: { duration: 3.2, ease: 'sine.inOut' } });
    tl.to(U.uFreq.value, { x: 1.6, y: 1.05, z: 2.3 }).to(U.uFreq.value, { x: 0.8, y: 1.9, z: 1.2 });
    return () => {
      tl.kill();
    };
  }, [reduced, U]);

  // mode change: shrink the lens, swap, grow back
  const shown = useRef(mode);
  useEffect(() => {
    const d = reduced ? 0 : 1;
    const tl = gsap.timeline({ onUpdate: invalidate, onComplete: invalidate });
    tl.to(live, { show: 0, duration: 0.35 * d, ease: 'power2.in' })
      .add(() => {
        shown.current = mode;
        U.uMode.value = mode;
      })
      .to(U.uBase, { value: mode === 1 || mode === 2 ? 1 : 0, duration: 0.5 * d, ease: 'power2.inOut' }, '<')
      .to(live, { show: 1, duration: 0.8 * d, ease: 'elastic.out(1, 0.6)' });
    if (d === 0) tl.progress(1);
    return () => {
      tl.kill();
    };
  }, [mode, reduced, live, U, invalidate]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (!reduced) {
      U.uTime.value += Math.min(dt, 0.05);
      if (!live.inside) {
        // autopilot: a slow lissajous so the lens is never parked
        live.tx = 0.5 + Math.sin(t * 0.42) * 0.24;
        live.ty = 0.5 + Math.sin(t * 0.61 + 1.2) * 0.2;
      }
      live.x += (live.tx - live.x) * 0.075;
      live.y += (live.ty - live.y) * 0.075;
      live.aberr *= 0.94;
      live.hover += ((live.inside ? 1 : 0) - live.hover) * 0.06;
    }
    const narrow = size.width < size.height;
    live.radius = (narrow ? 0.2 : 0.27) * (1 + 0.18 * live.hover);
    U.uLens.value.set(live.x, live.y);
    U.uRadius.value = live.radius;
    U.uShow.value = shown.current === 3 ? 0 : live.show;
    U.uAberr.value = Math.min(0.3, live.aberr);
  });

  return (
    <>
      <mesh frustumCulled={false} renderOrder={-1} material={mat}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      {mode === 3 && <Disc lens={live} reduced={reduced} />}
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 3, 4]} intensity={1.5} />
    </>
  );
}

function useStrip() {
  const [strip, setStrip] = useState<{ tex: THREE.Texture; aspect: number } | null>(null);
  useEffect(() => {
    let dead = false;
    let tex: THREE.CanvasTexture | null = null;
    const probe = document.createElement('span');
    probe.className = 'font-display';
    probe.style.cssText = 'position:absolute;visibility:hidden';
    document.body.appendChild(probe);
    const family = getComputedStyle(probe).fontFamily || 'Georgia, serif';
    probe.remove();
    const H = 128;
    const size = 84;
    const fonts = [`400 ${size}px ${family}`, `italic 400 ${size}px ${family}`, `400 ${size}px ${family}`];
    Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null)))
      .catch(() => null)
      .then(() => {
        if (dead) return;
        const m = document.createElement('canvas').getContext('2d')!;
        // one repeat unit per line, then the canvas is as wide as the widest line x repeats
        const units = LINES.map((l, i) => {
          m.font = fonts[i];
          return { text: l + '   ·   ', w: m.measureText(l + '   ·   ').width };
        });
        const W = 2048;
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H * 3;
        const ctx = cv.getContext('2d')!;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H * 3);
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        units.forEach((u, i) => {
          ctx.font = fonts[i];
          // scale each line so a whole number of repeats fills the width: the strip tiles seamlessly
          const reps = Math.max(1, Math.round(W / u.w));
          const sx = W / (reps * u.w);
          ctx.save();
          ctx.translate(0, H * i + H * 0.55);
          ctx.scale(sx, 1);
          for (let k = 0; k < reps; k++) ctx.fillText(u.text, k * u.w, 0);
          ctx.restore();
        });
        tex = new THREE.CanvasTexture(cv);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.anisotropy = 8;
        tex.needsUpdate = true;
        setStrip({ tex, aspect: W / H });
      });
    return () => {
      dead = true;
      tex?.dispose();
    };
  }, []);
  return strip;
}

export default function LiquidLens({ active, reducedMotion, progress }: ExperienceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState(0);
  const strip = useStrip();
  const live = useMemo<Live>(() => ({ x: 0.62, y: 0.5, tx: 0.62, ty: 0.5, show: 1, radius: 0.26, aberr: 0, hover: 0, inside: false }), []);

  // progress: sweep the lens across and step through the modes
  useEffect(() => {
    if (progress === undefined) return;
    setMode(Math.min(3, Math.floor(progress * 4)));
  }, [progress]);

  // scroll velocity raises the aberration
  useEffect(() => {
    if (reducedMotion) return;
    let lastY = window.scrollY;
    const onScroll = () => {
      live.aberr += Math.abs(window.scrollY - lastY) * 0.002;
      lastY = window.scrollY;
    };
    const host = hostRef.current;
    const onWheel = (e: WheelEvent) => (live.aberr += Math.abs(e.deltaY) * 0.0015);
    window.addEventListener('scroll', onScroll, { passive: true });
    host?.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      host?.removeEventListener('wheel', onWheel);
    };
  }, [reducedMotion, live]);

  const onMove = (e: React.PointerEvent) => {
    if (reducedMotion) return;
    const b = hostRef.current!.getBoundingClientRect();
    live.tx = (e.clientX - b.left) / b.width;
    live.ty = 1 - (e.clientY - b.top) / b.height;
    live.inside = true;
  };

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full touch-pan-y overflow-hidden bg-[#080808] select-none"
      onPointerMove={onMove}
      onPointerLeave={() => (live.inside = false)}
    >
      <Canvas
        className="!absolute inset-0"
        linear
        flat
        dpr={[1, 1.75]}
        frameloop={active && !reducedMotion ? 'always' : 'demand'}
        camera={{ fov: 35, position: [0, 0, 6] }}
        gl={{ antialias: true }}
      >
        <Scene mode={mode} reduced={reducedMotion} live={live} strip={strip?.tex ?? null} stripAspect={strip?.aspect ?? 16} />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
        <CornerLabel title="Liquid Lens" tools={['threejs', 'r3f', 'drei', 'glsl', 'gsap']} tone="colour" />
        <Cycler name="lens" value={MODES[mode]} onPrev={() => setMode((m) => (m + 3) % 4)} onNext={() => setMode((m) => (m + 1) % 4)} />
      </div>
    </div>
  );
}
