'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/* Client hooks and controls shared by the principle demos. */

export const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]';

/** Clears every pending timeout when the component unmounts. */
export function useTimeouts() {
  const ids = useRef<number[]>([]);
  useEffect(() => {
    const list = ids.current;
    return () => list.forEach((i) => window.clearTimeout(i));
  }, []);
  return {
    later(fn: () => void, ms: number) {
      const id = window.setTimeout(fn, ms);
      ids.current.push(id);
      return id;
    },
    clear() {
      ids.current.forEach((i) => window.clearTimeout(i));
      ids.current = [];
    },
  };
}

export function Btn({
  children,
  onClick,
  pressed,
  primary,
  disabled,
  className = '',
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  primary?: boolean;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const on = primary || pressed;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      disabled={disabled}
      className={`pixel min-h-[32px] border px-3 py-2 text-[16px] leading-[16px] transition-colors disabled:opacity-40 ${focusRing} ${
        on
          ? 'border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]'
          : 'border-[var(--v-steel)] text-[var(--v-soft)] hover:border-[var(--v-ink)] hover:text-[var(--v-ink)]'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; name: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Btn key={o.id} pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.name}
        </Btn>
      ))}
    </div>
  );
}

export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <label htmlFor={id} className="pixel shrink-0 text-[16px] leading-[16px] text-[var(--v-dim)]">
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
        className={`min-w-0 flex-1 accent-[var(--v-ink)] ${focusRing}`}
      />
      <output htmlFor={id} className="pixel w-[72px] shrink-0 text-right text-[16px] leading-[16px] tabular-nums text-[var(--v-ink)]">
        {value}
        {unit}
      </output>
    </div>
  );
}

export function Readout({ children }: { children: ReactNode }) {
  return (
    <p aria-live="polite" className="mt-3 font-mono text-[13px] leading-[1.5] text-[var(--v-soft)] tabular-nums">
      {children}
    </p>
  );
}

export function avg(xs: number[]) {
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
}
