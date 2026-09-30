import Link from 'next/link';

/* Site footer: an ASCII rule, the same routes as the nav, and the credits line. Mono, no numbers. */
const COLS = [
  {
    title: 'use',
    links: [
      { href: '/tools', label: 'The tools' },
      { href: '/make', label: 'What you can make' },
      { href: '/inspiration', label: 'Inspiration' },
      { href: '/sites', label: 'Sites' },
    ],
  },
  {
    title: 'learn',
    links: [
      { href: '/docs/how-to', label: 'How-tos' },
      { href: '/docs/rules', label: 'The rules' },
      { href: '/docs/cases', label: 'Cases' },
      { href: '/lab', label: 'Lab index' },
    ],
  },
  {
    title: 'source',
    links: [
      { href: 'https://github.com/br9704/frontenddesignbasics', label: 'GitHub ↗' },
      { href: '/llms.txt', label: 'llms.txt' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--v-line)] bg-[var(--v-bg)] text-[var(--v-soft)]">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6">
        <p aria-hidden className="pixel overflow-hidden text-[16px] leading-[16px] whitespace-nowrap text-[var(--v-steel)]">
          {'░▒▓█'.repeat(80)}
        </p>
        <div className="mt-10 grid gap-10 sm:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <p className="pixel text-[32px] leading-[32px] text-[var(--v-ink)]">FDB/95</p>
            <p className="mt-4 max-w-[36ch] text-[15px] leading-[1.6]">
              Frontend Design Basics. The tools I use every day, what you can make with them, and where to look for more.
            </p>
          </div>
          {COLS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[{c.title}]</p>
              <ul className="mt-4 space-y-2 text-[15px]">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="underline-offset-4 outline-none hover:text-[var(--v-ink)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="pixel mt-12 text-[16px] leading-[16px] text-[var(--v-dim)]">
          built with: <Link href="/tools#gsap" className="hover:text-[var(--v-ink)]">gsap</Link> ·{' '}
          <Link href="/tools#threejs" className="hover:text-[var(--v-ink)]">three</Link> ·{' '}
          <Link href="/tools#ogl" className="hover:text-[var(--v-ink)]">ogl</Link> ·{' '}
          <Link href="/tools#lenis" className="hover:text-[var(--v-ink)]">lenis</Link> · next · fumadocs
        </p>
      </div>
    </footer>
  );
}
