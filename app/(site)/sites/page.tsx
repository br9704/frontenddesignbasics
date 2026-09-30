import type { Metadata } from 'next';
import { Suspense } from 'react';
import examples from '@/data/examples.json';
import { SitesBrowser } from '@/components/v2/sites-browser';
import { PostersProvider } from '@/components/v2/make-live';
import { posterIds } from '@/components/v2/make-posters';

const total = Object.values(examples).reduce((n, s) => n + s.length, 0);
const sections = Object.keys(examples).length;

export const metadata: Metadata = {
  title: 'Sites',
  description: `The full library: ${total} real-site screenshots in ${sections} sections, filterable and searchable.`,
};

export default function SitesPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
      <header className="pt-12 pb-8 sm:pt-16">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
          [SITES] <span className="text-[var(--v-ink)]">/sites</span>
        </p>
        <h1 className="pixel mt-6 max-w-[20ch] text-[32px] leading-[32px] sm:text-[64px] sm:leading-[64px]">Every site in the library</h1>
        <p className="mt-6 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
          {total} real sites in {sections} sections, all full colour. Filter by section, search anything, and open the live site.
          Press / to search.
        </p>
      </header>
      <PostersProvider ids={posterIds()}>
        <Suspense fallback={<pre className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[██████░░░░░░] loading…</pre>}>
          <SitesBrowser />
        </Suspense>
      </PostersProvider>
    </div>
  );
}
