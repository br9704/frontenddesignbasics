'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { Stage } from './b-kit';
import { Btn, Readout, Segmented, focusRing, useTimeouts } from './b-controls';
import { useInView } from './context';

/* Laws of UX, demos U7 to U12. */

/* U7 Gestalt dot field ------------------------------------------------ */

export function GestaltDemo() {
  const [prox, setProx] = useState(false);
  const [sim, setSim] = useState(false);
  const [region, setRegion] = useState(false);

  const cols = 12;
  const rows = 4;
  const step = 22;
  const gap = prox ? 22 : 0;
  const x = (c: number) => 20 + c * step + Math.floor(c / 3) * gap;
  const y = (r: number) => 22 + r * step;
  const width = x(cols - 1) + 20;
  const height = y(rows - 1) + 22;

  const on = [prox && 'proximity', sim && 'similarity', region && 'common region'].filter(Boolean).join(', ');

  return (
    <div>
      <div role="group" aria-label="Grouping cues" className="flex flex-wrap gap-2">
        <Btn pressed={prox} onClick={() => setProx((v) => !v)}>
          Proximity
        </Btn>
        <Btn pressed={sim} onClick={() => setSim((v) => !v)}>
          Similarity
        </Btn>
        <Btn pressed={region} onClick={() => setRegion((v) => !v)}>
          Region
        </Btn>
      </div>
      <Stage className="mt-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`48 dots in a grid. ${on ? `Grouped by ${on}, they read as four groups.` : 'With no cues they read as one field.'}`}
        >
          {region
            ? [0, 1, 2, 3].map((g) => (
                <rect
                  key={g}
                  x={x(g * 3) - 11}
                  y={6}
                  width={x(g * 3 + 2) - x(g * 3) + 22}
                  height={height - 12}
                  fill="var(--v-steel)"
                  opacity="0.55"
                />
              ))
            : null}
          {Array.from({ length: cols * rows }, (_, i) => {
            const c = i % cols;
            const r = Math.floor(i / cols);
            const odd = sim && Math.floor(c / 3) % 2 === 1;
            return odd ? (
              <rect key={i} x={x(c) - 5} y={y(r) - 5} width={10} height={10} fill="none" stroke="var(--v-ink)" strokeWidth="1.5" />
            ) : (
              <circle key={i} cx={x(c)} cy={y(r)} r={5} fill="var(--v-ink)" />
            );
          })}
        </svg>
      </Stage>
      <Readout>{on ? `4 GROUPS · ${on}` : '1 FIELD · switch a cue on'}</Readout>
    </div>
  );
}

/* U8 Prägnanz and uniform connectedness ------------------------------- */

const STEP_NAMES = ['Cart', 'Address', 'Pay', 'Done'];
const MESSY = [
  'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
  'polygon(25% 5%, 100% 0%, 90% 70%, 40% 100%, 0% 60%)',
  'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
  'polygon(0% 20%, 60% 0%, 100% 40%, 80% 100%, 10% 90%)',
];
const MESSY_SIZE = [28, 20, 34, 24];

export function StepperDemo() {
  const [line, setLine] = useState(false);
  const [simple, setSimple] = useState(false);
  const [at, setAt] = useState(1);

  return (
    <div>
      <div role="group" aria-label="Stepper options" className="flex flex-wrap gap-2">
        <Btn pressed={line} onClick={() => setLine((v) => !v)}>
          Connect them
        </Btn>
        <Btn pressed={simple} onClick={() => setSimple((v) => !v)}>
          Simple shapes
        </Btn>
      </div>
      <Stage className="mt-3">
        <ol className="relative grid grid-cols-4 items-start" aria-label={`Checkout progress, step ${at + 1} of 4`}>
          {line ? (
            <>
              <span aria-hidden="true" className="absolute top-[17px] right-[12.5%] left-[12.5%] h-[2px] bg-[var(--v-steel)]" />
              <span
                aria-hidden="true"
                className="absolute top-[17px] left-[12.5%] h-[2px] bg-[var(--v-ink)] transition-[width] duration-300"
                style={{ width: `${(at / 3) * 75}%` }}
              />
            </>
          ) : null}
          {STEP_NAMES.map((n, i) => {
            const done = i <= at;
            const size = simple ? 24 : MESSY_SIZE[i];
            return (
              <li key={n} className="relative flex flex-col items-center gap-3" aria-current={i === at ? 'step' : undefined}>
                <span className="flex h-9 items-center">
                  <span
                    aria-hidden="true"
                    className={`block border-2 ${simple ? 'rounded-full' : ''} ${
                      done ? 'border-[var(--v-ink)] bg-[var(--v-ink)]' : 'border-[var(--v-dim)] bg-[var(--v-bg)]'
                    }`}
                    style={{ width: size, height: size, clipPath: simple ? undefined : MESSY[i] }}
                  />
                </span>
                <span className={`text-[13px] ${done ? 'text-[var(--v-ink)]' : 'text-[var(--v-dim)]'}`}>{n}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex gap-2">
          <Btn onClick={() => setAt((a) => Math.max(0, a - 1))} disabled={at === 0}>
            Back
          </Btn>
          <Btn onClick={() => setAt((a) => Math.min(3, a + 1))} disabled={at === 3}>
            Next
          </Btn>
        </div>
      </Stage>
      <Readout>
        {line && simple ? 'ONE PATH · clear shapes, joined up' : line ? 'JOINED UP · shapes still noisy' : simple ? 'CLEAN · but four separate things' : 'FOUR ODD THINGS'}
      </Readout>
    </div>
  );
}

/* U9 Miller ----------------------------------------------------------- */

export function MillerDemo() {
  const [mode, setMode] = useState<'raw' | 'chunked'>('raw');
  const [phase, setPhase] = useState<'idle' | 'show' | 'recall'>('idle');
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(0);
  const [guess, setGuess] = useState('');
  const [scores, setScores] = useState<{ raw: number[]; chunked: number[] }>({ raw: [], chunked: [] });
  const timers = useTimeouts();

  const start = () => {
    timers.clear();
    const c = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
    setCode(c);
    setGuess('');
    setPhase('show');
    setLeft(4);
    for (let s = 1; s <= 4; s++) timers.later(() => setLeft(4 - s), s * 1000);
    timers.later(() => setPhase('recall'), 4000);
  };
  const check = () => {
    const g = guess.replace(/\D/g, '');
    let n = 0;
    for (let i = 0; i < 12; i++) if (g[i] === code[i]) n++;
    setScores((s) => ({ ...s, [mode]: [...s[mode], n].slice(-5) }));
    setPhase('idle');
  };
  const shown = mode === 'chunked' ? code.replace(/(\d{4})(?=\d)/g, '$1 ') : code;
  const last = (xs: number[]) => (xs.length ? `${xs[xs.length - 1]}/12` : '--');

  return (
    <div>
      <Segmented
        label="Code format"
        value={mode}
        onChange={(m) => {
          timers.clear();
          setMode(m);
          setPhase('idle');
        }}
        options={[
          { id: 'raw', name: 'One long string' },
          { id: 'chunked', name: 'Chunks of 4' },
        ]}
      />
      <Stage className="mt-3 flex min-h-[150px] flex-col justify-center">
        {phase === 'idle' ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-[15px] text-[var(--v-soft)]">I&rsquo;ll show a 12-digit code for 4 seconds. Then type it back.</p>
            <Btn primary onClick={start}>
              SHOW ME
            </Btn>
          </div>
        ) : null}
        {phase === 'show' ? (
          <div>
            <p className="pixel text-[32px] leading-[32px] break-all text-[var(--v-ink)] tabular-nums" aria-live="off">
              {shown}
            </p>
            <p className="pixel mt-3 text-[16px] leading-[16px] text-[var(--v-dim)]">{left}s</p>
          </div>
        ) : null}
        {phase === 'recall' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              check();
            }}
            className="flex flex-col gap-3"
          >
            <label htmlFor="miller-g" className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
              Type the code
            </label>
            <input
              id="miller-g"
              autoFocus
              inputMode="numeric"
              autoComplete="off"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              className={`pixel w-full border border-[var(--v-steel)] bg-[var(--v-bg)] px-3 py-2 text-[16px] leading-[16px] text-[var(--v-ink)] ${focusRing}`}
            />
            <Btn primary onClick={check}>
              CHECK
            </Btn>
          </form>
        ) : null}
      </Stage>
      <Readout>
        LONG STRING {last(scores.raw)} · CHUNKS {last(scores.chunked)}
      </Readout>
    </div>
  );
}

/* U10 Tesler ---------------------------------------------------------- */

const ADDRESSES = [
  { line: '12 Harbour Street', town: 'Northgate', postcode: '4012' },
  { line: '12 Harrow Lane', town: 'Eastfield', postcode: '4120' },
  { line: '7 Mill Road', town: 'Northgate', postcode: '4013' },
  { line: '44 Station Parade', town: 'Westbury', postcode: '4301' },
  { line: '3 Orchard Close', town: 'Southholme', postcode: '4550' },
];
const GOAL = ADDRESSES[0];
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function TeslerDemo() {
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [keys, setKeys] = useState(0);
  const [fields, setFields] = useState({ line: '', town: '', postcode: '' });
  const [q, setQ] = useState('');
  const [best, setBest] = useState<{ manual: number | null; auto: number | null }>({ manual: null, auto: null });

  const done = norm(fields.line) === norm(GOAL.line) && norm(fields.town) === norm(GOAL.town) && norm(fields.postcode) === GOAL.postcode;
  const reset = (m = mode) => {
    setMode(m);
    setKeys(0);
    setFields({ line: '', town: '', postcode: '' });
    setQ('');
  };
  const count = (e: KeyboardEvent) => {
    if (done) return;
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') setKeys((k) => k + 1);
  };
  const finish = (next: typeof fields) => {
    setFields(next);
    const ok = norm(next.line) === norm(GOAL.line) && norm(next.town) === norm(GOAL.town) && norm(next.postcode) === GOAL.postcode;
    if (ok) setBest((b) => ({ ...b, [mode]: keys + 1 }));
  };

  const input = (key: keyof typeof fields, label: string) => (
    <div className="min-w-0">
      <label htmlFor={`tesler-${key}`} className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
        {label}
      </label>
      <input
        id={`tesler-${key}`}
        value={fields[key]}
        readOnly={mode === 'auto'}
        autoComplete="off"
        onChange={(e) => finish({ ...fields, [key]: e.target.value })}
        className={`mt-1 w-full border border-[var(--v-steel)] bg-[var(--v-bg)] px-2 py-1 text-[14px] text-[var(--v-ink)] read-only:text-[var(--v-soft)] ${focusRing}`}
      />
    </div>
  );
  const matches = q.trim().length >= 2 ? ADDRESSES.filter((a) => norm(`${a.line} ${a.town} ${a.postcode}`).includes(norm(q))) : [];

  return (
    <div>
      <Segmented
        label="Address form"
        value={mode}
        onChange={(m) => reset(m)}
        options={[
          { id: 'manual', name: 'You do the work' },
          { id: 'auto', name: 'I do the work' },
        ]}
      />
      <Stage className="mt-3">
        <p className="text-[14px] leading-[1.4] text-[var(--v-soft)]">
          Enter: <span className="text-[var(--v-ink)]">12 Harbour Street, Northgate 4012</span>
        </p>
        <div onKeyDown={count} className="mt-3 flex flex-col gap-2">
          {mode === 'auto' ? (
            <div>
              <label htmlFor="tesler-q" className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
                Start typing your address
              </label>
              <input
                id="tesler-q"
                value={q}
                autoComplete="off"
                onChange={(e) => setQ(e.target.value)}
                className={`mt-1 w-full border border-[var(--v-ink)] bg-[var(--v-bg)] px-2 py-1 text-[14px] text-[var(--v-ink)] ${focusRing}`}
              />
              {matches.length && !done ? (
                <ul className="mt-1 border border-[var(--v-steel)]" aria-label="Suggestions">
                  {matches.map((a) => (
                    <li key={a.line}>
                      <button
                        type="button"
                        onClick={() => {
                          setKeys((k) => k + 1);
                          finish({ ...a });
                          setQ(`${a.line}, ${a.town}`);
                        }}
                        className={`w-full px-2 py-1 text-left text-[14px] text-[var(--v-soft)] hover:bg-[var(--v-steel)] hover:text-[var(--v-ink)] ${focusRing}`}
                      >
                        {a.line}, {a.town} {a.postcode}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[2fr_1fr_auto]">
            <div className="col-span-2 sm:col-span-1">{input('line', 'Street')}</div>
            {input('town', 'Town')}
            <div className="w-[80px]">{input('postcode', 'Postcode')}</div>
          </div>
        </div>
      </Stage>
      <Readout>
        {done ? 'DONE · ' : ''}
        {keys} KEYS NOW · YOU DO IT {best.manual ?? '--'} · I DO IT {best.auto ?? '--'}
        {done ? (
          <>
            {' '}
            <button type="button" onClick={() => reset()} className={`underline underline-offset-4 ${focusRing}`}>
              again
            </button>
          </>
        ) : null}
      </Readout>
    </div>
  );
}

/* U11 Goal gradient + Zeigarnik --------------------------------------- */

function Checklist({ title, items, given }: { title: string; items: string[]; given: number }) {
  const [done, setDone] = useState<boolean[]>(() => items.map((_, i) => i < given));
  const n = done.filter(Boolean).length;
  const pct = Math.round((n / items.length) * 100);
  const left = items.length - n;
  return (
    <div className="min-w-0">
      <p className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">{title}</p>
      <div
        className="mt-2 h-2 w-full bg-[var(--v-steel)]"
        role="progressbar"
        aria-label={`${title} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full bg-[var(--v-ink)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="pixel mt-2 text-[16px] leading-[16px] text-[var(--v-dim)]">
        {n} of {items.length} · {pct}%
      </p>
      <ul className="mt-3 space-y-1">
        {items.map((it, i) => (
          <li key={it}>
            <label className="flex cursor-pointer items-center gap-2 text-[14px] text-[var(--v-soft)]">
              <input
                type="checkbox"
                checked={done[i]}
                disabled={i < given}
                onChange={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))}
                className={`accent-[var(--v-ink)] ${focusRing}`}
              />
              <span className={done[i] ? 'text-[var(--v-dim)] line-through' : ''}>{it}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 min-h-[20px] text-[14px] text-[var(--v-ink)]" aria-live="polite">
        {left === 1 ? 'One left. Finish it?' : left === 0 ? 'All done.' : ''}
      </p>
    </div>
  );
}

export function GoalDemo() {
  return (
    <div>
      <p className="text-[15px] leading-[1.5] text-[var(--v-soft)]">Same five tasks. B counts the two you already did.</p>
      <Stage className="mt-3">
        <div className="grid gap-5 sm:grid-cols-2">
          <Checklist title="A · FROM ZERO" given={0} items={['Add a photo', 'Pick a username', 'Follow 3 people', 'Turn on alerts', 'Post once']} />
          <Checklist
            title="B · HEAD START"
            given={2}
            items={['Account made', 'Email confirmed', 'Add a photo', 'Pick a username', 'Follow 3 people', 'Turn on alerts', 'Post once']}
          />
        </div>
      </Stage>
      <Readout>B starts at 29%. People push harder when the end looks close.</Readout>
    </div>
  );
}

/* U12 Serial position + aesthetic-usability --------------------------- */

const NAV = ['Home', 'Shop', 'Journal', 'Stories', 'Studio', 'Stockists', 'Care', 'Returns', 'Contact'];
const DECOYS = ['About', 'Sale', 'Gifts'];

function Recall() {
  const [phase, setPhase] = useState<'idle' | 'show' | 'pick'>('idle');
  const [opts, setOpts] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [hits, setHits] = useState<number[]>(() => NAV.map(() => 0));
  const [rounds, setRounds] = useState(0);
  const timers = useTimeouts();
  const box = useRef<HTMLDivElement>(null);
  const visible = useInView(box);

  const start = () => {
    setPicked([]);
    setOpts([...NAV, ...DECOYS].sort(() => Math.random() - 0.5));
    setPhase('show');
    timers.later(() => setPhase('pick'), 3000);
  };
  const submit = () => {
    setHits((h) => h.map((v, i) => v + (picked.includes(NAV[i]) ? 1 : 0)));
    setRounds((r) => r + 1);
    setPhase('idle');
  };
  const max = Math.max(1, rounds);

  return (
    <div ref={box}>
      {phase === 'idle' ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[15px] text-[var(--v-soft)]">A menu of nine shows for 3 seconds. Then tick the ones you remember.</p>
          <Btn primary onClick={start}>
            SHOW MENU
          </Btn>
        </div>
      ) : null}
      {phase === 'show' && visible ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-2 border-y border-[var(--v-steel)] py-3" aria-label="Menu to remember">
          {NAV.map((n) => (
            <li key={n} className="text-[14px] text-[var(--v-ink)]">
              {n}
            </li>
          ))}
        </ul>
      ) : null}
      {phase === 'show' && !visible ? <p className="text-[14px] text-[var(--v-dim)]">Scroll back to see the menu.</p> : null}
      {phase === 'pick' ? (
        <fieldset>
          <legend className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">Which were in the menu?</legend>
          <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
            {opts.map((o) => (
              <label key={o} className="flex items-center gap-2 text-[14px] text-[var(--v-soft)]">
                <input
                  type="checkbox"
                  checked={picked.includes(o)}
                  onChange={() => setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))}
                  className={`accent-[var(--v-ink)] ${focusRing}`}
                />
                {o}
              </label>
            ))}
          </div>
          <Btn primary onClick={submit} className="mt-3">
            DONE
          </Btn>
        </fieldset>
      ) : null}
      <div className="mt-4" aria-label="Recall by position" role="img">
        <div className="flex h-[64px] items-end gap-1">
          {hits.map((h, i) => (
            <div key={NAV[i]} className="flex h-full flex-1 flex-col justify-end">
              <div className="bg-[var(--v-ink)]" style={{ height: `${(h / max) * 100}%`, minHeight: 2 }} />
            </div>
          ))}
        </div>
        <div className="pixel mt-1 flex justify-between text-[16px] leading-[16px] text-[var(--v-dim)]">
          <span>1st</span>
          <span>9th</span>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {rounds ? `After ${rounds} rounds you remembered: ${hits.map((h, i) => `${NAV[i]} ${h}`).join(', ')}.` : ''}
      </p>
    </div>
  );
}

function Looks() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
      <div className="min-w-0 border border-[var(--v-dim)] bg-[#d0d0d0] p-1 font-mono text-[11px] text-black">
        <p className="font-bold">SIGN UP FORM!!!</p>
        <p className="mt-1">name:</p>
        <div className="h-4 border border-black bg-white" />
        <p>E-mail address (required)*:</p>
        <div className="ml-3 h-4 w-3/4 border border-black bg-white" />
        <p className="mt-2">pass</p>
        <div className="h-4 w-1/2 border border-black bg-white" />
        <div className="mt-1 inline-block border border-black bg-[#e8e8e8] px-1">submit</div>
      </div>
      <div className="min-w-0 border border-[var(--v-steel)] bg-[var(--v-surface)] p-4">
        <p className="font-display text-[22px] leading-none text-[var(--v-ink)]">Sign up</p>
        {['Name', 'Email', 'Password'].map((l) => (
          <div key={l} className="mt-3">
            <p className="text-[12px] text-[var(--v-dim)]">{l}</p>
            <div className="mt-1 h-8 border border-[var(--v-steel)] bg-[var(--v-bg)]" />
          </div>
        ))}
        <div className="mt-4 h-9 bg-[var(--v-ink)] text-center text-[13px] leading-9 text-[var(--v-bg)]">Create account</div>
      </div>
    </div>
  );
}

export function SerialLooksDemo() {
  const [tab, setTab] = useState<'recall' | 'looks'>('recall');
  return (
    <div>
      <Segmented
        label="Part"
        value={tab}
        onChange={setTab}
        options={[
          { id: 'recall', name: 'Recall test' },
          { id: 'looks', name: 'Ugly vs polished' },
        ]}
      />
      <Stage className="mt-3">{tab === 'recall' ? <Recall /> : <Looks />}</Stage>
      <Readout>
        {tab === 'recall'
          ? 'Most people keep the first and the last. So Home goes first and Contact goes last.'
          : 'Same three fields. The polished one feels easier before you touch it.'}
      </Readout>
    </div>
  );
}
