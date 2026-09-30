'use client';

import type * as PageTree from 'fumadocs-core/page-tree';

/*
 * Docs sidebar pieces in the v2 mono style. Page-tree separators ("---Guide---" in meta.json)
 * render as ASCII rules: `── guide ──────`.
 */
export function SidebarAsciiSeparator({ item }: { item: PageTree.Separator }) {
  return (
    <p className="pixel mt-6 mb-1 flex items-center gap-2 overflow-hidden px-2 text-[16px] leading-[16px] whitespace-nowrap text-[var(--v-dim)] first:mt-0">
      <span aria-hidden>──</span>
      <span className="lowercase">{item.name}</span>
      <span aria-hidden className="min-w-0 overflow-hidden">
        {'─'.repeat(40)}
      </span>
    </p>
  );
}

/** Sits above the site links at the top of the sidebar: `[§] /site ─────`. */
export function SidebarAsciiBanner() {
  return (
    <p className="pixel -mb-1 flex items-center gap-2 overflow-hidden px-2 pt-2 text-[16px] leading-[16px] whitespace-nowrap text-[var(--v-dim)]">
      <span>[§]</span>
      <span className="text-[var(--v-ink)]">/site</span>
      <span aria-hidden className="min-w-0 overflow-hidden">
        {'─'.repeat(40)}
      </span>
    </p>
  );
}
