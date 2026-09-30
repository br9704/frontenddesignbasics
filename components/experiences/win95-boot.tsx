'use client';

import { gsap } from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ExperienceProps } from '@/lib/experiences/types';
import { BuiltWith } from '@/components/v2/experience-frame';

gsap.registerPlugin(ScrambleTextPlugin);

/*
 * Win95 Boot: a BIOS-to-desktop boot.
 *  - BIOS lines decode out of block glyphs (ScrambleText, chars ░▒▓█)
 *  - the heading decodes centre-out, one char at a time; hovering it swaps its pixel-cell texture
 *  - memory counts up with a gsap snap, the progress bar fills in whole steps (steps() ease)
 *  - the logo resolves through a Bayer 4x4 mask whose cell size tweens 20px → 1px
 *  - a ripple through a pixel field hands over to the desktop (click, tap or any key skips to it)
 *  - the desktop then comes alive: icons pop in, a cursor double-clicks My Tools, an Explorer
 *    window unrolls with all 37 tools, a DOS prompt types, and the Start menu opens. Windows reveal
 *    with stepped clip-paths (never scale), on whole-pixel rects, under a CRT scanline layer.
 */

const BLOCKS = '░▒▓█';
const HEADING = 'FDB/95';
const LINES = [
  'Frontend Design Basics BIOS v2.0',
  'Copyright (C) 2026 FDB Labs',
  'CPU   : Taste 486DX @ 66 MHz',
  '',
  'Detecting tools ....... 37 found',
  'Mounting /examples .... 293 sites',
  'Loading font VGA 8x16 . OK',
];
const TEXTURES = ['square', 'grid', 'dot'] as const;
type Texture = (typeof TEXTURES)[number];

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const LOGO_W = 96;
const LOGO_H = 80;
const TOOLS = ['gsap', 'css', 'canvas2d'];

/* Pixel-cell textures for the heading. VGA 8x16 at 64px → one font pixel is a 4px cell. */
const textureStyle = (t: Texture): React.CSSProperties => {
  if (t === 'grid') {
    const m = 'linear-gradient(to right, #000 3px, transparent 3px), linear-gradient(to bottom, #000 3px, transparent 3px)';
    return { maskImage: m, WebkitMaskImage: m, maskSize: '4px 4px', WebkitMaskSize: '4px 4px', maskComposite: 'intersect', WebkitMaskComposite: 'source-in' };
  }
  if (t === 'dot') {
    const m = 'radial-gradient(circle at 2px 2px, #000 1.5px, transparent 1.9px)';
    return { maskImage: m, WebkitMaskImage: m, maskSize: '4px 4px', WebkitMaskSize: '4px 4px' };
  }
  return {};
};

/* 5x7 bitmaps for the logo lettering (hand-set, not a generated font). */
const LOGO_GLYPHS: Record<string, string[]> = {
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
};
/** Bayer cell sizes the logo steps through, coarse to fine. */
const LOGO_CELLS = [20, 16, 12, 10, 8, 6, 5, 4, 3, 2, 1];

/* Source logo in greys: a lit orb with FDB knocked out of it in 3x bitmap letters. Drawn once, then dithered. */
function makeLogoSource() {
  const c = document.createElement('canvas');
  c.width = LOGO_W;
  c.height = LOGO_H;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(34, 24, 2, 48, 40, 39);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#b4b4b4');
  grad.addColorStop(1, '#3a3a3a');
  g.fillStyle = '#000';
  g.fillRect(0, 0, LOGO_W, LOGO_H);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(48, 40, 38, 0, Math.PI * 2);
  g.fill();
  // FDB, 3px per bitmap pixel, 3px between letters, centred on the orb
  const px = 3;
  const x0 = Math.round(48 - (3 * 5 * px + 2 * px) / 2);
  const y0 = Math.round(40 - (7 * px) / 2);
  g.fillStyle = '#000';
  'FDB'.split('').forEach((ch, li) => {
    LOGO_GLYPHS[ch].forEach((row, ry) => {
      for (let rx = 0; rx < 5; rx++) if (row[rx] === '1') g.fillRect(x0 + li * 6 * px + rx * px, y0 + ry * px, px, px);
    });
  });
  return g.getImageData(0, 0, LOGO_W, LOGO_H).data;
}

/** What a line looks like before it decodes: its own shape, spelled in block glyphs (deterministic, so SSR matches). */
const blockify = (t: string, seed: number) => t.replace(/\S/g, (_, i: number) => BLOCKS[(i * 7 + seed * 3) % 4]);
const HEAD_PLACEHOLDER = '▓';

function drawLogo(ctx: CanvasRenderingContext2D, src: Uint8ClampedArray, cell: number) {
  const c = Math.max(1, Math.round(cell));
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, LOGO_W, LOGO_H);
  ctx.fillStyle = '#dfdfdf';
  for (let y = 0; y < LOGO_H; y += c) {
    for (let x = 0; x < LOGO_W; x += c) {
      const sx = Math.min(LOGO_W - 1, x + (c >> 1));
      const sy = Math.min(LOGO_H - 1, y + (c >> 1));
      const lum = src[(sy * LOGO_W + sx) * 4] / 255;
      const b = BAYER4[((y / c) % 4) * 4 + ((x / c) % 4)];
      if (lum > b) ctx.fillRect(x, y, c, c);
    }
  }
}

/*
 * Layout that must hold before JavaScript runs (server HTML, slow hydration on a phone): the stage is
 * centred by CSS and switches to portrait with the same rule the fit() measurement uses. Once measured,
 * inline whole-pixel rects take over. The blinking cursor is CSS so the prompt is alive even pre-hydration,
 * and it stops under reduced motion (system setting or the lab toggle).
 */
const W95_CSS = `
.w95{container:w95/size}
.w95-stage[data-fit='css']{left:50%;top:calc(50% + 20px);width:480px;height:320px;transform:translate(-50%,-50%)}
.w95-head{display:flex;flex-direction:row;align-items:flex-start;justify-content:space-between;gap:8px}
.w95-logo{width:${LOGO_W}px;height:${LOGO_H}px}
@container w95 (max-aspect-ratio: 9/10){
  .w95-stage[data-fit='css']{width:320px;height:480px}
  .w95-head{flex-direction:column-reverse;align-items:center;gap:16px}
  .w95-stage[data-big] .w95-logo{width:${LOGO_W * 2}px;height:${LOGO_H * 2}px}
}
@keyframes w95-blink{50%{opacity:0}}
@media (prefers-reduced-motion: no-preference){.w95:not([data-reduced]) .w95-blink{animation:w95-blink 1s steps(1) infinite}}
`;

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};


/* ── Desktop the boot hands over to ─────────────────────────────────────────────────────────── */

const TOOL_IDS = [
  'gsap', 'lenis', 'motion', 'scroll-world', 'scrollcraft', 'threejs', 'img2threejs', 'threlte', 'threeui', 'spline',
  'playcanvas', 'vectary', 'ogl', 'shadergradient', 'getlayers', 'higgsfield', 'react-bits', 'magic-ui', 'cult-ui',
  '21st', 'bklit', 'shadcn', 'refero', 'jitter', 'paper', 'frontend-design', 'impeccable', 'taste-skill',
  'ui-ux-pro-max', 'web-design-guidelines', 'anthropic-example-skills', 'frontend-design-basics', 'context7',
  'playwright', 'chrome-devtools', 'voicestudio', 'openwa',
];
type IconKind = 'monitor' | 'folder' | 'picture' | 'exe' | 'doc' | 'bin';
const DESK_ICONS: { label: string; kind: IconKind }[] = [
  { label: 'My Tools', kind: 'monitor' },
  { label: 'Examples', kind: 'folder' },
  { label: 'Showcase', kind: 'picture' },
  { label: 'Pixel Blast', kind: 'exe' },
  { label: 'ReadMe.txt', kind: 'doc' },
  { label: 'Recycle Bin', kind: 'bin' },
];
const DOS_LINES = [
  'C:\\> dir /examples',
  '     293 site(s)  19 dir(s)',
  'C:\\> mode crazy',
  'Colour driver ......... OK',
  'C:\\> pixelblast.exe',
];
const START_ITEMS = ['Programs', 'Documents', 'Settings', 'Find', 'Help', 'Run...'];
/** Top inset that keeps the desktop clear of the title chip (it wraps to two lines on phones). */
const CHIP_SAFE = 96;
const TASKBAR = 28;

/** 16x16 crisp icons, drawn at 2x (32px) or 1x (16px). */
function Icon({ kind, size = 32 }: { kind: IconKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden className="shrink-0">
      {kind === 'monitor' && (
        <>
          <rect x="1" y="2" width="14" height="10" fill="#c0c0c0" />
          <rect x="2" y="3" width="12" height="8" fill="#000" />
          <rect x="3" y="4" width="4" height="1" fill="#dfdfdf" />
          <rect x="3" y="6" width="7" height="1" fill="#808080" />
          <rect x="5" y="12" width="6" height="2" fill="#808080" />
        </>
      )}
      {kind === 'folder' && (
        <>
          <rect x="1" y="3" width="6" height="2" fill="#dfdfdf" />
          <rect x="1" y="4" width="14" height="10" fill="#dfdfdf" />
          <rect x="1" y="6" width="14" height="1" fill="#fff" />
          <rect x="1" y="13" width="14" height="1" fill="#808080" />
        </>
      )}
      {kind === 'picture' && (
        <>
          <rect x="1" y="2" width="14" height="12" fill="#dfdfdf" />
          <rect x="2" y="3" width="12" height="10" fill="#fff" />
          <rect x="10" y="4" width="2" height="2" fill="#808080" />
          <rect x="3" y="10" width="10" height="2" fill="#000" />
          <rect x="5" y="8" width="3" height="2" fill="#000" />
        </>
      )}
      {kind === 'exe' && (
        <>
          <rect x="1" y="2" width="14" height="12" fill="#c0c0c0" />
          <rect x="1" y="2" width="14" height="3" fill="#000" />
          <rect x="3" y="7" width="2" height="2" fill="#000" />
          <rect x="7" y="7" width="2" height="2" fill="#808080" />
          <rect x="11" y="7" width="2" height="2" fill="#000" />
          <rect x="5" y="10" width="2" height="2" fill="#808080" />
          <rect x="9" y="10" width="2" height="2" fill="#000" />
        </>
      )}
      {kind === 'doc' && (
        <>
          <rect x="3" y="1" width="10" height="14" fill="#fff" />
          <rect x="3" y="14" width="10" height="1" fill="#808080" />
          <rect x="5" y="4" width="6" height="1" fill="#000" />
          <rect x="5" y="6" width="6" height="1" fill="#808080" />
          <rect x="5" y="8" width="5" height="1" fill="#808080" />
          <rect x="5" y="10" width="6" height="1" fill="#808080" />
        </>
      )}
      {kind === 'bin' && (
        <>
          <rect x="4" y="3" width="8" height="2" fill="#c0c0c0" />
          <rect x="4" y="5" width="8" height="9" fill="#808080" />
          <rect x="6" y="6" width="1" height="7" fill="#c0c0c0" />
          <rect x="9" y="6" width="1" height="7" fill="#c0c0c0" />
        </>
      )}
    </svg>
  );
}

/** Whole-pixel window rectangles for the current container size. */
function deskLayout(W: number, H: number) {
  const avail = H - TASKBAR;
  const wide = W >= 720;
  // Short containers (cards, landscape phones): tighter top inset, windows share the height.
  const compact = avail < 400;
  const top = compact ? 64 : CHIP_SAFE;
  let ex, dos;
  if (compact) {
    ex = { l: 80, t: top, w: Math.round(wide ? Math.min(W * 0.56, 760) : (W - 88) * (W >= 480 ? 0.62 : 1)), h: avail - top - 8 };
    const dosW = Math.round(wide ? Math.min(W * 0.38, 480) : Math.max(200, W * 0.46));
    const dosH = Math.round(Math.min(avail * 0.5, 176));
    dos = { l: W - dosW - 8, t: avail - dosH - 8, w: dosW, h: dosH };
  } else if (wide) {
    ex = { l: 104, t: 80, w: Math.round(Math.min(W * 0.56, 760)), h: Math.round(Math.min(avail * 0.64, 480)) };
    const dosW = Math.round(Math.min(W * 0.38, 480));
    const dosH = Math.round(Math.min(avail * 0.36, 224));
    dos = { l: W - dosW - 24, t: avail - dosH - 24, w: dosW, h: dosH };
  } else {
    ex = { l: 80, t: top, w: W - 88, h: Math.round(Math.max(150, avail * 0.4)) };
    const dosH = Math.round(Math.min(176, avail * 0.3));
    dos = { l: 8, t: avail - dosH - 12, w: W - 16, h: dosH };
  }
  // Phones: the dialog sits over the Explorer's lower edge, clear of the icon column.
  const welW = Math.min(300, W - ex.l - 8);
  const wel =
    wide || compact
      ? { l: W - welW - (wide ? 40 : 12), t: top + 8, w: welW }
      : { l: ex.l, t: Math.round(ex.t + ex.h - 36), w: welW };
  // As many icons as fit above the taskbar (tall phones: above the DOS window). One icon is ~64px tall.
  const iconFloor = wide || compact ? avail : dos.t;
  const icons = Math.max(1, Math.min(DESK_ICONS.length, Math.floor((iconFloor - top) / 64)));
  // Start menu: rows of 28px plus Shut Down, capped by the height above the taskbar.
  const startItems = Math.max(1, Math.min(START_ITEMS.length, Math.floor((avail - top - 44) / 28)));
  return { W, H, avail, top, icons, ex, dos, wel, startItems };
}
type DeskLayout = ReturnType<typeof deskLayout>;

/** Win95 window chrome: black title bar, bevel, optional body class. */
function Win({
  title,
  icon,
  style,
  winRef,
  children,
  bodyClass = '',
}: {
  title: string;
  icon: IconKind;
  style: React.CSSProperties;
  winRef: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
  bodyClass?: string;
}) {
  return (
    <div ref={winRef} className="absolute flex flex-col bg-w-face p-[3px] text-black" style={{ boxShadow: 'var(--w-bevel-out)', clipPath: 'inset(0 0 100% 0)', ...style }}>
      <div className="flex h-[18px] shrink-0 items-center gap-1 bg-black px-[2px] font-bold text-white">
        <Icon kind={icon} size={16} />
        <span className="truncate">{title}</span>
        <span className="ml-auto flex gap-[2px]">
          {['_', '□', 'x'].map((g) => (
            <span key={g} className="grid h-[14px] w-[16px] place-items-center bg-w-face text-[10px] leading-none text-black" style={{ boxShadow: 'var(--w-bevel-out)' }}>
              {g}
            </span>
          ))}
        </span>
      </div>
      <div className={`min-h-0 flex-1 ${bodyClass}`}>{children}</div>
    </div>
  );
}

export default function Win95Boot({ active, reducedMotion, progress }: ExperienceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const biosRef = useRef<HTMLDivElement>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const deskWinRef = useRef<HTMLDivElement>(null);
  const exRef = useRef<HTMLDivElement>(null);
  const dosRef = useRef<HTMLDivElement>(null);
  const startMenuRef = useRef<HTMLDivElement>(null);
  const startBtnRef = useRef<HTMLSpanElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const iconRefs = useRef<(HTMLDivElement | null)[]>([]);
  const iconLabelRef = useRef<HTMLSpanElement>(null);
  const taskBtnRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const exItemsRef = useRef<HTMLDivElement>(null);
  const dosLineRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const logoRef = useRef<HTMLCanvasElement>(null);
  const rippleRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const memRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const skipRef = useRef<HTMLParagraphElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const originRef = useRef({ x: 0.5, y: 0.5 });
  const deskLayoutRef = useRef<DeskLayout>(deskLayout(1280, 800));
  const drawCursorRef = useRef<() => void>(() => {});
  // s: 0 means "not measured yet" (server render, pre-hydration): the stage is centred by CSS instead.
  const [layout, setLayout] = useState({ lw: 480, lh: 320, s: 0, left: 0, top: 0, portrait: false, bigLogo: false });
  const [desk, setDesk] = useState<DeskLayout>(deskLayoutRef.current);
  const [texture, setTexture] = useState<Texture>('square');
  const [touch, setTouch] = useState(false);
  const [clock, setClock] = useState('12:00');

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setTouch(mq.matches);
    update();
    mq.addEventListener('change', update);
    const d = new Date();
    setClock(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Fit the logical BIOS screen (480x320 landscape, 320x480 portrait) into the parent; lay out the desktop.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const fit = () => {
      const W = root.clientWidth;
      const H = root.clientHeight - 40; // top strip holds the label
      // Same rule as the container query in W95_CSS, so the pre-hydration frame and the measured one agree.
      const portrait = W / Math.max(1, root.clientHeight) < 0.9;
      const bw = portrait ? 320 : 480;
      const bh = portrait ? 480 : 320;
      let s = Math.min(W / bw, H / bh);
      if (s >= 1) s = Math.floor(s); // whole-pixel scale keeps the VGA font crisp
      // Portrait fills the frame instead of floating a 320x480 box in the middle of a tall phone.
      const lw = portrait && s >= 1 ? Math.min(Math.floor(W / s), 519) : bw;
      const lh = portrait && s >= 1 ? Math.min(Math.floor(H / s), 720) : bh;
      setLayout({
        lw,
        lh,
        s,
        left: Math.round((W - lw * s) / 2),
        top: 40 + Math.round((H - lh * s) / 2),
        portrait,
        bigLogo: portrait && lh >= 540,
      });
      const d = deskLayout(W, root.clientHeight);
      deskLayoutRef.current = d;
      setDesk(d);
      drawCursorRef.current();
      const rc = rippleRef.current;
      if (!rc) return;
      rc.width = Math.max(1, Math.round(W));
      rc.height = Math.max(1, Math.round(root.clientHeight));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // Build the boot timeline once.
  useEffect(() => {
    const logoCtx = logoRef.current!.getContext('2d')!;
    const src = makeLogoSource();
    const logo = { step: 0 };
    const logoCell = () => LOGO_CELLS[Math.min(LOGO_CELLS.length - 1, Math.round(logo.step))];
    const mem = { v: 0 };
    const bar = { n: 0 };
    const ripple = { out: 0, inn: 0 };
    const cur = { a: 0, b: 0 }; // cursor legs: centre → My Tools, My Tools → Start
    const heads = Array.from(headRef.current!.querySelectorAll<HTMLSpanElement>('[data-ch]'));
    const lines = lineRefs.current.filter(Boolean) as HTMLSpanElement[];
    const icons = iconRefs.current.filter(Boolean) as HTMLDivElement[];
    const taskBtns = taskBtnRefs.current.filter(Boolean) as HTMLSpanElement[];
    const exItems = Array.from(exItemsRef.current!.children) as HTMLElement[];
    const dosLines = dosLineRefs.current.filter(Boolean) as HTMLSpanElement[];
    const HIDDEN = 'inset(0% 0% 100% 0%)';
    const SHOWN = 'inset(0% 0% 0% 0%)';

    const drawBar = () => {
      const n = Math.round(bar.n);
      if (barRef.current) barRef.current.textContent = `[${'█'.repeat(n)}${'░'.repeat(16 - n)}] ${String(Math.round((n / 16) * 100)).padStart(3, ' ')}%`;
    };
    const drawCursor = () => {
      const el = cursorRef.current;
      if (!el) return;
      const d = deskLayoutRef.current;
      const p0 = { x: d.W / 2, y: d.avail / 2 };
      const p1 = { x: 12 + 40, y: d.top + 18 };
      const p2 = { x: 22, y: d.H - 12 };
      const [from, to, k] = cur.b > 0 ? [p1, p2, cur.b] : [p0, p1, cur.a];
      el.style.transform = `translate(${Math.round(from.x + (to.x - from.x) * k)}px, ${Math.round(from.y + (to.y - from.y) * k)}px)`;
    };
    drawCursorRef.current = drawCursor;
    const drawRipple = () => {
      const rc = rippleRef.current;
      if (!rc) return; // refs detach while a Suspense boundary hides this piece
      const g = rc.getContext('2d')!;
      const W = rc.width;
      const H = rc.height;
      g.clearRect(0, 0, W, H);
      if (ripple.out <= 0) return;
      const cell = W < 500 ? 10 : 16;
      const ox = originRef.current.x * W;
      const oy = originRef.current.y * H;
      const maxD = Math.hypot(Math.max(ox, W - ox), Math.max(oy, H - oy)) + cell * 4;
      const rOut = ripple.out * maxD;
      const rIn = ripple.inn * maxD;
      for (let y = 0; y < H; y += cell) {
        for (let x = 0; x < W; x += cell) {
          const d = Math.hypot(x + cell / 2 - ox, y + cell / 2 - oy) + (hash(x, y) - 0.5) * cell * 5;
          if (d > rOut || d < rIn) continue;
          const edge = Math.min(rOut - d, rIn > 0 ? d - rIn : Infinity);
          g.fillStyle = edge < cell * 1.5 ? '#dfdfdf' : edge < cell * 3 ? '#808080' : '#2c2c2c';
          g.fillRect(x, y, cell - 1, cell - 1);
        }
      }
    };

    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, paused: true });
    tl.set(biosRef.current, { autoAlpha: 1 })
      .set(deskRef.current, { autoAlpha: 0 })
      .set([deskWinRef.current, exRef.current, dosRef.current, startMenuRef.current], { clipPath: HIDDEN })
      .set([...icons, ...taskBtns, ...exItems, cursorRef.current], { autoAlpha: 0 })
      .set(iconLabelRef.current, { backgroundColor: 'rgba(0,0,0,0)', color: '#fff' })
      .set(startBtnRef.current, { boxShadow: 'var(--w-bevel-out)' })
      .set(cur, { a: 0, b: 0, onComplete: drawCursor })
      .set(skipRef.current, { autoAlpha: 0 })
      .set(heads, { textContent: HEAD_PLACEHOLDER })
      .set(lines, { textContent: (i: number) => blockify(LINES[i] ?? '', i) })
      .set(dosLines, { textContent: '' })
      .set(ripple, { out: 0, inn: 0, onComplete: drawRipple })
      .set(logo, { step: 0, onComplete: () => drawLogo(logoCtx, src, LOGO_CELLS[0]) })
      .set(mem, { v: 0, onComplete: () => void (memRef.current && (memRef.current.textContent = '0K')) })
      .set(bar, { n: 0, onComplete: drawBar });

    // Heading decodes centre-out.
    const mid = (heads.length - 1) / 2;
    heads.forEach((el, i) => {
      tl.to(el, { duration: 0.6, scrambleText: { text: HEADING[i], chars: BLOCKS, speed: 0.3, revealDelay: 0.3 } }, 0.2 + Math.abs(i - mid) * 0.12);
    });
    // Logo resolves: the Bayer cell steps 20px → 1px across the whole BIOS pass, one visible step at a time.
    tl.to(logo, {
      step: LOGO_CELLS.length - 1,
      duration: 4.4,
      ease: `steps(${LOGO_CELLS.length - 1})`,
      onUpdate: () => drawLogo(logoCtx, src, logoCell()),
    }, 0.3);
    // BIOS lines decode one after another.
    lines.forEach((el, i) => {
      const text = LINES[i];
      if (!text) return;
      tl.to(el, { duration: 0.55, scrambleText: { text, chars: BLOCKS, speed: 0.3, revealDelay: 0.3 } }, i < 3 ? 0.6 + i * 0.25 : '>-0.2');
      if (i === 2) {
        // Memory test counts up in 1024K steps.
        tl.to(mem, {
          v: 65536,
          duration: 1.1,
          ease: 'power1.in',
          snap: { v: 1024 },
          onUpdate: () => void (memRef.current && (memRef.current.textContent = `${mem.v}K${mem.v >= 65536 ? ' OK' : ''}`)),
        }, '>');
      }
    });
    tl.to(bar, { n: 16, duration: 1.4, ease: 'steps(16)', onUpdate: drawBar }, '>');
    tl.to(skipRef.current, { autoAlpha: 1, duration: 0.01 }, '<');
    tl.to(skipRef.current, { autoAlpha: 0.2, duration: 0.4, ease: 'steps(1)', repeat: 3, yoyo: true }, '>');
    tl.addLabel('biosDone', '>');

    // Handoff: the pixel field floods in from the origin, the desktop swaps in, then the field clears.
    tl.addLabel('handoff', '>+0.2');
    tl.to(ripple, { out: 1, duration: 0.9, ease: 'power2.in', onUpdate: drawRipple }, 'handoff');
    tl.set(biosRef.current, { autoAlpha: 0 }, '>');
    tl.set(deskRef.current, { autoAlpha: 1 }, '<');
    tl.addLabel('deskIn', '<');
    tl.to(ripple, { inn: 1, duration: 0.9, ease: 'power2.out', onUpdate: drawRipple }, 'deskIn');

    // Icons pop in one by one, the Welcome dialog unrolls top-down (a clip, never a scale: the text stays crisp).
    tl.to(icons, { autoAlpha: 1, duration: 0.01, stagger: 0.09 }, 'deskIn+=0.25');
    tl.to(deskWinRef.current, { clipPath: SHOWN, duration: 0.3, ease: 'steps(6)' }, 'deskIn+=0.6');
    // The cursor walks to My Tools and double-clicks it.
    tl.set(cursorRef.current, { autoAlpha: 1 }, 'deskIn+=0.9');
    tl.to(cur, { a: 1, duration: 0.8, ease: 'power2.inOut', onUpdate: drawCursor }, 'deskIn+=1.0');
    tl.set(iconLabelRef.current, { backgroundColor: '#fff', color: '#000' }, 'deskIn+=1.85');
    tl.set(iconLabelRef.current, { backgroundColor: 'rgba(0,0,0,0)', color: '#fff' }, 'deskIn+=1.95');
    tl.set(iconLabelRef.current, { backgroundColor: '#fff', color: '#000' }, 'deskIn+=2.05');
    // Explorer opens and fills with all 37 tools.
    tl.to(exRef.current, { clipPath: SHOWN, duration: 0.4, ease: 'steps(8)' }, 'deskIn+=2.15');
    tl.set(taskBtns[0], { autoAlpha: 1 }, '<');
    tl.to(exItems, { autoAlpha: 1, duration: 0.01, stagger: 0.022 }, '>');
    // A DOS prompt opens and types.
    tl.to(dosRef.current, { clipPath: SHOWN, duration: 0.3, ease: 'steps(6)' }, 'deskIn+=3.0');
    tl.set(taskBtns[1], { autoAlpha: 1 }, '<');
    dosLines.forEach((el, i) => {
      tl.to(el, { duration: 0.4, scrambleText: { text: DOS_LINES[i], chars: BLOCKS, speed: 0.3, revealDelay: 0.15 } }, i === 0 ? 'deskIn+=3.35' : '>-0.05');
    });
    // Then it heads for Start.
    tl.to(cur, { b: 1, duration: 0.7, ease: 'power2.inOut', onUpdate: drawCursor }, '>+0.1');
    tl.set(startBtnRef.current, { boxShadow: 'var(--w-bevel-in)' }, '>');
    tl.to(startMenuRef.current, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.25, ease: 'steps(5)' }, '<');
    tl.addLabel('desktop', '>');
    tl.to({}, { duration: 3.4 });
    tl.set(deskRef.current, { autoAlpha: 0 });

    tlRef.current = tl;
    if (rootRef.current) rootRef.current.dataset.boot = 'ready'; // hydrated and wired (frame checks wait on this)
    drawBar();
    drawLogo(logoCtx, src, LOGO_CELLS[0]);
    drawCursor();
    return () => {
      tl.kill();
      tlRef.current = null;
      drawCursorRef.current = () => {};
    };
  }, []);

  // Drive the timeline: progress, reduced motion (still), or free-running while active.
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (reducedMotion) {
      tl.pause();
      tl.seek('biosDone', false);
      return;
    }
    if (progress !== undefined) {
      tl.pause();
      tl.progress(Math.min(0.999, Math.max(0, progress)));
      return;
    }
    if (active) tl.play();
    else tl.pause();
  }, [active, reducedMotion, progress]);

  // Any key, click or tap skips to the handoff, rippling out from where you pressed.
  useEffect(() => {
    const root = rootRef.current!;
    const skip = (x?: number, y?: number) => {
      const tl = tlRef.current;
      if (!tl || reducedMotion || progress !== undefined) return;
      const t = tl.time();
      if (t >= tl.labels.handoff) return;
      originRef.current = x === undefined ? { x: 0.5, y: 0.5 } : { x, y: y! };
      tl.seek('handoff', false).play();
    };
    const onClick = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('a')) return;
      const r = root.getBoundingClientRect();
      skip((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    const onKey = () => active && skip();
    root.addEventListener('pointerdown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('pointerdown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [active, reducedMotion, progress]);

  const nextTexture = () => setTexture((t) => TEXTURES[(TEXTURES.indexOf(t) + 1) % TEXTURES.length]);
  const exCols = Math.max(1, Math.floor((desk.ex.w - 16) / 76));

  return (
    <div
      ref={rootRef}
      className="w95 pixel relative h-full w-full cursor-pointer overflow-hidden bg-black text-[#c0c0c0] select-none"
      data-reduced={reducedMotion ? '' : undefined}
      style={{ WebkitFontSmoothing: 'none' }}
    >
      <style>{W95_CSS}</style>
      {/* BIOS screen, a fixed logical size scaled to fit */}
      <div ref={biosRef} className="absolute inset-0 bg-black">
        <div
          ref={stageRef}
          className="w95-stage absolute"
          data-fit={layout.s === 0 ? 'css' : undefined}
          data-big={layout.bigLogo ? '' : undefined}
          style={
            layout.s === 0
              ? undefined
              : { left: layout.left, top: layout.top, width: layout.lw, height: layout.lh, transform: `scale(${layout.s})`, transformOrigin: '0 0' }
          }
        >
          <div className="flex h-full flex-col justify-center p-4 text-[16px] leading-[16px]">
            <div className="w95-head">
              <h2
                ref={headRef}
                onPointerEnter={nextTexture}
                aria-label={HEADING}
                className="text-[64px] leading-[64px] text-[#dfdfdf]"
                style={{ ...textureStyle(texture), imageRendering: 'pixelated' }}
                title="hover: swap the pixel cell"
              >
                {HEADING.split('').map((ch, i) => (
                  <span key={i} data-ch aria-hidden className="inline-block w-[32px]">
                    {HEAD_PLACEHOLDER}
                  </span>
                ))}
              </h2>
              <canvas
                ref={logoRef}
                width={LOGO_W}
                height={LOGO_H}
                aria-hidden
                className="w95-logo shrink-0"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <p className="mt-1 text-[#808080]">cell: {texture} ({touch ? 'tap' : 'hover'} the heading)</p>
            <div className="mt-3 flex flex-col gap-[2px] whitespace-pre">
              {LINES.map((_, i) => (
                <span key={i} className="block h-[16px]">
                  <span ref={(el) => void (lineRefs.current[i] = el)}>{blockify(LINES[i], i)}</span>
                  {i === 3 && (
                    <>
                      Memory Test : <span ref={memRef} className="text-[#fff]">0K</span>
                    </>
                  )}
                </span>
              ))}
              <span ref={barRef} className="mt-2 block h-[16px] text-[#dfdfdf]">
                {`[${'░'.repeat(16)}]   0%`}
              </span>
            </div>
            <p ref={skipRef} className="mt-4 text-[#fff]">
              {touch ? 'Tap to skip' : 'Press any key to skip'}
              <span className="w95-blink">_</span>
            </p>
          </div>
        </div>
      </div>

      {/* Desktop the boot hands over to. Every rectangle is whole-pixel so the bitmap fonts stay crisp. */}
      <div ref={deskRef} className="absolute inset-0 bg-w-desk font-w95 text-[11px] leading-[13px] text-white" style={{ visibility: 'hidden' }}>
        {/* faint wallpaper: the FDB/95 wordmark in a 1-bit dither */}
        <p
          aria-hidden
          className="pixel pointer-events-none absolute right-6 bottom-[52px] text-[128px] leading-[128px] text-[#3a3a3a]"
          style={{ display: desk.W >= 720 ? undefined : 'none' }}
        >
          FDB/95
        </p>

        <div className="absolute left-3 flex flex-col gap-3" style={{ top: desk.top }}>
          {DESK_ICONS.slice(0, desk.icons).map(({ label, kind }, i) => (
            <div key={label} ref={(el) => void (iconRefs.current[i] = el)} className="flex w-[80px] flex-col items-center gap-1 text-center">
              <Icon kind={kind} />
              <span ref={i === 0 ? iconLabelRef : undefined} className="px-[2px]">
                {label}
              </span>
            </div>
          ))}
        </div>

        <Win
          title="C:\TOOLS"
          icon="folder"
          winRef={exRef}
          style={{ left: desk.ex.l, top: desk.ex.t, width: desk.ex.w, height: desk.ex.h }}
          bodyClass="flex flex-col"
        >
          <div className="flex h-[18px] shrink-0 items-center gap-3 px-1">
            {['File', 'Edit', 'View', 'Help'].map((m) => (
              <span key={m}>
                <u>{m[0]}</u>
                {m.slice(1)}
              </span>
            ))}
          </div>
          <div
            ref={exItemsRef}
            className="grid min-h-0 flex-1 content-start gap-y-2 overflow-hidden bg-white p-2"
            style={{ boxShadow: 'var(--w-bevel-in)', gridTemplateColumns: `repeat(${exCols}, 76px)` }}
          >
            {TOOL_IDS.map((id, i) => (
              <div key={id} className="flex flex-col items-center gap-[2px] text-center">
                <Icon kind={(['exe', 'folder', 'doc'] as const)[i % 3]} />
                <span className="w-[72px] truncate">{id}</span>
              </div>
            ))}
          </div>
          <div className="mt-[2px] flex h-[18px] shrink-0 gap-[2px]">
            <span className="flex flex-1 items-center px-1" style={{ boxShadow: 'var(--w-bevel-in)' }}>
              37 object(s)
            </span>
            <span className="flex w-[96px] items-center px-1" style={{ boxShadow: 'var(--w-bevel-in)' }}>
              1.44MB
            </span>
          </div>
        </Win>

        <Win
          title="MS-DOS Prompt"
          icon="exe"
          winRef={dosRef}
          style={{ left: desk.dos.l, top: desk.dos.t, width: desk.dos.w, height: desk.dos.h }}
          bodyClass="bg-black p-2 pixel text-[16px] leading-[16px] text-[#dfdfdf] overflow-hidden"
        >
          <div className="flex flex-col gap-[2px] whitespace-pre">
            {DOS_LINES.map((_, i) => (
              <span key={i} ref={(el) => void (dosLineRefs.current[i] = el)} className="block h-[16px]" />
            ))}
            <span className="block h-[16px] animate-pulse">_</span>
          </div>
        </Win>

        <Win title="Welcome" icon="monitor" winRef={deskWinRef} style={{ left: desk.wel.l, top: desk.wel.t, width: desk.wel.w }}>
          <div className="flex gap-3 p-3">
            <span className="pixel grid h-[32px] w-[32px] shrink-0 place-items-center bg-black text-[16px] text-white">i</span>
            <div>
              <p className="font-bold">Welcome to FDB/95</p>
              <p className="mt-1">37 tools loaded. Double-click an icon to start.</p>
            </div>
          </div>
          <div className="flex justify-end px-3 pb-2">
            <span className="grid h-[22px] w-[72px] place-items-center" style={{ boxShadow: 'var(--w-bevel-out), 0 0 0 1px #000' }}>
              OK
            </span>
          </div>
        </Win>

        {/* Start menu, unrolls top-down above the taskbar */}
        <div
          ref={startMenuRef}
          className="absolute left-[2px] flex w-[184px] bg-w-face p-[3px] text-black"
          style={{ bottom: TASKBAR - 2, boxShadow: 'var(--w-bevel-out)', clipPath: 'inset(0% 0% 100% 0%)' }}
        >
          <div className="flex w-[22px] items-end justify-center bg-black pb-2">
            <span className="pixel text-[16px] leading-[16px] text-white [writing-mode:vertical-rl] rotate-180">FDB/95</span>
          </div>
          <div className="flex flex-1 flex-col">
            {START_ITEMS.slice(0, desk.startItems).map((item, i) => (
              <span key={item} className={`flex h-[28px] items-center gap-2 px-2 ${i === 0 ? 'bg-black text-white' : ''}`}>
                <Icon kind={(['folder', 'doc', 'monitor', 'picture', 'doc', 'exe'] as const)[i]} size={16} />
                {item}
                {i < 3 && <span className="ml-auto">▸</span>}
              </span>
            ))}
            <span className="my-[2px] h-[2px]" style={{ boxShadow: 'inset 0 1px #808080, inset 0 -1px #fff' }} />
            <span className="flex h-[28px] items-center gap-2 px-2">
              <Icon kind="bin" size={16} />
              Shut Down...
            </span>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-w-face px-[3px] text-black" style={{ height: TASKBAR, boxShadow: 'inset 0 1px #dfdfdf, inset 0 2px #fff' }}>
          <span ref={startBtnRef} className="flex h-[22px] shrink-0 items-center gap-1 px-2 font-bold" style={{ boxShadow: 'var(--w-bevel-out)' }}>
            <Icon kind="monitor" size={16} />
            Start
          </span>
          {[
            ['C:\\TOOLS', 'folder'],
            ['MS-DOS Prompt', 'exe'],
          ].map(([t, k], i) => (
            <span
              key={t}
              ref={(el) => void (taskBtnRefs.current[i] = el)}
              className="flex h-[22px] min-w-0 items-center gap-1 truncate px-2"
              style={{ width: desk.W >= 720 ? 160 : undefined, boxShadow: i === 1 ? 'var(--w-bevel-in)' : 'var(--w-bevel-out)' }}
            >
              <Icon kind={k as IconKind} size={16} />
              <span className="truncate">{t}</span>
            </span>
          ))}
          <span className="ml-auto flex h-[22px] shrink-0 items-center px-2" style={{ boxShadow: 'var(--w-bevel-in)' }}>
            {clock}
          </span>
        </div>

        {/* the Win95 arrow, 2x, moved in whole pixels */}
        <div ref={cursorRef} aria-hidden className="pointer-events-none absolute top-0 left-0" style={{ visibility: 'hidden' }}>
          <svg width="24" height="38" viewBox="0 0 12 19" shapeRendering="crispEdges">
            <path d="M0 0v16l4-4 3 7 2-1-3-6h5z" fill="#fff" stroke="#000" strokeWidth="1" />
          </svg>
        </div>
      </div>

      <canvas ref={rippleRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" style={{ imageRendering: 'pixelated' }} />

      {/* CRT: 1px scanlines every 3px plus a soft vignette, over both the BIOS and the desktop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 3px), radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.45) 100%)',
        }}
      />

      <div className="pointer-events-auto absolute top-2 left-2 flex max-w-[calc(100%-16px)] flex-wrap gap-x-3 bg-black/80 px-2 py-1">
        <p className="text-[16px] leading-[16px] text-[#dfdfdf]">Win95 Boot</p>
        <BuiltWith tools={TOOLS} />
      </div>
    </div>
  );
}
