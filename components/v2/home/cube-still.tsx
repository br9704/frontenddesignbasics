import Link from 'next/link';
import { type CubeCard, FACES } from './cube-beats';

/*
 * The cube act with motion reduced, or without the 3D: the net laid flat as six real links, then the
 * 30 pieces as a plain poster grid. Plain HTML, no canvas, nothing pinned.
 */

export function PixelIcon({ rows, className = '' }: { rows: string[]; className?: string }) {
  return (
    <svg viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden className={className}>
      {rows.flatMap((r, y) => [...r].map((b, x) => (b === '1' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null)))}
    </svg>
  );
}

/* Cross net: front in the middle, top above, bottom below, left and right beside, back at the far right
   (a column on phones, back under the bottom). Grid cells as [col, row] for both layouts. */
const WIDE: [number, number][] = [
  [2, 2], [2, 1], [3, 2], [2, 3], [1, 2], [4, 2],
];
const TALL: [number, number][] = [
  [2, 2], [2, 1], [3, 2], [2, 3], [1, 2], [2, 4],
];

export function NetFace({ i, count, className = '', style }: { i: number; count: number; className?: string; style?: React.CSSProperties }) {
  const f = FACES[i];
  return (
    <Link
      href={`/tools#cat-${f.cat}`}
      style={style}
      aria-label={`${f.label.toLowerCase()}: ${count} tools`}
      className={`group flex aspect-square flex-col justify-between border border-[var(--v-bg)] bg-[#ececec] p-2 text-[#101010] transition-transform duration-150 hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)] motion-reduce:transition-none sm:p-3 ${className}`}
    >
      <span className="pixel text-[16px] leading-[16px] text-[#555]">0{i + 1}</span>
      <PixelIcon rows={f.icon} className="mx-auto h-8 w-8 sm:h-10 sm:w-10" />
      <span>
        <span className="pixel block truncate text-[16px] leading-[16px]">{f.label}</span>
        <span className="pixel block text-[16px] leading-[16px] text-[#555]">{count} tools</span>
      </span>
    </Link>
  );
}

export function CubeStill({ counts, cards }: { counts: number[]; cards: CubeCard[] }) {
  return (
    <div className="space-y-10">
      <div>
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[NET] six faces, six jobs</p>
        {/* phones: 3 by 4 */}
        <div className="mt-4 grid max-w-[360px] grid-cols-3 gap-1 sm:hidden">
          {FACES.map((_, i) => (
            <NetFace key={i} i={i} count={counts[i]} style={{ gridColumn: TALL[i][0], gridRow: TALL[i][1] }} />
          ))}
        </div>
        {/* wider: 4 by 3 */}
        <div className="mt-4 hidden max-w-[640px] grid-cols-4 gap-1 sm:grid">
          {FACES.map((_, i) => (
            <NetFace key={i} i={i} count={counts[i]} style={{ gridColumn: WIDE[i][0], gridRow: WIDE[i][1] }} />
          ))}
        </div>
      </div>
      <div>
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[30] one card per piece on this site</p>
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {cards.map((c) => (
            <li key={c.id}>
              <Link href={`/lab/${c.id}`} className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/posters/${c.id}.webp`} alt="" loading="lazy" decoding="async" className="aspect-[16/10] w-full object-cover grayscale group-hover:grayscale-0" />
                <span className="pixel mt-1 block truncate text-[16px] leading-[16px] text-[var(--v-soft)] group-hover:text-[var(--v-ink)]">{c.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
