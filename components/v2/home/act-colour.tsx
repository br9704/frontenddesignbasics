'use client';

import { useEffect, useRef, useState } from 'react';
import { P, PAD } from './acts';
import { C, ON } from './act-motion';
import { LiveSlot } from './live-slot';
import { span, useReducedMotion } from './runtime';
import { slice } from './transitions';

/*
 * Act 09, COLOUR (the finale). The finale in three beats of about 80vh each. The c-2 pixel floods into the
 * liquid gradient, the neon city rises, colour-riot lands 'Now make something.' Each new beat cuts
 * in hard, in its own hue, with a stepped clip-path. At most the current and the incoming beat are live.
 */

const BEATS = [
  { id: 'liquid-gradient', hue: 1, label: 'flood' },
  { id: 'neon-block-city', hue: 2, label: 'street level' },
  { id: 'colour-riot', hue: 5, label: 'riot' },
];
const bp = BEATS.map((_, i) => slice(P.colour, 0.08 + (i * 0.92) / 3, 0.08 + ((i + 1) * 0.92) / 3));
const cutAt = (i: number) => 0.08 + (i * 0.92) / 3;

export function ActColour() {
  const reduced = useReducedMotion();
  const [state, setState] = useState({ mounted: [true, false, false] });
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const flood = useRef<HTMLDivElement>(null);
  const finale = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (reduced) return;
    const update = () => {
      const p = P.colour.get();
      const f = span(p, 0, 0.08);
      if (flood.current) {
        flood.current.style.transform = `translate(-50%,-50%) scale(${f >= 1 ? 400 : 1 + Math.pow(f, 3) * 400})`;
        flood.current.style.opacity = f >= 1 ? '0' : '1';
      }
      const mounted: boolean[] = [];
      BEATS.forEach((_, i) => {
        const el = layers.current[i];
        const cut = i === 0 ? 1 : Math.floor(span(p, cutAt(i) - 0.05, cutAt(i)) * 5) / 5;
        const covered = i < BEATS.length - 1 && p >= cutAt(i + 1);
        if (el) el.style.clipPath = `inset(${(1 - cut) * 100}% 0 0 0)`;
        mounted.push(cut > 0 && !covered);
      });
      if (finale.current) {
        const t = span(p, 0.86, 0.95);
        finale.current.style.opacity = String(t > 0 ? 1 : 0);
        finale.current.style.clipPath = `inset(0 ${(1 - Math.ceil(t * 6) / 6) * 100}% 0 0)`;
      }
      setState((s) => (s.mounted.every((m, i) => m === mounted[i]) ? s : { mounted }));
    };
    update();
    return P.colour.subscribe(update);
  }, [reduced]);

  if (reduced) {
    return (
      <section id="colour" data-act="9">
        {BEATS.map((b, i) => (
          <div key={b.id} className="flex h-[80svh] flex-col p-4" style={{ background: C[b.hue] }}>
            <p className="pixel mb-2 text-[16px] leading-[16px]" style={{ color: ON[b.hue] }}>
              [09.{i}] {b.id}
            </p>
            <LiveSlot id={b.id} tone="colour" className="min-h-0 flex-1" />
          </div>
        ))}
        <p className={`bg-c-6 py-16 font-display text-[clamp(3rem,9vw,8rem)] leading-[0.9] tracking-[-0.03em] text-[#080808] ${PAD}`}>
          Now make <em>something.</em>
        </p>
      </section>
    );
  }

  return (
    <section id="colour" data-act="9" className="relative h-[340vh] bg-[#080808]">
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
            <p className={`pixel mb-2 text-[16px] leading-[16px] ${PAD} !px-0 lg:!pl-[120px]`} style={{ color: ON[b.hue] }}>
              [09 COLOUR] [09.{i}] {b.label}
            </p>
            <div className="min-h-0 flex-1 lg:ml-[120px]">
              {state.mounted[i] ? <LiveSlot id={b.id} progress={bp[i]} tone="colour" className="h-full" /> : null}
            </div>
          </div>
        ))}
        <div ref={flood} aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 h-4 w-4 bg-c-2" />
        <p
          ref={finale}
          className="pointer-events-none absolute inset-x-0 bottom-10 bg-c-6 py-4 text-center font-display text-[clamp(2.6rem,8vw,7.5rem)] leading-[0.95] tracking-[-0.03em] text-[#080808] opacity-0"
        >
          Now make <em>something.</em>
        </p>
      </div>
    </section>
  );
}
