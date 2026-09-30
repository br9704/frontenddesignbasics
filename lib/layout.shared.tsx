import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { NAV } from '@/components/v2/site-nav';
import { gitConfig } from './shared';

/*
 * Shared Fumadocs chrome. Matches <SiteNav />: pixel wordmark, `/path` links,
 * one mono theme (so no theme switch).
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      url: '/',
      title: (
        <span className="pixel flex items-baseline gap-2 text-[16px] leading-[16px]">
          <span aria-hidden>■</span>
          <span>fdb</span>
          <span className="text-[var(--v-dim)]">/docs</span>
        </span>
      ),
    },
    links: NAV.map((n) => ({
      text: <span key={n.path} className="pixel text-[16px] leading-[16px]">/{n.label}</span>,
      url: n.path,
      active: 'nested-url' as const,
    })),
    themeSwitch: { enabled: false },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
