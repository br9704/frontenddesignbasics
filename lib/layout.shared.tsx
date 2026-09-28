import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-baseline gap-2">
          <span className="inline-block size-2.5 translate-y-[-1px] rounded-full bg-[var(--accent)]" />
          <span data-display className="text-[1.05rem]">
            {appName}
          </span>
        </span>
      ),
    },
    links: [
      { text: 'Principles', url: '/docs/principles' },
      { text: 'Showcase', url: '/docs/showcase' },
      { text: 'Toolkit', url: '/docs/toolkit' },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
