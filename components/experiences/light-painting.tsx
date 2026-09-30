'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { C, NOISE2, raw } from './g2-glsl';
import { Chip, CornerLabel } from './g2-ui';

/*
 * Light Painting: neon light paths drawn by the cursor.
 *  - Tubes: each tube keeps a ring buffer of its own lagging head; a CatmullRomCurve3 through it becomes a fresh
 *    TubeGeometry every frame (tapered in the vertex shader), with a glossy emissive shader and Bloom.
 *  - Threads: a few thousand particles ride an analytic curl-noise field, drawn as additive line segments
 *    into a ping-pong feedback buffer that fades by 0.96 a frame: a long exposure.
 *  - Bands: rotated, lensed (q /= 0.5 + 0.2 dot(q,q)), five domain-warp passes, band weight 1 - exp(-bw / exp(bw m)).
 *  - Burst: rays = sin(a*48 + fbm(dir)) sharpened, falling off with radius; GSAP fires it every so often.
 *  - Idle: an autopilot pointer traces a figure-eight and hands back over 0.25 s when you move.
 *  - Low power: a canvas2D version with shadowBlur strokes and destination-out decay.
 */

const PALETTES: string[][] = [
  [C.magenta, C.violet, C.cyan, C.yellow],
  [C.red, C.yellow, C.magenta, C.violet],
  [C.green, C.cyan, C.violet, C.magenta],
  [C.yellow, C.red, C.cyan, C.green],
];
const TUBES = 4;
const LAG = [0.2, 0.14, 0.095, 0.065];
const RADIUS = [0.11, 0.085, 0.065, 0.05];
const HIST = 46;
const N = 4200;

/* ---------- shared pointer + autopilot state ---------- */

type Drive = {
  user: [number, number]; // screen units: x in [-aspect, aspect], y in [-1, 1]
  target: [number, number];
  lastMove: number;
  auto: number; // 0 = user, 1 = autopilot
  aspect: number;
  t: number;
};

function stepDrive(d: Drive, dt: number, now: number, progress: number | undefined) {
  d.t += dt;
  const tt = progress !== undefined ? progress * 16 : d.t;
  const ax = Math.sin(tt * 0.8) * d.aspect * 0.62;
  const ay = Math.sin(tt * 1.6) * 0.55;
  const idle = progress !== undefined || now - d.lastMove > 1200;
  // lerp over ~0.25 s either way
  const k = 1 - Math.exp(-dt / 0.25);
  d.auto += ((idle ? 1 : 0) - d.auto) * k;
  d.target[0] = d.user[0] + (ax - d.user[0]) * d.auto;
  d.target[1] = d.user[1] + (ay - d.user[1]) * d.auto;
}

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- shaders ---------- */

const quadV = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const fadeF = /* glsl */ `
uniform sampler2D uPrev;
uniform float uFade;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(uPrev, vUv).rgb * uFade, 1.0); }`;

const bgF = /* glsl */ `
uniform float uTime;
uniform float uWarp;
uniform float uRot;
uniform vec2 uRes;
uniform vec3 uCa;
uniform vec3 uCb;
uniform vec3 uCc;
uniform sampler2D uTrail;
uniform float uBurst;
varying vec2 vUv;
${NOISE2}
float bandW(float m, float bw) { return 1.0 - exp(-bw / exp(bw * m)); }
void main() {
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 q = (vUv - 0.5) * asp;
  float c = cos(uRot), s = sin(uRot);
  q = mat2(c, -s, s, c) * q;
  q /= 0.5 + 0.2 * dot(q, q);
  float t = uTime * 0.12;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    q += uWarp * 0.16 * vec2(sin(q.y * 1.3 + t + fi * 1.7), cos(q.x * 1.1 - t * 0.8 + fi * 2.3));
  }
  vec3 col = vec3(0.016, 0.012, 0.03);
  // a field of thin long-exposure bands: three families, each a stack of lines
  float m1 = abs(sin(q.y * 3.1 + sin(q.x * 0.6 + t) * 1.6));
  float m2 = abs(sin(q.y * 2.6 + 2.1 + sin(q.x * 0.5 - t * 0.7) * 1.9));
  float m3 = abs(sin(q.y * 3.7 + 4.2 + sin(q.x * 0.7 + t * 0.5) * 1.4));
  float fade = smoothstep(2.4, 0.3, length(q));
  col += uCa * bandW(m1, 60.0) * 0.26 * fade;
  col += uCb * bandW(m2, 70.0) * 0.22 * fade;
  col += uCc * bandW(m3, 80.0) * 0.18 * fade;
  // long-exposure haze under the bands
  col += (uCa * 0.05 + uCb * 0.04) * (1.0 - smoothstep(0.0, 1.4, length(q)));
  col += texture2D(uTrail, vUv).rgb;

  // finale: a radial long-exposure burst
  if (uBurst > 0.001) {
    vec2 d = (vUv - 0.5) * asp;
    float r = length(d);
    float a = atan(d.y, d.x);
    vec2 dir = vec2(cos(a), sin(a));
    float rays = pow(0.5 + 0.5 * sin(a * 48.0 + 7.0 * fbm(dir * 2.5 + uTime * 0.2)), 6.0);
    rays *= 0.4 + 0.6 * fbm(dir * 5.0 - uTime * 0.1);
    float reach = mix(0.05, 1.3, uBurst);
    float fall = smoothstep(reach, reach * 0.2, r) * smoothstep(0.0, 0.05, r);
    vec3 rc = mix(uCa, uCb, 0.5 + 0.5 * sin(a * 3.0 + uTime * 0.3));
    rc = mix(rc, uCc, 0.5 + 0.5 * cos(a * 2.0 - uTime * 0.2) * 0.6);
    col += rc * rays * fall * 1.6 * uBurst;
    col += vec3(1.0) * exp(-r * 9.0) * uBurst * 0.8;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const tubeV = /* glsl */ `
uniform float uRadius;
varying vec3 vN;
varying vec3 vV;
varying float vU;
void main() {
  vU = uv.x;
  float taper = smoothstep(0.0, 0.4, uv.x) * (0.6 + 0.4 * smoothstep(1.0, 0.94, uv.x));
  vec3 p = position - normal * uRadius * (1.0 - taper);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const tubeF = /* glsl */ `
uniform vec3 uColor;
varying vec3 vN;
varying vec3 vV;
varying float vU;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  float f = max(dot(n, v), 0.0);
  vec3 l = normalize(vec3(-0.4, 0.7, 0.6));
  float spec = pow(max(dot(reflect(-l, n), v), 0.0), 40.0);
  vec3 col = uColor * (0.3 + 1.3 * f) + vec3(1.0) * pow(f, 9.0) * 0.8 + spec * 1.3;
  col *= 0.2 + 0.8 * smoothstep(0.0, 0.7, vU);
  gl_FragColor = vec4(col, 1.0);
}`;

/* ---------- the WebGL painter ---------- */

function Painter({ reduced, drive, palette, progressRef }: { reduced: boolean; drive: Drive; palette: number; progressRef: { current: number | undefined } }) {
  const { gl, size, camera, invalidate } = useThree();
  const tubeRefs = useRef<(THREE.Mesh | null)[]>([]);

  const R = useMemo(() => {
    const rand = mulberry(7);
    const bgMat = new THREE.ShaderMaterial({
      vertexShader: quadV,
      fragmentShader: bgF,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 20 },
        uWarp: { value: 1 },
        uRot: { value: 0.3 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uCa: { value: raw(PALETTES[0][0]) },
        uCb: { value: raw(PALETTES[0][1]) },
        uCc: { value: raw(PALETTES[0][2]) },
        uTrail: { value: null as THREE.Texture | null },
        uBurst: { value: 0 },
      },
    });
    const tubeMats = Array.from(
      { length: TUBES },
      (_, i) =>
        new THREE.ShaderMaterial({
          vertexShader: tubeV,
          fragmentShader: tubeF,
          uniforms: { uColor: { value: raw(PALETTES[0][i]) }, uRadius: { value: RADIUS[i] } },
        }),
    );
    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    const rts = [new THREE.WebGLRenderTarget(2, 2, rtOpts), new THREE.WebGLRenderTarget(2, 2, rtOpts)];
    const fbScene = new THREE.Scene();
    const fbCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    const fadeMat = new THREE.ShaderMaterial({
      vertexShader: quadV,
      fragmentShader: fadeF,
      depthTest: false,
      depthWrite: false,
      uniforms: { uPrev: { value: null as THREE.Texture | null }, uFade: { value: 0.96 } },
    });
    const fadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat);
    fadeQuad.frustumCulled = false;
    fadeQuad.renderOrder = 0;
    const pos = new Float32Array(N * 6);
    const col = new Float32Array(N * 6);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    lines.frustumCulled = false;
    lines.renderOrder = 1;
    fbScene.add(fadeQuad, lines);
    const parts = {
      x: new Float32Array(N),
      y: new Float32Array(N),
      life: new Float32Array(N),
      span: new Float32Array(N),
      r: new Float32Array(N),
      g: new Float32Array(N),
      b: new Float32Array(N),
      cursor: 0,
    };
    const heads = Array.from({ length: TUBES }, () => new THREE.Vector3());
    const hist: THREE.Vector3[][] = Array.from({ length: TUBES }, () => []);
    return { rand, bgMat, tubeMats, rts, fbScene, fbCam, fadeMat, pos, col, lineGeo, lineMat, fadeQuad, parts, heads, hist, ping: 0, frozen: false, time: 20 };
  }, []);

  useEffect(
    () => () => {
      R.bgMat.dispose();
      R.tubeMats.forEach((m) => m.dispose());
      R.rts.forEach((r) => r.dispose());
      R.fadeMat.dispose();
      R.fadeQuad.geometry.dispose();
      R.lineGeo.dispose();
      R.lineMat.dispose();
      tubeRefs.current.forEach((m) => m?.geometry.dispose());
    },
    [R],
  );

  // resize: feedback buffers at half the drawing buffer
  useEffect(() => {
    const dpr = gl.getPixelRatio();
    const w = Math.max(2, Math.floor((size.width * dpr) / 2));
    const h = Math.max(2, Math.floor((size.height * dpr) / 2));
    R.rts.forEach((r) => r.setSize(w, h));
    const a = size.width / size.height;
    drive.aspect = a;
    R.fbCam.left = -a;
    R.fbCam.right = a;
    R.fbCam.updateProjectionMatrix();
    R.bgMat.uniforms.uRes.value.set(size.width, size.height);
    R.frozen = false;
    invalidate();
  }, [size, gl, R, drive, invalidate]);

  // palette: tubes and bands tween; threads already painted keep their old colour
  useEffect(() => {
    const p = PALETTES[palette];
    const d = reduced ? 0 : 0.9;
    const tl = gsap.timeline({ onUpdate: invalidate });
    const to = (c: THREE.Color, hex: string) => {
      const t = raw(hex);
      tl.to(c, { r: t.r, g: t.g, b: t.b, duration: d, ease: 'power2.inOut' }, 0);
    };
    R.tubeMats.forEach((m, i) => to(m.uniforms.uColor.value, p[i]));
    to(R.bgMat.uniforms.uCa.value, p[0]);
    to(R.bgMat.uniforms.uCb.value, p[1]);
    to(R.bgMat.uniforms.uCc.value, p[2]);
    if (d === 0) tl.progress(1);
    return () => {
      tl.kill();
    };
  }, [palette, reduced, R, invalidate]);

  // between strokes: GSAP retunes the band warp and rotation; now and then the finale burst fires
  useEffect(() => {
    const u = R.bgMat.uniforms;
    if (reduced) {
      u.uBurst.value = 0.62;
      u.uWarp.value = 1.1;
      u.uRot.value = 0.5;
      return;
    }
    const retune = () =>
      gsap.to([u.uWarp, u.uRot], {
        value: (i: number) => (i === 0 ? 0.6 + R.rand() * 0.9 : u.uRot.value + (R.rand() - 0.5) * 1.2),
        duration: 2.6,
        ease: 'power2.inOut',
      });
    const id = window.setInterval(retune, 5200);
    const burst = gsap
      .timeline({ repeat: -1, repeatDelay: 9, delay: 6 })
      .to(u.uBurst, { value: 1, duration: 0.9, ease: 'expo.out' })
      .to(u.uBurst, { value: 0, duration: 2.8, ease: 'power2.in' }, '+=0.5');
    return () => {
      window.clearInterval(id);
      burst.kill();
      gsap.killTweensOf([u.uWarp, u.uRot, u.uBurst]);
    };
  }, [reduced, R]);

  const step = (dt: number, now: number) => {
    const P = R.parts;
    const halfH = (camera as THREE.PerspectiveCamera).position.z * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2));
    const prog = progressRef.current;
    stepDrive(drive, dt, now, prog);
    R.time += dt;
    const t = R.time;
    const u = R.bgMat.uniforms;
    u.uTime.value = t;
    if (prog !== undefined) u.uBurst.value = THREE.MathUtils.smoothstep(prog, 0.78, 0.95);

    // tubes: each head chases the target at its own lag; a small orbit spreads them into a ribbon
    for (let i = 0; i < TUBES; i++) {
      const h = R.heads[i];
      const ox = Math.sin(t * 1.7 + i * 1.9) * 0.05 * i;
      const oy = Math.cos(t * 1.3 + i * 2.4) * 0.05 * i;
      const k = 1 - Math.pow(1 - LAG[i], dt * 60);
      h.x += ((drive.target[0] + ox) * halfH - h.x) * k;
      h.y += ((drive.target[1] + oy) * halfH - h.y) * k;
      h.z = Math.sin(t * 1.1 + i * 1.3) * 0.7 - i * 0.15;
      const hist = R.hist[i];
      const last = hist[hist.length - 1];
      if (!last || last.distanceToSquared(h) > 0.0004) {
        hist.push(h.clone());
        if (hist.length > HIST) hist.shift();
      } else if (hist.length > 2) hist.shift();
      const mesh = tubeRefs.current[i];
      if (!mesh) continue;
      if (hist.length >= 4) {
        const curve = new THREE.CatmullRomCurve3(hist, false, 'centripetal');
        const old = mesh.geometry;
        mesh.geometry = new THREE.TubeGeometry(curve, 72, RADIUS[i], 10, false);
        old.dispose();
        mesh.visible = true;
      } else mesh.visible = false;
    }

    // threads: spawn at the heads, ride curl noise, fade with life
    const spawn = Math.round(46 * Math.min(2, dt * 60));
    for (let s = 0; s < spawn; s++) {
      const ti = s % TUBES;
      const j = P.cursor;
      P.cursor = (P.cursor + 1) % N;
      const hd = R.heads[ti];
      const c = R.tubeMats[ti].uniforms.uColor.value as THREE.Color;
      P.x[j] = hd.x / halfH + (R.rand() - 0.5) * 0.08;
      P.y[j] = hd.y / halfH + (R.rand() - 0.5) * 0.08;
      P.life[j] = 1;
      P.span[j] = 1.2 + R.rand() * 1.6;
      P.r[j] = c.r;
      P.g[j] = c.g;
      P.b[j] = c.b;
    }
    const tt = t * 0.35;
    for (let j = 0; j < N; j++) {
      const o = j * 6;
      if (P.life[j] <= 0) {
        R.col[o] = R.col[o + 1] = R.col[o + 2] = R.col[o + 3] = R.col[o + 4] = R.col[o + 5] = 0;
        continue;
      }
      const x = P.x[j];
      const y = P.y[j];
      // psi = sin(1.7x+t)cos(1.3y-0.7t) + 0.6 sin(2.9y-2.1x+1.2t); v = (dpsi/dy, -dpsi/dx)
      const a1 = 1.7 * x + tt;
      const b1 = 1.3 * y - 0.7 * tt;
      const c1 = 2.9 * y - 2.1 * x + 1.2 * tt;
      const dpx = 1.7 * Math.cos(a1) * Math.cos(b1) - 0.6 * 2.1 * Math.cos(c1);
      const dpy = -1.3 * Math.sin(a1) * Math.sin(b1) + 0.6 * 2.9 * Math.cos(c1);
      const sp = 0.16;
      const nx = x + dpy * sp * dt;
      const ny = y - dpx * sp * dt;
      P.x[j] = nx;
      P.y[j] = ny;
      P.life[j] -= dt / P.span[j];
      const l = Math.max(0, P.life[j]);
      const fade = l * Math.min(1, (1 - l) * 8) * 0.3;
      R.pos[o] = x;
      R.pos[o + 1] = y;
      R.pos[o + 3] = nx;
      R.pos[o + 4] = ny;
      R.col[o] = R.col[o + 3] = P.r[j] * fade;
      R.col[o + 1] = R.col[o + 4] = P.g[j] * fade;
      R.col[o + 2] = R.col[o + 5] = P.b[j] * fade;
    }
    R.lineGeo.attributes.position.needsUpdate = true;
    R.lineGeo.attributes.color.needsUpdate = true;

    // feedback: prev * 0.96 + new segments
    const src = R.rts[R.ping];
    const dst = R.rts[1 - R.ping];
    R.fadeMat.uniforms.uPrev.value = src.texture;
    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(dst);
    gl.clear();
    gl.render(R.fbScene, R.fbCam);
    gl.setRenderTarget(prevTarget);
    R.ping = 1 - R.ping;
    u.uTrail.value = dst.texture;
  };

  useFrame((_, delta) => {
    if (reduced) {
      if (R.frozen) return;
      // composed still: a deterministic warm-up along the figure-eight, then freeze
      drive.lastMove = -1e9;
      for (let i = 0; i < 150; i++) step(1 / 60, 0);
      R.frozen = true;
      return;
    }
    step(Math.min(delta, 1 / 30), performance.now());
  });

  return (
    <>
      <mesh frustumCulled={false} renderOrder={-1} material={R.bgMat}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      {R.tubeMats.map((m, i) => (
        <mesh
          key={i}
          ref={(el) => {
            tubeRefs.current[i] = el;
          }}
          material={m}
          frustumCulled={false}
          visible={false}
        />
      ))}
    </>
  );
}

/* ---------- the canvas2D low-power painter ---------- */

function LowPower({
  active,
  reduced,
  drive,
  palette,
  progressRef,
}: {
  active: boolean;
  reduced: boolean;
  drive: Drive;
  palette: number;
  progressRef: { current: number | undefined };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pal = useRef(palette);
  pal.current = palette;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    let W = 1;
    let H = 1;
    const resize = () => {
      const b = cv.getBoundingClientRect();
      W = Math.max(1, b.width);
      H = Math.max(1, b.height);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      drive.aspect = W / H;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    const heads = Array.from({ length: 3 }, () => ({ x: 0, y: 0, px: 0, py: 0, ppx: 0, ppy: 0 }));
    // Recent quadratic segments (screen units). Each frame the canvas is cleared and every segment is redrawn
    // with alpha exp(-age / halfLife): the same decay as a destination-out fade, without 8-bit ghosting.
    type Seg = { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; col: string; w: number; age: number };
    const segs: Seg[] = [];
    const HALF = 0.45;
    const toPx = (sx: number, sy: number): [number, number] => [((sx / drive.aspect + 1) / 2) * W * dpr, ((1 - sy) / 2) * H * dpr];
    const draw = (dt: number, now: number) => {
      stepDrive(drive, dt, now, progressRef.current);
      heads.forEach((h, i) => {
        h.ppx = h.px;
        h.ppy = h.py;
        h.px = h.x;
        h.py = h.y;
        const k = 1 - Math.pow(1 - LAG[i], dt * 60);
        h.x += (drive.target[0] - h.x) * k;
        h.y += (drive.target[1] - h.y) * k;
        segs.push({
          x0: (h.ppx + h.px) / 2,
          y0: (h.ppy + h.py) / 2,
          cx: h.px,
          cy: h.py,
          x1: (h.px + h.x) / 2,
          y1: (h.py + h.y) / 2,
          col: PALETTES[pal.current][i],
          w: 11 - i * 3,
          age: 0,
        });
      });
      for (const g of segs) g.age += dt;
      while (segs.length && segs[0].age > HALF * 5) segs.shift();
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // three passes: wide soft glow, colour core, white-hot centre
      const pass = (widthK: number, alphaK: number, white: boolean) => {
        for (const g of segs) {
          const a = Math.exp(-g.age / HALF) * alphaK;
          if (a < 0.004) continue;
          const [x0, y0] = toPx(g.x0, g.y0);
          const [cx, cy] = toPx(g.cx, g.cy);
          const [x1, y1] = toPx(g.x1, g.y1);
          ctx.globalAlpha = a;
          ctx.strokeStyle = white ? '#ffffff' : g.col;
          ctx.lineWidth = g.w * widthK * dpr;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(cx, cy, x1, y1);
          ctx.stroke();
        }
      };
      pass(3.6, 0.08, false);
      // cores draw normally: additive round caps would bead where segments overlap
      ctx.globalCompositeOperation = 'source-over';
      pass(1, 0.85, false);
      pass(0.3, 0.7, true);
      ctx.globalAlpha = 1;
    };
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      draw(Math.min(0.05, (now - last) / 1000), now);
      last = now;
      raf = requestAnimationFrame(loop);
    };
    if (reduced) {
      drive.lastMove = -1e9;
      for (let i = 0; i < 160; i++) draw(1 / 60, 0);
    } else if (active) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active, reduced, drive, progressRef]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden />;
}

/* ---------- shell ---------- */

export default function LightPainting({ active, reducedMotion, progress }: ExperienceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState(0);
  const [lowPower, setLowPower] = useState(false);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const drive = useMemo<Drive>(() => ({ user: [0, 0], target: [0, 0], lastMove: -1e9, auto: 1, aspect: 1.6, t: 0 }), []);

  useEffect(() => {
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) setLowPower(true);
      // hand the probe context back at once so it never competes with the real one
      probe?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      setLowPower(true);
    }
  }, []);

  const onMove = (e: React.PointerEvent) => {
    if (reducedMotion) return;
    const b = hostRef.current!.getBoundingClientRect();
    const a = b.width / b.height;
    drive.user[0] = (((e.clientX - b.left) / b.width) * 2 - 1) * a;
    drive.user[1] = -(((e.clientY - b.top) / b.height) * 2 - 1);
    drive.lastMove = performance.now();
  };

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full cursor-crosshair touch-pan-y overflow-hidden bg-[#06040b] select-none"
      onPointerMove={onMove}
      onClick={() => setPalette((p) => (p + 1) % PALETTES.length)}
    >
      {lowPower ? (
        <LowPower active={active} reduced={reducedMotion} drive={drive} palette={palette} progressRef={progressRef} />
      ) : (
        <Canvas
          className="!absolute inset-0"
          linear
          flat
          dpr={[1, 1.75]}
          frameloop={active && !reducedMotion ? 'always' : 'demand'}
          camera={{ fov: 40, position: [0, 0, 10], near: 0.1, far: 50 }}
          gl={{ antialias: false, powerPreference: 'high-performance' }}
        >
          <Painter reduced={reducedMotion} drive={drive} palette={palette} progressRef={progressRef} />
          <EffectComposer multisampling={0}>
            <Bloom intensity={1.15} luminanceThreshold={0.55} luminanceSmoothing={0.25} mipmapBlur radius={0.72} />
          </EffectComposer>
        </Canvas>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
        <CornerLabel title="Light Painting" tools={['threejs', 'r3f', 'postprocessing', 'glsl', 'gsap', 'canvas2d']} tone="colour" />
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-col sm:items-end sm:gap-[6px]" onClick={(e) => e.stopPropagation()}>
          <Chip on={lowPower} onClick={() => setLowPower((v) => !v)} label="low power mode">
            low power: {lowPower ? 'on' : 'off'}
          </Chip>
          <div className="pixel flex items-center gap-2 bg-[#080808]/70 px-2 py-[4px] text-[16px] leading-[16px] text-[#b0b0b0]">
            <span>click: colour</span>
            <span className="flex gap-[3px]" aria-hidden>
              {PALETTES[palette].map((c) => (
                <span key={c} className="block h-3 w-3" style={{ background: c }} />
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
