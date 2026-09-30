'use client';

import Link from 'next/link';
import { Component, lazy, Suspense, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { AsciiLoading, BuiltWith } from '@/components/v2/experience-frame';
import { catalog, howToHref } from '@/components/v2/make-data';
import { useReducedMotion } from '@/components/v2/make-live';
import { getExperience } from '@/lib/experiences';
import type { ExperienceProps } from '@/lib/experiences/types';

const ring = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]';
const btn = `pixel border border-[var(--v-steel)] px-2 py-1 text-[16px] leading-[16px] hover:border-[var(--v-ink)] ${ring}`;

class Boundary extends Component<{ children: ReactNode; id: string }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (this.state.error)
      return (
        <div className="grid h-full place-items-center p-6">
          <pre className="pixel max-w-full text-[16px] leading-[16px] whitespace-pre-wrap text-[var(--v-dim)]">{`[err] ${this.props.id}\n${this.state.error}`}</pre>
        </div>
      );
    return this.props.children;
  }
}

/** A tiny progress store: undefined means "run on your own", a number drives the piece. */
function useProgressStore() {
  const [progress, setProgress] = useState<number | undefined>(undefined);
  return { progress, setProgress, release: () => setProgress(undefined) };
}

/**
 * /lab/<id>: the experience with a thin ASCII header and a control strip (lesson, scrub, reduced
 * motion, pause, prev/next, how-to). `still` renders only the composed reduced-motion frame, for posters.
 */
export function LabView({ id, still = false }: { id: string; still?: boolean }) {
  const e = getExperience(id)!;
  const Comp = useMemo(() => lazy(e.load) as ComponentType<ExperienceProps>, [e]);
  const systemReduced = useReducedMotion();
  const [reducedOverride, setReducedOverride] = useState<boolean | null>(null);
  const reducedMotion = still || (reducedOverride ?? systemReduced);
  const [paused, setPaused] = useState(false);
  const { progress, setProgress, release } = useProgressStore();

  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  const built = catalog.filter((x) => x.load);
  const i = built.findIndex((x) => x.id === id);
  const prev = built.length > 1 ? built[(i - 1 + built.length) % built.length] : null;
  const next = built.length > 1 ? built[(i + 1) % built.length] : null;

  const stage = (
    <Boundary id={id}>
      <Suspense fallback={<AsciiLoading label={id} />}>
        <Comp active={still ? true : visible && !paused} reducedMotion={reducedMotion} progress={still ? undefined : progress} />
      </Suspense>
    </Boundary>
  );

  if (still)
    return (
      <main className="fixed inset-0 bg-[var(--v-bg)] text-[var(--v-ink)]" data-still>
        <div data-experience={id} className="relative h-full w-full overflow-hidden">
          {stage}
        </div>
      </main>
    );

  return (
    <main className="fixed inset-0 flex flex-col bg-[var(--v-bg)] text-[var(--v-ink)]">
      <header className="pixel flex h-8 shrink-0 items-center gap-3 border-b border-[var(--v-line)] px-3 text-[16px] leading-[16px]">
        <Link href="/make" className={`shrink-0 text-[var(--v-soft)] hover:text-[var(--v-ink)] ${ring}`}>
          ┌─ /make
        </Link>
        <span className="min-w-0 truncate">
          <span className="text-[var(--v-dim)]">/lab/</span>
          {id}
        </span>
        <span aria-hidden className="hidden min-w-0 flex-1 overflow-hidden whitespace-nowrap text-[var(--v-steel)] sm:block">
          {'─'.repeat(200)}
        </span>
        <span className="ml-auto hidden shrink-0 text-[var(--v-dim)] sm:inline">
          {e.kind} · {e.stage}
        </span>
        <nav aria-label="Experiences" className="flex shrink-0 gap-2">
          {prev ? (
            <Link href={`/lab/${prev.id}`} className={`hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`} aria-label={`Previous: ${prev.title}`}>
              [←]
            </Link>
          ) : null}
          {next ? (
            <Link href={`/lab/${next.id}`} className={`hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`} aria-label={`Next: ${next.title}`}>
              [→]
            </Link>
          ) : null}
        </nav>
      </header>

      <div data-experience={id} className="relative min-h-0 flex-1 overflow-hidden">
        {stage}
      </div>

      <footer className="shrink-0 border-t border-[var(--v-line)] px-3 py-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-6">
          <div className="min-w-0 lg:flex-1">
            <p className="line-clamp-2 text-[15px] leading-[1.4]">
              <span className="pixel text-[16px] leading-[16px]">{e.title}</span>
              <span className="text-[var(--v-soft)]"> · {e.blurb}</span>
            </p>
            <BuiltWith tools={e.tools} className="mt-1 truncate" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="pixel flex min-w-0 items-center gap-2 text-[16px] leading-[16px] text-[var(--v-dim)]">
              <span>scrub</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={progress ?? 0}
                onChange={(ev) => setProgress(Number(ev.target.value))}
                aria-label="Progress"
                className="h-4 w-[120px] accent-[var(--v-ink)] sm:w-[160px]"
              />
              <span className="w-[4ch] text-[var(--v-ink)]">{progress === undefined ? 'auto' : `${Math.round(progress * 100)}%`}</span>
            </label>
            {progress !== undefined ? (
              <button type="button" onClick={release} className={btn}>
                [auto]
              </button>
            ) : null}
            <button type="button" aria-pressed={paused} onClick={() => setPaused((p) => !p)} className={btn}>
              {paused ? '[▶ play]' : '[❚❚ pause]'}
            </button>
            <button type="button" aria-pressed={reducedMotion} onClick={() => setReducedOverride(!reducedMotion)} className={btn}>
              [reduced: {reducedMotion ? 'on' : 'off'}]
            </button>
            <Link href={howToHref(id)} className={btn}>
              [how-to →]
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
