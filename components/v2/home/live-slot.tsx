'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { BuiltWith, ExperienceFrame } from '@/components/v2/experience-frame';
import { getExperience } from '@/lib/experiences';
import { type ProgressStore, useGlBudget, useIsNarrow, useQuantised } from './runtime';

/** What the home page knows about each experience before the registry has it. */
export const META: Record<string, { title: string; tools: string[]; gl: boolean }> = {
  'pixel-to-hd-cube': { title: 'Pixel to HD', tools: ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'gsap'], gl: true },
  'voxel-type-assembly': { title: 'Type Blocks', tools: ['threejs', 'r3f', 'drei', 'glsl', 'gsap', 'canvas2d'], gl: true },
  'ascii-3d': { title: 'Shape-Aware ASCII', tools: ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'canvas2d', 'gsap'], gl: true },
  'neon-block-city': { title: 'Neon Block City', tools: ['threejs', 'r3f', 'drei', 'postprocessing', 'ogl', 'glsl', 'gsap', 'canvas2d'], gl: true },
  'crystal-type-rings': { title: 'Zero to One', tools: ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'canvas2d', 'gsap'], gl: true },
  'dither-wave': { title: 'Dither Wave', tools: ['ogl', 'glsl', 'gsap'], gl: true },
  'liquid-gradient': { title: 'Gradient Lab', tools: ['r3f', 'drei', 'ogl', 'glsl', 'gsap'], gl: true },
  'crt-signal-lost': { title: 'Signal Lost', tools: ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'gsap', 'canvas2d'], gl: true },
  'glass-lens': { title: 'Liquid Lens', tools: ['r3f', 'drei', 'postprocessing', 'glsl', 'gsap'], gl: true },
  'flying-type': { title: 'Flying Type', tools: ['r3f', 'drei', 'glsl', 'gsap', 'lenis', 'canvas2d'], gl: true },
  'circuit-board': { title: 'Circuit Board', tools: ['svg', 'css', 'gsap', 'ogl', 'glsl'], gl: true },
  'easing-lab': { title: 'Easing Lab', tools: ['gsap', 'svg', 'canvas2d', 'css'], gl: false },
  'kinetic-poster': { title: 'Kinetic Poster', tools: ['r3f', 'drei', 'glsl', 'gsap', 'lenis', 'canvas2d', 'css'], gl: true },
  'wave-extrude-type': { title: 'Wave Extrude Type', tools: ['r3f', 'drei', 'glsl', 'gsap', 'svg'], gl: true },
  'pinned-chapters': { title: 'Pinned Chapters', tools: ['gsap', 'lenis', 'svg', 'css', 'r3f', 'glsl'], gl: true },
  'velocity-gallery': { title: 'Unwoven Gallery', tools: ['threejs', 'r3f', 'glsl', 'gsap', 'lenis', 'next-image', 'canvas2d'], gl: true },
  'flip-bento': { title: 'Flip Bento', tools: ['gsap', 'css', 'next-image'], gl: false },
  'page-transitions': { title: 'Page Transitions', tools: ['r3f', 'drei', 'ogl', 'glsl', 'gsap', 'css', 'svg'], gl: true },
  'pixel-blast': { title: 'Pixel Blast', tools: ['threejs', 'postprocessing', 'glsl', 'canvas2d', 'gsap'], gl: true },
  'pipes-screensaver': { title: '3D Pipes', tools: ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'gsap'], gl: true },
  'win95-desktop': { title: 'Win95 Desktop', tools: ['css', 'gsap', 'canvas2d'], gl: false },
  'ascii-cursor-field': { title: 'ASCII Field', tools: ['canvas2d', 'svg', 'css', 'gsap'], gl: false },
  'site-wall-3d': { title: 'Reference Hall', tools: ['r3f', 'drei', 'glsl', 'gsap', 'next-image'], gl: true },
  'ease-racetrack': { title: 'Ease Racetrack', tools: ['gsap', 'svg', 'css'], gl: false },
  'blur-lab': { title: 'Blur Lab', tools: ['ogl', 'glsl', 'css', 'gsap'], gl: true },
  'transition-deck': { title: 'Transition Deck', tools: ['gsap', 'css', 'svg'], gl: false },
  'tool-blocks': { title: 'Tool Blocks', tools: ['r3f', 'drei', 'postprocessing', 'glsl', 'gsap', 'canvas2d', 'svg'], gl: true },
  'event-horizon': { title: 'Event Horizon', tools: ['threejs', 'r3f', 'glsl', 'gsap'], gl: true },
  'halftone-develop': { title: 'Halftone Develop', tools: ['ogl', 'glsl', 'gsap', 'next-image'], gl: true },
  'colour-riot': { title: 'Colour Riot', tools: ['threejs', 'r3f', 'postprocessing', 'ogl', 'glsl', 'gsap'], gl: true },
};

const GL_TOOLS = new Set(['threejs', 'r3f', 'ogl', 'glsl', 'postprocessing', 'drei']);

/** ASCII poster: what a slot shows while it may not hold a live context, or before it exists. */
export function Poster({ id, note }: { id: string; tone?: 'mono' | 'colour'; note?: string }) {
  const m = META[id];
  const title = getExperience(id)?.title ?? m?.title ?? id;
  return (
    <div className="pixel relative grid h-full w-full place-items-center overflow-hidden bg-[var(--v-bg)] text-[var(--v-dim)]">
      {/* the real poster (pnpm posters), so a slot that is not live still shows the piece */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/posters/${id}.webp`} alt="" aria-hidden decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      <div className="relative self-end justify-self-start m-2 bg-[var(--v-bg)]/85 px-3 py-2 text-[16px] leading-[16px]">
        <p className="text-[var(--v-ink)]">{title}</p>
        <Link href={`/lab/${id}`} className="mt-2 inline-block underline underline-offset-4 hover:text-[var(--v-ink)]">
          [open /lab/{id}]
        </Link>
        {note ? <p className="mt-2">{note}</p> : null}
      </div>
    </div>
  );
}

/**
 * One experience on the home page. Mounts the real experience while the GL budget allows it,
 * otherwise shows its ASCII poster. Progress comes from the act's store.
 */
export function LiveSlot({
  id,
  progress,
  className = '',
  tone = 'mono',
  mobilePoster = false,
  priority = 0,
  showTools = true,
}: {
  id: string;
  progress?: ProgressStore;
  className?: string;
  tone?: 'mono' | 'colour';
  mobilePoster?: boolean;
  priority?: number;
  showTools?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const exp = getExperience(id);
  const m = META[id];
  const tools = exp?.tools ?? m?.tools ?? [];
  const gl = exp ? exp.tools.some((t) => GL_TOOLS.has(t)) : (m?.gl ?? true);
  const narrow = useIsNarrow();
  const posterOnly = mobilePoster && narrow;
  const live = useGlBudget(`slot:${id}`, ref, gl && !!exp && !posterOnly, priority);
  const p = useQuantised(progress);
  const canRender = !!exp && !posterOnly && (!gl || live);

  return (
    <div className={`flex min-w-0 flex-col ${className}`}>
      <div ref={ref} data-slot={id} data-live={canRender ? '1' : '0'} className="relative min-h-0 flex-1 bg-[var(--v-bg)]">
        {canRender && exp ? (
          <>
            {/* the still sits underneath, so the slot is never blank while the live piece starts */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/posters/${id}.webp`} alt="" aria-hidden decoding="async" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0">
              <ExperienceFrame experience={exp} progress={progress ? p : undefined} />
            </div>
          </>
        ) : (
          <Poster id={id} tone={tone} note={exp ? undefined : '[building]'} />
        )}
      </div>
      {showTools && !canRender && tools.length > 0 && (
        <div className={tone === 'colour' ? 'bg-[#080808] px-2 py-1' : 'pt-2'}>
          <BuiltWith tools={tools} />
        </div>
      )}
    </div>
  );
}
