import { toolName } from './data';

export const ring = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]';

/** A tool name that jumps to its entry in the catalogue further down the page. */
export function ToolChip({ id, strong = false }: { id: string; strong?: boolean }) {
  return (
    <a
      href={`#${id}`}
      className={`pixel inline-block border px-2 py-1 text-[16px] leading-[16px] transition-colors hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${
        strong ? 'border-[var(--v-ink)] text-[var(--v-ink)]' : 'border-[var(--v-steel)] text-[var(--v-soft)]'
      } ${ring}`}
    >
      {toolName(id)}
    </a>
  );
}
