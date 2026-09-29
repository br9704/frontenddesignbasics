/*
 * Diagrams: plain SVG and CSS, no images. They inherit the theme through CSS variables,
 * so they work in light and dark, and they stack vertically on phones.
 */
import type { ReactNode } from 'react';

function Figure({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <figure className="not-prose my-8">
      <div className="overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--surface-raised)] p-5 sm:p-7">{children}</div>
      {caption && <figcaption className="mt-2 text-xs text-[var(--text-soft)]">{caption}</figcaption>}
    </figure>
  );
}

/* A flow of labelled steps with arrows. Horizontal on desktop, vertical on phones. */
export function Flow({
  steps,
  caption,
}: {
  steps: { title: string; note?: string; tone?: 'accent' | 'ink' | 'plain' }[];
  caption?: string;
}) {
  return (
    <Figure caption={caption}>
      <ol className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-stretch">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col items-center gap-2 sm:flex-1 sm:flex-row">
            <div
              className={`w-full flex-1 rounded-md border px-3 py-3 ${
                s.tone === 'accent'
                  ? 'border-transparent bg-[var(--accent)] text-white'
                  : s.tone === 'ink'
                    ? 'border-transparent bg-[var(--text)] text-[var(--surface)]'
                    : 'border-[var(--rule)] bg-[var(--surface)]'
              }`}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] opacity-60">{String(i + 1).padStart(2, '0')}</p>
              <p className="mt-1 text-sm font-medium leading-snug">{s.title}</p>
              {s.note && <p className="mt-1 text-xs leading-snug opacity-75">{s.note}</p>}
            </div>
            {i < steps.length - 1 && (
              <span aria-hidden className="shrink-0 text-[var(--text-soft)] sm:px-0.5">
                <span className="sm:hidden">↓</span>
                <span className="hidden sm:inline">→</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </Figure>
  );
}

/* Cubic-bezier plots: see the shape of each curve, not just its name. */
const curves: { name: string; p: [number, number, number, number]; note: string }[] = [
  { name: 'ease-out', p: [0.22, 1, 0.36, 1], note: 'UI enters & responds' },
  { name: 'ease-in-out', p: [0.65, 0, 0.35, 1], note: 'moves across screen' },
  { name: 'ease-in', p: [0.55, 0, 1, 0.45], note: 'exits only' },
  { name: 'overshoot', p: [0.34, 1.56, 0.64, 1], note: 'playful, use rarely' },
];
export function EasingCurves() {
  const S = 120;
  return (
    <Figure caption="Time runs left to right, progress bottom to top. A curve that rises fast early (ease-out) feels responsive, because the change is visible immediately.">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        {curves.map(({ name, p, note }) => {
          const [x1, y1, x2, y2] = p;
          const path = `M0 ${S} C ${x1 * S} ${S - y1 * S}, ${x2 * S} ${S - y2 * S}, ${S} 0`;
          return (
            <div key={name} className="flex flex-col items-center gap-2">
              <svg viewBox={`-10 -30 ${S + 20} ${S + 40}`} className="w-full max-w-[150px]" role="img" aria-label={`${name} curve`}>
                <rect x="0" y="0" width={S} height={S} fill="none" stroke="var(--rule)" />
                <line x1="0" y1={S} x2={S} y2="0" stroke="var(--rule)" strokeDasharray="3 4" />
                <line x1="0" y1={S} x2={x1 * S} y2={S - y1 * S} stroke="var(--text-soft)" strokeWidth="1" />
                <line x1={S} y1="0" x2={x2 * S} y2={S - y2 * S} stroke="var(--text-soft)" strokeWidth="1" />
                <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
                <circle cx={x1 * S} cy={S - y1 * S} r="3.5" fill="var(--text)" />
                <circle cx={x2 * S} cy={S - y2 * S} r="3.5" fill="var(--text)" />
              </svg>
              <p className="font-mono text-xs">{name}</p>
              <p className="-mt-1 text-[11px] text-[var(--text-soft)]">{note}</p>
            </div>
          );
        })}
      </div>
    </Figure>
  );
}

/* Colour as a budget: 90 / 8 / 2. */
export function ColourBudget() {
  const parts = [
    { pct: 90, label: 'Neutrals', note: 'background, surfaces, text, rules', bg: 'var(--color-fd-muted)', fg: 'var(--text)' },
    { pct: 8, label: 'Accent', note: 'actions, focus, the one number', bg: 'var(--accent)', fg: '#fff' },
    { pct: 2, label: 'Semantic', note: 'success · warning · danger', bg: '#1f7a4d', fg: '#fff' },
  ];
  return (
    <Figure caption="Treat colour as a budget, not a palette. If the accent is spent everywhere, it stops meaning anything.">
      <div className="flex h-16 overflow-hidden rounded-md">
        {parts.map((p) => (
          <div key={p.label} style={{ flexBasis: `${p.pct}%`, background: p.bg, color: p.fg }} className="flex min-w-[28px] items-end p-2">
            <span className="font-mono text-[11px]">{p.pct}%</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {parts.map((p) => (
          <div key={p.label} className="flex gap-3">
            <span className="mt-1 size-3 shrink-0 rounded-sm" style={{ background: p.bg, outline: '1px solid var(--rule)' }} />
            <div>
              <p className="text-sm font-medium">{p.label}</p>
              <p className="text-xs text-[var(--text-soft)]">{p.note}</p>
            </div>
          </div>
        ))}
      </div>
    </Figure>
  );
}

/* Proximity: the gap between groups must be clearly bigger than the gap inside them. */
export function ProximityDiagram() {
  const Card = ({ gap }: { gap: number }) => (
    <div className="flex flex-col" style={{ gap: gap }}>
      {[0, 1].map((g) => (
        <div key={g} className="flex flex-col gap-1.5">
          <div className="h-3 w-3/4 rounded-sm bg-[var(--text)]" />
          <div className="h-2 w-full rounded-sm bg-[var(--text-soft)] opacity-50" />
          <div className="h-2 w-5/6 rounded-sm bg-[var(--text-soft)] opacity-50" />
        </div>
      ))}
    </div>
  );
  return (
    <Figure caption="Left: groups separated by 6px, the same as the gap inside them, so the eye can't find the structure. Right: 32px between groups, so there are clearly two ideas.">
      <div className="grid grid-cols-2 gap-8">
        <div>
          <p className="mb-3 font-mono text-[11px] text-[var(--text-soft)]">✕ equal gaps</p>
          <Card gap={6} />
        </div>
        <div>
          <p className="mb-3 font-mono text-[11px] text-[var(--accent)]">✓ grouped</p>
          <Card gap={32} />
        </div>
      </div>
    </Figure>
  );
}

/* Hierarchy: one big thing per view. */
export function HierarchyDiagram() {
  return (
    <Figure caption="Same content, two rankings. On the right, size, weight and one accent decide the reading order before a word is read.">
      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <p className="mb-3 font-mono text-[11px] text-[var(--text-soft)]">✕ everything shouts</p>
          <div className="space-y-2">
            {['w-4/5', 'w-3/4', 'w-4/5', 'w-2/3'].map((w, i) => (
              <div key={i} className={`h-4 ${w} rounded-sm bg-[var(--text)]`} />
            ))}
            <div className="flex gap-2 pt-1">
              <div className="h-7 w-20 rounded bg-[var(--accent)]" />
              <div className="h-7 w-20 rounded bg-[var(--accent)]" />
              <div className="h-7 w-20 rounded bg-[var(--accent)]" />
            </div>
          </div>
        </div>
        <div>
          <p className="mb-3 font-mono text-[11px] text-[var(--accent)]">✓ one big thing</p>
          <div className="space-y-2">
            <div className="h-9 w-4/5 rounded-sm bg-[var(--text)]" />
            <div className="h-2 w-3/4 rounded-sm bg-[var(--text-soft)] opacity-50" />
            <div className="h-2 w-2/3 rounded-sm bg-[var(--text-soft)] opacity-50" />
            <div className="flex gap-2 pt-2">
              <div className="h-7 w-24 rounded bg-[var(--accent)]" />
              <div className="h-7 w-20 rounded border border-[var(--rule)]" />
            </div>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* Type scale ladder: sizes as bars so the ratio is visible. */
export function ScaleLadder({ ratio = 1.333, base = 16 }: { ratio?: number; base?: number }) {
  const steps = [-1, 0, 1, 2, 3, 4];
  const sizes = steps.map((n) => base * ratio ** n);
  const max = sizes[sizes.length - 1];
  return (
    <Figure caption={`A ${ratio} scale from a ${base}px base. Every step is the previous one × ${ratio}, so the jump between neighbours always feels the same.`}>
      <div className="flex items-end gap-3">
        {sizes.map((px, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end gap-2">
            <span className="font-display leading-none" style={{ fontSize: Math.min(px, 64) }}>
              Aa
            </span>
            <div className="w-full rounded-t-sm bg-[var(--accent)]" style={{ height: Math.round((px / max) * 96), opacity: 0.35 + i * 0.12 }} />
            <span className="font-mono text-[10px] text-[var(--text-soft)] tabular-nums">{Math.round(px)}</span>
          </div>
        ))}
      </div>
    </Figure>
  );
}

/* Decision tree for "should this be 3D?" */
export function Decision({ question, branches, caption }: { question: string; branches: { if: string; then: string }[]; caption?: string }) {
  return (
    <Figure caption={caption}>
      <div className="flex flex-col items-center">
        <div className="rounded-md bg-[var(--text)] px-4 py-2.5 text-center text-sm font-medium text-[var(--surface)]">{question}</div>
        <div className="h-5 w-px bg-[var(--rule)]" />
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {branches.map((b) => (
            <div key={b.if} className="rounded-md border border-[var(--rule)] bg-[var(--surface)] p-3">
              <p className="text-xs text-[var(--text-soft)]">if {b.if}</p>
              <p className="mt-1 text-sm font-medium">→ {b.then}</p>
            </div>
          ))}
        </div>
      </div>
    </Figure>
  );
}

/* Prompt anatomy: the parts of a production image prompt, colour-coded. */
export function PromptAnatomy() {
  const parts = [
    { k: 'Canvas', v: '16:9 hero background, text will sit on the left third', c: '#2f4ec2' },
    { k: 'Ground', v: 'warm paper #F2EEE6 with visible grain', c: '#1f7a4d' },
    { k: 'Zones', v: 'ink concentrated right; left 40% stays clean for type', c: '#b8860b' },
    { k: 'Subject', v: 'two riso inks #FF5C1F + #2F4EC2 drifting in water', c: 'var(--accent)' },
    { k: 'Style lock', v: 'flat, printed, tactile, soft misregistration', c: '#8a5a44' },
    { k: 'Safety', v: 'no text, no people, no logos', c: '#6b6457' },
  ];
  return (
    <Figure caption="A production prompt reads like a layout spec: canvas, ground, zones, subject, style and safety, each on its own line. Hex values beat colour names.">
      <div className="space-y-2 font-mono text-[13px] leading-relaxed">
        {parts.map((p) => (
          <div key={p.k} className="grid gap-x-4 sm:grid-cols-[7.5rem_1fr]">
            <span className="font-medium" style={{ color: p.c }}>
              {p.k}
            </span>
            <span className="border-l-2 pl-3" style={{ borderColor: p.c }}>
              {p.v}
            </span>
          </div>
        ))}
      </div>
    </Figure>
  );
}

/* The page template every chapter follows. */
export function PageTemplate() {
  return (
    <Flow
      caption="The template every page in this guide follows, borrowed from the most successful docs sites (shadcn, React Bits, The Book of Shaders)."
      steps={[
        { title: 'See it', note: 'a live demo first', tone: 'accent' },
        { title: 'Read the code', note: 'short, copyable' },
        { title: 'Install it', note: 'package, registry or MCP' },
        { title: 'Know why', note: 'the principle underneath', tone: 'ink' },
      ]}
    />
  );
}
