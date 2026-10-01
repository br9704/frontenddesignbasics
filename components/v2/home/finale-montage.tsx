'use client';

import { useEffect, useRef } from 'react';
import { C, ON } from './act-motion';
import type { ProgressStore } from './runtime';

/*
 * The finale montage. Every act flashes past as its poster, one frame per scroll step, no easing
 * between frames: a film reel run through the gate. Each frame is a grey poster multiplied into one
 * of the six palette colours, with sprocket holes down both sides and a frame counter.
 * The DOM is written directly from the progress store, so scrolling never re-renders React.
 */

export const REEL: { act: string; id: string }[] = [
  { act: 'BOOT', id: 'win95-boot' },
  { act: 'BLAST', id: 'pixel-blast' },
  { act: 'CUBE', id: 'pixel-to-hd-cube' },
  { act: 'CUBE', id: 'ascii-3d' },
  { act: 'TOOLS', id: 'tool-blocks' },
  { act: 'SHADERS', id: 'halftone-develop' },
  { act: 'SHADERS', id: 'dither-wave' },
  { act: 'MAKE', id: 'kinetic-poster' },
  { act: 'MAKE', id: 'voxel-type-assembly' },
  { act: 'MAKE', id: 'flip-bento' },
  { act: 'MOTION', id: 'flying-type' },
  { act: 'MOTION', id: 'circuit-board' },
  { act: 'EASE', id: 'ease-racetrack' },
  { act: 'BLUR', id: 'blur-lab' },
  { act: 'TRANSITIONS', id: 'transition-deck' },
  { act: 'SITES', id: 'site-wall-3d' },
  { act: 'WORK', id: 'win95-desktop' },
  { act: 'COLOUR', id: 'liquid-gradient' },
  { act: 'COLOUR', id: 'neon-block-city' },
  { act: 'COLOUR', id: 'colour-riot' },
];

const SPROCKETS =
  'repeating-linear-gradient(to bottom, transparent 0 10px, #f5f5f5 10px 26px, transparent 26px 36px)';

/** Frame index for a 0..1 progress: stepped, never interpolated. */
export const frameAt = (t: number) => Math.min(REEL.length - 1, Math.floor(t * REEL.length));

export function FinaleMontage({ progress, prefix }: { progress: ProgressStore; prefix: string }) {
  const frames = useRef<(HTMLDivElement | null)[]>([]);
  const gate = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const act = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let last = -1;
    const update = () => {
      const f = frameAt(progress.get());
      if (f === last) return;
      last = f;
      frames.current.forEach((el, i) => {
        if (el) el.style.visibility = i === f ? 'visible' : 'hidden';
      });
      // gate weave: the frame sits a few pixels off each time, like film slipping in the gate
      if (gate.current) gate.current.style.transform = `translate(${((f * 7) % 5) - 2}px, ${((f * 13) % 7) - 3}px)`;
      if (counter.current) counter.current.textContent = `${String(f + 1).padStart(2, '0')}/${REEL.length}`;
      if (act.current) act.current.textContent = REEL[f].act;
    };
    update();
    return progress.subscribe(update);
  }, [progress]);

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-[#080808]">
      {/* sprocket holes, both edges */}
      <div className="absolute inset-y-0 left-0 w-5 sm:w-7" style={{ backgroundImage: SPROCKETS, backgroundSize: '10px 36px', backgroundRepeat: 'repeat-y', backgroundPosition: 'center' }} />
      <div className="absolute inset-y-0 right-0 w-5 sm:w-7" style={{ backgroundImage: SPROCKETS, backgroundSize: '10px 36px', backgroundRepeat: 'repeat-y', backgroundPosition: 'center' }} />
      <div ref={gate} className="absolute inset-y-3 left-6 right-6 sm:inset-y-4 sm:left-9 sm:right-9 lg:left-[136px]">
        {REEL.map((f, i) => {
          const hue = i % C.length;
          return (
            <div
              key={f.id}
              ref={(el) => {
                frames.current[i] = el;
              }}
              className="absolute inset-0 overflow-hidden"
              style={{ background: C[hue], visibility: i === 0 ? 'visible' : 'hidden' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/posters/${f.id}.webp`}
                alt=""
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ filter: 'grayscale(1) contrast(1.35)', mixBlendMode: 'multiply' }}
              />
              <p className="pixel absolute top-2 left-2 px-2 py-1 text-[16px] leading-[16px]" style={{ background: C[hue], color: ON[hue] }}>
                {f.id}
              </p>
            </div>
          );
        })}
      </div>
      <div className="pixel absolute top-5 right-9 flex gap-2 bg-[#080808] px-2 py-1 text-[16px] leading-[16px] text-[#f5f5f5] sm:right-12">
        <span>{prefix} REEL</span>
        <span ref={counter}>01/{REEL.length}</span>
        <span ref={act} className="text-c-6">
          {REEL[0].act}
        </span>
      </div>
    </div>
  );
}
