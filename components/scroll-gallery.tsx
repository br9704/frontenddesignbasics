'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { showcase } from '@/lib/showcase';

/*
 * A pinned horizontal gallery: vertical scroll drives the strip sideways.
 * Reduced motion (or a narrow screen) gets a plain horizontally scrollable row instead: same content, no pinning.
 */
export function ScrollGallery() {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const items = showcase.filter((s) => !s.mine);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference) and (min-width: 768px)', () => {
      const lenis = new Lenis({ lerp: 0.1 });
      lenis.on('scroll', ScrollTrigger.update);
      const tick = (t: number) => lenis.raf(t * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      const el = track.current!;
      const distance = () => el.scrollWidth - window.innerWidth + 48;
      const tween = gsap.to(el, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: section.current,
          start: 'top top',
          end: () => `+=${distance()}`,
          scrub: 0.6,
          pin: true,
          invalidateOnRefresh: true,
        },
      });
      // Each card leans slightly into the direction of travel, then settles.
      gsap.utils.toArray<HTMLElement>('[data-card]').forEach((card) => {
        gsap.fromTo(
          card,
          { rotate: 2, y: 30 },
          { rotate: 0, y: 0, ease: 'none', scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left right', end: 'center center', scrub: true } },
        );
      });
      return () => {
        gsap.ticker.remove(tick);
        lenis.destroy();
      };
    });
    return () => mm.revert();
  }, []);

  return (
    <section ref={section} className="relative overflow-hidden border-y border-[var(--rule)] bg-[#16140f] text-[#ece6da]">
      <div className="flex min-h-[100svh] flex-col justify-center py-16">
        <div className="mx-auto mb-10 flex w-full max-w-[1400px] flex-wrap items-end justify-between gap-4 px-4 sm:px-6">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-60">11 · Showcase</p>
            <h2 className="mt-3 max-w-[16ch] font-display text-4xl leading-tight tracking-[-0.02em] sm:text-6xl">
              Learn from sites that already got it right.
            </h2>
          </div>
          <Link href="/docs/showcase" className="text-sm underline underline-offset-4">
            All {showcase.length} with notes →
          </Link>
        </div>
        <div className="overflow-x-auto md:overflow-visible motion-reduce:overflow-x-auto">
          <div ref={track} className="flex w-max gap-6 px-4 sm:px-6">
            {items.map((s, i) => (
              <Link key={s.id} href="/docs/showcase" data-card className="group block w-[78vw] max-w-[520px] shrink-0 sm:w-[44vw]">
                <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-white/10">
                  <Image
                    src={`/showcase/${s.id}.jpg`}
                    alt={`Screenshot of ${s.name}`}
                    fill
                    sizes="(min-width: 640px) 44vw, 78vw"
                    className="object-cover object-top transition-transform duration-700 ease-[var(--ease-out-quint)] group-hover:scale-[1.03]"
                  />
                </div>
                <div className="mt-4 flex items-baseline gap-3">
                  <span className="font-mono text-xs opacity-50 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  <p className="font-display text-2xl">{s.name}</p>
                </div>
                <p className="mt-1 max-w-[46ch] text-sm opacity-70">{s.why}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* Names drifting past, as a quiet index of the showcase. */
export function NameMarquee() {
  const names = showcase.map((s) => s.name.split(':')[0]);
  return (
    <div className="group flex overflow-hidden border-b border-[var(--rule)] py-5 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
      {[0, 1].map((k) => (
        <ul key={k} aria-hidden={k === 1} className="flex shrink-0 items-center gap-12 pr-12 motion-safe:animate-[fdb-marquee_60s_linear_infinite] group-hover:[animation-play-state:paused]">
          {names.map((n) => (
            <li key={n} className="flex items-center gap-12 font-display text-3xl whitespace-nowrap italic text-[var(--text-soft)]">
              {n}
              <span className="inline-block size-2 rounded-full bg-[var(--accent)] not-italic" />
            </li>
          ))}
        </ul>
      ))}
      <style>{`@keyframes fdb-marquee { to { transform: translateX(-100%); } }`}</style>
    </div>
  );
}
