import type { Metadata } from 'next';
import toolkit from '@/toolkit/toolkit.json';
import { ToolsBrowser } from '@/components/v2/tools-browser';
import { PostersProvider } from '@/components/v2/make-live';
import { posterIds } from '@/components/v2/make-posters';
import { TECHNIQUES } from '@/lib/techniques';

export const metadata: Metadata = {
  title: 'The tools I use every day',
  description: `Every library, MCP and skill in the kit (${toolkit.tools.length}), with its install line and what you can make with it.`,
};

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
      <header className="pt-12 pb-8 sm:pt-16">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
          [TOOLS] <span className="text-[var(--v-ink)]">/tools</span>
        </p>
        <h1 className="pixel mt-6 max-w-[18ch] text-[32px] leading-[32px] sm:text-[64px] sm:leading-[64px]">The tools I use every day</h1>
        <p className="mt-6 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
          {toolkit.tools.length} libraries, MCPs and skills, read like a manual. Each entry says what it is, when I reach for it and
          how to install it. Where something on this site was built with it, you can play it right there.
        </p>
      </header>
      <PostersProvider ids={posterIds()}>
        <ToolsBrowser />
      </PostersProvider>
      <section aria-labelledby="techniques" className="mt-20 border-t border-[var(--v-line)] pt-10 pb-20">
        <h2 id="techniques" className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">
          [BUILDING BLOCKS] the parts inside the tools
        </h2>
        <p className="mt-4 max-w-[62ch] text-[16px] leading-[1.6] text-[var(--v-soft)]">
          The &ldquo;built with&rdquo; tags on the live pieces also name these. They aren&rsquo;t tools you install on their own; they
          come with one above, or with the browser.
        </p>
        <ul className="mt-8 grid gap-px border border-[var(--v-line)] bg-[var(--v-line)] sm:grid-cols-2 lg:grid-cols-4">
          {TECHNIQUES.map((t) => (
            <li key={t.id} id={t.id} className="scroll-mt-20 bg-[var(--v-bg)] p-4 target:outline target:outline-1 target:outline-[var(--v-ink)]">
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
