'use client';

/*
 * Pixel to HD
 * Our 3D banner is rebuilt as a field of instanced cubes. The cubes fly in z through a see-through
 * threshold plane; on the far side they are exposed as 1-bit dither (Bayer 4x4, Bayer 8x8 or
 * halftone). The camera flattens, the picture develops tile by tile into full HD, then ends as a
 * flat chrome mark with sliding stripes. The pointer drags an HD window through the pixel layer.
 *
 * Driven by `progress` when a parent supplies it, otherwise by a GSAP timeline you can scrub.
 */
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { AsciiScrub, cssFont, G1Bar, GLSL_BAYER, GLSL_HASH, loadFont, PixelButton, StillFrames, useRafState } from './g1-shared';

const TOOLS = ['threejs', 'r3f', 'drei', 'glsl', 'gsap'];
const S = 4; // world size of the picture
const FAR = 3.2; // cubes start this far back
const PLANE_Z = -1.15; // the threshold plane
const CROP = new THREE.Vector4(0.55, 0.0, 0.3, 1.0); // square crop of /banners/3d.jpg (x, y, w, h in uv)
const MODES = ['bayer 4', 'bayer 8', 'halftone'] as const;

type Drive = { p: number; mode: number; border: number; pointer: THREE.Vector2; pointerPrev: THREE.Vector2; pointerOn: number };

const LUM = /* glsl */ `
uniform sampler2D uImg;
uniform vec4 uCrop;
float lumAt(vec2 uv) {
  vec3 c = texture2D(uImg, uCrop.xy + uv * uCrop.zw).rgb;
  float l = 1.0 - dot(c, vec3(0.299, 0.587, 0.114));
  return clamp((l - 0.06) * 1.45, 0.0, 1.0);
}
`;

const cubeVert = /* glsl */ `
attribute vec2 aGrid;
attribute float aDelay;
uniform float uFly;
uniform float uFlat;
uniform float uSpacing;
uniform float uN;
uniform float uSeedBg;
uniform float uSeedImg;
varying float vLum;
varying float vCrossed;
varying float vShade;
varying float vJump;
varying vec2 vCell;
${GLSL_HASH}
${LUM}
void main() {
  float lum = lumAt(aGrid);
  float f = smoothstep(aDelay, aDelay + 0.2, uFly);
  float seed = lum < 0.2 ? uSeedBg : uSeedImg;
  float jump = step(0.982, hash12(aGrid * 173.0 + seed)) * (1.0 - uFlat) * step(0.001, f) * (1.0 - step(0.999, f) * 0.6);
  float z = mix(${(-FAR).toFixed(2)}, 0.0, f) + jump * uSpacing * 7.0;
  float crossed = smoothstep(${PLANE_Z.toFixed(2)} - uSpacing * 1.5, ${PLANE_Z.toFixed(2)} + uSpacing * 1.5, z);
  float s = mix(0.5, mix(0.42, 0.94, lum), crossed);
  float h = mix(0.5, 0.7 + lum * 6.0, crossed) * mix(1.0, 0.12, uFlat);
  vec3 p = position;
  p.xy *= s * uSpacing;
  p.z *= h * uSpacing;
  p.z += z;
  vLum = lum;
  vCrossed = crossed;
  vJump = jump;
  vCell = floor(aGrid * uN);
  vShade = normal.z > 0.5 ? 1.0 : (abs(normal.x) > 0.5 ? 0.58 : 0.36);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
}
`;

const cubeFrag = /* glsl */ `
uniform float uMode;
varying float vLum;
varying float vCrossed;
varying float vShade;
varying float vJump;
varying vec2 vCell;
${GLSL_BAYER}
void main() {
  float on = step(thresholdMap(vCell, uMode) + 0.001, vLum);
  vec3 lit = vec3(0.95) * vShade;
  vec3 unlit = vec3(0.055 + 0.05 * vShade);
  vec3 pre = vec3(0.13 + 0.14 * vShade);
  vec3 col = mix(pre, mix(unlit, lit, on), vCrossed);
  col = mix(col, vec3(1.0), vJump * 0.5);
  gl_FragColor = vec4(col, 1.0);
}
`;

const planeVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const thresholdFrag = /* glsl */ `
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 g = abs(fract(vUv * 24.0) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = 1.0 - smoothstep(0.0, 0.006, min(e.x, e.y));
  float scan = smoothstep(0.02, 0.0, abs(fract(vUv.y - uTime * 0.12) - 0.5) - 0.48);
  float a = 0.035 + line * 0.07 + edge * 0.55 + scan * 0.08;
  gl_FragColor = vec4(vec3(0.96), a * uAlpha);
}
`;

const hdFrag = /* glsl */ `
uniform float uReveal;
uniform float uChrome;
uniform float uBorder;
uniform float uTime;
uniform float uMode;
uniform float uN;
uniform sampler2D uFluid;
uniform sampler2D uMark;
uniform sampler2D uMarkBlur;
varying vec2 vUv;
${GLSL_HASH}
${GLSL_BAYER}
${LUM}
vec3 chrome(vec2 uv, float hgt) {
  // a bevel normal from the blurred height field, then stripes reflected off it
  vec2 e = vec2(4.0 / 512.0, 0.0);
  vec2 g = vec2(texture2D(uMarkBlur, uv + e.xy).r - texture2D(uMarkBlur, uv - e.xy).r,
                texture2D(uMarkBlur, uv + e.yx).r - texture2D(uMarkBlur, uv - e.yx).r) * 11.0;
  vec3 n = normalize(vec3(-g, 1.0));
  float ph = n.y * 1.3 + n.x * 0.5 + uv.y * 2.2 - uv.x * 0.6 - uTime * 0.18;
  vec3 s = vec3(sin(ph * 6.2831), sin((ph + 0.022) * 6.2831), sin((ph + 0.044) * 6.2831));
  vec3 c = mix(vec3(0.1), vec3(1.0), smoothstep(-0.75, 0.85, s));
  c *= 0.72 + 0.28 * n.z;
  c += pow(max(n.y, 0.0), 3.0) * 0.25;
  return clamp(c, 0.0, 1.0);
}
void main() {
  vec2 tile = ceil(vUv * 35.0) / 35.0;
  float n = hash12(tile * 57.31);
  float fl = texture2D(uFluid, vUv).r;
  float rv = uReveal * 1.12 - 0.06;
  float revealed = step(n, rv);
  float mask = max(revealed, smoothstep(0.18, 0.5, fl));

  float lum = lumAt(vUv);
  vec3 hd = vec3(pow(lum, 0.9));
  // freshly revealed tiles pass through a 1/10 pixelated state first
  float fresh = revealed * smoothstep(0.06, 0.0, rv - n);
  vec2 pc = (floor(vUv * uN * 0.1) + 0.5) / (uN * 0.1);
  hd = mix(hd, vec3(lumAt(pc)), fresh);

  // reduced motion: a static dither border around the HD picture
  vec2 e = min(vUv, 1.0 - vUv);
  float d = min(e.x, e.y);
  float border = uBorder * step(d, 0.05 + 0.07 * hash12(tile * 13.7));
  float dot1 = step(thresholdMap(floor(vUv * uN), uMode) + 0.001, lum);
  hd = mix(hd, vec3(dot1 * 0.95 + 0.04), border);

  float a = texture2D(uMark, vUv).r;
  float hgt = texture2D(uMarkBlur, vUv).r;
  vec3 mark = mix(hd * 0.16, chrome(vUv, hgt), a);
  vec3 col = mix(hd, mark, uChrome);

  float alpha = max(max(mask, border), uChrome);
  if (alpha < 0.5) discard;
  gl_FragColor = vec4(col, 1.0);
}
`;

const fluidFrag = /* glsl */ `
uniform sampler2D uPrev;
uniform vec2 uA;
uniform vec2 uB;
uniform float uOn;
varying vec2 vUv;
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0); return length(pa - ba * h); }
void main() {
  float prev = texture2D(uPrev, vUv).r * 0.962;
  float d = seg(vUv, uA, uB);
  float splat = exp(-d * d / 0.0035) * uOn;
  gl_FragColor = vec4(min(prev + splat * 0.6, 1.0), 0.0, 0.0, 1.0);
}
`;

function makeMark(blur: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 512, 512);
  ctx.filter = blur ? `blur(${blur}px)` : 'none';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 210px ${cssFont('--font-sans', 'Helvetica Neue, Arial, sans-serif')}`;
  ctx.fillText('FDB', 256, 232);
  ctx.font = `400 26px ${cssFont('--font-mono', 'Menlo, monospace')}`;
  ctx.fillText('FRONTEND  DESIGN  BASICS', 256, 360);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function Scene({ drive, running }: { drive: React.RefObject<Drive>; running: boolean }) {
  const { size, camera, gl } = useThree();
  const img = useLoader(THREE.TextureLoader, '/banners/3d.jpg');
  const N = size.width < 640 ? 100 : 180;
  const spacing = S / N;
  const time = useRef(0);
  const [marks, setMarks] = useState<{ a: THREE.Texture; b: THREE.Texture } | null>(null);

  useEffect(() => {
    let dead = false;
    let made: { a: THREE.Texture; b: THREE.Texture } | null = null;
    loadFont(`800 210px ${cssFont('--font-sans', 'sans-serif')}`).then(() => {
      if (dead) return;
      made = { a: makeMark(0), b: makeMark(22) };
      setMarks(made);
    });
    return () => {
      dead = true;
      made?.a.dispose();
      made?.b.dispose();
    };
  }, []);

  const { geo, mat } = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0, 0.5);
    const count = N * N;
    const grid = new Float32Array(count * 2);
    const delay = new Float32Array(count);
    for (let j = 0, i = 0; j < N; j++)
      for (let k = 0; k < N; k++, i++) {
        const u = (k + 0.5) / N;
        const v = (j + 0.5) / N;
        grid[i * 2] = u;
        grid[i * 2 + 1] = v;
        const h = Math.abs(Math.sin(u * 12.9898 * 57 + v * 78.233 * 31) * 43758.5453) % 1;
        const sweep = u * 0.55 + (1 - v) * 0.45;
        delay[i] = Math.min(0.8, sweep * 0.55 + h * 0.25);
      }
    geo.setAttribute('aGrid', new THREE.InstancedBufferAttribute(grid, 2));
    geo.setAttribute('aDelay', new THREE.InstancedBufferAttribute(delay, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: cubeVert,
      fragmentShader: cubeFrag,
      uniforms: {
        uImg: { value: img },
        uCrop: { value: CROP },
        uFly: { value: 0 },
        uFlat: { value: 0 },
        uSpacing: { value: spacing },
        uN: { value: N },
        uSeedBg: { value: 0 },
        uSeedImg: { value: 0 },
        uMode: { value: 1 },
      },
    });
    return { geo, mat };
  }, [N, spacing, img]);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = meshRef.current;
    if (!m) return;
    const o = new THREE.Object3D();
    for (let j = 0, i = 0; j < N; j++)
      for (let k = 0; k < N; k++, i++) {
        o.position.set(((k + 0.5) / N - 0.5) * S, ((j + 0.5) / N - 0.5) * S, 0);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [N, geo]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  // fluid mask ping-pong
  const fluid = useMemo(() => {
    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    const a = new THREE.WebGLRenderTarget(128, 128, opts);
    const b = new THREE.WebGLRenderTarget(128, 128, opts);
    const m = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: fluidFrag,
      uniforms: { uPrev: { value: a.texture }, uA: { value: new THREE.Vector2(-1, -1) }, uB: { value: new THREE.Vector2(-1, -1) }, uOn: { value: 0 } },
      depthTest: false,
      depthWrite: false,
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { read: a, write: b, m, scene, cam };
  }, []);
  useEffect(
    () => () => {
      fluid.read.dispose();
      fluid.write.dispose();
      fluid.m.dispose();
    },
    [fluid],
  );

  const hdMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: planeVert,
        fragmentShader: hdFrag,
        uniforms: {
          uImg: { value: img },
          uCrop: { value: CROP },
          uReveal: { value: 0 },
          uChrome: { value: 0 },
          uBorder: { value: 0 },
          uTime: { value: 0 },
          uMode: { value: 1 },
          uN: { value: N },
          uFluid: { value: fluid.read.texture },
          uMark: { value: null },
          uMarkBlur: { value: null },
        },
      }),
    [img, N, fluid],
  );
  useEffect(() => {
    hdMat.uniforms.uMark.value = marks?.a ?? null;
    hdMat.uniforms.uMarkBlur.value = marks?.b ?? null;
  }, [marks, hdMat]);
  useEffect(() => () => hdMat.dispose(), [hdMat]);

  const thrMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: planeVert,
        fragmentShader: thresholdFrag,
        uniforms: { uAlpha: { value: 1 }, uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(() => () => thrMat.dispose(), [thrMat]);

  const tmpDir = useMemo(() => new THREE.Vector3(), []);
  const angled = useMemo(() => new THREE.Vector3(0.62, -0.82, 1.0).normalize(), []);
  const front = useMemo(() => new THREE.Vector3(0, 0, 1), []);

  useFrame((_, dt) => {
    const d = drive.current;
    if (!d) return;
    if (running) time.current += Math.min(dt, 0.05);
    const t = time.current;
    const p = d.p;
    const fly = Math.min(1, p / 0.42);
    const flat = THREE.MathUtils.smoothstep(p, 0.38, 0.6);
    const reveal = THREE.MathUtils.smoothstep(p, 0.56, 0.8);
    const chrome = marks ? THREE.MathUtils.smoothstep(p, 0.84, 0.96) : 0;

    // seed jumps: a stepped digital stutter while the picture is in flight
    if (running) {
      if (Math.random() < 0.05) mat.uniforms.uSeedBg.value = Math.random() * 100;
      if (Math.random() < 0.02) mat.uniforms.uSeedImg.value = Math.random() * 100;
    }
    mat.uniforms.uFly.value = fly;
    mat.uniforms.uFlat.value = flat;
    mat.uniforms.uMode.value = d.mode;
    hdMat.uniforms.uReveal.value = reveal;
    hdMat.uniforms.uChrome.value = chrome;
    hdMat.uniforms.uBorder.value = d.border;
    hdMat.uniforms.uMode.value = d.mode;
    hdMat.uniforms.uTime.value = t;
    thrMat.uniforms.uAlpha.value = 1 - THREE.MathUtils.smoothstep(p, 0.34, 0.5);
    thrMat.uniforms.uTime.value = t;

    // fluid mask
    if (running) {
      const fm = fluid.m.uniforms;
      fm.uPrev.value = fluid.read.texture;
      fm.uA.value.copy(d.pointerPrev);
      fm.uB.value.copy(d.pointer);
      fm.uOn.value = d.pointerOn;
      d.pointerPrev.copy(d.pointer);
      d.pointerOn *= 0.9;
      gl.setRenderTarget(fluid.write);
      gl.render(fluid.scene, fluid.cam);
      gl.setRenderTarget(null);
      const tmp = fluid.read;
      fluid.read = fluid.write;
      fluid.write = tmp;
      hdMat.uniforms.uFluid.value = fluid.read.texture;
    }

    // camera: angled iso view while the cubes fly, then flat and front-on
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const half = THREE.MathUtils.degToRad(cam.fov / 2);
    const fit = ((S / 2) * 1.12) / Math.tan(half);
    const dist = Math.max(fit, fit / aspect) * THREE.MathUtils.lerp(aspect < 1 ? 1.08 : 1.28, 1.0, flat);
    const sway = (1 - flat) * Math.sin(t * 0.25) * 0.12;
    tmpDir.copy(angled);
    tmpDir.x += sway;
    tmpDir.lerp(front, flat).normalize();
    cam.position.copy(tmpDir).multiplyScalar(dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, (1 - flat) * -0.9);
  });

  return (
    <>
      <instancedMesh ref={meshRef} args={[geo, mat, N * N]} frustumCulled={false} />
      <mesh position={[0, 0, PLANE_Z]} material={thrMat}>
        <planeGeometry args={[S * 1.12, S * 1.12]} />
      </mesh>
      <mesh position={[0, 0, 0.09]} material={hdMat} renderOrder={2}>
        <planeGeometry args={[S, S]} />
      </mesh>
      <mesh
        position={[0, 0, 0.1]}
        onPointerMove={(e) => {
          if (!running || !e.uv || !drive.current) return;
          drive.current.pointer.copy(e.uv);
          drive.current.pointerOn = 1;
        }}
      >
        <planeGeometry args={[S, S]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />
      </mesh>
    </>
  );
}

const PHASES = ['01 flight', '02 threshold', '03 develop', '04 chrome'];
const phaseOf = (p: number) => (p < 0.3 ? 0 : p < 0.56 ? 1 : p < 0.84 ? 2 : 3);

export default function PixelToHdCube({ active, reducedMotion, progress }: ExperienceProps) {
  const running = active && !reducedMotion;
  const [mode, setMode] = useState(1);
  const [shown, setShown] = useRafState(0);
  const drive = useRef<Drive>({ p: 0, mode: 1, border: 0, pointer: new THREE.Vector2(-1, -1), pointerPrev: new THREE.Vector2(-1, -1), pointerOn: 0 });
  const tl = useRef<gsap.core.Timeline | null>(null);
  const resume = useRef(0);
  const external = progress !== undefined;

  useEffect(() => {
    drive.current.mode = mode;
  }, [mode]);

  // the develop timeline (only when no parent progress and motion is allowed)
  useEffect(() => {
    if (reducedMotion || external) return;
    const o = drive.current;
    const t = gsap.timeline({ repeat: -1, paused: true, onUpdate: () => setShown(o.p) });
    t.fromTo(o, { p: 0 }, { p: 1, duration: 11, ease: 'none' })
      .to(o, { p: 1, duration: 2.2 })
      .to(o, { p: 0, duration: 2.6, ease: 'power3.inOut' })
      .to(o, { p: 0, duration: 0.6 });
    tl.current = t;
    return () => {
      t.kill();
      tl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, external]);

  useEffect(() => {
    const t = tl.current;
    if (!t) return;
    if (running) t.play();
    else t.pause();
  }, [running]);

  useEffect(() => {
    if (reducedMotion) {
      drive.current.p = 0.8;
      drive.current.border = 1;
      setShown(0.8);
    } else {
      drive.current.border = 0;
      if (external) {
        drive.current.p = progress!;
        setShown(progress!);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, external, progress]);

  const scrub = (v: number) => {
    if (reducedMotion || external) return;
    window.clearTimeout(resume.current);
    tl.current?.pause();
    drive.current.p = v;
    setShown(v);
  };
  const release = () => {
    if (reducedMotion || external) return;
    window.clearTimeout(resume.current);
    resume.current = window.setTimeout(() => {
      const t = tl.current;
      if (!t) return;
      t.time(drive.current.p * 11);
      if (running) t.play();
    }, 2200);
  };
  useEffect(() => () => window.clearTimeout(resume.current), []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#080808]">
      <Canvas
        dpr={[1, 1.75]}
        frameloop={running ? 'always' : 'demand'}
        camera={{ fov: 32, position: [0, 0, 10], near: 0.1, far: 60 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => gl.setClearColor('#080808', 1)}
      >
        <Suspense fallback={null}>
          <Scene drive={drive} running={running} />
        </Suspense>
        <StillFrames running={running} deps={[mode]} />
      </Canvas>
      <G1Bar title="Pixel to HD" tools={TOOLS}>
        {MODES.map((m, i) => (
          <PixelButton key={m} on={mode === i} onClick={() => setMode(i)} label={`threshold map ${m}`}>
            {m}
          </PixelButton>
        ))}
        <AsciiScrub value={shown} onScrub={scrub} onRelease={release} cells={10} />
        <span className="pixel w-full bg-[#080808]/80 px-2 py-1 text-right text-[16px] leading-[16px] text-[var(--v-ink)]">{PHASES[phaseOf(shown)]}</span>
      </G1Bar>
    </div>
  );
}
