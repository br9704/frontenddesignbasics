'use client';

import { useId, type ReactNode } from 'react';

/*
 * The three controls every demo on /principles uses, always in the same order and the same look:
 * a Before/After switch, a slider, and Replay. Plus the stage the demo plays in.
 */

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]';

export function ControlBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-3">{children}</div>;
}

/** Two-way switch. `after` is the version the principle recommends. */
export function BeforeAfter({
  after,
  onChange,
  before: beforeLabel = 'Before',
  afterLabel = 'After',
  label = 'Compare',
}: {
  after: boolean;
  onChange: (after: boolean) => void;
  before?: string;
  afterLabel?: string;
  label?: string;
}) {
  const opt = (on: boolean, text: string, v: boolean) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(v)}
      className={`pixel px-3 py-2 text-[16px] leading-[16px] ${focus} ${
        on ? 'bg-[var(--v-ink)] text-[var(--v-bg)]' : 'text-[var(--v-soft)] hover:text-[var(--v-ink)]'
      }`}
    >
      {text}
    </button>
  );
  return (
    <div role="group" aria-label={label} className="inline-flex border border-[var(--v-steel)]">
      {opt(!after, beforeLabel, false)}
      {opt(after, afterLabel, true)}
    </div>
  );
}

/** Pick one of a few options (same look as Before/After, for 3+ choices). */
export function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap border border-[var(--v-steel)]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`pixel px-3 py-2 text-[16px] leading-[16px] ${focus} ${
            value === o.value ? 'bg-[var(--v-ink)] text-[var(--v-bg)]' : 'text-[var(--v-soft)] hover:text-[var(--v-ink)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  unit = '',
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  onChange: (n: number) => void;
  format?: (n: number) => string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 items-center gap-2 text-[14px] text-[var(--v-soft)]">
      <label htmlFor={id} className="shrink-0">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-28 min-w-0 accent-[var(--v-ink)] sm:w-36 ${focus}`}
      />
      <output htmlFor={id} className="w-[7ch] shrink-0 font-mono text-[13px] tabular-nums text-[var(--v-ink)]">
        {format ? format(value) : `${value}${unit}`}
      </output>
    </div>
  );
}

export function Replay({ onClick, label = 'Replay' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pixel border border-[var(--v-ink)] px-3 py-2 text-[16px] leading-[16px] text-[var(--v-ink)] hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] active:scale-[0.97] ${focus}`}
    >
      ↻ {label}
    </button>
  );
}

/** A plain action button in the same style as Replay. */
export function Action({ onClick, children, pressed }: { onClick: () => void; children: ReactNode; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`pixel border border-[var(--v-steel)] px-3 py-2 text-[16px] leading-[16px] text-[var(--v-ink)] hover:border-[var(--v-ink)] active:scale-[0.97] ${focus} ${
        pressed ? 'bg-[var(--v-ink)] text-[var(--v-bg)]' : ''
      }`}
    >
      {children}
    </button>
  );
}

/** The box a demo plays in. Clips its contents so nothing can widen the page. */
export function Stage({ children, className = '', label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className={`relative mt-4 overflow-hidden border border-[var(--v-line)] bg-[var(--v-bg)] ${className}`}
    >
      {children}
    </div>
  );
}

/** Small mono readout under a stage. */
export function Readout({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return (
    <p className="mt-3 font-mono text-[13px] leading-[1.5] text-[var(--v-soft)] tabular-nums" aria-live={live ? 'polite' : undefined}>
      {children}
    </p>
  );
}
