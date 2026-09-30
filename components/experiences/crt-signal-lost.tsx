'use client';

import { OrthographicCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { SNOISE3, raw } from './g2-glsl';
import { Chip, CornerLabel } from './g2-ui';

/*
 * Signal Lost: an isometric line-art CRT workstation that loses its signal and gets it back.
 * Pipeline (manual, one WebGL context):
 *   scene -> sceneRT (MSAA)            boxes with EdgesGeometry over near-black solids; the screen is a CanvasTexture
 *                                       of scrolling code, barrel-distorted with scanlines and a sweep bar
 *   mosh pass -> history ping-pong      samples its own history at uv - velocity (one velocity per 8x8 block),
 *                                       with a small trickle of the fresh frame: old pixels get dragged
 *   glitch pass -> screen               Day-032 style: brightness-driven UV quantising, row tears, R/B split,
 *                                       then a static-filled brush X over NO SIGNAL and a flickering grid
 * GSAP owns every uniform: calm by default, a burst on click (or a page cut), then recovery.
 */

const CODE = [
  '// signal.ts: what the monitor is running',
  "import { snoise } from './noise';",
  '',
  'export function glitch(uv, t, bn) {',
  '  const bri = 1 - length(rgb) * 0.33;',
  '  const divide = bri * 200 + bn * 100;',
  '  uv = floor(uv * divide) / divide;',
  '  uv.x += 0.005 * bn;',
  '  return split(uv, 0.01);',
  '}',
  '',
  'export function mosh(history, fresh) {',
  '  const block = floor(frag / 8);',
  '  const v = velocity(block);',
  '  return mix(history(uv - v), fresh, 0.03);',
  '}',
  '',
  'for (let row = 0; row < 15; row++) {',
  '  tear(row, noise(row * 50 + t));',
  '}',
  '',
  '/* keep calm and wait for the signal */',
  'await signal.lost();',
  'await signal.found();',
  'console.log("picture restored");',
  '',
];

const quadV = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const hash = /* glsl */ `float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`;

const screenV = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const screenF = /* glsl */ `
uniform sampler2D uTex;
uniform float uTime;
uniform float uSweep;
varying vec2 vUv;
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  c *= 1.0 + 0.07 * dot(c, c);
  vec2 uv = c * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(vec3(0.02), 1.0); return; }
  vec3 col = texture2D(uTex, uv).rgb;
  col *= 0.82 + 0.18 * sin(uv.y * 384.0 * 3.14159);
  float d = uv.y - (1.0 - uSweep);
  col += vec3(0.5) * exp(-d * d * 900.0) + vec3(0.07) * smoothstep(0.0, 0.3, -d) * smoothstep(0.6, 0.0, -d);
  col *= 1.0 - 0.55 * pow(length(c) * 0.72, 3.0);
  col *= vec3(0.94, 0.97, 1.0) * 1.35;
  gl_FragColor = vec4(col, 1.0);
}`;

const moshF = /* glsl */ `
uniform sampler2D uFresh;
uniform sampler2D uHist;
uniform vec2 uRes;
uniform float uMosh;
uniform float uTime;
uniform vec2 uVel;
uniform float uBlock;
${hash}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 fresh = texture2D(uFresh, uv).rgb;
  if (uMosh < 0.001) { gl_FragColor = vec4(fresh, 1.0); return; }
  vec2 block = floor(gl_FragCoord.xy / uBlock);
  // macroblocks: groups of 4x4 blocks share one drift, so whole chunks of old picture slide together
  vec2 group = floor(block / 4.0);
  vec2 jitter = (vec2(hash(group * 1.3), hash(group * 2.7 + 5.0)) - 0.5) * 0.01;
  vec2 vel = (uVel + jitter * step(0.6, hash(group + 9.1))) * uMosh;
  vec3 prev = texture2D(uHist, uv - vel).rgb;
  float key = step(0.992, hash(block + floor(uTime * 9.0) * 0.37));
  float trickle = mix(1.0, 0.06, uMosh);
  gl_FragColor = vec4(mix(prev, fresh, max(trickle, key)), 1.0);
}`;

const glitchF = /* glsl */ `
uniform sampler2D uTex;
uniform sampler2D uBrush;
uniform vec2 uRes;
uniform float uTime;
uniform float uGlitch;
uniform float uDead;
uniform float uX1;
uniform float uX2;
uniform float uFlick;
uniform float uDpr;
${hash}
${SNOISE3}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float t = floor(uTime * 12.0) / 12.0;
  float row = ceil(uv.y * 15.0) / 15.0;
  float bn = step(0.25, abs(snoise(vec3(0.0, 50.0 * row + t * 3.0, t)))) * uGlitch;
  vec3 col;
  if (uGlitch > 0.001) {
    vec3 base = texture2D(uTex, uv).rgb;
    float bri = 1.0 - length(base) * 0.33;
    float divide = mix(2000.0, bri * 200.0 + bn * 100.0 + 12.0, uGlitch);
    vec2 asp = vec2(uRes.x / uRes.y, 1.0);
    vec2 q = (floor(uv * asp * divide) + 0.5) / divide / asp;
    q.x += 0.005 * bn + 0.06 * bn * step(0.72, hash(vec2(row * 17.0, t)));
    float o = 0.01 * uGlitch;
    col.r = texture2D(uTex, q + vec2(o, 0.0)).r;
    col.g = texture2D(uTex, q).g;
    col.b = texture2D(uTex, q - vec2(o, 0.0)).b;
  } else {
    col = texture2D(uTex, uv).rgb;
  }

  // signal dies: crush toward static
  float st = hash(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0);
  col = mix(col, col * 0.25 + vec3(st) * 0.22, uDead);

  // NO SIGNAL (green channel) under a brush X (red + blue channels) filled with per-pixel random RGB
  vec2 bp = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y) / 0.9 + 0.5;
  if (uDead > 0.001 && bp.x > 0.0 && bp.x < 1.0 && bp.y > 0.0 && bp.y < 1.0) {
    vec4 br = texture2D(uBrush, bp);
    float s1 = br.r * step((bp.x + (1.0 - bp.y)) * 0.5, uX1 * 1.05);
    float s2 = br.b * step(((1.0 - bp.x) + (1.0 - bp.y)) * 0.5, uX2 * 1.05);
    col = mix(col, vec3(0.96), br.g * uDead);
    vec3 rnd = vec3(hash(gl_FragCoord.xy + uTime), hash(gl_FragCoord.xy * 1.3 + uTime * 1.7), hash(gl_FragCoord.xy * 0.7 - uTime));
    col = mix(col, rnd, max(s1, s2) * uDead);
  }

  // flickering grid before the picture returns
  vec2 cell = floor(gl_FragCoord.xy / (6.0 * uDpr));
  float fl = step(1.0 - uFlick * 0.42, hash(cell + floor(uTime * 15.0) * 0.13));
  col = mix(col, vec3(0.753), fl * uFlick * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;

type FX = { glitch: number; dead: number; x1: number; x2: number; mosh: number; flick: number; az: number; dragX: number; dragY: number };

const LINE = raw('#c0c0c0');
const SOLID = raw('#0b0b0b');
const DESK_BG = raw('#2c2c2c');

function Box({ size, pos, onClick }: { size: [number, number, number]; pos: [number, number, number]; onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  const [sx, sy, sz] = size;
  const geo = useMemo(() => new THREE.BoxGeometry(sx, sy, sz), [sx, sy, sz]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);
  useEffect(
    () => () => {
      geo.dispose();
      edges.dispose();
    },
    [geo, edges],
  );
  return (
    <group position={pos}>
      <mesh geometry={geo} onClick={onClick}>
        <meshBasicMaterial color={SOLID} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={LINE} />
      </lineSegments>
    </group>
  );
}

function useCodeCanvas() {
  return useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 384;
    const ctx = cv.getContext('2d')!;
    const probe = document.createElement('span');
    probe.className = 'font-mono';
    probe.style.cssText = 'position:absolute;visibility:hidden';
    document.body.appendChild(probe);
    const family = getComputedStyle(probe).fontFamily || 'monospace';
    probe.remove();
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const KW = /\b(const|let|export|function|return|for|import|from|await)\b/g;
    const draw = (scroll: number, t: number) => {
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, 512, 384);
      // title bar
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(0, 0, 512, 26);
      ctx.fillStyle = '#000';
      ctx.font = `600 14px ${family}`;
      ctx.textBaseline = 'middle';
      ctx.fillText('SIGNAL.EXE  [running]', 10, 14);
      ctx.fillText('_ □ x', 462, 13);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 30, 512, 354);
      ctx.clip();
      ctx.font = `500 16px ${family}`;
      const lh = 21;
      const first = Math.floor(scroll / lh);
      const off = scroll % lh;
      for (let i = 0; i < 18; i++) {
        const idx = first + i;
        const line = CODE[idx % CODE.length];
        const y = 44 + i * lh - off;
        ctx.fillStyle = '#5a5a5a';
        ctx.fillText(String((idx % CODE.length) + 1).padStart(2, ' '), 10, y);
        const comment = line.trim().startsWith('//') || line.trim().startsWith('/*');
        ctx.fillStyle = comment ? '#7a7a7a' : '#c8c8c8';
        ctx.fillText(line, 44, y);
        if (!comment) {
          // keywords overprinted in white
          ctx.fillStyle = '#ffffff';
          let m: RegExpExecArray | null;
          KW.lastIndex = 0;
          while ((m = KW.exec(line))) ctx.fillText(m[0], 44 + ctx.measureText(line.slice(0, m.index)).width, y);
        }
        if (i === 12 && Math.floor(t * 2) % 2 === 0) {
          ctx.fillStyle = '#f5f5f5';
          ctx.fillRect(44 + ctx.measureText(line).width + 4, y - 8, 9, 17);
        }
      }
      ctx.restore();
      tex.needsUpdate = true;
    };
    return { tex, draw };
  }, []);
}

// Keyboard: 14 x 4 keys. The X glyph lights up across the middle when the signal dies.
const COLS = 14;
const ROWS = 4;
const GLYPH_X = new Set(['5,0', '6,1', '7,2', '8,3', '8,0', '7,1', '6,2', '5,3']);

function Scene({ reduced, fx, onBurst }: { reduced: boolean; fx: FX; onBurst: () => void }) {
  const { gl, size, scene, camera, invalidate } = useThree();
  const code = useCodeCanvas();
  const keys = useRef<THREE.InstancedMesh>(null);
  const keyHeat = useMemo(() => new Float32Array(COLS * ROWS), []);
  const P = useMemo(() => {
    const screenMat = new THREE.ShaderMaterial({
      vertexShader: screenV,
      fragmentShader: screenF,
      uniforms: { uTex: { value: code.tex }, uTime: { value: 0 }, uSweep: { value: 0.35 } },
    });
    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    const sceneRT = new THREE.WebGLRenderTarget(2, 2, { ...opts, samples: 4 });
    const hist = [new THREE.WebGLRenderTarget(2, 2, { ...opts, depthBuffer: false }), new THREE.WebGLRenderTarget(2, 2, { ...opts, depthBuffer: false })];
    const quad = new THREE.PlaneGeometry(2, 2);
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const moshMat = new THREE.ShaderMaterial({
      vertexShader: quadV,
      fragmentShader: moshF,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uFresh: { value: sceneRT.texture },
        uHist: { value: hist[0].texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uMosh: { value: 0 },
        uTime: { value: 0 },
        uVel: { value: new THREE.Vector2(0, 0) },
        uBlock: { value: 8 },
      },
    });
    const brush = makeBrush();
    const glitchMat = new THREE.ShaderMaterial({
      vertexShader: quadV,
      fragmentShader: glitchF,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTex: { value: hist[0].texture },
        uBrush: { value: brush },
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uGlitch: { value: 0 },
        uDead: { value: 0 },
        uX1: { value: 0 },
        uX2: { value: 0 },
        uFlick: { value: 0 },
        uDpr: { value: 1 },
      },
    });
    const moshScene = new THREE.Scene();
    const m1 = new THREE.Mesh(quad, moshMat);
    m1.frustumCulled = false;
    moshScene.add(m1);
    const glitchScene = new THREE.Scene();
    const m2 = new THREE.Mesh(quad, glitchMat);
    m2.frustumCulled = false;
    glitchScene.add(m2);
    return { screenMat, sceneRT, hist, quad, quadCam, moshMat, glitchMat, brush, moshScene, glitchScene, ping: 0, t: 0, scroll: 0, lastAz: 0 };
  }, [code.tex]);

  useEffect(
    () => () => {
      P.screenMat.dispose();
      P.sceneRT.dispose();
      P.hist.forEach((h) => h.dispose());
      P.quad.dispose();
      P.moshMat.dispose();
      P.glitchMat.dispose();
      P.brush.dispose();
      code.tex.dispose();
    },
    [P, code.tex],
  );

  // redraw the NO SIGNAL brush once the pixel font is surely loaded
  useEffect(() => {
    let dead = false;
    document.fonts
      .load("128px 'Web IBM VGA 8x16'")
      .catch(() => null)
      .then(() => {
        if (dead) return;
        const next = makeBrush();
        const old = P.glitchMat.uniforms.uBrush.value as THREE.Texture;
        P.glitchMat.uniforms.uBrush.value = next;
        P.brush = next;
        old.dispose();
        invalidate();
      });
    return () => {
      dead = true;
    };
  }, [P, invalidate]);

  useEffect(() => {
    const dpr = gl.getPixelRatio();
    const w = Math.max(2, Math.floor(size.width * dpr));
    const h = Math.max(2, Math.floor(size.height * dpr));
    P.sceneRT.setSize(w, h);
    P.hist.forEach((r) => r.setSize(w, h));
    P.moshMat.uniforms.uRes.value.set(w, h);
    P.moshMat.uniforms.uBlock.value = 8 * Math.max(1, Math.round(dpr));
    P.glitchMat.uniforms.uRes.value.set(w, h);
    P.glitchMat.uniforms.uDpr.value = dpr;
    invalidate();
  }, [size, gl, P, invalidate]);

  useFrame((_, delta) => {
    const dt = reduced ? 0 : Math.min(delta, 1 / 30);
    P.t += dt;
    const t = reduced ? 7.3 : P.t;

    // camera: isometric orbit, fit to the frame
    const cam = camera as THREE.OrthographicCamera;
    const fit = Math.min(size.width / 10.2, size.height / 8.4);
    cam.zoom = fit;
    const az = 0.5 + fx.az + (reduced ? 0 : Math.sin(t * 0.15) * 0.05);
    const el = 0.52;
    const target = new THREE.Vector3(0, 1.25, 0.55);
    cam.position.set(target.x + Math.sin(az) * Math.cos(el) * 20, target.y + Math.sin(el) * 20, target.z + Math.cos(az) * Math.cos(el) * 20);
    cam.lookAt(target);
    cam.updateProjectionMatrix();

    // screen: scrolling code and the sweep bar
    P.scroll = reduced ? 150 : P.scroll + dt * 26;
    code.draw(P.scroll, t);
    P.screenMat.uniforms.uTime.value = t;
    P.screenMat.uniforms.uSweep.value = reduced ? 0.4 : (t * 0.22) % 1.25;

    // keys: typing heat in the calm; the X glyph when the signal dies
    const k = keys.current;
    if (k) {
      if (!reduced && Math.random() < dt * 9) keyHeat[Math.floor(Math.random() * COLS * ROWS)] = 1;
      const c = new THREE.Color();
      for (let r = 0; r < ROWS; r++)
        for (let q = 0; q < COLS; q++) {
          const i = r * COLS + q;
          keyHeat[i] = Math.max(0, keyHeat[i] - dt * 2.2);
          const glyph = GLYPH_X.has(`${q},${r}`) ? Math.max(fx.dead, reduced ? 1 : 0) : 0;
          const v = Math.min(1, Math.max(keyHeat[i] * (1 - fx.dead), glyph));
          c.setRGB(0.2 + 0.8 * v, 0.2 + 0.8 * v, 0.2 + 0.8 * v);
          k.setColorAt(i, c);
        }
      if (k.instanceColor) k.instanceColor.needsUpdate = true;
    }

    // uniforms from the GSAP-driven fx object
    const g = P.glitchMat.uniforms;
    g.uTime.value = t;
    g.uGlitch.value = reduced ? 0.14 : fx.glitch;
    g.uDead.value = fx.dead;
    g.uX1.value = fx.x1;
    g.uX2.value = fx.x2;
    g.uFlick.value = fx.flick;
    const m = P.moshMat.uniforms;
    m.uTime.value = t;
    m.uMosh.value = fx.mosh;
    const dAz = az - P.lastAz;
    P.lastAz = az;
    m.uVel.value.set(-dAz * 0.9 + fx.dragX, dAz * 0.25 + fx.dragY);
    fx.dragX *= 0.9;
    fx.dragY *= 0.9;

    // 1. scene -> sceneRT
    gl.setRenderTarget(P.sceneRT);
    gl.clear();
    gl.render(scene, cam);
    // 2. mosh: history ping-pong
    const src = P.hist[P.ping];
    const dst = P.hist[1 - P.ping];
    m.uHist.value = src.texture;
    gl.setRenderTarget(dst);
    gl.render(P.moshScene, P.quadCam);
    P.ping = 1 - P.ping;
    // 3. glitch -> screen
    g.uTex.value = dst.texture;
    gl.setRenderTarget(null);
    gl.render(P.glitchScene, P.quadCam);
  }, 1);

  const burst = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onBurst();
  };

  // key layout
  useEffect(() => {
    const k = keys.current;
    if (!k) return;
    const o = new THREE.Object3D();
    for (let r = 0; r < ROWS; r++)
      for (let q = 0; q < COLS; q++) {
        o.position.set(-1.95 + q * 0.3 + (r % 2) * 0.08, 0.22, 1.62 + r * 0.3);
        o.updateMatrix();
        k.setMatrixAt(r * COLS + q, o.matrix);
        k.setColorAt(r * COLS + q, new THREE.Color(0.2, 0.2, 0.2));
      }
    k.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [invalidate]);

  return (
    <>
      <primitive attach="background" object={DESK_BG} />
      <OrthographicCamera makeDefault near={0.1} far={80} position={[12, 10, 14]} zoom={60} />
      {/* desk */}
      <Box size={[8.4, 0.2, 5]} pos={[0, -0.1, 0.6]} />
      {/* monitor: stand, body, bezel, screen */}
      <Box size={[1.4, 0.22, 1.3]} pos={[0, 0.11, -0.4]} />
      <Box size={[0.5, 0.3, 0.5]} pos={[0, 0.37, -0.4]} />
      <Box size={[2.9, 2.3, 2.1]} pos={[0, 1.72, -0.75]} onClick={burst} />
      <Box size={[3.5, 2.8, 0.34]} pos={[0, 1.75, 0.45]} onClick={burst} />
      <mesh position={[0, 1.8, 0.625]} onClick={burst} material={P.screenMat}>
        <planeGeometry args={[2.8, 2.1]} />
      </mesh>
      <Box size={[0.36, 0.08, 0.04]} pos={[1.35, 0.52, 0.64]} />
      {/* keyboard + keys */}
      <Box size={[4.6, 0.16, 1.5]} pos={[0.08, 0.08, 2.08]} />
      <instancedMesh ref={keys} args={[undefined, undefined, COLS * ROWS]}>
        <boxGeometry args={[0.24, 0.1, 0.24]} />
        <meshBasicMaterial color="#ffffff" />
      </instancedMesh>
      {/* mouse and a tower */}
      <Box size={[0.36, 0.14, 0.56]} pos={[2.9, 0.07, 2.1]} />
      <Box size={[1.1, 2.9, 2.5]} pos={[-3.3, 1.45, -0.5]} />
      <Box size={[0.8, 0.08, 0.04]} pos={[-3.3, 2.4, 0.76]} />
      <Box size={[0.8, 0.08, 0.04]} pos={[-3.3, 2.15, 0.76]} />
    </>
  );
}

function makeBrush() {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighter';
  // NO SIGNAL in the pixel font, green channel
  ctx.fillStyle = '#00ff00';
  ctx.font = `128px 'Web IBM VGA 8x16', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NO SIGNAL', S / 2, S / 2);
  // two dry-brush strokes: red = top-left to bottom-right, blue = the other
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const stroke = (x0: number, y0: number, x1: number, y1: number, colour: string) => {
    ctx.fillStyle = colour;
    const n = 520;
    const nx = -(y1 - y0);
    const ny = x1 - x0;
    const nl = Math.hypot(nx, ny);
    for (let i = 0; i < n; i++) {
      const s = i / n;
      const w = 62 + Math.sin(s * 9) * 10 + rnd() * 10;
      for (let b = 0; b < 7; b++) {
        const off = (rnd() - 0.5) * w * 2;
        if (rnd() < 0.12) continue; // bristle gaps
        const x = x0 + (x1 - x0) * s + (nx / nl) * off + (rnd() - 0.5) * 6;
        const y = y0 + (y1 - y0) * s + (ny / nl) * off + (rnd() - 0.5) * 6;
        ctx.beginPath();
        ctx.arc(x, y, 7 + rnd() * 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  ctx.globalCompositeOperation = 'lighten';
  stroke(150, 110, 880, 900, '#ff0000');
  stroke(890, 120, 130, 890, '#0000ff');
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

export default function SignalLost({ active, reducedMotion, progress }: ExperienceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fx = useMemo<FX>(() => ({ glitch: 0, dead: 0, x1: 0, x2: 0, mosh: 0, flick: 0, az: 0, dragX: 0, dragY: 0 }), []);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const burst = () => {
    if (reducedMotion) return;
    if (tl.current?.isActive()) return;
    tl.current?.kill();
    const t = gsap.timeline();
    // glitch burst: a few hard jolts
    t.to(fx, { glitch: 1, duration: 0.08, ease: 'steps(2)' })
      .to(fx, { glitch: 0.35, duration: 0.07, ease: 'steps(2)' })
      .to(fx, { glitch: 1, duration: 0.1, ease: 'steps(3)' })
      // the signal dies: static, NO SIGNAL, the brush X drawn stroke by stroke
      .to(fx, { dead: 1, duration: 0.1, ease: 'power4.in' }, '+=0.15')
      .to(fx, { x1: 1, duration: 0.32, ease: 'power2.out' }, '<')
      .to(fx, { x2: 1, duration: 0.32, ease: 'power2.out' }, '>-0.05')
      .to(fx, { glitch: 0.55, duration: 0.6 }, '<')
      // recovery through a datamosh: the camera eases round so old pixels get dragged
      .set(fx, { mosh: 1 }, '+=1.1')
      .to(fx, { dead: 0, duration: 0.25, ease: 'power2.in' }, '<')
      .to(fx, { az: fx.az > 0.1 ? 0 : 0.28, duration: 2.2, ease: 'power2.inOut' }, '<')
      .to(fx, { glitch: 0.25, duration: 0.4 }, '<')
      .to(fx, { flick: 1, duration: 0.15, ease: 'none' }, '+=0.35')
      .to(fx, { flick: 0, duration: 0.35, ease: 'power2.in' }, '>0.15')
      .to(fx, { mosh: 0, glitch: 0, duration: 0.6, ease: 'power2.inOut' }, '<')
      .set(fx, { x1: 0, x2: 0 });
    tl.current = t;
  };

  // autoplay: calm for a while, then lose the signal
  useEffect(() => {
    if (!active || reducedMotion || progress !== undefined) return;
    const first = window.setTimeout(burst, 3200);
    const id = window.setInterval(burst, 10500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion, progress]);

  // a page cut: crossing the middle of the parent's progress fires a burst
  const lastP = useRef(progress);
  useEffect(() => {
    if (progress === undefined) return;
    const prev = lastP.current;
    lastP.current = progress;
    if (prev !== undefined && (prev - 0.5) * (progress - 0.5) < 0) burst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  useEffect(
    () => () => {
      tl.current?.kill();
    },
    [],
  );

  const onDown = (e: React.PointerEvent) => (drag.current = { x: e.clientX, y: e.clientY });
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !hostRef.current) return;
    const b = hostRef.current.getBoundingClientRect();
    fx.dragX += ((e.clientX - drag.current.x) / b.width) * 0.6;
    fx.dragY -= ((e.clientY - drag.current.y) / b.height) * 0.6;
    drag.current = { x: e.clientX, y: e.clientY };
  };

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full touch-pan-y overflow-hidden bg-[#2c2c2c] select-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
    >
      <Canvas className="!absolute inset-0" linear flat dpr={[1, 1.75]} frameloop={active && !reducedMotion ? 'always' : 'demand'} gl={{ antialias: false }}>
        <Scene reduced={reducedMotion} fx={fx} onBurst={burst} />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
        <CornerLabel title="Signal Lost" tools={['threejs', 'r3f', 'drei', 'glsl', 'gsap', 'canvas2d']} tone="w95" />
        <Chip tone="w95" onClick={burst} label="cut the signal">
          cut signal
        </Chip>
      </div>
    </div>
  );
}
