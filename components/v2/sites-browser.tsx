'use client';

import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import examples from '@/data/examples.json';
import { Chip } from './make-grid';
import { getEntry } from './make-data';
import { LivePreview, useReducedMotion } from './make-live';
import { hostOf } from './inspiration-grid';

export interface Site {
  id: string;
  name: string;
  url: string;
  by?: string;
  note: string;
  image: string;
  section: string;
}

type Density = 'big' | 'small' | 'table';

const SECTIONS = Object.keys(examples) as Array<keyof typeof examples>;
export const SITES: Site[] = SECTIONS.flatMap((s) => (examples[s] as Omit<Site, 'section'>[]).map((e) => ({ ...e, section: s })));
const COUNTS = Object.fromEntries(SECTIONS.map((s) => [s, examples[s].length]));

const ring = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]';
const low = (src: string, w = 32) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;

/**
 * Wall tiles dispatch `fdb:site-select` with { id } (the site-wall-3d experience can do the same), and
 * the grid filters to that site and scrolls to it.
 */
export const SITE_SELECT_EVENT = 'fdb:site-select';

export function SitesBrowser() {
  const params = useSearchParams();
  const [section, setSection] = useState<string | null>(params.get('s'));
  const [q, setQ] = useState(params.get('q') ?? '');
  const [density, setDensity] = useState<Density>((params.get('d') as Density) || 'big');
  const [drawer, setDrawer] = useState<Site | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const gridTop = useRef<HTMLDivElement>(null);

  // Filters live in the URL (replaceState keeps typing instant).
  useEffect(() => {
    const next = new URLSearchParams();
    if (section) next.set('s', section);
    if (q) next.set('q', q);
    if (density !== 'big') next.set('d', density);
    const qs = next.toString();
    const url = qs ? `${location.pathname}?${qs}` : location.pathname;
    if (url !== location.pathname + location.search) window.history.replaceState(null, '', url);
  }, [section, q, density]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const select = useCallback((id: string) => {
    const s = SITES.find((x) => x.id === id);
    if (!s) return;
    setSection(s.section);
    setQ(s.name);
    requestAnimationFrame(() => gridTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);

  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) select(id);
    };
    window.addEventListener(SITE_SELECT_EVENT, on);
    return () => window.removeEventListener(SITE_SELECT_EVENT, on);
  }, [select]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      SITES.filter(
        (s) =>
          (!section || s.section === section) &&
          (!needle || `${s.name} ${s.url} ${s.section} ${s.note} ${s.by ?? ''}`.toLowerCase().includes(needle)),
      ),
    [section, needle],
  );

  return (
    <>
      <Hero onSelect={select} />

      <div ref={gridTop} className="scroll-mt-12" />
      <div className="sticky top-12 z-30 -mx-4 mt-10 border-y border-[var(--v-line)] bg-[var(--v-bg)] px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="pixel flex min-w-0 items-center gap-2 border border-[var(--v-steel)] px-2 py-1 text-[16px] leading-[16px] focus-within:border-[var(--v-ink)] lg:w-[300px] lg:shrink-0">
            <span aria-hidden className="text-[var(--v-dim)]">&gt;</span>
            <input
              ref={input}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search name, url, notes  [/]"
              aria-label="Search sites"
              className="min-w-0 flex-1 bg-transparent py-1 text-[var(--v-ink)] outline-none placeholder:text-[var(--v-dim)]"
            />
          </label>
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-color:var(--v-steel)_transparent] [scrollbar-width:thin]">
            <Chip on={!section} onClick={() => setSection(null)}>
              all <span className="opacity-60">{SITES.length}</span>
            </Chip>
            {SECTIONS.map((s) => (
              <Chip key={s} on={section === s} onClick={() => setSection(section === s ? null : s)}>
                {s} <span className="opacity-60">{COUNTS[s]}</span>
              </Chip>
            ))}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3">
            <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)] lg:hidden" aria-live="polite">
              [{shown.length}/{SITES.length}]
            </p>
            <div role="group" aria-label="Density" className="flex gap-1">
              {(['big', 'small', 'table'] as Density[]).map((d) => (
                <Chip key={d} on={density === d} onClick={() => setDensity(d)}>
                  {d}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="pixel mt-6 hidden text-[16px] leading-[16px] text-[var(--v-dim)] lg:block" aria-live="polite">
        [{shown.length}/{SITES.length}] {section ? `in ${section}` : 'sites'}
        {needle ? ` matching "${q.trim()}"` : ''}
      </p>

      {!shown.length ? (
        <pre className="pixel mt-16 text-center text-[16px] leading-[16px] text-[var(--v-dim)]">
          {`┌──────────────────────────┐\n│  0 results. try: shaders │\n└──────────────────────────┘`}
        </pre>
      ) : density === 'table' ? (
        <SiteTable sites={shown} onDetails={setDrawer} />
      ) : (
        <ul
          className={`mt-6 grid gap-x-4 gap-y-8 ${
            density === 'big' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
          }`}
        >
          {shown.map((s) => (
            <li key={s.id} className="min-w-0">
              <SiteTile s={s} small={density === 'small'} onDetails={() => setDrawer(s)} />
            </li>
          ))}
        </ul>
      )}

      <Drawer site={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}

function SiteTile({ s, small, onDetails }: { s: Site; small: boolean; onDetails: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="group">
      <a href={s.url} target="_blank" rel="noopener noreferrer" className={`relative block aspect-[16/10] overflow-hidden border border-[var(--v-steel)] bg-[var(--v-surface)] ${ring}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={low(s.image)} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top [image-rendering:pixelated]" />
        <Image
          src={s.image}
          alt={`${s.name} website`}
          fill
          loading="lazy"
          sizes={small ? '(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 20vw' : '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw'}
          onLoad={() => setLoaded(true)}
          className={`object-cover object-top transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
        <span className="pixel absolute inset-x-0 bottom-0 flex translate-y-full justify-between gap-2 bg-[var(--v-bg)] px-2 py-1 text-[16px] leading-[16px] text-[var(--v-ink)] transition-transform duration-200 group-focus-within:translate-y-0 group-hover:translate-y-0">
          <span className="truncate">│ {hostOf(s.url)}</span>
          <span className="shrink-0">↗ │</span>
        </span>
      </a>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <p className={`pixel truncate text-[16px] leading-[16px] ${small ? 'text-[var(--v-soft)]' : ''}`}>{s.name}</p>
        <button
          type="button"
          onClick={onDetails}
          aria-label={`Notes on ${s.name}`}
          className={`pixel shrink-0 text-[16px] leading-[16px] text-[var(--v-dim)] hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`}
        >
          [i]
        </button>
      </div>
      {!small ? <p className="mt-1 line-clamp-2 text-[15px] leading-[1.5] text-[var(--v-soft)]">{s.note}</p> : null}
    </div>
  );
}

function SiteTable({ sites, onDetails }: { sites: Site[]; onDetails: (s: Site) => void }) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="pixel w-full min-w-[640px] border-collapse text-left text-[16px] leading-[16px]">
        <thead className="text-[var(--v-dim)]">
          <tr className="border-b border-[var(--v-steel)]">
            <th className="py-2 pr-4 font-normal">name</th>
            <th className="py-2 pr-4 font-normal">section</th>
            <th className="py-2 pr-4 font-normal">domain</th>
            <th className="py-2 font-normal">notes</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.id} className="border-b border-[var(--v-line)] hover:bg-[var(--v-surface)]">
              <td className="py-2 pr-4 whitespace-nowrap">{s.name}</td>
              <td className="py-2 pr-4 text-[var(--v-dim)]">{s.section}</td>
              <td className="py-2 pr-4 whitespace-nowrap">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className={`text-[var(--v-soft)] hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`}>
                  {hostOf(s.url)} ↗
                </a>
              </td>
              <td className="py-2">
                <button type="button" onClick={() => onDetails(s)} className={`text-[var(--v-dim)] hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`}>
                  [notes]
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Drawer({ site, onClose }: { site: Site | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (site && !d.open) d.showModal();
    if (!site && d.open) d.close();
  }, [site]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={site ? `${site.name} notes` : 'Notes'}
      className="fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-[min(440px,100vw)] max-w-none overflow-y-auto border-l border-[var(--v-steel)] bg-[var(--v-bg)] p-0 text-[var(--v-ink)] backdrop:bg-black/75"
    >
      {site ? (
        <div className="p-5">
          <div className="pixel flex justify-between text-[16px] leading-[16px] text-[var(--v-dim)]">
            <span>┌─ {site.section} ─</span>
            <button type="button" onClick={onClose} className={`hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`} aria-label="Close notes">
              [esc]
            </button>
          </div>
          <div className="relative mt-5 aspect-[16/10] border border-[var(--v-steel)]">
            <Image src={site.image} alt={`${site.name} website`} fill sizes="440px" className="object-cover object-top" />
          </div>
          <h2 className="pixel mt-5 text-[32px] leading-[32px]">{site.name}</h2>
          {site.by ? <p className="pixel mt-2 text-[16px] leading-[16px] text-[var(--v-dim)]">by {site.by}</p> : null}
          <p className="mt-4 text-[17px] leading-[1.6] text-[var(--v-soft)]">{site.note}</p>
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`pixel mt-6 inline-block border border-[var(--v-ink)] px-3 py-2 text-[16px] leading-[16px] hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`}
          >
            [open {hostOf(site.url)} ↗]
          </a>
        </div>
      ) : null}
    </dialog>
  );
}

/** 60vh hero: site-wall-3d (velocity-gallery on phones or reduced motion); a pixel mosaic until they exist. */
function Hero({ onSelect }: { onSelect: (id: string) => void }) {
  const reduced = useReducedMotion();
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const u = () => setPhone(mq.matches);
    u();
    mq.addEventListener('change', u);
    return () => mq.removeEventListener('change', u);
  }, []);
  const wall = getEntry('site-wall-3d');
  const gallery = getEntry('velocity-gallery');
  const pick = phone || reduced ? (gallery?.load ? gallery : null) : wall?.load ? wall : null;

  return (
    <div>
      {/* caption sits above the stage so it never collides with the experience's own HUD */}
      <p className="pixel mb-2 text-[16px] leading-[16px] text-[var(--v-dim)]">
        ┌─ {SITES.length} sites ─ {pick ? 'drag to spin · every one is listed below' : 'click one to find it'}
      </p>
      <div className="relative h-[60vh] min-h-[360px] overflow-hidden border border-[var(--v-steel)] bg-[var(--v-surface)]">
        {pick ? <LivePreview id={pick.id} className="h-full w-full" /> : <Mosaic onSelect={onSelect} />}
      </div>
    </div>
  );
}

function Mosaic({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <ul className="grid h-full grid-cols-[repeat(auto-fill,minmax(72px,1fr))] content-start gap-px bg-[var(--v-line)] sm:grid-cols-[repeat(auto-fill,minmax(96px,1fr))]">
      {SITES.map((s) => (
        <li key={s.id} className="relative aspect-[16/10] min-w-0 bg-[var(--v-bg)]">
          <button type="button" onClick={() => onSelect(s.id)} title={s.name} aria-label={`Find ${s.name}`} className={`group absolute inset-0 ${ring}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={low(s.image, 64)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover object-top opacity-80 [image-rendering:pixelated] group-hover:opacity-100"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
