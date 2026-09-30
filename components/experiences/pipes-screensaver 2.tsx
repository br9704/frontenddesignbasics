'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { gsap } from 'gsap';
import { Effect } from 'postprocessing';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { BuiltWith } from '@/components/v2/experience-frame';

/*
 * 3D Pipes: the screensaver, rebuilt.
 *  - a grid occupancy array and a random walk that turns 30% of the time
 *  - segments are one InstancedMesh of cylinders, joints one InstancedMesh of spheres (2 draw calls)
 *  - classic: Phong; neon: a fresnel emissive shader, mix(core, edge, pow(1 - N·V, p)), plus Bloom
 *  - retro: the canvas renders at ~640x480 and is upscaled nearest-neighbour, then a custom Effect
 *    quantises to a 16-colour palette through a Bayer 4x4
 *  - god-rays sweep in on each new round; a full grid dissolves in block noise (GSAP) and restarts
 */

const TOOLS = ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'gsap'];
const MAX_SEG = 520;
const MAX_JOINT = 360;
const SEG_TIME = 0.055;
const PALETTE = ['#ff2e00', '#ff00a8', '#7b2cff', '#00b3ff', '#00e676', '#ffe600'];
const DIRS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const QUATS = DIRS.map((d) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d)));

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Seg = { from: [number, number, number]; dir: number; color: number };
type Joint = { at: [number, number, number]; color: number };
type Head = { p: [number, number, number]; dir: number; color: number; len: number; max: number };

/* Random-walk grower over an occupancy grid. */
class Grower {
  dims: [number, number, number];
  occ: Uint8Array;
  rng: () => number;
  segs: Seg[] = [];
  joints: Joint[] = [];
  heads: Head[] = [];
  pipes = 0;
  full = false;
  constructor(dims: [number, number, number], seed: number) {
    this.dims = dims;
    this.occ = new Uint8Array(dims[0] * dims[1] * dims[2]);
    this.rng = mulberry(seed);
  }
  idx(p: [number, number, number]) {
    return p[0] + this.dims[0] * (p[1] + this.dims[1] * p[2]);
  }
  free(p: [number, number, number]) {
    return p.every((v, i) => v >= 0 && v < this.dims[i]) && !this.occ[this.idx(p)];
  }
  addPipe() {
    for (let t = 0; t < 60; t++) {
      const p: [number, number, number] = [0, 1, 2].map((i) => Math.floor(this.rng() * this.dims[i])) as [number, number, number];
      if (!this.free(p)) continue;
      this.occ[this.idx(p)] = 1;
      const color = this.pipes++ % PALETTE.length;
      this.heads.push({ p, dir: Math.floor(this.rng() * 6), color, len: 0, max: 35 + Math.floor(this.rng() * 70) });
      this.pushJoint(p, color);
      return true;
    }
    this.full = true;
    return false;
  }
  pushJoint(at: [number, number, number], color: number) {
    if (this.joints.length < MAX_JOINT) this.joints.push({ at: [...at], color });
  }
  /** One tick: every head grows one segment. Returns false when the round is over. */
  step() {
    if (this.heads.length === 0 && !this.addPipe()) return false;
    for (let h = this.heads.length - 1; h >= 0; h--) {
      const head = this.heads[h];
      const next = (d: number) => head.p.map((v, i) => v + DIRS[d][i]) as [number, number, number];
      const options = [0, 1, 2, 3, 4, 5].filter((d) => this.free(next(d)));
      if (options.length === 0 || head.len >= head.max || this.segs.length >= MAX_SEG) {
        this.pushJoint(head.p, head.color);
        this.heads.splice(h, 1);
        continue;
      }
      let dir = head.dir;
      if (!options.includes(dir) || this.rng() < 0.3) {
        const turns = options.filter((d) => d !== head.dir);
        dir = turns.length ? turns[Math.floor(this.rng() * turns.length)] : options[0];
        this.pushJoint(head.p, head.color);
      }
      this.segs.push({ from: [...head.p], dir, color: head.color });
      head.p = next(dir);
      head.dir = dir;
      head.len++;
      this.occ[this.idx(head.p)] = 1;
    }
    if (this.heads.length === 0) {
      if (this.pipes >= 12 || this.segs.length >= MAX_SEG * 0.9) return false;
      this.addPipe();
    }
    return this.segs.length < MAX_SEG;
  }
}

/* ---------- shaders ---------- */

const neonVert = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vV = normalize(-mv.xyz);
  #ifdef USE_INSTANCING_COLOR
    vC = instanceColor;
  #else
    vC = vec3(1.0);
  #endif
  gl_Position = projectionMatrix * mv;
}`;
const neonFrag = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vC;
void main() {
  float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 1.6);
  // saturated core, hotter rim: the 16-colour palette has no pastels, so the glow carries the hue
  vec3 core = vC * 0.85;
  vec3 edge = vC * 1.6 + 0.04;
  gl_FragColor = vec4(mix(core, edge, f), 1.0);
}`;

const retroFrag = /* glsl */ `
uniform float uDissolve;
uniform float uRays;
uniform float uTime;
uniform vec3 uPal[16];
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  vec2 px = floor(uv * resolution);
  // intro god-rays: an angular cosine ray function from a spotlight above, added on top
  vec2 d = (uv - vec2(0.32, 1.12)) * vec2(aspect, 1.0);
  float a = atan(d.x, -d.y);
  float r = pow(max(cos(a * 11.0 + uTime * 0.5), 0.0), 6.0) * 0.55
          + pow(max(cos(a * 5.0 - uTime * 0.35 + 1.3), 0.0), 12.0) * 0.6;
  r *= smoothstep(1.7, 0.1, length(d)) * uRays;
  c += vec3(0.55) * r;
  // ordered dither, then nearest of 16 colours, compared in sRGB so darks don't collapse
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  c += (bayer4(px) - 0.5) * 0.16;
  vec3 best = uPal[0];
  float bd = 1e9;
  for (int i = 0; i < 16; i++) {
    vec3 e = c - uPal[i];
    float dd = dot(e, e);
    if (dd < bd) { bd = dd; best = uPal[i]; }
  }
  // block-noise dissolve
  float b = hash(floor(px / 10.0));
  if (b < uDissolve) best = vec3(0.0);
  outputColor = vec4(pow(best, vec3(2.2)), 1.0);
}`;

const PAL16 = ['#000000', '#404040', '#808080', '#c0c0c0', '#ffffff', ...PALETTE, '#801700', '#3d167f', '#005980', '#007339', '#807300'].map((h) =>
  new THREE.Color().setStyle(h, THREE.SRGBColorSpace).convertLinearToSRGB(),
); // sRGB values

class RetroEffect extends Effect {
  constructor() {
    super('RetroEffect', retroFrag, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uDissolve', new THREE.Uniform(0)],
        ['uRays', new THREE.Uniform(0)],
        ['uTime', new THREE.Uniform(0)],
        ['uPal', new THREE.Uniform(PAL16.map((c) => new THREE.Vector3(c.r, c.g, c.b)))],
      ]),
    });
  }
}

/* ---------- scene ---------- */

type Ctl = {
  grower: Grower;
  seed: number;
  acc: number;
  time: number;
  shownSegs: number;
  shownJoints: number;
  resetting: boolean;
  fx: RetroEffect;
  addPipe: () => void;
};

function Pipes({
  neon,
  running,
  progress,
  reduced,
  ctlRef,
}: {
  neon: boolean;
  running: boolean;
  progress?: number;
  reduced: boolean;
  ctlRef: React.RefObject<Ctl | null>;
}) {
  const { size, camera, invalidate } = useThree();
  const segRef = useRef<THREE.InstancedMesh>(null);
  const jointRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const portrait = size.width / size.height < 0.9;
  const dims: [number, number, number] = portrait ? [7, 13, 7] : [13, 9, 11];

  const segGeo = useMemo(() => new THREE.CylinderGeometry(0.17, 0.17, 1, 16, 1, true), []);
  const jointGeo = useMemo(() => new THREE.SphereGeometry(0.25, 18, 12), []);
  const phong = useMemo(() => new THREE.MeshPhongMaterial({ color: '#ffffff', shininess: 70, specular: new THREE.Color('#ffffff') }), []);
  const neonMat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: neonVert, fragmentShader: neonFrag, toneMapped: false }), []);
  const fx = useMemo(() => new RetroEffect(), []);
  const colors = useMemo(() => PALETTE.map((h) => new THREE.Color(h)), []);

  useEffect(
    () => () => {
      segGeo.dispose();
      jointGeo.dispose();
      phong.dispose();
      neonMat.dispose();
      fx.dispose();
    },
    [segGeo, jointGeo, phong, neonMat, fx],
  );

  // Camera fits the grid.
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const fovY = (cam.fov * Math.PI) / 180;
    const aspect = size.width / size.height;
    const needH = dims[1] * 1.05;
    const needW = dims[0] * 1.05;
    const dist = Math.max(needH / 2 / Math.tan(fovY / 2), needW / 2 / (Math.tan(fovY / 2) * aspect)) + dims[2] / 2;
    cam.position.set(0, 0, dist);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [camera, size, dims]);

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), s: new THREE.Vector3(), q: new THREE.Quaternion() }), []);

  const writeSeg = (i: number, s: Seg, len: number, g: Grower) => {
    const mesh = segRef.current!;
    const d = DIRS[s.dir];
    const off = [(g.dims[0] - 1) / 2, (g.dims[1] - 1) / 2, (g.dims[2] - 1) / 2];
    tmp.p.set(s.from[0] - off[0] + (d[0] * len) / 2, s.from[1] - off[1] + (d[1] * len) / 2, s.from[2] - off[2] + (d[2] * len) / 2);
    tmp.s.set(1, Math.max(0.001, len), 1);
    tmp.m.compose(tmp.p, QUATS[s.dir], tmp.s);
    mesh.setMatrixAt(i, tmp.m);
    mesh.setColorAt(i, colors[s.color]);
  };
  const writeJoint = (i: number, j: Joint, g: Grower) => {
    const mesh = jointRef.current!;
    const off = [(g.dims[0] - 1) / 2, (g.dims[1] - 1) / 2, (g.dims[2] - 1) / 2];
    tmp.p.set(j.at[0] - off[0], j.at[1] - off[1], j.at[2] - off[2]);
    tmp.s.set(1, 1, 1);
    tmp.m.compose(tmp.p, tmp.q.identity(), tmp.s);
    mesh.setMatrixAt(i, tmp.m);
    mesh.setColorAt(i, colors[j.color]);
  };

  /** Push grower state to the instanced meshes; the newest segment extrudes by `grow`. */
  const sync = (g: Grower, grow: number) => {
    const ctl = ctlRef.current!;
    const seg = segRef.current!;
    const joint = jointRef.current!;
    const start = Math.max(0, Math.min(ctl.shownSegs, g.segs.length) - 8);
    for (let i = start; i < g.segs.length; i++) writeSeg(i, g.segs[i], i >= g.segs.length - g.heads.length ? grow : 1, g);
    for (let i = Math.min(ctl.shownJoints, g.joints.length); i < g.joints.length; i++) writeJoint(i, g.joints[i], g);
    ctl.shownSegs = g.segs.length;
    ctl.shownJoints = g.joints.length;
    seg.count = g.segs.length;
    joint.count = g.joints.length;
    seg.instanceMatrix.needsUpdate = true;
    joint.instanceMatrix.needsUpdate = true;
    if (seg.instanceColor) seg.instanceColor.needsUpdate = true;
    if (joint.instanceColor) joint.instanceColor.needsUpdate = true;
  };

  const newRound = (seed: number) => {
    const ctl = ctlRef.current!;
    ctl.grower = new Grower(dims, seed);
    ctl.seed = seed;
    ctl.shownSegs = 0;
    ctl.shownJoints = 0;
    ctl.grower.addPipe();
    sync(ctl.grower, 0);
  };

  // Init controller + prime colour buffers so both materials compile with instance colours.
  useLayoutEffect(() => {
    for (let i = 0; i < MAX_SEG; i++) segRef.current!.setColorAt(i, colors[0]);
    for (let i = 0; i < MAX_JOINT; i++) jointRef.current!.setColorAt(i, colors[0]);
    ctlRef.current = {
      grower: new Grower(dims, 7),
      seed: 7,
      acc: 0,
      time: 0,
      shownSegs: 0,
      shownJoints: 0,
      resetting: false,
      fx,
      addPipe: () => {
        const c = ctlRef.current!;
        if (c.grower.heads.length < 5) c.grower.addPipe();
        invalidate();
      },
    };
    newRound(reduced || progress !== undefined ? 11 : 1 + Math.floor(Math.random() * 99991));
    if (!reduced && progress === undefined) {
      fx.uniforms.get('uRays')!.value = 1;
      gsap.to(fx.uniforms.get('uRays')!, { value: 0, duration: 2.6, ease: 'power2.inOut', delay: 0.4 });
    }
    return () => {
      gsap.killTweensOf(fx.uniforms.get('uRays')!);
      gsap.killTweensOf(fx.uniforms.get('uDissolve')!);
    };
    // dims changes (orientation) start a fresh round
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portrait]);

  // Reduced motion / progress: deterministic, pre-grown frames.
  useEffect(() => {
    const ctl = ctlRef.current;
    if (!ctl) return;
    if (reduced || progress !== undefined) {
      const target = reduced ? 300 : Math.floor(Math.min(1, Math.max(0, progress!)) * MAX_SEG * 0.85);
      if (target < ctl.grower.segs.length || ctl.seed !== 11) {
        newRound(11);
      }
      while (ctl.grower.segs.length < target && ctl.grower.step()) {
        /* grow */
      }
      sync(ctl.grower, 1);
      fx.uniforms.get('uRays')!.value = reduced ? 0 : Math.max(0, 1 - (progress ?? 1) * 5);
      fx.uniforms.get('uDissolve')!.value = 0;
      invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, progress, portrait]);

  useFrame((_, dt) => {
    const ctl = ctlRef.current;
    if (!ctl || !running) return;
    const step = Math.min(dt, 0.05);
    ctl.time += step;
    fx.uniforms.get('uTime')!.value = ctl.time;
    if (groupRef.current) groupRef.current.rotation.y = Math.sin(ctl.time * 0.08) * 0.22;
    if (ctl.resetting) return;
    ctl.acc += step;
    const g = ctl.grower;
    let alive = true;
    while (ctl.acc >= SEG_TIME && alive) {
      ctl.acc -= SEG_TIME;
      sync(g, 1);
      alive = g.step();
    }
    const k = ctl.acc / SEG_TIME;
    sync(g, 0.12 + 0.88 * k * k); // slight ease-in on each extrusion
    if (!alive) {
      ctl.resetting = true;
      const u = fx.uniforms;
      gsap
        .timeline({ delay: 1.2 })
        .to(u.get('uDissolve')!, { value: 1.01, duration: 1.1, ease: 'steps(14)' })
        .add(() => {
          newRound(ctl.seed + 1);
          u.get('uDissolve')!.value = 0;
          u.get('uRays')!.value = 1;
          ctl.resetting = false;
        })
        .to(u.get('uRays')!, { value: 0, duration: 2.4, ease: 'power2.inOut' });
    }
  });

  return (
    <>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 9, 8]} intensity={2.4} />
      <directionalLight position={[-7, -3, 4]} intensity={0.7} />
      <group ref={groupRef}>
        <instancedMesh ref={segRef} args={[segGeo, undefined, MAX_SEG]} material={neon ? neonMat : phong} frustumCulled={false} />
        <instancedMesh ref={jointRef} args={[jointGeo, undefined, MAX_JOINT]} material={neon ? neonMat : phong} frustumCulled={false} />
      </group>
      <EffectComposer multisampling={0}>
        {neon ? <Bloom intensity={1.2} luminanceThreshold={0.12} luminanceSmoothing={0.1} mipmapBlur radius={0.55} /> : null}
        <primitive object={fx} />
      </EffectComposer>
    </>
  );
}

export default function PipesScreensaver({ active, reducedMotion, progress }: ExperienceProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ctlRef = useRef<Ctl | null>(null);
  const [neon, setNeon] = useState(false);
  const [dpr, setDpr] = useState(1);

  // Render ~480 lines tall and upscale nearest-neighbour: the 640x480 look at any size.
  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const fit = () => setDpr(Math.min(1.75, Math.max(0.35, 480 / Math.max(1, el.clientHeight))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const running = active && !reducedMotion && progress === undefined;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full cursor-pointer overflow-hidden bg-black select-none"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button,a')) return;
        ctlRef.current?.addPipe();
      }}
    >
      <Canvas
        dpr={dpr}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ fov: 42, near: 0.1, far: 100, position: [0, 0, 20] }}
        frameloop={running ? 'always' : 'demand'}
        onCreated={({ gl }) => void (gl.domElement.style.imageRendering = 'pixelated')}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Pipes neon={neon} running={running} progress={progress} reduced={reducedMotion} ctlRef={ctlRef} />
      </Canvas>

      <div className="pixel pointer-events-auto absolute top-2 left-2 flex max-w-[calc(100%-16px)] flex-wrap gap-x-3 bg-black/80 px-2 py-1">
        <p className="text-[16px] leading-[16px] text-[#dfdfdf]">3D Pipes</p>
        <BuiltWith tools={TOOLS} />
      </div>
      <div className="font-w95 absolute right-2 bottom-2 flex gap-[2px] bg-w-face p-[3px] text-[11px] text-black" style={{ boxShadow: 'var(--w-bevel-out)' }}>
        {(['classic', 'neon'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={(m === 'neon') === neon}
            onClick={() => setNeon(m === 'neon')}
            className="h-[24px] bg-w-face px-3 capitalize"
            style={{ boxShadow: (m === 'neon') === neon ? 'var(--w-bevel-in)' : 'var(--w-bevel-out)' }}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
