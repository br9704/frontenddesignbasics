'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { Observer } from 'gsap/Observer';
import { SplitText } from 'gsap/SplitText';
import { ExpoScaleEase } from 'gsap/EasePack';
import type { ExperienceProps } from '@/lib/experiences/types';
import { G4Label, seeded, useSize } from './g4-shared';

gsap.registerPlugin(Flip, Observer, SplitText, ExpoScaleEase);

/*
 * Flip Bento: a mono bento of type and dithered images.
 *  - Collapse: record the grid with the hero blown up to fill the frame (Flip.getState), switch to
 *    the bento layout, then Flip.from(state, { absolute: true, ease: expoScale }) as a paused
 *    timeline. The lab frame is fixed (no page scroll), so instead of ScrollTrigger({ pin, scrub: 1 })
 *    GSAP Observer turns wheel or touch into a target and gsap.quickTo() follows it with the same
 *    one-second lag that scrub: 1 gives. After the collapse the finished bento is held for a stretch
 *    of input (HOLD_END) before it dissolves into the scatter.
 *  - Detail: clicking a tile records it, swaps in a modal clone with the same data-flip-id and
 *    Flip.from() flies it there; closing reverses into the exact slot. Captions rise per line.
 *  - Scatter: past the collapse the grid gives way to an endless scattered gallery. Items sit in
 *    depth lanes: each lane has one data-speed, and nearer (faster) lanes carry bigger, brighter,
 *    more tilted items, so the parallax reads as depth. Items in a lane are spaced further apart than
 *    their height, so they never pile up. Each item wraps with gsap.utils.wrap.
 *  - Dither: next/image under a 4x4 Bayer tile in hard-light, thresholded by a contrast filter.
 */

const TOOLS = ['gsap', 'css', 'next-image'];

type Tile = {
  id: string;
  kind: 'img' | 'type';
  src?: string;
  big?: string;
  italic?: boolean;
  small: string;
  title: string;
  note: string;
  tone?: number; // brightness pre-adjust for the dither
};

const TILES: Tile[] = [
  {
    id: 'h',
    kind: 'img',
    src: '/showcase/igloo.jpg',
    small: '[scroll] to collapse',
    title: 'Igloo',
    note: 'The hero starts full bleed. Scroll, and one Flip timeline scrubs it back into its cell while the other tiles slide in around it.',
    tone: 1.05,
  },
  {
    id: 'a',
    kind: 'type',
    big: '01',
    small: 'Flip.getState()',
    title: 'Record',
    note: 'Flip records where every tile is, the layout changes, and Flip.from() animates the difference.',
  },
  {
    id: 'b',
    kind: 'img',
    src: '/examples/3d-sobha-privy.jpg',
    small: 'tile · b',
    title: 'Sobha',
    note: 'Each picture is dithered in CSS: a 4x4 Bayer tile in hard-light, then a hard contrast filter.',
    tone: 1.5,
  },
  {
    id: 'c',
    kind: 'type',
    big: 'Flip',
    italic: true,
    small: 'expoScale(1.8, 1)',
    title: 'Ease',
    note: 'ExpoScaleEase makes a change in scale feel even, so the shrink does not rush at the end.',
  },
  {
    id: 'd',
    kind: 'img',
    src: '/showcase/bruno-simon-mobile.jpg',
    small: 'tile · d',
    title: 'Bruno Simon',
    note: 'Click any tile and it lifts into a detail view. Click again and it flies back to its exact slot.',
    tone: 1.25,
  },
  {
    id: 'e',
    kind: 'img',
    src: '/examples/3d-chipsa.jpg',
    small: 'tile · e',
    title: 'Chipsa',
    note: 'Past the collapse, the grid turns into a scattered gallery that never ends.',
    tone: 1,
  },
  {
    id: 'f',
    kind: 'type',
    big: '∞',
    small: 'Observer · wrap()',
    title: 'Scatter',
    note: 'GSAP Observer turns wheel and touch into one offset, and gsap.utils.wrap() loops every item.',
  },
  {
    id: 'g',
    kind: 'img',
    src: '/showcase/cosmos.jpg',
    small: 'tile · g',
    title: 'Cosmos',
    note: 'Every item moves at its own speed, read from a data attribute, which gives the scatter its depth.',
    tone: 1,
  },
];

/* grid tracks (percent of the gallery) and the hero cell, per orientation */
const LAYOUT = {
  wide: {
    cols: [22, 28, 28, 22],
    rows: [38, 38, 24],
    areas: '"a h h b" "c h h d" "e f g d"',
    hero: { l: 22, t: 0, w: 56, h: 76 },
    hidden: [] as string[],
  },
  tall: {
    cols: [50, 50],
    rows: [15, 24, 24, 18.5, 18.5],
    areas: '"a b" "h h" "h h" "c d" "e f"',
    hero: { l: 0, t: 15, w: 100, h: 48 },
    hidden: ['g'],
  },
};

const BAYER = (() => {
  const m = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const rects = m
    .map((v, i) => {
      const g = Math.round(((v + 0.5) / 16) * 255);
      return `<rect x='${i % 4}' y='${Math.floor(i / 4)}' width='1' height='1' fill='rgb(${g},${g},${g})'/>`;
    })
    .join('');
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4' shape-rendering='crispEdges'>${rects}</svg>`)}")`;
})();

function Dither({ src, tone = 1, sizes, priority = false }: { src: string; tone?: number; sizes: string; priority?: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#080808]" style={{ filter: 'grayscale(1) contrast(24)', isolation: 'isolate' }}>
      <Image src={src} alt="" fill sizes={sizes} priority={priority} className="object-cover" style={{ filter: `brightness(${tone}) contrast(0.9)` }} />
      <div
        className="absolute inset-0"
        style={{ backgroundImage: BAYER, backgroundSize: '6px 6px', mixBlendMode: 'hard-light', imageRendering: 'pixelated' }}
      />
    </div>
  );
}

function TileFace({ t, big = false, label }: { t: Tile; big?: boolean; label?: string }) {
  if (t.kind === 'img')
    return (
      <>
        <Dither src={t.src!} tone={t.tone} sizes={big ? '(max-width: 700px) 100vw, 60vw' : '(max-width: 700px) 50vw, 30vw'} priority={t.id === 'h'} />
        {t.id === 'h' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[#080808]/85 via-transparent to-transparent p-[4cqmin]">
            <p data-hint className="pixel text-[16px] leading-[16px] text-[var(--v-soft)]">
              {t.small}
            </p>
            <p className="font-display text-[clamp(22px,13cqmin,120px)] leading-[0.95] text-[var(--v-ink)] italic">Flip Bento</p>
          </div>
        )}
        {t.id !== 'h' && (
          <p className="pixel absolute bottom-1 left-1 max-w-[calc(100%-8px)] truncate bg-[#080808] px-1 text-[16px] leading-[16px] text-[var(--v-soft)]">
            {label ?? t.small}
          </p>
        )}
      </>
    );
  return (
    <div className="absolute inset-0 flex flex-col justify-end gap-[3cqmin] border border-[var(--v-steel)] bg-[var(--v-surface)] p-[6cqmin]">
      <p
        className={`${t.italic ? 'font-display italic' : 'pixel'} text-[clamp(20px,34cqmin,160px)] leading-[0.9] text-[var(--v-ink)]`}
        style={t.italic ? undefined : { WebkitFontSmoothing: 'none' }}
      >
        {t.big}
      </p>
      <p className="pixel truncate text-[16px] leading-[16px] text-[var(--v-dim)]">{label ?? t.small}</p>
    </div>
  );
}

type ScatterItem = { key: string; tile: Tile; label: string; x: number; w: number; ar: number; speed: number; depth: number; rot: number; base: number };

/* drive.p phases: 0..1 collapse, 1..HOLD_END the finished bento is held, then it dissolves into the scatter */
const HOLD_END = 1.4;
const MAX_AR = 1.25;
const MAX_W = 1.15; // widest item, as a share of its lane

/** Hero caption that makes sense outside the collapse (the bento hero says "[scroll] to collapse"). */
const caption = (t: Tile, n: number) => (t.id === 'h' ? `hero · ${t.title.toLowerCase()}` : `${String(n).padStart(2, '0')} · ${t.title.toLowerCase()}`);

export default function FlipBento({ active, reducedMotion, progress }: ExperienceProps) {
  const root = useRef<HTMLDivElement>(null);
  const gallery = useRef<HTMLDivElement>(null);
  const bento = useRef<HTMLDivElement>(null);
  const scatter = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(root);
  const tall = w > 0 && w / Math.max(1, h) < 0.9;
  const layout = tall ? LAYOUT.tall : LAYOUT.wide;
  const [open, setOpen] = useState<string | null>(null);
  const pendingFlip = useRef<{ state: Flip.FlipState; to: 'modal' | 'slot'; id: string } | null>(null);
  const flipTl = useRef<gsap.core.Timeline | null>(null);
  const drive = useRef({ target: reducedMotion ? 1 : 0, p: reducedMotion ? 1 : 0, idle: 0 });
  const openRef = useRef(open);
  openRef.current = open;
  const driven = progress !== undefined;
  const progressRef = useRef(progress ?? 0);
  progressRef.current = progress ?? 0;

  // Scatter: depth lanes across the full width. One speed per lane, so items in a lane never collide;
  // lanes differ in speed, size, brightness and tilt, which is what makes it read as depth.
  const items: ScatterItem[] = useMemo(() => {
    const r = seeded(11);
    const lanes = tall ? 3 : 6;
    const perLane = tall ? 4 : 3;
    const laneW = 1 / lanes;
    const speeds = Array.from({ length: lanes }, (_, i) => 0.55 + (i / (lanes - 1)) * 0.95);
    for (let i = speeds.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [speeds[i], speeds[j]] = [speeds[j], speeds[i]];
    }
    const pool = TILES.concat(TILES.filter((t) => t.kind === 'img'), TILES);
    const out: ScatterItem[] = [];
    let n = 0;
    for (let lane = 0; lane < lanes; lane++) {
      const speed = speeds[lane];
      const depth = (speed - 0.55) / 0.95;
      const phase = r();
      for (let j = 0; j < perLane; j++) {
        const tile = pool[(lane * 5 + j * 3) % pool.length];
        const w = laneW * (0.5 + depth * 0.55 + r() * 0.1) * (j % 2 ? 0.88 : 1);
        const base = (((j + phase) / perLane + (r() - 0.5) * 0.04) % 1 + 1) % 1; // lane spacing stays taller than any item
        n++;
        out.push({
          key: `s${n}`,
          tile,
          label: caption(tile, n),
          // jittered inside the lane, near items may bleed a little into the next lane
          x: gsap.utils.clamp(0.005, 0.995 - w, lane * laneW + (laneW - w) * r() + (r() - 0.5) * laneW * 0.35 * depth),
          w,
          ar: tile.kind === 'type' ? 1 : [0.8, 1, MAX_AR][Math.floor(r() * 3)],
          speed,
          depth,
          rot: (r() - 0.5) * (1.5 + depth * 4),
          base,
        });
      }
    }
    return out;
  }, [tall]);

  // Build the collapse: record expanded, switch to bento, Flip.from() as a paused timeline.
  useLayoutEffect(() => {
    const g = gallery.current;
    if (!g || !w || !h) return;
    const hero = layout.hero;
    const setExpanded = (on: boolean) => {
      if (on) {
        g.style.width = `${(100 * 100) / hero.w}%`;
        g.style.height = `${(100 * 100) / hero.h}%`;
        g.style.left = `${(-hero.l / hero.w) * 100}%`;
        g.style.top = `${(-hero.t / hero.h) * 100}%`;
      } else {
        g.style.width = '100%';
        g.style.height = '100%';
        g.style.left = '0%';
        g.style.top = '0%';
      }
    };
    const cells = gsap.utils.toArray<HTMLElement>('[data-cell]', g);
    const restore = () =>
      cells.forEach((c) => {
        gsap.set(c, { clearProps: 'position,top,left,width,height,transform,translate,rotate,scale,transition' });
        c.style.gridArea = c.dataset.area ?? '';
      });
    restore();
    if (reducedMotion) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    const state = Flip.getState(cells);
    setExpanded(false);
    const startScale = Math.max(100 / hero.w, 100 / hero.h);
    const tl = gsap.timeline({ paused: true });
    tl.add(
      Flip.from(state, {
        absolute: true,
        duration: 1,
        // expoScale(start, 1) is NaN when start === 1 (the tall layout's hero is already full width),
        // so the start scale is the larger of the two axes, with a plain expo ease as a fallback.
        ease: startScale > 1.01 ? ExpoScaleEase.config(startScale, 1) : 'expo.inOut',
        simple: true,
      }),
    );
    flipTl.current = tl;
    tl.progress(Math.min(1, drive.current.p));
    return () => {
      tl.progress(1).kill();
      flipTl.current = null;
      restore();
    };
  }, [w, h, tall, reducedMotion, layout]);

  // Input: Observer (wheel + touch) moves the target; idle drift keeps the card alive.
  useEffect(() => {
    const d = drive.current;
    if (reducedMotion) {
      d.p = d.target = 1;
      // no collapse to scroll through, so the hero's "[scroll] to collapse" hint goes
      root.current?.querySelectorAll<HTMLElement>('[data-hint]').forEach((el) => (el.style.opacity = '0'));
      return;
    }
    const obs = driven
      ? null
      : Observer.create({
          target: root.current,
          type: 'wheel,touch',
          preventDefault: true,
          wheelSpeed: 1,
          tolerance: 2,
          onChangeY: (self) => {
            if (openRef.current) return;
            const dir = self.event.type === 'wheel' ? 1 : -1;
            d.target = Math.max(0, d.target + (dir * self.deltaY) / Math.max(300, (root.current?.clientHeight ?? 600) * 2.4));
            d.idle = 0;
          },
        });
    const pTo = gsap.quickTo(d, 'p', { duration: 1, ease: 'power3.out' });
    const tick = (_t: number, dtMs: number) => {
      const dt = Math.min(0.05, dtMs / 1000);
      if (driven) {
        d.target = progressRef.current * 2.6;
      } else if (openRef.current) {
        d.idle = 0;
      } else {
        d.idle += dt;
        if (d.idle > 1.2) d.target += dt * 0.11;
      }
      pTo(d.target);
      apply();
    };
    const apply = () => {
      const p = d.p;
      flipTl.current?.progress(Math.min(1, p));
      root.current?.querySelectorAll<HTMLElement>('[data-hint]').forEach((el) => (el.style.opacity = String(1 - gsap.utils.clamp(0, 1, p * 5))));
      const k1 = gsap.utils.clamp(0, 1, (p - HOLD_END) / 0.16);
      const k = gsap.utils.clamp(0, 1, (p - HOLD_END - 0.1) / 0.2);
      if (bento.current) gsap.set(bento.current, { autoAlpha: 1 - k1, scale: 1 - k1 * 0.08, yPercent: -k1 * 6 });
      if (scatter.current) {
        gsap.set(scatter.current, { autoAlpha: k });
        const H = scatter.current.clientHeight;
        const W = scatter.current.clientWidth;
        const off = Math.max(0, p - HOLD_END + 0.05) * H * 2.2;
        const lanes = W / Math.max(1, H) < 0.9 ? 3 : 6;
        const maxH = (W / lanes) * MAX_W * MAX_AR; // tallest possible item
        const span = H + maxH * 1.15;
        scatter.current.querySelectorAll<HTMLElement>('[data-speed]').forEach((el) => {
          const speed = Number(el.dataset.speed);
          const base = Number(el.dataset.base);
          const y = gsap.utils.wrap(-maxH * 1.1, span - maxH * 1.1, base * span - off * speed + (1 - k) * 80 * speed);
          gsap.set(el, { y, rotation: Number(el.dataset.rot) });
        });
      }
    };
    if (active) gsap.ticker.add(tick);
    apply();
    return () => {
      gsap.ticker.remove(tick);
      obs?.kill();
    };
  }, [active, reducedMotion, driven, w, h]);

  // Open / close with Flip between the tile and the modal clone.
  const toggle = (id: string) => {
    const g = root.current;
    if (!g) return;
    const d = drive.current;
    d.idle = 0;
    if (open) {
      // back in the bento: pull the target to the start of the hold, so the flight home settles in view
      if (d.target >= 0.98 && d.target < HOLD_END) d.target = Math.min(d.target, 1);
      const m = g.querySelector<HTMLElement>(`[data-modal-media]`);
      if (m) pendingFlip.current = { state: Flip.getState(m), to: 'slot', id: open };
      setOpen(null);
    } else {
      const src = g.querySelector<HTMLElement>(`[data-flip-id="${id}"]:not([data-modal-media])`);
      if (src) pendingFlip.current = { state: Flip.getState(src), to: 'modal', id };
      setOpen(id);
    }
  };
  useLayoutEffect(() => {
    const pf = pendingFlip.current;
    const g = root.current;
    pendingFlip.current = null;
    if (!pf || !g) return;
    const dur = reducedMotion ? 0 : 0.8;
    if (pf.to === 'modal') {
      const m = g.querySelector<HTMLElement>('[data-modal-media]');
      if (!m) return;
      Flip.from(pf.state, { targets: m, scale: true, duration: dur, ease: 'power3.inOut' });
      const back = g.querySelector<HTMLElement>('[role="dialog"]');
      if (back && !reducedMotion)
        gsap.fromTo(back, { backgroundColor: 'rgba(8,8,8,0)' }, { backgroundColor: 'rgba(8,8,8,0.92)', duration: 0.5, ease: 'power2.out' });
      const cap = g.querySelector<HTMLElement>('[data-modal-caption]');
      if (cap && !reducedMotion) {
        const split = new SplitText(cap, { type: 'lines', mask: 'lines' });
        gsap.from(split.lines, { yPercent: 110, duration: 0.8, ease: 'expo.out', stagger: 0.07, delay: 0.35, onComplete: () => split.revert() });
      }
    } else {
      const t = g.querySelector<HTMLElement>(`[data-flip-id="${pf.id}"]:not([data-modal-media])`);
      if (!t) return;
      Flip.from(pf.state, {
        targets: t,
        scale: true,
        duration: dur,
        ease: 'power3.inOut',
        zIndex: 50,
        onComplete: () => void gsap.set(t, { clearProps: 'transform,zIndex' }),
      });
    }
  }, [open, reducedMotion]);

  const openItem = open ? items.find((i) => i.key === open) : undefined;
  const openTile = open ? (TILES.find((t) => t.id === open) ?? openItem?.tile) : null;
  const openLabel = openItem?.label ?? (openTile ? caption(openTile, TILES.indexOf(openTile) + 1) : undefined);

  return (
    <div ref={root} className="relative h-full w-full touch-pan-y overflow-hidden bg-[var(--v-bg)] text-[var(--v-ink)]" style={{ containerType: 'size' }}>
      {/* bento */}
      <div ref={bento} className="absolute inset-0 origin-center">
        <div
          ref={gallery}
          className="absolute grid"
          style={{
            width: '100%',
            height: '100%',
            gridTemplateColumns: layout.cols.map((c) => `${c}%`).join(' '),
            gridTemplateRows: layout.rows.map((r) => `${r}%`).join(' '),
            gridTemplateAreas: layout.areas,
          }}
        >
          {TILES.map((t) =>
            layout.hidden.includes(t.id) ? null : (
              <div key={t.id} data-cell data-area={t.id} className="relative p-[3px]" style={{ gridArea: t.id }}>
                <button
                  type="button"
                  data-flip-id={t.id}
                  onClick={() => toggle(t.id)}
                  aria-label={`Open ${t.title}`}
                  className={`relative block h-full w-full cursor-zoom-in overflow-hidden text-left ${open === t.id ? 'invisible' : ''}`}
                  style={{ containerType: 'size' }}
                >
                  <TileFace t={t} />
                </button>
              </div>
            ),
          )}
        </div>
      </div>

      {/* endless scatter */}
      <div ref={scatter} className="invisible absolute inset-0 opacity-0">
        {items.map((it) => (
          <div
            key={it.key}
            data-speed={it.speed.toFixed(3)}
            data-base={it.base.toFixed(3)}
            data-rot={it.rot.toFixed(2)}
            className="absolute top-0"
            style={{ left: `${it.x * 100}%`, width: `${it.w * 100}cqw`, zIndex: Math.round(it.speed * 10), opacity: 0.5 + it.depth * 0.5 }}
          >
            <button
              type="button"
              data-flip-id={it.key}
              onClick={() => toggle(it.key)}
              aria-label={`Open ${it.tile.title}`}
              className={`relative block w-full cursor-zoom-in overflow-hidden ${open === it.key ? 'invisible' : ''}`}
              style={{ aspectRatio: String(it.ar), containerType: 'size' }}
            >
              <TileFace t={it.tile.id === 'h' ? { ...it.tile, id: 'h2' } : it.tile} label={it.label} />
            </button>
          </div>
        ))}
      </div>

      {/* detail modal */}
      {openTile && (
        <div
          className="absolute inset-0 z-40 flex cursor-zoom-out flex-col items-stretch gap-4 bg-[#080808]/92 p-4 pt-16 @min-[700px]:flex-row @min-[700px]:items-center @min-[700px]:p-10"
          onClick={() => toggle(open!)}
          role="dialog"
          aria-label={openTile.title}
        >
          <div
            data-modal-media
            data-flip-id={open!}
            className="relative min-h-0 flex-1 overflow-hidden @min-[700px]:h-[78%] @min-[700px]:flex-[1.4]"
            style={{ containerType: 'size' }}
          >
            <TileFace t={openTile.id === 'h' ? { ...openTile, id: 'h2' } : openTile} label={openLabel} big />
          </div>
          <div className="shrink-0 @min-[700px]:max-w-[38ch] @min-[700px]:flex-1">
            <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[detail] click to close</p>
            <h3 className="mt-2 font-display text-[clamp(28px,6cqw,64px)] leading-[1] italic">{openTile.title}</h3>
            <p data-modal-caption className="mt-3 max-w-[46ch] text-[clamp(14px,1.6cqw,18px)] leading-[1.55] text-[var(--v-soft)]">
              {openTile.note}
            </p>
          </div>
        </div>
      )}
      <G4Label title="Flip Bento" tools={TOOLS} />
    </div>
  );
}
