'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
// type-only: brings in R3F's JSX element types (<mesh>, <points>) without bundling it here
import type {} from '@react-three/fiber';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import type { ExperienceProps } from '@/lib/experiences/types';
import { G4Label, NO_SCROLLBAR, PIXEL_FONT, cssFont, seeded, useFontsReady, useSize } from './g4-shared';

gsap.registerPlugin(SplitText);

/*
 * Type Vortex: an endless dive down a funnel of type rings.
 *  - 3D: 16 open cylinders (axis on z) carry a repeated-phrase CanvasTexture (fract(uv.x * repeat)).
 *    Letter-spaced pixel rows and tight italic rows alternate and spin in opposite directions. Each
 *    ring's depth is mod(i * spacing - travel, total), so rings that pass the camera wrap to the back.
 *    Radius tapers and brightness falls off with depth; the vanishing point lerps to the pointer (0.07).
 *  - SVG: concentric <textPath> rings frame the chapter headline, spun by GSAP; scroll velocity
 *    pushes their depth. A GSAP 'descend' timeline plays each chapter change.
 *  - ASCII variant: Canvas2D, the same 16 depths projected as superellipses (pow(abs, 0.5)) onto a
 *    13px cell grid with a per-cell depth buffer and the ramp ' .:-=+*#%@'. Phrase letters are laid
 *    one per cell by arc length and crawl around the ring as it spins.
 *  - Loading: three + R3F arrive in their own chunk. Until the first 3D frame is drawn, a CSS-only
 *    dive of SVG text rings (runs even before hydration) and a CSS spin on the header stand in.
 */

type Lib = { T: typeof import('three'); R: typeof import('@react-three/fiber') };
let lib: Lib | null = null;
let libPromise: Promise<Lib> | null = null;
function loadLib() {
  libPromise ??= Promise.all([import('three'), import('@react-three/fiber')]).then(([T, R]) => (lib = { T, R }));
  return libPromise;
}
if (typeof window !== 'undefined') void loadLib();

const TOOLS = ['r3f', 'drei', 'canvas2d', 'svg', 'gsap', 'lenis', 'glsl'];
const RINGS = 16;
const SPACING = 0.95;
const TOTAL = RINGS * SPACING;
const NEAR = 0.25;
const CH_LEN = 11; // travel units per chapter
const CHAPTERS = ['Descend', 'Tracking', 'Leading', 'Kerning', 'Measure', 'Baseline'];
const RAMP = ' .:-=+*#%@';
const PHRASE_A = 'TYPE VORTEX · DESCEND · ';
const PHRASE_B = 'letters fall into the dark, ';
const ASCII_TILT = 0.16; // vanishing-point travel in the ASCII tunnel, as a share of the grid

/* CSS motion that works before hydration: header rings spin, placeholder rings dive. */
const CSS = `
@keyframes tv-rot{to{transform:rotate(360deg)}}
@keyframes tv-rot-r{to{transform:rotate(-360deg)}}
@keyframes tv-dive{0%{transform:scale(.12) rotate(0deg);opacity:0}25%{opacity:.62}100%{transform:scale(3) rotate(var(--tv-turn));opacity:0}}
.tv-spin{animation:tv-rot var(--tv-dur) linear infinite}
.tv-spin-r{animation:tv-rot-r var(--tv-dur) linear infinite}
.tv-dive{animation:tv-dive 7.2s cubic-bezier(.6,0,.95,.55) infinite}
@media (prefers-reduced-motion: reduce){.tv-spin,.tv-spin-r,.tv-dive{animation:none}}
.tv-still .tv-spin,.tv-still .tv-spin-r,.tv-still .tv-dive{animation:none}
`;

type State = {
  travel: number;
  auto: number;
  vel: number;
  boost: number;
  tx: number;
  ty: number;
  ptx: number;
  pty: number;
  spin: number;
  spinTarget: number;
  angles: number[];
};

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uRepeat;
uniform float uFade;
varying vec2 vUv;
void main(){
  vec2 uv = vec2(fract((1.0 - vUv.x) * uRepeat), vUv.y);
  vec4 t = texture2D(uMap, uv);
  float a = t.a * uFade;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(0.96) * a, a);
}`;

function phraseTexture(T: Lib['T'], kind: 'a' | 'b') {
  const H = 128;
  const c = document.createElement('canvas');
  const x = c.getContext('2d')!;
  const font = kind === 'a' ? `64px ${PIXEL_FONT}` : `italic 400 88px ${cssFont('--font-display', 'Georgia, serif')}`;
  const phrase = kind === 'a' ? PHRASE_A : PHRASE_B;
  x.font = font;
  if (kind === 'a') (x as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '22px';
  const w = Math.ceil(x.measureText(phrase).width);
  c.width = w;
  c.height = H;
  x.font = font;
  if (kind === 'a') (x as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '22px';
  x.fillStyle = '#ffffff';
  x.textBaseline = 'middle';
  x.fillText(phrase, 0, H / 2 + (kind === 'a' ? 4 : 6));
  x.globalAlpha = 0.35;
  x.fillRect(0, 6, w, 2);
  x.fillRect(0, H - 8, w, 2);
  const t = new T.CanvasTexture(c);
  t.minFilter = T.LinearFilter;
  t.generateMipmaps = false;
  t.anisotropy = 4;
  return { tex: t, aspect: w / H };
}

function Vortex({
  lib: { T, R },
  st,
  fontsReady,
  headerRef,
  onReady,
}: {
  lib: Lib;
  st: React.RefObject<State>;
  fontsReady: boolean;
  headerRef: React.RefObject<HTMLDivElement | null>;
  onReady: () => void;
}) {
  const { camera, size, invalidate } = R.useThree();
  const BAND = 0.2;
  const geo = useMemo(() => {
    const g = new T.CylinderGeometry(1, 1, BAND, 192, 1, true);
    g.rotateX(Math.PI / 2);
    return g;
  }, [T]);
  const texs = useMemo(() => (fontsReady ? { a: phraseTexture(T, 'a'), b: phraseTexture(T, 'b') } : null), [T, fontsReady]);
  const mats = useMemo(
    () =>
      Array.from(
        { length: RINGS },
        () =>
          new T.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: FRAG,
            side: T.BackSide,
            transparent: true,
            depthWrite: false,
            blending: T.AdditiveBlending,
            uniforms: { uMap: { value: null }, uRepeat: { value: 1 }, uFade: { value: 0 } },
          }),
      ),
    [T],
  );
  // set when the textures are bound; the next rendered frame is the first real one
  const armed = useRef(false);
  const readyFired = useRef(false);
  useEffect(() => {
    if (!texs) return;
    const circumference = (Math.PI * 2) / BAND; // in band heights
    mats.forEach((m, i) => {
      const t = i % 2 ? texs.b : texs.a;
      m.uniforms.uMap.value = t.tex;
      m.uniforms.uRepeat.value = Math.max(1, Math.round(circumference / t.aspect));
    });
    armed.current = true;
    // guaranteed render with the textures bound, also under reduced motion (frameloop 'demand')
    invalidate();
    const raf = requestAnimationFrame(() => invalidate());
    return () => {
      cancelAnimationFrame(raf);
      armed.current = false;
      texs.a.tex.dispose();
      texs.b.tex.dispose();
    };
  }, [texs, mats, invalidate]);
  // re-render on resize so the reduced still follows the container
  useEffect(() => invalidate(), [size.width, size.height, invalidate]);

  const dust = useMemo(() => {
    const n = 520;
    const r = seeded(7);
    const base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const rad = 0.2 + Math.sqrt(r()) * 1.4;
      base[i * 3] = Math.cos(a) * rad;
      base[i * 3 + 1] = Math.sin(a) * rad;
      base[i * 3 + 2] = r() * TOTAL;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
    return { g, base, n };
  }, [T]);
  const dustMat = useMemo(
    () => new T.PointsMaterial({ color: '#b0b0b0', size: 0.012, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true }),
    [T],
  );
  useEffect(
    () => () => {
      geo.dispose();
      mats.forEach((m) => m.dispose());
      dust.g.dispose();
      dustMat.dispose();
    },
    [geo, mats, dust, dustMat],
  );

  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const far = useMemo(() => new T.Vector3(), [T]);

  R.useFrame(() => {
    const s = st.current;
    const fit = Math.min(1, Math.max(0.42, size.width / Math.max(1, size.height)));
    for (let i = 0; i < RINGS; i++) {
      const m = rings.current[i];
      if (!m) continue;
      const d = (((i * SPACING - s.travel) % TOTAL) + TOTAL) % TOTAL;
      const dn = d / TOTAL;
      const r = 1.7 * fit * (1 - 0.42 * dn);
      m.scale.setScalar(r);
      m.position.set(s.tx * dn * 2.1, s.ty * dn * 1.3, -(NEAR + d));
      m.rotation.z = s.angles[i];
      mats[i].uniforms.uFade.value = Math.pow(1 - dn, 1.15) * T.MathUtils.smoothstep(dn, 0.02, 0.1);
    }
    const pos = dust.g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dust.n; i++) {
      const d = (((dust.base[i * 3 + 2] - s.travel * 0.85) % TOTAL) + TOTAL) % TOTAL;
      const dn = d / TOTAL;
      pos.setXYZ(i, dust.base[i * 3] * fit * (1 - 0.45 * dn) + s.tx * dn * 2.1, dust.base[i * 3 + 1] * fit * (1 - 0.45 * dn) + s.ty * dn * 1.3, -(NEAR + d));
    }
    pos.needsUpdate = true;
    // keep the SVG headline on the vanishing point
    far.set(s.tx * 0.8 * 2.1, s.ty * 0.8 * 1.3, -(NEAR + TOTAL * 0.8)).project(camera);
    const h = headerRef.current;
    if (h) h.style.transform = `translate(${(far.x * size.width) / 2}px, ${(-far.y * size.height) / 2}px)`;
    if (armed.current && !readyFired.current) {
      readyFired.current = true;
      // this frame renders right after the callback; hand over from the placeholder once it is on screen
      requestAnimationFrame(onReady);
    }
  });

  return (
    <>
      {mats.map((m, i) => (
        <mesh
          key={i}
          ref={(el) => {
            rings.current[i] = el;
          }}
          geometry={geo}
          material={m}
          frustumCulled={false}
        />
      ))}
      <points geometry={dust.g} material={dustMat} frustumCulled={false} />
    </>
  );
}

/* ASCII variant: rounded-rect tunnel on a 13px grid with a depth buffer. */
function drawAscii(ctx: CanvasRenderingContext2D, W: number, H: number, s: State, font: string) {
  const cell = 13;
  const cols = Math.floor(W / cell);
  const rows = Math.floor(H / cell);
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, W, H);
  if (cols < 4 || rows < 4) return;
  const depth = new Float32Array(cols * rows).fill(1e9);
  const chars = new Array<string>(cols * rows);
  const bright = new Float32Array(cols * rows);
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const focal = Math.min(cols, rows) * 0.56;
  // the tunnel follows the stage shape, within limits (wide on desktop, tall on phones)
  const sx = Math.min(1.8, Math.max(1, (cols / rows) * 0.95));
  const sy = Math.min(1.8, Math.max(1, (rows / cols) * 0.95));
  for (let j = 0; j < RINGS; j++) {
    const d = ((((j * SPACING - s.travel) % TOTAL) + TOTAL) % TOTAL) + NEAR;
    const dn = (d - NEAR) / TOTAL;
    const sc = focal / (d + 0.35);
    const a = sc * sx;
    const b = sc * sy;
    // near rings would only clip into single-column streaks at the edges: drop them
    if (a > cols / 2 - 1 || b > rows / 2 - 1) continue;
    if (b < 1.5) continue;
    const ox = s.tx * dn * cols * ASCII_TILT;
    const oy = -s.ty * dn * rows * ASCII_TILT;
    // fade in from the far end and out before a ring reaches the edge, so rings never pop
    const edge = Math.min(1, (cols / 2 - 1 - a) / (cols * 0.1), (rows / 2 - 1 - b) / (rows * 0.1));
    const br = Math.pow(1 - dn, 1.3) * Math.min(1, (a - 2) / 6) * edge;
    if (br < 0.04) continue;
    const lettered = j % 4 === 0 || j % 2 === 1; // PHRASE_A every 4th ring, PHRASE_B on odd rings, ramp between
    const spaced = j % 4 === 0; // letter-spaced rows (a dot between letters) vs tight rows
    const text = spaced ? PHRASE_A : PHRASE_B;
    // dense samples, then one letter per new cell: letters are indexed by arc length, not by angle
    const n = Math.ceil(16 * (a + b)) + 32;
    const perimeter = 4 * (a + b); // cells, near enough for a rounded rect
    const crawl = Math.floor((s.angles[j] / (Math.PI * 2)) * perimeter);
    let last = -1;
    let idx = 0;
    const visit = (gx: number, gy: number) => {
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return;
      const id = gy * cols + gx;
      if (id === last) return;
      last = id;
      const step = idx++;
      if (d >= depth[id]) return;
      depth[id] = d;
      let ch: string;
      if (lettered && br > 0.22) {
        const q = step - crawl;
        if (spaced && ((q % 2) + 2) % 2 === 1) ch = RAMP[1];
        else {
          const li = spaced ? Math.floor(q / 2) : q;
          ch = text[((li % text.length) + text.length) % text.length];
          if (ch === ' ') ch = RAMP[1];
        }
        bright[id] = Math.min(1, br * 1.25);
      } else {
        ch = RAMP[Math.max(1, Math.round(br * (RAMP.length - 1)))];
        bright[id] = br * 0.85;
      }
      chars[id] = ch;
    };
    let px = 0;
    let py = 0;
    for (let k = 0; k <= n; k++) {
      const th = Math.PI + (k / n) * Math.PI * 2; // start at the left so the top edge reads left to right
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const gx = Math.round(cx + ox + a * Math.sign(c) * Math.pow(Math.abs(c), 0.5));
      const gy = Math.round(cy + oy + b * Math.sign(sn) * Math.pow(Math.abs(sn), 0.5));
      // pow(abs, 0.5) is steep near the axes: fill skipped cells so the letter run has no holes
      const gap = k ? Math.max(Math.abs(gx - px), Math.abs(gy - py)) : 0;
      for (let t = 1; t < gap; t++) visit(Math.round(px + ((gx - px) * t) / gap), Math.round(py + ((gy - py) * t) / gap));
      visit(gx, gy);
      px = gx;
      py = gy;
    }
  }
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const buckets = 6;
  for (let bk = 1; bk <= buckets; bk++) {
    const lo = (bk - 1) / buckets;
    const hi = bk / buckets;
    ctx.fillStyle = `rgba(245,245,245,${(0.14 + 0.86 * hi).toFixed(3)})`;
    for (let id = 0; id < depth.length; id++) {
      if (depth[id] > 1e8) continue;
      const v = bright[id];
      if (v <= lo || v > hi) continue;
      const ch = chars[id];
      if (!ch || ch === ' ') continue;
      ctx.fillText(ch, (id % cols) * cell + cell / 2, Math.floor(id / cols) * cell + cell / 2);
    }
  }
}

function RingSvg({
  spinRefs,
  flyRefs,
  depthRefs,
}: {
  spinRefs: React.RefObject<(SVGGElement | null)[]>;
  flyRefs: React.RefObject<(SVGGElement | null)[]>;
  depthRefs: React.RefObject<(SVGGElement | null)[]>;
}) {
  const rings = [
    { r: 90, text: 'DESCEND · TYPE VORTEX · DESCEND · TYPE VORTEX · DESCEND · TYPE VORTEX · ', size: 9 },
    { r: 75, text: 'letters fall into the dark, letters fall into the dark, ', size: 9.5 },
    { r: 60, text: '· 16 RINGS · ONE LOOP · 16 RINGS · ONE LOOP ', size: 7 },
  ];
  return (
    <svg viewBox="-100 -100 200 200" className="h-full w-full overflow-visible" aria-hidden>
      <defs>
        {rings.map((r, i) => (
          <path key={i} id={`tv-ring-${i}`} d={`M 0 ${-r.r} A ${r.r} ${r.r} 0 1 1 0 ${r.r} A ${r.r} ${r.r} 0 1 1 0 ${-r.r}`} />
        ))}
      </defs>
      {rings.map((r, i) => (
        <g
          key={i}
          ref={(el) => {
            depthRefs.current[i] = el;
          }}
        >
          <g
            ref={(el) => {
              flyRefs.current[i] = el;
            }}
          >
            {/* CSS spins this ring until GSAP takes over after hydration */}
            <g
              ref={(el) => {
                spinRefs.current[i] = el;
              }}
              className={i % 2 ? 'tv-spin-r' : 'tv-spin'}
              style={{ ['--tv-dur' as string]: `${60 + i * 18}s` }}
            >
              <circle r={r.r + r.size * 0.95} fill="none" stroke="#2c2c2c" strokeWidth="0.5" />
              <text
                fill={i === 1 ? '#b0b0b0' : '#f5f5f5'}
                fontSize={r.size}
                letterSpacing={i === 1 ? 0 : r.size * 0.3}
                style={{ fontFamily: i === 1 ? 'var(--font-display)' : 'var(--font-mono)', fontStyle: i === 1 ? 'italic' : 'normal' }}
              >
                <textPath href={`#tv-ring-${i}`} textLength={Math.PI * 2 * r.r - 2} lengthAdjust="spacing">
                  {r.text}
                </textPath>
              </text>
            </g>
          </g>
        </g>
      ))}
      <circle r="50" fill="none" stroke="#2c2c2c" strokeWidth="0.5" strokeDasharray="1 3" />
    </svg>
  );
}

/* Placeholder until the first 3D frame: SVG text rings diving toward the viewer, pure CSS. */
const DIVE = 9;
function DivePlaceholder() {
  return (
    <svg viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
      <defs>
        <path id="tv-dive-path" d="M 0 -40 A 40 40 0 1 1 0 40 A 40 40 0 1 1 0 -40" />
      </defs>
      {Array.from({ length: DIVE }, (_, i) => {
        const t = i / DIVE;
        // reduced motion / still: the rings sit at spread depths
        const still = 0.14 + Math.pow(t, 1.8) * 2.6;
        return (
          <g
            key={i}
            className="tv-dive"
            style={{
              animationDelay: `${(-t * 7.2).toFixed(2)}s`,
              ['--tv-turn' as string]: `${i % 2 ? -40 : 40}deg`,
              transform: `scale(${still.toFixed(3)})`,
              opacity: +(0.15 + 0.45 * (1 - t)).toFixed(3),
            }}
          >
            <text
              fill={i % 2 ? '#b0b0b0' : '#f5f5f5'}
              fontSize={i % 2 ? 6.5 : 5}
              letterSpacing={i % 2 ? 0 : 2}
              style={{ fontFamily: i % 2 ? 'var(--font-display)' : 'var(--font-mono)', fontStyle: i % 2 ? 'italic' : 'normal' }}
            >
              <textPath href="#tv-dive-path" textLength={Math.PI * 80 - 2} lengthAdjust="spacing">
                {i % 2 ? 'letters fall into the dark, letters fall into the dark, ' : 'TYPE VORTEX · DESCEND · TYPE VORTEX · DESCEND · '}
              </textPath>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function TypeVortex({ active, reducedMotion, progress }: ExperienceProps) {
  const root = useRef<HTMLDivElement>(null);
  const proxy = useRef<HTMLDivElement>(null);
  const proxyContent = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const headline = useRef<HTMLHeadingElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const ascii = useRef<HTMLCanvasElement>(null);
  const spinRefs = useRef<(SVGGElement | null)[]>([]);
  const flyRefs = useRef<(SVGGElement | null)[]>([]);
  const depthRefs = useRef<(SVGGElement | null)[]>([]);
  const [mode, setMode] = useState<'3d' | 'ascii'>('3d');
  const [three, setThree] = useState<Lib | null>(null);
  const [ready3d, setReady3d] = useState(false);
  const fontsReady = useFontsReady();
  const { w, h } = useSize(root);
  const invalidateRef = useRef<(() => void) | null>(null);
  const driven = progress !== undefined;
  const progressRef = useRef(progress ?? 0);
  progressRef.current = progress ?? 0;
  const st = useRef<State>({
    travel: 3.3,
    auto: 3.3,
    vel: 0,
    boost: 1,
    tx: 0,
    ty: 0,
    ptx: 0,
    pty: 0,
    spin: 1,
    spinTarget: 1,
    angles: Array.from({ length: RINGS }, (_, i) => i * 0.7),
  });

  useEffect(() => {
    let live = true;
    loadLib().then((l) => live && setThree(l));
    return () => {
      live = false;
    };
  }, []);

  // Main loop: Lenis scroll + auto travel + pointer lerp + ring spin + chapter descends + ASCII draw.
  useEffect(() => {
    const s = st.current;
    const lenis =
      driven || !proxy.current || !proxyContent.current
        ? null
        : new Lenis({
            wrapper: proxy.current,
            content: proxyContent.current,
            eventsTarget: proxy.current,
            infinite: true,
            syncTouch: true,
            lerp: reducedMotion ? 1 : 0.08,
            autoRaf: false,
          });
    if (!active) lenis?.stop();
    const speeds = Array.from({ length: RINGS }, (_, i) => (0.08 + ((i * 37) % 11) * 0.018) * (i % 2 ? -1 : 1));
    let chapter = Math.floor(s.travel / CH_LEN);
    let playing: gsap.core.Timeline | null = null;
    const ctx = gsap.context(() => {}, root);

    const setHeadline = (n: number) => {
      const el = headline.current;
      if (el) el.textContent = CHAPTERS[((n % CHAPTERS.length) + CHAPTERS.length) % CHAPTERS.length];
      if (counter.current) counter.current.textContent = String((((n % CHAPTERS.length) + CHAPTERS.length) % CHAPTERS.length) + 1).padStart(2, '0');
    };
    setHeadline(chapter);

    const descend = (n: number) => {
      if (reducedMotion || !headline.current) {
        setHeadline(n);
        return;
      }
      playing?.progress(1);
      ctx.add(() => {
        const fly = flyRefs.current.filter(Boolean) as SVGGElement[];
        const out = new SplitText(headline.current!, { type: 'chars' });
        const tl = gsap.timeline({ onComplete: () => (playing = null) });
        tl.to(s, { boost: 5, duration: 0.55, ease: 'power2.in' }, 0)
          .to(fly, { scale: 2.4, opacity: 0, duration: 0.7, ease: 'power3.in', stagger: 0.06, svgOrigin: '0 0' }, 0)
          .to(out.chars, { yPercent: -110, opacity: 0, duration: 0.4, ease: 'power2.in', stagger: 0.025 }, 0)
          .add(() => {
            out.revert();
            setHeadline(n);
            const inn = new SplitText(headline.current!, { type: 'chars' });
            gsap.fromTo(
              inn.chars,
              { yPercent: 110, opacity: 0 },
              { yPercent: 0, opacity: 1, duration: 0.8, ease: 'expo.out', stagger: 0.03, onComplete: () => inn.revert() },
            );
          }, 0.72)
          .fromTo(fly, { scale: 0.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.1, ease: 'expo.out', stagger: 0.08, svgOrigin: '0 0' }, 0.8)
          .to(s, { boost: 1, duration: 1.3, ease: 'power2.out' }, 0.75);
        playing = tl;
      });
    };

    // SVG rings spin forever, alternating direction. CSS spins them until now: take over at the same angle.
    const spins = spinRefs.current.filter(Boolean) as SVGGElement[];
    spins.forEach((g) => {
      if (g.dataset.gsap === '1') return;
      const t = getComputedStyle(g).transform;
      let angle = 0;
      if (t && t !== 'none') {
        const m = new DOMMatrix(t);
        angle = (Math.atan2(m.b, m.a) * 180) / Math.PI;
      }
      g.style.animation = 'none';
      g.dataset.gsap = '1';
      gsap.set(g, { rotation: angle, svgOrigin: '0 0' });
    });
    const spinTweens = reducedMotion
      ? []
      : spins.map((g, i) => gsap.to(g, { rotation: `${i % 2 ? '-' : '+'}=360`, svgOrigin: '0 0', duration: 60 + i * 18, ease: 'none', repeat: -1 }));
    const depthSet = (depthRefs.current.filter(Boolean) as SVGGElement[]).map((g) => {
      gsap.set(g, { svgOrigin: '0 0' });
      return gsap.quickSetter(g, 'scale');
    });

    let lastLenis = lenis?.animatedScroll ?? 0;
    const asciiFont = `13px ${cssFont('--font-mono', 'monospace')}`;
    const tick = (_time: number, dtMs: number) => {
      const dt = Math.min(0.05, dtMs / 1000);
      if (driven) {
        s.travel = 3.3 + progressRef.current * CH_LEN * 5.5;
      } else {
        lenis?.raf(performance.now());
        const cur = lenis?.animatedScroll ?? 0;
        const dScroll = cur - lastLenis;
        lastLenis = cur;
        if (!reducedMotion) s.auto += dt * 0.75 * s.boost;
        s.travel = s.auto + cur * 0.004;
        s.vel += (gsap.utils.clamp(-1, 1, dScroll / 40) - s.vel) * 0.1;
      }
      const k = reducedMotion ? 1 : 0.07;
      s.tx += (s.ptx - s.tx) * k;
      s.ty += (s.pty - s.ty) * k;
      s.spin += (s.spinTarget - s.spin) * (reducedMotion ? 1 : 0.05);
      if (!reducedMotion) for (let i = 0; i < RINGS; i++) s.angles[i] += speeds[i] * s.spin * dt * (0.6 + s.boost * 0.4);
      depthSet.forEach((set, i) => set(1 + s.vel * (0.1 + i * 0.07)));
      spinTweens.forEach((t) => t.timeScale(s.spin * (1 + Math.abs(s.vel) * 6)));
      const ch = Math.floor(s.travel / CH_LEN);
      if (ch !== chapter) {
        chapter = ch;
        descend(ch);
      }
      invalidateRef.current?.();
      if (ascii.current && ascii.current.dataset.on === '1') {
        const c = ascii.current;
        const g = c.getContext('2d');
        if (g) {
          const dpr = Math.min(1.75, window.devicePixelRatio || 1);
          const W = c.clientWidth;
          const H = c.clientHeight;
          if (c.width !== Math.round(W * dpr)) c.width = Math.round(W * dpr);
          if (c.height !== Math.round(H * dpr)) c.height = Math.round(H * dpr);
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawAscii(g, W, H, s, asciiFont);
          if (header.current) {
            // headline sits on the tunnel's vanishing point (the far rings), same tilt as drawAscii
            const cols = Math.floor(W / 13);
            const rows = Math.floor(H / 13);
            header.current.style.transform = `translate(${s.tx * 0.8 * cols * ASCII_TILT * 13}px, ${-s.ty * 0.8 * rows * ASCII_TILT * 13}px)`;
          }
        }
      }
    };
    let still: (() => void) | null = null;
    if (reducedMotion) {
      // composed still: one frame now, and again only when the input changes
      still = () => tick(0, 16);
      still();
      lenis?.on('scroll', () => still?.());
      // settle the still over the first frames (canvas sizing); the 3D scene also renders itself once
      // its textures are bound, whenever the lazily loaded Canvas arrives
      let frames = 0;
      const settle = () => {
        still?.();
        if (++frames > 90) gsap.ticker.remove(settle);
      };
      gsap.ticker.add(settle);
      return () => {
        gsap.ticker.remove(settle);
        lenis?.destroy();
        ctx.revert();
      };
    }
    if (active) gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      spinTweens.forEach((t) => t.kill());
      playing?.kill();
      lenis?.destroy();
      ctx.revert();
    };
  }, [active, reducedMotion, driven, mode, fontsReady, w, h, three]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (reducedMotion) return;
    const r = root.current!.getBoundingClientRect();
    st.current.ptx = gsap.utils.clamp(-1, 1, ((e.clientX - r.left) / r.width) * 2 - 1);
    st.current.pty = gsap.utils.clamp(-1, 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  };
  const onPointerLeave = () => {
    st.current.ptx = 0;
    st.current.pty = 0;
  };
  const onClick = () => {
    st.current.spinTarget *= -1;
  };

  const frameloop = !active || mode !== '3d' ? 'never' : 'demand';
  const Canvas = three?.R.Canvas;

  return (
    <div
      ref={root}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      className={`relative h-full w-full overflow-hidden bg-[var(--v-bg)] text-[var(--v-ink)] select-none ${reducedMotion || !active ? 'tv-still' : ''}`}
      style={{ containerType: 'size' }}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className={`absolute inset-0 ${mode === '3d' ? '' : 'invisible'}`}>
        {Canvas && three && (
          <Canvas
            dpr={[1, 1.75]}
            flat
            linear
            frameloop={frameloop}
            camera={{ position: [0, 0, 0], fov: 70, near: 0.05, far: 40 }}
            gl={{ antialias: true, alpha: false }}
            onCreated={(s) => {
              s.gl.setClearColor(new three.T.Color(8 / 255, 8 / 255, 8 / 255), 1);
              invalidateRef.current = s.invalidate;
              s.invalidate();
            }}
          >
            <Vortex lib={three} st={st} fontsReady={fontsReady} headerRef={header} onReady={() => setReady3d(true)} />
          </Canvas>
        )}
      </div>
      {/* CSS dive of text rings: moves before hydration and while three.js loads, then fades out */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${ready3d || mode !== '3d' ? 'opacity-0' : 'opacity-100'}`}
        aria-hidden
      >
        <DivePlaceholder />
      </div>
      <canvas ref={ascii} data-on={mode === 'ascii' ? '1' : '0'} className={`absolute inset-0 h-full w-full ${mode === 'ascii' ? '' : 'hidden'}`} />

      {/* SVG ring funnel + chapter headline, glued to the vanishing point */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div ref={header} className="relative grid aspect-square w-[min(46cqh,66cqw)] place-items-center will-change-transform">
          <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle,#080808_50%,transparent_71%)]" />
          <div className="absolute inset-0">
            <RingSvg spinRefs={spinRefs} flyRefs={flyRefs} depthRefs={depthRefs} />
          </div>
          <div className="relative text-center">
            <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
              ch <span ref={counter}>01</span>/06
            </p>
            <h2 ref={headline} className="mt-1 overflow-hidden font-display text-[clamp(26px,min(7.5cqw,9cqh),84px)] leading-[1.05] italic">
              Descend
            </h2>
          </div>
        </div>
      </div>

      {/* hidden infinite scroller for Lenis */}
      <div
        ref={proxy}
        className={`absolute inset-0 z-10 overflow-y-scroll ${NO_SCROLLBAR} ${driven ? 'pointer-events-none' : ''}`}
        aria-label="Scroll to descend"
      >
        <div ref={proxyContent} style={{ height: '1000%' }} />
      </div>

      {/* controls: the pointer over them does not steer the vanishing point */}
      <div
        className="absolute top-3 right-3 z-30 flex gap-1 bg-[var(--v-bg)]/85 p-1"
        onClick={(e) => e.stopPropagation()}
        onPointerMove={(e) => {
          e.stopPropagation();
          onPointerLeave();
        }}
      >
        {(['3d', 'ascii'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`pixel px-1 text-[16px] leading-[16px] ${mode === m ? 'bg-[var(--v-ink)] text-[var(--v-bg)]' : 'text-[var(--v-soft)] hover:text-[var(--v-ink)]'}`}
          >
            [{m}]
          </button>
        ))}
      </div>
      <p className="pixel pointer-events-none absolute right-3 bottom-3 z-20 bg-[var(--v-bg)]/80 px-2 py-1 text-[16px] leading-[16px] text-[var(--v-dim)]">
        scroll to dive · click to reverse
      </p>
      <G4Label title="Type Vortex" tools={TOOLS} />
    </div>
  );
}
