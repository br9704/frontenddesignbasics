import type { ReactNode } from 'react';
import { Stage } from './b-kit';

/* Visual design stills, V1 to V7. Server components: composed stills and CSS only. */

function Tag({ children }: { children: ReactNode }) {
  return <p className="pixel mb-2 text-[16px] leading-[16px] text-[var(--v-dim)]">{children}</p>;
}

/* V1 One big thing per view. Each layout is shown sharp, then blurred as if squinting. */

function MiniPage({ loud }: { loud: boolean }) {
  return (
    <div aria-hidden="true" className="flex h-[132px] flex-col gap-2 bg-[var(--v-bg)] p-3">
      {loud ? (
        <>
          <div className="flex gap-2">
            <span className="h-5 flex-1 bg-[var(--v-ink)]" />
            <span className="h-5 flex-1 bg-[var(--v-ink)]" />
          </div>
          <div className="flex flex-1 gap-2">
            <span className="flex-1 bg-[var(--v-soft)]" />
            <span className="flex-1 bg-[var(--v-ink)]" />
            <span className="flex-1 bg-[var(--v-soft)]" />
          </div>
          <div className="flex gap-2">
            <span className="h-5 flex-1 bg-[var(--v-ink)]" />
            <span className="h-5 flex-1 bg-[var(--v-soft)]" />
            <span className="h-5 flex-1 bg-[var(--v-ink)]" />
          </div>
        </>
      ) : (
        <>
          <span className="h-2 w-1/4 bg-[var(--v-steel)]" />
          <span className="mt-1 h-10 w-4/5 bg-[var(--v-ink)]" />
          <span className="h-2 w-2/3 bg-[var(--v-steel)]" />
          <span className="h-2 w-1/2 bg-[var(--v-steel)]" />
          <span className="mt-auto h-5 w-20 border border-[var(--v-soft)]" />
        </>
      )}
    </div>
  );
}

export function SquintStill() {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {[true, false].map((loud) => (
          <figure key={String(loud)} className="min-w-0">
            <Tag>{loud ? 'EVERYTHING SHOUTS' : 'ONE BIG THING'}</Tag>
            <div className="grid grid-cols-1 gap-2">
              <div className="border border-[var(--v-line)]">
                <MiniPage loud={loud} />
              </div>
              <div className="border border-[var(--v-line)] [filter:blur(6px)]" aria-hidden="true">
                <MiniPage loud={loud} />
              </div>
            </div>
            <figcaption className="mt-2 text-[13px] leading-[1.4] text-[var(--v-soft)]">
              {loud ? 'Squinted (below): a grey mush. Nothing leads.' : 'Squinted (below): the headline still wins.'}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/* V2 Type from a scale, set for reading */

const RATIO = 1.25;
const SCALE = [-1, 0, 1, 2, 3, 4].map((n) => Math.round(16 * Math.pow(RATIO, n)));

export function TypeScaleStill() {
  return (
    <Stage label={`SCALE 16PX × ${RATIO}`}>
      <ul className="space-y-1">
        {[...SCALE].reverse().map((s) => (
          <li key={s} className="flex items-baseline gap-3 overflow-hidden">
            <span className="pixel w-[48px] shrink-0 text-[16px] leading-[16px] text-[var(--v-dim)]">{s}</span>
            <span className="font-display truncate leading-[1.1] text-[var(--v-ink)]" style={{ fontSize: s }}>
              Reading comes first
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-[var(--v-line)] pt-3">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">MEASURE 60 TO 70 CHARACTERS</p>
        <p className="mt-2 max-w-[62ch] text-[15px] leading-[1.6] text-[var(--v-soft)]">
          Body text sits at 17px with 1.6 line height. A line that runs past about seventy characters makes your eye hunt for the
          start of the next one, so I cap the measure.
        </p>
      </div>
    </Stage>
  );
}

/* V3 Mostly neutral, one accent. Colour is allowed here. */

const RAMP = [0.97, 0.9, 0.8, 0.7, 0.62, 0.52, 0.42, 0.32, 0.22];

export function AccentStill() {
  return (
    <Stage label="COLOUR BUDGET">
      <div className="flex h-6 w-full" role="img" aria-label="Colour budget: 88% neutral, 10% steel, 2% accent">
        <span className="bg-[var(--v-bg)] outline outline-1 outline-[var(--v-steel)]" style={{ width: '60%' }} />
        <span className="bg-[var(--v-surface)]" style={{ width: '28%' }} />
        <span className="bg-[var(--v-steel)]" style={{ width: '10%' }} />
        <span className="bg-[var(--c-1)]" style={{ width: '2%' }} />
      </div>
      <p className="pixel mt-2 text-[16px] leading-[16px] text-[var(--v-dim)]">88 NEUTRAL · 10 STEEL · 2 ACCENT</p>
      <div className="mt-4 flex items-center justify-between gap-3 border border-[var(--v-line)] bg-[var(--v-bg)] p-3" aria-hidden="true">
        <span className="min-w-0">
          <span className="block h-2 w-24 bg-[var(--v-steel)]" />
          <span className="mt-2 block h-2 w-16 bg-[var(--v-steel)]" />
        </span>
        <span className="shrink-0 bg-[var(--c-1)] px-3 py-1 text-[13px] text-[#080808]">Buy now</span>
      </div>
      <p className="pixel mt-4 text-[16px] leading-[16px] text-[var(--v-dim)]">OKLCH RAMP · HUE 35</p>
      <div className="mt-2 grid grid-cols-9" role="img" aria-label="Nine steps of one hue in OKLCH, light to dark, with even perceived steps">
        {RAMP.map((l) => (
          <span key={l} className="h-8" style={{ background: `oklch(${l} ${Math.min(0.2, 0.05 + (1 - Math.abs(l - 0.6)) * 0.12).toFixed(3)} 35)` }} />
        ))}
      </div>
    </Stage>
  );
}

/* V4 Contrast is measured: ratios computed here, at build time */

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function ratio(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const PAIRS = [
  { fg: '#f5f5f5', bg: '#080808', name: 'ink' },
  { fg: '#b0b0b0', bg: '#080808', name: 'soft' },
  { fg: '#8a8a8a', bg: '#080808', name: 'dim' },
  { fg: '#555555', bg: '#080808', name: 'too dim' },
  { fg: '#2c2c2c', bg: '#080808', name: 'steel' },
];

export function ContrastStill() {
  return (
    <Stage label="WCAG RATIO ON #080808">
      <ul className="space-y-2">
        {PAIRS.map((p) => {
          const r = ratio(p.fg, p.bg);
          const grade = r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'LARGE ONLY' : 'FAIL';
          return (
            <li key={p.fg} className="flex items-center gap-3 bg-[var(--v-bg)] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: p.fg }}>
                Body text in {p.name}
              </span>
              <span className="pixel shrink-0 text-right text-[16px] leading-[16px] text-[var(--v-soft)] tabular-nums">
                {r.toFixed(1)}:1
              </span>
              <span
                className={`pixel w-[88px] shrink-0 text-right text-[16px] leading-[16px] ${
                  grade === 'FAIL' ? 'text-[var(--v-dim)] line-through' : 'text-[var(--v-ink)]'
                }`}
              >
                {grade}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[13px] leading-[1.4] text-[var(--v-dim)]">Body text needs 4.5:1. I check the number, not my screen.</p>
    </Stage>
  );
}

/* V5 Space groups things */

function Field({ gap }: { gap: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      <span className="h-2 w-12 bg-[var(--v-soft)]" />
      <span className="h-6 w-full border border-[var(--v-steel)]" />
    </div>
  );
}

export function SpaceStill() {
  const forms = [
    { name: 'EVEN GAPS', inner: 12, outer: 12, note: 'Which label goes with which box?' },
    { name: 'INNER < OUTER', inner: 4, outer: 20, note: 'Each label hugs its box.' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {forms.map((f) => (
        <figure key={f.name} className="min-w-0">
          <Tag>{f.name}</Tag>
          <div aria-hidden="true" className="border border-[var(--v-line)] bg-[var(--v-surface)] p-3" style={{ display: 'flex', flexDirection: 'column', gap: f.outer }}>
            <Field gap={f.inner} />
            <Field gap={f.inner} />
            <Field gap={f.inner} />
          </div>
          <figcaption className="mt-2 text-[13px] leading-[1.4] text-[var(--v-soft)]">
            {f.inner}px in, {f.outer}px out. {f.note}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/* V6 Depth tells you what floats */

export function DepthStill() {
  return (
    <Stage className="h-[220px]" label="THREE LEVELS">
      <div aria-hidden="true" className="absolute inset-x-4 top-12 bottom-4 border border-[var(--v-line)] bg-[var(--v-bg)] p-3">
        <span className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">0 PAGE</span>
        <div className="absolute top-10 left-4 w-[62%] border border-[var(--v-steel)] bg-[var(--v-surface)] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
          <span className="pixel text-[16px] leading-[16px] text-[var(--v-soft)]">1 CARD</span>
          <span className="mt-2 block h-2 w-3/4 bg-[var(--v-steel)]" />
        </div>
        <div className="absolute right-4 bottom-4 w-[48%] border border-[var(--v-dim)] bg-[#1c1c1c] p-3 shadow-[0_24px_48px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.04)]">
          <span className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">2 MENU</span>
          <span className="mt-2 block h-2 w-2/3 bg-[var(--v-soft)]" />
        </div>
      </div>
      <p className="sr-only">A page, a card raised one level with a soft shadow, and a menu raised two levels with a lighter surface and a deeper shadow.</p>
    </Stage>
  );
}

/* V7 Concentric corners */

export function CornersStill() {
  const pad = 8;
  const outer = 20;
  const cases = [
    { name: 'SAME RADIUS', inner: outer, note: `${outer} inside ${outer}: the gap bulges at the corner.` },
    { name: 'OUTER = INNER + PAD', inner: outer - pad, note: `${outer} = ${outer - pad} + ${pad}: the gap stays even.` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {cases.map((c) => (
        <figure key={c.name} className="min-w-0">
          <Tag>{c.name}</Tag>
          <div aria-hidden="true" className="flex h-[120px] items-center justify-center bg-[var(--v-surface)]">
            <div className="h-[88px] w-[88%] max-w-[160px] border border-[var(--v-soft)]" style={{ borderRadius: outer, padding: pad }}>
              <div className="h-full w-full bg-[var(--v-ink)]" style={{ borderRadius: c.inner }} />
            </div>
          </div>
          <figcaption className="mt-2 text-[13px] leading-[1.4] text-[var(--v-soft)]">{c.note}</figcaption>
        </figure>
      ))}
    </div>
  );
}
