import type { Metadata } from 'next';
import toolkit from '@/toolkit/toolkit.json';
import { ToolsBrowser } from '@/components/v2/tools-browser';
import { PostersProvider } from '@/components/v2/make-live';
import { posterIds } from '@/components/v2/make-posters';
import { TECHNIQUES } from '@/lib/techniques';
import { JOBS } from '@/components/v3/tools/data';
import { JobChips, JobMatrix } from '@/components/v3/tools/job-matrix';
import { DecisionTrees } from '@/components/v3/tools/decision-trees';

export const metadata: Metadata = {
  title: 'Tools: what for what',
  description: `${JOBS.length} jobs and the tool I reach for first on each, three decision trees, then all ${toolkit.tools.length} libraries, MCPs and skills with install lines.`,
};

const eyebrow = 'pixel text-[16px] leading-[16px] text-[var(--v-dim)]';

export default function ToolsPage() {
  const posters = posterIds();
  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
      <header className="pt-12 pb-8 sm:pt-16">
        <p className={eyebrow}>
          [TOOLS] <span className="text-[var(--v-ink)]">/tools</span>
        </p>
        <h1 className="mt-6 max-w-[16ch] font-display text-[44px] leading-[1.02] sm:text-[80px]">What to use for what</h1>
        <p className="mt-6 max-w-[62ch] text-[18px] leading-[1.6] text-[var(--v-ink)]">
          Pick the job. Use the default. Reach for an alternative only when its reason applies.
        </p>
        <p className="mt-4 max-w-[62ch] text-[16px] leading-[1.6] text-[var(--v-soft)]">
          I sorted my kit by the job it does. Every tool name jumps to its entry in the full catalogue of {toolkit.tools.length}{' '}
          further down, with the install line and what it costs. Where I built something with it, you can open it and play.
        </p>
      </header>

      <section aria-labelledby="what-for-what">
        <h2 id="what-for-what" className="sr-only">
          What for what
        </h2>
        <JobChips
          extra={[
            { href: '#decisions', label: 'decision trees' },
            { href: '#catalogue', label: `all ${toolkit.tools.length} tools` },
          ]}
        />
        <JobMatrix posters={posters} />
        <p className="mt-6 max-w-[62ch] text-[15px] leading-[1.6] text-[var(--v-dim)]">
          Not on this map: the voice and messaging tools. They are for setting up an agent, not for building a page. They are{' '}
          <a href="#cat-media" className="underline underline-offset-4 hover:text-[var(--v-ink)]">
            in the catalogue
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="decisions" className="mt-24">
        <p className={eyebrow}>[DECIDE]</p>
        <h2 id="decisions" className="mt-4 scroll-mt-20 font-display text-[36px] leading-[1.05] sm:text-[56px]">
          Three questions I ask a lot
        </h2>
        <p className="mt-4 max-w-[62ch] text-[16px] leading-[1.6] text-[var(--v-soft)]">
          Read from the top. Take the first yes and stop there.
        </p>
        <DecisionTrees />
      </section>

      <section aria-labelledby="catalogue" className="mt-24">
        <p className={eyebrow}>[CATALOGUE]</p>
        <h2 id="catalogue" className="mt-4 mb-8 scroll-mt-20 font-display text-[36px] leading-[1.05] sm:text-[56px]">
          All {toolkit.tools.length} tools
        </h2>
        <PostersProvider ids={posters}>
          <ToolsBrowser />
        </PostersProvider>
      </section>

      <section aria-labelledby="building-blocks" className="mt-20 border-t border-[var(--v-line)] pt-10 pb-20">
        <h2 id="building-blocks" className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">
          [BUILDING BLOCKS] the parts inside the tools
        </h2>
        <p className="mt-4 max-w-[62ch] text-[16px] leading-[1.6] text-[var(--v-soft)]">
          The &ldquo;built with&rdquo; tags on the live pieces also name these. They aren&rsquo;t tools you install on their own; they
          come with one above, or with the browser.
        </p>
        <ul className="mt-8 grid gap-px border border-[var(--v-line)] bg-[var(--v-line)] sm:grid-cols-2 lg:grid-cols-4">
          {TECHNIQUES.map((t) => (
            // The catalogue above already owns the #r3f style anchors, so these carry a prefix.
            <li key={t.id} id={`block-${t.id}`} className="scroll-mt-20 bg-[var(--v-bg)] p-4">
              <a href={t.url} className="pixel text-[16px] leading-[16px] text-[var(--v-ink)] underline-offset-4 hover:underline">
                {t.name} ↗
              </a>
              <p className="mt-3 text-[15px] leading-[1.5] text-[var(--v-soft)]">{t.what}</p>
              {t.with ? (
                <p className="pixel mt-3 text-[14px] leading-[16px] text-[var(--v-dim)]">
                  comes with <a href={`#${t.with}`} className="underline underline-offset-4 hover:text-[var(--v-ink)]">{t.with}</a>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
