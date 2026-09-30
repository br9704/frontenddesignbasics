'use client';

import Link from 'next/link';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { Experience, ExperienceProps } from '@/lib/experiences/types';

/** ASCII placeholder shown while an experience's code loads. */
export function AsciiLoading({ label = 'loading' }: { label?: string }) {
  return (
    <div className="grid h-full w-full place-items-center bg-[var(--v-bg)]">
      <pre className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">{`[██████░░░░░░] ${label}…`}</pre>
    </div>
  );
}

/** `built with: gsap · three` tag. Tool ids link to /tools#id. */
export function BuiltWith({ tools, className = '' }: { tools: string[]; className?: string }) {
  return (
    <p className={`pixel text-[16px] leading-[16px] text-[var(--v-dim)] ${className}`}>
      built with:{' '}
      {tools.map((t, i) => (
        <span key={t}>
          {i > 0 && ' · '}
          <Link href={`/tools#${t}`} className="text-[var(--v-soft)] underline-offset-4 hover:text-[var(--v-ink)] hover:underline">
            {t}
          </Link>
        </span>
      ))}
    </p>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

/**
 * Renders one experience inside its parent. Loads the code only when near the viewport, tells the
 * experience when it is on screen, and passes reduced-motion and optional scroll progress through.
 */
export function ExperienceFrame({
  experience,
  progress,
  className = '',
  eager = false,
}: {
  experience: Experience;
  progress?: number;
  className?: string;
  eager?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(eager);
  const [active, setActive] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const Comp = useMemo(() => lazy(experience.load) as ComponentType<ExperienceProps>, [experience]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const nearObs = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '600px' });
    const activeObs = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { threshold: 0.05 });
    nearObs.observe(el);
    activeObs.observe(el);
    return () => {
      nearObs.disconnect();
      activeObs.disconnect();
    };
  }, []);

  return (
    <div ref={ref} data-experience={experience.id} className={`relative h-full w-full overflow-hidden ${className}`}>
      {near ? (
        <Suspense fallback={<AsciiLoading label={experience.id} />}>
          <Comp active={active} reducedMotion={reducedMotion} progress={progress} />
        </Suspense>
      ) : (
        <AsciiLoading label={experience.id} />
      )}
    </div>
  );
}
