/*
 * Specimen posters: full-bleed sheets in the style of a printed design manual.
 * They document this site's own system, so the guide shows its working.
 */

function Poster({ children, dark = false, label }: { children: React.ReactNode; dark?: boolean; label: string }) {
  return (
    <section
      className={`not-prose relative my-10 overflow-hidden rounded-xl p-6 sm:p-10 ${
        dark ? 'bg-[#16140f] text-[#ece6da]' : 'bg-[#f2eee6] text-[#16140f]'
      }`}
      style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' }}
    >
      <div className="mb-8 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] opacity-70">
        <span className="hidden sm:inline">Frontend Design Basics · Specimen</span>
        <span>{label}</span>
      </div>
      {children}
    </section>
  );
}

export function TypeSpecimen() {
  return (
    <Poster label="Sheet 01 · Type">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-display text-[clamp(7rem,22vw,15rem)] leading-[0.8] tracking-[-0.05em]">
            Aa<em className="text-[#d9431a]">g</em>
          </p>
          <p className="mt-10 font-mono text-xs">Newsreader · display · 400–600 · roman &amp; italic</p>
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
          <div className="grid grid-cols-6 gap-2 border-t border-current/15 pt-5 font-display text-2xl">
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

const swatches = [
  { name: 'Paper', hex: '#f2eee6', ink: '#16140f', role: 'ground' },
  { name: 'Paper 2', hex: '#e8e2d6', ink: '#16140f', role: 'surface' },
  { name: 'Ink', hex: '#16140f', ink: '#f2eee6', role: 'text' },
  { name: 'Ink 2', hex: '#4a463d', ink: '#f2eee6', role: 'soft text' },
  { name: 'Riso orange', hex: '#ff5c1f', ink: '#16140f', role: 'drum A' },
  { name: 'Accent', hex: '#d9431a', ink: '#ffffff', role: 'actions' },
  { name: 'Riso blue', hex: '#2f4ec2', ink: '#ffffff', role: 'drum B' },
];

export function PaletteSheet() {
  return (
    <Poster label="Sheet 02 · Colour">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {swatches.map((s) => (
          <div key={s.hex} className="overflow-hidden rounded-lg" style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}>
            <div className="flex aspect-[3/4] flex-col justify-between p-3" style={{ background: s.hex, color: s.ink }}>
              <span className="font-mono text-[10px] uppercase tracking-wider opacity-80">{s.role}</span>
              <span className="font-display text-3xl leading-none">Aa</span>
            </div>
            <div className="bg-white/60 p-2.5 text-[11px] leading-tight">
              <p className="font-medium">{s.name}</p>
              <p className="font-mono opacity-70">{s.hex}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 max-w-[60ch] text-sm opacity-80">
        Two riso drums and a paper stock. Orange and blue multiply to a dark brown where they overlap, the same way real ink
        does, which is why the hero never needs a third colour.
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
    <Poster dark label="Sheet 03 · Motion">
      <p className="font-display text-[clamp(3rem,9vw,6.5rem)] leading-[0.9] tracking-[-0.03em]">
        Snappy <em className="text-[#ff7a45]">beats</em> smooth.
      </p>
      <div className="mt-10 space-y-3">
        {rows.map((r) => (
          <div key={r.name} className="grid grid-cols-[5.5rem_1fr_7.5rem] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr_10rem] sm:gap-4">
            <span>{r.name}</span>
            <div className="h-2 rounded-full bg-white/10">
              <div className="h-2 rounded-full bg-[#ff7a45]" style={{ width: `${(r.ms / 800) * 100}%` }} />
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
