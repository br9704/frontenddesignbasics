'use client';

import { useEffect, useRef, useState } from 'react';
import { P, PAD } from './acts';
import { LiveSlot } from './live-slot';
import { FlyTitle } from './motion';
import { span, useQuantised, useReducedMotion } from './runtime';
import { slice } from './transitions';

/*
 * Act 05, MOTION. Colour arrives. A reel with about 60vh of scrubbed scroll per beat, one beat on
 * screen at a time (so at most one live context), each on its own field colour with its caption bar
 * inverted to #080808. Beat 0 is the palette: greyscale stickers take a quarter turn and flood into
 * c-1..c-6, then settle into the six-column grid that sets the colours for everything after.
 */

export const C = ['#ff2e00', '#ff00a8', '#7b2cff', '#00b3ff', '#00e676', '#ffe600'];
/** Text colour that passes 4.5:1 on each c-*. */
export const ON = ['#080808', '#080808', '#ffffff', '#080808', '#080808', '#080808'];

const BEATS: { id: string; field: number; caption: string }[] = [
  { id: 'palette', field: -1, caption: 'the palette' },
  { id: 'flying-type', field: 2, caption: 'TYPE MOVES' },
  { id: 'crystal-type-rings', field: 3, caption: 'zero to one' },
  { id: 'circuit-board', field: 5, caption: 'the tools route into the chip' },
  { id: 'ease-racetrack', field: 0, caption: 'same move, twelve eases' },
  { id: 'blur-lab', field: 2, caption: 'six kinds of blur' },
  { id: 'wave-extrude-type', field: 4, caption: 'type as a surface' },
  { id: 'transition-deck', field: 1, caption: 'eight ways from A to B' },
];
const END = 0.93;
/** Beat 0 (the palette) gets twice the scroll. */
const W = BEATS.map((_, i) => (i === 0 ? 2 : 1));
const TOTAL = W.reduce((a, b) => a + b, 0);
const EDGE = W.map((_, i) => (W.slice(0, i).reduce((a, b) => a + b, 0) / TOTAL) * END).concat(END);
const beatP = BEATS.map((_, i) => slice(P.motion, EDGE[i], EDGE[i + 1]));
const beatAt = (p: number) => Math.max(0, Math.min(BEATS.length - 1, EDGE.findIndex((e) => e > p) - 1));
const coverP = slice(P.motion, END, 1);

function Palette({ reduced }: { reduced: boolean }) {
  const q = useQuantised(beatP[0], 0.02);
  const t = reduced ? 1 : q;
  const turn = Math.min(3, Math.floor(span(t, 0.15, 0.4) * 4)); // quarter turn in 3 clicks
  const flood = span(t, 0.3, 0.62);
  const settle = span(t, 0.62, 0.9);
  const greys = ['#3a3a3a', '#6b6b6b', '#9a9a9a', '#cfcfcf', '#555', '#888'];
  return (
    <div className="flex h-full flex-col justify-center">
      <div
        className="mx-auto grid aspect-square w-[min(72vw,52svh)] grid-cols-6 transition-none"
        style={{ gap: `${8 * (1 - settle)}px`, transform: `rotate(${-90 + turn * 30}deg) scale(${1 + settle * 0.15})` }}
      >
        {Array.from({ length: 36 }, (_, i) => {
          const col = i % 6;
          const row = Math.floor(i / 6);
          const on = flood * 8 > col + (row % 3) * 0.6;
          return (
            <div
              key={i}
              style={{
                background: on ? C[col] : greys[(i * 5 + row) % 6],
                borderRadius: `${4 * (1 - settle)}px`,
                boxShadow: settle < 1 ? 'inset 0 0 0 2px #080808' : 'none',
              }}
            />
          );
        })}
      </div>
      <div className="pixel mx-auto mt-6 grid w-[min(72vw,52svh)] grid-cols-6 text-center text-[16px] leading-[16px]" style={{ opacity: settle }}>
        {C.map((c, i) => (
          <span key={c} className="text-[var(--v-ink)]">
            c-{i + 1}
          </span>
        ))}
      </div>
    </div>
  );
}

function Beat({ i, reduced }: { i: number; reduced: boolean }) {
  const b = BEATS[i];
  const bg = b.field < 0 ? '#080808' : C[b.field];
  return (
    <div className="flex h-full flex-col" style={{ background: bg }}>
      <div className={`flex min-h-0 flex-1 flex-col py-6 ${PAD}`}>
        <div className="pixel flex items-center justify-between gap-3 bg-[#080808] px-2 py-1 text-[16px] leading-[16px] text-[#f5f5f5]">
          <span>
            [05.{i}] {b.id}
          </span>
          <span className="hidden truncate sm:inline">{b.caption}</span>
        </div>
        <div className="min-h-0 flex-1 border-2 border-t-0 border-[#080808]">
          {b.id === 'palette' ? <Palette reduced={reduced} /> : <LiveSlot id={b.id} progress={beatP[i]} tone="colour" className="h-full" showTools />}
        </div>
      </div>
    </div>
  );
}

export function ActMotion() {
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState(0);
  const cover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const p = P.motion.get();
      setBeat(p >= END ? BEATS.length - 1 : beatAt(p));
      const c = coverP.get();
      if (cover.current) cover.current.style.transform = `translate(-50%, -50%) scale(${c * c * 60})`;
    };
    update();
    return P.motion.subscribe(update);
  }, []);

  if (reduced) {
    return (
      <section id="motion" data-act="5" className="bg-[#080808]">
        <div className={`py-10 ${PAD}`}>
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[05 MOTION] /make#motion</p>
          <h2 className="mt-3 font-display text-[clamp(2.2rem,5.4vw,4.8rem)] leading-[0.95] tracking-[-0.03em]">Motion design.</h2>
        </div>
        {BEATS.map((_, i) => (
          <div key={i} className="h-[80svh]">
            <Beat i={i} reduced />
          </div>
        ))}
      </section>
    );
  }

  return (
    <section id="motion" data-act="5" className="relative h-[580vh] bg-[#080808]">
      <div className="sticky top-12 h-[calc(100svh-3rem)] overflow-hidden">
        <Beat i={beat} reduced={false} />
        {beat === 0 && (
          <div className={`pointer-events-none absolute top-16 ${PAD}`}>
            <FlyTitle className="font-display text-[clamp(2.2rem,5.4vw,4.8rem)] leading-[0.95] tracking-[-0.03em] text-[var(--v-ink)]">
              Motion design.
            </FlyTitle>
          </div>
        )}
        <div className="pixel pointer-events-none absolute right-4 bottom-4 bg-[#080808] px-2 py-1 text-[16px] leading-[16px] text-[#f5f5f5]">
          [{'█'.repeat(beat + 1)}
          {'░'.repeat(BEATS.length - beat - 1)}]
        </div>
        <div
          ref={cover}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 h-12 w-12 rounded-full bg-c-3"
          style={{ transform: 'translate(-50%, -50%) scale(0)' }}
        />
      </div>
    </section>
  );
}
