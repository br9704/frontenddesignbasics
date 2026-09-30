'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Stage } from './b-kit';
import { Btn, Range, Readout, Segmented, avg, focusRing, useTimeouts } from './b-controls';

/* Laws of UX, demos U1 to U6. All interaction-driven: nothing loops, so nothing runs off screen. */

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function keepLast(xs: number[], x: number, n = 5) {
  return [...xs, x].slice(-n);
}

/* U1 Fitts ------------------------------------------------------------ */

export function FittsDemo() {
  const [mode, setMode] = useState<'small' | 'big'>('small');
  const [armed, setArmed] = useState(false);
  const [times, setTimes] = useState<{ small: number[]; big: number[] }>({ small: [], big: [] });
  const t0 = useRef(0);

  const start = () => {
    t0.current = now();
    setArmed(true);
  };
  const hit = () => {
    if (!armed) return;
    const ms = Math.round(now() - t0.current);
    setTimes((t) => ({ ...t, [mode]: keepLast(t[mode], ms) }));
    setArmed(false);
  };

  return (
    <div>
      <Segmented
        label="Target"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setArmed(false);
        }}
        options={[
          { id: 'small', name: 'Small + far' },
          { id: 'big', name: 'Big + close' },
        ]}
      />
      <Stage className="mt-3 h-[220px]">
        <button
          type="button"
          onClick={start}
          className={`pixel absolute bottom-3 left-3 border border-[var(--v-ink)] px-3 py-2 text-[16px] leading-[16px] ${focusRing} ${
            armed ? 'text-[var(--v-dim)]' : 'bg-[var(--v-ink)] text-[var(--v-bg)]'
          }`}
        >
          {armed ? 'GO' : 'START'}
        </button>
        <button
          type="button"
          onClick={hit}
          disabled={!armed}
          aria-label={armed ? 'Target: click me now' : 'Target (press start first)'}
          className={`absolute border ${focusRing} ${
            mode === 'small' ? 'top-3 right-3 h-4 w-4' : 'bottom-3 left-[104px] h-[64px] w-[132px]'
          } ${armed ? 'border-[var(--v-ink)] bg-[var(--v-ink)]' : 'border-[var(--v-steel)] bg-transparent'}`}
        >
          {mode === 'big' ? (
            <span className={`pixel text-[16px] leading-[16px] ${armed ? 'text-[var(--v-bg)]' : 'text-[var(--v-dim)]'}`}>TARGET</span>
          ) : null}
        </button>
        <p className="pixel pointer-events-none absolute top-3 left-3 max-w-[60%] text-[16px] leading-[20px] text-[var(--v-dim)]">
          Press START, then hit the target as fast as you can.
        </p>
      </Stage>
      <Readout>
        SMALL+FAR {times.small.length ? `${avg(times.small)}ms (${times.small.length})` : '--'} · BIG+CLOSE{' '}
        {times.big.length ? `${avg(times.big)}ms (${times.big.length})` : '--'}
      </Readout>
    </div>
  );
}

/* U2 Hick ------------------------------------------------------------- */

const GROUPS: { name: string; items: string[] }[] = [
  { name: 'File', items: ['New file', 'Open', 'Save', 'Export', 'Print', 'Share'] },
  { name: 'Edit', items: ['Undo', 'Redo', 'Copy', 'Paste', 'Find', 'Replace'] },
  { name: 'View', items: ['Zoom in', 'Zoom out', 'Full screen', 'Grid', 'Rulers', 'Dark mode'] },
  { name: 'Account', items: ['Profile', 'Invoices', 'Settings', 'Team', 'Sign out', 'Help'] },
];
const ALL = GROUPS.flatMap((g) => g.items);

function shuffle<T>(xs: T[]) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type HickMode = 'flat' | 'grouped' | 'palette';

export function HickDemo() {
  const [mode, setMode] = useState<HickMode>('flat');
  const [target, setTarget] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>(ALL);
  const [query, setQuery] = useState('');
  const [miss, setMiss] = useState(0);
  const [times, setTimes] = useState<Record<HickMode, number[]>>({ flat: [], grouped: [], palette: [] });
  const t0 = useRef(0);

  const start = () => {
    setOrder(shuffle(ALL));
    setTarget(ALL[Math.floor(Math.random() * ALL.length)]);
    setQuery('');
    setMiss(0);
    t0.current = now();
  };
  const pick = (item: string) => {
    if (!target) return;
    if (item !== target) {
      setMiss((m) => m + 1);
      return;
    }
    const ms = Math.round(now() - t0.current);
    setTimes((t) => ({ ...t, [mode]: keepLast(t[mode], ms) }));
    setTarget(null);
  };

  const item = (x: string) => (
    <button
      key={x}
      type="button"
      onClick={() => pick(x)}
      className={`min-h-[32px] border border-[var(--v-line)] px-2 py-1 text-left text-[14px] leading-[1.2] text-[var(--v-soft)] hover:border-[var(--v-ink)] hover:text-[var(--v-ink)] ${focusRing}`}
    >
      {x}
    </button>
  );
  const filtered = ALL.filter((x) => x.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div>
      <Segmented
        label="Menu style"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setTarget(null);
        }}
        options={[
          { id: 'flat', name: 'Flat 24' },
          { id: 'grouped', name: 'Grouped' },
          { id: 'palette', name: 'Type to find' },
        ]}
      />
      <Stage className="mt-3 min-h-[240px]">
        {!target ? (
          <div className="flex h-[200px] flex-col items-start justify-center gap-4">
            <p className="text-[15px] leading-[1.5] text-[var(--v-soft)]">I&rsquo;ll name one command. Find it and click it.</p>
            <Btn primary onClick={start}>
              START
            </Btn>
          </div>
        ) : (
          <div>
            <p className="pixel mb-3 text-[16px] leading-[16px] text-[var(--v-ink)]" aria-live="polite">
              FIND: {target} {miss ? `· ${miss} wrong` : ''}
            </p>
            {mode === 'flat' ? <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">{order.map(item)}</div> : null}
            {mode === 'grouped' ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {GROUPS.map((g) => (
                  <div key={g.name} role="group" aria-label={g.name} className="flex flex-col gap-1">
                    <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">{g.name}</p>
                    {g.items.map(item)}
                  </div>
                ))}
              </div>
            ) : null}
            {mode === 'palette' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (filtered[0]) pick(filtered[0]);
                }}
              >
                <label className="sr-only" htmlFor="hick-q">
                  Type a command
                </label>
                <input
                  id="hick-q"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type a command, Enter to run"
                  className={`w-full border border-[var(--v-steel)] bg-[var(--v-bg)] px-3 py-2 text-[15px] text-[var(--v-ink)] placeholder:text-[var(--v-dim)] ${focusRing}`}
                />
                <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">{filtered.slice(0, 6).map(item)}</div>
              </form>
            ) : null}
          </div>
        )}
      </Stage>
      <Readout>
        FLAT {times.flat.length ? `${avg(times.flat)}ms` : '--'} · GROUPED {times.grouped.length ? `${avg(times.grouped)}ms` : '--'} · TYPED{' '}
        {times.palette.length ? `${avg(times.palette)}ms` : '--'}
      </Readout>
    </div>
  );
}

/* U3 Jakob ------------------------------------------------------------ */

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 8H6.2" />
      <circle cx="9.5" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
    </svg>
  );
}

export function JakobDemo() {
  const [layout, setLayout] = useState<'usual' | 'new'>('new');
  const [armed, setArmed] = useState(false);
  const [miss, setMiss] = useState(0);
  const [times, setTimes] = useState<{ usual: number[]; new: number[] }>({ usual: [], new: [] });
  const t0 = useRef(0);

  const start = () => {
    t0.current = now();
    setMiss(0);
    setArmed(true);
  };
  const found = () => {
    if (!armed) return;
    const ms = Math.round(now() - t0.current);
    setTimes((t) => ({ ...t, [layout]: keepLast(t[layout], ms) }));
    setArmed(false);
  };
  const wrong = () => armed && setMiss((m) => m + 1);

  const decoy = (label: string, key: string) => (
    <button
      key={key}
      type="button"
      onClick={wrong}
      className={`text-[13px] text-[var(--v-soft)] hover:text-[var(--v-ink)] ${focusRing}`}
    >
      {label}
    </button>
  );
  const cart = (
    <button type="button" onClick={found} aria-label="Cart" className={`text-[var(--v-ink)] ${focusRing}`}>
      <CartIcon />
    </button>
  );

  return (
    <div>
      <Segmented
        label="Layout"
        value={layout}
        onChange={(l) => {
          setLayout(l);
          setArmed(false);
        }}
        options={[
          { id: 'new', name: 'My own idea' },
          { id: 'usual', name: 'Where people look' },
        ]}
      />
      <Stage flush className="mt-3 h-[240px]">
        {!armed ? (
          <div className="flex h-full flex-col items-start justify-center gap-4 p-4">
            <p className="text-[15px] leading-[1.5] text-[var(--v-soft)]">A shop page will appear. Find the cart.</p>
            <Btn primary onClick={start}>
              START
            </Btn>
          </div>
        ) : layout === 'usual' ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--v-line)] px-3 py-3">
              <span className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">SHOP</span>
              <div className="flex gap-3">{['New', 'Men', 'Women', 'Sale'].map((x) => decoy(x, x))}</div>
              {cart}
            </div>
            <div className="grid flex-1 grid-cols-3 gap-2 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="border border-[var(--v-line)] bg-[var(--v-surface)]" />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-center gap-3 border-b border-[var(--v-line)] px-3 py-3">
              {['Sale', 'Men', 'Women', 'New'].map((x) => decoy(x, x))}
              <span className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">SHOP</span>
            </div>
            <div className="grid flex-1 grid-cols-3 gap-2 p-3">
              <div className="border border-[var(--v-line)] bg-[var(--v-surface)]" />
              <div className="flex items-end justify-start border border-[var(--v-line)] bg-[var(--v-surface)] p-2">{cart}</div>
              <div className="border border-[var(--v-line)] bg-[var(--v-surface)]" />
            </div>
            <div className="flex justify-end gap-3 px-3 pb-3">{['Help', 'Stores', 'Bag tips'].map((x) => decoy(x, `f-${x}`))}</div>
          </div>
        )}
      </Stage>
      <Readout>
        MY IDEA {times.new.length ? `${avg(times.new)}ms` : '--'} · WHERE PEOPLE LOOK {times.usual.length ? `${avg(times.usual)}ms` : '--'}
        {armed && miss ? ` · ${miss} wrong` : ''}
      </Readout>
    </div>
  );
}

/* U4 Doherty ---------------------------------------------------------- */

const FRUIT = ['Apple', 'Apricot', 'Banana', 'Blackberry', 'Cherry', 'Damson', 'Fig', 'Gooseberry', 'Grape', 'Lemon', 'Lime', 'Mango', 'Melon', 'Pear', 'Plum', 'Quince', 'Raspberry', 'Rhubarb'];

function band(ms: number) {
  if (ms <= 100) return 'feels instant';
  if (ms <= 400) return 'keeps you in flow';
  if (ms <= 1000) return 'you notice the wait';
  return 'you start to drift';
}

export function DohertyDemo() {
  const [latency, setLatency] = useState(900);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState('');
  const pending = useRef<number | null>(null);
  const timers = useTimeouts();

  const type = (q: string) => {
    setQuery(q);
    if (pending.current) window.clearTimeout(pending.current);
    pending.current = timers.later(() => setShown(q), latency);
  };
  const results = FRUIT.filter((f) => f.toLowerCase().includes(shown.trim().toLowerCase()));
  const waiting = query !== shown;

  return (
    <div>
      <Range label="DELAY" value={latency} min={0} max={2000} step={50} unit="ms" onChange={setLatency} />
      <p className="pixel mt-2 text-[16px] leading-[16px] text-[var(--v-dim)]">
        {latency}ms {band(latency)}
      </p>
      <Stage className="mt-3 min-h-[200px]">
        <label htmlFor="doherty-q" className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
          Filter the fruit
        </label>
        <input
          id="doherty-q"
          value={query}
          onChange={(e) => type(e.target.value)}
          placeholder="Try 'be'"
          autoComplete="off"
          className={`mt-2 w-full border border-[var(--v-steel)] bg-[var(--v-bg)] px-3 py-2 text-[15px] text-[var(--v-ink)] placeholder:text-[var(--v-dim)] ${focusRing}`}
        />
        <ul className={`mt-3 flex flex-wrap gap-1 ${waiting ? 'opacity-40' : ''}`} aria-live="polite" aria-busy={waiting}>
          {results.slice(0, 10).map((f) => (
            <li key={f} className="border border-[var(--v-line)] px-2 py-1 text-[14px] text-[var(--v-soft)]">
              {f}
            </li>
          ))}
          {!results.length ? <li className="text-[14px] text-[var(--v-dim)]">No fruit matches.</li> : null}
        </ul>
      </Stage>
      <Readout>{waiting ? 'WAITING…' : 'UP TO DATE'} · slide under 400ms and it feels like the page is keeping up</Readout>
    </div>
  );
}

/* U5 Peak-end --------------------------------------------------------- */

const STEPS = ['Basket', 'Delivery', 'Payment'];

function Checkout({ name, happy, rating, onRate }: { name: string; happy: boolean; rating: number; onRate: (n: number) => void }) {
  const [step, setStep] = useState(0);
  const done = step >= STEPS.length;
  let body: ReactNode;
  if (!done) {
    body = (
      <div className="flex h-full flex-col justify-between gap-3">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
          {step + 1}/{STEPS.length} {STEPS[step].toUpperCase()}
        </p>
        <div className="space-y-2" aria-hidden="true">
          <div className="h-3 w-3/4 bg-[var(--v-steel)]" />
          <div className="h-3 w-1/2 bg-[var(--v-steel)]" />
        </div>
        <Btn onClick={() => setStep((s) => s + 1)}>{step === STEPS.length - 1 ? 'Pay' : 'Next'}</Btn>
      </div>
    );
  } else if (happy) {
    body = (
      <div className="flex h-full flex-col justify-between gap-2">
        <p className="font-display text-[26px] leading-[1.1] text-[var(--v-ink)]">✓ It&rsquo;s on its way.</p>
        <p className="text-[14px] leading-[1.4] text-[var(--v-soft)]">Arrives Thursday. I&rsquo;ve emailed your receipt. Nothing else to do.</p>
      </div>
    );
  } else {
    body = (
      <div className="flex h-full flex-col justify-between gap-2">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">TXN_STATUS: 200</p>
        <p className="text-[14px] leading-[1.4] text-[var(--v-dim)]">Order 88213 processed. Please retain this reference.</p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <p className="pixel mb-2 text-[16px] leading-[16px] text-[var(--v-ink)]">{name}</p>
      <Stage className="h-[170px]">{body}</Stage>
      <div role="group" aria-label={`Rate checkout ${name}`} className="mt-2 flex flex-wrap gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <Btn key={n} pressed={rating === n} disabled={!done} onClick={() => onRate(n)} label={`${n} out of 5`}>
            {n}
          </Btn>
        ))}
      </div>
    </div>
  );
}

export function PeakEndDemo() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  return (
    <div>
      <p className="text-[15px] leading-[1.5] text-[var(--v-soft)]">Same three steps. Go through both, then rate each.</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Checkout name="A" happy={false} rating={a} onRate={setA} />
        <Checkout name="B" happy rating={b} onRate={setB} />
      </div>
      <Readout>
        A {a ? `${a}/5` : '--'} · B {b ? `${b}/5` : '--'}
        {a && b ? (b > a ? ' · only the ending changed' : ' · the ending is the only difference') : ''}
      </Readout>
    </div>
  );
}

/* U6 von Restorff (black and white only) ------------------------------ */

const PLANS = [
  { name: 'Basic', price: '£4' },
  { name: 'Plus', price: '£9' },
  { name: 'Pro', price: '£19' },
];

export function RestorffDemo() {
  const [odd, setOdd] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'glance' | 'ask'>('idle');
  const [answer, setAnswer] = useState<string | null>(null);
  const timers = useTimeouts();

  const glance = () => {
    setAnswer(null);
    setPhase('glance');
    timers.later(() => setPhase('ask'), 1000);
  };

  const cards = useMemo(
    () =>
      PLANS.map((p, i) => {
        const hi = odd && i === 1;
        return (
          <div
            key={p.name}
            className={`flex min-w-0 flex-col gap-2 border p-3 ${
              hi ? 'border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]' : 'border-[var(--v-steel)] text-[var(--v-soft)]'
            }`}
          >
            <span className="pixel text-[16px] leading-[16px]">{hi ? 'MOST PICKED' : ' '}</span>
            <span className="text-[15px]">{p.name}</span>
            <span className="font-display text-[28px] leading-none">{p.price}</span>
          </div>
        );
      }),
    [odd],
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Btn pressed={odd} onClick={() => setOdd((o) => !o)}>
          Make one different
        </Btn>
        <Btn primary onClick={glance} disabled={phase === 'glance'}>
          Glance test (1s)
        </Btn>
      </div>
      <Stage className="mt-3 min-h-[150px]">
        {phase === 'ask' ? (
          <div>
            <p className="text-[15px] text-[var(--v-soft)]">Which plan do you remember?</p>
            <div role="group" aria-label="Which plan do you remember?" className="mt-3 flex flex-wrap gap-2">
              {PLANS.map((p) => (
                <Btn key={p.name} pressed={answer === p.name} onClick={() => setAnswer(p.name)}>
                  {p.name}
                </Btn>
              ))}
              <Btn onClick={() => setPhase('idle')}>Show again</Btn>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">{cards}</div>
        )}
      </Stage>
      <Readout>
        {answer
          ? answer === 'Plus' && odd
            ? 'You picked Plus, the odd one out.'
            : `You picked ${answer}. ${odd ? '' : 'With nothing different, memory is a coin toss.'}`
          : 'Only black and white. The difference does the work, not colour.'}
      </Readout>
    </div>
  );
}
