'use client';

/*
 * Blur Lab: one loud scene, six kinds of blur.
 *  The scene is drawn by hand on a 2D canvas every frame: a colour field, big 'BLUR', shapes, rings,
 *  fine print and one yellow disc that swings left and right (fastest in the middle, still at the ends).
 *  01 gaussian     CSS `filter: blur()` on the scene canvas. Radius slider, soft-edge fix.
 *  02 motion       multi-sample canvas: the mover is drawn N times across the shutter into a layer with
 *                  'lighter' at alpha 1/N, which is an exact average. Streak length follows speed.
 *                  Slow-mo replays at the 1x shutter, like slowed film footage.
 *  03 radial       OGL pass: 24 taps along the line to the centre. The centre follows the pointer.
 *  04 tilt-shift   OGL pass: golden-angle disc blur whose radius grows away from a sharp band. It writes
 *                  alpha, so the sharp band is the crisp 2D canvas underneath.
 *  05 frosted      CSS backdrop-filter panel over the moving scene, with a live contrast estimate taken
 *                  from an 8 by 4 sample of what sits behind it.
 *  06 progressive  up to six stacked backdrop-filter layers, each masked, doubling in blur towards the top.
 * One WebGL context, made on first use, rendered at half resolution. The scene canvas is its texture.
 */

import gsap from 'gsap';
import { Mesh, Program, Renderer, Texture, Triangle } from 'ogl';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from 'react';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner, useCanvasFonts } from './g3-kit';

const TOOLS = ['ogl', 'glsl', 'css', 'gsap']; // matches the registry entry in g7.ts

/* the colour act palette (DESIGN.md "crazy colour"); raw hex is allowed inside a colour experience */
const C = {
  red: '#ff2e00',
  mag: '#ff00a8',
  vio: '#7b2cff',
  cyan: '#00b3ff',
  green: '#00e676',
  yellow: '#ffe600',
  black: '#080808',
};

type KindId = 'gaussian' | 'motion' | 'radial' | 'tilt' | 'frosted' | 'progressive';
interface Kind {
  id: KindId;
  n: string;
  name: string;
  hue: string;
  ink: string;
  use: string;
  never: string;
  cost: 1 | 2 | 3;
  costWhy: string;
}

const KINDS: Kind[] = [
  {
    id: 'gaussian',
    n: '1',
    name: 'gaussian',
    hue: C.cyan,
    ink: C.black,
    use: 'Pushing a background back behind a dialog or a hero line.',
    never: 'Text people need to read, or as a stand-in for content still loading.',
    cost: 1,
    costWhy: 'One GPU filter on one layer. It grows with the radius and the layer size.',
  },
  {
    id: 'motion',
    n: '2',
    name: 'motion',
    hue: C.yellow,
    ink: C.black,
    use: 'Selling speed on something fast: a hero object, a game sprite, a flick.',
    never: 'Anything slow, or UI people must read while it moves.',
    cost: 2,
    costWhy: 'The mover is drawn N times a frame. Only the moving thing pays, not the scene.',
  },
  {
    id: 'radial',
    n: '3',
    name: 'radial',
    hue: C.mag,
    ink: C.black,
    use: 'A burst into a new scene, a zoom transition, a reward on click.',
    never: 'Anything that stays on screen. Held for long, it makes people feel sick.',
    cost: 3,
    costWhy: '24 texture reads per pixel every frame, plus uploading the scene to the GPU.',
  },
  {
    id: 'tilt',
    n: '4',
    name: 'tilt-shift',
    hue: C.green,
    ink: C.black,
    use: 'Making a city, a map or a product shot look like a miniature.',
    never: 'Hiding content people need, or over paragraphs of text.',
    cost: 3,
    costWhy: 'A 24-tap disc per pixel, every frame. It runs at half resolution to stay smooth.',
  },
  {
    id: 'frosted',
    n: '5',
    name: 'frosted',
    hue: C.vio,
    ink: '#ffffff',
    use: 'Nav bars, sheets and panels that sit over busy or moving content.',
    never: 'Over bright or low-contrast content with no tint. Check the ratio first.',
    cost: 2,
    costWhy: 'The browser re-blurs everything behind the panel whenever it changes.',
  },
  {
    id: 'progressive',
    n: '6',
    name: 'progressive',
    hue: C.red,
    ink: C.black,
    use: 'The top edge of a scrolling list or header, like iOS.',
    never: 'More than six layers, or a short page where nothing scrolls under it.',
    cost: 3,
    costWhy: 'Every layer is its own backdrop blur. Six is the ceiling. Four is usually enough.',
  },
];

const COST_WORD = ['', 'cheap', 'medium', 'expensive'];
const SLOWMO = [1, 0.25, 0.1];
const PERIOD = 1.4; // seconds for one full swing of the mover
const OMEGA = (Math.PI * 2) / PERIOD;
const PROGRESS_SECONDS = 12; // scene time covered by progress 0..1

/* ───────────── GLSL ───────────── */

const VERT = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// interleaved gradient noise: turns sample banding into fine grain
const NOISE = /* glsl */ `
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

const RADIAL = /* glsl */ `
precision highp float;
uniform sampler2D uScene;
uniform vec2 uCentre;
uniform float uStrength;
varying vec2 vUv;
${NOISE}
void main() {
  vec3 c = vec3(0.0);
  float j = ign(gl_FragCoord.xy);
  for (int i = 0; i < 24; i++) {
    float k = (float(i) + j) / 24.0;
    c += texture2D(uScene, uCentre + (vUv - uCentre) * (1.0 - uStrength * k)).rgb;
  }
  gl_FragColor = vec4(c / 24.0, 1.0);
}
`;

const TILT = /* glsl */ `
precision highp float;
uniform sampler2D uScene;
uniform vec2 uSize;
uniform float uPos;
uniform float uBand;
uniform float uRadius;
varying vec2 vUv;
${NOISE}
void main() {
  float y = 1.0 - vUv.y;
  float b = smoothstep(uBand, uBand + 0.18, abs(y - uPos));
  float r = b * uRadius;
  float rot = ign(gl_FragCoord.xy) * 6.2831853;
  vec3 c = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float rr = sqrt((fi + 0.5) / 24.0) * r;
    float th = fi * 2.3999632 + rot;
    c += texture2D(uScene, vUv + vec2(cos(th), sin(th)) * rr / uSize).rgb;
  }
  c /= 24.0;
  // write alpha: the sharp band lets the crisp canvas underneath show through
  float a = smoothstep(0.0, 0.3, b);
  gl_FragColor = vec4(c * a, a);
}
`;

/* ───────────── the scene ───────────── */

interface Fam {
  sans: string;
  mono: string;
}
const FALLBACK: Fam = { sans: '"Helvetica Neue", Arial, sans-serif', mono: 'ui-monospace, Menlo, monospace' };

function moverPos(w: number, h: number, t: number) {
  const s = Math.min(w, h);
  const r = Math.max(14, s * 0.075);
  const A = w / 2 - r - Math.max(12, w * 0.06);
  return { x: w / 2 + A * Math.sin(OMEGA * t), y: h * 0.72 + Math.cos(OMEGA * t * 2) * s * 0.02, r };
}

function drawMover(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, f: Fam) {
  const { x, y, r } = moverPos(w, h, t);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = C.yellow;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.strokeStyle = C.black;
  ctx.stroke();
  ctx.fillStyle = C.black;
  ctx.font = `800 ${Math.round(r * 0.52)}px ${f.sans}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('fast', x, y + r * 0.03);
}

function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, f: Fam) {
  const s = Math.min(w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, C.vio);
  g.addColorStop(0.55, C.mag);
  g.addColorStop(1, C.red);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.46;

  // concentric rings: zoom blur smears them, tilt-shift softens them by row
  ctx.lineWidth = Math.max(1, s * 0.004);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  for (let i = 1; i <= 9; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, i * s * 0.09, 0, Math.PI * 2);
    ctx.stroke();
  }

  // cyan disc, top right, drifting
  ctx.fillStyle = C.cyan;
  ctx.beginPath();
  ctx.arc(w * 0.84 + Math.sin(t * 0.6) * s * 0.02, h * 0.2 + Math.cos(t * 0.5) * s * 0.015, s * 0.19, 0, Math.PI * 2);
  ctx.fill();

  // green square, left, turning slowly
  ctx.save();
  ctx.translate(w * 0.14, h * 0.28);
  ctx.rotate(0.3 + t * 0.12);
  ctx.fillStyle = C.green;
  const q = s * 0.2;
  ctx.fillRect(-q / 2, -q / 2, q, q);
  ctx.restore();

  // yellow dot, top middle
  ctx.fillStyle = C.yellow;
  ctx.beginPath();
  ctx.arc(w * 0.62, h * 0.12 + Math.sin(t * 0.9) * s * 0.02, s * 0.035, 0, Math.PI * 2);
  ctx.fill();

  // dot grid, right: high-frequency detail goes first under any blur
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const gap = Math.max(8, s * 0.028);
  const dr = Math.max(1.2, gap * 0.16);
  for (let yy = h * 0.42; yy < h * 0.66; yy += gap) {
    for (let xx = w * 0.8; xx < w * 0.97; xx += gap) {
      ctx.beginPath();
      ctx.arc(xx, yy, dr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // BLUR: black type with a white offset copy
  const fs = Math.min(w * 0.3, h * 0.4);
  ctx.font = `900 ${Math.round(fs)}px ${f.sans}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('BLUR', cx + fs * 0.03, cy + fs * 0.03);
  ctx.fillStyle = C.black;
  ctx.fillText('BLUR', cx, cy);

  // fine print, left: the first thing any blur takes away
  const fp = Math.max(9, Math.round(s * 0.026));
  ctx.font = `500 ${fp}px ${f.mono}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  const lx = Math.max(10, w * 0.04);
  ctx.fillText('fine print blurs first.', lx, h * 0.04 + fp);
  ctx.fillText('big shapes survive.', lx, h * 0.04 + fp * 2.4);

  // hazard stripes along the bottom
  const top = h * 0.86;
  ctx.fillStyle = C.yellow;
  ctx.fillRect(0, top, w, h - top);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, w, h - top);
  ctx.clip();
  ctx.fillStyle = C.black;
  const sw = Math.max(8, s * 0.03);
  const bh = h - top;
  for (let x = -bh * 2; x < w + bh; x += sw * 2) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + sw, h);
    ctx.lineTo(x + sw + bh, top);
    ctx.lineTo(x + bh, top);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* ───────────── contrast ───────────── */

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/* ───────────── small UI ───────────── */

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  return (
    <label className="pixel flex min-w-0 items-center gap-2 text-[16px] leading-[16px] text-[var(--v-dim)]">
      <span className="w-[8ch] shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-4 min-w-0 flex-1 accent-[var(--v-ink)]"
      />
      <span className="w-[6ch] shrink-0 text-right text-[var(--v-soft)]">{fmt ? fmt(value) : value}</span>
    </label>
  );
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  fmt,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
  fmt?: (v: T) => string;
}) {
  return (
    <div className="pixel flex min-w-0 flex-wrap items-center gap-2 text-[16px] leading-[16px] text-[var(--v-dim)]">
      <span className="w-[8ch] shrink-0">{label}</span>
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={o === value}
          className={`border px-1.5 py-0.5 ${o === value ? 'border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]' : 'border-[var(--v-steel)] text-[var(--v-soft)] hover:border-[var(--v-soft)]'}`}
        >
          {fmt ? fmt(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

function CostMeter({ k }: { k: Kind }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="pixel flex items-center gap-2 text-[16px] leading-[16px] text-[var(--v-dim)]">
        <span className="w-[8ch] shrink-0">cost</span>
        <span className="flex gap-[3px]" aria-hidden>
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className="inline-block h-3 w-5 border"
              style={{ borderColor: i <= k.cost ? k.hue : 'var(--v-steel)', background: i <= k.cost ? k.hue : 'transparent' }}
            />
          ))}
        </span>
        <span className="text-[var(--v-ink)]">{COST_WORD[k.cost]}</span>
      </p>
      <p className="text-[14px] leading-[1.45] text-[var(--v-soft)]">{k.costWhy}</p>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="max-w-full overflow-hidden border border-[var(--v-steel)] bg-[var(--v-surface)] px-2 py-1.5 font-mono text-[12.5px] leading-[1.5] break-words whitespace-pre-wrap text-[var(--v-ink)]">
      {children}
    </pre>
  );
}

/* ───────────── root ───────────── */

interface Params {
  tab: KindId;
  shutter: number;
  samples: number;
  slow: number;
  rStrength: number;
  tPos: number;
  tBand: number;
  tRadius: number;
  fBlur: number;
  fTint: number;
  fTone: 'dark' | 'light';
  fText: 'white' | 'black';
}

interface GL {
  renderer: Renderer;
  tex: Texture;
  radial: Mesh;
  tilt: Mesh;
  dispose: () => void;
}

export default function BlurLab({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const glHost = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const centreRef = useRef<HTMLSpanElement>(null);
  const fonts = useCanvasFonts();

  const [sz, setSz] = useState({ w: 0, h: 0 });
  const [st, setSt] = useState({ w: 0, h: 0 });

  const [tab, setTab] = useState<KindId>('gaussian');
  const [gRadius, setGRadius] = useState(12);
  const [gEdge, setGEdge] = useState(true);
  const [shutter, setShutter] = useState(1);
  const [samples, setSamples] = useState(16);
  const [slow, setSlow] = useState(1);
  const [rStrength, setRStrength] = useState(0.28);
  const [tPos, setTPos] = useState(0.5);
  const [tBand, setTBand] = useState(0.12);
  const [tRadius, setTRadius] = useState(10);
  const [fBlur, setFBlur] = useState(16);
  const [fTint, setFTint] = useState(0.3);
  const [fTone, setFTone] = useState<'dark' | 'light'>('dark');
  const [fText, setFText] = useState<'white' | 'black'>('white');
  const [pLayers, setPLayers] = useState(5);
  const [pMax, setPMax] = useState(32);
  const [pHeight, setPHeight] = useState(55);
  const [contrast, setContrast] = useState<{ worst: number; avg: number } | null>(null);

  const P = useRef<Params>({ tab, shutter, samples, slow, rStrength, tPos, tBand, tRadius, fBlur, fTint, fTone, fText });
  const progressRef = useRef(progress);
  const pointer = useRef({ x: 0, y: 0, real: false, last: 0 });
  const stillRef = useRef<null | (() => void)>(null);
  const glRef = useRef<GL | null>(null);

  useEffect(() => {
    P.current = { tab, shutter, samples, slow, rStrength, tPos, tBand, tRadius, fBlur, fTint, fTone, fText };
    progressRef.current = progress;
  });

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSz({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mounted = sz.w > 0;
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSt({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);

  /* the one WebGL context: made on first use, dropped on unmount */
  useEffect(
    () => () => {
      glRef.current?.dispose();
      glRef.current = null;
    },
    [],
  );

  /* main loop */
  useEffect(() => {
    const canvas = sceneRef.current;
    const stEl = stage.current;
    if (!canvas || !stEl || !st.w || !st.h) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const f: Fam = fonts ? { sans: fonts.sans, mono: fonts.mono } : FALLBACK;
    const w = st.w;
    const h = st.h;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    // layer for the motion-blur samples (additive average)
    const layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const lctx = layer.getContext('2d');

    // tiny canvas for the frosted-glass contrast estimate
    const probe = document.createElement('canvas');
    probe.width = 8;
    probe.height = 4;
    const pctx = probe.getContext('2d', { willReadFrequently: true });

    const ensureGL = (): GL | null => {
      if (glRef.current) return glRef.current;
      const hostEl = glHost.current;
      if (!hostEl) return null;
      const renderer = new Renderer({ dpr: dpr * 0.5, alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
      const gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      const c = gl.canvas as HTMLCanvasElement;
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
      hostEl.appendChild(c);
      const tex = new Texture(gl, { generateMipmaps: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR });
      const geometry = new Triangle(gl);
      const rp = new Program(gl, {
        vertex: VERT,
        fragment: RADIAL,
        depthTest: false,
        uniforms: { uScene: { value: tex }, uCentre: { value: [0.5, 0.5] }, uStrength: { value: 0.3 } },
      });
      const tp = new Program(gl, {
        vertex: VERT,
        fragment: TILT,
        depthTest: false,
        uniforms: { uScene: { value: tex }, uSize: { value: [1, 1] }, uPos: { value: 0.5 }, uBand: { value: 0.1 }, uRadius: { value: 10 } },
      });
      const radial = new Mesh(gl, { geometry, program: rp });
      const tilt = new Mesh(gl, { geometry, program: tp });
      glRef.current = {
        renderer,
        tex,
        radial,
        tilt,
        dispose: () => {
          rp.remove();
          tp.remove();
          geometry.remove();
          gl.deleteTexture(tex.texture);
          gl.getExtension('WEBGL_lose_context')?.loseContext();
          c.remove();
        },
      };
      return glRef.current;
    };

    let frameNo = 0;
    let lastProbe = -1e9;
    const probeContrast = (now: number, force: boolean) => {
      const panel = panelRef.current;
      if (!panel || !pctx || (!force && now - lastProbe < 250)) return;
      lastProbe = now;
      const sb = stEl.getBoundingClientRect();
      const pb = panel.getBoundingClientRect();
      const sx = Math.max(0, (pb.left - sb.left) * dpr);
      const sy = Math.max(0, (pb.top - sb.top) * dpr);
      const sw = Math.min(canvas.width - sx, pb.width * dpr);
      const sh = Math.min(canvas.height - sy, pb.height * dpr);
      if (sw < 2 || sh < 2) return;
      pctx.clearRect(0, 0, 8, 4);
      pctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, 8, 4);
      const d = pctx.getImageData(0, 0, 8, 4).data;
      const { fBlur: b, fTint: tint, fTone: tone, fText: tc } = P.current;
      const tv = tone === 'dark' ? 8 : 255;
      let ar = 0;
      let ag = 0;
      let ab = 0;
      for (let i = 0; i < 32; i++) {
        ar += d[i * 4];
        ag += d[i * 4 + 1];
        ab += d[i * 4 + 2];
      }
      ar /= 32;
      ag /= 32;
      ab /= 32;
      const k = Math.min(1, b / 24); // more blur: every cell drifts towards the average
      const textL = tc === 'white' ? 1 : lum(8, 8, 8);
      const mixc = (c: number, a: number) => (c * (1 - k) + a * k) * (1 - tint) + tv * tint;
      let worst = 99;
      for (let i = 0; i < 32; i++) {
        const L = lum(mixc(d[i * 4], ar), mixc(d[i * 4 + 1], ag), mixc(d[i * 4 + 2], ab));
        worst = Math.min(worst, ratio(L, textL));
      }
      const avgL = lum(ar * (1 - tint) + tv * tint, ag * (1 - tint) + tv * tint, ab * (1 - tint) + tv * tint);
      setContrast({ worst, avg: ratio(avgL, textL) });
    };

    const frame = (t: number, span: number, now: number, still: boolean) => {
      const p = P.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBackdrop(ctx, w, h, t, f);

      if (p.tab === 'motion' && lctx) {
        // exact average of N shots across the shutter: 'lighter' adds premultiplied colour at 1/N each
        const N = p.samples;
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.globalCompositeOperation = 'source-over';
        lctx.clearRect(0, 0, layer.width, layer.height);
        lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        lctx.globalCompositeOperation = 'lighter';
        lctx.globalAlpha = 1 / N;
        for (let i = 0; i < N; i++) drawMover(lctx, w, h, t - (span * i) / Math.max(1, N - 1), f);
        lctx.globalAlpha = 1;
        lctx.globalCompositeOperation = 'source-over';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(layer, 0, 0);
        if (speedRef.current && (frameNo % 6 === 0 || still || speedRef.current.textContent === 'speed')) {
          const a = moverPos(w, h, t);
          const b = moverPos(w, h, t - span);
          const c0 = moverPos(w, h, t - 1 / 60);
          speedRef.current.textContent = `speed ${Math.hypot(a.x - c0.x, a.y - c0.y).toFixed(1)} px/frame · streak ${Math.hypot(a.x - b.x, a.y - b.y).toFixed(1)} px`;
        }
      } else {
        drawMover(ctx, w, h, t, f);
      }

      const needsGL = p.tab === 'radial' || p.tab === 'tilt';
      const g = needsGL ? ensureGL() : glRef.current;
      if (g) {
        const c = g.renderer.gl.canvas as HTMLCanvasElement;
        c.style.display = needsGL ? 'block' : 'none';
        if (needsGL) {
          if (g.renderer.width !== w || g.renderer.height !== h || g.renderer.dpr !== dpr * 0.5) {
            g.renderer.dpr = dpr * 0.5; // half resolution for the blur pass
            g.renderer.setSize(w, h);
          }
          // the scene canvas is the texture: one upload per frame
          g.tex.image = canvas;
          g.tex.needsUpdate = true;
          if (p.tab === 'radial') {
            let cx: number;
            let cy: number;
            if (pointer.current.real && now - pointer.current.last < 2500) {
              cx = pointer.current.x / w;
              cy = pointer.current.y / h;
            } else if (still) {
              cx = 0.5;
              cy = 0.46;
            } else {
              cx = 0.5 + 0.22 * Math.sin(t * 0.6);
              cy = 0.46 + 0.14 * Math.sin(t * 0.83 + 0.7);
            }
            const u = g.radial.program.uniforms;
            u.uCentre.value = [cx, 1 - cy];
            u.uStrength.value = p.rStrength;
            if (centreRef.current && (frameNo % 6 === 0 || still || centreRef.current.textContent === 'centre')) {
              centreRef.current.textContent = `centre x ${Math.round(cx * 100)}% · y ${Math.round(cy * 100)}%`;
            }
            g.renderer.render({ scene: g.radial });
          } else {
            const u = g.tilt.program.uniforms;
            u.uSize.value = [w, h];
            u.uPos.value = p.tPos;
            u.uBand.value = p.tBand;
            u.uRadius.value = p.tRadius;
            g.renderer.render({ scene: g.tilt });
          }
        }
      }

      if (p.tab === 'frosted') probeContrast(now, still);
      frameNo++;
    };

    if (reducedMotion) {
      // composed still: the mover mid-swing (its fastest point) so motion blur still has a streak to show
      stillRef.current = () => frame(0, P.current.shutter / 60, performance.now(), true);
      stillRef.current();
      return () => {
        stillRef.current = null;
      };
    }
    stillRef.current = null;
    if (!active) return;

    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let prevProgT = (progressRef.current ?? 0) * PROGRESS_SECONDS;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = P.current;
      let t: number;
      let span: number;
      if (progressRef.current !== undefined) {
        // driven from outside: scene time follows progress, and the streak follows how fast it moved
        t = progressRef.current * PROGRESS_SECONDS;
        span = (t - prevProgT) * p.shutter;
        prevProgT = t;
      } else {
        clock += dt * (p.tab === 'motion' ? p.slow : 1);
        t = clock;
        // slow-mo keeps the 1x shutter: a replay of footage filmed at full speed
        span = p.shutter / 60;
      }
      frame(t, span, now, false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reducedMotion, st.w, st.h, fonts]);

  // reduced motion: the controls are not motion, so each change redraws the still
  useEffect(() => {
    stillRef.current?.();
  }, [tab, shutter, samples, slow, rStrength, tPos, tBand, tRadius, fBlur, fTint, fTone, fText]);

  // a small entrance for the info panel on tab change
  useEffect(() => {
    const el = infoRef.current;
    if (!el || reducedMotion) return;
    const tw = gsap.fromTo(el, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' });
    return () => {
      tw.kill();
      gsap.set(el, { opacity: 1, y: 0 });
    };
  }, [tab, reducedMotion]);

  const onPointer = (e: RPointerEvent) => {
    const b = stage.current?.getBoundingClientRect();
    if (!b) return;
    pointer.current = { x: e.clientX - b.left, y: e.clientY - b.top, real: true, last: performance.now() };
    if (reducedMotion) stillRef.current?.();
  };

  const kind = KINDS.find((k) => k.id === tab)!;
  const wide = sz.w >= 860 && sz.h >= 460;
  const compact = !wide && sz.h < 560;
  const panelW = sz.w >= 1200 ? 380 : 340;

  /* progressive layers: j = 0 weakest (reaches furthest down) … n-1 strongest (top only) */
  const layers = Array.from({ length: pLayers }, (_, j) => ({
    blur: pMax / 2 ** (pLayers - 1 - j),
    solid: ((pLayers - 1 - j) / pLayers) * 100,
    clear: ((pLayers - j) / pLayers) * 100,
  }));
  const r1 = (v: number) => (Math.round(v * 10) / 10).toString();
  const edgeScale = 1 + (gRadius * 2.2) / Math.max(1, Math.min(st.w, st.h));

  /* the code for the current kind, with the live values */
  let code = '';
  switch (tab) {
    case 'gaussian':
      code = `filter: blur(${gRadius}px);${gEdge ? `\ntransform: scale(${edgeScale.toFixed(2)}); /* hide edge */` : ''}`;
      break;
    case 'motion':
      code = `ctx.globalCompositeOperation = 'lighter';\nctx.globalAlpha = 1 / ${samples};\nfor (let i = 0; i < ${samples}; i++)\n  drawMover(t - shutter * i / ${samples - 1});\n// shutter: ${Math.round(shutter * 360)}° of a 1/60s frame`;
      break;
    case 'radial':
      code = `// 24 taps, k = i / 24\nc += texture2D(uScene,\n  uCentre + (uv - uCentre) * (1.0 - ${rStrength.toFixed(2)} * k));`;
      break;
    case 'tilt':
      code = `float b = smoothstep(${tBand.toFixed(2)}, ${(tBand + 0.18).toFixed(2)},\n  abs(uv.y - ${tPos.toFixed(2)}));\nfloat r = b * ${tRadius}.0; // disc radius in px\n// 24 golden-angle taps inside r`;
      break;
    case 'frosted':
      code = `backdrop-filter: blur(${fBlur}px) saturate(1.4);\nbackground: rgb(${fTone === 'dark' ? '8 8 8' : '255 255 255'} / ${fTint.toFixed(2)});\ncolor: ${fText === 'white' ? '#fff' : '#080808'};`;
      break;
    case 'progressive': {
      const top = layers[layers.length - 1];
      code = `/* ${pLayers} stacked layers, strongest on top */\nbackdrop-filter: blur(${r1(top.blur)}px);\nmask-image: linear-gradient(to bottom,\n  black ${r1(top.solid)}%, transparent ${r1(top.clear)}%);`;
      break;
    }
  }

  const aa = contrast ? contrast.worst >= 4.5 : false;
  const note = (s: string) => !compact && <p className="text-[13px] leading-[1.45] text-[var(--v-dim)]">{s}</p>;

  let controls: ReactNode = null;
  switch (tab) {
    case 'gaussian':
      controls = (
        <>
          <Slider label="radius" value={gRadius} min={0} max={40} step={1} onChange={setGRadius} fmt={(v) => `${v}px`} />
          <Choice label="edge" value={gEdge ? 'hidden' : 'shown'} options={['hidden', 'shown']} onChange={(v) => setGEdge(v === 'hidden')} />
          {note('A blurred layer fades at its edges. Scale it up a touch so the fade falls outside the frame.')}
        </>
      );
      break;
    case 'motion':
      controls = (
        <>
          <Slider label="shutter" value={shutter} min={0} max={2} step={0.05} onChange={setShutter} fmt={(v) => `${Math.round(v * 360)}°`} />
          <Slider label="samples" value={samples} min={2} max={32} step={1} onChange={setSamples} />
          <Choice label="slow-mo" value={slow} options={SLOWMO} onChange={setSlow} fmt={(v) => `${v}x`} />
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-soft)]">
            <span ref={speedRef}>speed</span>
          </p>
          {note('The streak is speed times shutter: longest mid-swing, gone at the ends. 360° is a full frame; past that is exaggerated for teaching. Slow-mo keeps the 1x shutter, like slowed film.')}
        </>
      );
      break;
    case 'radial':
      controls = (
        <>
          <Slider label="strength" value={rStrength} min={0} max={0.6} step={0.01} onChange={setRStrength} fmt={(v) => v.toFixed(2)} />
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-soft)]">
            <span ref={centreRef}>centre</span>
          </p>
          {note('Move the pointer over the scene. The centre follows it and stays sharp. Left alone, it drifts.')}
        </>
      );
      break;
    case 'tilt':
      controls = (
        <>
          <Slider label="band at" value={tPos} min={0.1} max={0.9} step={0.01} onChange={setTPos} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="band" value={tBand} min={0.02} max={0.4} step={0.01} onChange={setTBand} fmt={(v) => `${Math.round(v * 200)}%`} />
          <Slider label="blur" value={tRadius} min={0} max={24} step={1} onChange={setTRadius} fmt={(v) => `${v}px`} />
          {note('Only the blurred rows are drawn by the shader. The sharp band is the plain canvas showing through.')}
        </>
      );
      break;
    case 'frosted':
      controls = (
        <>
          <Slider label="blur" value={fBlur} min={0} max={40} step={1} onChange={setFBlur} fmt={(v) => `${v}px`} />
          <Slider label="tint" value={fTint} min={0} max={0.6} step={0.01} onChange={setFTint} fmt={(v) => v.toFixed(2)} />
          <Choice label="tint is" value={fTone} options={['dark', 'light'] as ('dark' | 'light')[]} onChange={setFTone} />
          <Choice label="text" value={fText} options={['white', 'black'] as ('white' | 'black')[]} onChange={setFText} />
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-soft)]">
            contrast <span className="text-[var(--v-ink)]">{contrast ? `${contrast.worst.toFixed(1)}:1` : '...'}</span> worst ·{' '}
            <span style={{ color: aa ? C.green : C.red }}>{contrast ? (aa ? 'passes AA' : 'fails AA') : ''}</span>
          </p>
          {note(
            `Estimated live from an 8 by 4 sample behind the panel, with blur and tint applied. Average ${contrast ? `${contrast.avg.toFixed(1)}:1` : '...'}. Aim for 4.5:1.`,
          )}
        </>
      );
      break;
    case 'progressive':
      controls = (
        <>
          <Slider label="layers" value={pLayers} min={1} max={6} step={1} onChange={setPLayers} />
          <Slider label="max blur" value={pMax} min={4} max={64} step={1} onChange={setPMax} fmt={(v) => `${v}px`} />
          <Slider label="height" value={pHeight} min={20} max={70} step={1} onChange={setPHeight} fmt={(v) => `${v}%`} />
          {!compact && (
            <ul className="font-mono text-[12px] leading-[1.5] text-[var(--v-soft)]">
              {[...layers].reverse().map((l, i) => (
                <li key={i}>
                  L{pLayers - i} blur({r1(l.blur)}px) solid to {Math.round(l.solid)}%, clear at {Math.round(l.clear)}%
                </li>
              ))}
            </ul>
          )}
        </>
      );
      break;
  }

  const tabs = (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Blur kind">
      {KINDS.map((k) => {
        const on = k.id === tab;
        return (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={on}
            title={k.name}
            onClick={() => setTab(k.id)}
            className="pixel border px-1.5 py-1 text-[16px] leading-[16px]"
            style={{
              borderColor: on ? k.hue : 'var(--v-steel)',
              background: on ? k.hue : 'transparent',
              color: on ? k.ink : 'var(--v-soft)',
            }}
          >
            {compact ? k.n : `${k.n} ${k.name}`}
          </button>
        );
      })}
    </div>
  );

  const panel = (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col ${compact ? 'gap-2' : 'gap-3'} overflow-y-auto overscroll-contain ${wide ? 'border-l border-[var(--v-line)] pl-3' : 'border-t border-[var(--v-line)] pt-2'}`}
    >
      {tabs}
      <div ref={infoRef} className={`flex min-w-0 flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
        {!compact && (
          <div className="flex min-w-0 flex-col gap-1.5 text-[15px] leading-[1.45]">
            <p className="text-[var(--v-ink)]">
              <span className="pixel mr-2 text-[16px] leading-[16px] text-[var(--v-dim)]">use it for</span>
              {kind.use}
            </p>
            <p className="text-[var(--v-soft)]">
              <span className="pixel mr-2 text-[16px] leading-[16px] text-[var(--v-dim)]">never for</span>
              {kind.never}
            </p>
          </div>
        )}
        {compact ? (
          <p className="truncate font-mono text-[12px] leading-[1.5] text-[var(--v-ink)]" title={code}>
            {code.split('\n').find((l) => !l.startsWith('/')) ?? code}
          </p>
        ) : (
          <Code>{code}</Code>
        )}
        <div className="flex min-w-0 flex-col gap-2">{controls}</div>
        {!compact && <CostMeter k={kind} />}
      </div>
    </div>
  );

  const sceneStyle: CSSProperties =
    tab === 'gaussian' ? { filter: gRadius ? `blur(${gRadius}px)` : undefined, transform: gEdge ? `scale(${edgeScale})` : undefined } : {};

  const stageEl = (
    <div
      ref={stage}
      onPointerMove={onPointer}
      onPointerLeave={() => (pointer.current.real = false)}
      className="relative min-h-0 min-w-0 flex-1 touch-pan-y overflow-hidden border border-[var(--v-steel)] bg-[var(--v-bg)]"
    >
      <canvas
        ref={sceneRef}
        role="img"
        aria-label="A colourful scene with the word BLUR, shapes and a yellow disc swinging left and right"
        className="absolute inset-0 block h-full w-full"
        style={sceneStyle}
      />
      <div ref={glHost} className="pointer-events-none absolute inset-0" />

      {tab === 'frosted' && (
        <div
          ref={panelRef}
          className={`absolute left-1/2 w-[min(440px,84%)] -translate-x-1/2 border ${
            compact ? 'top-1/2 -translate-y-1/2 rounded-lg px-3 py-1.5' : 'bottom-[12%] rounded-2xl px-4 py-3'
          }`}
          style={{
            backdropFilter: `blur(${fBlur}px) saturate(1.4)`,
            WebkitBackdropFilter: `blur(${fBlur}px) saturate(1.4)`,
            background: `rgb(${fTone === 'dark' ? '8 8 8' : '255 255 255'} / ${fTint})`,
            borderColor: 'rgb(255 255 255 / 0.35)',
            color: fText === 'white' ? '#ffffff' : C.black,
          }}
        >
          <p className={`${compact ? 'text-[15px]' : 'text-[18px]'} leading-tight font-semibold`}>Frosted glass</p>
          <p className={`${compact ? 'text-[12px] leading-[1.3]' : 'mt-1 text-[14px] leading-[1.45]'}`}>Can you still read this while the scene moves behind it?</p>
        </div>
      )}

      {tab === 'progressive' && (
        <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: `${pHeight}%` }}>
          {layers.map((l, j) => {
            const m = `linear-gradient(to bottom, black ${l.solid}%, transparent ${l.clear}%)`;
            return (
              <div
                key={j}
                className="absolute inset-0"
                style={{ backdropFilter: `blur(${l.blur}px)`, WebkitBackdropFilter: `blur(${l.blur}px)`, maskImage: m, WebkitMaskImage: m }}
              />
            );
          })}
          <p className="pixel absolute top-3 left-1/2 -translate-x-1/2 text-[16px] leading-[16px] whitespace-nowrap text-white">top of the list</p>
        </div>
      )}

      <span className="pixel pointer-events-none absolute right-2 bottom-2 px-1 py-0.5 text-[16px] leading-[16px]" style={{ background: kind.hue, color: kind.ink }}>
        {kind.n} {kind.name}
      </span>
    </div>
  );

  return (
    <div ref={host} className="relative h-full w-full overflow-hidden bg-[var(--v-bg)] text-[var(--v-ink)]">
      <Corner title="Blur Lab" tools={TOOLS} />
      {mounted && (
        <div
          className="absolute inset-x-2 bottom-2 grid gap-2 sm:inset-x-3 sm:bottom-3"
          style={
            wide
              ? { top: 52, gridTemplateColumns: `minmax(0,1fr) ${panelW}px`, gridTemplateRows: 'minmax(0,1fr)' }
              : {
                  // below sm the corner label is the title only, so the content can start higher
                  top: sz.w < 640 ? 34 : 52,
                  gridTemplateColumns: 'minmax(0,1fr)',
                  gridTemplateRows: compact ? 'minmax(0,1fr) auto' : 'minmax(180px,1fr) auto',
                }
          }
        >
          <div className="flex min-h-0 min-w-0">{stageEl}</div>
          <div className="flex min-h-0 min-w-0 flex-col" style={wide ? undefined : { maxHeight: `${Math.round(sz.h * (compact ? 0.42 : 0.55))}px` }}>
            {panel}
          </div>
        </div>
      )}
    </div>
  );
}
