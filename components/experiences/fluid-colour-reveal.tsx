'use client';

/*
 * Fluid Colour Reveal: one poster drawn twice. The colour version is painted in Canvas2D (bold COLOUR
 * type and flat shapes); the black and white version is the same texture pushed through luminance and a
 * 4x4 Bayer dither in the display shader. A ping-pong mask (two half-float render targets) holds where
 * colour shows: every frame it is advected a little by curl-ish noise (so it swirls like ink), softened,
 * healed by a fixed amount (gone in about 3 s) and stamped with a capsule from the brush's last position
 * to its new one. Idle: a ghost cursor paints. With progress defined, a band sweeps across instead.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner, GLSL_NOISE, useCanvasFonts } from './g3-kit';

const TOOLS = ['r3f', 'threejs', 'glsl'];
const HEAL = 0.34; // mask units per second; the brush writes 1.2, the reveal ends near 0.3: about 3 s

/* ───────────────────────── poster ───────────────────────── */

const C = {
  bg: '#1f24ff',
  pink: '#ff2fa8',
  yellow: '#ffe14a',
  green: '#16e08a',
  orange: '#ff5a1f',
  cyan: '#39c6ff',
  white: '#fbf7ee',
  ink: '#0b0b12',
};

function drawPoster(w: number, h: number, family: string) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const s = Math.min(w, h);
  const portrait = h > w * 1.15;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, w, h);

  // big disc, top left
  g.fillStyle = C.pink;
  g.beginPath();
  g.arc(w * 0.16, h * (portrait ? 0.16 : 0.2), s * 0.3, 0, Math.PI * 2);
  g.fill();

  // ring, top right
  g.strokeStyle = C.cyan;
  g.lineWidth = s * 0.035;
  g.beginPath();
  g.arc(w * 0.66, h * (portrait ? 0.14 : 0.18), s * 0.11, 0, Math.PI * 2);
  g.stroke();

  // triangle
  g.fillStyle = C.green;
  const tx = w * 0.86;
  const ty = h * (portrait ? 0.26 : 0.24);
  const ts = s * 0.2;
  g.beginPath();
  g.moveTo(tx, ty - ts);
  g.lineTo(tx + ts * 0.9, ty + ts * 0.6);
  g.lineTo(tx - ts * 0.9, ty + ts * 0.6);
  g.closePath();
  g.fill();

  // half disc rising from the bottom right
  g.fillStyle = C.yellow;
  g.beginPath();
  g.arc(w * 0.84, h, s * 0.36, Math.PI, Math.PI * 2);
  g.fill();

  // striped block, bottom left
  const bx = w * 0.06;
  const by = h * (portrait ? 0.7 : 0.72);
  const bw = w * (portrait ? 0.46 : 0.34);
  const bh = h * (portrait ? 0.2 : 0.2);
  g.save();
  g.beginPath();
  g.rect(bx, by, bw, bh);
  g.clip();
  g.fillStyle = C.ink;
  g.fillRect(bx, by, bw, bh);
  g.strokeStyle = C.orange;
  g.lineWidth = s * 0.028;
  for (let x = -bh; x < bw + bh; x += s * 0.06) {
    g.beginPath();
    g.moveTo(bx + x, by + bh);
    g.lineTo(bx + x + bh, by);
    g.stroke();
  }
  g.restore();

  // dot grid
  g.fillStyle = C.white;
  const cols = 6;
  const rows = 4;
  const gx = w * (portrait ? 0.58 : 0.46);
  const gy = h * (portrait ? 0.74 : 0.76);
  const step = s * 0.045;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      g.beginPath();
      g.arc(gx + i * step, gy + j * step, step * 0.22, 0, Math.PI * 2);
      g.fill();
    }

  // the word, one colour per letter, with a hard offset shadow
  const word = 'COLOUR';
  const inks = [C.yellow, C.white, C.cyan, C.green, C.pink, C.orange];
  let size = 200;
  g.font = `900 ${size}px ${family}`;
  const fit = (w * 0.9) / g.measureText(word).width;
  size = Math.floor(size * fit);
  g.font = `900 ${size}px ${family}`;
  g.textBaseline = 'middle';
  const total = g.measureText(word).width;
  let x = (w - total) / 2;
  const y = h * 0.5;
  const off = Math.max(2, size * 0.05);
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    const cw = g.measureText(ch).width;
    g.fillStyle = C.ink;
    g.fillText(ch, x + off, y + off);
    g.fillStyle = inks[i];
    g.fillText(ch, x, y);
    x += cw;
  }

  // small caption under the word
  g.font = `700 ${Math.max(11, Math.round(size * 0.12))}px ${family}`;
  g.fillStyle = C.white;
  g.textAlign = 'center';
  g.fillText('ARRIVES LAST, ON PURPOSE', w / 2, y + size * 0.62);
  return cv;
}

/* ───────────────────────── shaders ───────────────────────── */

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const maskFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uDt;
uniform float uTime;
uniform float uAspect;
uniform float uHeal;
uniform vec2 uA;
uniform vec2 uB;
uniform float uR;
uniform float uStrength;
uniform float uBandX;
uniform float uBandOn;
${GLSL_NOISE}
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
void main() {
  vec2 q = vUv * vec2(uAspect, 1.0) * 2.4;
  float t = uTime * 0.22;
  // a cheap swirl: two noise fields make a drift vector, so the ink curls instead of fading in place
  vec2 drift = vec2(snoise(vec3(q, t)), snoise(vec3(q + 17.3, t)));
  vec2 uv = vUv - drift * uTexel * 0.5 * (uDt * 60.0);
  float m = texture2D(uPrev, uv).r * 0.6
    + (texture2D(uPrev, uv + vec2(uTexel.x, 0.0)).r + texture2D(uPrev, uv - vec2(uTexel.x, 0.0)).r
     + texture2D(uPrev, uv + vec2(0.0, uTexel.y)).r + texture2D(uPrev, uv - vec2(0.0, uTexel.y)).r) * 0.1;
  m -= uHeal * uDt;
  vec2 p = vUv * vec2(uAspect, 1.0);
  float d = segDist(p, uA * vec2(uAspect, 1.0), uB * vec2(uAspect, 1.0));
  m = max(m, exp(-(d * d) / (uR * uR)) * 1.2 * uStrength);
  if (uBandOn > 0.5) {
    float wob = snoise(vec2(vUv.y * 2.5, uTime * 0.3)) * 0.05;
    float band = 1.0 - smoothstep(0.03, 0.11, abs(vUv.x - uBandX + wob));
    m = max(m, band * 1.2);
  }
  gl_FragColor = vec4(clamp(m, 0.0, 1.2), 0.0, 0.0, 1.0);
}`;

const displayFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uArt;
uniform sampler2D uMask;
uniform float uTime;
uniform float uStill;
uniform float uAspect;
uniform float uPx;
${GLSL_NOISE}
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  vec3 col = texture2D(uArt, vUv).rgb;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  l = clamp((l - 0.45) * 1.35 + 0.5, 0.0, 1.0);
  float th = bayer4(gl_FragCoord.xy / uPx);
  float q = floor(l * 3.0 + th) / 3.0;
  vec3 mono = mix(vec3(0.031), vec3(0.96), q);

  float m;
  if (uStill > 0.5) {
    // reduced motion: one composed diagonal pour of colour, fixed
    float s = vUv.x * uAspect * 0.62 + vUv.y * 0.78;
    float c = (uAspect * 0.62 + 0.78) * 0.5;
    m = 1.2 * (1.0 - smoothstep(0.1, 0.2, abs(s - c + 0.05 * sin(vUv.y * 11.0))));
  } else {
    m = texture2D(uMask, vUv).r;
  }
  float n = snoise(vec3(vUv * vec2(uAspect, 1.0) * 6.0, uTime * 0.35)) * 0.1;
  float e = m + n;
  float r = smoothstep(0.3, 0.5, e);
  float rim = smoothstep(0.2, 0.3, e) * (1.0 - smoothstep(0.3, 0.46, e));
  vec3 outc = mix(mono, col, r);
  outc = mix(outc, vec3(1.0, 0.97, 0.9), rim * 0.55);
  gl_FragColor = vec4(outc, 1.0);
}`;

/* ───────────────────────── scene ───────────────────────── */

type Brush = { x: number; y: number; inside: boolean; lastMove: number };

function makeTarget(w: number, h: number) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
}

function Reveal({
  active,
  reduced,
  progress,
  art,
  brush,
  ghost,
}: {
  active: boolean;
  reduced: boolean;
  progress?: number;
  art: HTMLCanvasElement;
  brush: React.MutableRefObject<Brush>;
  ghost: React.RefObject<HTMLDivElement | null>;
}) {
  const { gl, size, invalidate, viewport } = useThree();
  const prog = useRef(progress);
  prog.current = progress;

  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(art);
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }, [art]);
  useEffect(() => () => tex.dispose(), [tex]);

  const aspect = size.width / Math.max(1, size.height);
  const sim = useMemo(() => {
    const long = 256;
    const w = aspect >= 1 ? long : Math.max(32, Math.round(long * aspect));
    const h = aspect >= 1 ? Math.max(32, Math.round(long / aspect)) : long;
    const mat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: maskFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrev: { value: null },
        uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
        uDt: { value: 0.016 },
        uTime: { value: 0 },
        uAspect: { value: aspect },
        uHeal: { value: HEAL },
        uA: { value: new THREE.Vector2(-1, -1) },
        uB: { value: new THREE.Vector2(-1, -1) },
        uR: { value: 0.06 },
        uStrength: { value: 0 },
        uBandX: { value: -1 },
        uBandOn: { value: 0 },
      },
    });
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    scene.add(quad);
    const ping = { a: makeTarget(w, h), b: makeTarget(w, h) };
    return { mat, scene, quad, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), ping, fresh: true };
    // rebuild only on a real change of shape
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.round(aspect * 20)]);
  useEffect(
    () => () => {
      sim.mat.dispose();
      sim.quad.geometry.dispose();
      sim.ping.a.dispose();
      sim.ping.b.dispose();
    },
    [sim],
  );

  const display = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: quadVert,
        fragmentShader: displayFrag,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uArt: { value: null },
          uMask: { value: null },
          uTime: { value: 0 },
          uStill: { value: 0 },
          uAspect: { value: 1 },
          uPx: { value: 2 },
        },
      }),
    [],
  );
  useEffect(() => () => display.dispose(), [display]);

  // Under 'demand' (reduced motion) an invalidate before the first compile can be dropped: keep asking
  // for a few frames after mount and after any change that alters the still.
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
  }, [active, reduced, tex, sim, invalidate]);

  const clock = useRef({ t: 0, w: 0, bx: 0.5, by: 0.5, has: false });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const U = display.uniforms;
    U.uArt.value = tex;
    U.uAspect.value = aspect;
    U.uPx.value = 2 * viewport.dpr;
    U.uStill.value = reduced ? 1 : 0;

    if (sim.fresh) {
      // start from a clean mask
      sim.fresh = false;
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(sim.ping.a);
      gl.setClearColor(0x000000, 1);
      gl.clear();
      gl.setRenderTarget(sim.ping.b);
      gl.clear();
      gl.setRenderTarget(prev);
    }

    if (reduced) {
      U.uTime.value = 0;
      U.uMask.value = sim.ping.a.texture;
      if (ghost.current) ghost.current.style.opacity = '0';
      return;
    }

    const c = clock.current;
    c.t += dt;
    const b = brush.current;
    const driven = prog.current !== undefined;
    const idle = !b.inside || performance.now() - b.lastMove > 1600;
    // ghost weight eases in when nobody paints (not when the page drives a band)
    c.w += ((idle && !driven ? 1 : 0) - c.w) * (1 - Math.exp(-dt / 0.3));
    const t = c.t;
    const gx = 0.5 + 0.36 * Math.sin(t * 0.83) * Math.cos(t * 0.29);
    const gy = 0.5 + 0.3 * Math.sin(t * 0.61 + 1.1);
    let tx: number;
    let ty: number;
    let strength: number;
    if (!idle) {
      tx = b.x;
      ty = b.y;
      strength = 1;
    } else {
      tx = gx;
      ty = gy;
      strength = c.w;
    }
    if (!c.has) {
      c.bx = tx;
      c.by = ty;
      c.has = true;
    }
    const speed = Math.hypot((tx - c.bx) * aspect, ty - c.by) / dt;
    const M = sim.mat.uniforms;
    M.uA.value.set(c.bx, c.by);
    M.uB.value.set(tx, ty);
    // a jump (pointer re-entering, ghost handing over) should not paint a long stripe
    const jump = Math.hypot((tx - c.bx) * aspect, ty - c.by) > 0.25;
    if (jump) M.uA.value.set(tx, ty);
    M.uR.value = 0.05 + Math.min(speed, 3) * 0.018;
    M.uStrength.value = strength;
    c.bx = tx;
    c.by = ty;
    M.uDt.value = dt;
    M.uTime.value = t;
    M.uAspect.value = aspect;
    M.uBandOn.value = driven ? 1 : 0;
    M.uBandX.value = -0.18 + 1.36 * Math.min(1, Math.max(0, prog.current ?? 0));

    M.uPrev.value = sim.ping.a.texture;
    sim.quad.material = sim.mat;
    gl.setRenderTarget(sim.ping.b);
    gl.render(sim.scene, sim.cam);
    gl.setRenderTarget(null);
    const tmp = sim.ping.a;
    sim.ping.a = sim.ping.b;
    sim.ping.b = tmp;

    U.uMask.value = sim.ping.a.texture;
    U.uTime.value = t;

    const gh = ghost.current;
    if (gh) {
      gh.style.opacity = String(idle && !driven ? c.w : 0);
      gh.style.transform = `translate3d(${gx * size.width}px, ${(1 - gy) * size.height}px, 0)`;
    }
  });

  return (
    <mesh frustumCulled={false} material={display}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

/* ───────────────────────── root ───────────────────────── */

export default function FluidColourReveal({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const brush = useRef<Brush>({ x: 0.5, y: 0.5, inside: false, lastMove: -1e9 });
  const fonts = useCanvasFonts();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [art, setArt] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let t = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = window.setTimeout(() => setBox({ w: el.clientWidth, h: el.clientHeight }), 120);
    });
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, []);

  // the poster is drawn at the container's shape, at up to 1.5x, never above 2048 on its long side
  useEffect(() => {
    if (!fonts || box.w < 2 || box.h < 2) return;
    const k = Math.min(1.5, window.devicePixelRatio || 1, 2048 / Math.max(box.w, box.h));
    setArt(drawPoster(Math.round(box.w * k), Math.round(box.h * k), fonts.sans));
  }, [fonts, box.w, box.h]);

  const move = (e: React.PointerEvent) => {
    const r = host.current!.getBoundingClientRect();
    const b = brush.current;
    b.x = (e.clientX - r.left) / r.width;
    b.y = 1 - (e.clientY - r.top) / r.height;
    b.inside = true;
    b.lastMove = performance.now();
  };

  return (
    <div
      ref={host}
      className="relative h-full w-full touch-pan-y select-none overflow-hidden bg-[#080808]"
      onPointerMove={reducedMotion ? undefined : move}
      onPointerDown={reducedMotion ? undefined : move}
      onPointerLeave={() => (brush.current.inside = false)}
    >
      {art && (
        <Canvas
          flat
          dpr={[1, 1.5]}
          frameloop={!active ? 'never' : reducedMotion ? 'demand' : 'always'}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <Reveal active={active} reduced={reducedMotion} progress={progress} art={art} brush={brush} ghost={ghost} />
        </Canvas>
      )}
      {/* ghost cursor: a brush ring that paints while nobody else does */}
      <div
        ref={ghost}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 -mt-[11px] -ml-[11px] h-[22px] w-[22px] rounded-full border-2 border-white/90 opacity-0 mix-blend-difference"
      />
      <Corner title="Fluid Colour Reveal" tools={TOOLS} />
      <p className="pixel pointer-events-none absolute right-3 bottom-3 max-w-[calc(100%-24px)] bg-[var(--v-bg)]/85 px-2 py-1 text-[16px] leading-[16px] text-[var(--v-soft)]">
        {reducedMotion ? 'still: colour under black and white' : 'move to paint colour · it heals in 3s'}
      </p>
    </div>
  );
}
