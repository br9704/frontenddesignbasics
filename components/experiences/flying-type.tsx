'use client';

/*
 * Flying Type: four mono type beats in one WebGL context.
 *  01 glitch title  (Day 001): word baked 3x into a canvas (wide blur, soft blur, sharp) → domain-warped
 *                   snoise tears it sideways; GSAP tweens the glitch from 1 to a calm residue on enter.
 *  02 liquid warp   (Day 006): thin caps, uv.y += amp*0.25*snoise(x*2, y*4); three offset taps.
 *  03 echo          (Day 014): three planes (sharp, 8px, 16px blur) staggered back in z, mouse parallax.
 *  04 marquee melt  (Day 023): tilted bands wrap in x; a noise-warped seam window melts and snaps back.
 * Scroll / wheel / pointer speed (and a global Lenis, if the page has one) feed the warp and marquee.
 * The beat caption decodes centre-out with ░▒▓█.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner, decodeAt, GLSL_NOISE, useCanvasFonts, useEnergy, type Energy } from './g3-kit';

gsap.registerPlugin(ScrambleTextPlugin);

const TOOLS = ['r3f', 'drei', 'glsl', 'gsap', 'lenis', 'canvas2d'];
const BEAT = 5.2; // seconds per beat
const BEATS = [
  { head: '01 / GLITCH TITLE', sub: 'arrives torn, resolves clean' },
  { head: '02 / LIQUID CAPS', sub: 'scroll fast and the line bends' },
  { head: '03 / ECHO', sub: 'move the mouse, the depth follows' },
  { head: '04 / MARQUEE MELT', sub: 'the seam melts, then snaps back' },
];

type Fonts = { sans: string; display: string; mono: string; pixel: string };

/* ───────────── canvas textures ───────────── */

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  if (repeat) t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

function buildTextures(f: Fonts) {
  // 01: glitch title with baked glow (three passes).
  const title = canvasTex(2048, 768, (ctx) => {
    ctx.font = `800 330px ${f.sans}`;
    ctx.letterSpacing = '24px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    const pass = (blur: number, alpha: number) => {
      ctx.filter = blur ? `blur(${blur}px)` : 'none';
      ctx.globalAlpha = alpha;
      ctx.fillText('FLYING', 1024, 400);
    };
    pass(80, 0.55);
    pass(6, 0.65);
    pass(0, 1);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  });

  // 02: thin caps line.
  const warp = canvasTex(2048, 420, (ctx) => {
    ctx.font = `200 150px ${f.display}`;
    ctx.letterSpacing = '22px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('LOSE CONTROL', 1024, 215);
  });

  // 03: echo, pre-blurred at 0 / 8 / 16 px (x2 for the big canvas).
  const echo = [0, 16, 32].map((b) =>
    canvasTex(2048, 900, (ctx) => {
      ctx.font = `italic 400 520px ${f.display}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.filter = b ? `blur(${b}px)` : 'none';
      ctx.fillText('echo', 1024, 430);
      ctx.filter = 'none';
    }),
  );

  // 04: marquee bands, sized to exactly two repeats of the phrase so the wrap is seamless.
  const band = (word: string, solid: boolean) => {
    const m = document.createElement('canvas').getContext('2d')!;
    m.font = `900 170px ${f.sans}`;
    m.letterSpacing = '4px';
    const w = Math.ceil(m.measureText(word).width);
    return canvasTex(
      w * 2,
      256,
      (ctx) => {
        if (solid) {
          ctx.fillStyle = '#f5f5f5';
          ctx.fillRect(0, 0, w * 2, 256);
        }
        ctx.font = `900 170px ${f.sans}`;
        ctx.letterSpacing = '4px';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#080808';
        ctx.strokeStyle = '#f5f5f5';
        ctx.lineWidth = 3;
        for (const x of [0, w]) {
          if (solid) ctx.fillText(word, x, 140);
          else ctx.strokeText(word, x, 140);
        }
      },
      true,
    );
  };
  const bandA = band('TYPE IN MOTION / ', true);
  const bandB = band('SCROLL FASTER / ', false);
  return { title, warp, echo, bandA, bandB };
}

/* ───────────── shaders ───────────── */

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const GLITCH_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uScale;
uniform float uTime, uGlitch, uFade, uEnergy;
varying vec2 vUv;
${GLSL_NOISE}
float edgeMask(vec2 tuv) {
  return smoothstep(0.0, 0.03, tuv.x) * smoothstep(1.0, 0.97, tuv.x) * smoothstep(0.0, 0.03, tuv.y) * smoothstep(1.0, 0.97, tuv.y);
}
float sampleText(vec2 tuv) {
  if (tuv.x < 0.0 || tuv.x > 1.0 || tuv.y < 0.0 || tuv.y > 1.0) return 0.0;
  return texture2D(uTex, tuv).r * edgeMask(tuv);
}
void main() {
  vec2 tuv = (vUv - 0.5) * uScale + 0.5;
  float t = uTime;
  float amp = uGlitch + uEnergy * 0.5 + 0.04;
  // domain-warped noise, stretched: long horizontal tears (Day 001)
  vec2 q = vec2(tuv.x * 2.0, tuv.y * 10.0);
  float w = snoise(q * 0.35 + vec2(t * 0.15, -t * 0.4));
  float n = snoise(q + vec2(w * 1.8, -t * 1.3));
  n = pow(smoothstep(0.3, 1.0, n) * 0.8 + 0.2 * step(0.3, n) * uGlitch, 3.0);
  // hard slices that flicker in steps, only while glitching
  float row = floor(tuv.y * 38.0);
  float slice = step(0.9, hash12(vec2(row, floor(t * 7.0)))) * (hash12(vec2(row, 3.1)) - 0.5) * smoothstep(0.08, 0.5, amp);
  tuv.x += (0.2 * n + slice * 0.22) * amp;
  float a = sampleText(tuv);
  // ghost copy trailing the tear
  float ghost = sampleText(tuv + vec2(0.05 * n * amp, 0.0)) * 0.35 * min(1.0, amp * 2.0);
  float lum = smoothstep(0.015, 1.0, max(a, ghost));
  float grain = hash12(gl_FragCoord.xy + fract(t) * 97.0);
  lum += (1.0 - lum) * grain * 0.07;
  gl_FragColor = vec4(vec3(1.0), lum * uFade);
}
`;

const WARP_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uScale;
uniform float uTime, uAmp, uFade;
varying vec2 vUv;
${GLSL_NOISE}
float tap(vec2 p) {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
  float m = smoothstep(0.0, 0.03, p.x) * smoothstep(1.0, 0.97, p.x) * smoothstep(0.0, 0.05, p.y) * smoothstep(1.0, 0.95, p.y);
  return texture2D(uTex, p).r * m;
}
void main() {
  vec2 tuv = (vUv - 0.5) * uScale + 0.5;
  float t = uTime * 0.6;
  float n = snoise(vec2(tuv.x * 2.0 + t * 0.4, tuv.y * 4.0 + t));
  float n2 = snoise(vec2(tuv.x * 5.0 - t, tuv.y * 2.0));
  tuv.y += uAmp * 0.25 * n;
  tuv.x += uAmp * 0.03 * n2;
  float s = 1.0 + uAmp * 2.5;
  float r = tap(tuv + vec2(0.002 * s, 0.0));
  float g = tap(tuv + vec2(-0.001 * s, 0.0));
  float b = tap(tuv + vec2(-0.002 * s, 0.0));
  // mono stage: the split shows as grey ghosts, not colour
  float lum = max(g, max(r * 0.55, b * 0.3));
  lum = smoothstep(0.03, 0.9, lum);
  gl_FragColor = vec4(vec3(1.0), lum * uFade);
}
`;

const ECHO_VERT = /* glsl */ `
uniform float uTime, uDepth;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  p.x += sin(uv.y * 14.0 + uTime * 2.2) * 0.02 * uDepth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;
const ECHO_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uTime, uOpacity, uDepth;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  uv.x += sin(uv.y * 22.0 + uTime * 3.0) * 0.004 * uDepth;
  float a = texture2D(uTex, uv).r;
  gl_FragColor = vec4(vec3(0.96), a * uOpacity);
}
`;

const BAND_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uTime, uShift, uMelt, uFade, uRepeat, uSolid;
varying vec2 vUv;
${GLSL_NOISE}
void main() {
  vec2 uv = vUv;
  // seam window near the middle, wandering on noise
  float cx = 0.5 + 0.12 * snoise(vec2(uTime * 0.21, uSolid * 3.0));
  float win = smoothstep(0.16, 0.0, abs(uv.x - cx + 0.05 * snoise(vec2(uv.y * 3.0, uTime))));
  float n = snoise(vec2(uv.x * 9.0, uv.y * 2.0 - uTime * 1.4));
  uv.y += win * uMelt * 0.55 * n;
  uv.x += win * uMelt * 0.05 * snoise(vec2(uv.y * 6.0, uTime));
  vec2 s = vec2(uv.x * uRepeat + uShift, clamp(uv.y, 0.0, 1.0));
  vec3 c = texture2D(uTex, s).rgb;
  float edge = step(0.0, uv.y) * step(uv.y, 1.0);
  float a = uSolid > 0.5 ? edge : c.r * edge;
  gl_FragColor = vec4(c, a * uFade);
}
`;

/* ───────────── scene ───────────── */

function fadeFor(local: number) {
  // in over 0.7 s, out over the last 0.6 s of the beat
  return Math.min(1, local / 0.7, (BEAT - local) / 0.6);
}

function Scene({
  tex,
  active,
  reduced,
  progress,
  energy,
  step,
  pointer,
  onBeat,
}: {
  tex: ReturnType<typeof buildTextures>;
  active: boolean;
  reduced: boolean;
  progress?: number;
  energy: RefObject<Energy>;
  step: (dt: number) => number;
  pointer: RefObject<{ x: number; y: number }>;
  onBeat: (b: number) => void;
}) {
  const { viewport, invalidate } = useThree();
  const vw = viewport.width;
  const vh = viewport.height;

  const title = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: GLITCH_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTex: { value: tex.title },
          uScale: { value: new THREE.Vector2(1, 1) },
          uTime: { value: 0 },
          uGlitch: { value: 1 },
          uFade: { value: 1 },
          uEnergy: { value: 0 },
        },
      }),
    [tex],
  );
  const warp = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: WARP_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTex: { value: tex.warp },
          uScale: { value: new THREE.Vector2(1, 1) },
          uTime: { value: 0 },
          uAmp: { value: 0.1 },
          uFade: { value: 0 },
        },
      }),
    [tex],
  );
  const echoes = useMemo(
    () =>
      tex.echo.map(
        (t, i) =>
          new THREE.ShaderMaterial({
            vertexShader: ECHO_VERT,
            fragmentShader: ECHO_FRAG,
            transparent: true,
            depthWrite: false,
            uniforms: {
              uTex: { value: t },
              uTime: { value: 0 },
              uOpacity: { value: 0 },
              uDepth: { value: i },
            },
          }),
      ),
    [tex],
  );
  const bands = useMemo(
    () =>
      [tex.bandA, tex.bandB].map(
        (t, i) =>
          new THREE.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: BAND_FRAG,
            transparent: true,
            depthWrite: false,
            uniforms: {
              uTex: { value: t },
              uTime: { value: 0 },
              uShift: { value: 0 },
              uMelt: { value: 0 },
              uFade: { value: 0 },
              uRepeat: { value: 1 },
              uSolid: { value: i === 0 ? 1 : 0 },
            },
          }),
      ),
    [tex],
  );
  useEffect(
    () => () => {
      title.dispose();
      warp.dispose();
      echoes.forEach((m) => m.dispose());
      bands.forEach((m) => m.dispose());
    },
    [title, warp, echoes, bands],
  );

  // text rects in world units, fitted to the viewport (works at 16:10, full screen and 390 px)
  const titleW = Math.min(vw * 0.92, vh * 0.62 * (2048 / 768));
  const titleH = titleW * (768 / 2048);
  const warpW = Math.min(vw * 0.94, vh * 0.5 * (2048 / 420));
  const warpH = warpW * (420 / 2048);
  const echoW = Math.min(vw * 0.8, vh * 0.66 * (2048 / 900));
  const echoH = echoW * (900 / 2048);
  const bandH = Math.min(vh * 0.2, vw * 0.16);
  const bandW = Math.hypot(vw, vh) * 1.15;
  title.uniforms.uScale.value.set(vw / titleW, vh / titleH);
  warp.uniforms.uScale.value.set(vw / warpW, vh / warpH);
  bands.forEach((m) => {
    const img = (m.uniforms.uTex.value as THREE.Texture).image as HTMLCanvasElement;
    m.uniforms.uRepeat.value = bandW / (bandH * (img.width / img.height));
  });

  const echoRefs = useRef<(THREE.Mesh | null)[]>([]);
  const state = useRef({ t: 0, beat: -1, parX: 0, parY: 0, shiftA: 0, shiftB: 0 });

  // Enter a beat: GSAP drives the glitch amplitude and the echo stagger.
  const enterBeat = (b: number) => {
    if (b === 0) {
      gsap.fromTo(title.uniforms.uGlitch, { value: 1 }, { value: 0, duration: 2.2, ease: 'expo.out', overwrite: true });
    }
    if (b === 2) {
      const targets = [0, -0.6, -1.1];
      echoRefs.current.forEach((m, i) => {
        if (!m) return;
        gsap.fromTo(m.position, { z: 0 }, { z: targets[i], duration: 1.4, delay: 0.15 + i * 0.18, ease: 'expo.out', overwrite: true });
      });
    }
  };

  // Reduced motion: one composed still (beat 01, calm glitch residue).
  useEffect(() => {
    if (!reduced) return;
    // stop any enter tween that began before reduced motion was known
    gsap.killTweensOf(title.uniforms.uGlitch);
    echoRefs.current.forEach((m) => m && gsap.killTweensOf(m.position));
    title.uniforms.uGlitch.value = 0.0;
    title.uniforms.uTime.value = 2.4;
    title.uniforms.uFade.value = 1;
    warp.uniforms.uFade.value = 0;
    echoes.forEach((m) => (m.uniforms.uOpacity.value = 0));
    bands.forEach((m) => (m.uniforms.uFade.value = 0));
    onBeat(0);
    invalidate();
  }, [reduced, title, warp, echoes, bands, invalidate, onBeat, vw, vh]);

  useFrame((_, rawDt) => {
    if (reduced) return;
    const dt = Math.min(rawDt, 1 / 20);
    const s = state.current;
    const e = step(dt);
    s.t += active ? dt : 0;

    let beat: number;
    let local: number;
    if (progress !== undefined) {
      const p = Math.min(0.9999, Math.max(0, progress)) * 4;
      beat = Math.floor(p);
      local = 0.7 + (p - beat) * (BEAT - 1.4); // stay inside the fully-visible part
    } else {
      const cyc = s.t % (BEAT * 4);
      beat = Math.floor(cyc / BEAT);
      local = cyc - beat * BEAT;
    }
    if (beat !== s.beat) {
      s.beat = beat;
      onBeat(beat);
      enterBeat(beat);
    }
    const f = progress !== undefined ? 1 : fadeFor(local);
    const t = s.t;

    // pointer parallax, eased
    s.parX += (pointer.current.x - s.parX) * Math.min(1, dt * 4);
    s.parY += (pointer.current.y - s.parY) * Math.min(1, dt * 4);

    title.uniforms.uTime.value = t;
    title.uniforms.uEnergy.value = e + Math.pow(Math.max(0, Math.sin(t * 1.6)), 24) * 0.9;
    title.uniforms.uFade.value = beat === 0 ? f : 0;

    warp.uniforms.uTime.value = t;
    // idle breathing plus scroll/pointer energy
    warp.uniforms.uAmp.value = 0.1 + 0.16 * Math.sin(t * 0.8) ** 4 + Math.min(0.35, e * 0.45);
    warp.uniforms.uFade.value = beat === 1 ? f : 0;

    echoes.forEach((m, i) => {
      m.uniforms.uTime.value = t;
      m.uniforms.uOpacity.value = (beat === 2 ? f : 0) * [1, 0.5, 0.3][i];
      const mesh = echoRefs.current[i];
      if (mesh) {
        const k = [0.04, 0.22, 0.4][i];
        // echoes sit up and to the left, further with depth; the mouse swings them
        mesh.position.x = -s.parX * k * vw * 0.3 - i * vw * 0.035;
        mesh.position.y = -s.parY * k * vh * 0.25 + i * vh * 0.06;
      }
    });

    const speed = 0.05 + e * 0.35;
    s.shiftA += dt * speed * (energy.current.dir >= 0 ? 1 : -1);
    s.shiftB -= dt * speed * 0.8;
    const melt = Math.pow(Math.max(0, Math.sin(t * 1.3)), 3) * 0.8 + Math.min(0.8, e * 0.6);
    bands.forEach((m, i) => {
      m.uniforms.uTime.value = t;
      m.uniforms.uShift.value = i === 0 ? s.shiftA : s.shiftB;
      m.uniforms.uMelt.value = melt * (i === 0 ? 1 : 0.8);
      m.uniforms.uFade.value = beat === 3 ? f : 0;
    });
  });

  return (
    <>
      <mesh renderOrder={1}>
        <planeGeometry args={[vw, vh]} />
        <primitive object={title} attach="material" />
      </mesh>
      <mesh renderOrder={1}>
        <planeGeometry args={[vw, vh]} />
        <primitive object={warp} attach="material" />
      </mesh>
      {[2, 1, 0].map((i) => (
        <mesh
          key={i}
          ref={(m) => {
            echoRefs.current[i] = m;
          }}
          position={[0, 0, [0, -0.6, -1.1][i]]}
          renderOrder={2 + (2 - i)}
        >
          <planeGeometry args={[echoW, echoH, 1, 24]} />
          <primitive object={echoes[i]} attach="material" />
        </mesh>
      ))}
      <mesh rotation={[0, 0, 0.12]} position={[0, bandH * 0.45, 0]} renderOrder={6}>
        <planeGeometry args={[bandW, bandH, 1, 1]} />
        <primitive object={bands[0]} attach="material" />
      </mesh>
      <mesh rotation={[0, 0, -0.1]} position={[0, -bandH * 0.65, 0.01]} renderOrder={5}>
        <planeGeometry args={[bandW, bandH, 1, 1]} />
        <primitive object={bands[1]} attach="material" />
      </mesh>
    </>
  );
}

/* ───────────── caption ───────────── */

function Caption({ beat, reduced }: { beat: number; reduced: boolean }) {
  const head = useRef<HTMLParagraphElement>(null);
  const sub = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const { head: h, sub: s } = BEATS[beat];
    if (!head.current || !sub.current) return;
    if (reduced) {
      head.current.textContent = h;
      sub.current.textContent = s;
      return;
    }
    // centre-out decode for the heading (delay = |i - mid| * step)
    const o = { p: 0 };
    const el = head.current;
    const tw = gsap.to(o, {
      p: 1,
      duration: 1.1,
      ease: 'none',
      onUpdate: () => {
        el.textContent = decodeAt(h, o.p, beat * 3);
      },
    });
    const tw2 = gsap.to(sub.current, {
      duration: 1.2,
      delay: 0.35,
      scrambleText: { text: s, chars: '░▒▓█', revealDelay: 0.3, speed: 0.6 },
    });
    return () => {
      tw.kill();
      tw2.kill();
    };
  }, [beat, reduced]);
  return (
    <div className="pointer-events-none absolute top-3 right-3 z-20 text-right max-sm:top-[44px] max-sm:right-auto max-sm:left-3 max-sm:text-left">
      <p ref={head} className="pixel text-[16px] leading-[16px] whitespace-pre text-[var(--v-ink)]">
        {BEATS[beat].head}
      </p>
      <p ref={sub} className="pixel mt-1 text-[16px] leading-[16px] text-[var(--v-dim)]">
        {BEATS[beat].sub}
      </p>
      <p className="pixel mt-2 text-[16px] leading-[16px] text-[var(--v-dim)]" aria-hidden>
        {BEATS.map((_, i) => (
          <span key={i} className={i === beat ? 'text-[var(--v-ink)]' : ''}>
            {i === beat ? '█' : '░'}
          </span>
        ))}
      </p>
    </div>
  );
}

/* ───────────── root ───────────── */

export default function FlyingType({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const fonts = useCanvasFonts();
  const { energy, step } = useEnergy(host, active && !reducedMotion);
  const pointer = useRef({ x: 0, y: 0 });
  const [beat, setBeat] = useState(0);

  const tex = useMemo(() => (fonts ? buildTextures(fonts) : null), [fonts]);
  useEffect(
    () => () => {
      if (!tex) return;
      tex.title.dispose();
      tex.warp.dispose();
      tex.echo.forEach((t) => t.dispose());
      tex.bandA.dispose();
      tex.bandB.dispose();
    },
    [tex],
  );

  useEffect(() => {
    const el = host.current;
    if (!el || reducedMotion) return;
    const onMove = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      pointer.current.x = ((e.clientX - b.left) / b.width) * 2 - 1;
      pointer.current.y = -(((e.clientY - b.top) / b.height) * 2 - 1);
    };
    el.addEventListener('pointermove', onMove, { passive: true });
    return () => el.removeEventListener('pointermove', onMove);
  }, [reducedMotion]);

  return (
    <div ref={host} className="relative h-full w-full overflow-hidden bg-[var(--v-bg)]" style={{ touchAction: 'pan-y' }}>
      {tex && (
        <Canvas
          dpr={[1, 1.75]}
          frameloop={active && !reducedMotion ? 'always' : 'demand'}
          camera={{ position: [0, 0, 5], fov: 35 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <color attach="background" args={['#080808']} />
          <Scene tex={tex} active={active} reduced={reducedMotion} progress={progress} energy={energy} step={step} pointer={pointer} onBeat={setBeat} />
        </Canvas>
      )}
      <Corner title="Flying Type" tools={TOOLS} />
      <Caption beat={beat} reduced={reducedMotion} />
    </div>
  );
}
