'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/* A framed live demo. Every guide page puts one of these before the code. */
export function Preview({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <figure className="not-prose my-6">
      <div className="relative overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--surface-raised)] p-6 sm:p-8">
        {children}
      </div>
      {caption && <figcaption className="mt-2 text-xs text-[var(--text-soft)]">{caption}</figcaption>}
    </figure>
  );
}

const curves = {
  linear: 'linear',
  'ease-out-quint': 'cubic-bezier(0.22, 1, 0.36, 1)',
  'ease-in-out-cubic': 'cubic-bezier(0.65, 0, 0.35, 1)',
  'ease-in (avoid for UI)': 'cubic-bezier(0.55, 0, 1, 0.45)',
  'spring-ish overshoot': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

/* Easing playground: the same 600ms move with different curves, side by side. */
export function EasingPlayground() {
  const [run, setRun] = useState(0);
  const [duration, setDuration] = useState(600);
  return (
    <Preview caption="Same distance, same duration. Only the curve changes. Press play and watch which ones feel like UI.">
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          className="rounded-full bg-[var(--text)] px-4 py-1.5 text-sm text-[var(--surface)] transition-transform active:scale-95"
        >
          ▶ Play
        </button>
        <label className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
          Duration
          <input
            type="range"
            min={150}
            max={1500}
            step={50}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="accent-[var(--accent)]"
          />
          <span className="w-14 font-mono tabular-nums">{duration}ms</span>
        </label>
      </div>
      <div className="space-y-3">
        {Object.entries(curves).map(([name, fn]) => (
          <div key={name} className="grid grid-cols-[9.5rem_1fr] items-center gap-3 text-xs sm:grid-cols-[11rem_1fr]">
            <span className="font-mono text-[var(--text-soft)]">{name}</span>
            <div className="relative h-7 rounded-full bg-[var(--color-fd-muted)]">
              <div
                key={run}
                className="absolute top-1 left-1 size-5 rounded-full bg-[var(--accent)]"
                style={{
                  animation: run ? `fdb-slide ${duration}ms ${fn} forwards` : undefined,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <style>{`@keyframes fdb-slide { to { left: calc(100% - 1.5rem); } }`}</style>
    </Preview>
  );
}

const scales = { 'Minor third · 1.2': 1.2, 'Perfect fourth · 1.333': 1.333, 'Golden · 1.618': 1.618 };

/* Modular type scale: one base, one ratio, every size derived. */
export function TypeScale() {
  const [ratio, setRatio] = useState(1.333);
  const [base, setBase] = useState(16);
  const steps = [4, 3, 2, 1, 0, -1];
  return (
    <Preview caption="Pick a ratio. Every heading size is base × ratioⁿ, so the sizes relate instead of being guessed.">
      <div className="mb-5 flex flex-wrap gap-2">
        {Object.entries(scales).map(([label, r]) => (
          <button
            key={label}
            type="button"
            onClick={() => setRatio(r)}
            aria-pressed={ratio === r}
            className={`rounded-full px-3 py-1 text-xs ${
              ratio === r ? 'bg-[var(--text)] text-[var(--surface)]' : 'border border-[var(--rule)]'
            }`}
          >
            {label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-[var(--text-soft)]">
          Base
          <input
            type="range"
            min={14}
            max={20}
            value={base}
            onChange={(e) => setBase(Number(e.target.value))}
            className="accent-[var(--accent)]"
          />
          <span className="font-mono">{base}px</span>
        </label>
      </div>
      <div className="space-y-2 overflow-hidden">
        {steps.map((n) => {
          const px = base * ratio ** n;
          return (
            <div key={n} className="flex items-baseline gap-4">
              <span className="w-16 shrink-0 font-mono text-[11px] text-[var(--text-soft)] tabular-nums">
                {px.toFixed(1)}px
              </span>
              <span
                className="truncate"
                style={{ fontSize: px, lineHeight: 1.15, fontFamily: n > 0 ? 'var(--font-display)' : undefined }}
              >
                {n > 0 ? 'Complete, beautiful' : 'Body copy sets the rhythm for everything else.'}
              </span>
            </div>
          );
        })}
      </div>
    </Preview>
  );
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/* Contrast checker: WCAG ratio for any text/background pair. */
export function ContrastPair() {
  const [fg, setFg] = useState('#5c574c');
  const [bg, setBg] = useState('#f2eee6');
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  const ratio = (l1 + 0.05) / (l2 + 0.05);
  const grade = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA large only' : 'Fails';
  return (
    <Preview caption="Body text needs 4.5:1 (AA). Soft grey on warm paper is the usual trap: check it, don't eyeball it.">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          Text <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="h-8 w-10 cursor-pointer" />
        </label>
        <label className="flex items-center gap-2 text-xs">
          Background <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-8 w-10 cursor-pointer" />
        </label>
        <span className="ml-auto font-mono text-sm tabular-nums">
          {ratio.toFixed(2)}:1 · <strong>{grade}</strong>
        </span>
      </div>
      <p className="mt-5 rounded-md p-5 text-base" style={{ color: fg, background: bg }}>
        The quick brown fox reads comfortably, or it doesn't. Numbers decide, not taste.
      </p>
    </Preview>
  );
}

/* 4pt spacing rhythm: shows why a scale beats arbitrary gaps. */
export function SpacingRhythm() {
  const [scaled, setScaled] = useState(true);
  const gaps = scaled ? [4, 8, 16, 24, 40] : [5, 11, 14, 27, 33];
  return (
    <Preview caption="Left: a 4pt scale. Toggle to see the same layout with guessed gaps. The eye notices even when it can't say why.">
      <button
        type="button"
        onClick={() => setScaled((s) => !s)}
        className="mb-5 rounded-full border border-[var(--rule)] px-3 py-1 text-xs"
      >
        {scaled ? 'Using a 4pt scale' : 'Using guessed values'} (toggle)
      </button>
      <div className="flex flex-wrap items-end" style={{ gap: gaps[3] }}>
        {gaps.map((g, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="rounded bg-[var(--accent)]" style={{ width: g * 1.4 + 8, height: g * 1.4 + 8, opacity: 0.35 + i * 0.15 }} />
            <span className="font-mono text-[11px] text-[var(--text-soft)]">{g}</span>
          </div>
        ))}
      </div>
    </Preview>
  );
}

/* Reduced-motion switch: the same animation, honouring the user's setting. */
export function ReducedMotionDemo() {
  const [reduced, setReduced] = useState(false);
  const [shown, setShown] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  return (
    <Preview caption="With reduced motion on, the card fades instead of flying. Same information, no vestibular cost.">
      <div className="mb-5 flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={() => setShown((s) => !s)} className="rounded-full bg-[var(--text)] px-3 py-1 text-[var(--surface)]">
          Toggle card
        </button>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} /> Simulate prefers-reduced-motion
        </label>
      </div>
      <div className="h-28">
        <div
          ref={ref}
          className="rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-5 text-sm"
          style={{
            transition: reduced ? 'opacity 200ms linear' : 'transform 520ms cubic-bezier(0.22,1,0.36,1), opacity 520ms',
            opacity: shown ? 1 : 0,
            transform: reduced || shown ? 'none' : 'translateY(40px) rotate(-3deg) scale(0.95)',
          }}
        >
          A card that enters with motion, or with a fade when motion is reduced.
        </div>
      </div>
    </Preview>
  );
}
