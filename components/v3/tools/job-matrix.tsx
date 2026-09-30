import Image from 'next/image';
import Link from 'next/link';
import { getTool, JOBS, seeIt, toolName, type Job } from './data';
import { ring, ToolChip } from './tool-chip';

/* "What for what": a sticky row of job chips, then one row per job. One DOM for both layouts:
   a four-column table from 768px up, stacked cards below it. */

const COLS = 'md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,10rem)]';
const label = 'pixel text-[16px] leading-[16px] text-[var(--v-dim)]';

export function JobChips({ extra }: { extra: Array<{ href: string; label: string }> }) {
  return (
    <nav
      aria-label="Jobs"
      className="sticky top-12 z-30 -mx-4 border-y border-[var(--v-line)] bg-[var(--v-bg)] px-4 py-3 sm:-mx-6 sm:px-6"
    >
      <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none] md:flex-wrap md:overflow-visible">
        {JOBS.map((j) => (
          <li key={j.id} className="shrink-0">
            <a
              href={`#job-${j.id}`}
              className={`pixel inline-block border border-[var(--v-steel)] px-2 py-1 text-[16px] leading-[16px] text-[var(--v-soft)] hover:border-[var(--v-ink)] hover:text-[var(--v-ink)] ${ring}`}
            >
              {j.chip}
            </a>
          </li>
        ))}
        {extra.map((x) => (
          <li key={x.href} className="shrink-0">
            <a
              href={x.href}
              className={`pixel inline-block px-2 py-1 text-[16px] leading-[16px] text-[var(--v-dim)] underline underline-offset-4 hover:text-[var(--v-ink)] ${ring}`}
            >
              {x.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function JobMatrix({ posters }: { posters: string[] }) {
  const have = new Set(posters);
  return (
    <div className="mt-6">
      <div aria-hidden className={`hidden gap-6 border-b border-[var(--v-steel)] pb-3 md:grid ${COLS} ${label}`}>
        <span>job</span>
        <span>use this</span>
        <span>or, when</span>
        <span>see it</span>
      </div>
      <ol>
        {JOBS.map((j, i) => (
          <JobRow key={j.id} j={j} n={i + 1} see={seeIt(j.see, have)} />
        ))}
      </ol>
    </div>
  );
}

function JobRow({ j, n, see }: { j: Job; n: number; see: Array<{ id: string; title: string }> }) {
  return (
    <li
      id={`job-${j.id}`}
      className={`grid scroll-mt-32 gap-5 border-b border-[var(--v-line)] py-8 md:gap-6 ${COLS} target:bg-[var(--v-surface)]`}
    >
      <div>
        <p className={label}>[{String(n).padStart(2, '0')}]</p>
        <h3 className="mt-2 font-display text-[26px] leading-[1.1] text-[var(--v-ink)] md:text-[24px]">{j.job}</h3>
      </div>

      <div className="min-w-0">
        <p className={`${label} mb-3 md:sr-only`}>use this</p>
        <ul className="flex flex-wrap gap-2">
          {j.default.map((id) => (
            <li key={id}>
              <ToolChip id={id} strong />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[15px] leading-[1.55] text-[var(--v-soft)]">{j.why}</p>
        {j.note ? <p className="mt-3 text-[15px] leading-[1.55] text-[var(--v-dim)]">{j.note}</p> : null}
      </div>

      <div className="min-w-0">
        <p className={`${label} mb-3 md:sr-only`}>or, when</p>
        {j.alternatives.length ? (
          <ul className="space-y-3">
            {j.alternatives.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <ToolChip id={a.id} />
                <span className="min-w-0 text-[15px] leading-[1.5] text-[var(--v-soft)]">{a.when}.</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] leading-[1.5] text-[var(--v-dim)]">Nothing else. The default is enough.</p>
        )}
      </div>

      <div className="min-w-0">
        <p className={`${label} mb-3 md:sr-only`}>see it</p>
        {see.length ? (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-1">
            {see.map((s) => (
              <li key={s.id}>
                <Link href={`/lab/${s.id}`} className={`group block ${ring}`}>
                  <Image
                    src={`/posters/${s.id}.webp`}
                    alt={`Still from ${s.title}`}
                    width={320}
                    height={200}
                    sizes="(min-width: 768px) 160px, 45vw"
                    className="aspect-[16/10] w-full border border-[var(--v-steel)] object-cover transition-colors group-hover:border-[var(--v-ink)]"
                  />
                  <span className="pixel mt-2 block text-[16px] leading-[16px] text-[var(--v-soft)] group-hover:text-[var(--v-ink)]">
                    {s.title} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={label}>no live piece yet</p>
        )}
        {j.links?.length ? (
          <ul className="mt-3 space-y-2">
            {j.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={`text-[14px] leading-[1.4] text-[var(--v-soft)] underline underline-offset-4 hover:text-[var(--v-ink)] ${ring}`}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {j.feature ? <Feature id={j.feature.id} text={j.feature.text} /> : null}
    </li>
  );
}

/** A full-width callout for the one tool a job should make obvious (21st.dev in components). */
function Feature({ id, text }: { id: string; text: string }) {
  const t = getTool(id);
  if (!t) return null;
  return (
    <div className="grid gap-5 border border-[var(--v-ink)] p-4 sm:p-5 md:col-span-full md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {t.image ? (
        <Image
          src={t.image}
          alt={`The ${toolName(id)} website`}
          width={640}
          height={400}
          sizes="(min-width: 768px) 320px, 90vw"
          className="aspect-[16/10] w-full border border-[var(--v-steel)] object-cover"
        />
      ) : null}
      <div className="min-w-0">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">[WHERE I LOOK FIRST] {toolName(id)}</p>
        <p className="mt-3 max-w-[62ch] text-[16px] leading-[1.6] text-[var(--v-soft)]">{text}</p>
        <p className="pixel mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[16px] leading-[16px]">
          <a href={`#${id}`} className={`underline underline-offset-4 hover:text-[var(--v-ink)] ${ring}`}>
            [install and cost ↓]
          </a>
          <a href={t.url} target="_blank" rel="noopener noreferrer" className={`text-[var(--v-soft)] underline underline-offset-4 hover:text-[var(--v-ink)] ${ring}`}>
            [{t.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} ↗]
          </a>
        </p>
      </div>
    </div>
  );
}
