'use client';

import Link from 'next/link';
import { AsciiFrame } from './ascii-frame';
import { BuiltWith } from './experience-frame';
import { getEntry } from './make-data';
import { LivePreview } from './make-live';

/** The live experience(s) that demonstrate a principle. Unknown ids are skipped quietly. */
export function InspirationLive({ ids }: { ids: string[] }) {
  const entries = ids.map(getEntry).filter((e): e is NonNullable<typeof e> => !!e);
  if (!entries.length)
    return (
      <AsciiFrame title="live" right="none yet" className="grid place-items-center">
        <pre className="pixel py-10 text-center text-[16px] leading-[16px] text-[var(--v-dim)]">
          {`no live piece for this one yet.\nthe screenshots below carry it.`}
        </pre>
      </AsciiFrame>
    );
  return (
    <div className={`grid gap-6 ${entries.length > 1 ? 'sm:grid-cols-2' : ''}`}>
      {entries.map((e) => (
        <AsciiFrame key={e.id} title="live" right={e.id} className="!px-3 !pb-3">
          <LivePreview id={e.id} className="aspect-[16/10] w-full" />
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <p className="pixel truncate text-[16px] leading-[16px]">{e.title}</p>
            <Link
              href={`/lab/${e.id}`}
              className="pixel shrink-0 text-[16px] leading-[16px] outline-none hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]"
            >
              [open ↗]
            </Link>
          </div>
          <BuiltWith tools={e.tools} className="mt-2" />
        </AsciiFrame>
      ))}
    </div>
  );
}
