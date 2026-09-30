'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { AsciiFrame } from '@/components/v2/ascii-frame';
import { P, PAD } from './acts';
import { LiveSlot } from './live-slot';
import { FlyTitle, gsap, useMotion } from './motion';
import { slice } from './transitions';

/*
 * Act 04, MAKE. A pinned bento that reflows (flip-bento, driven by scroll), then a pinned horizontal
 * run of three AsciiFrames. Black and white only: pipes-screensaver holds at chrome.
 */

const bentoP = slice(P.make, 0, 0.4);
const RUN = [
  { id: 'ascii-3d', title: 'ascii-3d.exe', note: 'Text splits from HD: the same shape, rendered twice.' },
  { id: 'pipes-screensaver', title: 'pipes.scr', note: 'Grows from flat grey to chrome, and holds there.' },
  { id: 'voxel-type-assembly', title: 'type-blocks', note: 'Voxels that know which letter they belong to.' },
];
const runP = RUN.map((_, i) => slice(P.make, 0.45 + i * 0.17, 0.62 + i * 0.17));

export function ActMake() {
  const section = useRef<HTMLElement>(null);

  useMotion(section, (el) => {
    const track = el.querySelector<HTMLElement>('[data-track]');
    const run = el.querySelector<HTMLElement>('[data-run]');
    if (!track || !run) return;
    const mm = gsap.matchMedia();
    mm.add('(min-width: 768px)', () => {
      gsap.to(track, {
        x: () => -(track.scrollWidth - run.clientWidth),
        ease: 'none',
        scrollTrigger: { trigger: el, start: () => `top+=${el.offsetHeight * 0.45} 48px`, end: 'bottom bottom', scrub: 0.4, invalidateOnRefresh: true },
      });
    });
    return () => mm.revert();
  });

  return (
    <section ref={section} id="make" data-act="4" className="relative md:h-[420vh] motion-reduce:!h-auto">
      <div className="md:sticky md:top-12 md:h-[calc(100svh-3rem)] md:overflow-hidden motion-reduce:!static motion-reduce:!h-auto">
        <div className={`flex h-full flex-col gap-4 py-8 md:py-6 ${PAD}`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[04 MAKE] /make</p>
              <FlyTitle className="mt-3 font-display text-[clamp(2.2rem,5.4vw,4.8rem)] leading-[0.95] tracking-[-0.03em]">
                What you can <em>make</em> with them.
              </FlyTitle>
            </div>
            <Link href="/make" className="pixel bg-[var(--v-ink)] px-1 text-[16px] leading-[16px] text-[var(--v-bg)]">
              [see all 30 -&gt; /make]
            </Link>
          </div>
          <div data-run className="relative min-h-0 flex-1 pt-3 md:overflow-hidden motion-reduce:overflow-visible">
            <div data-track className="flex h-full flex-col gap-6 md:w-max md:flex-row md:gap-8 motion-reduce:!w-auto motion-reduce:!flex-col">
              <AsciiFrame title="flip-bento" right="04.1" className="h-[70svh] md:h-full md:w-[min(1000px,78vw)] motion-reduce:!h-[70svh] motion-reduce:!w-full">
                <LiveSlot id="flip-bento" progress={bentoP} className="h-full" />
              </AsciiFrame>
              {RUN.map((r, i) => (
                <AsciiFrame key={r.id} title={r.title} right={`04.${i + 2}`} className="flex h-[70svh] flex-col md:h-full md:w-[min(760px,62vw)] motion-reduce:!h-[70svh] motion-reduce:!w-full">
                  <LiveSlot id={r.id} progress={runP[i]} className="min-h-0 flex-1" />
                  <p className="mt-2 text-[15px] text-[var(--v-soft)]">{r.note}</p>
                </AsciiFrame>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
