'use client';

import Link from 'next/link';
import { SiteFooter } from '@/components/v2/site-footer';
import { PAD } from './acts';
import { scrollToAct } from './runtime';

/* The end of the journey: the short bar that used to sit mid-page (after LEARN), then the real site footer. */
export function HomeEnd() {
  return (
    <div id="end" className="relative z-10 bg-c-6 text-[#080808]">
      <footer className={`flex flex-wrap items-center justify-between gap-4 border-t-2 border-[#080808] py-6 pb-20 lg:pb-6 ${PAD}`}>
        <nav className="pixel flex flex-wrap gap-3 text-[16px] leading-[16px]">
          <Link href="/tools" className="hover:bg-[#080808] hover:text-c-2">[tools]</Link>
          <Link href="/make" className="hover:bg-[#080808] hover:text-c-2">[make]</Link>
          <a href="https://github.com/br9704/frontenddesignbasics" className="hover:bg-[#080808] hover:text-c-2">
            [github]
          </a>
        </nav>
        <button
          type="button"
          onClick={() => scrollToAct('top', true)}
          className="bg-w-face px-3 py-1 font-w95 text-[11px] text-black [-webkit-font-smoothing:none] active:[box-shadow:var(--w-bevel-in)!important]"
          style={{ boxShadow: 'var(--w-bevel-out)' }}
        >
          Shut Down...
        </button>
      </footer>
      <div className="bg-[var(--v-bg)] pb-12 lg:pb-0">
        <SiteFooter />
      </div>
    </div>
  );
}
