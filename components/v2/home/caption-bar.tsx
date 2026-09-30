'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { BuiltWith } from '@/components/v2/experience-frame';
import { ACTS } from './acts';
import { activeAct } from './runtime';

/*
 * The subtitle bar. One plain sentence per act: what you're looking at, what made it, where to open
 * it. Fixed bottom-left like film subtitles; hidden while the hero is on screen. Screen readers get
 * the sentence through a polite live region when the act changes.
 */

type Caption = { look: string; tools: string[]; href: string; open: string };

function captions(total: number, sites: number): Record<string, Caption> {
  return {
    boot: { look: 'A Windows 95 desktop rebuilt in CSS and GSAP. Where my style starts.', tools: ['css', 'gsap'], href: '/lab/win95-desktop', open: 'open it' },
    blast: { look: 'The old desktop dissolves into dithered pixels, drawn on a 2D canvas.', tools: ['canvas2d', 'gsap'], href: '/lab/pixel-blast', open: 'open it' },
    cube: { look: '296 blocks close into one smooth cube while a pixelation pass steps from 48px to 1px.', tools: ['threejs', 'r3f', 'postprocessing', 'gsap'], href: '/lab/pixel-to-hd-cube', open: 'open it' },
    tools: { look: `All ${total} tools as keys, grouped by what they're for. Hover one to read it.`, tools: ['r3f', 'drei', 'gsap'], href: '/tools', open: 'all tools' },
    make: { look: 'Things you can build with them. Each one is a single React component you can open and copy.', tools: ['gsap', 'threejs', 'r3f'], href: '/make', open: 'all 30' },
    motion: { look: 'Motion design, taught live: twelve eases racing, six kinds of blur, eight transitions and type that moves.', tools: ['gsap', 'r3f', 'glsl', 'ogl'], href: '/lab/ease-racetrack', open: 'open the racetrack' },
    inspiration: { look: 'Rules pulled from real sites: colour, type and hierarchy, each shown live.', tools: ['r3f', 'glsl', 'gsap'], href: '/inspiration', open: 'inspiration' },
    sites: { look: `${sites} real sites worth studying, sorted into sections.`, tools: ['threejs', 'next-image', 'gsap'], href: '/sites', open: 'all sites' },
    learn: { look: 'The written half: how-tos, rules and case studies.', tools: ['css'], href: '/docs', open: 'read' },
    colour: { look: 'Colour arrives last, on purpose. Fluid, city lights, a colour riot.', tools: ['r3f', 'glsl', 'postprocessing'], href: '/make', open: 'make one' },
  };
}

export function CaptionBar({ total, sites }: { total: number; sites: number }) {
  const act = useSyncExternalStore(activeAct.subscribe, () => Math.round(activeAct.get()), () => 0);
  // hidden while the hero or the footer is on screen
  const [heroOn, setHeroOn] = useState(true);
  const [endOn, setEndOn] = useState(false);
  useEffect(() => {
    const hero = document.getElementById('top');
    const end = document.getElementById('end');
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.target === hero) setHeroOn(e.intersectionRatio > 0.25);
          if (e.target === end) setEndOn(e.isIntersecting);
        }),
      { threshold: [0, 0.25, 0.5] },
    );
    if (hero) io.observe(hero);
    else setHeroOn(false);
    if (end) io.observe(end);
    return () => io.disconnect();
  }, []);
  const hidden = heroOn || endOn;
  const a = ACTS[act];
  const c = captions(total, sites)[a?.id ?? 'boot'];
  if (!c) return null;
  return (
    <div
      className={`pointer-events-none fixed inset-x-3 bottom-12 z-30 flex justify-start transition-opacity duration-300 motion-reduce:transition-none lg:bottom-4 lg:left-[136px] lg:right-auto ${hidden ? 'opacity-0' : 'opacity-100'}`}
      aria-hidden={hidden}
    >
      <div className="pointer-events-auto max-w-[min(620px,100%)] border border-[var(--v-steel)] bg-[#080808]/92 px-3 py-2">
        <p aria-live="polite" className="text-[14px] leading-[1.4] text-[var(--v-ink)]">
          <span className="pixel mr-2 text-[14px] leading-[16px] text-[var(--v-dim)]">
            [{a.n} {a.title}]
          </span>
          {c.look}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <BuiltWith tools={c.tools} className="!text-[14px]" />
          <Link href={c.href} tabIndex={hidden ? -1 : 0} className="pixel text-[14px] leading-[16px] text-[var(--v-ink)] underline-offset-4 hover:underline">
            [{c.open} ↗]
          </Link>
        </div>
      </div>
    </div>
  );
}
