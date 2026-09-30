import type { ReactNode } from 'react';

/**
 * A panel drawn with box-drawing characters: ┌─ title ──┐ … └──┘.
 * The border is CSS (so it scales to any width) styled to match the pixel font; the title sits in the top rule.
 */
export function AsciiFrame({
  title,
  right,
  children,
  className = '',
  invert = false,
}: {
  title?: string;
  right?: string;
  children: ReactNode;
  className?: string;
  invert?: boolean;
}) {
  return (
    <section
      className={`relative border px-4 pt-6 pb-4 sm:px-6 ${
        invert ? 'border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]' : 'border-[var(--v-steel)] bg-[var(--v-bg)] text-[var(--v-ink)]'
      } ${className}`}
    >
      {(title || right) && (
        <div className="pixel absolute -top-[9px] right-3 left-3 flex justify-between text-[16px] leading-[16px]">
          {title ? <span className={`px-1 ${invert ? 'bg-[var(--v-ink)]' : 'bg-[var(--v-bg)]'}`}>┌─ {title} ─</span> : <span />}
          {right ? <span className={`px-1 ${invert ? 'bg-[var(--v-ink)]' : 'bg-[var(--v-bg)]'}`}>─ {right} ─┐</span> : null}
        </div>
      )}
      {children}
    </section>
  );
}

/** `[01] /tools` style section label. */
export function ActLabel({ n, path, className = '' }: { n: string; path: string; className?: string }) {
  return (
    <p className={`pixel text-[16px] leading-[16px] text-[var(--v-dim)] ${className}`}>
      [{n}] <span className="text-[var(--v-ink)]">{path}</span>
    </p>
  );
}
