import Link from 'next/link';
import { VIEWS, ring, type ViewId } from './views';

/** The Sites | Design systems | Breakdowns | How to think switch. Plain links, so each view is its own URL. */
export function ViewSwitch({ current }: { current: ViewId }) {
  return (
    <nav aria-label="Examples views" className="border-y border-[var(--v-line)]">
      <ul className="flex flex-wrap gap-x-1 gap-y-1 py-2">
        {VIEWS.map((v) => {
          const on = v.id === current;
          return (
            <li key={v.id}>
              <Link
                href={v.id === 'sites' ? '/examples' : `/examples?view=${v.id}`}
                aria-current={on ? 'page' : undefined}
                scroll={false}
                className={`pixel inline-block px-2 py-2 text-[16px] leading-[16px] ${ring} ${
                  on ? 'bg-[var(--v-ink)] text-[var(--v-bg)]' : 'text-[var(--v-soft)] hover:bg-[var(--v-steel)] hover:text-[var(--v-ink)]'
                }`}
              >
                {on ? `[${v.label}]` : v.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
