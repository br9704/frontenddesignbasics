export const VIEWS = [
  { id: 'sites', label: 'Sites' },
  { id: 'systems', label: 'Design systems' },
  { id: 'breakdowns', label: 'Breakdowns' },
  { id: 'think', label: 'How to think' },
] as const;

export type ViewId = (typeof VIEWS)[number]['id'];

export function parseView(v: string | string[] | undefined): ViewId {
  const s = Array.isArray(v) ? v[0] : v;
  return VIEWS.some((x) => x.id === s) ? (s as ViewId) : 'sites';
}

export const ring = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]';
