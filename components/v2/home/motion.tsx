'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { type ReactNode, type RefObject, useLayoutEffect, useRef } from 'react';

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger, SplitText);

export { gsap, ScrollTrigger, SplitText };
export const MOTION = '(prefers-reduced-motion: no-preference)';

/**
 * Runs `build` inside gsap.matchMedia(no-preference), scoped to `scope`. Everything it creates is
 * reverted when motion is reduced or the component unmounts, so the DOM falls back to its final state.
 */
export function useMotion(scope: RefObject<HTMLElement | null>, build: (el: HTMLElement) => void | (() => void), deps: unknown[] = []) {
  useLayoutEffect(() => {
    const el = scope.current;
    if (!el) return;
    const mm = gsap.matchMedia(el);
    mm.add(MOTION, () => build(el));
    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** A scrubbed 0..1 timeline over a pinned section (under the 48px nav). */
export function scrubTimeline(section: HTMLElement, scrub: number | boolean = true) {
  return gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: section, start: 'top 48px', end: 'bottom bottom', scrub },
  });
}

/** Act title that flies in character by character (SplitText) when it enters the viewport. */
export function FlyTitle({
  as = 'h2',
  children,
  className = '',
  from = 'depth',
}: {
  as?: 'h1' | 'h2' | 'h3' | 'p';
  children: ReactNode;
  className?: string;
  from?: 'depth' | 'below' | 'side';
}) {
  const ref = useRef<HTMLElement>(null);
  useMotion(ref, (el) => {
    const split = SplitText.create(el, { type: 'chars,words', charsClass: 'fly-char' });
    const vars: gsap.TweenVars =
      from === 'depth'
        ? { opacity: 0, z: -600, rotateX: -80, yPercent: 60, scale: 2.2 }
        : from === 'side'
          ? { opacity: 0, xPercent: 180, rotate: 25 }
          : { opacity: 0, yPercent: 140, rotate: 8 };
    gsap.set(el, { perspective: 700 });
    const tw = gsap.from(split.chars, {
      ...vars,
      ease: 'expo.out',
      duration: 1.1,
      stagger: { each: 0.035, from: 'random' },
      // once: a title that has flown in stays in. Reversing on scroll-back left titles hidden after rail jumps.
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
    return () => {
      tw.scrollTrigger?.kill();
      tw.kill();
      split.revert();
    };
  });
  const Tag = as as 'h2';
  return (
    <Tag ref={ref as React.RefObject<HTMLHeadingElement>} className={className}>
      {children}
    </Tag>
  );
}
