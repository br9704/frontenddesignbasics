import type { Metadata } from 'next';
import { ReduceMotionProvider, ReduceToggle } from '@/components/v3/principles/context';
import { ChapterChips, ChapterRail } from '@/components/v3/principles/rail';
import { BlurChapter, MotionChapter, ScrollChapter, TransitionsChapter } from '@/components/v3/principles/chapters';
import { Checklist } from '@/components/v3/principles/checklist';
import { VisualChapter } from '@/components/v3/principles/visual';
import { UxChapter } from '@/components/v3/principles/ux';
import { StatesChapter } from '@/components/v3/principles/states';

export const metadata: Metadata = {
  title: 'My principles',
  description:
    'These are my principles. Things I’ve learnt about motion, blur, transitions, scroll, visual design, the laws of UX and states, each with a live demo and a source.',
};

export default function PrinciplesPage() {
  return (
    <ReduceMotionProvider>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <header className="pt-12 pb-8 sm:pt-16">
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
            [PRINCIPLES] <span className="text-[var(--v-ink)]">/principles</span>
          </p>
          <h1 className="mt-6 max-w-[16ch] font-display text-[44px] leading-[0.98] tracking-[-0.03em] text-[var(--v-ink)] [text-wrap:balance] sm:text-[80px]">
            These are my principles. Things I’ve learnt.
          </h1>
          <p className="mt-6 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
            Each card is one rule, written the way I say it to myself. Every one has a live demo you can play with, one line on why,
            and where I learnt it. Most demos have the same controls: a Before and After switch, a slider and Replay.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <ReduceToggle />
            <p className="max-w-[48ch] text-[14px] leading-[1.5] text-[var(--v-dim)]">
              Turns every demo into its still, calm version. If your system already asks for less motion, it is on for you.
            </p>
          </div>
        </header>
        <ChapterChips />
        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden lg:block">
            <ChapterRail />
          </aside>
          <div className="min-w-0">
            <MotionChapter />
            <BlurChapter />
            <TransitionsChapter />
            <ScrollChapter />
            <VisualChapter />
            <UxChapter />
            <StatesChapter />
            <Checklist />
          </div>
        </div>
      </div>
    </ReduceMotionProvider>
  );
}
