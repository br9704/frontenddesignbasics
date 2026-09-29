'use client';

import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Preview } from '../demos';

/* Shared bits ---------------------------------------------------------- */

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-soft)]">
      <label htmlFor={id} className="w-20 shrink-0">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`min-w-0 flex-1 accent-[var(--accent)] disabled:opacity-40 ${focus}`}
      />
      <span className="w-12 shrink-0 text-right font-mono tabular-nums">
        {value}
        {unit}
      </span>
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 text-xs">
      <span className="mr-1 text-[var(--text-soft)]">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={`rounded-full border px-3 py-1 font-mono ${focus} ${
            o === value
              ? 'border-[var(--text)] bg-[var(--text)] text-[var(--surface)]'
              : 'border-[var(--rule)] text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/* 1. Variable font playground ------------------------------------------ */

/* next/font only ships Newsreader's weight axis, so this demo pulls the
   full opsz + wght file from Google Fonts under its own family name. */
const NEWSREADER_AXES =
  'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&display=swap';
const vf = "'Newsreader', var(--font-display)";

export function VariableFontPlayground() {
  const [weight, setWeight] = useState(400);
  const [size, setSize] = useState(56);
  const [opsz, setOpsz] = useState(56);
  const [auto, setAuto] = useState(true);
  const effOpsz = auto ? Math.min(72, Math.max(6, size)) : opsz;
  const specimen = (o: number, px: number): CSSProperties => ({
    fontFamily: vf,
    fontWeight: weight,
    fontSize: px,
    fontOpticalSizing: 'none',
    fontVariationSettings: `'opsz' ${o}, 'wght' ${weight}`,
  });
  return (
    <Preview caption="Newsreader has two axes: weight and optical size. Small optical sizes are wider, sturdier and more open so they survive at 12px; large ones get finer hairlines and tighter spacing. Turn off auto and set opsz 6 at 72px to see the text-cut blown up.">
      <link rel="stylesheet" href={NEWSREADER_AXES} precedence="default" />
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-x-6">
        <Slider label="Weight" value={weight} min={200} max={800} step={10} onChange={setWeight} />
        <Slider label="Size" value={size} min={10} max={96} unit="px" onChange={setSize} />
        <Slider label="Optical size" value={effOpsz} min={6} max={72} onChange={setOpsz} disabled={auto} />
        <label className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              setOpsz(effOpsz);
            }}
            className={`accent-[var(--accent)] ${focus}`}
          />
          Auto (opsz follows size, like <code className="font-mono">font-optical-sizing: auto</code>)
        </label>
      </div>
      <p
        className="mt-6 overflow-hidden text-ellipsis whitespace-nowrap leading-[1.05] text-[var(--text)]"
        style={specimen(effOpsz, size)}
      >
        Hamburgefonstiv
      </p>
      <div className="mt-6 grid gap-4 border-t border-[var(--rule)] pt-4 sm:grid-cols-2">
        {[6, 72].map((o) => (
          <div key={o} className="min-w-0">
            <p className="mb-1 font-mono text-[11px] text-[var(--text-soft)]">opsz {o} at 40px</p>
            <p className="truncate leading-none text-[var(--text)]" style={specimen(o, 40)}>
              Readable
            </p>
            <p className="mt-2 text-[var(--text)]" style={specimen(o, 12)}>
              The same axis at 12px: a caption set for reading, not for display.
            </p>
          </div>
        ))}
      </div>
      <pre className="mt-4 overflow-x-auto rounded bg-[var(--color-fd-muted)] p-3 font-mono text-[11px] text-[var(--text-soft)]">
        {`font-variation-settings: 'opsz' ${effOpsz}, 'wght' ${weight};`}
      </pre>
    </Preview>
  );
}

/* 2. OKLCH palette lab -------------------------------------------------- */

type RGB = [number, number, number];

/* OKLCH -> linear sRGB (Björn Ottosson's matrices). */
function oklchToLinear(l: number, c: number, h: number): RGB {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: RGB) => rgb.every((v) => v >= -0.0001 && v <= 1.0001);

/* Lower chroma until the colour fits sRGB, so what we measure is what shows. */
function fitChroma(l: number, c: number, h: number) {
  let cc = c;
  while (cc > 0 && !inGamut(oklchToLinear(l, cc, h))) cc -= 0.005;
  return Math.max(0, cc);
}

const luminance = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800];
const LIGHTNESS = [0.97, 0.93, 0.86, 0.77, 0.67, 0.57, 0.48, 0.38, 0.28];

export function OklchPaletteLab() {
  const [hue, setHue] = useState(40);
  const [chroma, setChroma] = useState(0.16);
  const ramp = useMemo(
    () =>
      LIGHTNESS.map((l, i) => {
        const want = chroma * Math.sin(Math.PI * (0.15 + 0.7 * (i / 8))); // taper at the ends
        const c = fitChroma(l, want, hue);
        const y = luminance(oklchToLinear(l, c, hue).map((v) => Math.min(1, Math.max(0, v))) as RGB);
        return { step: STEPS[i], css: `oklch(${l} ${c.toFixed(3)} ${hue})`, onWhite: ratio(1, y), onBlack: ratio(0, y) };
      }),
    [hue, chroma],
  );
  const Badge = ({ label, r }: { label: string; r: number }) => (
    <span className={r >= 4.5 ? 'text-[var(--text)]' : 'text-[var(--text-soft)] line-through'}>
      {label} {r.toFixed(1)}
    </span>
  );
  return (
    <Preview caption="Every step keeps the same hue and a planned lightness, so the ramp looks even. Numbers show contrast with white (W) and black (B); struck through means below 4.5:1 for body text. Notice yellows pass on black far longer than blues do.">
      <div className="mb-5 grid gap-2 sm:grid-cols-2 sm:gap-x-6">
        <Slider label="Hue" value={hue} min={0} max={360} unit="°" onChange={setHue} />
        <Slider label="Chroma" value={chroma} min={0} max={0.3} step={0.01} onChange={setChroma} />
      </div>
      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-9 sm:gap-1">
        {ramp.map((s) => (
          <li key={s.step} className="min-w-0">
            <div
              className="flex h-14 items-end rounded p-1.5 font-mono text-[10px]"
              style={{ background: s.css, color: s.onWhite > s.onBlack ? '#fff' : '#000' }}
            >
              {s.step}
            </div>
            <div className="mt-1 flex flex-col font-mono text-[10px] leading-tight tabular-nums">
              <Badge label="W" r={s.onWhite} />
              <Badge label="B" r={s.onBlack} />
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 break-all font-mono text-[11px] text-[var(--text-soft)]">
        --brand-500: {ramp[5].css};
      </p>
    </Preview>
  );
}

/* 3. Grid overlay -------------------------------------------------------- */

const COLS = [4, 8, 12] as const;

function Block({ span, start, children, tone }: { span: number; start?: number; children: ReactNode; tone?: 'accent' | 'muted' }) {
  return (
    <div
      className={`min-w-0 rounded p-2 text-[11px] ${
        tone === 'accent' ? 'bg-[var(--accent)] text-[var(--surface)]' : 'bg-[var(--color-fd-muted)] text-[var(--text-soft)]'
      }`}
      style={{ gridColumn: start ? `${start} / span ${span}` : `span ${span}` }}
    >
      {children}
    </div>
  );
}

export function GridOverlay() {
  const [cols, setCols] = useState<(typeof COLS)[number]>(12);
  const [show, setShow] = useState(true);
  const q = cols / 4; // one "quarter" of the grid, in columns
  const grid = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: 8 };
  return (
    <Preview caption="Every block starts and ends on a column line, and every line of text sits on an 8px baseline. Switch to 4 columns (a phone) and the same layout reflows by spanning whole columns, never arbitrary widths.">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Segmented label="Columns" options={COLS} value={cols} onChange={setCols} />
        <label className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className={`accent-[var(--accent)] ${focus}`} />
          Show grid and baseline
        </label>
      </div>
      <div className="relative rounded border border-[var(--rule)] bg-[var(--surface)] p-3">
        <div className="relative z-10 grid gap-y-2" style={grid}>
          <Block span={cols}>Header</Block>
          <div className="min-w-0 py-2" style={{ gridColumn: `span ${cols >= 8 ? q * 3 : cols}` }}>
            <p className="font-[family-name:var(--font-display)] text-2xl leading-8 text-[var(--text)]">Layout on a grid</p>
            <p className="text-xs leading-4 text-[var(--text-soft)]">Lines land on the 8px rhythm.</p>
          </div>
          <Block span={cols >= 8 ? q * 2 : cols} tone="accent">
            <div className="h-16">Image</div>
          </Block>
          <Block span={cols >= 8 ? q * 2 : cols}>
            <div className="h-16">Intro text</div>
          </Block>
          {[1, 2, 3].map((n) => (
            <Block key={n} span={cols === 12 ? 4 : cols === 8 ? (n === 3 ? 8 : 4) : 4}>
              <div className="h-10">Card {n}</div>
            </Block>
          ))}
        </div>
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-3 z-20 grid motion-safe:transition-opacity motion-safe:duration-300 ${show ? 'opacity-100' : 'opacity-0'}`}
          style={{
            ...grid,
            backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 7px, color-mix(in oklch, var(--accent) 35%, transparent) 7px 8px)',
          }}
        >
          {Array.from({ length: cols }, (_, i) => (
            <div key={i} className="bg-[color-mix(in_oklch,var(--accent)_12%,transparent)]" />
          ))}
        </div>
      </div>
      <p className="mt-3 font-mono text-[11px] text-[var(--text-soft)]">
        grid-template-columns: repeat({cols}, minmax(0, 1fr)); gap: 8px;
      </p>
    </Preview>
  );
}
