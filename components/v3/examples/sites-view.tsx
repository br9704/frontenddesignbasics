import Image from 'next/image';
import examples from '@/data/examples.json';
import { ring } from './views';

type Site = { id: string; name: string; url: string; by: string; note: string; image: string };
type SectionKey = keyof typeof examples;

const FIRST = 12;

const LABELS: Record<SectionKey, string> = {
  typography: 'Type',
  colour: 'Colour',
  layout: 'Layout',
  hierarchy: 'Hierarchy',
  specimen: 'Specimens',
  editorial: 'Editorial',
  hero: 'Heroes',
  bento: 'Bento grids',
  footer: 'Footers',
  components: 'Components',
  motion: 'Motion',
  scroll: 'Scroll',
  '3d': '3D',
  shaders: 'Shaders',
  saas: 'SaaS',
  ai: 'AI products',
  portfolio: 'Portfolios',
  ecommerce: 'Shops',
  darkmode: 'Dark mode',
};

const FAMILIES: { id: string; title: string; blurb: string; sections: SectionKey[] }[] = [
  {
    id: 'principles',
    title: 'Principles',
    blurb: 'Sites I keep open for one idea: how they set type, use colour, lay out a page and make you look at the right thing first.',
    sections: ['typography', 'colour', 'layout', 'hierarchy', 'specimen', 'editorial'],
  },
  {
    id: 'sections',
    title: 'Sections',
    blurb: 'The parts every site needs. When I build a hero or a footer, I look here first.',
    sections: ['hero', 'bento', 'footer', 'components'],
  },
  {
    id: 'motion-3d',
    title: 'Motion and 3D',
    blurb: 'Sites that move. Scroll stories, WebGL scenes and shaders (small programs that paint pixels on the graphics card).',
    sections: ['motion', 'scroll', '3d', 'shaders'],
  },
  {
    id: 'kinds',
    title: 'Kinds of site',
    blurb: 'Grouped by what the site is for, so I can see how others solved the same brief.',
    sections: ['saas', 'ai', 'portfolio', 'ecommerce', 'darkmode'],
  },
];

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Tile({ s }: { s: Site }) {
  return (
    <li className="flex min-w-0 flex-col bg-[var(--v-bg)] p-3">
      <a
        href={s.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`group relative block aspect-[16/10] overflow-hidden border border-[var(--v-steel)] bg-[var(--v-surface)] ${ring}`}
      >
        <Image
          src={s.image}
          alt={`Screenshot of the ${s.name} website`}
          fill
          loading="lazy"
          sizes="(max-width: 639px) calc(100vw - 32px), (max-width: 1023px) 50vw, 460px"
          className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        <span className="sr-only"> (opens {s.name} in a new tab)</span>
      </a>
      <h4 className="pixel mt-3 truncate text-[16px] leading-[16px] text-[var(--v-ink)]">{s.name}</h4>
      <p className="mt-2 flex-1 text-[15px] leading-[1.5] text-[var(--v-soft)]">{s.note}</p>
      <a
        href={s.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`pixel mt-3 truncate text-[14px] leading-[16px] text-[var(--v-dim)] underline-offset-4 hover:text-[var(--v-ink)] hover:underline ${ring}`}
      >
        {host(s.url)} ↗
      </a>
    </li>
  );
}

const grid = 'grid gap-px border border-[var(--v-line)] bg-[var(--v-line)] sm:grid-cols-2 lg:grid-cols-3';

function Section({ k }: { k: SectionKey }) {
  // Public copy has no em dashes: some site names in the data carry one.
  const list = (examples[k] as Site[]).map((s) => ({
    ...s,
    name: s.name.replace(/\s*\u2014\s*/g, ': '),
    note: s.note.replace(/\s*\u2014\s*/g, ', '),
  }));
  const head = list.slice(0, FIRST);
  const rest = list.slice(FIRST);
  return (
    <section id={`s-${k}`} aria-labelledby={`h-${k}`} className="mt-10 scroll-mt-24">
      <h3 id={`h-${k}`} className="pixel flex items-baseline justify-between gap-4 text-[16px] leading-[16px] text-[var(--v-ink)]">
        <span>{LABELS[k]}</span>
        <span className="text-[var(--v-dim)]">{list.length} sites</span>
      </h3>
      <ul className={`mt-4 ${grid}`}>
        {head.map((s) => (
          <Tile key={s.id} s={s} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <details className="group mt-px">
          <summary
            className={`pixel cursor-pointer list-none border border-[var(--v-line)] px-3 py-3 text-[16px] leading-[16px] text-[var(--v-soft)] hover:bg-[var(--v-steel)] hover:text-[var(--v-ink)] [&::-webkit-details-marker]:hidden ${ring}`}
          >
            <span className="group-open:hidden">[+] show all {list.length} ({rest.length} more)</span>
            <span className="hidden group-open:inline">[−] showing all {list.length}</span>
          </summary>
          <ul className={`mt-px ${grid}`}>
            {rest.map((s) => (
              <Tile key={s.id} s={s} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export function SitesView() {
  const total = Object.values(examples).reduce((n, s) => n + s.length, 0);
  return (
    <div>
      <p className="mt-8 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
        {total} real sites in four families. Each section shows its first {FIRST}; open the rest when you want them. Every
        screenshot is full colour and links to the live site.
      </p>
      <nav aria-label="Families" className="mt-6">
        <ul className="flex flex-wrap gap-2">
          {FAMILIES.map((f) => (
            <li key={f.id}>
              <a
                href={`#f-${f.id}`}
                className={`pixel inline-block border border-[var(--v-steel)] px-2 py-2 text-[16px] leading-[16px] text-[var(--v-soft)] hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`}
              >
                {f.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {FAMILIES.map((f, i) => (
        <section key={f.id} id={`f-${f.id}`} aria-labelledby={`fh-${f.id}`} className="mt-16 scroll-mt-20 border-t border-[var(--v-line)] pt-10">
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[0{i + 1}]</p>
          <h2 id={`fh-${f.id}`} className="font-display mt-3 text-[36px] leading-[1.1] sm:text-[48px]">
            {f.title}
          </h2>
          <p className="mt-3 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">{f.blurb}</p>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            {f.sections.map((k) => (
              <li key={k}>
                <a href={`#s-${k}`} className={`pixel text-[14px] leading-[16px] text-[var(--v-dim)] underline-offset-4 hover:text-[var(--v-ink)] hover:underline ${ring}`}>
                  {LABELS[k]} ({examples[k].length})
                </a>
              </li>
            ))}
          </ul>
          {f.sections.map((k) => (
            <Section key={k} k={k} />
          ))}
        </section>
      ))}
    </div>
  );
}
