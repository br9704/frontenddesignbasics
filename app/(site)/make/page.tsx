import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MakeGrid } from '@/components/v2/make-grid';
import { PostersProvider } from '@/components/v2/make-live';
import { posterIds } from '@/components/v2/make-posters';

export const metadata: Metadata = {
  title: 'What you can make with them',
  description: 'Every experience on the site, live, filterable by kind, stage and the tools it mixes.',
};

export default function MakePage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
      <header className="pt-12 pb-8 sm:pt-16">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
          [MAKE] <span className="text-[var(--v-ink)]">/make</span>
        </p>
        <h1 className="pixel mt-6 max-w-[18ch] text-[32px] leading-[32px] sm:text-[64px] sm:leading-[64px]">What you can make with them</h1>
        <p className="mt-6 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
          Each card is a small piece built by mixing tools from the kit. Hover one to wake it up. Filter by tool to find the
          mixes: pick gsap and threejs and you get only the pieces that use both.
        </p>
      </header>
      <Suspense fallback={<pre className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[██████░░░░░░] loading…</pre>}>
        <PostersProvider ids={posterIds()}>
          <MakeGrid />
        </PostersProvider>
      </Suspense>
    </div>
  );
}
