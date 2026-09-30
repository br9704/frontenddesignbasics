'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { BuiltWith } from '@/components/v2/experience-frame';
import { P, pinSection, pinStage } from './acts';
import { gsap, ScrollTrigger, scrubTimeline, useMotion } from './motion';
import { ready, scrollToAct } from './runtime';

/*
 * Act 00, BOOT. BIOS POST types out, the splash bar fills in chunky steps, the grey desktop appears,
 * Tools.exe opens by itself and the Welcome dialog carries the copy. The last 15% is the CRT
 * power-off: glitch, roll, a white line, then a dot. The dot is where the blast starts.
 */

const BIOS = [
  'FDB BIOS v2.00  (C) 2026 Front End Design Basics',
  'CPU: Pixel 8x16 @ 60 fps',
  'Memory Test: 65536K OK',
  'Detecting tools ...... 37 found',
  'Detecting sites ...... 293 found',
  'Starting FDB/95 ...',
];

const ICONS: { label: string; href: string; kind: 'folder' | 'app' | 'doc' | 'bin' }[] = [
  { label: 'Tools', href: '/tools', kind: 'app' },
  { label: 'Make', href: '/make', kind: 'folder' },
  { label: 'Inspiration', href: '/inspiration', kind: 'folder' },
  { label: 'Sites', href: '/sites', kind: 'folder' },
  { label: 'How-to', href: '/docs/how-to', kind: 'doc' },
  { label: 'Rules', href: '/docs/rules', kind: 'doc' },
  { label: 'Cases', href: '/docs/cases', kind: 'doc' },
  { label: 'Recycle Bin', href: '/lab', kind: 'bin' },
];

function Icon({ kind }: { kind: 'folder' | 'app' | 'doc' | 'bin' }) {
  // 32x32 pixel art on a 2px grid, greys only (B&W brief).
  const s = { shapeRendering: 'crispEdges' as const };
  if (kind === 'folder')
    return (
      <svg width="32" height="32" viewBox="0 0 16 16" style={s} aria-hidden>
        <path d="M1 4h5l1 1h7v9H1z" fill="#000" />
        <path d="M2 5h4l1 1h6v7H2z" fill="#c0c0c0" />
        <path d="M2 7h11v1H2z" fill="#fff" />
        <path d="M2 12h11v1H2z" fill="#808080" />
      </svg>
    );
  if (kind === 'doc')
    return (
      <svg width="32" height="32" viewBox="0 0 16 16" style={s} aria-hidden>
        <path d="M3 1h7l3 3v11H3z" fill="#000" />
        <path d="M4 2h5v3h3v9H4z" fill="#fff" />
        <path d="M5 7h6v1H5zM5 9h6v1H5zM5 11h4v1H5z" fill="#808080" />
      </svg>
    );
  if (kind === 'bin')
    return (
      <svg width="32" height="32" viewBox="0 0 16 16" style={s} aria-hidden>
        <path d="M3 3h10v2H3zM4 5h8v10H4z" fill="#000" />
        <path d="M5 6h6v8H5z" fill="#c0c0c0" />
        <path d="M6 7h1v6H6zM9 7h1v6H9z" fill="#808080" />
      </svg>
    );
  return (
    <svg width="32" height="32" viewBox="0 0 16 16" style={s} aria-hidden>
      <path d="M1 2h14v12H1z" fill="#000" />
      <path d="M2 3h12v2H2z" fill="#fff" />
      <path d="M2 5h12v8H2z" fill="#c0c0c0" />
      <path d="M4 7h3v3H4zM9 7h3v1H9zM9 9h3v1H9z" fill="#000" />
    </svg>
  );
}

function Window({
  title,
  children,
  className = '',
  active = true,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  active?: boolean;
}) {
  return (
    <div className={`bg-w-face p-[3px] text-black ${className}`} style={{ boxShadow: 'var(--w-bevel-out)' }}>
      <div className={`flex h-[18px] items-center justify-between px-1 ${active ? 'bg-black text-white' : 'bg-w-shadow text-w-face'}`}>
        <span className="truncate text-[11px] font-bold">{title}</span>
        <span className="flex gap-[2px]">
          {['_', '□', '×'].map((g) => (
            <span
              key={g}
              aria-hidden
              className="grid h-[14px] w-4 place-items-center bg-w-face text-[10px] leading-none text-black"
              style={{ boxShadow: 'var(--w-bevel-out)' }}
            >
              {g}
            </span>
          ))}
        </span>
      </div>
      {children}
    </div>
  );
}

export function ActBoot({ categories }: { categories: { id: string; label: string; count: number }[] }) {
  const section = useRef<HTMLElement>(null);

  useMotion(section, (el) => {
    const q = gsap.utils.selector(el);
    const tl = scrubTimeline(el, 0.4);
    tl.eventCallback('onUpdate', () => P.boot.set(tl.progress()));

    // INTRO (time-based, plays on load so the first screen is never empty): BIOS types out, the splash
    // bar fills in chunky steps, the desktop appears, Tools.exe opens and the Welcome dialog lands.
    // The boot sits under the hero now: its intro plays once it is on screen AND the warm-up is done.
    const intro = gsap.timeline({ delay: 0.15, paused: true });
    let seen = false;
    const maybePlay = () => seen && ready.get() >= 1 && intro.paused() && intro.progress() === 0 && intro.play();
    const offReady = ready.subscribe(maybePlay);
    const seenST = ScrollTrigger.create({ trigger: el, start: 'top 70%', onEnter: () => ((seen = true), maybePlay()) });
    gsap.set(q('[data-bios]'), { autoAlpha: 1 });
    q('[data-bios-line]').forEach((line: Element, i: number) => {
      const n = (line.textContent ?? '').length;
      if (i === 0) return;
      intro.fromTo(line, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', ease: `steps(${n})`, duration: 0.16 }, 0.05 + i * 0.13);
    });
    intro.set(q('[data-bios]'), { autoAlpha: 0 }, 0.95);
    intro.fromTo(q('[data-splash]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.001 }, 0.95);
    intro.fromTo(q('[data-splash-bar]'), { scaleX: 0 }, { scaleX: 1, ease: 'steps(12)', duration: 0.55 }, 1.0);
    intro.to(q('[data-splash]'), { autoAlpha: 0, duration: 0.001 }, 1.6);
    intro.from(q('[data-icon]'), { autoAlpha: 0, duration: 0.001, stagger: 0.04 }, 1.62);
    intro.from(q('[data-taskbar]'), { yPercent: 100, ease: 'steps(3)', duration: 0.12 }, 1.62);
    intro.from(q('[data-toolsexe]'), { scale: 0.08, autoAlpha: 0, ease: 'steps(6)', duration: 0.3, transformOrigin: '8% 20%' }, 1.9);
    intro.from(q('[data-task-tools]'), { autoAlpha: 0, duration: 0.001 }, 1.95);
    intro.from(q('[data-status]'), { autoAlpha: 0, duration: 0.1 }, 2.1);
    intro.from(q('[data-dialog]'), { autoAlpha: 0, y: 12, ease: 'steps(3)', duration: 0.15 }, 2.3);

    // SCROLL: the desktop holds, then the CRT powers off (this is all the scrub drives).
    tl.to({}, { duration: 0.4 }, 0);
    // CRT power-off over the last third of the scroll.
    const screen = q('[data-screen]');
    tl.to(screen, { x: 14, skewX: 8, filter: 'contrast(1.8) brightness(1.2)', ease: 'steps(4)', duration: 0.02 }, 0.4);
    tl.to(screen, { x: -10, skewX: -5, ease: 'steps(3)', duration: 0.015 }, 0.42);
    tl.fromTo(q('[data-roll]'), { yPercent: 0 }, { yPercent: -100, ease: 'steps(6)', duration: 0.035 }, 0.42);
    tl.to(screen, { x: 0, skewX: 0, duration: 0.001 }, 0.455);
    tl.to(screen, { scaleY: 0.004, filter: 'brightness(6) contrast(1)', ease: 'power4.in', duration: 0.045 }, 0.455);
    tl.to(screen, { scaleX: 0.004, ease: 'power4.in', duration: 0.035 }, 0.5);
    tl.to(q('[data-crt-bg]'), { backgroundColor: '#080808', duration: 0.02 }, 0.45);
    tl.to({}, { duration: 0.015 }, 0.535);
    return () => {
      offReady();
      seenST.kill();
    };
  });

  return (
    <section ref={section} id="boot" data-act="0" className={`${pinSection} h-[200vh]`}>
      <div data-crt-bg className={`${pinStage} bg-w-desk`}>
        <div data-screen className="absolute inset-0 origin-center overflow-hidden bg-w-desk font-w95 text-[11px] [-webkit-font-smoothing:none]">
          {/* roll band for the CRT */}
          <div data-roll aria-hidden className="pointer-events-none absolute inset-x-0 top-full z-30 h-full bg-[linear-gradient(transparent_0,rgba(255,255,255,0.14)_48%,rgba(255,255,255,0.4)_50%,transparent_52%)]" />

          {/* desktop icons */}
          <ul className="absolute top-3 left-3 z-10 grid lg:left-[136px] grid-flow-col grid-rows-[repeat(4,auto)] gap-x-2 gap-y-3 sm:grid-rows-[repeat(8,auto)]">
            {ICONS.map((ic) => (
              <li key={ic.label} data-icon>
                <Link href={ic.href} className="group flex w-[72px] flex-col items-center gap-1 text-center text-white">
                  <Icon kind={ic.kind} />
                  <span className="px-[2px] group-hover:bg-black group-focus-visible:bg-black">{ic.label}</span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Tools.exe */}
          <div data-toolsexe className="absolute top-[12%] right-3 left-[180px] z-10 hidden sm:block lg:right-auto lg:left-[30%] lg:w-[460px]">
            <Window title="Tools.exe" active={false}>
              <div className="flex gap-3 px-1 py-[3px]">
                {['File', 'Edit', 'View', 'Help'].map((m) => (
                  <span key={m}>
                    <u>{m[0]}</u>
                    {m.slice(1)}
                  </span>
                ))}
              </div>
              <div className="bg-white p-[2px]" style={{ boxShadow: 'var(--w-bevel-in)' }}>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['Name', 'Items', 'Type'].map((h) => (
                        <th key={h} className="bg-w-face px-1 text-left font-normal" style={{ boxShadow: 'var(--w-bevel-out)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id}>
                        <td className="px-1">
                          <Link href={`/tools#${c.id}`} className="hover:bg-black hover:text-white">
                            {c.label}
                          </Link>
                        </td>
                        <td className="px-1">{c.count}</td>
                        <td className="px-1 text-w-shadow">File Folder</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-[2px] flex gap-[2px]">
                <span className="flex-1 px-1" style={{ boxShadow: 'var(--w-bevel-in)' }}>
                  {categories.reduce((a, c) => a + c.count, 0)} object(s)
                </span>
                <span className="w-24 px-1" style={{ boxShadow: 'var(--w-bevel-in)' }}>
                  9 folders
                </span>
              </div>
            </Window>
          </div>

          {/* Welcome dialog */}
          <div data-dialog className="absolute top-1/2 left-1/2 z-20 w-[min(340px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2">
            <Window title="Welcome">
              <div className="flex gap-3 p-3">
                <svg width="32" height="32" viewBox="0 0 16 16" aria-hidden style={{ shapeRendering: 'crispEdges' }} className="shrink-0">
                  <path d="M5 1h6v1h2v2h1v6h-1v2h-2v1H9v2H8v-2H5v-1H3v-2H2V4h1V2h2z" fill="#000" />
                  <path d="M5 2h6v1h1v1h1v6h-1v1h-1v1H5v-1H4v-1H3V4h1V3h1z" fill="#fff" />
                  <path d="M7 4h2v2H7zM7 7h2v4H7z" fill="#000" />
                </svg>
                <p className="text-[11px] leading-[16px]">
                  Welcome to Front End Design Basics.
                  <br />
                  Scroll to continue.
                </p>
              </div>
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  onClick={() => scrollToAct('blast')}
                  className="min-w-[75px] bg-w-face px-3 py-1 text-black outline-dotted outline-1 -outline-offset-4 outline-black active:[box-shadow:var(--w-bevel-in)!important]"
                  style={{ boxShadow: 'var(--w-bevel-out)' }}
                >
                  OK
                </button>
              </div>
            </Window>
          </div>

          {/* status line */}
          <div data-status className="pixel absolute right-3 bottom-[88px] z-10 lg:bottom-12 max-w-[calc(100%-24px)] border border-[var(--v-steel)] bg-[var(--v-bg)] px-2 py-1 text-[16px] leading-[16px] text-[var(--v-ink)]">
            <p>[00 BOOT] [MEM 65536K]</p>
            <BuiltWith tools={['gsap', 'css']} className="mt-1" />
          </div>

          {/* taskbar */}
          <div data-taskbar className="absolute inset-x-0 bottom-10 z-20 lg:bottom-0 flex h-[30px] items-center gap-1 bg-w-face px-[2px]" style={{ boxShadow: 'inset 0 1px #dfdfdf, inset 0 2px #fff' }}>
            <span className="flex h-[22px] items-center gap-1 px-1 font-bold" style={{ boxShadow: 'var(--w-bevel-out)' }}>
              <span aria-hidden className="grid h-3 w-3 grid-cols-2 gap-px">
                <i className="bg-black" />
                <i className="bg-w-shadow" />
                <i className="bg-w-shadow" />
                <i className="bg-black" />
              </span>
              Start
            </span>
            <span data-task-tools className="hidden h-[22px] w-36 items-center px-2 sm:flex" style={{ boxShadow: 'var(--w-bevel-in)' }}>
              Tools.exe
            </span>
            <span className="ml-auto flex h-[22px] items-center px-2" style={{ boxShadow: 'var(--w-bevel-in)' }}>
              12:00
            </span>
          </div>

          {/* splash */}
          <div data-splash className="invisible absolute inset-0 z-40 grid place-items-center bg-black text-white">
            <div className="pixel text-center">
              <p className="text-[48px] leading-[48px] sm:text-[96px] sm:leading-[96px]">FDB/95</p>
              <p className="mt-4 text-[16px] leading-[16px] text-[var(--v-dim)]">front end design basics</p>
              <div className="mx-auto mt-8 h-4 w-[256px] border border-white p-[2px]">
                <div data-splash-bar className="h-full origin-left bg-white" />
              </div>
            </div>
          </div>

          {/* BIOS */}
          <div data-bios className="pixel invisible absolute inset-0 z-50 bg-black p-4 text-[16px] leading-[16px] text-[#c0c0c0] sm:p-8">
            <pre className="whitespace-pre-wrap">
              {BIOS.map((l, i) => (
                <span key={i} data-bios-line className="block min-h-[16px]" style={{ clipPath: 'inset(0 0 0 0)' }}>
                  {l}
                </span>
              ))}
              <span className="mt-4 inline-block animate-pulse">_</span>
            </pre>
            <p className="absolute right-4 bottom-4 left-4 text-[var(--v-dim)] sm:right-8 sm:left-8">Scroll to boot ▼</p>
          </div>
        </div>
      </div>
    </section>
  );
}
