import Image from 'next/image';
import Link from 'next/link';
import { showcase } from '@/lib/showcase';

export function ShowcaseGrid({ mine = false }: { mine?: boolean }) {
  const items = showcase.filter((s) => Boolean(s.mine) === mine);
  return (
    <div className="not-prose my-8 grid gap-x-6 gap-y-12 sm:grid-cols-2">
      {items.map((s, i) => (
        <article key={s.id} className="group">
          <a href={s.url} target="_blank" rel="noreferrer" className="block">
            <div className="relative aspect-[16/10] overflow-hidden rounded-md border border-[var(--rule)] bg-[var(--color-fd-muted)]">
              <Image
                src={`/showcase/${s.id}.jpg`}
                alt={`Screenshot of ${s.name}`}
                fill
                sizes="(min-width: 640px) 45vw, 100vw"
                className="object-cover object-top transition-transform duration-700 ease-[var(--ease-out-quint)] group-hover:scale-[1.02]"
              />
            </div>
          </a>
          <div className="mt-4 flex items-baseline justify-between gap-3">
            <h3 data-display className="text-2xl">
              <span className="mr-2 font-mono text-xs text-[var(--text-soft)] tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>
              {s.name}
            </h3>
            <a href={s.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-[var(--text-soft)] underline-offset-4 hover:underline">
              Visit ↗
            </a>
          </div>
          <p className="mt-1 text-xs text-[var(--text-soft)]">by {s.by}</p>
          <p className="mt-3 text-[15px] leading-relaxed">{s.why}</p>
          <ul className="mt-3 space-y-1 text-sm text-[var(--text-soft)]">
            {s.lessons.map((l) => (
              <li key={l} className="flex gap-2">
                <span className="text-[var(--accent)]">→</span>
                {l}
              </li>
            ))}
          </ul>
          {s.mine && (
            <Link href={`/docs/case-studies/${s.id}`} className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
              Read the case study
            </Link>
          )}
        </article>
      ))}
    </div>
  );
}

export function Banner({ name, alt }: { name: string; alt: string }) {
  return (
    <div className="not-prose relative -mt-2 mb-8 aspect-[10/3] overflow-hidden rounded-md border border-[var(--rule)]">
      <Image src={`/banners/${name}.jpg`} alt={alt} fill priority sizes="100vw" className="object-cover" />
    </div>
  );
}

export function Shot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure className="not-prose my-6">
      <div className="relative aspect-[16/10] overflow-hidden rounded-md border border-[var(--rule)]">
        <Image src={src} alt={alt} fill sizes="(min-width: 768px) 700px, 100vw" className="object-cover object-top" />
      </div>
      {caption && <figcaption className="mt-2 text-xs text-[var(--text-soft)]">{caption}</figcaption>}
    </figure>
  );
}
