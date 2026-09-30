import type { Metadata } from 'next';
import { experiences } from '@/lib/experiences';
import { FeaturedBr95, GetInTouch, MadeHereGrid, OfferTiles } from '@/components/v3/work/work-sections';

export const metadata: Metadata = {
  title: 'Things I make',
  description: 'I design and build websites that move: 3D, shaders, scroll stories and interfaces with character.',
};

export default function WorkPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
      <header className="pt-12 pb-10 sm:pt-16">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
          [WORK] <span className="text-[var(--v-ink)]">/work</span>
        </p>
        <h1 className="mt-6 max-w-[16ch] font-display text-[44px] leading-[1.02] sm:text-[88px]">Things I make</h1>
        <p className="mt-6 max-w-[56ch] text-[18px] leading-[1.6] text-[var(--v-soft)]">
          I design and build websites that move: 3D, shaders, scroll stories and interfaces with character.
        </p>
      </header>
      <FeaturedBr95 />
      <MadeHereGrid total={experiences.length} />
      <OfferTiles />
      <GetInTouch />
    </div>
  );
}
