'use client';

import { useEffect, useState } from 'react';
import { CHAPTERS } from './data';
import { ReduceToggle } from './context';

/* Which chapter is on screen: the last one whose top has passed a line a third of the way down. */
function useActiveChapter() {
  const [active, setActive] = useState(CHAPTERS[0].id);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.33;
      let current = CHAPTERS[0].id;
      for (const c of CHAPTERS) {
        const el = document.getElementById(c.id);
        if (el && el.getBoundingClientRect().top <= line) current = c.id;
      }
      setActive(current);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return active;
}

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]';

/** Desktop: a sticky list of chapters I to VII plus the motion switch. */
export function ChapterRail() {
  const active = useActiveChapter();
  return (
    <nav aria-label="Chapters" className="sticky top-20 hidden lg:block">
      <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[CHAPTERS]</p>
      <ol className="mt-4 space-y-1">
        {CHAPTERS.map((c) => (
          <li key={c.id}>
            <a
              href={`#${c.id}`}
              aria-current={active === c.id ? 'true' : undefined}
              className={`pixel flex gap-3 py-1 text-[16px] leading-[16px] ${focus} ${
                active === c.id ? 'text-[var(--v-ink)]' : 'text-[var(--v-dim)] hover:text-[var(--v-soft)]'
              }`}
            >
              <span className="w-[4ch] shrink-0">{active === c.id ? '▶' : ' '}{c.numeral}</span>
              <span>{c.title}</span>
            </a>
          </li>
        ))}
        <li>
          <a href="#checklist" className={`pixel flex gap-3 py-1 text-[16px] leading-[16px] text-[var(--v-dim)] hover:text-[var(--v-soft)] ${focus}`}>
            <span className="w-[4ch] shrink-0"> ✓</span>
            <span>My checklist</span>
          </a>
        </li>
      </ol>
      <ReduceToggle className="mt-8" />
    </nav>
  );
}

/** Phones and tablets: a sticky chip bar under the site nav. Scrolls sideways inside itself. */
export function ChapterChips() {
  const active = useActiveChapter();
  return (
    <nav aria-label="Chapters" className="sticky top-12 z-30 -mx-4 border-b border-[var(--v-line)] bg-[var(--v-bg)]/95 backdrop-blur-sm sm:-mx-6 lg:hidden">
      <ol className="flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6">
        {CHAPTERS.map((c) => (
          <li key={c.id} className="shrink-0">
            <a
              href={`#${c.id}`}
              aria-current={active === c.id ? 'true' : undefined}
              className={`pixel block border px-2 py-1 text-[16px] leading-[16px] ${focus} ${
                active === c.id ? 'border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]' : 'border-[var(--v-steel)] text-[var(--v-soft)]'
              }`}
            >
              {c.numeral} {c.short}
            </a>
          </li>
        ))}
        <li className="shrink-0">
          <a href="#checklist" className={`pixel block border border-[var(--v-steel)] px-2 py-1 text-[16px] leading-[16px] text-[var(--v-soft)] ${focus}`}>
            ✓ List
          </a>
        </li>
      </ol>
    </nav>
  );
}
