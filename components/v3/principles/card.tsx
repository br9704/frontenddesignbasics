import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ChapterMeta, Principle } from './data';

/*
 * The two shapes on /principles. A chapter (h2, anchor id, one-line intro) and a principle card
 * (h3 rule in first person, a live demo, one line on why, a source chip). Server components.
 */

export function ChapterSection({
  chapter,
  intro,
  deeper,
  children,
}: {
  chapter: ChapterMeta;
  intro: string;
  deeper?: { href: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <section id={chapter.id} aria-labelledby={`${chapter.id}-h`} className="scroll-mt-24 border-t border-[var(--v-line)] pt-12 pb-16">
      <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
        [{chapter.numeral}] <span className="text-[var(--v-soft)]">#{chapter.id}</span>
      </p>
      <h2 id={`${chapter.id}-h`} className="mt-4 font-display text-[40px] leading-[1.02] tracking-[-0.02em] text-[var(--v-ink)] sm:text-[56px]">
        {chapter.title}
      </h2>
      <p className="mt-4 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">{intro}</p>
      {deeper?.length ? (
        <p className="pixel mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[16px] leading-[16px] text-[var(--v-dim)]">
          go deeper:
          {deeper.map((d) => (
            <Link key={d.href} href={d.href} className="text-[var(--v-soft)] underline underline-offset-4 hover:text-[var(--v-ink)]">
              {d.label} ↗
            </Link>
          ))}
        </p>
      ) : null}
      <div className="mt-10 grid gap-px border border-[var(--v-line)] bg-[var(--v-line)] lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">{children}</div>
    </section>
  );
}

export function PrincipleCard({ p, children, more }: { p: Principle; children: ReactNode; more?: ReactNode }) {
  return (
    <article id={p.id} aria-labelledby={`${p.id}-h`} className="min-w-0 scroll-mt-24 bg-[var(--v-surface)] p-4 sm:p-6">
      <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">{p.no}</p>
      <h3 id={`${p.id}-h`} className="mt-3 font-display text-[26px] leading-[1.15] text-[var(--v-ink)] sm:text-[30px]">
        {p.rule}
      </h3>
      <div className="mt-5 min-w-0">{children}</div>
      <p className="mt-5 max-w-[62ch] text-[16px] leading-[1.6] text-[var(--v-soft)]">
        <span className="pixel mr-2 text-[16px] leading-[16px] text-[var(--v-dim)]">why</span>
        {p.why}
      </p>
      <p className="mt-4">
        <a
          href={p.source.href}
          target="_blank"
          rel="noreferrer"
          className="pixel inline-block border border-[var(--v-steel)] px-2 py-1 text-[16px] leading-[16px] text-[var(--v-soft)] hover:border-[var(--v-ink)] hover:text-[var(--v-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]"
        >
          source: {p.source.label} ↗<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
      {more ? (
        <details className="mt-4 text-[15px] text-[var(--v-soft)]">
          <summary className="pixel cursor-pointer text-[16px] leading-[16px] text-[var(--v-dim)] hover:text-[var(--v-ink)]">
            [+] more to play with
          </summary>
          <div className="mt-2 min-w-0">{more}</div>
        </details>
      ) : null}
    </article>
  );
}
