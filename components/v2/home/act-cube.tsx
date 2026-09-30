'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { AsciiLoading, BuiltWith } from '@/components/v2/experience-frame';
import { P, PAD, pinSection, pinStage } from './acts';
import { gsap, scrubTimeline, useMotion } from './motion';
import { useGlBudget, useOnScreen, useReducedMotion } from './runtime';

const CubeScene = dynamic(() => import('./cube-scene'), { ssr: false, loading: () => <AsciiLoading label="cube" /> });

/*
 * Act 02, THE CUBE. Pinned for 250vh. Pixel → high-def, then the voxels spell MAKE, TOOLS, LOOK,
 * then the camera pushes through the face and 'Here are the tools.' flies in from depth.
 */
export function ActCube() {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pxLabel = useRef<HTMLSpanElement>(null);

  // The cube section overlaps the end of the blast by one viewport. Stay invisible while sliding in
  // underneath, then appear the moment the cube pins: the blast ends on the same 48px cube, so the
  // hand-off reads as one object resolving, never two cubes on screen.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      el.style.opacity = reducedMq.matches || P.cube.get() > 0.001 ? '1' : '0';
    };
    apply();
    return P.cube.subscribe(apply);
  }, []);
  const reduced = useReducedMotion();
  const live = useGlBudget('cube', stage, true, 2);
  const on = useOnScreen(stage);

  useMotion(section, (el) => {
    const q = gsap.utils.selector(el);
    const tl = scrubTimeline(el, 0.3);
    tl.from(q('[data-line]'), { autoAlpha: 0, y: 24, ease: 'steps(4)', duration: 0.05 }, 0.44);
    tl.to(q('[data-line]'), { autoAlpha: 0, duration: 0.03 }, 0.86);
    // (No interstitial card here: the tools act opens with its own headline, so it only appears once.)
    tl.to({}, { duration: 0.001 }, 1);
  });

  return (
    <section ref={section} id="cube" data-act="2" className={`${pinSection} -mt-[calc(100svh-3rem)] h-[350vh] motion-reduce:mt-0`}>
      <div ref={stage} style={{ opacity: 0 }} className={`${pinStage} bg-[var(--v-bg)]`}>
        <div className="absolute inset-0 motion-reduce:relative motion-reduce:h-[70svh]">
          {live ? (
            <CubeScene store={P.cube} reduced={reduced} active={on} onPx={(px) => pxLabel.current && (pxLabel.current.textContent = String(px).padStart(2, '0'))} />
          ) : (
            <AsciiLoading label="cube" />
          )}
        </div>

        <div className={`pointer-events-none absolute inset-x-0 top-6 ${PAD}`}>
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
            [02 CUBE] [PX <span ref={pxLabel}>48</span>]
          </p>
        </div>

        <div data-line className={`absolute inset-x-0 bottom-0 bg-[linear-gradient(transparent,#080808_45%)] pt-16 pb-14 lg:pb-8 motion-reduce:relative motion-reduce:bottom-0 motion-reduce:pb-10 ${PAD}`}>
          <p className="max-w-[26ch] font-display text-[clamp(1.6rem,3.4vw,2.8rem)] leading-[1.05] tracking-[-0.02em] text-[var(--v-ink)]">
            Every section here is built with the <em>tools it teaches.</em>
          </p>
          <BuiltWith tools={['threejs', 'glsl', 'gsap']} className="mt-3" />
        </div>


      </div>
    </section>
  );
}
