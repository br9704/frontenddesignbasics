'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';
import { PAD } from './acts';
import { LiveSlot } from './live-slot';
import { FlyTitle, useMotion, ScrollTrigger } from './motion';
import { createProgress } from './runtime';
import { PixelDrain } from './transitions';

/*
 * Act 07, SITES. The real library: velocity-gallery and halftone-develop, then a pinned dolly along
 * the wall of real screenshots in their 19 sections (about 120 on home). The act ends in a reverse
 * pixel blast that drains into one c-2 pixel.
 */

export interface WallSection {
  id: string;
  count: number;
  tiles: { id: string; name: string; image: string }[];
}

const WALL = createProgress(0);

export function ActSites({ sections, total }: { sections: WallSection[]; total: number }) {
  const wall = useRef<HTMLDivElement>(null);

  useMotion(wall, (el) => {
    const track = el.querySelector<HTMLElement>('[data-wall-track]');
    const stage = el.querySelector<HTMLElement>('[data-wall-stage]');
    if (!track || !stage) return;
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top 48px',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: (s) => {
        WALL.set(s.progress);
        const t = Math.min(1, s.progress / 0.8);
        const dist = track.scrollWidth - stage.clientWidth;
        track.style.transform = `translate3d(${-t * dist}px,0,0)`;
      },
    });
    return () => st.kill();
  });

  const phone = sections.flatMap((s) => s.tiles.slice(0, 1)).slice(0, 12);

  return (
    <section id="sites" data-act="7" className="bg-[#080808]">
      <div className={`py-14 ${PAD}`}>
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[07 SITES] /sites</p>
        <FlyTitle className="mt-3 font-display text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.95] tracking-[-0.03em]">
          {total} real sites.
        </FlyTitle>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="h-[60svh] min-h-[320px] border-2 border-c-4">
            <LiveSlot id="velocity-gallery" className="h-full" tone="colour" />
          </div>
          <div className="h-[60svh] min-h-[320px] border-2 border-c-6">
            <LiveSlot id="halftone-develop" className="h-full" tone="colour" />
          </div>
        </div>
      </div>

      {/* phones: the wall's poster, as real screenshots */}
      <div className={`grid grid-cols-2 gap-2 pb-12 md:hidden ${PAD}`}>
        {phone.map((t) => (
          <div key={t.id} className="relative aspect-[16/10] overflow-hidden border border-[var(--v-steel)]">
            <Image src={t.image} alt={t.name} fill sizes="50vw" className="object-cover object-top" />
          </div>
        ))}
        <Link href="/sites" className="pixel col-span-2 mt-2 bg-c-2 px-2 py-1 text-[16px] leading-[16px] text-[#080808]">
          [/sites with search]
        </Link>
      </div>

      {/* desktop: the pinned wall */}
      <div ref={wall} className="relative hidden h-[420vh] md:block motion-reduce:!h-auto">
        <div data-wall-stage className="sticky top-12 h-[calc(100svh-3rem)] overflow-hidden [perspective:1400px] motion-reduce:static motion-reduce:h-auto">
          <div className={`pointer-events-none absolute top-4 z-10 flex w-full justify-between ${PAD}`}>
            <p className="pixel bg-[#080808] px-1 text-[16px] leading-[16px]">[07 SITES] the wall · {sections.length} sections</p>
            <Link href="/sites" className="pixel pointer-events-auto bg-c-2 px-1 text-[16px] leading-[16px] text-[#080808]">
              [/sites with search]
            </Link>
          </div>
          <div className="h-full [transform-style:preserve-3d] [transform:rotateY(-14deg)] [transform-origin:0%_50%] motion-reduce:[transform:none]">
            <div data-wall-track className="flex h-full w-max gap-10 pt-14 pr-[40vw] pb-6 pl-[136px] will-change-transform motion-reduce:w-auto motion-reduce:flex-wrap motion-reduce:pr-10">
              {sections.map((s, si) => (
                <div key={s.id} className="flex h-full flex-col">
                  <Link href={`/sites#${s.id}`} className="pixel text-[16px] leading-[16px] text-[var(--v-soft)] hover:text-[var(--v-ink)]">
                    [{String(si + 1).padStart(2, '0')}] {s.id} ({s.count})
                  </Link>
                  <div className="mt-3 grid min-h-0 flex-1 grid-flow-col grid-rows-3 gap-3">
                    {s.tiles.map((t) => (
                      <div key={t.id} className="relative aspect-[16/10] h-full overflow-hidden border border-[var(--v-steel)] bg-[var(--v-surface)]">
                        <Image src={t.image} alt={t.name} fill sizes="280px" loading="eager" className="object-cover object-top" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <PixelDrain store={WALL} a={0.8} b={1} />
        </div>
      </div>
    </section>
  );
}
