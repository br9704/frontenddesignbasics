/*
 * Specimen posters: full-bleed sheets in the style of a printed design manual.
 * They document this site's own v2 system (mono ground, pixel + editorial type, a colour finale),
 * so the guide shows its working. `invert` prints a white sheet for contrast between posters.
 */

function Poster({ children, invert = false, label }: { children: React.ReactNode; invert?: boolean; label: string }) {
  return (
    <section
      className={`not-prose relative my-10 overflow-hidden border p-6 sm:p-10 ${
        invert
          ? 'border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]'
          : 'border-[var(--v-steel)] bg-[var(--v-surface)] text-[var(--v-ink)]'
      }`}
    >
      <div className="pixel mb-8 flex items-center justify-between gap-4 text-[16px] leading-[16px] opacity-70">
        <span className="hidden sm:inline">┌─ frontend design basics · specimen</span>
        <span>{label} ─┐</span>
      </div>
      {children}
    </section>
  );
}

export function TypeSpecimen() {
  return (
    <Poster label="sheet 01 · type">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-display text-[clamp(7rem,22vw,15rem)] leading-[0.8] tracking-[-0.05em]">
            Aa<em className="text-[var(--v-soft)]">g</em>
          </p>
          <p className="mt-10 font-mono text-xs text-[var(--v-soft)]">Newsreader · editorial display · roman &amp; italic</p>
          <p className="pixel mt-8 text-[48px] leading-[48px]">[fdb] 8x16</p>
          <p className="mt-3 font-mono text-xs text-[var(--v-soft)]">Web IBM VGA 8x16 · pixel labels, nav, ASCII · 16px steps</p>
        </div>
        <div className="space-y-5">
          <p className="font-display text-4xl leading-tight tracking-[-0.02em]">
            The quick brown fox <em>considers</em> the lazy dog.
          </p>
          <p className="text-lg leading-relaxed">
            Schibsted Grotesk carries the reading. A newspaper grotesk: plain enough to disappear, with enough character that it
            never reads as a default.
          </p>
          <p className="font-mono text-sm">IBM Plex Mono · 0123456789 · {'{ code }'} · labels</p>
          <div className="pixel grid grid-cols-6 gap-2 border-t border-[var(--v-steel)] pt-5 text-[32px] leading-[32px]">
            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ&?!'.split('').slice(0, 18).map((c) => (
              <span key={c} className="text-center">
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Poster>
  );
}

const mono = [
  { name: 'bg', hex: '#080808', ink: '#f5f5f5', role: 'ground' },
  { name: 'surface', hex: '#0e0e0e', ink: '#f5f5f5', role: 'panels' },
  { name: 'line', hex: '#1a1a1a', ink: '#f5f5f5', role: 'hairlines' },
  { name: 'steel', hex: '#2c2c2c', ink: '#f5f5f5', role: 'borders' },
  { name: 'dim', hex: '#8a8a8a', ink: '#080808', role: 'labels' },
  { name: 'soft', hex: '#b0b0b0', ink: '#080808', role: 'soft text' },
  { name: 'ink', hex: '#f5f5f5', ink: '#080808', role: 'text' },
];

const finale = [
  { name: 'c-1', hex: '#ff2e00', ink: '#080808' },
  { name: 'c-2', hex: '#ff00a8', ink: '#080808' },
  { name: 'c-3', hex: '#7b2cff', ink: '#ffffff' },
  { name: 'c-4', hex: '#00b3ff', ink: '#080808' },
  { name: 'c-5', hex: '#00e676', ink: '#080808' },
  { name: 'c-6', hex: '#ffe600', ink: '#080808' },
];

export function PaletteSheet() {
  return (
    <Poster label="sheet 02 · colour">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {mono.map((s) => (
          <div key={s.hex} className="overflow-hidden border border-[var(--v-steel)]">
            <div className="flex aspect-[3/4] flex-col justify-between p-3" style={{ background: s.hex, color: s.ink }}>
              <span className="pixel text-[16px] leading-[16px] opacity-80">{s.role}</span>
              <span className="font-display text-3xl leading-none">Aa</span>
            </div>
            <div className="border-t border-[var(--v-steel)] bg-[var(--v-bg)] p-2.5 text-[11px] leading-tight">
              <p className="font-medium">--v-{s.name}</p>
              <p className="font-mono text-[var(--v-soft)]">{s.hex}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="pixel mt-8 mb-3 text-[16px] leading-[16px] text-[var(--v-dim)]">── finale: crazy colour ──</p>
      <div className="grid grid-cols-3 sm:grid-cols-6">
        {finale.map((s) => (
          <div key={s.hex} className="flex aspect-[4/3] flex-col justify-between p-3" style={{ background: s.hex, color: s.ink }}>
            <span className="pixel text-[16px] leading-[16px]">{s.name}</span>
            <span className="font-mono text-[11px]">{s.hex}</span>
          </div>
        ))}
      </div>
      <p className="mt-6 max-w-[60ch] text-sm text-[var(--v-soft)]">
        Seven greys do almost all the work. Colour is saved for the end of the journey, where it arrives all at once. Text on
        colour is always near-black or white, whichever passes 4.5:1.
      </p>
    </Poster>
  );
}

export function MotionPoster() {
  const rows = [
    { name: 'Press', ms: 120, curve: 'ease-out' },
    { name: 'Menu', ms: 200, curve: 'ease-out' },
    { name: 'Modal', ms: 320, curve: 'ease-out' },
    { name: 'Page section', ms: 400, curve: 'ease-in-out' },
    { name: 'Hero intro', ms: 800, curve: 'expo.out' },
  ];
  return (
    <Poster invert label="sheet 03 · motion">
      <p className="font-display text-[clamp(3rem,9vw,6.5rem)] leading-[0.9] tracking-[-0.03em]">
        Snappy <em>beats</em> smooth.
      </p>
      <div className="mt-10 space-y-3">
        {rows.map((r) => (
          <div key={r.name} className="grid grid-cols-[5.5rem_1fr_7.5rem] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr_10rem] sm:gap-4">
            <span>{r.name}</span>
            <div className="h-2 bg-[var(--v-bg)]/10">
              <div className="h-2 bg-[var(--v-bg)]" style={{ width: `${(r.ms / 800) * 100}%` }} />
            </div>
            <span className="text-right font-mono text-[11px] whitespace-nowrap tabular-nums opacity-80 sm:text-xs">
              {r.ms}ms · {r.curve}
            </span>
          </div>
        ))}
      </div>
    </Poster>
  );
}
