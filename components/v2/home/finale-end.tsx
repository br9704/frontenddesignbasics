'use client';

import Link from 'next/link';
import { forwardRef } from 'react';
import { PAD } from './acts';
import { C, ON } from './act-motion';

/*
 * Where the journey ends: 'Now make something.' and the five places to go next, as big buttons in
 * the palette. Yellow (c-6) field, so the home-end bar that follows continues it without a seam.
 * The parent drives the reveal through data attributes and inline styles; `still` renders it final.
 */

export const DESTINATIONS: { href: string; label: string; note: string; hue: number; external?: boolean }[] = [
  { href: '/tools', label: 'Tools', note: 'what for what', hue: 0 },
  { href: '/principles', label: 'Principles', note: "things I've learnt", hue: 1 },
  { href: '/examples', label: 'Examples', note: 'sites and systems', hue: 2 },
  { href: '/work', label: 'Work', note: 'things I make', hue: 3 },
  { href: 'https://github.com/br9704/frontenddesignbasics', label: 'The repo', note: 'on GitHub', hue: 4, external: true },
];

const btn =
  'group flex min-h-[64px] flex-col justify-between border-2 border-[#080808] px-3 py-2 shadow-[4px_4px_0_#080808] outline-offset-4 transition-none hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#080808] focus-visible:outline-2 focus-visible:outline-[#080808] sm:min-h-[96px] sm:px-4 sm:py-3';

export const FinaleEnd = forwardRef<HTMLDivElement, { prefix: string; still?: boolean }>(function FinaleEnd({ prefix, still = false }, ref) {
  return (
    <div
      ref={ref}
      className={`flex flex-col justify-center bg-c-6 text-[#080808] ${PAD} ${still ? 'min-h-[calc(100svh-3rem)] py-16' : 'absolute inset-0 pt-6 pb-40 lg:pb-28'}`}
      style={still ? undefined : { clipPath: 'inset(100% 0 0 0)', visibility: 'hidden' }}
    >
      <p data-fin="eyebrow" className="pixel text-[16px] leading-[16px]">
        {prefix} Colour arrives last, on purpose.
      </p>
      <p data-fin="title" className="mt-3 font-display text-[clamp(2.6rem,8vw,7rem)] leading-[0.92] tracking-[-0.03em]">
        Now make <em>something.</em>
      </p>
      <nav aria-label="Where to go next" className="mt-6 grid max-w-[1100px] grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-3 lg:grid-cols-5">
        {DESTINATIONS.map((d, i) => {
          const inner = (
            <>
              <span className="font-display text-[clamp(1.5rem,3vw,2.2rem)] leading-none tracking-[-0.02em]">
                {d.label}
                {d.external ? ' ↗' : ''}
              </span>
              <span className="pixel mt-2 text-[14px] leading-[16px] opacity-80">{d.note}</span>
            </>
          );
          const style = { background: C[d.hue], color: ON[d.hue] };
          const cls = `${btn} ${i === DESTINATIONS.length - 1 ? 'col-span-2 sm:col-span-1' : ''}`;
          return d.external ? (
            <a key={d.href} data-fin="btn" href={d.href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>
              {inner}
            </a>
          ) : (
            <Link key={d.href} data-fin="btn" href={d.href} className={cls} style={style}>
              {inner}
            </Link>
          );
        })}
      </nav>
    </div>
  );
});
