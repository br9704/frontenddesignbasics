'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MeshReflectorMaterial, RoundedBox, useTexture } from '@react-three/drei';
import gsap from 'gsap';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';

/*
 * Reference Hall: the sites we studied as glowing screens on a black mirror pool.
 *  ring: drag to spin with damped inertia; it snaps to the nearest screen, the front one scales up and
 *        the rest dim. Click a side screen to bring it round, click the front one to open the site.
 *  path: every screen hangs along a CatmullRomCurve3 and the camera flies it (scroll, or on its own),
 *        with screens scaling into focus as you pass.
 *  The floor is MeshReflectorMaterial with a scrolling distortion + normal map, so the light ripples.
 *  Under 480px wide it falls back to a CSS-3D tilted marquee of next/image thumbs.
 */

const TOOLS = ['r3f', 'drei', 'glsl', 'gsap', 'next-image'];

const SITES = [
  { name: 'ThreeUI', url: 'https://threeui.com', image: '/examples/3d-threeui.jpg' },
  { name: 'Dogstudio', url: 'https://dogstudio.co', image: '/examples/3d-dogstudio.jpg' },
  { name: 'Zentry', url: 'https://zentry.com', image: '/examples/3d-zentry.jpg' },
  { name: 'Messenger', url: 'https://messenger.abeto.co', image: '/examples/3d-messenger.jpg' },
  { name: 'Spline', url: 'https://spline.design', image: '/examples/3d-spline.jpg' },
  { name: 'Monopo London', url: 'https://monopo.london', image: '/examples/shader-monopo.jpg' },
  { name: 'Radiant', url: 'https://radiant-shaders.com', image: '/examples/shader-radiant.jpg' },
  { name: 'Unicorn Studio', url: 'https://unicorn.studio', image: '/examples/shader-unicorn.jpg' },
  { name: 'Active Theory', url: 'https://activetheory.net', image: '/examples/hero-activetheory.jpg' },
  { name: 'Jesper Landberg', url: 'https://jesperlandberg.com', image: '/examples/portfolio-jesper-landberg.jpg' },
  { name: 'Shape of Intelligence', url: 'https://shapeofintelligence.com/', image: '/examples/3d-shape-of-intelligence.jpg' },
  { name: 'Hume AI', url: 'https://www.hume.ai', image: '/examples/shader-hume.jpg' },
  { name: 'Cuberto', url: 'https://cuberto.com', image: '/examples/motion-cuberto.jpg' },
  { name: 'GTA VI', url: 'https://www.rockstargames.com/VI', image: '/examples/scroll-gta-vi.jpg' },
  { name: 'Singularität', url: 'https://singularity.engl.design/', image: '/examples/3d-singularity.jpg' },
  { name: 'Seasats', url: 'https://www.seasats.com/', image: '/examples/hero-seasats.jpg' },
];
const N = SITES.length;
const STEP = (Math.PI * 2) / N;
const R = 7.2;
const SW = 2.4;
const SH = 1.5;
const TINTS = ['#ff2e00', '#ff00a8', '#7b2cff', '#00b3ff', '#00e676', '#ffe600'];

/* One screen's screenshot. Each screen suspends on its own texture, so the hall (frames, glows, mirror
 * floor) renders at once and the screens fill in one by one. The textures are the static build-time
 * captures (1280x800, 50-150KB): the dev image optimizer can take 30s cold, the static files take ~100ms. */
function ScreenMat({
  src,
  alphaMap,
  setMat,
  onLoad,
}: {
  src: string;
  alphaMap: THREE.Texture;
  setMat: (m: THREE.MeshBasicMaterial | null) => void;
  onLoad: () => void;
}) {
  const tex = useTexture(src);
  useLayoutEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    onLoad();
  }, [tex, onLoad]);
  return <meshBasicMaterial ref={setMat} map={tex} alphaMap={alphaMap} alphaTest={0.5} toneMapped={false} />;
}

/* A soft rounded-rect glow, and a crisp rounded-rect alpha mask, drawn once on canvases. */
function makeMasks() {
  const glow = document.createElement('canvas');
  glow.width = 256;
  glow.height = 176;
  const g = glow.getContext('2d')!;
  g.filter = 'blur(22px)';
  g.fillStyle = '#fff';
  g.beginPath();
  g.roundRect(56, 52, 144, 72, 18);
  g.fill();
  const mask = document.createElement('canvas');
  mask.width = 512;
  mask.height = 320;
  const m = mask.getContext('2d')!;
  m.fillStyle = '#000';
  m.fillRect(0, 0, 512, 320);
  m.fillStyle = '#fff';
  m.beginPath();
  m.roundRect(2, 2, 508, 316, 22);
  m.fill();
  const glowTex = new THREE.CanvasTexture(glow);
  const maskTex = new THREE.CanvasTexture(mask);
  return { glowTex, maskTex };
}

/* Tileable value-noise used as the pool's distortion and normal map. */
function makeRipple() {
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  const rnd: number[] = [];
  const G = 16;
  for (let i = 0; i < G * G; i++) rnd.push(Math.random());
  const at = (x: number, y: number) => rnd[((y + G) % G) * G + ((x + G) % G)];
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = x - xi,
      yf = y - yi;
    const u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf);
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
  };
  const h = (x: number, y: number) => noise((x / S) * G, (y / S) * G);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const i = (y * S + x) * 4;
      data[i] = Math.round((dx * 0.9 + 0.5) * 255);
      data[i + 1] = Math.round((dy * 0.9 + 0.5) * 255);
      data[i + 2] = 255;
      data[i + 3] = 255;
      data[i] = Math.max(0, Math.min(255, data[i]));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1]));
    }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

type Ctl = {
  rot: number;
  vel: number;
  dragging: boolean;
  lastUser: number;
  mode: number; // 0 ring, 1 path (tweened)
  pathT: number;
  pathTarget: number;
  front: number;
  moved: number;
};

function Hall({
  ctl,
  reducedMotion,
  progress,
  onFront,
}: {
  ctl: React.MutableRefObject<Ctl>;
  reducedMotion: boolean;
  progress?: number;
  onFront: (i: number) => void;
}) {
  const { camera, invalidate, size } = useThree();
  const { glowTex, maskTex } = useMemo(() => makeMasks(), []);
  const ripple = useMemo(() => makeRipple(), []);

  // demand mode (reduced motion): the reflector needs a few frames to settle its mirror texture,
  // and every screen that fills in asks for a few more.
  const timers = useRef<number[]>([]);
  const settle = useMemo(
    () => () => {
      [0, 120, 360, 800].forEach((ms) => timers.current.push(window.setTimeout(invalidate, ms)));
    },
    [invalidate],
  );
  useEffect(() => {
    settle();
    const ids = timers.current;
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [settle]);
  useEffect(
    () => () => {
      glowTex.dispose();
      maskTex.dispose();
      ripple.dispose();
    },
    [glowTex, maskTex, ripple],
  );

  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(0, 1.4, 12),
          new THREE.Vector3(3.5, 2.2, 5),
          new THREE.Vector3(-3, 3.0, -2),
          new THREE.Vector3(2.5, 1.6, -9),
          new THREE.Vector3(-3.5, 2.6, -16),
          new THREE.Vector3(1.5, 1.4, -23),
          new THREE.Vector3(-1, 2.8, -30),
          new THREE.Vector3(0, 1.8, -37),
        ],
        false,
        'catmullrom',
        0.5,
      ),
    [],
  );
  // Path layout for each screen: offset sideways from the curve, facing back along it.
  const pathLayout = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    return SITES.map((_, i) => {
      const u = 0.14 + (i / (N - 1)) * 0.84;
      const p = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      const side = new THREE.Vector3().crossVectors(tan, up).normalize();
      const pos = p
        .clone()
        .addScaledVector(side, (i % 2 ? 1 : -1) * 2.5)
        .add(new THREE.Vector3(0, i % 3 === 0 ? 0.5 : -0.2, 0));
      const look = curve.getPointAt(Math.max(0, u - 0.06));
      const m = new THREE.Matrix4().lookAt(look, pos, up);
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      return { pos, q, u };
    });
  }, [curve]);

  const groups = useRef<(THREE.Group | null)[]>([]);
  const screenMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const matSetters = useMemo(() => SITES.map((_, i) => (m: THREE.MeshBasicMaterial | null) => void (screenMats.current[i] = m)), []);
  const glowMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const reflector = useRef<THREE.Material & { distortionMap?: THREE.Texture }>(null);
  const tmp = useMemo(
    () => ({
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      ringQ: new THREE.Quaternion(),
      look: new THREE.Vector3(),
      camP: new THREE.Vector3(),
      e: new THREE.Euler(),
      fwd: new THREE.Vector3(),
      rel: new THREE.Vector3(),
    }),
    [],
  );
  const lastFront = useRef(-1);
  const scales = useRef(SITES.map(() => 1));
  const dims = useRef(SITES.map(() => 0.5));
  const lookCur = useRef(new THREE.Vector3(0, 0.75, 0));
  const floor = useRef<THREE.Mesh>(null);
  const drift = useRef(0);

  useFrame((_, delta) => {
    const c = ctl.current;
    const dt = Math.min(delta, 1 / 30);
    const narrow = size.width < size.height * 1.1;

    // ring physics: inertia, damping, snap, idle advance
    if (!reducedMotion) {
      if (!c.dragging) {
        c.rot += c.vel * dt;
        c.vel *= Math.exp(-dt * 2.6);
        if (Math.abs(c.vel) < 0.35) {
          const snap = Math.round(c.rot / STEP) * STEP;
          c.rot += (snap - c.rot) * (1 - Math.exp(-dt * 5));
        }
        if (performance.now() - c.lastUser > 5200 && c.mode < 0.5) {
          c.lastUser = performance.now() - 2000;
          c.vel = -STEP * 2.6;
        }
      }
      // path: follow smoothed progress
      const target = progress !== undefined ? progress : c.pathTarget;
      if (progress === undefined && c.mode > 0.5 && performance.now() - c.lastUser > 2500) {
        c.pathTarget = (c.pathTarget + dt * 0.028) % 1;
        if (c.pathTarget < c.pathT - 0.5) c.pathT = c.pathTarget;
      }
      c.pathT += (target - c.pathT) * (1 - Math.exp(-dt * 3));
    }

    let front = (((Math.round(-c.rot / STEP) % N) + N) % N) as number;
    if (c.mode > 0.5) {
      // on the path, the "front" screen is the next one ahead of the camera
      // (the first screen whose spot on the curve is still clearly in front of us)
      const ahead = Math.min(0.999, Math.max(0, c.pathT)) * 0.92 + 0.05;
      const next = pathLayout.findIndex((pl) => pl.u > ahead);
      front = next === -1 ? N - 1 : next;
    }
    if (front !== lastFront.current) {
      lastFront.current = front;
      c.front = front;
      onFront(front);
    }

    // camera: ring pose → path pose
    const t = Math.min(0.999, Math.max(0, c.pathT)) * 0.92;
    const camRing = tmp.camP.set(0, narrow ? 2.6 : 2.3, R + (narrow ? 13 : 8.4));
    const camPath = curve.getPointAt(t);
    const lookRing = new THREE.Vector3(0, 0.75, 0);
    // on the path, aim between the road ahead and the screen we are flying to, so it sits centred
    const lookPath = curve.getPointAt(Math.min(1, t + 0.05)).lerp(pathLayout[front].pos, 0.6);
    const m = c.mode;
    camera.position.lerpVectors(camRing, camPath, m);
    tmp.look.lerpVectors(lookRing, lookPath, m);
    lookCur.current.lerp(tmp.look, reducedMotion ? 1 : 1 - Math.exp(-dt * (m > 0.5 ? 2.5 : 8)));
    camera.lookAt(lookCur.current);
    camera.getWorldDirection(tmp.fwd);

    SITES.forEach((_, i) => {
      const g = groups.current[i];
      if (!g) return;
      const a = i * STEP + c.rot;
      tmp.p.set(Math.sin(a) * R, 1.25, Math.cos(a) * R);
      tmp.ringQ.setFromEuler(tmp.e.set(0, a, 0));
      const pl = pathLayout[i];
      g.position.lerpVectors(tmp.p, pl.pos, m);
      g.quaternion.slerpQuaternions(tmp.ringQ, pl.q, m);

      // focus: front of the ring, or near the camera on the path
      const isFront = i === ((Math.round(-c.rot / STEP) % N) + N) % N ? 1 : 0;
      // on the path a screen swells as it comes near, then goes dark as it slides past the camera,
      // so a passing screen never parks a slab of colour over the header
      const dist = g.position.distanceTo(camera.position);
      const depth = tmp.rel.subVectors(g.position, camera.position).dot(tmp.fwd);
      const near = 1 - THREE.MathUtils.smoothstep(dist, 3.5, 9);
      const passing = THREE.MathUtils.smoothstep(depth, 1.2, 4.5) * THREE.MathUtils.smoothstep(depth / Math.max(dist, 1e-3), 0.84, 0.96);
      const pathFocus = near * passing;
      const focus = isFront * (1 - m) + pathFocus * m;
      const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
      const fade = 1 - m + m * passing * passing;
      scales.current[i] += ((1 + focus * 0.18) * (1 - m * 0.45 * (1 - passing)) - scales.current[i]) * k;
      dims.current[i] += ((0.28 + focus * 0.72) * fade - dims.current[i]) * k;
      g.scale.setScalar(scales.current[i]);
      const d = dims.current[i];
      const sm = screenMats.current[i];
      // until its screenshot arrives a screen glows in its own tint
      if (sm) sm.map ? sm.color.setRGB(d, d, d) : sm.color.set(TINTS[i % TINTS.length]).multiplyScalar(0.12 + d * 0.3);
      const gm = glowMats.current[i];
      if (gm) gm.opacity = (0.25 + d * 0.9) * fade;
    });

    // the pool ripples: drift the floor inside one period of the ripple pattern (5 units)
    const fl = floor.current;
    if (fl && !reducedMotion) {
      drift.current += dt;
      fl.position.x = (drift.current * 0.18) % 5;
      fl.position.z = (drift.current * 0.31) % 5;
    }
  });

  const clickScreen = (i: number) => {
    const c = ctl.current;
    if (c.moved > 6) return;
    if (c.mode > 0.5 || i === c.front) {
      window.open(SITES[i].url, '_blank', 'noopener,noreferrer');
      return;
    }
    // bring the clicked screen round to the front, the short way
    let delta = -i * STEP - c.rot;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    c.lastUser = performance.now();
    if (reducedMotion) {
      c.rot += delta;
      invalidate();
    } else gsap.to(c, { rot: c.rot + delta, duration: 1.1, ease: 'power3.inOut', onStart: () => void (c.vel = 0) });
  };

  return (
    <>
      <color attach="background" args={['#030303']} />
      <fog attach="fog" args={['#030303', 12, 34]} />
      <ambientLight intensity={1.4} />
      {SITES.map((s, i) => (
        <group key={s.image} ref={(el) => void (groups.current[i] = el)}>
          <mesh position={[0, 0, -0.12]} renderOrder={1}>
            <planeGeometry args={[SW * 2.1, SH * 2.4]} />
            <meshBasicMaterial
              ref={(el) => void (glowMats.current[i] = el)}
              map={glowTex}
              color={TINTS[i % TINTS.length]}
              transparent
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <RoundedBox args={[SW + 0.14, SH + 0.14, 0.1]} radius={0.07} smoothness={4} position={[0, 0, -0.06]}>
            <meshStandardMaterial color="#0c0c0c" roughness={0.35} metalness={0.6} />
          </RoundedBox>
          <mesh
            onClick={(e) => {
              e.stopPropagation();
              clickScreen(i);
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <planeGeometry args={[SW, SH]} />
            {/* until its screenshot arrives, the screen is a tinted placeholder material */}
            <Suspense fallback={<meshBasicMaterial ref={matSetters[i]} alphaMap={maskTex} alphaTest={0.5} toneMapped={false} />}>
              <ScreenMat src={s.image} alphaMap={maskTex} setMat={matSetters[i]} onLoad={settle} />
            </Suspense>
          </mesh>
        </group>
      ))}
      <mesh ref={floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[120, 120]} />
        <MeshReflectorMaterial
          ref={reflector as React.Ref<never>}
          resolution={512}
          blur={[320, 80]}
          mixBlur={0.6}
          mixStrength={7}
          mixContrast={1.1}
          mirror={0.96}
          roughness={1}
          metalness={0}
          depthScale={0}
          color="#6a6a6a"
          distortionMap={ripple}
          distortion={0.012}
          normalMap={ripple}
          normalScale={new THREE.Vector2(24, 24)}
        />
      </mesh>
    </>
  );
}

/* ---------- mobile fallback: CSS-3D tilted marquee ---------- */
function Marquee({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const cols = useRef<(HTMLDivElement | null)[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const vel = useRef(0);
  const columns = useMemo(() => [0, 1, 2, 3].map((c) => SITES.filter((_, i) => i % 4 === c)), []);

  useEffect(() => {
    if (!active || reducedMotion) return;
    const offs = [0, 120, 60, 180];
    let lastY: number | null = null;
    const el = host.current;
    const onTouch = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      if (lastY !== null) vel.current += (lastY - y) * 0.6;
      lastY = y;
    };
    const onEnd = () => (lastY = null);
    const onWheel = (e: WheelEvent) => (vel.current += e.deltaY * 0.15);
    el?.addEventListener('touchmove', onTouch, { passive: true });
    el?.addEventListener('touchend', onEnd);
    el?.addEventListener('wheel', onWheel, { passive: true });
    const tick = (_t: number, dtMs: number) => {
      const dt = Math.min(dtMs, 50) / 1000;
      vel.current *= Math.exp(-dt * 3);
      const speed = 34 + vel.current;
      cols.current.forEach((c, i) => {
        if (!c) return;
        const half = c.scrollHeight / 2;
        offs[i] = (offs[i] + speed * dt * (i % 2 ? -1 : 1) + half) % half;
        c.style.transform = `translate3d(0, ${-offs[i]}px, 0)`;
      });
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      el?.removeEventListener('touchmove', onTouch);
      el?.removeEventListener('touchend', onEnd);
      el?.removeEventListener('wheel', onWheel);
    };
  }, [active, reducedMotion]);

  return (
    <div ref={host} className="absolute inset-0 overflow-hidden bg-[#030303]" style={{ perspective: '900px' }}>
      <div
        className="absolute top-1/2 left-1/2 grid grid-cols-4 gap-3"
        style={{ width: '170%', transform: 'translate(-50%, -50%) rotateX(55deg) rotateZ(-45deg)', transformStyle: 'preserve-3d' }}
      >
        {columns.map((col, ci) => (
          <div key={ci} className="h-[150vh] overflow-hidden">
            <div ref={(el) => void (cols.current[ci] = el)} className="flex flex-col gap-3 will-change-transform">
              {[...col, ...col, ...col, ...col].map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="relative block aspect-[16/10] overflow-hidden rounded-[10px] ring-1 ring-white/10"
                  style={{
                    boxShadow: `0 0 24px ${TINTS[(ci * 4 + (i % col.length)) % TINTS.length]}55`,
                    background: `linear-gradient(135deg, ${TINTS[(ci * 4 + (i % col.length)) % TINTS.length]}44, #0c0c0c 70%)`,
                  }}
                >
                  <Image
                    src={s.image}
                    alt={s.name}
                    fill
                    sizes="200px"
                    unoptimized
                    loading="eager"
                    fetchPriority={i < 2 ? 'high' : undefined}
                    className="object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#030303] to-transparent" />
    </div>
  );
}

export default function SiteWall3D({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'ring' | 'path'>('ring');
  const [front, setFront] = useState(0);
  const counter = useRef<HTMLSpanElement>(null);
  // The wheel is only captured after the visitor clicks/drags the wall (never a plain page scroll).
  const engagedUntil = useRef(0);
  const ctl = useRef<Ctl>({ rot: 0, vel: 0, dragging: false, lastUser: 0, mode: 0, pathT: 0, pathTarget: 0, front: 0, moved: 0 });
  const invalidateRef = useRef<() => void>(() => {});

  // decide ring vs marquee synchronously before first paint, then keep it in step with resizes
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth || window.innerWidth;
      setNarrow(w < 480);
    };
    measure();
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // demand mode draws nothing on its own: whenever the canvas becomes live (mounted, scrolled into
  // view, reduced motion toggled) ask for a handful of frames so the still frame and mirror settle.
  useEffect(() => {
    if (!active || narrow !== false) return;
    const ids = [0, 60, 200, 500, 1000, 1800, 3000].map((ms) => window.setTimeout(() => invalidateRef.current(), ms));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [active, narrow, reducedMotion]);

  // mode switch: tween the layout blend
  useEffect(() => {
    const c = ctl.current;
    const to = mode === 'path' ? 1 : 0;
    c.lastUser = performance.now();
    if (reducedMotion) {
      c.mode = to;
      c.pathT = c.pathTarget = progress ?? 0.18;
      invalidateRef.current();
    } else {
      if (to === 1 && progress === undefined) c.pathTarget = Math.max(c.pathTarget, 0.02);
      gsap.to(c, { mode: to, duration: 1.6, ease: 'power3.inOut' });
    }
  }, [mode, reducedMotion, progress]);

  // counter tick
  useEffect(() => {
    if (!counter.current || reducedMotion) return;
    gsap.fromTo(counter.current, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.35, ease: 'power3.out' });
  }, [front, reducedMotion]);

  // drag with velocity → inertia
  const last = useRef({ x: 0, t: 0, x0: 0 });
  const onDown = (e: React.PointerEvent) => {
    engagedUntil.current = performance.now() + 6000;
    const c = ctl.current;
    c.dragging = true;
    c.moved = 0;
    c.vel = 0;
    c.lastUser = performance.now();
    gsap.killTweensOf(c, 'rot');
    last.current = { x: e.clientX, t: performance.now(), x0: e.clientX };
  };
  const onMove = (e: React.PointerEvent) => {
    const c = ctl.current;
    if (!c.dragging) return;
    const now = performance.now();
    const dx = e.clientX - last.current.x;
    const w = host.current?.clientWidth ?? 800;
    const dr = (dx / w) * 3.2;
    c.moved = Math.abs(e.clientX - last.current.x0);
    if (c.mode < 0.5) {
      c.rot += dr;
      c.vel = c.vel * 0.6 + (dr / Math.max(1, now - last.current.t)) * 1000 * 0.4;
    } else if (progress === undefined) {
      c.pathTarget = Math.min(0.999, Math.max(0, c.pathTarget - dr * 0.08));
    }
    last.current.x = e.clientX;
    last.current.t = now;
    c.lastUser = now;
    if (reducedMotion) invalidateRef.current();
  };
  const onUp = () => {
    const c = ctl.current;
    c.dragging = false;
    if (reducedMotion) {
      c.rot = Math.round(c.rot / STEP) * STEP;
      c.vel = 0;
      invalidateRef.current();
    }
  };

  // scroll moves along the path (and nudges the ring)
  useEffect(() => {
    const el = host.current;
    if (!el || progress !== undefined) return;
    const onWheel = (e: WheelEvent) => {
      const c = ctl.current;
      c.lastUser = performance.now();
      const engaged = performance.now() < engagedUntil.current;
      if (c.mode > 0.5) {
        if (!engaged) return; // plain page scroll passes straight through
        engagedUntil.current = performance.now() + 2500;
        const nt = c.pathTarget + e.deltaY * 0.00045;
        if ((nt <= 0 && e.deltaY < 0) || (nt >= 0.999 && e.deltaY > 0)) return;
        e.preventDefault();
        c.pathTarget = Math.min(0.999, Math.max(0, nt));
      } else if (c.dragging || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // horizontal wheel/trackpad (or wheel mid-drag) spins the ring and is captured
        e.preventDefault();
        c.vel -= (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.004;
      } else {
        // vertical wheel scrolls the page; it only nudges the ring on the way past
        c.vel -= e.deltaY * 0.0015;
      }
      if (reducedMotion) {
        c.pathT = c.pathTarget;
        invalidateRef.current();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [progress, reducedMotion, narrow]);

  const site = SITES[front];

  return (
    <div
      ref={host}
      className="relative h-full w-full touch-pan-y select-none overflow-hidden bg-[#030303]"
      style={{ cursor: narrow ? 'default' : 'grab' }}
      onPointerDown={narrow ? undefined : onDown}
      onPointerMove={narrow ? undefined : onMove}
      onPointerUp={narrow ? undefined : onUp}
      onPointerCancel={narrow ? undefined : onUp}
      onPointerLeave={narrow ? undefined : onUp}
    >
      {narrow === null && (
        /* server/pre-hydration poster: the front screen glowing over the pool, so the stage is never empty */
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            className="relative aspect-[16/10] w-[min(46%,420px)] overflow-hidden rounded-[10px] ring-1 ring-white/10"
            style={{ boxShadow: `0 0 90px ${TINTS[0]}66, 0 40px 120px ${TINTS[0]}33` }}
          >
            <Image src={SITES[0].image} alt={SITES[0].name} fill sizes="420px" unoptimized priority className="object-cover" />
          </div>
        </div>
      )}
      {narrow === true && <Marquee active={active} reducedMotion={reducedMotion} />}
      {narrow === false && (
        <Canvas
          dpr={[1, 1.75]}
          frameloop={!active ? 'never' : reducedMotion ? 'demand' : 'always'}
          camera={{ position: [0, 2.3, R + 8.4], fov: 40, near: 0.1, far: 80 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          style={{ position: 'absolute', inset: 0 }}
          onCreated={(s) => {
            invalidateRef.current = () => s.invalidate();
            s.invalidate();
          }}
        >
          <Suspense fallback={null}>
            <Hall ctl={ctl} reducedMotion={reducedMotion} progress={progress} onFront={setFront} />
          </Suspense>
        </Canvas>
      )}

      <div className="pointer-events-none absolute top-3 left-3 max-w-[70%] sm:top-4 sm:left-4">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">REFERENCE HALL</p>
        <p className="pixel mt-1 hidden text-[16px] leading-[16px] text-[var(--v-dim)] sm:block">
          built with:{' '}
          {TOOLS.map((t, i) => (
            <span key={t}>
              {i > 0 && ' · '}
              <Link href={`/tools#${t}`} className="pointer-events-auto text-[var(--v-soft)] hover:text-[var(--v-ink)] hover:underline">
                {t}
              </Link>
            </span>
          ))}
        </p>
      </div>

      {narrow === false && (
        <>
          <div className="absolute top-3 right-3 flex gap-1 sm:top-4 sm:right-4" onPointerDown={(e) => e.stopPropagation()}>
            {(['ring', 'path'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`pixel border px-2 py-1 text-[16px] leading-[16px] ${
                  mode === m ? 'border-white bg-white text-black' : 'border-white/30 bg-black/50 text-white/70 hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-1 px-4 text-center">
            <p className="pixel overflow-hidden text-[32px] leading-[32px] text-white">
              <span ref={counter} className="inline-block">
                {String(front + 1).padStart(2, '0')}
              </span>
              <span className="text-white/40"> / {String(N).padStart(2, '0')}</span>
            </p>
            <a
              href={site.url}
              target="_blank"
              rel="noreferrer"
              className="pixel pointer-events-auto text-[16px] leading-[16px] text-white/80 underline-offset-4 hover:text-white hover:underline"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {site.name} ↗
            </a>
          </div>
        </>
      )}
    </div>
  );
}
