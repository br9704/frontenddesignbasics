'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Preview } from '../demos';

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

const btnBase =
  'inline-flex h-10 min-w-[7.5rem] items-center justify-center gap-2 rounded-full px-5 text-sm font-medium outline-none';
const ring = 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-raised)]';

const states: { name: string; note: string; cls: string; label?: string; spinner?: boolean }[] = [
  { name: 'Default', note: 'resting', cls: 'bg-[var(--text)] text-[var(--surface)]' },
  { name: 'Hover', note: '150ms in', cls: 'bg-[var(--accent)] text-[var(--surface)] -translate-y-px' },
  { name: 'Pressed', note: '80ms, scale .97', cls: 'bg-[var(--accent)] text-[var(--surface)] scale-[0.97]' },
  { name: 'Focus-visible', note: '0ms, keyboard only', cls: `bg-[var(--text)] text-[var(--surface)] ${ring}` },
  { name: 'Disabled', note: 'no hover, not-allowed', cls: 'bg-[var(--rule)] text-[var(--text-soft)] cursor-not-allowed' },
  { name: 'Loading', note: 'width locked', cls: 'bg-[var(--text)] text-[var(--surface)]', label: 'Saving', spinner: true },
];

function Spinner() {
  return <span aria-hidden className="size-3.5 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" />;
}

/* One button, every state, plus a live one whose transition speed you can change. */
export function ButtonStatesLab() {
  const [speed, setSpeed] = useState(150);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done'>('idle');
  useEffect(() => {
    if (phase === 'idle') return;
    const t = setTimeout(() => setPhase(phase === 'loading' ? 'done' : 'idle'), phase === 'loading' ? 1400 : 1600);
    return () => clearTimeout(t);
  }, [phase]);
  return (
    <Preview caption="Six states every button needs. Hover and press should be quick (under 200ms); focus should be instant. Drag the slider to 600ms and feel how sluggish the live one gets.">
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
        {states.map((s) => (
          <div key={s.name} className="flex flex-col items-start gap-2">
            <span aria-hidden className={`${btnBase} ${s.cls}`}>
              {s.spinner && <Spinner />}
              {s.label ?? 'Continue'}
            </span>
            <span className="text-xs">
              <span className="block text-[var(--text)]">{s.name}</span>
              <span className="font-mono text-[var(--text-soft)]">{s.note}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-5 border-t border-[var(--rule)] pt-6">
        <button
          type="button"
          disabled={phase === 'loading'}
          aria-busy={phase === 'loading'}
          onClick={() => setPhase('loading')}
          style={{ transitionDuration: `${speed}ms` }}
          className={`${btnBase} bg-[var(--text)] text-[var(--surface)] transition-[background-color,transform] ease-[var(--ease-out-quint)] hover:bg-[var(--accent)] motion-safe:hover:-translate-y-px motion-safe:active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)] disabled:cursor-wait`}
        >
          {phase === 'loading' && <Spinner />}
          {phase === 'idle' ? 'Try me' : phase === 'loading' ? 'Saving' : 'Saved ✓'}
        </button>
        <label className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
          Transition
          <input type="range" min={0} max={600} step={10} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-32 accent-[var(--accent)]" />
          <span className="w-12 font-mono tabular-nums">{speed}ms</span>
        </label>
        <span role="status" className="sr-only">{phase === 'done' ? 'Saved' : ''}</span>
      </div>
      <p className="mt-3 text-xs text-[var(--text-soft)]">Press Tab to reach it: the ring only appears for keyboard focus, never on click.</p>
    </Preview>
  );
}

/* A card whose border and glow track the pointer, using two CSS custom properties. */
export function SpotlightCard() {
  const [size, setSize] = useState(220);
  const setPos = (el: HTMLElement, x: string, y: string, o: string) => {
    el.style.setProperty('--x', x);
    el.style.setProperty('--y', y);
    el.style.setProperty('--o', o);
  };
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    setPos(e.currentTarget, `${e.clientX - b.left}px`, `${e.clientY - b.top}px`, '1');
  };
  const cards = [
    { t: 'Border glow', d: 'A 1px wrapper with the gradient as its background. The card sits on top.' },
    { t: 'Keyboard too', d: 'Tab here: focus centres the light so keyboard users get the same cue.' },
  ];
  return (
    <Preview caption="Move over the cards, or Tab to them. JavaScript only writes --x and --y; CSS paints both gradients. No re-render per frame.">
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <a
            key={c.t}
            href="#spotlight"
            onClick={(e) => e.preventDefault()}
            onPointerMove={onMove}
            onPointerLeave={(e) => setPos(e.currentTarget, '50%', '50%', '0')}
            onFocus={(e) => setPos(e.currentTarget, '50%', '50%', '1')}
            onBlur={(e) => setPos(e.currentTarget, '50%', '50%', '0')}
            className="group block rounded-xl p-px outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)]"
            style={
              {
                '--x': '50%', '--y': '50%', '--o': '0',
                background: `radial-gradient(${size}px circle at var(--x) var(--y), color-mix(in oklab, var(--accent) calc(var(--o) * 100%), var(--rule)), var(--rule) 70%)`,
              } as CSSProperties
            }
          >
            <div
              className="relative h-full rounded-[11px] bg-[var(--surface)] p-5"
              style={{ backgroundImage: `radial-gradient(${size}px circle at var(--x) var(--y), color-mix(in oklab, var(--accent) calc(var(--o) * 14%), transparent), transparent 70%)` }}
            >
              <p className="font-display text-xl text-[var(--text)]">{c.t}</p>
              <p className="mt-2 text-sm text-[var(--text-soft)]">{c.d}</p>
            </div>
          </a>
        ))}
      </div>
      <label className="mt-5 flex items-center gap-2 text-xs text-[var(--text-soft)]">
        Light radius
        <input type="range" min={80} max={420} step={10} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-36 accent-[var(--accent)]" />
        <span className="font-mono tabular-nums">{size}px</span>
      </label>
    </Preview>
  );
}

const eases = {
  'ease-out-quint': 'cubic-bezier(0.22, 1, 0.36, 1)',
  'ease-in-out-cubic': 'cubic-bezier(0.65, 0, 0.35, 1)',
  'overshoot': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  linear: 'linear',
} as const;
const headline = ['Say one thing,', 'then say it', 'beautifully.'];

/* Masked text reveal: each word rises out of its own overflow-hidden box. */
export function TextRevealDemo() {
  const reduced = useReducedMotion();
  const [run, setRun] = useState(1);
  const [ease, setEase] = useState<keyof typeof eases>('ease-out-quint');
  const [split, setSplit] = useState<'words' | 'lines'>('words');
  let i = 0;
  const step = split === 'words' ? 70 : 140;
  return (
    <Preview caption="Each piece sits in a box with overflow hidden, then slides up from 110%. The mask is what makes it read as a reveal and not a fade. Try lines vs words, and linear vs quint.">
      <div className="mb-6 flex flex-wrap items-center gap-3 text-xs">
        <button type="button" onClick={() => setRun((r) => r + 1)} className="rounded-full bg-[var(--text)] px-4 py-1.5 text-sm text-[var(--surface)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)] motion-safe:active:scale-95">
          Replay
        </button>
        <label className="flex items-center gap-2 text-[var(--text-soft)]">
          Ease
          <select value={ease} onChange={(e) => setEase(e.target.value as keyof typeof eases)} className="rounded border border-[var(--rule)] bg-[var(--surface)] px-2 py-1 font-mono text-[var(--text)]">
            {Object.keys(eases).map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
        <fieldset className="flex items-center gap-1 rounded-full border border-[var(--rule)] p-0.5">
          <legend className="sr-only">Split by</legend>
          {(['words', 'lines'] as const).map((s) => (
            <label key={s} className={`cursor-pointer rounded-full px-3 py-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--accent)] ${split === s ? 'bg-[var(--text)] text-[var(--surface)]' : 'text-[var(--text-soft)]'}`}>
              <input type="radio" name="split" value={s} checked={split === s} onChange={() => setSplit(s)} className="sr-only" />
              {s}
            </label>
          ))}
        </fieldset>
      </div>
      <h3 key={`${run}-${split}-${ease}`} aria-label={headline.join(' ')} className="font-display text-[clamp(2rem,7vw,3.75rem)] leading-[1.02] tracking-tight text-[var(--text)]">
        {headline.map((line) => (
          <span key={line} aria-hidden className="block">
            {(split === 'words' ? line.split(' ') : [line]).map((w) => {
              const delay = i++ * step;
              return (
                <span key={w} className="inline-block overflow-hidden pb-[0.08em] align-top [&:not(:last-child)]:mr-[0.25em]">
                  <span
                    className="inline-block"
                    style={{
                      animation: reduced
                        ? `fdb-fade 300ms ease-out ${delay / 3}ms both`
                        : `fdb-rise 900ms ${eases[ease]} ${delay}ms both`,
                    }}
                  >
                    {w}
                  </span>
                </span>
              );
            })}
          </span>
        ))}
      </h3>
      <style>{`@keyframes fdb-rise{from{transform:translateY(110%)}to{transform:none}}@keyframes fdb-fade{from{opacity:0}to{opacity:1}}`}</style>
    </Preview>
  );
}

/* Magnetic CTA: the button leans toward the pointer inside a radius. */
export function MagneticButton() {
  const reduced = useReducedMotion();
  const [strength, setStrength] = useState(0.35);
  const btn = useRef<HTMLButtonElement>(null);
  const radius = 140;
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = btn.current;
    if (!el || reduced || e.pointerType !== 'mouse') return;
    const b = el.getBoundingClientRect();
    const dx = e.clientX - (b.left + b.width / 2);
    const dy = e.clientY - (b.top + b.height / 2);
    const inside = Math.hypot(dx, dy) < radius;
    el.style.transform = inside ? `translate(${dx * strength}px, ${dy * strength}px)` : '';
  };
  const reset = () => btn.current && (btn.current.style.transform = '');
  return (
    <Preview caption="Bring your pointer near the button. Inside the dashed radius it follows by a fraction of your offset; outside, it springs home. Mouse only, and off when reduced motion is on.">
      <div onPointerMove={onMove} onPointerLeave={reset} className="relative flex h-64 items-center justify-center">
        <span aria-hidden className="pointer-events-none absolute rounded-full border border-dashed border-[var(--rule)]" style={{ width: radius * 2, height: radius * 2 }} />
        <button
          ref={btn}
          type="button"
          className="relative rounded-full bg-[var(--accent)] px-7 py-3 text-sm font-medium text-[var(--surface)] outline-none transition-transform duration-500 ease-[var(--ease-out-quint)] focus-visible:ring-2 focus-visible:ring-[var(--text)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)]"
        >
          Start a project
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
        Strength
        <input type="range" min={0} max={0.8} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="w-36 accent-[var(--accent)]" />
        <span className="font-mono tabular-nums">{strength.toFixed(2)}</span>
      </label>
      <p className="mt-4 border-l-2 border-[var(--accent)] pl-3 text-xs leading-relaxed text-[var(--text-soft)]">
        {reduced && 'Reduced motion is on, so the pull is disabled. '}
        When not to use it: forms, nav bars, dense toolbars, anything clicked repeatedly. A moving target is harder to hit (Fitts&apos;s law), and touch screens have no hover. Keep it to one hero CTA, and keep strength under about 0.4.
      </p>
    </Preview>
  );
}
