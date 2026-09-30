'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Stage } from './b-kit';
import { Btn, Range, Readout, Segmented, focusRing, useTimeouts } from './b-controls';
import { useInView, useReduce } from './context';

/* States and heuristics, demos H1 to H6. */

/* H1 Nielsen: fix the broken dialog ----------------------------------- */

const FIXES = [
  { id: 'status', name: 'Show status', h: '1. Visibility of system status' },
  { id: 'words', name: 'Plain words', h: '2. Match the real world' },
  { id: 'exit', name: 'Add a way out', h: '3. User control and freedom' },
  { id: 'prevent', name: 'Confirm first', h: '5. Error prevention' },
  { id: 'help', name: 'Say what happens', h: '10. Help and documentation' },
] as const;
type FixId = (typeof FIXES)[number]['id'];

const HEURISTICS = [
  'Visibility of system status',
  'Match between the system and the real world',
  'User control and freedom',
  'Consistency and standards',
  'Error prevention',
  'Recognition rather than recall',
  'Flexibility and efficiency of use',
  'Aesthetic and minimalist design',
  'Help users recognise, diagnose and recover from errors',
  'Help and documentation',
];

export function NielsenDemo() {
  const [fixed, setFixed] = useState<Set<FixId>>(new Set());
  const has = (id: FixId) => fixed.has(id);
  const toggle = (id: FixId) =>
    setFixed((f) => {
      const n = new Set(f);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <div role="group" aria-label="Fixes" className="flex flex-wrap gap-2">
        {FIXES.map((f) => (
          <Btn key={f.id} pressed={has(f.id)} onClick={() => toggle(f.id)}>
            {f.name}
          </Btn>
        ))}
      </div>
      <Stage className="mt-3">
        <div className="mx-auto max-w-[340px] border border-[var(--v-steel)] bg-[var(--v-surface)] p-4" aria-label="Mock dialog" role="group">
          {has('status') ? <p className="pixel mb-3 text-[16px] leading-[16px] text-[var(--v-dim)]">5 FILES · LAST SAVED 2 MIN AGO</p> : null}
          <p className="font-display text-[22px] leading-[1.15] text-[var(--v-ink)]">
            {has('words') ? 'Delete “Holiday photos”?' : 'ERR_0x3F: PURGE ENTITY?'}
          </p>
          <p className="mt-2 text-[14px] leading-[1.45] text-[var(--v-soft)]">
            {has('help') ? 'This removes 5 files. You can restore them from the bin for 30 days.' : 'See docs section 4.2.'}
          </p>
          {has('prevent') ? (
            <p className="mt-3 border border-[var(--v-steel)] px-2 py-1 text-[13px] text-[var(--v-dim)]">Type the name to confirm</p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            {has('exit') ? <span className="border border-[var(--v-steel)] px-3 py-1 text-[13px] text-[var(--v-soft)]">Cancel</span> : null}
            <span className="bg-[var(--v-ink)] px-3 py-1 text-[13px] text-[var(--v-bg)]">{has('words') ? 'Delete' : 'Proceed'}</span>
          </div>
        </div>
      </Stage>
      <Readout>
        SCORE {fixed.size}/5{fixed.size === 5 ? ' · a dialog you can trust' : ''}
      </Readout>
      <details className="mt-3">
        <summary className={`pixel cursor-pointer text-[16px] leading-[16px] text-[var(--v-soft)] ${focusRing}`}>ALL TEN HEURISTICS</summary>
        <ol className="mt-3 list-decimal space-y-1 pl-6 text-[14px] leading-[1.45] text-[var(--v-soft)]">
          {HEURISTICS.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}

/* H2 Feedback on every press ------------------------------------------ */

function SaveButton({ kind, latency }: { kind: 'none' | 'press' | 'full'; latency: number }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [presses, setPresses] = useState(0);
  const timers = useTimeouts();

  const press = () => {
    setPresses((p) => p + 1);
    if (state === 'busy') return;
    setState('busy');
    timers.later(() => {
      setState('done');
      timers.later(() => setState('idle'), 1400);
    }, latency);
  };

  const pressStyle = kind === 'none' ? '' : 'active:translate-y-[1px] active:bg-[var(--v-soft)]';
  let label: ReactNode = 'Save';
  if (kind === 'full' && state === 'busy') label = 'Saving…';
  if (kind === 'full' && state === 'done') label = 'Saved ✓';

  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
        {kind === 'none' ? 'NOTHING' : kind === 'press' ? 'PRESS ONLY' : 'PRESS + BUSY + DONE'}
      </p>
      <button
        type="button"
        onClick={press}
        aria-busy={kind === 'full' && state === 'busy'}
        className={`min-w-[112px] border border-[var(--v-ink)] bg-[var(--v-ink)] px-4 py-2 text-[14px] text-[var(--v-bg)] ${pressStyle} ${focusRing}`}
      >
        {label}
      </button>
      <p className="text-[13px] text-[var(--v-dim)]" aria-live="polite">
        {presses ? `pressed ${presses}×` : ' '}
      </p>
    </div>
  );
}

export function FeedbackDemo() {
  const [latency, setLatency] = useState(1200);
  const [round, setRound] = useState(0);
  return (
    <div>
      <Range label="SERVER" value={latency} min={0} max={3000} step={100} unit="ms" onChange={setLatency} />
      <Stage className="mt-3">
        <div key={round} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SaveButton kind="none" latency={latency} />
          <SaveButton kind="press" latency={latency} />
          <SaveButton kind="full" latency={latency} />
        </div>
      </Stage>
      <Readout>
        Watch the press count. With no feedback people press again.{' '}
        <button type="button" onClick={() => setRound((r) => r + 1)} className={`underline underline-offset-4 ${focusRing}`}>
          reset
        </button>
      </Readout>
    </div>
  );
}

/* H3 Affordance ------------------------------------------------------- */

const THINGS: { id: string; clickable: boolean; note: string; look: ReactNode }[] = [
  { id: 'a', clickable: false, note: 'plain text', look: <span className="text-[14px] text-[var(--v-soft)]">Settings</span> },
  { id: 'b', clickable: true, note: 'underlined link', look: <span className="text-[14px] text-[var(--v-ink)] underline underline-offset-4">Read more</span> },
  { id: 'c', clickable: true, note: 'bordered button', look: <span className="border border-[var(--v-ink)] px-3 py-1 text-[14px] text-[var(--v-ink)]">Save</span> },
  { id: 'd', clickable: false, note: 'a label dressed as a button', look: <span className="bg-[var(--v-steel)] px-3 py-1 text-[14px] text-[var(--v-ink)]">New</span> },
  { id: 'e', clickable: true, note: 'card with an arrow', look: <span className="border border-[var(--v-steel)] px-3 py-2 text-[14px] text-[var(--v-soft)]">Plans →</span> },
  { id: 'f', clickable: true, note: 'a link hiding as a heading', look: <span className="font-display text-[20px] text-[var(--v-ink)]">Pricing</span> },
];

export function AffordanceDemo() {
  const [guess, setGuess] = useState<Record<string, boolean>>({});
  const [reveal, setReveal] = useState(false);
  const right = THINGS.filter((t) => !!guess[t.id] === t.clickable).length;
  return (
    <div>
      <p className="text-[15px] leading-[1.5] text-[var(--v-soft)]">Tap the ones you think you could click. Then reveal.</p>
      <Stage className="mt-3">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THINGS.map((t) => {
            const on = !!guess[t.id];
            const wrong = reveal && on !== t.clickable;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${t.note}: I think this is clickable`}
                  onClick={() => !reveal && setGuess((g) => ({ ...g, [t.id]: !g[t.id] }))}
                  className={`flex h-[84px] w-full flex-col items-center justify-center gap-2 border ${focusRing} ${
                    on ? 'border-[var(--v-ink)]' : 'border-[var(--v-line)]'
                  } ${wrong ? 'border-dashed' : ''}`}
                >
                  {t.look}
                  <span className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
                    {reveal ? (t.clickable ? 'CLICKS' : 'STATIC') : on ? 'CLICK?' : ' '}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Stage>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Btn primary onClick={() => setReveal((r) => !r)}>
          {reveal ? 'Hide' : 'Reveal'}
        </Btn>
        {reveal ? (
          <Btn
            onClick={() => {
              setGuess({});
              setReveal(false);
            }}
          >
            Again
          </Btn>
        ) : null}
      </div>
      <Readout>{reveal ? `${right}/6 right. The label and the heading are the traps.` : 'Dashed border after reveal means a wrong guess.'}</Readout>
    </div>
  );
}

/* H4 Skeletons, not spinners ------------------------------------------ */

const POSTS = [
  { who: 'Ana', what: 'Shipped the new onboarding. Three steps instead of seven.' },
  { who: 'Theo', what: 'The pricing table now reads well on phones.' },
  { who: 'Mia', what: 'I cut the hero video. The page loads in half the time.' },
];

export function SkeletonDemo() {
  const [mode, setMode] = useState<'spinner' | 'skeleton'>('skeleton');
  const [latency, setLatency] = useState(1500);
  const [loading, setLoading] = useState(false);
  const timers = useTimeouts();
  const box = useRef<HTMLDivElement>(null);
  const onScreen = useInView(box);
  const reduced = useReduce();
  const animate = onScreen && !reduced;

  const reload = () => {
    timers.clear();
    setLoading(true);
    timers.later(() => setLoading(false), latency);
  };

  return (
    <div ref={box}>
      <Segmented
        label="Loading style"
        value={mode}
        onChange={setMode}
        options={[
          { id: 'spinner', name: 'Spinner' },
          { id: 'skeleton', name: 'Skeleton' },
        ]}
      />
      <div className="mt-3">
        <Range label="LATENCY" value={latency} min={300} max={4000} step={100} unit="ms" onChange={setLatency} />
      </div>
      <Stage className="mt-3 h-[236px]">
        <div aria-busy={loading} aria-live="polite">
          {!loading ? (
            <ul className="space-y-3">
              {POSTS.map((p) => (
                <li key={p.who} className="flex gap-3">
                  <span aria-hidden="true" className="pixel flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--v-steel)] text-[16px] leading-[16px]">
                    {p.who[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] text-[var(--v-ink)]">{p.who}</span>
                    <span className="block text-[13px] leading-[1.4] text-[var(--v-soft)]">{p.what}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : mode === 'spinner' ? (
            <div className="flex h-[200px] items-center justify-center">
              <span
                role="status"
                aria-label="Loading"
                className={`block h-8 w-8 rounded-full border-2 border-[var(--v-steel)] border-t-[var(--v-ink)] ${animate ? 'animate-spin' : ''}`}
              />
            </div>
          ) : (
            <ul className="space-y-3" role="status" aria-label="Loading posts">
              {POSTS.map((p) => (
                <li key={p.who} className={`flex gap-3 ${animate ? 'animate-pulse' : ''}`}>
                  <span className="h-9 w-9 shrink-0 bg-[var(--v-steel)]" />
                  <span className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                    <span className="block h-3 w-16 bg-[var(--v-steel)]" />
                    <span className="block h-3 w-full bg-[var(--v-steel)]" />
                    <span className="block h-3 w-2/3 bg-[var(--v-steel)]" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Stage>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Btn primary onClick={reload} disabled={loading}>
          Reload feed
        </Btn>
      </div>
      <Readout>{mode === 'skeleton' ? 'The page has its shape already. The wait feels shorter.' : 'A spinner tells you nothing about what is coming.'}</Readout>
    </div>
  );
}

/* H5 Empty and error states ------------------------------------------- */

export function EmptyErrorDemo() {
  const [state, setState] = useState<'empty' | 'error' | 'filled'>('empty');
  const [keep, setKeep] = useState(true);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');

  return (
    <div>
      <Segmented
        label="List state"
        value={state}
        onChange={setState}
        options={[
          { id: 'empty', name: 'Empty' },
          { id: 'error', name: 'Error' },
          { id: 'filled', name: 'Filled' },
        ]}
      />
      <Stage className="mt-3 min-h-[140px]">
        {state === 'empty' ? (
          <div className="flex flex-col items-start gap-2">
            <p className="font-display text-[22px] leading-[1.15] text-[var(--v-ink)]">No projects yet</p>
            <p className="text-[14px] text-[var(--v-soft)]">Projects keep your files together. Make your first one in a minute.</p>
            <Btn primary onClick={() => setState('filled')}>
              New project
            </Btn>
          </div>
        ) : null}
        {state === 'error' ? (
          <div className="flex flex-col items-start gap-2" role="alert">
            <p className="font-display text-[22px] leading-[1.15] text-[var(--v-ink)]">I couldn&rsquo;t load your projects</p>
            <p className="text-[14px] text-[var(--v-soft)]">Your files are safe. Check your connection, then try again.</p>
            <Btn onClick={() => setState('filled')}>Try again</Btn>
          </div>
        ) : null}
        {state === 'filled' ? (
          <ul className="divide-y divide-[var(--v-line)] text-[14px] text-[var(--v-soft)]">
            {['Brand refresh', 'Spring campaign', 'Onboarding'].map((p) => (
              <li key={p} className="py-2">
                {p}
              </li>
            ))}
          </ul>
        ) : null}
      </Stage>
      <form
        className="mt-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setErr('That email already has an account. Sign in, or try another one.');
          if (!keep) setEmail('');
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Btn pressed={keep} onClick={() => setKeep((k) => !k)}>
            Keep what I typed
          </Btn>
        </div>
        <label htmlFor="ee-email" className="pixel mt-3 block text-[16px] leading-[16px] text-[var(--v-dim)]">
          Email
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="ee-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!err}
            aria-describedby={err ? 'ee-err' : undefined}
            placeholder="you@example.com"
            className={`min-w-0 flex-1 border bg-[var(--v-bg)] px-2 py-1 text-[14px] text-[var(--v-ink)] placeholder:text-[var(--v-dim)] ${
              err ? 'border-[var(--v-ink)]' : 'border-[var(--v-steel)]'
            } ${focusRing}`}
          />
          <button type="submit" className={`border border-[var(--v-ink)] px-3 text-[14px] text-[var(--v-ink)] ${focusRing}`}>
            Join
          </button>
        </div>
        <p id="ee-err" className="mt-2 min-h-[20px] text-[13px] text-[var(--v-ink)]" aria-live="polite">
          {err ? `✕ ${err}` : ''}
        </p>
      </form>
      <Readout>{keep ? 'The error says what to do, and your typing survives.' : 'Turn keep off and submit. Losing your input is the worst error.'}</Readout>
    </div>
  );
}

/* H6 Optimistic UI ---------------------------------------------------- */

type Item = { id: number; text: string; saving: boolean };

export function OptimisticDemo() {
  const [mode, setMode] = useState<'optimistic' | 'wait'>('optimistic');
  const [fail, setFail] = useState(false);
  const [items, setItems] = useState<Item[]>([
    { id: 1, text: 'Book the venue', saving: false },
    { id: 2, text: 'Send the brief', saving: false },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; undo?: Item & { index: number } } | null>(null);
  const timers = useTimeouts();
  const nextId = useRef(3);
  const LATENCY = 1500;

  const say = (msg: string, undo?: Item & { index: number }) => {
    setToast({ msg, undo });
    timers.later(() => setToast((t) => (t && t.msg === msg ? null : t)), 4000);
  };

  const add = () => {
    const text = draft.trim();
    if (!text || busy) return;
    const item = { id: nextId.current++, text, saving: true };
    setDraft('');
    if (mode === 'optimistic') {
      setItems((xs) => [...xs, item]);
      timers.later(() => {
        if (fail) {
          setItems((xs) => xs.filter((x) => x.id !== item.id));
          say(`Couldn't save “${text}”. I've put it back in the box.`);
          setDraft(text);
        } else setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, saving: false } : x)));
      }, LATENCY);
    } else {
      setBusy(true);
      timers.later(() => {
        setBusy(false);
        if (fail) {
          say(`Couldn't save “${text}”.`);
          setDraft(text);
        } else setItems((xs) => [...xs, { ...item, saving: false }]);
      }, LATENCY);
    }
  };

  const remove = (id: number) => {
    const index = items.findIndex((x) => x.id === id);
    if (index < 0) return;
    const gone = items[index];
    setItems((xs) => xs.filter((x) => x.id !== id));
    say(`Deleted “${gone.text}”.`, { ...gone, index });
  };
  const undo = () => {
    const u = toast?.undo;
    if (!u) return;
    setItems((xs) => {
      const copy = [...xs];
      copy.splice(Math.min(u.index, copy.length), 0, { id: u.id, text: u.text, saving: false });
      return copy;
    });
    setToast(null);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Segmented
          label="Update style"
          value={mode}
          onChange={setMode}
          options={[
            { id: 'optimistic', name: 'Optimistic' },
            { id: 'wait', name: 'Wait for server' },
          ]}
        />
        <Btn pressed={fail} onClick={() => setFail((f) => !f)}>
          Server fails
        </Btn>
      </div>
      <Stage className="mt-3 min-h-[210px]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="flex gap-2"
        >
          <label htmlFor="opt-new" className="sr-only">
            New task
          </label>
          <input
            id="opt-new"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a task"
            disabled={busy}
            className={`min-w-0 flex-1 border border-[var(--v-steel)] bg-[var(--v-bg)] px-2 py-1 text-[14px] text-[var(--v-ink)] placeholder:text-[var(--v-dim)] disabled:opacity-50 ${focusRing}`}
          />
          <button type="submit" disabled={busy} className={`border border-[var(--v-ink)] px-3 text-[14px] text-[var(--v-ink)] disabled:opacity-50 ${focusRing}`}>
            {busy ? 'Saving…' : 'Add'}
          </button>
        </form>
        <ul className="mt-3 divide-y divide-[var(--v-line)]">
          {items.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2 py-2">
              <span className={`min-w-0 truncate text-[14px] ${x.saving ? 'text-[var(--v-dim)]' : 'text-[var(--v-ink)]'}`}>
                {x.text}
                {x.saving ? <span className="pixel ml-2 text-[16px] leading-[16px]">SAVING</span> : null}
              </span>
              <button
                type="button"
                onClick={() => remove(x.id)}
                aria-label={`Delete ${x.text}`}
                className={`pixel shrink-0 px-2 text-[16px] leading-[16px] text-[var(--v-dim)] hover:text-[var(--v-ink)] ${focusRing}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 min-h-[36px]" aria-live="polite">
          {toast ? (
            <div className="flex items-center justify-between gap-2 border border-[var(--v-steel)] bg-[var(--v-surface)] px-3 py-2 text-[13px] text-[var(--v-soft)]">
              <span className="min-w-0">{toast.msg}</span>
              {toast.undo ? (
                <button type="button" onClick={undo} className={`pixel shrink-0 text-[16px] leading-[16px] text-[var(--v-ink)] underline ${focusRing}`}>
                  UNDO
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Stage>
      <Readout>
        {mode === 'optimistic' ? 'It shows up now and saves behind the scenes. If it fails, I say so and give it back.' : 'Every add costs you 1.5 seconds of staring.'}
      </Readout>
    </div>
  );
}
