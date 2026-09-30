'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { ExperienceProps } from '@/lib/experiences/types';
import { G4Label, NO_SCROLLBAR, PIXEL_FONT, useFontsReady } from './g4-shared';

/*
 * Unwoven Gallery: an endless strip of portrait cards. Each card is 26 separate ribbons (2 x 21
 * vertices) carrying uv (spanning the whole card), rim (-1/1) and threadId. In the centre the ribbons
 * sit edge to edge and read as one clean image. Towards the viewport edges, and the faster you scroll,
 * they slide off at seeded speeds and flutter, still carrying their slice of the image, and bleach
 * toward white as they tear.
 * Page scroll, wheel and drag feed the offset (never trapping the page); gsap.quickTo smooths its velocity.
 * Captions are Canvas2D text in the pixel font. Without WebGL it falls back to a next/image column
 * with velocity skew. Until every texture is in and the first frame is drawn, a DOM poster of the
 * same layout (next/image) holds the stage, so there is never a blank or grey-slab first paint.
 */

const TOOLS = ['threejs', 'r3f', 'glsl', 'gsap', 'next-image', 'canvas2d'];
const THREADS = 26;
const ROWS = 21;
const CARD_ASPECT = 0.66; // width / height

const CARDS = [
  { src: '/showcase/lusion-mobile.jpg', name: 'Lusion', tag: '3d studio' },
  { src: '/showcase/raycast-mobile.jpg', name: 'Raycast', tag: 'launcher' },
  { src: '/showcase/locomotive-mobile.jpg', name: 'Locomotive', tag: 'agency' },
  { src: '/showcase/bruno-simon-mobile.jpg', name: 'Bruno Simon', tag: 'portfolio' },
  { src: '/showcase/poolsuite-mobile.jpg', name: 'Poolsuite', tag: 'radio' },
  { src: '/showcase/stripe-mobile.jpg', name: 'Stripe', tag: 'payments' },
  { src: '/showcase/darkroom-mobile.jpg', name: 'Darkroom', tag: 'studio' },
  { src: '/showcase/igloo-mobile.jpg', name: 'Igloo', tag: '3d studio' },
  { src: '/showcase/rauno-mobile.jpg', name: 'Rauno', tag: 'portfolio' },
  { src: '/showcase/teenage-mobile.jpg', name: 'Teenage Eng.', tag: 'hardware' },
  { src: '/showcase/family-mobile.jpg', name: 'Family', tag: 'wallet' },
  { src: '/showcase/basement-mobile.jpg', name: 'Basement', tag: 'studio' },
];

/* c-1..c-6 from DESIGN.md: the caption index colours */
const PALETTE = ['#ff2e00', '#ff00a8', '#7b2cff', '#00b3ff', '#00e676', '#ffe600'];

// The screenshots are already 390px wide and ~40 KB, so textures and the poster load the static
// files directly (the image optimiser would only re-encode them and add a round-trip).

const VERT = /* glsl */ `
attribute float aRim;
attribute float aThread;
uniform float uTime;
uniform float uVel;
uniform float uHalfW;
uniform float uSpread;
uniform float uCardW;
uniform float uClean;
uniform float uSeed;
varying vec2 vUv;
varying float vRim;
varying float vTear;
float hash(float n){ return fract(sin(n * 127.1 + uSeed * 31.7) * 43758.5453); }
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  float tc = (modelMatrix * vec4(-0.5 + (aThread + 0.5) / ${THREADS.toFixed(1)}, 0.0, 0.0, 1.0)).x;
  float av = min(abs(uVel), 1.5);
  // 0 inside the clean zone (about one card wide at the centre), 1 at the viewport edge
  float edge = (abs(tc) - uClean) / max(uHalfW - uClean, uCardW * 0.6);
  float tear = clamp(smoothstep(-0.05, 1.0, edge + av * 0.55) + av * 0.12, 0.0, 1.0);
  float h = hash(aThread);
  float h2 = hash(aThread + 13.0);
  float dir = tc >= 0.0 ? 1.0 : -1.0;
  float spread = mix(0.4, 1.7, uSpread);
  float px = uCardW / 300.0;
  float fan = mix(0.55, 1.3, mix(uv.y, 1.0 - uv.y, step(0.5, h2)));
  float t14 = pow(tear, 1.4);
  w.x += dir * t14 * (60.0 + h * 420.0) * px * spread * fan;
  w.y += (h2 - 0.5) * pow(tear, 1.6) * 70.0 * px * spread;
  float flutter = sin(uTime * 3.1 + uv.y * 9.0 + aThread * 1.7) * tear * uCardW * 0.05;
  w.x += flutter * 0.35;
  w.z += flutter;
  w.z += sin(uv.y * 3.14159) * uVel * 0.32 * uCardW;
  w.z -= w.x * w.x * 0.05;
  vUv = uv;
  vRim = aRim;
  vTear = tear;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uVel;
uniform float uLoaded;
uniform float uCrop;
uniform float uSpread;
varying vec2 vUv;
varying float vRim;
varying float vTear;
void main(){
  vec2 uv = vec2(vUv.x, mix(uCrop, 1.0, vUv.y));
  float s = clamp(uVel, -1.5, 1.5) * 0.01;
  vec3 col = vec3(texture2D(uTex, uv + vec2(s, 0.0)).r, texture2D(uTex, uv).g, texture2D(uTex, uv - vec2(s, 0.0)).b);
  col = mix(vec3(0.09), col, uLoaded);
  // open gaps between threads by fading their long edges (comb: hard gaps, blur: soft)
  float gap = mix(0.5, 0.2, uSpread);
  float soft = mix(0.04, 0.45, uSpread);
  float open = smoothstep(0.03, 0.35, vTear);
  float a = 1.0 - smoothstep(1.0 - gap * open - soft * open - 0.001, 1.0 - gap * open, abs(vRim));
  a = mix(1.0, a, open);
  // each thread keeps its slice of the image and bleaches toward white as it tears:
  // first it loses some saturation, then it lifts toward paper white
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l), smoothstep(0.2, 0.9, vTear) * 0.45);
  col = mix(col, vec3(1.0), pow(smoothstep(0.1, 1.0, vTear), 1.3) * 0.72);
  a *= 1.0 - smoothstep(0.85, 1.0, vTear) * 0.45;
  gl_FragColor = vec4(col, a);
}`;

function makeCardGeometry() {
  const count = THREADS * 2 * ROWS;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const rim = new Float32Array(count);
  const tid = new Float32Array(count);
  const idx: number[] = [];
  let v = 0;
  for (let t = 0; t < THREADS; t++) {
    const base = v;
    const x0 = -0.5 + t / THREADS;
    const x1 = -0.5 + (t + 1) / THREADS;
    for (let r = 0; r < ROWS; r++) {
      const fy = r / (ROWS - 1);
      for (let side = 0; side < 2; side++) {
        const x = side ? x1 : x0;
        pos.set([x, fy - 0.5, 0], v * 3);
        uv.set([x + 0.5, fy], v * 2);
        rim[v] = side ? 1 : -1;
        tid[v] = t;
        v++;
      }
    }
    for (let r = 0; r < ROWS - 1; r++) {
      const a = base + r * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aRim', new THREE.BufferAttribute(rim, 1));
  g.setAttribute('aThread', new THREE.BufferAttribute(tid, 1));
  g.setIndex(idx);
  return g;
}

function captionTexture(i: number, name: string, tag: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  x.font = `32px ${PIXEL_FONT}`;
  x.textBaseline = 'top';
  x.fillStyle = PALETTE[i % PALETTE.length];
  x.fillText(String(i + 1).padStart(2, '0'), 0, 16);
  x.fillStyle = '#f5f5f5';
  x.fillText(name, 64, 16);
  x.fillStyle = '#8a8a8a';
  x.fillText(tag, 64 + x.measureText(name).width + 24, 16);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

type Drive = {
  offset: number; // px of scroll (Lenis + drag + autoplay)
  vel: { v: number }; // smoothed, normalised velocity
  spread: number;
};

function Strip({
  drive,
  reduced,
  fontsReady,
  onReady,
}: {
  drive: React.RefObject<Drive>;
  reduced: boolean;
  fontsReady: boolean;
  onReady: () => void;
}) {
  const { viewport, size } = useThree();
  const geo = useMemo(makeCardGeometry, []);
  const [loaded, setLoaded] = useState(0);
  const mats = useMemo(
    () =>
      CARDS.map(
        (_, i) =>
          new THREE.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: FRAG,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: {
              uTex: { value: null },
              uTime: { value: 1.3 },
              uVel: { value: 0 },
              uHalfW: { value: 1 },
              uSpread: { value: 0.5 },
              uCardW: { value: 1 },
              uClean: { value: 0.5 },
              uSeed: { value: i * 1.37 + 0.2 },
              uLoaded: { value: 0 },
              uCrop: { value: 0.3 },
            },
          }),
      ),
    [],
  );
  const captions = useMemo(() => (fontsReady ? CARDS.map((c, i) => captionTexture(i, c.name, c.tag)) : null), [fontsReady]);
  const capMats = useMemo(() => CARDS.map(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 1 })), []);
  useEffect(() => {
    if (!captions) return;
    captions.forEach((t, i) => {
      capMats[i].map = t;
      capMats[i].needsUpdate = true;
    });
    return () => captions.forEach((t) => t.dispose());
  }, [captions, capMats]);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const texs: THREE.Texture[] = [];
    let live = true;
    CARDS.forEach((c, i) => {
      // a failed image still counts, so the strip never waits forever (the card stays dark)
      const fail = () => live && setLoaded((n) => n + 1);
      loader.load(c.src, (t) => {
        if (!live) return t.dispose();
        t.minFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        texs.push(t);
        const img = t.image as HTMLImageElement;
        const imgAspect = img.width / img.height;
        mats[i].uniforms.uTex.value = t;
        mats[i].uniforms.uLoaded.value = 1;
        // cover-fit, anchored to the top of the screenshot (the hero)
        mats[i].uniforms.uCrop.value = Math.max(0, 1 - imgAspect / CARD_ASPECT);
        setLoaded((n) => n + 1);
      }, undefined, fail);
    });
    return () => {
      live = false;
      texs.forEach((t) => t.dispose());
    };
  }, [mats]);
  useEffect(
    () => () => {
      geo.dispose();
      mats.forEach((m) => m.dispose());
      capMats.forEach((m) => m.dispose());
    },
    [geo, mats, capMats],
  );

  const cards = useRef<(THREE.Mesh | null)[]>([]);
  const caps = useRef<(THREE.Mesh | null)[]>([]);
  const { invalidate } = useThree();
  useEffect(() => invalidate(), [loaded, captions, invalidate]);
  // Ready = every texture and the captions are in and a full frame has been drawn with them.
  // The canvas stays hidden behind the DOM poster until then (and in reduced motion there is
  // exactly one still frame, never a pop-in).
  const complete = loaded >= CARDS.length && !!captions;
  const reported = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useFrame((state) => {
    if (complete && !reported.current) {
      reported.current = true;
      // this frame renders right after the callback; reveal on the next one
      requestAnimationFrame(() => {
        onReadyRef.current();
        invalidate();
      });
    }
    const d = drive.current;
    const vw = viewport.width;
    const vh = viewport.height;
    const ch = Math.min(vh * 0.6, (vw * 0.58) / CARD_ASPECT);
    const cw = ch * CARD_ASPECT;
    const step = cw * 1.2;
    const L = step * CARDS.length;
    const pxToWorld = vw / Math.max(1, size.width);
    const off = d.offset * pxToWorld * 1.2;
    const t = reduced ? 1.3 : state.clock.elapsedTime;
    const vel = reduced ? 0 : d.vel.v;
    for (let i = 0; i < CARDS.length; i++) {
      const m = cards.current[i];
      const cap = caps.current[i];
      if (!m || !cap) continue;
      const x = gsap.utils.wrap(-L / 2, L / 2, i * step - off);
      m.position.set(x, ch * 0.06, 0);
      m.scale.set(cw, ch, 1);
      const u = mats[i].uniforms;
      u.uTime.value = t;
      u.uVel.value = vel;
      u.uHalfW.value = vw / 2;
      u.uCardW.value = cw;
      u.uClean.value = cw * 0.55;
      u.uSpread.value = d.spread;
      const capH = cw * (64 / 512);
      cap.position.set(x, ch * 0.06 - ch / 2 - capH * 1.1, 0);
      cap.scale.set(cw, capH, 1);
      // captions belong to whole cards: gone before the card starts to come apart
      capMats[i].opacity = 1 - gsap.utils.clamp(0, 1, (Math.abs(x) - cw * 0.25) / (cw * 0.45) + Math.abs(vel) * 0.8);
    }
  });

  return (
    <>
      {CARDS.map((c, i) => (
        <group key={c.src}>
          <mesh
            ref={(el) => {
              cards.current[i] = el;
            }}
            geometry={geo}
            material={mats[i]}
            frustumCulled={false}
          />
          <mesh
            ref={(el) => {
              caps.current[i] = el;
            }}
            material={capMats[i]}
          >
            <planeGeometry args={[1, 1]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/*
 * DOM poster: the same layout as the strip's first frame (card 01 centred, neighbours either side),
 * drawn with next/image from the very URLs the WebGL textures load, so the stage is never blank or
 * grey while three.js boots and the textures arrive. Card height matches the strip:
 * min(60% of the stage height, 58% of its width / aspect), via container units.
 */
const POSTER_SLOTS = [-2, -1, 0, 1, 2];
const THREAD_MASK =
  'repeating-linear-gradient(90deg, #000 0 58%, transparent 58% 100%)';
function Poster({ visible, reduced }: { visible: boolean; reduced: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={
        {
          '--ch': 'min(60cqh, 87.88cqw)',
          '--cw': 'calc(var(--ch) * 0.66)',
          opacity: visible ? 1 : 0,
          transition: reduced ? 'none' : 'opacity 450ms ease-out',
        } as React.CSSProperties
      }
    >
      {POSTER_SLOTS.map((k) => {
        const i = (k + CARDS.length) % CARDS.length;
        const c = CARDS[i];
        const side = k !== 0;
        return (
          <div
            key={k}
            className="absolute"
            style={{
              width: 'var(--cw)',
              height: 'var(--ch)',
              left: `calc(50% - var(--cw) / 2 + ${k * 1.2} * var(--cw))`,
              top: 'calc(50% - var(--ch) * 0.56)',
              opacity: side ? 0.55 : 1,
              // side cards hint at the threads they are about to become
              maskImage: side ? THREAD_MASK : undefined,
              WebkitMaskImage: side ? THREAD_MASK : undefined,
              maskSize: side ? `calc(var(--cw) / ${THREADS}) 100%` : undefined,
              WebkitMaskSize: side ? `calc(var(--cw) / ${THREADS}) 100%` : undefined,
            }}
          >
            <Image
              src={c.src}
              alt=""
              fill
              unoptimized
              loading="eager"
              fetchPriority={side ? 'auto' : 'high'}
              className="object-cover object-top"
              style={side ? { filter: 'saturate(0.6) brightness(1.25)' } : undefined}
            />
            {!side && (
              <p
                className="pixel absolute left-0 flex gap-[1.5ch] whitespace-nowrap"
                style={{ top: 'calc(100% + var(--cw) * 0.106)', fontSize: 'calc(var(--cw) * 0.0625)', lineHeight: 1 }}
              >
                <span style={{ color: PALETTE[0], width: 'calc(var(--cw) * 0.125 - 1.5ch)' }}>01</span>
                <span className="text-[#f5f5f5]">{c.name}</span>
                <span className="text-[#8a8a8a]">{c.tag}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* DOM fallback when WebGL is missing: a next/image column that skews with scroll velocity. */
function Fallback() {
  const scroller = useRef<HTMLDivElement>(null);
  const col = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    const c = col.current;
    if (!el || !c) return;
    const setSkew = gsap.quickSetter(c, 'skewY', 'deg');
    const proxy = { skew: 0 };
    let last = el.scrollTop;
    const onScroll = () => {
      const v = el.scrollTop - last;
      last = el.scrollTop;
      const skew = gsap.utils.clamp(-20, 20, v / -6);
      if (Math.abs(skew) > Math.abs(proxy.skew)) {
        proxy.skew = skew;
        gsap.to(proxy, { skew: 0, duration: 0.8, ease: 'power3', overwrite: true, onUpdate: () => setSkew(proxy.skew) });
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div ref={scroller} className={`absolute inset-0 overflow-y-auto ${NO_SCROLLBAR}`}>
      <div ref={col} className="mx-auto flex w-[min(320px,70%)] flex-col gap-6 py-16">
        {CARDS.map((c) => (
          <div key={c.src} className="relative aspect-[0.66] w-full overflow-hidden">
            <Image src={c.src} alt={c.name} fill sizes="320px" className="object-cover object-top" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VelocityGallery({ active, reducedMotion, progress }: ExperienceProps) {
  const proxy = useRef<HTMLDivElement>(null);
  const drive = useRef<Drive>({ offset: 0, vel: { v: 0 }, spread: 0.5 });
  const [spread, setSpread] = useState(0.5);
  const [gl, setGl] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  readyRef.current = ready;
  const fontsReady = useFontsReady();
  const invalidateRef = useRef<(() => void) | null>(null);
  const driven = progress !== undefined;
  const progressRef = useRef(progress ?? 0);
  progressRef.current = progress ?? 0;

  useEffect(() => {
    const c = document.createElement('canvas');
    setGl(!!(c.getContext('webgl2') || c.getContext('webgl')));
  }, []);

  useEffect(() => {
    drive.current.spread = spread;
    invalidateRef.current?.();
  }, [spread]);

  // Input never traps the page: vertical wheel and page scroll feed the strip passively (the page
  // still scrolls), only horizontal wheel deltas are captured, and pointer drag (mouse or a sideways
  // touch drag; touch-action: pan-y hands vertical swipes to the browser) plus idle drift do the rest.
  useEffect(() => {
    if (!gl || !proxy.current) return;
    const d = drive.current;
    const velTo = gsap.quickTo(d.vel, 'v', { duration: 0.45, ease: 'power3.out' });
    const drag = { active: false, id: -1, x: 0, target: 0, cur: 0 };
    let idle = 0;
    let auto = 0;
    let lastPx = 0;
    let lastProgress = progressRef.current;
    let lastWheel = 0;
    let lastScrollY = window.scrollY;
    const el = proxy.current;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag.active = true;
      drag.id = e.pointerId;
      drag.x = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (!drag.active || e.pointerId !== drag.id) return;
      drag.target -= (e.clientX - drag.x) * 1.6;
      drag.x = e.clientX;
      idle = 0;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === drag.id) drag.active = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (!active) return;
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (horizontal) e.preventDefault();
      drag.target += horizontal ? e.deltaX : e.deltaY;
      lastWheel = performance.now();
      idle = 0;
    };
    // touch scrolling (no wheel) past the gallery still spins it, from the page's own scroll
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastScrollY;
      lastScrollY = y;
      if (!active || performance.now() - lastWheel < 250) return;
      drag.target += dy * 0.8;
      idle = 0;
    };
    if (!driven) {
      el.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      el.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    const tick = (_time: number, dtMs: number) => {
      const dt = Math.min(0.05, dtMs / 1000);
      if (!active) return;
      if (driven) {
        const p = progressRef.current;
        const dp = p - lastProgress;
        lastProgress = p;
        d.offset = p * 9000;
        velTo(gsap.utils.clamp(-1.5, 1.5, (dp * 9000) / 60));
        return;
      }
      drag.cur += (drag.target - drag.cur) * (reducedMotion ? 1 : 0.1);
      idle = readyRef.current ? idle + dt : 0;
      if (!reducedMotion && idle > 1.2) auto += dt * 70;
      const px = drag.cur + auto;
      const v = reducedMotion ? 0 : (px - lastPx) / Math.max(1, dt * 60);
      const moved = Math.abs(px - lastPx) > 0.01;
      lastPx = px;
      d.offset = px;
      velTo(gsap.utils.clamp(-1.5, 1.5, v / 55));
      if (reducedMotion && moved) invalidateRef.current?.();
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
    };
  }, [gl, driven, reducedMotion, active]);

  const frameloop = !active ? 'never' : reducedMotion ? 'demand' : 'always';

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--v-bg)] text-[var(--v-ink)]" style={{ containerType: 'size' }}>
      {gl !== false && <Poster visible={!ready} reduced={reducedMotion} />}
      {gl === false ? (
        <Fallback />
      ) : gl ? (
        <>
          <div
            className="absolute inset-0"
            style={{ opacity: ready ? 1 : 0, transition: reducedMotion ? 'none' : 'opacity 450ms ease-out' }}
          >
            <Canvas
              dpr={[1, 1.75]}
              flat
              linear
              frameloop={frameloop}
              camera={{ position: [0, 0, 6], fov: 32 }}
              gl={{ antialias: true, alpha: false }}
              onCreated={(s) => {
                s.gl.setClearColor(new THREE.Color(8 / 255, 8 / 255, 8 / 255), 1);
                invalidateRef.current = s.invalidate;
              }}
            >
              <Strip drive={drive} reduced={reducedMotion} fontsReady={fontsReady} onReady={() => setReady(true)} />
            </Canvas>
          </div>
          <div
            ref={proxy}
            className="absolute inset-0 z-10 cursor-grab touch-pan-y select-none active:cursor-grabbing"
            aria-label="Scroll or drag the gallery"
          />
        </>
      ) : null}

      <div className="pointer-events-none absolute right-3 bottom-3 left-3 z-20 flex justify-center @max-[460px]:hidden">
        <p className="pixel bg-[var(--v-bg)]/80 px-2 py-1 text-center text-[16px] leading-[16px] text-[var(--v-dim)]">scroll or drag · faster = more undone</p>
      </div>
      <label className="absolute top-3 right-3 z-30 flex items-center gap-2 bg-[var(--v-bg)]/85 px-2 py-1">
        <span className="pixel text-[16px] leading-[16px] text-[var(--v-soft)]">comb</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={spread}
          onChange={(e) => setSpread(Number(e.target.value))}
          aria-label="Thread spread: comb to blur"
          className="w-16 accent-[#ffe600] @min-[560px]:w-24"
        />
        <span className="pixel text-[16px] leading-[16px] text-[var(--v-soft)]">blur</span>
      </label>
      <G4Label title="Unwoven Gallery" tools={TOOLS} />
    </div>
  );
}
