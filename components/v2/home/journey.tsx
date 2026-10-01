'use client';

import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { useLayoutEffect, useRef } from 'react';
import { ActBlast } from './act-blast';
import { ActBoot } from './act-boot';
import { ActColour } from './act-colour';
import { ActCube } from './act-cube';
import { ActInspiration, type PaletteSource } from './act-inspiration';
import { ActLearn } from './act-learn';
import { ActMake } from './act-make';
import { ActMotion } from './act-motion';
import { ActSites, type WallSection } from './act-sites';
import { ActTools, type ToolCategory } from './act-tools';
import { ACTS, P } from './acts';
import { gsap, MOTION, ScrollTrigger } from './motion';
import { Rail } from './rail';
import { CaptionBar } from './caption-bar';
import { StageCursor } from './cursor';
import { SpeedWipe } from './speed-wipe';
import { HomeEnd } from './home-end';
import { Preloader } from './preloader';
import { activeAct, overall, ready, scroller } from './runtime';

/*
 * The home journey. One scroll, ten acts. Lenis + ScrollTrigger run only when motion is allowed;
 * with reduced motion every act renders in its final state, stacked, and nothing pins.
 * Each act writes its progress into a store (P[id]); nothing re-renders React on scroll except the
 * few components that swap a beat.
 */
export function HomeJourney({
  categories,
  total,
  wall,
  sitesTotal,
  paletteSource,
}: {
  categories: ToolCategory[];
  total: number;
  wall: WallSection[];
  sitesTotal: number;
  paletteSource: PaletteSource;
}) {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;

    // Always: which act is on screen, and the overall bar (the rail needs these either way).
    const always = gsap.context(() => {
      // The active act is the last one whose top has reached the nav (acts overlap: each one starts
      // pinned under the end of the previous, so per-act toggles ran one act ahead).
      const sections = ACTS.map((a) => document.getElementById(a.id));
      const pickAct = () => {
        let cur = 0;
        sections.forEach((sec, i) => {
          if (sec && sec.getBoundingClientRect().top <= 49) cur = i;
        });
        activeAct.set(cur);
      };
      ScrollTrigger.create({ start: 0, end: 'max', onUpdate: pickAct, onRefresh: pickAct });
      ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (s) => overall.set(s.progress) });
    }, el);

    const mm = gsap.matchMedia(el);
    mm.add(MOTION, () => {
      const lenis = new Lenis({ autoRaf: false, lerp: 0.075, wheelMultiplier: 0.8, touchMultiplier: 1 });
      scroller.current = lenis;
      lenis.on('scroll', ScrollTrigger.update);
      const tick = (t: number) => lenis.raf(t * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      // re-measure once the warm-up has mounted what it can
      const offReady = ready.subscribe(() => ready.get() >= 1 && ScrollTrigger.refresh());

      ACTS.forEach((a) => {
        ScrollTrigger.create({
          trigger: `#${a.id}`,
          start: 'top 48px',
          end: 'bottom bottom',
          onUpdate: (s) => P[a.id].set(s.progress),
          onRefresh: (s) => P[a.id].set(s.progress),
        });
      });

      return () => {
        offReady();
        gsap.ticker.remove(tick);
        lenis.destroy();
        scroller.current = null;
      };
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      ACTS.forEach((a) => P[a.id].set(1));
    });

    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);
    window.addEventListener('load', refresh);
    // Live pieces, posters and fonts change the page height after first layout. Re-measure every
    // trigger when that happens, or reveals fire at stale positions and some never fire at all.
    let raf = 0;
    let lastH = el.offsetHeight;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.offsetHeight - lastH) < 2) return;
      lastH = el.offsetHeight;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => ScrollTrigger.refresh());
    });
    ro.observe(el);
    if (window.location.hash) {
      const id = window.location.hash.slice(1);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    }
    return () => {
      window.removeEventListener('load', refresh);
      ro.disconnect();
      cancelAnimationFrame(raf);
      mm.revert();
      always.revert();
    };
  }, []);

  return (
    <div ref={root} className="relative overflow-x-clip">
      <Preloader />
      <Rail />
      <ActBoot categories={categories} />
      <ActBlast />
      <ActCube />
      <ActTools categories={categories} total={total} />
      <ActMake />
      <ActMotion />
      <ActInspiration source={paletteSource} />
      <ActSites sections={wall} total={sitesTotal} />
      <ActLearn />
      <ActColour />
      <HomeEnd />
      <CaptionBar total={total} sites={sitesTotal} />
      <SpeedWipe />
      <StageCursor />
    </div>
  );
}
