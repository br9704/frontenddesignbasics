'use client';

import { useEffect, useState, type RefObject } from 'react';
import { BuiltWith } from '@/components/v2/experience-frame';

/*
 * Shared bits for the g4 experiences (pinned-chapters, velocity-gallery, type-vortex, flip-bento,
 * page-transitions): the corner label, a size hook and font lookups for Canvas2D text.
 */

/** Top-left corner label: title in the pixel font, plus `built with` when the container is wide enough. */
export function G4Label({ title, tools, className = '' }: { title: string; tools: string[]; className?: string }) {
  return (
    <div className={`pointer-events-none absolute top-3 left-3 z-30 max-w-[calc(100%-24px)] ${className}`}>
      <div className="pointer-events-auto inline-block bg-[var(--v-bg)]/85 px-2 py-1">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">{title}</p>
        <BuiltWith tools={tools} className="mt-1 hidden max-w-[46ch] @min-[560px]:block" />
      </div>
    </div>
  );
}

/** Content-box size of an element, kept up to date with a ResizeObserver. */
export function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Resolves a next/font CSS variable (e.g. --font-display) to a family list Canvas2D understands. */
export function cssFont(varName: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

export const PIXEL_FONT = "'Web IBM VGA 8x16', monospace";

/** true once web fonts have loaded, so Canvas2D text draws in our typefaces. */
export function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    const fonts = document.fonts;
    Promise.all([
      fonts.load(`16px ${PIXEL_FONT}`).catch(() => null),
      fonts.load(`italic 64px ${cssFont('--font-display', 'serif')}`).catch(() => null),
      fonts.load(`64px ${cssFont('--font-display', 'serif')}`).catch(() => null),
      fonts.load(`16px ${cssFont('--font-mono', 'monospace')}`).catch(() => null),
    ])
      .then(() => fonts.ready)
      .then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

/** Small seeded PRNG so layouts are stable between renders. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hidden-scrollbar utility classes for inner scrollers. */
export const NO_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
