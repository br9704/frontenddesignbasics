import type { ComponentType, ReactNode } from 'react';
import { EasingPlayground, ReducedMotionDemo } from '@/components/demos';
import { ScrollProgressDemo, SpringVsBezier, StaggerPlayground } from '@/components/demos/motion-lab';
import { ChapterSection, PrincipleCard } from './card';
import { BLUR, CHAPTERS, MOTION, SCROLL, TRANSITIONS, type Principle } from './data';
import { DistanceDuration, EaseByJob, EaseOutMenus, ExplainCart, FlingCard, FrequentPalette, StaggerCap, TransformOnly } from './motion-demos';
import { BlurBudget, BlurInText, FocusBlur, FrostedHeader, MotionBlurCarousel } from './blur-demos';
import { FlipCard, OriginMenu, SwapOrSlide, ToastStack, ViewTransitionPages } from './transition-demos';
import { FlingTest, HeavyScene, LinkedOrTriggered, ReducedFeedback, SmoothNotHijack, StoppableLoop } from './scroll-demos';

/* Chapters I to IV of /principles. Each principle id maps to its live demo. */

const DEMOS: Record<string, { Demo: ComponentType; more?: ReactNode }> = {
  m1: { Demo: EaseOutMenus },
  m2: { Demo: EaseByJob, more: <EasingPlayground /> },
  m3: { Demo: DistanceDuration },
  m4: { Demo: FlingCard, more: <SpringVsBezier /> },
  m5: { Demo: StaggerCap, more: <StaggerPlayground /> },
  m6: { Demo: ExplainCart },
  m7: { Demo: FrequentPalette },
  m8: { Demo: TransformOnly },
  b1: { Demo: MotionBlurCarousel },
  b2: { Demo: BlurInText },
  b3: { Demo: FocusBlur },
  b4: { Demo: FrostedHeader },
  b5: { Demo: BlurBudget },
  t1: { Demo: SwapOrSlide },
  t2: { Demo: FlipCard },
  t3: { Demo: ViewTransitionPages },
  t4: { Demo: ToastStack },
  t5: { Demo: OriginMenu },
  s1: { Demo: LinkedOrTriggered, more: <ScrollProgressDemo /> },
  s2: { Demo: SmoothNotHijack },
  s3: { Demo: FlingTest },
  s4: { Demo: HeavyScene },
  r1: { Demo: ReducedFeedback, more: <ReducedMotionDemo /> },
  r2: { Demo: StoppableLoop },
};

function Cards({ list }: { list: Principle[] }) {
  return list.map((p) => {
    const d = DEMOS[p.id];
    return (
      <PrincipleCard key={p.id} p={p} more={d?.more}>
        {d ? <d.Demo /> : null}
      </PrincipleCard>
    );
  });
}

export function MotionChapter() {
  return (
    <ChapterSection
      chapter={CHAPTERS[0]}
      intro="How things move decides whether an interface feels quick or sluggish, calm or fussy. These are the rules I check first."
      deeper={[{ href: '/lab/ease-racetrack', label: 'Ease Racetrack' }]}
    >
      <Cards list={MOTION} />
    </ChapterSection>
  );
}

export function BlurChapter() {
  return (
    <ChapterSection
      chapter={CHAPTERS[1]}
      intro="Blur is focus, speed and depth. It is also one of the most expensive things a browser can draw, so I use it on purpose."
      deeper={[{ href: '/lab/blur-lab', label: 'Blur Lab' }]}
    >
      <Cards list={BLUR} />
    </ChapterSection>
  );
}

export function TransitionsChapter() {
  return (
    <ChapterSection
      chapter={CHAPTERS[2]}
      intro="A transition is the bridge between two states. A good one tells you how they are related, so you never lose your place."
      deeper={[{ href: '/lab/transition-deck', label: 'Transition Deck' }]}
    >
      <Cards list={TRANSITIONS} />
    </ChapterSection>
  );
}

export function ScrollChapter() {
  return (
    <ChapterSection
      chapter={CHAPTERS[3]}
      intro="Scroll belongs to the person scrolling. I can react to it, but I never take it away, and I never let it hide what they came for."
    >
      <Cards list={SCROLL} />
    </ChapterSection>
  );
}
