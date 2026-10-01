'use client';

import { useEffect, useRef, useState } from 'react';
import { ACTS, P } from './acts';
import { C, ON } from './act-motion';
import { FinaleEnd } from './finale-end';
import { FinaleMontage } from './finale-montage';
import { LiveSlot } from './live-slot';
import { span, useReducedMotion } from './runtime';
import { slice } from './transitions';

/*
 * The last act, COLOUR (the finale), driven by P.colour:
 *   0.00-0.06  the c-2 pixel floods the screen
 *   0.06-0.60  three beats: liquid gradient, neon city, colour riot. Each cuts in hard, in its own
 *              hue, with a stepped clip-path. At most the current and the incoming beat are live.
 *   0.60-0.80  the montage: every act flashes past as a poster, stepped like a film reel. No live
 *              piece is mounted here, so the GL budget is free again.
 *   0.80-0.94  the yellow end screen wipes up, 'Now make something.' lands, the five buttons click in.
 *   0.94-1.00  hold, then the home-end bar scrolls in on the same yellow.
 * Reduced motion: the beats stacked, then the end screen, still. Nothing pins.
 */

const ACT_INDEX = Math.max(0, ACTS.findIndex((a) => a.id === 'colour'));
const N = ACTS[ACT_INDEX]?.n ?? '12';

const FLOOD_END = 0.06;
const BEATS_END = 0.6;
const MONTAGE_END = 0.8;

const BEATS = [
  { id: 'liquid-gradient', hue: 1, label: 'flood' },
  { id: 'neon-block-city', hue: 2, label: 'street level' },
  { id: 'colour-riot', hue: 5, label: 'riot' },
];
const cutAt = (i: number) => FLOOD_END + (i * (BEATS_END - FLOOD_END)) / BEATS.length;
const bp = BEATS.map((_, i) => slice(P.colour, cutAt(i), cutAt(i + 1)));
const montageP = slice(P.colour, BEATS_END, MONTAGE_END);
/** Hard steps, never a smooth value. */
const step = (t: number, n = 5) => Math.floor(t * n) / n;

export function ActColour() {
  const reduced = useReducedMotion();
  const [state, setState] = useState({ mounted: [true, false, false], reel: false });
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const flood = useRef<HTMLDivElement>(null);
  const reel = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) return;
    const update = () => {
      const p = P.colour.get();
      const f = span(p, 0, FLOOD_END);
      if (flood.current) {
        flood.current.style.transform = `translate(-50%,-50%) scale(${f >= 1 ? 400 : 1 + Math.pow(f, 3) * 400})`;
        flood.current.style.opacity = f >= 1 ? '0' : '1';
      }
      const mounted: boolean[] = [];
      BEATS.forEach((_, i) => {
        const el = layers.current[i];
        const cut = i === 0 ? 1 : step(span(p, cutAt(i) - 0.05, cutAt(i)));
        const covered = p >= cutAt(i + 1);
        if (el) el.style.clipPath = `inset(${(1 - cut) * 100}% 0 0 0)`;
        mounted.push(cut > 0 && !covered);
      });

      // montage: a hard cut in at the end of the last beat; the end screen wipes over it
      if (reel.current) reel.current.style.display = p >= BEATS_END && p < MONTAGE_END + 0.05 ? 'block' : 'none';

      // end screen: stepped wipe up, then the title, then the buttons one by one
      const e = end.current;
      if (e) {
        const wipe = step(span(p, MONTAGE_END, MONTAGE_END + 0.04));
        e.style.clipPath = `inset(${(1 - wipe) * 100}% 0 0 0)`;
        e.style.visibility = wipe > 0 ? 'visible' : 'hidden';
        const t = span(p, MONTAGE_END + 0.03, MONTAGE_END + 0.08);
        const title = e.querySelector<HTMLElement>('[data-fin="title"]');
        const eyebrow = e.querySelector<HTMLElement>('[data-fin="eyebrow"]');
        if (title) title.style.clipPath = `inset(0 ${(1 - Math.ceil(t * 6) / 6) * 100}% 0 0)`;
        if (eyebrow) eyebrow.style.visibility = t > 0 ? 'visible' : 'hidden';
        const b = span(p, MONTAGE_END + 0.07, 0.94);
        e.querySelectorAll<HTMLElement>('[data-fin="btn"]').forEach((el, i, all) => {
          el.style.visibility = b * all.length > i ? 'visible' : 'hidden';
        });
      }

      // mount the reel (its posters) well before it plays, and keep it once mounted
      const wantReel = p >= BEATS_END - 0.2;
      setState((s) => {
        const reelNext = s.reel || wantReel;
        return s.reel === reelNext && s.mounted.every((m, i) => m === mounted[i]) ? s : { mounted, reel: reelNext };
      });
    };
    update();
    return P.colour.subscribe(update);
  }, [reduced]);

  if (reduced) {
    return (
      <section id="colour" data-act={ACT_INDEX}>
        {BEATS.map((b, i) => (
          <div key={b.id} className="flex h-[80svh] flex-col p-4" style={{ background: C[b.hue] }}>
            <p className="pixel mb-2 text-[16px] leading-[16px]" style={{ color: ON[b.hue] }}>
              [{N}.{i}] {b.id}
            </p>
            <LiveSlot id={b.id} tone="colour" className="min-h-0 flex-1" />
          </div>
        ))}
        <FinaleEnd prefix={`[${N} COLOUR]`} still />
      </section>
    );
  }

  return (
    <section id="colour" data-act={ACT_INDEX} className="relative h-[520vh] bg-[#080808]">
      <div className="sticky top-12 h-[calc(100svh-3rem)] overflow-hidden">
        {BEATS.map((b, i) => (
          <div
            key={b.id}
            ref={(el) => {
              layers.current[i] = el;
            }}
            className="absolute inset-0 flex flex-col p-3 sm:p-4"
            style={{ background: C[b.hue], clipPath: i === 0 ? 'none' : 'inset(100% 0 0 0)' }}
          >
            <p className="pixel mb-2 text-[16px] leading-[16px] lg:pl-[120px]" style={{ color: ON[b.hue] }}>
              [{N} COLOUR] [{N}.{i}] {b.label}
            </p>
            <div className="min-h-0 flex-1 lg:ml-[120px]">
              {state.mounted[i] ? <LiveSlot id={b.id} progress={bp[i]} tone="colour" className="h-full" /> : null}
            </div>
          </div>
        ))}
        <div ref={flood} aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 h-4 w-4 bg-c-2" />
        <div ref={reel} className="absolute inset-0" style={{ display: 'none' }}>
          {state.reel ? <FinaleMontage progress={montageP} prefix={`[${N}]`} /> : null}
        </div>
        <FinaleEnd ref={end} prefix={`[${N} COLOUR]`} />
      </div>
    </section>
  );
}
