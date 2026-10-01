'use client';

/*
 * Transition Deck: eight ways to get from card A (a list) to card B (a detail view), in black and white.
 * Every transition is one paused GSAP timeline built from A to B. [play] runs it forward, [back] reverses
 * it, so the way back is always the exact mirror of the way in.
 *  1 crossfade      autoAlpha both ways at once, 200ms
 *  2 slide          xPercent, sign set by direction (next or previous)
 *  3 scale + fade   B grows from 0.92 on top of a dimmed A
 *  4 FLIP           Flip.fit(header, row, { getVars: true }) gives the row's box; the header tweens from it
 *  5 circle reveal  clip-path circle from the point you tapped, radius to the farthest corner
 *  6 stagger in     children in order, total stagger capped with stagger.amount
 *  7 pixel wipe     a grid of squares, stagger grid + steps(1), swap under cover, uncover
 *  8 blur-through   filter blur 0 to 12px out, 12px to 0 in, overlapped
 * Autoplay cycles them every 2.5s while active. A progress prop scrubs all eight in order.
 * Nothing animated carries a React style prop, so clearProps: 'all' resets a card cleanly between builds.
 */

import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as RMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner } from './g3-kit';

gsap.registerPlugin(Flip);

const TOOLS = ['gsap', 'css', 'svg'];
const COLS = 8;
const SPEEDS = [1, 0.5, 0.25];

interface Ctx {
  x: number;
  y: number;
  r: number;
  dir: 1 | -1;
  rows: number;
  n: number;
}

interface Tr {
  name: string;
  short: string;
  dur: string;
  ease: string;
  use: string;
  never: string;
  table: string;
  vt?: string;
  code: (c: Ctx) => string;
}

const TRANSITIONS: Tr[] = [
  {
    name: 'crossfade',
    short: 'fade',
    dur: '200ms',
    ease: 'power1.inOut',
    use: 'Swapping content in place. Tabs, a filter, a new photo.',
    never: 'Moving between places. It hides where things went.',
    table: 'Swaps in place',
    vt: 'Native: document.startViewTransition(() => swap()) crossfades by default. Not every browser has it yet.',
    code: () => `gsap.timeline({ defaults: { duration: 0.2, ease: 'power1.inOut' } })
  .to(a, { autoAlpha: 0 })
  .fromTo(b, { autoAlpha: 0 }, { autoAlpha: 1 }, 0)`,
  },
  {
    name: 'slide',
    short: 'slide',
    dur: '400ms',
    ease: 'power3.inOut',
    use: 'Next and previous in a sequence. Steps, carousels, onboarding.',
    never: 'Opening something unrelated. Direction promises an order.',
    table: 'Next and previous',
    vt: 'Native: animate ::view-transition-old(root) and ::view-transition-new(root) with your own slide keyframes.',
    code: (c) => `const dir = ${c.dir}; // 1 next, -1 previous
gsap.timeline({ defaults: { duration: 0.4, ease: 'power3.inOut' } })
  .to(a, { xPercent: -100 * dir })
  .fromTo(b, { xPercent: 100 * dir }, { xPercent: 0 }, 0)`,
  },
  {
    name: 'scale + fade',
    short: 'scale',
    dur: '300ms',
    ease: 'power2.out',
    use: 'Opening something on top. A modal, a sheet, a quick view.',
    never: 'Going to a sibling page. It reads as a layer, not a place.',
    table: 'Opening on top',
    code: () => `gsap.timeline({ defaults: { duration: 0.3, ease: 'power2.out' } })
  .to(a, { scale: 0.96, autoAlpha: 0.4 })
  .fromTo(b, { scale: 0.92, autoAlpha: 0 },
             { scale: 1, autoAlpha: 1 }, 0)`,
  },
  {
    name: 'shared-element FLIP',
    short: 'flip',
    dur: '600ms',
    ease: 'power3.inOut',
    use: 'List to detail, when one thing plainly becomes the next screen.',
    never: 'Items with no visual link, or a row that has scrolled away.',
    table: 'List to detail',
    vt: 'Native: give both elements view-transition-name: hero, then call document.startViewTransition().',
    code: () => `// First, Last, Invert, Play: the header starts in the row's box
const from = Flip.fit(header, row, { getVars: true });
gsap.timeline()
  .fromTo(header, from, { x: 0, y: 0, width: w, height: h,
    duration: 0.6, ease: 'power3.inOut' })
  .from(rest, { autoAlpha: 0, y: 12, stagger: 0.04 }, 0.35)`,
  },
  {
    name: 'circle reveal',
    short: 'circle',
    dur: '600ms',
    ease: 'power2.inOut',
    use: 'Answering a tap. The new screen grows from the finger. Theme switches.',
    never: 'Every navigation. It is loud, so save it for moments.',
    table: 'Answering a tap',
    vt: 'Native: inside document.startViewTransition().ready, animate clip-path on ::view-transition-new(root).',
    code: (c) => `const r = Math.hypot(dx, dy); // farthest corner: ${Math.round(c.r)}px
gsap.fromTo(b,
  { clipPath: 'circle(0px at ${Math.round(c.x)}px ${Math.round(c.y)}px)' },
  { clipPath: 'circle(${Math.round(c.r)}px at ${Math.round(c.x)}px ${Math.round(c.y)}px)',
    duration: 0.6, ease: 'power2.inOut' })`,
  },
  {
    name: 'stagger in',
    short: 'stagger',
    dur: '300ms + 240ms max',
    ease: 'power3.out',
    use: 'A new screen with a few blocks. Cards, a menu, a dashboard.',
    never: 'Long lists. Past six items nobody waits, so cap the total.',
    table: 'A few blocks arriving',
    code: (c) => `gsap.fromTo(items, { autoAlpha: 0, y: 16 }, {
  autoAlpha: 1, y: 0, duration: 0.3, ease: 'power3.out',
  // ${c.n} items: 40ms each, never more than 240ms in total
  stagger: { amount: Math.min(0.24, items.length * 0.04) },
})`,
  },
  {
    name: 'pixel wipe',
    short: 'pixels',
    dur: '700ms',
    ease: 'steps(1)',
    use: 'Retro and game UI. Scene changes that should feel like a cut.',
    never: 'Work tools, or anything people do fifty times a day.',
    table: 'Retro scene cuts',
    code: (c) => `const grid = { grid: [${c.rows}, ${COLS}], from: 'start', amount: 0.3 };
gsap.timeline()
  .to(cells, { scale: 1, duration: 0.08, ease: 'steps(1)', stagger: grid })
  .set(a, { autoAlpha: 0 }).set(b, { autoAlpha: 1 })
  .to(cells, { scale: 0, duration: 0.08, ease: 'steps(1)', stagger: grid })`,
  },
  {
    name: 'blur-through',
    short: 'blur',
    dur: '500ms',
    ease: 'sine.inOut',
    use: 'Dreamy moments and loading hand-offs, while content gets ready.',
    never: 'Text people must read mid-move, or slow phones. Blur is costly.',
    table: 'Dreamy or loading',
    code: () => `gsap.timeline({ defaults: { duration: 0.3 } })
  .to(a, { filter: 'blur(12px)', autoAlpha: 0, ease: 'sine.in' })
  .fromTo(b, { filter: 'blur(12px)', autoAlpha: 0 },
    { filter: 'blur(0px)', autoAlpha: 1, ease: 'sine.out' }, 0.2)`,
  },
];

const ITEMS = [
  { t: 'Salt flats', m: 'Photo set · 14' },
  { t: 'Dunes at noon', m: 'Photo set · 22' },
  { t: 'Night ferry', m: 'Photo set · 9' },
  { t: 'Glasshouse', m: 'Photo set · 31' },
  { t: 'Quarry lake', m: 'Photo set · 12' },
];
const SHARED = 1;

/** Mono "photo": a sun, a dune and a hatch, all CSS gradients. */
function photo(i: number): CSSProperties {
  const sx = 28 + ((i * 23) % 50);
  const sy = 30 + ((i * 17) % 25);
  return {
    backgroundColor: 'var(--v-surface)',
    backgroundImage: [
      `radial-gradient(circle at ${sx}% ${sy}%, var(--v-ink) 0 12%, transparent 12.5%)`,
      `radial-gradient(ellipse 90% 45% at ${20 + i * 12}% 100%, var(--v-dim) 0 70%, transparent 71%)`,
      `repeating-linear-gradient(${45 + i * 30}deg, var(--v-steel) 0 1px, transparent 1px 5px)`,
    ].join(','),
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* the ease plot in the info panel: 0..1 mapped into a short wide box */
const EW = 400;
const EH = 64;
const EP = 6;
const easeY = (v: number) => EP + (1 - v) * (EH - EP * 2);

function Btn({ children, onClick, on = false, title }: { children: ReactNode; onClick: () => void; on?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on || undefined}
      className={`pixel shrink-0 border px-1.5 py-0.5 text-[16px] leading-[16px] ${
        on
          ? 'border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]'
          : 'border-[var(--v-steel)] text-[var(--v-soft)] hover:border-[var(--v-dim)] hover:text-[var(--v-ink)]'
      }`}
    >
      {children}
    </button>
  );
}

function Panel({ title, right, children, className = '' }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`relative flex min-h-0 min-w-0 flex-col border border-[var(--v-steel)] bg-[var(--v-bg)] ${className}`}>
      <header className="pixel flex items-center justify-between gap-2 border-b border-[var(--v-line)] px-2 py-1 text-[16px] leading-[16px]">
        <span className="truncate text-[var(--v-ink)]">{title}</span>
        {right}
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/* ───────────── the two screens ───────────── */

function Device({
  devRef,
  rows,
  devW,
  origin,
  showOrigin,
  onRow,
  onBack,
}: {
  devRef: RefObject<HTMLDivElement | null>;
  rows: number;
  devW: number;
  origin: { x: number; y: number };
  showOrigin: boolean;
  onRow: (e: RMouseEvent<HTMLButtonElement>) => void;
  onBack: () => void;
}) {
  const title = Math.round(Math.min(34, Math.max(18, devW * 0.075)));
  return (
    <div ref={devRef} className="relative h-full w-full overflow-hidden border border-[var(--v-steel)] bg-[var(--v-bg)]">
      {/* card A: the list */}
      <div data-a className="absolute inset-0 flex flex-col bg-[var(--v-bg)]">
        <div className="pixel flex h-8 shrink-0 items-center justify-between border-b border-[var(--v-line)] px-3 text-[16px] leading-[16px]">
          <span className="text-[var(--v-ink)]">library</span>
          <span className="text-[var(--v-dim)]">A · list</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2">
          {ITEMS.map((it, i) => (
            <button
              key={it.t}
              type="button"
              data-row={i}
              onClick={onRow}
              className="flex min-h-0 flex-1 items-center gap-3 border border-[var(--v-steel)] px-2 text-left hover:border-[var(--v-dim)]"
            >
              <div className="aspect-square h-[72%] max-h-14 shrink-0" style={photo(i)} />
              <div className="min-w-0">
                <p className="truncate text-[14px] leading-tight text-[var(--v-ink)]">{it.t}</p>
                <p className="truncate text-[12px] leading-tight text-[var(--v-dim)]">{it.m}</p>
              </div>
              <span className="pixel ml-auto text-[16px] text-[var(--v-dim)]">&gt;</span>
            </button>
          ))}
        </div>
      </div>

      {/* card B: the detail */}
      <div data-b className="invisible absolute inset-0 opacity-0">
        <div data-bbg className="absolute inset-0 bg-[var(--v-bg)]" />
        <div className="relative flex h-full flex-col gap-2 p-2">
          <div data-bp className="pixel flex h-6 shrink-0 items-center justify-between px-1 text-[16px] leading-[16px]">
            <button type="button" onClick={onBack} className="text-[var(--v-soft)] hover:text-[var(--v-ink)]">
              &lt; back
            </button>
            <span className="text-[var(--v-dim)]">B · detail</span>
          </div>
          {/* the slot keeps the layout still; the inner box is what flies from the row */}
          <div data-bp data-head className="relative min-h-0 flex-[1.4]">
            <div data-hin className="absolute top-0 left-0 z-10 h-full w-full overflow-hidden border border-[var(--v-soft)]">
              <div className="absolute inset-0" style={photo(SHARED)} />
              <span className="pixel absolute bottom-1 left-2 bg-[var(--v-bg)] px-1 text-[16px] leading-[16px] text-[var(--v-ink)]">02 / 05</span>
            </div>
          </div>
          <div data-bp className="shrink-0">
            {/* mock app screen inside the demo, not a page heading */}
            <p className="font-display leading-none text-[var(--v-ink)]" style={{ fontSize: title }}>
              {ITEMS[SHARED].t}
            </p>
          </div>
          <div data-bp className="shrink-0 text-[12px] text-[var(--v-dim)]">
            {ITEMS[SHARED].m} · shot in March
          </div>
          {[92, 84, 58].map((w) => (
            <div key={w} data-bp className="h-2 shrink-0">
              <div className="h-full bg-[var(--v-steel)]" style={{ width: `${w}%` }} />
            </div>
          ))}
          <div data-bp className="mt-auto shrink-0">
            <div className="pixel border border-[var(--v-ink)] py-1 text-center text-[16px] leading-[16px] text-[var(--v-ink)]">open set</div>
          </div>
        </div>
      </div>

      {/* pixel wipe cover, over both cards */}
      <div data-px className="pointer-events-none invisible absolute inset-0 z-20">
        <div className="grid h-full w-full" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {Array.from({ length: COLS * rows }, (_, i) => (
            <div key={i} data-cell className="bg-[var(--v-ink)]" />
          ))}
        </div>
      </div>

      {showOrigin && (
        <div aria-hidden className="pointer-events-none absolute z-30 h-5 w-5 -translate-x-1/2 -translate-y-1/2 mix-blend-difference" style={{ left: origin.x, top: origin.y }}>
          <div className="absolute top-1/2 left-0 h-px w-full bg-[var(--v-ink)]" />
          <div className="absolute top-0 left-1/2 h-full w-px bg-[var(--v-ink)]" />
        </div>
      )}
    </div>
  );
}

/* ───────────── timelines: one per transition, always A to B ───────────── */

function buildTimeline(i: number, dev: HTMLDivElement, c: Ctx, onUpdate: (p: number) => void) {
  const q = (s: string) => [...dev.querySelectorAll<HTMLElement>(s)];
  const a = dev.querySelector<HTMLElement>('[data-a]')!;
  const b = dev.querySelector<HTMLElement>('[data-b]')!;
  const bbg = dev.querySelector<HTMLElement>('[data-bbg]')!;
  const head = dev.querySelector<HTMLElement>('[data-head]')!;
  const parts = q('[data-bp]');
  const rowEls = q('[data-row]');
  const px = dev.querySelector<HTMLElement>('[data-px]')!;
  const cells = q('[data-cell]');

  const tl = gsap.timeline({ paused: true, onUpdate: () => onUpdate(tl.progress()) });

  switch (i) {
    case 0: {
      const d = { duration: 0.2, ease: 'power1.inOut' };
      tl.fromTo(a, { autoAlpha: 1 }, { autoAlpha: 0, ...d }, 0).fromTo(b, { autoAlpha: 0 }, { autoAlpha: 1, ...d }, 0);
      break;
    }
    case 1: {
      const d = { duration: 0.4, ease: 'power3.inOut' };
      tl.fromTo(a, { xPercent: 0 }, { xPercent: -100 * c.dir, ...d }, 0).fromTo(
        b,
        { autoAlpha: 1, xPercent: 100 * c.dir },
        { xPercent: 0, ...d },
        0,
      );
      break;
    }
    case 2: {
      const d = { duration: 0.3, ease: 'power2.out' };
      tl.fromTo(a, { scale: 1, autoAlpha: 1 }, { scale: 0.96, autoAlpha: 0.4, ...d }, 0).fromTo(
        b,
        { scale: 0.92, autoAlpha: 0 },
        { scale: 1, autoAlpha: 1, ...d },
        0,
      );
      break;
    }
    case 3: {
      const row = rowEls[SHARED];
      // the header's inner box is absolutely placed, so width and height tween freely
      const hin = head.querySelector<HTMLElement>('[data-hin]')!;
      const w = hin.offsetWidth;
      const h = hin.offsetHeight;
      // Flip measures both boxes and hands back x, y, width and height that park the header on the row
      const from = (Flip.fit(hin, row, { getVars: true }) || {}) as gsap.TweenVars;
      const rest = parts.filter((p) => p !== head);
      tl.fromTo(b, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, 0)
        .fromTo(bbg, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power1.inOut' }, 0.1)
        .fromTo(row, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.01 }, 0)
        .fromTo(
          rowEls.filter((r) => r !== row),
          { autoAlpha: 1 },
          { autoAlpha: 0, duration: 0.2, ease: 'power1.out' },
          0,
        )
        .fromTo(hin, { ...from }, { x: 0, y: 0, width: w, height: h, duration: 0.6, ease: 'power3.inOut' }, 0)
        .fromTo(rest, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out', stagger: 0.04 }, 0.35);
      break;
    }
    case 4: {
      tl.fromTo(
        b,
        { autoAlpha: 1, clipPath: `circle(0px at ${c.x}px ${c.y}px)` },
        { clipPath: `circle(${c.r}px at ${c.x}px ${c.y}px)`, duration: 0.6, ease: 'power2.inOut' },
        0,
      );
      break;
    }
    case 5: {
      tl.fromTo(a, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.15, ease: 'power1.out' }, 0)
        .fromTo(b, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, 0.1)
        .fromTo(
          parts,
          { autoAlpha: 0, y: 16 },
          { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power3.out', stagger: { amount: Math.min(0.24, parts.length * 0.04) } },
          0.1,
        );
      break;
    }
    case 6: {
      const grid = { grid: [c.rows, COLS] as [number, number], from: 'start' as const, amount: 0.3 };
      tl.fromTo(px, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, 0)
        .fromTo(cells, { scale: 0 }, { scale: 1, duration: 0.08, ease: 'steps(1)', stagger: grid }, 0)
        .fromTo(a, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.01 }, 0.4)
        .fromTo(b, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, 0.4)
        .fromTo(cells, { scale: 1 }, { scale: 0, duration: 0.08, ease: 'steps(1)', stagger: grid, immediateRender: false }, 0.42)
        .fromTo(px, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.01, immediateRender: false }, 0.8);
      break;
    }
    default: {
      tl.fromTo(a, { filter: 'blur(0px)', autoAlpha: 1 }, { filter: 'blur(12px)', autoAlpha: 0, duration: 0.3, ease: 'sine.in' }, 0).fromTo(
        b,
        { filter: 'blur(12px)', autoAlpha: 0 },
        { filter: 'blur(0px)', autoAlpha: 1, duration: 0.3, ease: 'sine.out' },
        0.2,
      );
    }
  }
  return tl;
}

function resetDevice(dev: HTMLDivElement) {
  const els = dev.querySelectorAll('[data-a],[data-b],[data-bbg],[data-bp],[data-hin],[data-row],[data-px],[data-cell]');
  gsap.killTweensOf(els);
  gsap.set(els, { clearProps: 'all' });
}

/* ───────────── root ───────────── */

export default function TransitionDeck({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const devRef = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const readRef = useRef<HTMLSpanElement>(null);
  const easeDot = useRef<HTMLSpanElement>(null);
  const easeLine = useRef<SVGLineElement>(null);
  const easeFnRef = useRef<(t: number) => number>((t) => t);
  const lastIdx = useRef(-1);
  const pendingPlay = useRef(false);

  const [idx, setIdx] = useState(3);
  const [auto, setAuto] = useState(true);
  const [dir, setDir] = useState<1 | -1>(1);
  const [speed, setSpeed] = useState(0);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [sz, setSz] = useState({ w: 0, h: 0 });
  const [dev, setDev] = useState({ w: 0, h: 0 });
  const [build, setBuild] = useState(0);

  const scrubbing = progress !== undefined;
  const rows = dev.w > 0 ? Math.max(4, Math.min(16, Math.round((COLS * dev.h) / dev.w))) : 10;

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSz({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ready = sz.w > 0;
  const mode = sz.w >= 820 && sz.h >= 560 ? 'wide' : sz.h >= 480 && sz.w >= 300 ? 'stack' : 'compact';

  // measure the device (it mounts once the layout mode is known, and remounts when the mode changes)
  useLayoutEffect(() => {
    const el = devRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDev({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, ready]);

  // the tap point for the circle reveal; by default the right of the shared row, clear of its title
  const o = origin ?? { x: dev.w * 0.78, y: 40 + ((dev.h - 48) / 5) * 1.5 };
  const ctx: Ctx = {
    x: o.x,
    y: o.y,
    r: Math.hypot(Math.max(o.x, dev.w - o.x), Math.max(o.y, dev.h - o.y)),
    dir,
    rows,
    n: 8,
  };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const onUpdate = useCallback((p: number) => {
    if (barRef.current) barRef.current.style.width = `${p * 100}%`;
    if (readRef.current) readRef.current.textContent = p.toFixed(2);
    const x = EP + p * (EW - EP * 2);
    if (easeLine.current) {
      easeLine.current.setAttribute('x1', x.toFixed(1));
      easeLine.current.setAttribute('x2', x.toFixed(1));
    }
    if (easeDot.current) {
      easeDot.current.style.left = `${((x / EW) * 100).toFixed(2)}%`;
      easeDot.current.style.top = `${((easeY(easeFnRef.current(p)) / EH) * 100).toFixed(2)}%`;
    }
  }, []);

  // (re)build the timeline for the chosen transition. Same transition: keep where it was.
  useLayoutEffect(() => {
    const el = devRef.current;
    if (!el || dev.w === 0) return;
    const same = lastIdx.current === idx;
    const keep = same && tl.current ? tl.current.progress() : 0;
    tl.current?.kill();
    resetDevice(el);
    const t = buildTimeline(idx, el, ctxRef.current, onUpdate);
    t.timeScale(SPEEDS[speed]);
    tl.current = t;
    lastIdx.current = idx;
    if (reducedMotion) t.progress(1);
    else if (pendingPlay.current) {
      pendingPlay.current = false;
      t.progress(0);
      if (active) t.play();
    } else t.progress(keep);
    onUpdate(t.progress());
    setBuild((n) => n + 1);
    // speed and active are read once here; their own effects handle later changes
  }, [idx, dir, origin, dev.w, dev.h, rows, reducedMotion, mode, onUpdate]);

  useEffect(
    () => () => {
      tl.current?.kill();
    },
    [],
  );

  useEffect(() => {
    tl.current?.timeScale(SPEEDS[speed]);
  }, [speed]);

  // off screen: freeze the timeline (autoplay's delayed calls are killed by its own effect)
  useEffect(() => {
    if (!active) tl.current?.pause();
  }, [active]);

  // progress scrubs the eight in order: each gets an eighth, with a short hold at A and at B
  useEffect(() => {
    if (progress === undefined) return;
    const p = clamp01(progress);
    const i = Math.min(7, Math.floor(p * 8));
    if (i !== idx) {
      setIdx(i);
      return;
    }
    const t = tl.current;
    if (!t || reducedMotion) return;
    t.pause();
    t.progress(clamp01((clamp01(p * 8 - i) - 0.12) / 0.62));
  }, [progress, idx, build, reducedMotion]);

  // autoplay: play, hold, back, next. About 2.5s each (longer in slow motion).
  useEffect(() => {
    if (!auto || !active || reducedMotion || scrubbing) return;
    const t = tl.current;
    if (!t) return;
    const k = 1 / SPEEDS[speed];
    const calls = [
      gsap.delayedCall(0.2 * k, () => {
        t.play();
      }),
      gsap.delayedCall(1.5 * k, () => {
        t.reverse();
      }),
      gsap.delayedCall(2.5 * k, () => setIdx((i) => (i + 1) % 8)),
    ];
    return () => calls.forEach((c) => c.kill());
  }, [auto, active, reducedMotion, scrubbing, build, speed]);

  const play = () => {
    setAuto(false);
    const t = tl.current;
    if (!t) return;
    if (reducedMotion) t.progress(1);
    else t.play();
  };
  const back = () => {
    setAuto(false);
    const t = tl.current;
    if (!t) return;
    if (reducedMotion) t.progress(0);
    else t.reverse();
  };
  const choose = (i: number) => {
    setAuto(false);
    if (i === idx) {
      const t = tl.current;
      if (t && !reducedMotion) t.progress(0).play();
      return;
    }
    pendingPlay.current = true;
    setIdx(i);
  };
  const onRow = (e: RMouseEvent<HTMLButtonElement>) => {
    const d = devRef.current;
    if (!d) return;
    const r = d.getBoundingClientRect();
    // keyboard clicks carry no pointer position: use the row centre
    const br = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || br.left + br.width / 2;
    const y = e.clientY || br.top + br.height / 2;
    setAuto(false);
    pendingPlay.current = true;
    setOrigin({ x: x - r.left, y: y - r.top });
  };

  const T = TRANSITIONS[idx];
  const easeFn = useMemo(() => gsap.parseEase(T.ease), [T.ease]);
  easeFnRef.current = easeFn;
  const easePath = useMemo(() => {
    let d = '';
    for (let i = 0; i <= 96; i++) {
      const t = i / 96;
      d += `${i ? 'L' : 'M'}${(EP + t * (EW - EP * 2)).toFixed(1)},${easeY(easeFn(t)).toFixed(1)}`;
    }
    return d;
  }, [easeFn]);
  const compact = mode === 'compact';

  const switcher = (
    <div className={`grid gap-1 ${compact ? 'grid-cols-8' : 'grid-cols-4'}`} role="tablist" aria-label="Transitions">
      {TRANSITIONS.map((tr, i) => (
        <button
          key={tr.name}
          type="button"
          role="tab"
          aria-selected={i === idx}
          title={tr.name}
          onClick={() => choose(i)}
          className={`pixel min-w-0 truncate border px-1 py-0.5 text-left text-[16px] leading-[16px] ${
            i === idx ? 'border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]' : 'border-[var(--v-steel)] text-[var(--v-dim)] hover:text-[var(--v-ink)]'
          }`}
        >
          {compact ? i + 1 : `${i + 1} ${tr.short}`}
        </button>
      ))}
    </div>
  );

  const controls = (
    <div className="flex flex-wrap items-center gap-1">
      <Btn onClick={play} title="Play A to B">
        [play]
      </Btn>
      <Btn onClick={back} title="Reverse, B to A">
        [back]
      </Btn>
      {!scrubbing && !reducedMotion && (
        <Btn onClick={() => setAuto((v) => !v)} on={auto} title="Cycle all eight">
          auto {auto ? 'on' : 'off'}
        </Btn>
      )}
      {!reducedMotion && (
        <Btn onClick={() => setSpeed((s) => (s + 1) % SPEEDS.length)} title="tl.timeScale()">
          speed {SPEEDS[speed]}x
        </Btn>
      )}
      {idx === 1 && (
        <Btn onClick={() => setDir((d) => (d === 1 ? -1 : 1))} title="Slide direction">
          dir {dir === 1 ? 'next >' : '< prev'}
        </Btn>
      )}
    </div>
  );

  const timeline = (
    <div className="pixel flex items-center gap-2 text-[16px] leading-[16px] text-[var(--v-dim)]">
      <span className="shrink-0">tl.progress()</span>
      <div className="relative h-[6px] min-w-0 flex-1 border border-[var(--v-steel)]">
        <div ref={barRef} className="absolute inset-y-0 left-0 bg-[var(--v-ink)]" />
      </div>
      <span ref={readRef} className="w-[4ch] shrink-0 text-right text-[var(--v-soft)]">
        0.00
      </span>
    </div>
  );

  const device = (
    <Device devRef={devRef} rows={rows} devW={dev.w} origin={{ x: ctx.x, y: ctx.y }} showOrigin={idx === 4 && dev.w > 0} onRow={onRow} onBack={back} />
  );

  const stage = (
    <Panel title={`${String(idx + 1).padStart(2, '0')} ${T.name}`} right={<span className="shrink-0 text-[var(--v-dim)]">{T.dur}</span>} className="h-full">
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        {switcher}
        {controls}
        <div className="flex min-h-0 flex-1 justify-center">
          <div className="h-full w-full max-w-[400px]">{device}</div>
        </div>
        {timeline}
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
          {reducedMotion ? 'reduced motion: play and back jump, no tween' : idx === 4 ? 'tap a row: the circle starts there' : 'tap a row to play it'}
        </p>
      </div>
    </Panel>
  );

  const tableGrid = (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px] leading-snug">
          <thead>
            <tr className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
              <th className="px-2 py-1.5 font-normal">transition</th>
              <th className="px-2 py-1.5 font-normal">use for</th>
              <th className="px-2 py-1.5 font-normal">duration</th>
              <th className="hidden px-2 py-1.5 font-normal sm:table-cell">ease</th>
            </tr>
          </thead>
          <tbody>
            {TRANSITIONS.map((tr, i) => (
              <tr
                key={tr.name}
                onClick={() => choose(i)}
                className={`cursor-pointer border-t border-[var(--v-line)] ${i === idx ? 'bg-[var(--v-surface)] text-[var(--v-ink)]' : 'text-[var(--v-soft)] hover:text-[var(--v-ink)]'}`}
              >
                <td className="px-2 py-1.5">
                  <span className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">{i + 1}</span> {tr.name}
                </td>
                <td className="px-2 py-1.5">{tr.table}</td>
                <td className="px-2 py-1.5 font-mono text-[12px]">{tr.dur}</td>
                <td className="hidden px-2 py-1.5 font-mono text-[12px] sm:table-cell">{tr.ease}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );
  const table = <Panel title="which one when">{tableGrid}</Panel>;

  const info = (
    <Panel title="when and how" right={<span className="min-w-0 truncate text-[var(--v-soft)]">{T.ease}</span>} className="h-full">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-[14px] leading-snug">
          <dt className="pixel text-[16px] leading-[20px] text-[var(--v-dim)]">use it for</dt>
          <dd className="text-[var(--v-ink)]">{T.use}</dd>
          <dt className="pixel text-[16px] leading-[20px] text-[var(--v-dim)]">never for</dt>
          <dd className="text-[var(--v-soft)]">{T.never}</dd>
          <dt className="pixel text-[16px] leading-[20px] text-[var(--v-dim)]">duration</dt>
          <dd className="font-mono text-[13px] leading-[20px] text-[var(--v-ink)]">{T.dur}</dd>
          <dt className="pixel text-[16px] leading-[20px] text-[var(--v-dim)]">ease</dt>
          <dd className="font-mono text-[13px] leading-[20px] text-[var(--v-ink)]">&apos;{T.ease}&apos;</dd>
        </dl>
        <div className="min-w-0">
          <p className="pixel mb-1 text-[16px] leading-[16px] text-[var(--v-dim)]">the code (gsap)</p>
          <pre className="overflow-x-auto border border-[var(--v-steel)] bg-[var(--v-surface)] p-2 font-mono text-[12px] leading-[1.5] text-[var(--v-soft)]">
            <code>{T.code(ctx)}</code>
          </pre>
        </div>
        <div className="min-w-0">
          <p className="pixel mb-1 flex justify-between gap-2 text-[16px] leading-[16px] text-[var(--v-dim)]">
            <span>the ease, {T.dur}</span>
            <span className="truncate">time runs left to right</span>
          </p>
          <div className="relative">
          <svg viewBox={`0 0 ${EW} ${EH}`} preserveAspectRatio="none" className="block h-[64px] w-full border border-[var(--v-steel)] bg-[var(--v-surface)]" aria-hidden>
            <line x1={EP} x2={EW - EP} y1={easeY(1)} y2={easeY(1)} stroke="var(--v-steel)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <line x1={EP} x2={EW - EP} y1={easeY(0)} y2={easeY(0)} stroke="var(--v-steel)" vectorEffect="non-scaling-stroke" />
            <path d={easePath} fill="none" stroke="var(--v-ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <line ref={easeLine} x1={EP} x2={EP} y1={2} y2={EH - 2} stroke="var(--v-dim)" vectorEffect="non-scaling-stroke" />
          </svg>
          <span
            ref={easeDot}
            aria-hidden
            className="absolute block h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 bg-[var(--v-ink)]"
            style={{ left: `${(EP / EW) * 100}%`, top: `${(easeY(0) / EH) * 100}%` }}
          />
          </div>
        </div>
        {T.vt && (
          <p className="border-l border-[var(--v-dim)] pl-2 text-[13px] leading-snug text-[var(--v-soft)]">
            {T.vt} Here it is GSAP, so it works everywhere.
          </p>
        )}
        {mode === 'wide' && (
          <div className="mt-auto min-w-0 border border-[var(--v-steel)]">
            <p className="pixel border-b border-[var(--v-steel)] px-2 py-1.5 text-[16px] leading-[16px] text-[var(--v-ink)]">which one when</p>
            {tableGrid}
          </div>
        )}
      </div>
    </Panel>
  );


  return (
    <div ref={host} className="relative h-full w-full overflow-hidden bg-[var(--v-bg)] text-[var(--v-ink)]">
      <Corner title="Transition Deck" tools={TOOLS} />
      {ready && compact && (
        <div className="absolute inset-x-2 top-[52px] bottom-2 flex flex-col gap-1.5">
          {switcher}
          <div className="flex min-h-0 flex-1 justify-center">
            <div className="h-full w-full max-w-[360px]">{device}</div>
          </div>
          <p className="pixel truncate text-[16px] leading-[16px] text-[var(--v-dim)]">
            <span className="text-[var(--v-ink)]">{T.name}</span> · {T.dur} · {T.ease}
          </p>
        </div>
      )}
      {ready && !compact && (
        <div className="absolute inset-x-2 top-[52px] bottom-2 overflow-x-hidden overflow-y-auto sm:inset-x-3 sm:bottom-3">
          {mode === 'wide' ? (
            <div className="grid gap-2" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', height: Math.max(460, sz.h - 64) }}>
              {stage}
              {info}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div style={{ height: Math.min(620, Math.max(440, sz.h * 0.72)) }}>{stage}</div>
              {info}
            </div>
          )}
          {mode !== 'wide' && <div className="mt-2">{table}</div>}
        </div>
      )}
    </div>
  );
}
