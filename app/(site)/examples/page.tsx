import type { Metadata } from 'next';
import examples from '@/data/examples.json';
import { ViewSwitch } from '@/components/v3/examples/view-switch';
import { parseView, VIEWS } from '@/components/v3/examples/views';
import { SitesView } from '@/components/v3/examples/sites-view';
import { SystemsView } from '@/components/v3/examples/systems-view';
import { BreakdownsView } from '@/components/v3/examples/breakdowns-view';
import { ThinkView } from '@/components/v3/examples/think-view';

const total = Object.values(examples).reduce((n, s) => n + s.length, 0);

export const metadata: Metadata = {
  title: 'Examples',
  description: `${total} real sites, the design systems I learn from, breakdowns of great sites, and how I look at a site.`,
};

export default async function ExamplesPage(props: { searchParams: Promise<{ view?: string | string[] }> }) {
  const { view: raw } = await props.searchParams;
  const view = parseView(raw);
  const label = VIEWS.find((v) => v.id === view)!.label;
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 sm:px-6">
      <header className="pt-12 pb-8 sm:pt-16">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
          [EXAMPLES] <span className="text-[var(--v-ink)]">/examples{view === 'sites' ? '' : `?view=${view}`}</span>
        </p>
        <h1 className="mt-6 max-w-[16ch] font-display text-[44px] leading-[1.02] sm:text-[88px]">What I look at</h1>
        <p className="mt-6 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
          Real sites, the design systems behind the best of them, breakdowns from the people who made them, and the way I read
          all of it.
        </p>
      </header>
      <ViewSwitch current={view} />
      <p className="sr-only" aria-live="polite">
        Showing {label}
      </p>
      {view === 'sites' ? <SitesView /> : null}
      {view === 'systems' ? <SystemsView /> : null}
      {view === 'breakdowns' ? <BreakdownsView /> : null}
      {view === 'think' ? <ThinkView /> : null}
    </div>
  );
}
