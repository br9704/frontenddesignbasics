'use client';

import Link from 'next/link';
import { PAD } from './acts';
import { LiveSlot, Poster } from './live-slot';
import { FlyTitle } from './motion';
import { scrollToAct } from './runtime';

/*
 * Act 08, LEARN. On colour, so the page never falls back to black. ascii-cursor-field reveals LEARN,
 * then a plain index in #080808 type. The page ends with a bevelled Shut Down button.
 */

// Counts and groups mirror content/docs/{how-to,rules,cases}/meta.json.
const INDEX = [
  {
    title: 'How-tos',
    href: '/docs/how-to',
    count: 20,
    note: 'Short numbered task guides, in seven groups.',
    items: ['Setup', '3D', 'Shaders', 'Motion', 'Scroll and layout', 'Images', 'Verify'],
  },
  {
    title: 'The rules',
    href: '/docs/rules',
    count: 9,
    note: 'TL;DR first, then the detail.',
    items: ['Tokens and colour', 'Scales and type', 'Breakpoints', 'States', 'Motion tokens', 'Accessibility'],
  },
  {
    title: 'Cases',
    href: '/docs/cases',
    count: 10,
    note: 'Great sites, broken down from their own write-ups.',
    items: ['GitHub globe', 'Stripe Connect', 'Linear', 'Igloo Inc.', 'and six more'],
  },
];

export function ActLearn() {
  return (
    <section id="learn" data-act="8" className="bg-c-2 text-[#080808]">
      <div className={`pt-14 ${PAD}`}>
        <p className="pixel text-[16px] leading-[16px]">[08 LEARN] /docs</p>
        <FlyTitle className="mt-3 font-display text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.95] tracking-[-0.03em]">
          Now <em>learn</em> how.
        </FlyTitle>
      </div>
      <div className={`mt-8 ${PAD}`}>
        <div className="h-[48svh] min-h-[280px] border-2 border-[#080808]">
          <LiveSlot id="ascii-cursor-field" tone="colour" className="h-full" showTools={false} />
        </div>
      </div>

      <div className={`grid gap-10 py-14 md:grid-cols-3 ${PAD}`}>
        {INDEX.map((s) => (
          <div key={s.title}>
            <Link href={s.href} className="group block">
              <p className="pixel text-[16px] leading-[16px]">
                ┌─ {s.href} ─ {s.count}
              </p>
              <h3 className="mt-3 font-display text-[40px] leading-none tracking-[-0.02em] group-hover:underline">{s.title}</h3>
            </Link>
            <p className="mt-2 text-[17px] leading-[1.6]">{s.note}</p>
            <ul className="pixel mt-4 space-y-2 text-[16px] leading-[16px]">
              {s.items.map((it) => (
                <li key={it}>
                  <Link href={s.href} className="hover:bg-[#080808] hover:text-c-2">
                    ├ {it}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={`grid gap-6 pb-14 md:grid-cols-[1fr_1.2fr] md:items-center ${PAD}`}>
        <div>
          <p className="pixel text-[16px] leading-[16px]">[08.1] pinned-chapters</p>
          <p className="mt-2 max-w-[40ch] text-[17px] leading-[1.6]">A scroll story is its own page. Here it is as a still; open it to scroll it.</p>
        </div>
        <div className="h-[240px] bg-[#080808]">
          <Poster id="pinned-chapters" />
        </div>
      </div>

    </section>
  );
}
