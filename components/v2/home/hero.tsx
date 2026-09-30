import Link from 'next/link';

/*
 * The plain hero (v3). Server-rendered, no WebGL, no loader in front of it: the first screen says in
 * one line what the site and the repo are, then the showreel starts below. Every count comes from
 * the data, never typed in. Black and white; the "what's here" cards get colour on hover.
 */

export interface HeroCounts {
  tools: number;
  jobs: number;
  principles: number;
  sites: number;
  experiences: number;
}

// same gutter as the acts (PAD in acts.tsx, a client module this server component can't import)
const PAD = 'px-4 sm:px-6 lg:pl-[136px] lg:pr-10';
const REPO = 'https://github.com/br9704/frontenddesignbasics';

export function Hero({ counts }: { counts: HeroCounts }) {
  const cards = [
    { href: '/tools', label: 'Tools', n: counts.jobs, unit: 'jobs', line: `What to use for what, across ${counts.tools} tools.`, img: '/posters/tool-blocks.webp' },
    { href: '/principles', label: 'Principles', n: counts.principles, unit: 'rules', line: 'Things I have learnt, each with a live demo.', img: '/posters/ease-racetrack.webp' },
    { href: '/examples', label: 'Examples', n: counts.sites, unit: 'sites', line: 'Real sites, design systems and breakdowns.', img: '/posters/velocity-gallery.webp' },
    { href: '/work', label: 'Work', n: counts.experiences, unit: 'live pieces', line: 'Things I make, and what I could make for you.', img: '/posters/pixel-to-hd-cube.webp' },
  ];
  return (
    <section id="top" aria-labelledby="hero-title" className={`relative overflow-hidden bg-[var(--v-bg)] pt-14 pb-12 md:pt-20 ${PAD}`}>
      {/* quiet 1-bit dither field, CSS only */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(#fff 0.8px, transparent 0.9px)',
          backgroundSize: '6px 6px',
          maskImage: 'linear-gradient(115deg, transparent 20%, #000 70%)',
          WebkitMaskImage: 'linear-gradient(115deg, transparent 20%, #000 70%)',
        }}
      />
      <div className="relative max-w-[1180px]">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[FDB] frontend design basics</p>
        <h1
          id="hero-title"
          className="mt-5 max-w-[17ch] font-display text-[clamp(2.5rem,6.6vw,6.2rem)] leading-[0.96] tracking-[-0.03em] text-[var(--v-ink)] [text-wrap:balance]"
        >
          A design guide: the tools I use, the principles I&rsquo;ve learnt, and what I build.
        </h1>
        <p className="mt-6 max-w-[60ch] text-[clamp(1.05rem,1.4vw,1.25rem)] leading-[1.55] text-[var(--v-soft)]">
          This site is the live guide. The{' '}
          <a href={REPO} className="text-[var(--v-ink)] underline underline-offset-4 hover:no-underline">
            GitHub repo
          </a>{' '}
          is the same guide in Markdown, plus a toolkit.json your AI agent can read.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/tools"
            className="pixel bg-[var(--v-ink)] px-4 py-3 text-[16px] leading-[16px] text-[var(--v-bg)] outline-offset-4 hover:bg-[var(--v-soft)] focus-visible:outline-2 focus-visible:outline-[var(--v-ink)]"
          >
            [tools: what for what]
          </Link>
          <a
            href={REPO}
            className="pixel border border-[var(--v-soft)] px-4 py-3 text-[16px] leading-[16px] text-[var(--v-ink)] outline-offset-4 hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] focus-visible:outline-2 focus-visible:outline-[var(--v-ink)]"
          >
            [open the repo ↗]
          </a>
        </div>

        <h2 className="sr-only">What&rsquo;s here</h2>
        <ul className="mt-14 grid grid-cols-2 gap-px border border-[var(--v-line)] bg-[var(--v-line)] lg:grid-cols-4">
          {cards.map((c) => (
            <li key={c.href} className="bg-[var(--v-bg)]">
              <Link href={c.href} className="group block h-full p-3 outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-[var(--v-ink)]">
                <div className="relative aspect-[16/10] overflow-hidden bg-[var(--v-surface)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.img}
                    alt=""
                    className="h-full w-full scale-[1.14] object-cover grayscale transition-[filter,transform] duration-300 ease-out group-hover:scale-[1.18] group-hover:grayscale-0 group-focus-visible:grayscale-0 motion-reduce:transition-none"
                  />
                </div>
                <p className="pixel mt-3 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-[16px] leading-[16px] text-[var(--v-ink)]">
                  <span>[{c.label}]</span>
                  <span className="text-[var(--v-dim)] tabular-nums">
                    {c.n} {c.unit}
                  </span>
                </p>
                <p className="mt-2 text-[15px] leading-[1.45] text-[var(--v-soft)]">{c.line}</p>
              </Link>
            </li>
          ))}
        </ul>

        <a href="#boot" className="pixel mt-12 inline-block text-[16px] leading-[16px] text-[var(--v-dim)] hover:text-[var(--v-ink)]">
          WATCH THE SHOWREEL ↓ · 10 ACTS · WIN95 → 3D → COLOUR
        </a>
      </div>
    </section>
  );
}
