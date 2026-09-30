'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import type { ExperienceProps } from '@/lib/experiences/types';
import { G4Label, NO_SCROLLBAR, cssFont, useFontsReady, useSize } from './g4-shared';

gsap.registerPlugin(ScrollTrigger, SplitText);

/*
 * Pinned Chapters: a pinned editorial story in mono.
 *  - Hero: a cling-film sheet (R3F plane, 200x100 segments) ripples over a giant headline. The sheet is
 *    drawn twice per frame: once into an FBO as a height map (R = z, G = mask) and once visibly.
 *    The poster quad behind reads that map to magnify, split RGB and blur the type under the film.
 *  - Chapters: stacked SVG plates, each an <image> masked by white rects generated in React.
 *    One scrubbed GSAP timeline opens them as slats, a random grid and columns.
 *  - Narration: SplitText words step from 0.15 to 1 opacity on the same timeline.
 *  - Scroll: an inner scroller smoothed by Lenis; ScrollTrigger scrubs the timeline against it.
 */

const TOOLS = ['gsap', 'lenis', 'svg', 'css', 'r3f', 'glsl'];

type Mode = 'slats' | 'grid' | 'columns';
/* crop: [x, y, w, h, naturalW, naturalH] keeps each plate clear of the source's own UI text.
   cropP is the same for portrait frames (phones), aimed at the subject instead of empty sky. */
const CHAPTERS: { n: string; mode: Mode; title: string; img: string; text: string; crop: number[]; cropP?: number[] }[] = [
  {
    n: '01',
    mode: 'slats',
    title: 'Slats',
    img: '/showcase/igloo.jpg',
    crop: [240, 195, 990, 575, 1440, 900],
    cropP: [500, 165, 500, 620, 1440, 900],
    text: 'The first plate opens in horizontal slats. Each strip is a white rect inside an SVG mask, and one scrubbed timeline grows them in turn, from the last row up to the first.',
  },
  {
    n: '02',
    mode: 'grid',
    title: 'Grid',
    img: '/examples/3d-chipsa.jpg',
    crop: [500, 395, 690, 330, 1280, 800],
    cropP: [700, 500, 300, 300, 1280, 800],
    text: 'The second plate breaks into a grid of cells. They open in a random order, so the picture arrives like a slow shuffle of tiles rather than a wipe.',
  },
  {
    n: '03',
    mode: 'columns',
    title: 'Columns',
    img: '/banners/motion.jpg',
    crop: [640, 110, 960, 370, 1600, 480],
    text: 'The last plate slides in as columns, left to right. Words light up as you read, which keeps the pace of the story in your hands.',
  },
];

/* Timeline positions, in timeline seconds (total 10). */
const T = { heroEnd: 1.6, open: [1.4, 4.3, 7.2], words: [2.3, 5.2, 7.75], wordsLen: 1.35, hold: 9.3, end: 10 };
/* Words and segment 03 finish at T.hold, leaving the last 7% of scroll as a still hold. */

/* ─────────────────────────────── hero: cling film over a headline ─────────────────────────────── */

const NOISE = /* glsl */ `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

const SHEET_VERT = /* glsl */ `
uniform float uTime;
uniform float uPush;
varying vec2 vUv;
varying float vZ;
varying vec3 vWorld;
${NOISE}
float wave(vec2 p, vec2 uv){
  float n = vnoise(p * 2.6 + vec2(uTime * 0.32, uTime * 0.07)) - 0.5;
  float s = sin(p.x * 9.0 - uTime * 1.7 + sin(p.y * 3.1 + uTime * 0.4) * 0.9) * 0.55
          + sin(p.x * 4.3 + p.y * 6.5 - uTime * 1.15) * 0.45;
  float edge = 0.55 + 0.9 * max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0 * 0.5;
  return (n * 0.085 + s * 0.026 * (1.0 + uPush * 2.8)) * edge;
}
void main(){
  vec3 p = position;
  float z = wave(p.xy, uv);
  p.z += z;
  p.x += z * 0.12;
  vZ = z;
  vUv = uv;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const HEIGHT_FRAG = /* glsl */ `
varying float vZ;
void main(){ gl_FragColor = vec4(clamp(vZ * 5.0 + 0.5, 0.0, 1.0), 1.0, 0.0, 1.0); }`;

const FILM_FRAG = /* glsl */ `
uniform vec3 uCam;
varying vec2 vUv;
varying float vZ;
varying vec3 vWorld;
void main(){
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 v = normalize(uCam - vWorld);
  if (dot(n, v) < 0.0) n = -n;
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.2);
  vec3 L1 = normalize(vec3(-0.45, 0.6, 1.0));
  vec3 L2 = normalize(vec3(0.7, -0.35, 0.8));
  float spec = pow(max(dot(reflect(-L1, n), v), 0.0), 70.0);
  float spec2 = pow(max(dot(reflect(-L2, n), v), 0.0), 18.0) * 0.35;
  float diff = clamp(dot(n, L1), 0.0, 1.0);
  float border = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float edge = 1.0 - smoothstep(0.0, 0.012, border);
  // grey creases, white highlights
  float shade = smoothstep(0.985, 0.8, diff);
  vec3 col = mix(vec3(1.0), vec3(0.55), shade * 0.8);
  float a = 0.08 + fres * 0.4 + shade * 0.22 + edge * 0.35;
  col = mix(col, vec3(1.0), clamp(spec + spec2, 0.0, 1.0));
  a = clamp(a + (spec + spec2) * 0.9, 0.0, 0.95);
  gl_FragColor = vec4(col, a);
}`;

const POSTER_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.999, 1.0); }`;

const POSTER_FRAG = /* glsl */ `
uniform sampler2D uText;
uniform sampler2D uHeight;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uCurve;
varying vec2 vUv;
vec3 tx(vec2 uv){ return texture2D(uText, uv).rgb; }
void main(){
  vec2 suv = gl_FragCoord.xy / uRes;
  vec4 h = texture2D(uHeight, suv);
  float m = h.g;
  float d = h.r;
  float lift = pow(clamp(d, 0.0, 1.0), 1.0 + uCurve * 2.0);
  float zoom = 1.0 + m * (0.16 + lift * 0.6);
  vec2 uv = uCenter + (vUv - uCenter) / zoom;
  float split = m * (0.0012 + abs(d - 0.5) * 0.012);
  vec3 sharp = vec3(tx(uv + vec2(split, 0.0)).r, tx(uv).g, tx(uv - vec2(split, 0.0)).b);
  vec3 blur = vec3(0.0);
  float r = m * (0.003 + lift * 0.012);
  float ar = uRes.x / uRes.y;
  for (int i = 0; i < 10; i++) {
    float a = float(i) * 0.6283185;
    blur += tx(uv + vec2(cos(a), sin(a) * ar) * r);
  }
  blur /= 10.0;
  float bmix = m * smoothstep(0.3, 0.85, lift);
  vec3 col = mix(sharp, blur, bmix);
  col = mix(col, vec3(1.0), m * 0.05);
  gl_FragColor = vec4(col, 1.0);
}`;

function drawPoster(w: number, h: number, dpr: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w * dpr));
  c.height = Math.max(2, Math.round(h * dpr));
  const x = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  x.fillStyle = '#f5f5f5';
  x.fillRect(0, 0, W, H);
  const display = cssFont('--font-display', 'Georgia, serif');
  const mono = cssFont('--font-mono', 'monospace');
  const word = 'Chapters';
  let fs = H * 0.3;
  x.font = `italic 400 ${fs}px ${display}`;
  fs = Math.min(fs, (fs * (W * 0.88)) / x.measureText(word).width);
  const band = Math.max(H * 0.15, 64 * dpr);
  const cy = H / 2;
  x.font = `italic 400 ${fs}px ${display}`;
  x.fillStyle = '#080808';
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillText(word, W / 2, cy - band / 2 - fs * 0.1);
  x.save();
  x.translate(W / 2, cy + band / 2 + fs * 0.1);
  x.rotate(Math.PI);
  x.fillText(word, 0, 0);
  x.restore();
  // band: two rules and small mono notes, like a margin in a proof
  x.fillStyle = '#080808';
  x.fillRect(W * 0.06, cy - band / 2, W * 0.88, Math.max(1, dpr * 1.5));
  x.fillRect(W * 0.06, cy + band / 2, W * 0.88, Math.max(1, dpr * 1.5));
  const small = Math.max(9, Math.round(10 * dpr));
  x.font = `${small}px ${mono}`;
  x.textAlign = 'left';
  x.fillStyle = '#6a6a6a';
  const notes = [
    'float d = texture(uHeight, suv).r;',
    'float zoom = 1.0 + m * pow(d, 1.0 + curve * 2.0);',
    'vec2 uv = center + (vUv - center) / zoom;',
    'col = mix(sharp, blur, m * lift);',
    'tl.to(rects, { scaleY: 1, stagger: { from: "end" } });',
    'split.words.forEach(w => w.style.opacity = 0.15);',
  ];
  const cols = W > 900 * dpr ? 3 : W > 520 * dpr ? 2 : 1;
  const lh = small * 1.5;
  const rows = Math.max(1, Math.floor((band - small * 1.6) / lh));
  for (let ci = 0; ci < cols; ci++) {
    const x0 = W * 0.06 + ci * ((W * 0.88) / cols) + small * 0.5;
    for (let r = 0; r < rows; r++) {
      x.fillText(notes[(r + ci * 2) % notes.length], x0, cy - band / 2 + small * 1.6 + r * lh);
    }
  }
  return c;
}

function Hero({ hero, push, reduced, fontsReady }: { hero: { current: number }; push: { current: number }; reduced: boolean; fontsReady: boolean }) {
  const { gl, camera, size, viewport, scene, invalidate } = useThree();
  const fbo = useFBO();
  const sheet = useRef<THREE.Mesh>(null);
  const poster = useRef<THREE.Mesh>(null);
  const smoothPush = useRef(0);
  const drawBuf = useMemo(() => new THREE.Vector2(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const text = useMemo(() => {
    if (!fontsReady || size.width < 2) return null;
    const t = new THREE.CanvasTexture(drawPoster(size.width, size.height, Math.min(1.75, window.devicePixelRatio || 1)));
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }, [size.width, size.height, fontsReady]);
  useEffect(() => () => text?.dispose(), [text]);

  const u = useMemo(
    () => ({
      uTime: { value: 2.4 },
      uPush: { value: 0 },
      uCam: { value: new THREE.Vector3() },
    }),
    [],
  );
  const mats = useMemo(() => {
    const height = new THREE.ShaderMaterial({ vertexShader: SHEET_VERT, fragmentShader: HEIGHT_FRAG, uniforms: u, side: THREE.DoubleSide });
    const film = new THREE.ShaderMaterial({
      vertexShader: SHEET_VERT,
      fragmentShader: FILM_FRAG,
      uniforms: u,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const posterMat = new THREE.ShaderMaterial({
      vertexShader: POSTER_VERT,
      fragmentShader: POSTER_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uText: { value: null },
        uHeight: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uCurve: { value: 0.6 },
      },
    });
    return { height, film, poster: posterMat };
  }, [u]);
  const geo = useMemo(() => new THREE.PlaneGeometry(0.8, 1, 200, 100), []);
  useEffect(
    () => () => {
      mats.height.dispose();
      mats.film.dispose();
      mats.poster.dispose();
      geo.dispose();
    },
    [mats, geo],
  );
  useEffect(() => invalidate(), [text, invalidate]);

  useFrame((state, dt) => {
    const s = sheet.current;
    const p = poster.current;
    if (!s || !p || !text) return;
    u.uTime.value = reduced ? 2.4 : state.clock.elapsedTime + 2.4;
    push.current *= Math.pow(0.9, dt * 60);
    smoothPush.current += (Math.min(1, push.current) - smoothPush.current) * Math.min(1, dt * 5);
    u.uPush.value = reduced ? 0 : smoothPush.current;
    u.uCam.value.copy(camera.position);

    const fit = Math.min(1.15, (viewport.width * 0.62) / 0.8, (viewport.height * 0.8) / 1);
    s.scale.setScalar(fit);
    const hp = hero.current;
    s.position.x = hp * viewport.width * 0.78;
    s.position.y = -hp * viewport.height * 0.05;
    s.rotation.z = -0.05 + hp * 0.12;
    s.rotation.y = reduced ? -0.18 : Math.sin(u.uTime.value * 0.35) * 0.12 - 0.12;
    s.rotation.x = reduced ? 0.08 : Math.sin(u.uTime.value * 0.27) * 0.08;

    tmp.copy(s.position).project(camera);
    mats.poster.uniforms.uCenter.value.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);
    gl.getDrawingBufferSize(drawBuf);
    mats.poster.uniforms.uRes.value.copy(drawBuf);
    mats.poster.uniforms.uText.value = text;
    mats.poster.uniforms.uHeight.value = fbo.texture;

    // pass 1: height map
    p.visible = false;
    s.material = mats.height;
    gl.setRenderTarget(fbo);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, camera);
    // pass 2: poster + visible film
    gl.setRenderTarget(null);
    gl.setClearColor(0xf5f5f5, 1);
    p.visible = true;
    s.material = mats.film;
    gl.clear();
    gl.render(scene, camera);
  }, 1);

  return (
    <>
      <mesh ref={poster} material={mats.poster} frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={sheet} geometry={geo} material={mats.film} renderOrder={1} />
    </>
  );
}

/* ─────────────────────────────── chapter plates ─────────────────────────────── */

function rectsFor(mode: Mode, w: number, h: number) {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  if (mode === 'slats') {
    const n = 10;
    for (let i = 0; i < n; i++) out.push({ x: 0, y: (i * h) / n, w, h: h / n + 1 });
  } else if (mode === 'columns') {
    const n = 12;
    for (let i = 0; i < n; i++) out.push({ x: (i * w) / n, y: 0, w: w / n + 1, h });
  } else {
    const rows = 6;
    const cols = Math.max(3, Math.round((rows * w) / Math.max(1, h)));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: (c * w) / cols, y: (r * h) / rows, w: w / cols + 1, h: h / rows + 1 });
  }
  return out;
}

function Plate({ ch, w, h, idx }: { ch: (typeof CHAPTERS)[number]; w: number; h: number; idx: number }) {
  const id = useId().replace(/:/g, '');
  const rects = useMemo(() => rectsFor(ch.mode, w, h), [ch.mode, w, h]);
  const crop = w < h * 0.9 && ch.cropP ? ch.cropP : ch.crop;
  return (
    <div data-plate={idx} className="invisible absolute inset-0">
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}>
            <rect x="0" y="0" width={w} height={h} fill="black" />
            <g>
              {rects.map((r, i) => (
                <rect key={i} data-cell x={r.x} y={r.y} width={r.w} height={r.h} fill="white" />
              ))}
            </g>
          </mask>
          {/* top scrim: keeps the mix-blend-difference progress labels legible on bright plates */}
          <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#080808" stopOpacity="0.55" />
            <stop offset="1" stopColor="#080808" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g mask={`url(#m${id})`}>
          <svg x="0" y="0" width={w} height={h} viewBox={crop.slice(0, 4).join(' ')} preserveAspectRatio={w > h ? 'xMaxYMid slice' : 'xMidYMid slice'}>
            <image href={ch.img} width={crop[4]} height={crop[5]} style={{ filter: 'grayscale(1) contrast(1.18) brightness(0.96)' }} />
          </svg>
          <rect x="0" y="0" width={w} height={h} fill="#080808" opacity="0.1" />
          <rect x="0" y="0" width={w} height={Math.max(96, h * 0.2)} fill={`url(#s${id})`} />
        </g>
      </svg>
      <div
        data-text
        className="invisible absolute inset-0 flex items-center bg-gradient-to-r from-[var(--v-bg)] via-[var(--v-bg)]/75 to-transparent px-[6cqw] @max-[620px]:items-end @max-[620px]:bg-gradient-to-t @max-[620px]:pb-[max(76px,12cqh)]"
      >
        <div className="max-w-[min(520px,78cqw)]">
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
            [{ch.n}] <span className="text-[var(--v-ink)]">/{ch.mode}</span>
          </p>
          <h3 className="mt-[1.6cqh] font-display text-[clamp(30px,min(8cqw,13cqh),112px)] leading-[0.95] italic">{ch.title}</h3>
          <p data-words className="mt-[2.4cqh] font-sans text-[clamp(13px,min(2.1cqw,3.6cqh),21px)] leading-[1.5] text-[var(--v-ink)]">
            {ch.text}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── the experience ─────────────────────────────── */

export default function PinnedChapters({ active, reducedMotion, progress }: ExperienceProps) {
  const root = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(stage);
  const fontsReady = useFontsReady();
  const hero = useRef({ v: 0 });
  const heroCur = useRef(0);
  const push = useRef(0);
  const last = useRef({ x: 0, y: 0, t: 0 });
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const [heroGone, setHeroGone] = useState(false);
  const invalidateRef = useRef<(() => void) | null>(null);
  const driven = progress !== undefined;

  // Build the single scrubbed timeline once the stage has a size.
  useLayoutEffect(() => {
    if (!w || !h || !root.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        paused: true,
        defaults: { ease: 'none' },
        onUpdate: () => {
          heroCur.current = hero.current.v;
          const gone = tl.time() > T.open[0] + 1.05;
          setHeroGone((g) => (g === gone ? g : gone));
          invalidateRef.current?.();
        },
      });
      tl.to(hero.current, { v: 1, duration: T.heroEnd }, 0);
      tl.to('[data-hint]', { autoAlpha: 0, duration: 0.4 }, 0);

      const plates = gsap.utils.toArray<HTMLElement>('[data-plate]');
      const segs = gsap.utils.toArray<HTMLElement>('[data-seg]');
      plates.forEach((plate, i) => {
        const ch = CHAPTERS[i];
        const cells = plate.querySelectorAll<SVGRectElement>('[data-cell]');
        const text = plate.querySelector<HTMLElement>('[data-text]')!;
        const para = plate.querySelector<HTMLElement>('[data-words]')!;
        const at = T.open[i];
        gsap.set(plate, { visibility: 'visible' });
        if (reducedMotion) {
          // reduced motion: a plain crossfade, words already lit
          tl.fromTo(plate, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, at);
          tl.fromTo(text, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, at + 0.4);
        } else {
          const split = new SplitText(para, { type: 'words' });
          if (ch.mode === 'slats') {
            gsap.set(cells, { scaleY: 0, transformOrigin: '50% 0%' });
            tl.to(cells, { scaleY: 1, duration: 0.55, ease: 'power2.inOut', stagger: { each: 0.05, from: 'end' } }, at);
          } else if (ch.mode === 'grid') {
            gsap.set(cells, { scale: 0, transformOrigin: '50% 50%' });
            tl.to(cells, { scale: 1, duration: 0.4, ease: 'power2.out', stagger: { amount: 0.75, from: 'random' } }, at);
          } else {
            gsap.set(cells, { scaleX: 0, transformOrigin: '0% 50%' });
            tl.to(cells, { scaleX: 1, duration: 0.5, ease: 'power3.inOut', stagger: { each: 0.045, from: 'start' } }, at);
          }
          tl.fromTo(text, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' }, at + 0.55);
          gsap.set(split.words, { opacity: 0.15 });
          tl.to(split.words, { opacity: 1, duration: 0.2, stagger: T.wordsLen / Math.max(1, split.words.length) }, T.words[i]);
        }
        if (i > 0) {
          const prev = plates[i - 1].querySelector<HTMLElement>('[data-text]')!;
          tl.to(prev, { autoAlpha: 0, duration: 0.35 }, at);
        }
        const segEnd = i < 2 ? T.open[i + 1] : T.hold;
        tl.fromTo(segs[i], { scaleX: 0 }, { scaleX: 1, duration: segEnd - at }, at);
      });
      tl.to({}, { duration: 0.001 }, T.end);
      tlRef.current = tl;

      if (!driven && wrapper.current && content.current) {
        ScrollTrigger.create({
          scroller: wrapper.current,
          trigger: content.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: reducedMotion ? true : 0.35,
          animation: tl,
        });
      }
    }, root);
    return () => {
      tlRef.current = null;
      ctx.revert();
    };
  }, [w, h, reducedMotion, driven]);

  // Parent-driven progress (e.g. the home journey).
  useEffect(() => {
    if (driven && tlRef.current) tlRef.current.progress(Math.min(1, Math.max(0, progress!)));
  }, [driven, progress, w, h]);

  // Lenis smooths the inner scroller; paused when off screen.
  useEffect(() => {
    if (driven || !wrapper.current || !content.current) return;
    const lenis = new Lenis({
      wrapper: wrapper.current,
      content: content.current,
      eventsTarget: wrapper.current,
      lerp: reducedMotion ? 1 : 0.09,
      autoRaf: false,
      syncTouch: false,
    });
    lenis.on('scroll', ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    if (!active) lenis.stop();
    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, [driven, reducedMotion, active]);

  const onPointerMove = (e: React.PointerEvent) => {
    const now = performance.now();
    const l = last.current;
    const dt = Math.max(8, now - l.t);
    const v = Math.hypot(e.clientX - l.x, e.clientY - l.y) / dt; // px per ms
    if (l.t) push.current = Math.min(1.4, push.current + v * 0.18);
    last.current = { x: e.clientX, y: e.clientY, t: now };
  };

  const frameloop = !active || heroGone ? 'never' : reducedMotion ? 'demand' : 'always';

  return (
    <div
      ref={root}
      onPointerMove={onPointerMove}
      className="relative h-full w-full overflow-hidden bg-[var(--v-bg)] text-[var(--v-ink)]"
      style={{ containerType: 'size' }}
    >
      <h2 className="sr-only">Pinned Chapters: a scroll story in three chapters</h2>
      <div ref={wrapper} className={`absolute inset-0 overflow-x-hidden ${driven ? 'overflow-y-hidden' : 'overflow-y-auto'} ${NO_SCROLLBAR}`}>
        <div ref={content} className="relative w-full" style={{ height: '900%' }}>
          <div ref={stage} className="sticky top-0 w-full overflow-hidden" style={{ height: `${100 / 9}%` }}>
            <div className="absolute inset-0 bg-[#f5f5f5]">
              <Canvas
                dpr={[1, 1.75]}
                flat
                linear
                frameloop={frameloop}
                camera={{ position: [0, 0, 2.2], fov: 35 }}
                gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
                onCreated={(s) => {
                  invalidateRef.current = s.invalidate;
                }}
              >
                <Hero hero={heroCur} push={push} reduced={reducedMotion} fontsReady={fontsReady} />
              </Canvas>
            </div>
            <p
              data-hint
              className="pixel pointer-events-none absolute bottom-[max(12px,5%)] left-1/2 -translate-x-1/2 bg-[#080808] px-2 py-1 text-[16px] leading-[16px] whitespace-nowrap text-[#f5f5f5]"
            >
              scroll ↓ three chapters
            </p>
            {w > 0 && CHAPTERS.map((ch, i) => <Plate key={ch.n} ch={ch} w={w} h={h} idx={i} />)}
            <div className="pointer-events-none absolute top-3 right-3 z-20 flex gap-2 mix-blend-difference">
              {CHAPTERS.map((ch) => (
                <div key={ch.n} className="w-10 @min-[560px]:w-16">
                  <div className="h-[3px] overflow-hidden bg-white/30">
                    <div data-seg className="h-full origin-left scale-x-0 bg-white" />
                  </div>
                  <p className="pixel mt-1 text-[16px] leading-[16px] text-white">{ch.n}</p>
                </div>
              ))}
            </div>
            <G4Label title="Pinned Chapters" tools={TOOLS} />
          </div>
        </div>
      </div>
    </div>
  );
}
