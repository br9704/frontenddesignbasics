'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

/*
 * Shared chrome for group g2 experiences: the corner label and the pixel chips used by control strips.
 * Pixel font at 16px (the 8x16 grid), crisp, never smoothed.
 */

type Tone = 'mono' | 'colour' | 'w95';

export function CornerLabel({ title, tools, tone = 'mono', className = '' }: { title: string; tools: string[]; tone?: Tone; className?: string }) {
  if (tone === 'w95') {
    return (
      <div
        className={`pixel pointer-events-auto max-w-[calc(100%-24px)] bg-[#c0c0c0] p-[3px] text-[16px] leading-[16px] text-black ${className}`}
        style={{ boxShadow: 'var(--w-bevel-out)' }}
      >
        <p className="bg-black px-2 py-[3px] text-white">{title}.exe</p>
        <p className="px-2 pt-[5px] pb-[3px]">
          built with:{' '}
          {tools.map((t, i) => (
            <span key={t}>
              {i > 0 && ' · '}
              <Link href={`/tools#${t}`} className="underline-offset-4 hover:underline">
                {t}
              </Link>
            </span>
          ))}
        </p>
      </div>
    );
  }
  return (
    <div className={`pixel pointer-events-auto max-w-[calc(100%-24px)] bg-[#080808]/80 px-2 py-[6px] text-[16px] leading-[16px] ${className}`}>
      <p className="text-[#f5f5f5]">{title}</p>
      <p className="mt-[4px] text-[#8a8a8a]">
        built with:{' '}
        {tools.map((t, i) => (
          <span key={t}>
            {i > 0 && ' · '}
            <Link href={`/tools#${t}`} className="text-[#b0b0b0] underline-offset-4 hover:text-[#f5f5f5] hover:underline">
              {t}
            </Link>
          </span>
        ))}
      </p>
    </div>
  );
}

/** A pixel chip button. `on` renders it inverted. */
export function Chip({
  children,
  onClick,
  on = false,
  label,
  tone = 'mono',
  className = '',
}: {
  children: ReactNode;
  onClick: () => void;
  on?: boolean;
  label?: string;
  tone?: Tone;
  className?: string;
}) {
  if (tone === 'w95') {
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={on}
        onClick={onClick}
        className={`pixel pointer-events-auto bg-[#c0c0c0] px-2 py-[5px] text-[16px] leading-[16px] text-black active:translate-y-px ${className}`}
        style={{ boxShadow: on ? 'var(--w-bevel-in)' : 'var(--w-bevel-out)' }}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={`pixel pointer-events-auto border px-2 py-[4px] text-[16px] leading-[16px] transition-colors duration-150 ${
        on ? 'border-[#f5f5f5] bg-[#f5f5f5] text-[#080808]' : 'border-[#2c2c2c] bg-[#080808]/85 text-[#f5f5f5] hover:border-[#f5f5f5]'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** `◂ value ▸` cycler: one control that fits a 16:10 card and a phone. */
export function Cycler({ name, value, onPrev, onNext, tone = 'mono' }: { name: string; value: string; onPrev: () => void; onNext: () => void; tone?: Tone }) {
  const w95 = tone === 'w95';
  return (
    <div
      className={`pixel pointer-events-auto flex items-stretch text-[16px] leading-[16px] ${
        w95 ? 'bg-[#c0c0c0] text-black' : 'border border-[#2c2c2c] bg-[#080808]/85 text-[#f5f5f5]'
      }`}
      style={w95 ? { boxShadow: 'var(--w-bevel-out)' } : undefined}
    >
      <button type="button" aria-label={`previous ${name}`} onClick={onPrev} className="px-2 py-[4px] hover:bg-[#f5f5f5] hover:text-[#080808]">
        ◂
      </button>
      <span className="min-w-[9ch] py-[4px] text-center" aria-live="polite">
        <span className={w95 ? 'text-[#404040]' : 'text-[#8a8a8a]'}>{name}:</span> {value}
      </span>
      <button type="button" aria-label={`next ${name}`} onClick={onNext} className="px-2 py-[4px] hover:bg-[#f5f5f5] hover:text-[#080808]">
        ▸
      </button>
    </div>
  );
}
