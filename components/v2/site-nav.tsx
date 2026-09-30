import { SiteNavBar, type NavSkin } from './site-nav-bar';

/*
 * Site navigation. Contract: <SiteNav /> renders a fixed 48px top bar and, unless `overlay`, a 48px
 * spacer so it never shifts layout. On home, pass `skin` to follow the act stage
 * (win95 in acts 00-01, mono in 02-04, colour from 05). Numbers belong to the home rail only.
 * NAV stays importable from server code, so the client bar lives in site-nav-bar.tsx.
 */
export const NAV = [
  { path: '/tools', label: 'tools' },
  { path: '/principles', label: 'principles' },
  { path: '/examples', label: 'examples' },
  { path: '/work', label: 'work' },
  { path: '/make', label: 'make' },
  { path: '/sites', label: 'sites' },
  { path: '/docs/how-to', label: 'how-to' },
  { path: '/docs/rules', label: 'rules' },
  { path: '/docs/cases', label: 'cases' },
];

export type { NavSkin };

export function SiteNav({ skin = 'mono', overlay = false }: { skin?: NavSkin; overlay?: boolean }) {
  return <SiteNavBar skin={skin} overlay={overlay} />;
}
