'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { useReduce } from './context';
import { BeforeAfter, ControlBar, Readout, Replay, Slider, Stage } from './kit';

/* Chapter III, transitions. CSS transitions, GSAP Flip, the View Transition API, @starting-style. */

const OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]';

/* ── T1: crossfade for swaps, slide for direction ─────────────────────────────── */
export function SwapOrSlide() {
  const reduce = useReduce();
  const [after, setAfter] = useState(true);
  const [dur, setDur] = useState(260);
  const [tab, setTab] = useState(0);
  const [step, setStep] = useState(0);
  const tabs = ['Details', 'Photos', 'Reviews'];
  const steps = ['Your name', 'Your address', 'Pay'];
  const t = reduce ? 'none' : `opacity ${dur}ms ease-out, transform ${dur}ms ${OUT}`;

  // tabs: after = crossfade in place, before = slide. Wizard: after = slide by direction, before = crossfade.
  const tabStyle = (i: number) => ({
    opacity: i === tab ? 1 : 0,
    transform: after || reduce ? 'none' : `translateX(${(i - tab) * 40}%)`,
    transition: t,
  });
  const stepStyle = (i: number) => ({
    opacity: i === step ? 1 : 0,
    transform: !after || reduce ? 'none' : `translateX(${Math.sign(i - step) * 40}%)`,
    transition: t,
  });

  return (
    <div>
      <ControlBar>
        <BeforeAfter after={after} onChange={setAfter} before="Mixed up" afterLabel="Matched" />
        <Slider label="Duration" min={120} max={900} step={20} value={dur} unit="ms" onChange={setDur} />
        <Replay onClick={() => { setTab((x) => (x + 1) % 3); setStep((x) => (x + 1) % 3); }} label="Step both" />
      </ControlBar>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 border border-[var(--v-line)] bg-[var(--v-bg)] p-3">
          <div role="tablist" aria-label="Product tabs" className="flex gap-1">
            {tabs.map((name, i) => (
              <button
                key={name}
                role="tab"
                type="button"
                aria-selected={i === tab}
                onClick={() => setTab(i)}
                className={`px-2 py-1 text-[13px] ${focus} ${i === tab ? 'bg-[var(--v-ink)] text-[var(--v-bg)]' : 'text-[var(--v-soft)] hover:text-[var(--v-ink)]'}`}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="relative mt-3 h-24 overflow-hidden" role="tabpanel" aria-label={tabs[tab]}>
            {tabs.map((name, i) => (
              <div key={name} className="absolute inset-0 border border-[var(--v-steel)] p-3" style={tabStyle(i)} aria-hidden={i !== tab}>
                <p className="font-display text-[22px] text-[var(--v-ink)]">{name}</p>
                <div className="mt-2 h-2 w-2/3 bg-[var(--v-steel)]" />
              </div>
            ))}
          </div>
          <p className="pixel mt-2 text-[16px] leading-[16px] text-[var(--v-dim)]">tabs: {after ? 'crossfade' : 'slide'}</p>
        </div>
        <div className="min-w-0 border border-[var(--v-line)] bg-[var(--v-bg)] p-3">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className={`px-2 py-1 text-[13px] text-[var(--v-soft)] disabled:opacity-40 ${focus}`}>
              ← Back
            </button>
            <span className="font-mono text-[12px] text-[var(--v-dim)]">step {step + 1}/3</span>
            <button type="button" onClick={() => setStep((s) => Math.min(2, s + 1))} disabled={step === 2} className={`px-2 py-1 text-[13px] text-[var(--v-soft)] disabled:opacity-40 ${focus}`}>
              Next →
            </button>
          </div>
          <div className="relative mt-3 h-24 overflow-hidden" aria-live="polite">
            {steps.map((name, i) => (
              <div key={name} className="absolute inset-0 border border-[var(--v-steel)] p-3" style={stepStyle(i)} aria-hidden={i !== step}>
                <p className="font-display text-[22px] text-[var(--v-ink)]">{name}</p>
                <div className="mt-2 h-6 w-full border border-[var(--v-steel)]" />
              </div>
            ))}
          </div>
          <p className="pixel mt-2 text-[16px] leading-[16px] text-[var(--v-dim)]">steps: {after ? 'slide by direction' : 'crossfade'}</p>
        </div>
      </div>
    </div>
  );
}

/* ── T2: shared element with GSAP Flip ─────────────────────────────── */
const CARDS = ['Poster', 'Deck', 'Site', 'Type'];

export function FlipCard() {
  const reduce = useReduce();
  const root = useRef<HTMLDivElement>(null);
  const state = useRef<Flip.FlipState | null>(null);
  const [after, setAfter] = useState(true);
  const [dur, setDur] = useState(550);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    gsap.registerPlugin(Flip);
  }, []);

  const choose = (i: number | null) => {
    if (after && !reduce && root.current) state.current = Flip.getState(root.current.querySelectorAll('[data-flip-id]'));
    setOpen(i);
  };

  useLayoutEffect(() => {
    const s = state.current;
    if (!s) return;
    state.current = null;
    const targets = root.current?.querySelectorAll('[data-flip-id]');
    const tl = Flip.from(s, { targets, duration: dur / 1000, ease: 'power3.inOut', absolute: true, nested: true });
    return () => {
      tl.progress(1);
      tl.kill();
    };
  }, [open, dur]);

  return (
    <div>
      <ControlBar>
        <BeforeAfter after={after} onChange={setAfter} before="Cut" afterLabel="Shared element" />
        <Slider label="Duration" min={200} max={1500} step={50} value={dur} unit="ms" onChange={setDur} />
        <Replay onClick={() => choose(open === null ? 1 : null)} label={open === null ? 'Open one' : 'Close'} />
      </ControlBar>
      <div ref={root} className="relative mt-4 h-60 overflow-hidden border border-[var(--v-line)] bg-[var(--v-bg)] p-3" role="group" aria-label="Cards that open into a detail view">
        <div className="grid h-full grid-cols-2 gap-2">
          {CARDS.map((c, i) =>
            open === i ? (
              <div key={c} className="border border-dashed border-[var(--v-line)]" aria-hidden />
            ) : (
              <button
                key={c}
                type="button"
                data-flip-id={`card-${i}`}
                onClick={() => choose(i)}
                className={`flex min-w-0 flex-col border border-[var(--v-steel)] bg-[var(--v-surface)] p-2 text-left hover:border-[var(--v-ink)] ${focus}`}
              >
                <span data-flip-id={`img-${i}`} className="block h-full min-h-0 w-full flex-1 bg-[repeating-linear-gradient(135deg,var(--v-steel)_0_6px,var(--v-surface)_6px_12px)]" />
                <span data-flip-id={`title-${i}`} className="mt-1 block text-[13px] text-[var(--v-ink)]">{c}</span>
              </button>
            ),
          )}
        </div>
        {open !== null ? (
          <div data-flip-id={`card-${open}`} className="absolute inset-3 flex flex-col border border-[var(--v-ink)] bg-[var(--v-surface)] p-3" role="dialog" aria-label={CARDS[open]}>
            <span data-flip-id={`img-${open}`} className="block h-24 w-full shrink-0 bg-[repeating-linear-gradient(135deg,var(--v-steel)_0_6px,var(--v-surface)_6px_12px)]" />
            <span data-flip-id={`title-${open}`} className="mt-2 block font-display text-[28px] leading-tight text-[var(--v-ink)]">{CARDS[open]}</span>
            <p className="mt-1 text-[13px] text-[var(--v-soft)]">The same card, grown. Your eye never left it.</p>
            <button type="button" onClick={() => choose(null)} className={`pixel mt-auto self-start border border-[var(--v-steel)] px-2 py-1 text-[16px] leading-[16px] text-[var(--v-ink)] ${focus}`}>
              ← back
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── T3: view transitions between two mini pages ─────────────────────────────── */
type VTDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

export function ViewTransitionPages() {
  const reduce = useReduce();
  const [after, setAfter] = useState(true);
  const [dur, setDur] = useState(450);
  const [page, setPage] = useState<'list' | 'detail'>('list');
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => setSupported(typeof (document as VTDoc).startViewTransition === 'function'), []);

  const go = useCallback(
    (next: 'list' | 'detail') => {
      const doc = document as VTDoc;
      if (!after || reduce || !doc.startViewTransition) return setPage(next);
      doc.startViewTransition(() => flushSync(() => setPage(next)));
    },
    [after, reduce],
  );

  const thumb = { viewTransitionName: after ? 'fdb-p-vt-thumb' : undefined } as React.CSSProperties;
  const title = { viewTransitionName: after ? 'fdb-p-vt-title' : undefined } as React.CSSProperties;

  return (
    <div>
      <ControlBar>
        <BeforeAfter after={after} onChange={setAfter} before="Plain swap" afterLabel="View transition" />
        <Slider label="Duration" min={150} max={1500} step={50} value={dur} unit="ms" onChange={setDur} />
        <Replay onClick={() => go(page === 'list' ? 'detail' : 'list')} label="Switch page" />
      </ControlBar>
      <Stage className="h-60 p-3" label={page === 'list' ? 'Mini page: list' : 'Mini page: detail'}>
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">/{page === 'list' ? 'work' : 'work/scarf'}</p>
        {page === 'list' ? (
          <div className="mt-3 space-y-2">
            <button type="button" onClick={() => go('detail')} className={`flex w-full items-center gap-3 border border-[var(--v-steel)] p-2 text-left hover:border-[var(--v-ink)] ${focus}`}>
              <span style={thumb} className="block size-12 shrink-0 bg-[var(--v-ink)]" />
              <span style={title} className="block text-[15px] text-[var(--v-ink)]">Grey wool scarf</span>
            </button>
            {['Linen shirt', 'Canvas bag'].map((t) => (
              <div key={t} className="flex items-center gap-3 border border-[var(--v-line)] p-2">
                <span className="block size-12 shrink-0 bg-[var(--v-steel)]" />
                <span className="text-[15px] text-[var(--v-soft)]">{t}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3">
            <span style={thumb} className="block h-24 w-full bg-[var(--v-ink)]" />
            <span style={title} className="mt-2 block font-display text-[28px] leading-tight text-[var(--v-ink)]">Grey wool scarf</span>
            <button type="button" onClick={() => go('list')} className={`pixel mt-2 border border-[var(--v-steel)] px-2 py-1 text-[16px] leading-[16px] text-[var(--v-ink)] ${focus}`}>
              ← back
            </button>
          </div>
        )}
      </Stage>
      <Readout>
        {supported === false ? 'Your browser has no view transitions, so you get the plain swap. That is the fallback working.' : 'The browser snapshots both states and morphs the square and the title between them.'}
      </Readout>
      <style>{`::view-transition-group(fdb-p-vt-thumb), ::view-transition-group(fdb-p-vt-title) { animation-duration: ${dur}ms; animation-timing-function: cubic-bezier(0.65,0,0.35,1); }
      ::view-transition-old(root), ::view-transition-new(root) { animation-duration: ${Math.round(dur * 0.6)}ms; }`}</style>
    </div>
  );
}

/* ── T4: design the exit too (@starting-style) ─────────────────────────────── */
type Toast = { id: number; text: string; exiting: boolean };
const MESSAGES = ['Saved', 'Link copied', 'Moved to archive', 'Renamed', 'Sent to print'];

export function ToastStack() {
  const reduce = useReduce();
  const [after, setAfter] = useState(true);
  const [dur, setDur] = useState(320);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const timers = useRef<number[]>([]);
  const exit = after && !reduce ? Math.round(dur * 0.7) : 0;

  const dismiss = useCallback(
    (id: number) => {
      setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      timers.current.push(window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), exit));
    },
    [exit],
  );

  const add = () => {
    const id = ++next.current;
    setToasts((ts) => [...ts.filter((t) => !t.exiting).slice(-2), { id, text: MESSAGES[id % MESSAGES.length], exiting: false }]);
    timers.current.push(window.setTimeout(() => dismiss(id), 3200));
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <div>
      <ControlBar>
        <BeforeAfter after={after} onChange={setAfter} before="Pop in, pop out" afterLabel="Designed both ways" />
        <Slider label="Enter" min={150} max={1200} step={10} value={dur} unit="ms" onChange={setDur} />
        <Replay onClick={add} label="Add a toast" />
      </ControlBar>
      <Stage className="h-56" label="Toast notifications">
        <ol className="absolute inset-x-3 bottom-3 flex flex-col gap-2" aria-live="polite">
          {toasts.map((t) => (
            <li
              key={t.id}
              data-exiting={t.exiting ? '' : undefined}
              className={`flex items-center justify-between gap-3 border border-[var(--v-steel)] bg-[var(--v-surface)] px-3 py-2 ${after && !reduce ? 'fdb-p-toast' : ''}`}
              style={{ ['--d' as string]: `${dur}ms`, ['--x' as string]: `${exit}ms` }}
            >
              <span className="text-[14px] text-[var(--v-ink)]">{t.text}</span>
              <button type="button" onClick={() => dismiss(t.id)} aria-label={`Dismiss: ${t.text}`} className={`px-1 text-[var(--v-soft)] hover:text-[var(--v-ink)] ${focus}`}>
                ×
              </button>
            </li>
          ))}
        </ol>
        {toasts.length === 0 ? <p className="p-3 text-[14px] text-[var(--v-dim)]">Add a toast. It leaves on its own after three seconds.</p> : null}
      </Stage>
      <Readout>Enter {after && !reduce ? `${dur}ms` : '0ms'}, exit {exit}ms. The exit is quicker: going away should never hold you up.</Readout>
      <style>{`.fdb-p-toast { transition: opacity var(--d) ease-out, transform var(--d) ${OUT}; }
      @starting-style { .fdb-p-toast { opacity: 0; transform: translateY(16px) scale(0.96); } }
      .fdb-p-toast[data-exiting] { opacity: 0; transform: translateX(24px); transition-duration: var(--x); transition-timing-function: cubic-bezier(0.55,0,1,0.45); }`}</style>
    </div>
  );
}

/* ── T5: start where you clicked (transform-origin) ─────────────────────────────── */
export function OriginMenu() {
  const reduce = useReduce();
  const [after, setAfter] = useState(true);
  const [dur, setDur] = useState(350);
  const [open, setOpen] = useState(false);
  const t = reduce ? 'none' : `transform ${dur}ms ${OUT}, opacity ${dur}ms ease-out`;
  return (
    <div>
      <ControlBar>
        <BeforeAfter after={after} onChange={setAfter} before="From the centre" afterLabel="From the button" />
        <Slider label="Slow-mo" min={150} max={1500} step={50} value={dur} unit="ms" onChange={setDur} />
        <Replay onClick={() => setOpen((o) => !o)} label={open ? 'Close' : 'Open'} />
      </ControlBar>
      <Stage className="h-60" label="A menu opening from its button">
        <div
          id="fdb-p-origin-menu"
          className="absolute bottom-16 left-3 w-48 border border-[var(--v-ink)] bg-[var(--v-surface)] p-2"
          style={{
            transformOrigin: after ? 'bottom left' : 'center',
            transform: open ? 'none' : 'scale(0.4)',
            opacity: open ? 1 : 0,
            visibility: open ? 'visible' : 'hidden',
            transition: reduce ? 'none' : `${t}, visibility 0s linear ${open ? 0 : dur}ms`,
          }}
        >
          {['New file', 'New folder', 'Upload'].map((x) => (
            <p key={x} className="py-1 text-[14px] text-[var(--v-soft)]">{x}</p>
          ))}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="fdb-p-origin-menu"
          onClick={() => setOpen((o) => !o)}
          className={`pixel absolute bottom-3 left-3 bg-[var(--v-ink)] px-3 py-2 text-[16px] leading-[16px] text-[var(--v-bg)] ${focus}`}
        >
          + New
        </button>
      </Stage>
    </div>
  );
}

