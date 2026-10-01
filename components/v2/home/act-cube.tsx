'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import { AsciiLoading, BuiltWith } from '@/components/v2/experience-frame';
import { getExperience } from '@/lib/experiences';
import toolkit from '@/toolkit/toolkit.json';
import { P, PAD, pinSection, pinStage } from './acts';
import { BEATS, beatAt, CARD_COUNT, type CubeCard, FACES, POSTER_IDS, STYLES, styleAt, T } from './cube-beats';
import type { CubeHud } from './cube-scene';
import { CubeStill } from './cube-still';
import { span, useGlBudget, useOnScreen, useReducedMotion } from './runtime';

const CubeScene = dynamic(() => import('./cube-scene'), { ssr: false, loading: () => <AsciiLoading label="cube" /> });

const TOOLS = ['threejs', 'r3f', 'postprocessing', 'glsl', 'canvas2d', 'gsap'];
const PX_STEPS = [48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1];

/*
 * Act 02, THE CUBE, in seven beats over one pinned scroll (P.cube, 0..1):
 *  B1 pixel to HD · B2 the cube unfolds into a net · B3 its six faces are links to the tools ·
 *  B4 one object in six render styles · B5 the blocks morph cube > sphere > knot > B ·
 *  B6 the blocks become 30 cards, one per piece · B7 everything collapses into one white pixel.
 * The faces and cards are real anchors laid over the 3D, so keyboard and screen readers get them too.
 * Reduced motion: no canvas, a flat net of six links and a plain grid of the 30 posters.
 */
export function ActCube() {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pxLabel = useRef<HTMLSpanElement>(null);
  const pxPanel = useRef<HTMLDivElement>(null);
  const beatLabel = useRef<HTMLSpanElement>(null);
  const styleLabel = useRef<HTMLParagraphElement>(null);
  const caption = useRef<HTMLParagraphElement>(null);
  const whitePixel = useRef<HTMLDivElement>(null);
  const hud = useRef<CubeHud>({ hoverFace: -1, hoverCard: -1 });
  const faceLinks = useRef<(HTMLAnchorElement | null)[]>([]);
  const cardLinks = useRef<(HTMLAnchorElement | null)[]>([]);

  const counts = useMemo(() => FACES.map((f) => toolkit.tools.filter((t) => t.category === f.cat).length), []);
  const cards = useMemo<CubeCard[]>(
    () =>
      POSTER_IDS.map((id) => getExperience(id))
        .filter((e): e is NonNullable<typeof e> => !!e)
        .slice(0, CARD_COUNT)
        .map((e) => ({ id: e.id, title: e.title })),
    [],
  );

  const reduced = useReducedMotion();
  const live = useGlBudget('cube', stage, !reduced, 2);
  const on = useOnScreen(stage);

  // Everything scroll-driven in the DOM reads the store directly: no React renders on scroll.
  const renderHud = useMemo(() => {
    let lastKey = '';
    return () => {
      const p = P.cube.get();
      const b = beatAt(p);
      const beat = BEATS[b];
      const hc = hud.current.hoverCard;
      const card = b === 5 && hc >= 0 ? cards[hc] : undefined;
      const st = styleAt(p);
      const key = `${b}|${card?.id ?? ''}|${st.i}`;
      if (key !== lastKey) {
        lastKey = key;
        if (caption.current) caption.current.textContent = card ? `${card.title}. Click to open it in the lab.` : beat.caption;
        if (beatLabel.current) beatLabel.current.textContent = `B${beat.n}/7 ${beat.label}`;
        if (styleLabel.current) styleLabel.current.textContent = `[STYLE ${st.i + 1}/6] ${STYLES[st.i]}`;
      }
      if (styleLabel.current) styleLabel.current.style.opacity = p >= T.knotOn && p < T.blocksBack ? '1' : '0';
      if (pxPanel.current) pxPanel.current.style.opacity = String(1 - span(p, 0.11, 0.125));
      if (whitePixel.current) whitePixel.current.style.opacity = String(span(p, T.pixel, 0.97));
    };
  }, [cards]);

  // The cube section overlaps the end of the blast by one viewport. Stay invisible while sliding in
  // underneath, then appear the moment the cube pins: the blast ends on the same 48px cube, so the
  // hand-off reads as one object resolving, never two cubes on screen.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const apply = () => {
      el.style.opacity = P.cube.get() > 0.001 ? '1' : '0';
      renderHud();
    };
    apply();
    return P.cube.subscribe(apply);
  }, [renderHud]);

  const onPx = (px: number) => {
    if (pxLabel.current) pxLabel.current.textContent = String(px).padStart(2, '0');
    pxPanel.current?.querySelectorAll<HTMLElement>('[data-step]').forEach((s) => {
      s.style.background = Number(s.dataset.step) >= px ? 'var(--v-ink)' : 'var(--v-steel)';
    });
  };

  const hoverCard = (i: number) => {
    hud.current.hoverCard = i;
    renderHud();
  };

  return (
    <section ref={section} id="cube" data-act="2" className={`${pinSection} -mt-[calc(100svh-3rem)] h-[550vh] motion-reduce:mt-0`}>
      <h2 className="sr-only">The cube, in seven beats</h2>

      <div ref={stage} style={{ opacity: 0 }} className={`${pinStage} bg-[var(--v-bg)] motion-reduce:hidden`}>
        <div className="absolute inset-0">
          {live ? (
            <CubeScene store={P.cube} active={on} counts={counts} cards={cards} hud={hud} faceLinks={faceLinks} cardLinks={cardLinks} onPx={onPx} />
          ) : (
            <AsciiLoading label="cube" />
          )}

          {/* real links, laid over the faces and cards by the scene */}
          <nav aria-label="Cube faces: tools by job" className="absolute inset-0 overflow-hidden [pointer-events:none]">
            {FACES.map((f, i) => (
              <Link
                key={f.cat}
                ref={(el) => {
                  faceLinks.current[i] = el;
                }}
                href={`/tools#cat-${f.cat}`}
                style={{ visibility: 'hidden' }}
                className="pointer-events-auto absolute top-0 left-0 block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--v-ink)]"
                onPointerEnter={() => (hud.current.hoverFace = i)}
                onPointerLeave={() => (hud.current.hoverFace = -1)}
                onFocus={() => (hud.current.hoverFace = i)}
                onBlur={() => (hud.current.hoverFace = -1)}
              >
                <span className="sr-only">
                  {f.label.toLowerCase()}: {counts[i]} tools
                </span>
              </Link>
            ))}
          </nav>
          <nav aria-label="Thirty pieces" className="absolute inset-0 overflow-hidden [pointer-events:none]">
            {cards.map((c, i) => (
              <Link
                key={c.id}
                ref={(el) => {
                  cardLinks.current[i] = el;
                }}
                href={`/lab/${c.id}`}
                style={{ visibility: 'hidden' }}
                className="pointer-events-auto absolute top-0 left-0 block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]"
                onPointerEnter={() => hoverCard(i)}
                onPointerLeave={() => hoverCard(-1)}
                onFocus={() => hoverCard(i)}
                onBlur={() => hoverCard(-1)}
              >
                <span className="sr-only">{c.title}</span>
              </Link>
            ))}
          </nav>

          {/* B7: what is left */}
          <div ref={whitePixel} aria-hidden style={{ opacity: 0 }} className="pointer-events-none absolute top-1/2 left-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 bg-[var(--v-ink)]" />
        </div>

        <div className={`pointer-events-none absolute inset-x-0 top-6 flex items-start justify-between gap-4 ${PAD}`}>
          <div>
            <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
              [02 CUBE] [<span ref={beatLabel}>B1/7 PIXEL TO HD</span>]
            </p>
            <p ref={styleLabel} style={{ opacity: 0 }} className="pixel mt-2 text-[16px] leading-[16px] text-[var(--v-ink)]">
              [STYLE 1/6] {STYLES[0]}
            </p>
          </div>
          {/* B1: live pixel-size readout */}
          <div ref={pxPanel} className="pixel shrink-0 text-right text-[16px] leading-[16px] text-[var(--v-dim)]">
            <p>
              PX <span ref={pxLabel} className="text-[var(--v-ink)]">48</span>
            </p>
            <div className="mt-2 flex justify-end gap-[3px]" aria-hidden>
              {PX_STEPS.map((s) => (
                <span key={s} data-step={s} className="block h-3 w-[6px]" style={{ background: s >= 48 ? 'var(--v-ink)' : 'var(--v-steel)' }} />
              ))}
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-40 px-4 sm:bottom-36 sm:px-6 lg:inset-x-auto lg:right-10 lg:bottom-6 lg:max-w-[440px] lg:px-0 lg:text-right">
          <p ref={caption} aria-live="polite" className="text-[15px] leading-[1.4] text-[var(--v-ink)] sm:text-[17px]">
            {BEATS[0].caption}
          </p>
          <BuiltWith tools={TOOLS} className="pointer-events-auto mt-2" />
        </div>
      </div>

      {/* reduced motion: the net flat, six links, then the 30 pieces */}
      <div className={`hidden py-12 motion-reduce:block ${PAD}`}>
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[02 CUBE]</p>
        <p className="mt-3 max-w-[40ch] font-display text-[clamp(1.6rem,3.4vw,2.8rem)] leading-[1.05] tracking-[-0.02em] text-[var(--v-ink)]">
          One cube, six faces, six jobs. Pick one.
        </p>
        <BuiltWith tools={TOOLS} className="mt-3 mb-8" />
        <CubeStill counts={counts} cards={cards} />
      </div>
    </section>
  );
}
