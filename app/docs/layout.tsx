import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { SidebarAsciiBanner, SidebarAsciiSeparator } from '@/components/docs-chrome';

/*
 * Docs chrome in the v2 mono style: pixel wordmark and `/path` links (same list as <SiteNav />),
 * pixel sidebar items, ASCII section rules, no theme switch.
 */
export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...baseOptions()}
      containerProps={{
        // `dark` here makes Fumadocs' dark-only rules (Shiki code colours, dark: variants) apply even when
        // the viewer's system is light, since there is only one mono theme.
        className:
          'dark bg-[var(--v-bg)] [&_#nd-page_:is(.rounded-xl,.rounded-lg,.rounded-md)]:rounded-none [&_#nd-page_.shadow-md]:shadow-none',
        style: {
          // Callouts: mono bars and icons instead of blue / amber / red.
          ['--color-fd-info' as string]: 'var(--v-ink)',
          ['--color-fd-warning' as string]: 'var(--v-ink)',
          ['--color-fd-error' as string]: 'var(--v-ink)',
          ['--color-fd-success' as string]: 'var(--v-ink)',
          ['--color-fd-idea' as string]: 'var(--v-ink)',
        },
      }}
      sidebar={{
        banner: <SidebarAsciiBanner key="ascii-banner" />,
        components: { Separator: SidebarAsciiSeparator },
        className:
          'pixel text-[16px] leading-[16px] [-webkit-font-smoothing:none] [&_button]:text-[16px] [&_kbd]:rounded-none bg-[var(--v-bg)] border-[var(--v-line)] [&_a[data-active=true]]:text-[var(--v-ink)] [&_a[data-active=true]]:bg-[var(--v-steel)] [&_a]:rounded-none [&_button]:rounded-none',
      }}
    >
      {children}
    </DocsLayout>
  );
}
