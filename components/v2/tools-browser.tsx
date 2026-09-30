'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import toolkit from '@/toolkit/toolkit.json';
import { AsciiFrame } from './ascii-frame';
import { Chip } from './make-grid';
import { LivePreview } from './make-live';
import { catalog, experiencesUsing, getEntry, TECHNIQUES } from './make-data';

type Tool = (typeof toolkit.tools)[number] & { image?: string; repo?: string };

/** The nine categories, in the order the page reads. */
const ORDER = ['3d', 'skills', 'components', 'motion', 'shaders', 'research', 'infra', 'media', 'ai'] as const;
const CATS = toolkit.categories as Record<string, string>;
const LEGEND = toolkit.statusLegend as Record<string, string>;

/** A tool with no screenshot of its own borrows its chapter banner. */
const BANNER: Record<string, string> = {
  motion: '/banners/motion.jpg',
  '3d': '/banners/3d.jpg',
  shaders: '/banners/shaders.jpg',
  components: '/banners/components.jpg',
  research: '/banners/showcase.jpg',
  skills: '/banners/principles.jpg',
  infra: '/banners/workflow.jpg',
  media: '/banners/toolkit.jpg',
  ai: '/banners/ai-assets.jpg',
};

const ring = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]';
const tools = toolkit.tools as Tool[];

function haystack(t: Tool) {
  return `${t.id} ${t.name} ${t.category} ${t.what} ${t.when}`.toLowerCase();
}

export function ToolsBrowser() {
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [exe, setExe] = useState(false);
  const input = useRef<HTMLInputElement>(null);

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

  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => tools.filter((t) => (!cat || t.category === cat) && (!needle || haystack(t).includes(needle))), [cat, needle]);
  const groups = ORDER.map((c) => ({ id: c, title: CATS[c] ?? c, items: visible.filter((t) => t.category === c) })).filter((g) => g.items.length);
  const counts = Object.fromEntries(ORDER.map((c) => [c, tools.filter((t) => t.category === c).length]));
  const desktop = getEntry('win95-desktop');

  return (
    <>
      <div className="flex flex-col gap-4 border-y border-[var(--v-line)] py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] lg:flex-wrap">
          <Chip on={!cat} onClick={() => setCat(null)}>
            all <span className="opacity-60">{tools.length}</span>
          </Chip>
          {ORDER.map((c) => (
            <Chip key={c} on={cat === c} onClick={() => setCat(cat === c ? null : c)}>
              {c} <span className="opacity-60">{counts[c]}</span>
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="pixel flex min-w-0 flex-1 items-center gap-2 border border-[var(--v-steel)] px-2 py-1 text-[16px] leading-[16px] focus-within:border-[var(--v-ink)] lg:w-[260px] lg:flex-none">
            <span aria-hidden className="text-[var(--v-dim)]">&gt;</span>
            <input
              ref={input}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search  [/]"
              aria-label="Search tools"
              className="min-w-0 flex-1 bg-transparent py-1 text-[var(--v-ink)] outline-none placeholder:text-[var(--v-dim)]"
            />
          </label>
          <button
            type="button"
            aria-pressed={exe}
            onClick={() => setExe((v) => !v)}
            className={`shrink-0 bg-[var(--color-w-face)] px-3 py-2 font-w95 text-[14px] leading-[16px] text-black [box-shadow:var(--w-bevel-out)] active:[box-shadow:var(--w-bevel-in)] ${
              exe ? '[box-shadow:var(--w-bevel-in)]' : ''
            } ${ring}`}
          >
            {exe ? 'Close Tools.exe' : 'Tools.exe'}
          </button>
        </div>
      </div>

      {exe ? (
        <div className="mt-8">
          <AsciiFrame title="C:\TOOLS.EXE" right="win95-desktop" className="!p-2">
            {desktop?.load ? (
              <LivePreview id="win95-desktop" forceLive className="h-[75svh] min-h-[480px] w-full" />
            ) : (
              <pre className="pixel p-8 text-[16px] leading-[16px] text-[var(--v-dim)]">[win95-desktop is not built yet. Close Tools.exe for the list.]</pre>
            )}
          </AsciiFrame>
        </div>
      ) : (
        <div className="mt-10 grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav aria-label="Categories" className="hidden lg:block">
            <div className="sticky top-24">
            <AsciiFrame title="index" className="pixel !px-3 !pt-5 !pb-3 text-[16px] leading-[16px]">
              <ul>
                {ORDER.map((c) => {
                  const n = visible.filter((t) => t.category === c).length;
                  return (
                    <li key={c}>
                      <a
                        href={`#cat-${c}`}
                        className={`flex justify-between py-1.5 ${n ? 'text-[var(--v-soft)] hover:text-[var(--v-ink)]' : 'pointer-events-none text-[var(--v-steel)]'} ${ring}`}
                      >
                        <span>{c}</span>
                        <span className="text-[var(--v-dim)]">{String(n).padStart(2, '0')}</span>
                      </a>
                    </li>
                  );
                })}
                <li className="mt-2 border-t border-[var(--v-line)] pt-2">
                  <a href="#techniques" className={`flex justify-between py-1.5 text-[var(--v-soft)] hover:text-[var(--v-ink)] ${ring}`}>
                    <span>techniques</span>
                    <span className="text-[var(--v-dim)]">{String(TECHNIQUES.length).padStart(2, '0')}</span>
                  </a>
                </li>
              </ul>
            </AsciiFrame>
            </div>
          </nav>

          <div className="min-w-0">
            {groups.length ? (
              groups.map((g) => (
                <section key={g.id} id={`cat-${g.id}`} className="mb-16 scroll-mt-20">
                  <h2 className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
                    [{g.id.toUpperCase()}] <span className="text-[var(--v-ink)]">{g.title}</span> <span>({g.items.length})</span>
                  </h2>
                  <ul className="mt-8 space-y-10">
                    {g.items.map((t) => (
                      <li key={t.id}>
                        <ToolRow t={t} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            ) : (
              <pre className="pixel py-16 text-center text-[16px] leading-[16px] text-[var(--v-dim)]">{`0 results. try: shaders`}</pre>
            )}
            <Techniques />
          </div>
        </div>
      )}
    </>
  );
}

function ToolRow({ t }: { t: Tool }) {
  const uses = experiencesUsing(t.id);
  const first = uses[0];
  const [hot, setHot] = useState(false);
  const status = t.mcp?.status ?? 'library';
  return (
    <article
      id={t.id}
      className="group scroll-mt-20"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHot(true)}
      onPointerLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={(ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setHot(false);
      }}
    >
      <AsciiFrame title={t.id} right={status} className="!px-3 sm:!px-5">
        <div className={`grid gap-6 ${first ? 'xl:grid-cols-[260px_minmax(0,1fr)_300px]' : 'xl:grid-cols-[260px_minmax(0,1fr)]'} md:grid-cols-[220px_minmax(0,1fr)]`}>
          <Shot src={t.image ?? BANNER[t.category]} alt={`${t.name} website`} own={!!t.image} />

          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <h3 className="pixel text-[32px] leading-[32px]">{t.name}</h3>
              <span className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]" title={LEGEND[status]}>
                [{status}] · {t.cost}
              </span>
            </div>
            <dl className="mt-4 space-y-3 text-[16px] leading-[1.55]">
              <div>
                <dt className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">what</dt>
                <dd className="mt-1 text-[var(--v-ink)]">{t.what}</dd>
              </div>
              <div>
                <dt className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">when I reach for it</dt>
                <dd className="mt-1 text-[var(--v-soft)]">{t.when}</dd>
              </div>
            </dl>
            <InstallLine text={t.install} />
            <p className="pixel mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[16px] leading-[16px]">
              <a href={t.url} target="_blank" rel="noopener noreferrer" className={`hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`}>
                [{t.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} ↗]
              </a>
              {t.repo ? (
                <a href={`https://github.com/${t.repo}`} target="_blank" rel="noopener noreferrer" className={`text-[var(--v-soft)] hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`}>
                  [repo ↗]
                </a>
              ) : null}
            </p>
          </div>

          {first ? (
            <div className="min-w-0 md:col-span-2 xl:col-span-1">
              <LivePreview id={first.id} mode="hover" hot={hot} className="aspect-[16/10] w-full border border-[var(--v-steel)]" />
              <p className="pixel mt-3 text-[16px] leading-[16px] text-[var(--v-dim)]">make with it ({uses.length})</p>
              <MakeWithIt uses={uses} />
            </div>
          ) : (
            <div className="pixel text-[16px] leading-[16px] text-[var(--v-dim)] md:col-span-2 xl:col-span-2 xl:col-start-2">
              <p>┄ no experience yet ┄</p>
              <Link href="/docs/how-to" className={`mt-2 inline-block text-[var(--v-soft)] underline underline-offset-4 hover:text-[var(--v-ink)] ${ring}`}>
                read the how-to →
              </Link>
            </div>
          )}
        </div>
      </AsciiFrame>
    </article>
  );
}

/**
 * Full-colour screenshot with a pixel-to-HD reveal: a 32px mosaic resolves to the HD shot in
 * stepped jumps as soon as the card scrolls into view (hover replays it). Reduced motion: HD at once.
 */
function Shot({ src, alt, own }: { src: string; alt: string; own: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown(true), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative aspect-[16/10] w-full overflow-hidden border border-[var(--v-steel)] bg-[var(--v-surface)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/_next/image?url=${encodeURIComponent(src)}&w=32&q=75`}
        alt=""
        aria-hidden
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover object-top [image-rendering:pixelated]"
      />
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 767px) 100vw, 260px"
        loading="lazy"
        className={`object-cover object-top transition-opacity duration-[420ms] ease-[steps(4)] motion-reduce:opacity-100 ${shown ? 'opacity-100' : 'opacity-0'}`}
      />
      {!own ? (
        <span className="pixel absolute right-1 bottom-1 bg-[var(--v-bg)] px-1 text-[16px] leading-[16px] text-[var(--v-dim)]">chapter art</span>
      ) : null}
    </div>
  );
}

function InstallLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 flex items-stretch border border-[var(--v-steel)] bg-[var(--v-surface)]">
      <code className="min-w-0 flex-1 overflow-x-auto px-3 py-2 font-mono text-[14px] leading-[1.5] whitespace-nowrap text-[var(--v-ink)] [scrollbar-width:thin]">
        <span className="text-[var(--v-dim)] select-none">$ </span>
        {text}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          } catch {}
        }}
        className={`pixel shrink-0 border-l border-[var(--v-steel)] px-3 text-[16px] leading-[16px] text-[var(--v-soft)] hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`}
        aria-label={`Copy install line for ${text}`}
      >
        <span aria-live="polite">{copied ? '[copied]' : '[copy]'}</span>
      </button>
    </div>
  );
}

/** Every experience that uses a tool, as one wrapped line of links. Computed from the registry. */
function MakeWithIt({ uses }: { uses: ReturnType<typeof experiencesUsing> }) {
  return (
    <p className="pixel mt-2 text-[16px] leading-[24px] text-[var(--v-dim)]">
      {uses.map((e, i) => (
        <span key={e.id}>
          {i > 0 ? ' · ' : ''}
          <Link href={`/lab/${e.id}`} className={`text-[var(--v-soft)] underline-offset-4 hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`}>
            {e.title}
          </Link>
        </span>
      ))}
    </p>
  );
}

function Techniques() {
  return (
    <section id="techniques" className="scroll-mt-20">
      <h2 className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
        [TECHNIQUES] <span className="text-[var(--v-ink)]">No install, just the platform (and the three.js layer)</span>
      </h2>
      <ul className="mt-8 grid gap-6 md:grid-cols-2">
        {TECHNIQUES.map((t) => {
          const uses = experiencesUsing(t.id);
          return (
            <li key={t.id} id={t.id} className="scroll-mt-20">
              <AsciiFrame title={t.id} right={`${uses.length}/${catalog.length}`} className="h-full">
                <h3 className="pixel text-[32px] leading-[32px]">{t.name}</h3>
                <p className="mt-3 text-[16px] leading-[1.55] text-[var(--v-soft)]">{t.what}</p>
                {uses.length ? (
                  <>
                    <p className="pixel mt-4 text-[16px] leading-[16px] text-[var(--v-dim)]">make with it ({uses.length})</p>
                    <MakeWithIt uses={uses} />
                  </>
                ) : null}
              </AsciiFrame>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
