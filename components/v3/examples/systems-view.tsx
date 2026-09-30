import Link from 'next/link';
import data from '@/data/systems.json';
import { ring } from './views';

type System = {
  id: string;
  name: string;
  family: string;
  url: string;
  what: string;
  font: string;
  fontStack: string;
  scale: { label: string; px: number }[];
  scaleNote: string;
  ramp?: { steps: string[]; roles: string[]; note: string };
  inputs?: string[];
  roles?: string[];
  vars?: string[];
  swatches?: { name: string; hex: string }[];
  bevel?: boolean;
  steal: { topic: string; text: string }[];
  toolkit: string;
  toolkitIds: string[];
};

const systems = data.systems as System[];

/** Draws a type scale as real text, capped so the biggest line still fits at 390px. */
function Scale({ s }: { s: System }) {
  if (!s.scale.length) return null;
  const max = Math.max(...s.scale.map((x) => x.px));
  return (
    <ul aria-label={`${s.name} type scale`} className="space-y-2 overflow-hidden">
      {s.scale.map((x) => (
        <li key={x.label} className="flex items-baseline gap-3">
          <span className="pixel w-[112px] shrink-0 truncate text-[14px] leading-[16px] text-[var(--v-dim)]">
            {x.label} <span className="text-[var(--v-steel)]">·</span> {x.px}
          </span>
          <span
            aria-hidden
            className="min-w-0 truncate leading-[1.1] text-[var(--v-ink)]"
            style={{
              fontFamily: s.fontStack,
              fontSize: `clamp(${Math.max(11, Math.round(x.px * 0.55))}px, ${((x.px / max) * 7).toFixed(2)}vw, ${x.px}px)`,
            }}
          >
            Aa Sample
          </span>
        </li>
      ))}
    </ul>
  );
}

function Ramp({ r }: { r: NonNullable<System['ramp']> }) {
  const n = r.steps.length;
  return (
    <figure>
      <ol className="grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {r.steps.map((step, i) => {
          const l = Math.round(10 + (i / (n - 1)) * 84);
          return (
            <li key={step} title={`${step}: ${r.roles[i]}`} className="h-10 border-r border-[var(--v-bg)]" style={{ background: `hsl(0 0% ${l}%)` }}>
              <span className="sr-only">
                Step {step}: {r.roles[i]}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="pixel mt-2 flex justify-between text-[14px] leading-[16px] text-[var(--v-dim)]" aria-hidden>
        <span>{r.steps[0]} {r.roles[0]}</span>
        <span>{r.steps[n - 1]} {r.roles[n - 1]}</span>
      </div>
      <figcaption className="mt-2 text-[14px] leading-[1.5] text-[var(--v-dim)]">{r.note}</figcaption>
    </figure>
  );
}

function Chips({ items, label }: { items: string[]; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1">
      {items.map((x) => (
        <li key={x} className="pixel border border-[var(--v-steel)] px-2 py-1 text-[14px] leading-[16px] text-[var(--v-soft)]">
          {x}
        </li>
      ))}
    </ul>
  );
}

function Swatches({ s }: { s: System }) {
  if (!s.swatches) return null;
  return (
    <ul aria-label={`${s.name} colour tokens`} className="grid grid-cols-3 gap-px bg-[var(--v-line)] sm:grid-cols-4">
      {s.swatches.map((w) => (
        <li key={w.name} className="bg-[var(--v-bg)] p-2">
          <span
            aria-hidden
            className="block h-10 border border-[var(--v-steel)]"
            style={{ background: w.hex, boxShadow: s.bevel && w.name === '--w-face' ? 'inset -1px -1px #000, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf' : undefined }}
          />
          <span className="pixel mt-2 block truncate text-[14px] leading-[16px] text-[var(--v-soft)]">{w.name}</span>
          <span className="pixel block text-[14px] leading-[16px] text-[var(--v-dim)]">{w.hex}</span>
        </li>
      ))}
    </ul>
  );
}

function Card({ s, n }: { s: System; n: number }) {
  const external = s.url.startsWith('http');
  return (
    <article id={s.id} aria-labelledby={`sys-${s.id}`} className="grid scroll-mt-20 gap-6 border border-[var(--v-line)] bg-[var(--v-bg)] p-4 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="min-w-0">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[{String(n).padStart(2, '0')}]</p>
        <h3 id={`sys-${s.id}`} className="font-display mt-3 text-[32px] leading-[1.1] sm:text-[40px]">
          {s.name}
        </h3>
        <p className="mt-3 text-[16px] leading-[1.6] text-[var(--v-soft)]">{s.what}</p>
        <div className="mt-6 space-y-4 border border-[var(--v-steel)] bg-[var(--v-surface)] p-4">
          <p className="pixel text-[14px] leading-[16px] text-[var(--v-dim)]">specimen · {s.font}</p>
          <Scale s={s} />
          {s.ramp ? <Ramp r={s.ramp} /> : null}
          {s.inputs ? <Chips items={s.inputs} label="Theme inputs" /> : null}
          {s.roles ? <Chips items={s.roles} label="Colour roles" /> : null}
          {s.vars ? <Chips items={s.vars} label="CSS variables" /> : null}
          <Swatches s={s} />
          <p className="text-[14px] leading-[1.5] text-[var(--v-dim)]">{s.scaleNote}</p>
        </div>
      </div>
      <div className="min-w-0">
        <h4 className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">5 things I steal</h4>
        <dl className="mt-4 divide-y divide-[var(--v-line)] border-y border-[var(--v-line)]">
          {s.steal.map((x) => (
            <div key={x.topic} className="grid gap-1 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
              <dt className="pixel text-[14px] leading-[16px] text-[var(--v-dim)] sm:pt-1">{x.topic}</dt>
              <dd className="text-[16px] leading-[1.55] text-[var(--v-soft)]">{x.text}</dd>
            </div>
          ))}
        </dl>
        <h4 className="pixel mt-6 text-[16px] leading-[16px] text-[var(--v-ink)]">Do this with the toolkit</h4>
        <p className="mt-3 text-[16px] leading-[1.55] text-[var(--v-soft)]">{s.toolkit}</p>
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-2" aria-label="Tools">
          {s.toolkitIds.map((t) => (
            <li key={t}>
              <Link href={`/tools#${t}`} className={`pixel text-[14px] leading-[16px] text-[var(--v-soft)] underline underline-offset-4 hover:text-[var(--v-ink)] ${ring}`}>
                {t}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6">
          {external ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer" className={`pixel text-[16px] leading-[16px] text-[var(--v-ink)] underline-offset-4 hover:underline ${ring}`}>
              read the source ↗<span className="sr-only"> ({s.name}, opens in a new tab)</span>
            </a>
          ) : (
            <Link href={s.url} className={`pixel text-[16px] leading-[16px] text-[var(--v-ink)] underline-offset-4 hover:underline ${ring}`}>
              see it on this site →
            </Link>
          )}
        </p>
      </div>
    </article>
  );
}

export function SystemsView() {
  const pub = systems.filter((s) => s.family === 'public');
  const mine = systems.filter((s) => s.family === 'mine');
  return (
    <div>
      <p className="mt-8 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
        A design system is the set of rules behind a look: the type sizes, colour tokens (named colours), spacing, motion and
        states. I read these for the rules, not the looks. Each card draws the system in plain HTML from its public docs. Where
        I couldn&rsquo;t check a number, I describe it instead.
      </p>
      <nav aria-label="Systems" className="mt-6">
        <ul className="flex flex-wrap gap-2">
          {systems.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className={`pixel inline-block border border-[var(--v-steel)] px-2 py-2 text-[16px] leading-[16px] text-[var(--v-soft)] hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`}>
                {s.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <section aria-labelledby="sys-public" className="mt-12">
        <h2 id="sys-public" className="font-display text-[36px] leading-[1.1] sm:text-[48px]">
          Systems I learn from
        </h2>
        <div className="mt-6 grid gap-6">
          {pub.map((s, i) => (
            <Card key={s.id} s={s} n={i + 1} />
          ))}
        </div>
      </section>
      <section aria-labelledby="sys-mine" className="mt-16">
        <h2 id="sys-mine" className="font-display text-[36px] leading-[1.1] sm:text-[48px]">
          My three token sheets
        </h2>
        <p className="mt-3 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
          This site moves through three looks. These are the exact tokens each one uses.
        </p>
        <div className="mt-6 grid gap-6">
          {mine.map((s, i) => (
            <Card key={s.id} s={s} n={pub.length + i + 1} />
          ))}
        </div>
      </section>
    </div>
  );
}
