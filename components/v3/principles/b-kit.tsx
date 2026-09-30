import type { ReactNode } from 'react';
import { ChapterSection, PrincipleCard } from './card';
import { CHAPTERS, type Source } from './data';

/*
 * Thin wrappers over the shared ChapterSection and PrincipleCard (card.tsx) for chapters V to VII,
 * so every chapter on /principles has the same shape. Server-safe.
 */

export type { Source };

export function Chapter({ id, intro, children }: { id: 'visual' | 'ux' | 'states'; intro: string; children: ReactNode }) {
  const chapter = CHAPTERS.find((c) => c.id === id) ?? { id, numeral: '', title: id, short: id };
  return (
    <ChapterSection chapter={chapter} intro={intro}>
      {children}
    </ChapterSection>
  );
}

export function Card({ code, rule, why, source, children }: { code: string; rule: string; why: string; source: Source; children: ReactNode }) {
  return (
    <PrincipleCard p={{ id: code.toLowerCase(), no: code, rule, why, source }}>
      {children}
    </PrincipleCard>
  );
}

/** The demo area. Page ground on the raised card, clipped so nothing can widen the page. */
export function Stage({
  children,
  label,
  flush,
  className = '',
}: {
  children: ReactNode;
  label?: string;
  flush?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative min-w-0 overflow-hidden border border-[var(--v-line)] bg-[var(--v-bg)] ${flush ? '' : 'p-3 sm:p-4'} ${className}`}>
      {label ? <p className="pixel mb-3 text-[16px] leading-[16px] text-[var(--v-dim)]">{label}</p> : null}
      {children}
    </div>
  );
}

export const lawsofux = (slug: string, label: string): Source => ({ href: `https://lawsofux.com/${slug}/`, label });
export const nng = (slug: string, label: string): Source => ({ href: `https://www.nngroup.com/articles/${slug}/`, label });
