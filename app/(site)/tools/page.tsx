import type { Metadata } from 'next';
import toolkit from '@/toolkit/toolkit.json';
import { ToolsBrowser } from '@/components/v2/tools-browser';
import { PostersProvider } from '@/components/v2/make-live';
import { posterIds } from '@/components/v2/make-posters';

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
    </div>
  );
}
