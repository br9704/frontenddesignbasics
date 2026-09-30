'use client';

import { useSyncExternalStore } from 'react';
import { ACTS } from './acts';
import { activeAct, overall, scrollToAct } from './runtime';

/*
 * The progress rail. Fixed on the left on desktop, a bottom bar on phones. The active label is
 * inverted; the skin follows the stage: bevelled in 00-01, mono in 02-04, #080808 on colour from 05.
 */

const useStore = (s: typeof activeAct, q = 1) =>
  useSyncExternalStore(
    s.subscribe,
    () => Math.round(s.get() * q) / q,
    () => 0,
  );

function Bar({ v, cells = 8 }: { v: number; cells?: number }) {
  const n = Math.round(v * cells);
  return <span>[{'█'.repeat(n) + '░'.repeat(cells - n)}]</span>;
}

export function Rail() {
  const act = useStore(activeAct);
  const all = useStore(overall, 8);
  const stage = ACTS[act]?.stage ?? 'win95';

  const skin =
    stage === 'win95'
      ? 'bg-w-face text-black [box-shadow:var(--w-bevel-out)]'
      : stage === 'mono'
        ? 'bg-[var(--v-bg)] text-[var(--v-soft)] border border-[var(--v-steel)]'
        : 'bg-[#080808] text-[#f5f5f5]';
  const on = stage === 'win95' ? 'bg-black text-white' : 'bg-[var(--v-ink)] text-[var(--v-bg)]';

  return (
    <>
      <nav aria-label="Journey" className={`pixel fixed top-1/2 left-3 z-40 hidden -translate-y-1/2 p-1 text-[16px] leading-[16px] lg:block ${skin}`}>
        <ol>
          {ACTS.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => scrollToAct(a.id)}
                aria-current={i === act ? 'step' : undefined}
                className={`block w-full px-1 py-[3px] text-left whitespace-nowrap ${i === act ? on : 'hover:underline'}`}
              >
                [{a.n} {a.title}]
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-1 px-1 py-[3px]">
          <Bar v={all} />
        </p>
      </nav>

      <nav aria-label="Journey" className={`pixel fixed inset-x-0 bottom-0 z-40 flex h-10 items-center justify-between gap-2 px-2 text-[16px] leading-[16px] lg:hidden ${skin}`}>
        <button type="button" aria-label="Previous act" className="px-2 py-2" onClick={() => scrollToAct(ACTS[Math.max(0, act - 1)].id)}>
          ◂
        </button>
        <span className={`px-1 ${on}`}>
          [{ACTS[act].n} {ACTS[act].title}]
        </span>
        <Bar v={all} cells={6} />
        <button type="button" aria-label="Next act" className="px-2 py-2" onClick={() => scrollToAct(ACTS[Math.min(ACTS.length - 1, act + 1)].id)}>
          ▸
        </button>
      </nav>
    </>
  );
}
