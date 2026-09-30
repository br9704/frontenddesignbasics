'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { catalog } from './make-data';

export type NavSkin = 'win95' | 'mono' | 'colour';

const PRIMARY = [
  { path: '/tools', label: 'Tools' },
  { path: '/make', label: 'Make' },
  { path: '/inspiration', label: 'Inspiration' },
  { path: '/sites', label: 'Sites' },
];
const LEARN = [
  { path: '/docs/how-to', label: 'How-tos' },
  { path: '/docs/rules', label: 'The rules' },
  { path: '/docs/cases', label: 'Cases' },
];
const GITHUB = 'https://github.com/br9704/frontenddesignbasics';

const ring = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]';
const bevelBtn = 'bg-[var(--color-w-face)] text-black [box-shadow:var(--w-bevel-out)] active:[box-shadow:var(--w-bevel-in)]';

function isActive(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(path + '/');
}

export function SiteNavBar({ skin, overlay }: { skin: NavSkin; overlay: boolean }) {
  const pathname = usePathname() ?? '/';
  const [learnOpen, setLearnOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const learnRef = useRef<HTMLDivElement>(null);
  const search = useSearchContext();

  useEffect(() => {
    setMenuOpen(false);
    setLearnOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLearnOpen(false);
        setMenuOpen(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (learnRef.current && !learnRef.current.contains(e.target as Node)) setLearnOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [menuOpen]);

  const learnActive = LEARN.some((l) => isActive(pathname, l.path));

  const bar =
    skin === 'win95'
      ? 'bg-[var(--color-w-face)] text-black [box-shadow:var(--w-bevel-out)]'
      : skin === 'colour'
        ? 'bg-transparent text-[#080808]'
        : 'border-b border-[var(--v-line)] bg-[var(--v-bg)] text-[var(--v-ink)]';

  const item = (active: boolean) => {
    if (skin === 'win95') return active ? 'bg-black text-white' : 'text-black hover:bg-black hover:text-white';
    if (skin === 'colour') return active ? 'bg-[#080808] text-white' : 'text-[#080808] hover:bg-[#080808] hover:text-white';
    return active
      ? 'bg-[var(--v-ink)] text-[var(--v-bg)]'
      : 'text-[var(--v-soft)] hover:bg-[var(--v-steel)] hover:text-[var(--v-ink)]';
  };

  const openSearch = () => search.setOpenSearch(true);

  return (
    <>
      <a
        href="#main"
        className={`pixel fixed top-2 left-2 z-[70] -translate-y-24 bg-[var(--v-ink)] px-2 py-1 text-[16px] leading-[16px] text-[var(--v-bg)] focus:translate-y-0 ${ring}`}
      >
        skip to content
      </a>
      <header className={`pixel fixed inset-x-0 top-0 z-[60] h-12 text-[16px] leading-[16px] ${bar}`}>
        <nav aria-label="Main" className="mx-auto flex h-full max-w-[1400px] items-center gap-2 px-4">
          <Link
            href="/"
            aria-label="Frontend Design Basics, home"
            className={`flex shrink-0 items-center gap-2 py-1 ${ring} ${skin === 'win95' ? `px-2 font-bold ${bevelBtn}` : 'px-1'} ${
              skin === 'colour' ? 'rounded-full bg-white px-3' : ''
            }`}
          >
            {skin === 'win95' ? (
              <span aria-hidden className="grid grid-cols-2 gap-px">
                <i className="block size-[6px] bg-black" />
                <i className="block size-[6px] bg-[#808080]" />
                <i className="block size-[6px] bg-[#808080]" />
                <i className="block size-[6px] bg-black" />
              </span>
            ) : null}
            <span>FDB/95</span>
          </Link>

          <div className={`ml-2 hidden items-center gap-1 md:flex ${skin === 'colour' ? 'rounded-full bg-white px-2 py-1' : ''}`}>
            {PRIMARY.map((n) => {
              const active = isActive(pathname, n.path);
              return (
                <Link key={n.path} href={n.path} aria-current={active ? 'page' : undefined} className={`px-1 py-1 ${item(active)} ${ring}`}>
                  [{n.label.toUpperCase()}]
                </Link>
              );
            })}
            <div ref={learnRef} className="relative">
              <button
                type="button"
                aria-expanded={learnOpen}
                aria-controls="learn-menu"
                onClick={() => setLearnOpen((v) => !v)}
                className={`px-1 py-1 ${item(learnActive || learnOpen)} ${ring}`}
              >
                [LEARN ▾]
              </button>
              {learnOpen ? (
                <ul
                  id="learn-menu"
                  className="absolute top-[calc(100%+10px)] left-0 min-w-[200px] border border-[var(--v-steel)] bg-[var(--v-bg)] p-1 text-[var(--v-ink)]"
                >
                  {LEARN.map((l) => {
                    const a = isActive(pathname, l.path);
                    return (
                      <li key={l.path}>
                        <Link
                          href={l.path}
                          aria-current={a ? 'page' : undefined}
                          className={`block px-2 py-2 ${a ? 'bg-[var(--v-ink)] text-[var(--v-bg)]' : 'hover:bg-[var(--v-steel)]'} ${ring}`}
                        >
                          {l.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </div>

          <div className={`ml-auto flex items-center gap-1 ${skin === 'colour' ? 'rounded-full bg-white px-2 py-1' : ''}`}>
            <button type="button" onClick={openSearch} aria-label="Search docs, experiences and sites" className={`hidden px-1 py-1 sm:block ${item(false)} ${ring}`}>
              [⌘K search]
            </button>
            <a href={GITHUB} target="_blank" rel="noopener noreferrer" className={`hidden px-1 py-1 md:block ${item(false)} ${ring}`}>
              [GitHub ↗]
            </a>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="start-menu"
              className={`px-2 py-1 md:hidden ${bevelBtn} ${ring}`}
            >
              {menuOpen ? '[close]' : '[menu]'}
            </button>
          </div>
        </nav>
      </header>

      {menuOpen ? (
        <div id="start-menu" className="fixed inset-x-0 top-12 bottom-0 z-[59] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/70" onClick={() => setMenuOpen(false)} />
          <div className="relative mx-2 mt-2 flex max-h-[calc(100%-16px)] bg-[var(--color-w-face)] p-[3px] text-black [box-shadow:var(--w-bevel-out)]">
            <div aria-hidden className="flex w-7 shrink-0 items-end justify-center bg-black pb-2">
              <span className="pixel rotate-180 text-[16px] leading-[16px] whitespace-nowrap text-white [writing-mode:vertical-rl]">
                FDB<span className="text-[#808080]">95</span>
              </span>
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain py-1 font-w95 text-[16px] leading-[20px]">
              <ul>
                {[...PRIMARY, ...LEARN].map((n) => {
                  const a = isActive(pathname, n.path);
                  return (
                    <li key={n.path}>
                      <Link
                        href={n.path}
                        aria-current={a ? 'page' : undefined}
                        className={`block px-3 py-2.5 ${a ? 'bg-black text-white' : 'hover:bg-black hover:text-white'} ${ring}`}
                      >
                        {n.label}
                      </Link>
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      openSearch();
                    }}
                    className={`block w-full px-3 py-2.5 text-left hover:bg-black hover:text-white ${ring}`}
                  >
                    Search…
                  </button>
                </li>
                <li>
                  <a href={GITHUB} target="_blank" rel="noopener noreferrer" className={`block px-3 py-2.5 hover:bg-black hover:text-white ${ring}`}>
                    GitHub ↗
                  </a>
                </li>
              </ul>
              <div className="mx-1 my-1 h-[2px] [box-shadow:inset_0_1px_#808080,inset_0_-1px_#fff]" />
              <p className="px-3 pt-2 pb-1 text-[#404040]">Experiences ({catalog.length})</p>
              <ul className="grid grid-cols-1 min-[360px]:grid-cols-2">
                {catalog.map((e) => (
                  <li key={e.id} className="min-w-0">
                    <Link href={`/lab/${e.id}`} className={`block truncate px-3 py-2 hover:bg-black hover:text-white ${ring}`}>
                      {e.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
      {overlay ? null : <div aria-hidden className="h-12 shrink-0" />}
    </>
  );
}
