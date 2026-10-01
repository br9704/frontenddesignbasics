'use client';

/*
 * Micro-interaction Bench: six everyday components, each shown in every state side by side.
 *  - Every state cell is the same markup with a data-v attribute; CSS draws the state and CSS
 *    transitions draw the change. Labels that swap (Save / Saved / Try again) sit in one grid cell, so
 *    the widest one sets the width and nothing jumps.
 *  - A GSAP timeline flips data-v from 'rest' into each state (gsap.set attr), so you watch every
 *    transition happen. With progress defined the timeline is scrubbed instead of looped.
 *  - Slow-mo x0.25: one CSS variable (--k) multiplies every duration, and the timeline's timeScale drops.
 *  - The first cell of each row is live: a real component you can use.
 */

import gsap from 'gsap';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner } from './g3-kit';

const TOOLS = ['gsap', 'css'];
const STATES = ['rest', 'hover', 'focus', 'active', 'loading', 'success', 'error', 'disabled'] as const;
type State = (typeof STATES)[number];
/** 'open' is the live toast on screen with its timer running */
type V = State | 'open';
const LABEL: Record<State, string> = {
  rest: 'rest',
  hover: 'hover',
  focus: 'focus-visible',
  active: 'pressed',
  loading: 'loading',
  success: 'success',
  error: 'error',
  disabled: 'disabled',
};

type RowId = 'btn' | 'tgl' | 'chk' | 'tabs' | 'inp' | 'toast';
const ROWS: { id: RowId; name: string; short: string; note: string }[] = [
  { id: 'btn', name: 'Button', short: 'Button', note: 'Stack every label in one grid cell, so the width never jumps while it loads.' },
  { id: 'tgl', name: 'Toggle', short: 'Toggle', note: 'The knob stretches on press and settles on release. That is what makes it feel physical.' },
  { id: 'chk', name: 'Checkbox', short: 'Check', note: 'Draw the tick with stroke-dashoffset, so it reads as a mark being made.' },
  { id: 'tabs', name: 'Tabs', short: 'Tabs', note: 'The indicator slides between tabs instead of blinking, so you see where you went.' },
  { id: 'inp', name: 'Text input', short: 'Input', note: 'Check it when the field loses focus, not on every key, and say how to fix it.' },
  { id: 'toast', name: 'Toast', short: 'Toast', note: 'Pause the timer on hover and focus, so nobody loses the message.' },
];

/* ───────────────────────── CSS ───────────────────────── */

// hover / focus-visible / pressed also answer to the real pseudo-classes on the live cell while it is idle.
const PSEUDO: Partial<Record<State, string>> = { hover: ':hover', focus: ':focus-visible', active: ':active' };
function S(cls: string, st: State, tail = '') {
  const base = `.mb .${cls}[data-v="${st}"]${tail}`;
  const p = PSEUDO[st];
  return p ? `${base}, .mb .mb-live .${cls}[data-v="rest"]${p}${tail}` : base;
}

const CSS = `
.mb{--k:1;--e:cubic-bezier(.2,.8,.2,1);--hi:#1d1d1d}
.mb[data-slow="1"]{--k:4}
.mb[data-rm="1"]{--k:0}
.mb[data-rm="1"] *{animation:none !important}
.mb[data-active="0"] *{animation-play-state:paused !important}
.mb .mb-c,.mb .mb-c *{transition-duration:calc(var(--k) * 170ms);transition-timing-function:var(--e);
  transition-property:background-color,border-color,color,opacity,transform,box-shadow,outline-color,left,width,stroke-dashoffset}
.mb .mb-c{outline:2px solid transparent;outline-offset:2px;-webkit-tap-highlight-color:transparent}
.mb .stk{display:grid;align-items:center;justify-items:center}
.mb .stk>*{grid-area:1/1}
.mb .lb{opacity:0;transform:translateY(5px)}
.mb .spin{display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:mb-rot calc(var(--k) * 700ms) linear infinite}
@keyframes mb-rot{to{transform:rotate(360deg)}}
@keyframes mb-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
@keyframes mb-blink{50%{opacity:0}}
@keyframes mb-drain{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@keyframes mb-pulse{50%{opacity:.35}}

/* button */
.mb .mb-btn{font-weight:600;font-size:13px;line-height:1;height:34px;padding:0 14px;border:1px solid var(--v-steel);background:transparent;color:var(--v-ink);cursor:pointer}
.mb .mb-btn .ok{display:inline-flex;align-items:center;gap:5px}
${S('mb-btn', 'hover')}{background:var(--hi);border-color:var(--v-soft)}
${S('mb-btn', 'focus')}{outline-color:var(--v-ink)}
${S('mb-btn', 'active')}{transform:translateY(1px) scale(.96);background:#2a2a2a}
.mb .mb-btn[data-v="loading"]{border-color:var(--v-dim);cursor:progress}
.mb .mb-btn[data-v="success"]{background:var(--v-ink);color:var(--v-bg);border-color:var(--v-ink)}
.mb .mb-btn[data-v="error"]{border-style:dashed;border-color:var(--v-ink);animation:mb-shake calc(var(--k) * 380ms) 1}
.mb .mb-btn[data-v="disabled"]{opacity:.32;cursor:not-allowed}
.mb .mb-btn:not([data-v="loading"]):not([data-v="success"]):not([data-v="error"]) .l-rest,
.mb .mb-btn[data-v="loading"] .l-load,.mb .mb-btn[data-v="success"] .l-ok,.mb .mb-btn[data-v="error"] .l-err{opacity:1;transform:none}

/* toggle */
.mb .mb-tgl{position:relative;width:48px;height:26px;border-radius:13px;border:1px solid var(--v-steel);background:#141414;cursor:pointer;padding:0}
.mb .mb-tgl .knob{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:9px;background:var(--v-soft);color:var(--v-bg);display:grid;place-items:center}
.mb .mb-tgl .knob .spin{width:10px;height:10px;opacity:0}
${S('mb-tgl', 'hover')}{border-color:var(--v-soft)}
${S('mb-tgl', 'hover', ' .knob')}{background:var(--v-ink)}
${S('mb-tgl', 'focus')}{outline-color:var(--v-ink)}
${S('mb-tgl', 'active', ' .knob')}{width:25px;background:var(--v-ink)}
.mb .mb-tgl[data-v="loading"] .knob{left:15px;background:var(--v-ink)}
.mb .mb-tgl[data-v="loading"] .knob .spin{opacity:1}
.mb .mb-tgl[data-v="success"]{background:var(--v-ink);border-color:var(--v-ink)}
.mb .mb-tgl[data-v="success"] .knob{left:26px;background:var(--v-bg)}
.mb .mb-tgl[data-v="error"]{border-style:dashed;border-color:var(--v-ink);animation:mb-shake calc(var(--k) * 380ms) 1}
.mb .mb-tgl[data-v="disabled"]{opacity:.32;cursor:not-allowed}

/* checkbox */
.mb .mb-chk{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--v-ink);background:none;border:0;padding:2px;cursor:pointer}
.mb .mb-chk .box{position:relative;width:18px;height:18px;border:1.5px solid var(--v-dim);display:grid;place-items:center;flex:none}
.mb .mb-chk .box svg{position:absolute;left:1px;top:1px;width:13px;height:13px}
.mb .mb-chk .tick{fill:none;stroke:var(--v-bg);stroke-width:2.4;stroke-linecap:square;stroke-dasharray:1;stroke-dashoffset:1;transition-duration:calc(var(--k) * 280ms)}
.mb .mb-chk .dash{width:8px;height:2px;background:var(--v-ink);opacity:0}
.mb .mb-chk .t-err{text-decoration:underline dashed;text-underline-offset:3px}
${S('mb-chk', 'hover', ' .box')}{border-color:var(--v-ink);background:var(--hi)}
${S('mb-chk', 'focus')}{outline-color:var(--v-ink)}
${S('mb-chk', 'active', ' .box')}{transform:scale(.84)}
.mb .mb-chk[data-v="loading"] .dash{opacity:1;animation:mb-pulse calc(var(--k) * 800ms) ease-in-out infinite}
.mb .mb-chk[data-v="success"] .box{background:var(--v-ink);border-color:var(--v-ink)}
.mb .mb-chk[data-v="success"] .tick{stroke-dashoffset:0}
.mb .mb-chk[data-v="error"] .box{border-style:dashed;border-color:var(--v-ink);animation:mb-shake calc(var(--k) * 380ms) 1}
.mb .mb-chk[data-v="disabled"]{opacity:.32;cursor:not-allowed}
.mb .mb-chk:not([data-v="error"]) .t-rest,.mb .mb-chk[data-v="error"] .t-err{opacity:1;transform:none}

/* tabs */
.mb .mb-tabs{position:relative;display:flex;font-size:12px;border-bottom:1px solid var(--v-steel)}
.mb .mb-tabs .tab{width:38px;height:28px;background:none;border:0;color:var(--v-dim);cursor:pointer;padding:0;outline:2px solid transparent;outline-offset:-2px}
.mb .mb-tabs .t0{color:var(--v-ink)}
.mb .mb-tabs .ind{position:absolute;left:5px;bottom:-1px;width:28px;height:2px;background:var(--v-ink);transform:translateX(0)}
${S('mb-tabs', 'hover', ' .t1')}{color:var(--v-ink);background:var(--hi)}
${S('mb-tabs', 'focus', ' .t1')}{outline-color:var(--v-ink)}
${S('mb-tabs', 'active', ' .t1')}{transform:translateY(1px);background:#2a2a2a;color:var(--v-ink)}
.mb .mb-tabs[data-v="loading"] .ind{transform:translateX(38px);animation:mb-pulse calc(var(--k) * 700ms) ease-in-out infinite}
.mb .mb-tabs[data-v="loading"] .t0,.mb .mb-tabs[data-v="success"] .t0{color:var(--v-dim)}
.mb .mb-tabs[data-v="loading"] .t1,.mb .mb-tabs[data-v="success"] .t1{color:var(--v-ink)}
.mb .mb-tabs[data-v="success"] .ind{transform:translateX(38px)}
.mb .mb-tabs[data-v="error"] .t1{color:var(--v-ink);text-decoration:underline dashed;text-underline-offset:4px;animation:mb-shake calc(var(--k) * 380ms) 1}
.mb .mb-tabs[data-v="disabled"] .t2{opacity:.3;cursor:not-allowed;text-decoration:line-through}
.mb .mb-live .mb-tabs .tab{color:var(--v-dim)}
.mb .mb-live .mb-tabs .tab[aria-selected="true"]{color:var(--v-ink)}
.mb .mb-live .mb-tabs .tab:hover{color:var(--v-ink);background:var(--hi)}
.mb .mb-live .mb-tabs .tab:focus-visible{outline-color:var(--v-ink)}
.mb .mb-live .mb-tabs .tab:active{transform:translateY(1px)}
.mb .mb-live .mb-tabs .ind{transform:translateX(calc(var(--i) * 38px))}

/* input */
.mb .mb-inp{display:flex;flex-direction:column;gap:4px;width:124px;outline:0}
.mb .mb-inp .field{position:relative;display:flex;align-items:center;height:32px;padding:0 8px;border:1px solid var(--v-steel);background:#0e0e0e;font-size:12px;color:var(--v-ink);outline:2px solid transparent;outline-offset:2px}
.mb .mb-inp .val{justify-items:start;flex:1;min-width:0;white-space:nowrap}
.mb .mb-inp .ph{color:var(--v-dim)}
.mb .mb-inp .caret{display:inline-block;vertical-align:middle;width:1px;height:14px;background:var(--v-ink);margin-left:1px;opacity:0}
.mb .mb-inp .end{width:14px;flex:none}
.mb .mb-inp .end>*{opacity:0}
.mb .mb-inp .end svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2.2}
.mb .mb-inp .msg{font-size:11px;line-height:13px;height:13px;color:var(--v-dim);justify-items:start;white-space:nowrap}
.mb .mb-inp input{all:unset;flex:1;min-width:0;font-size:12px;color:var(--v-ink)}
.mb .mb-inp input::placeholder{color:var(--v-dim)}
${S('mb-inp', 'hover', ' .field')}{border-color:var(--v-soft)}
.mb .mb-inp[data-v="focus"] .field,.mb .mb-live .mb-inp .field:focus-within{outline-color:var(--v-ink);border-color:var(--v-soft)}
.mb .mb-inp[data-v="focus"] .caret,.mb .mb-inp[data-v="active"] .caret{opacity:1;animation:mb-blink calc(var(--k) * 1000ms) steps(1) infinite}
.mb .mb-inp[data-v="active"] .field{border-color:var(--v-soft)}
.mb .mb-inp[data-v="loading"] .end .spin,.mb .mb-inp[data-v="success"] .end .ok,.mb .mb-inp[data-v="error"] .end .bang{opacity:1}
.mb .mb-inp[data-v="loading"] .field{color:var(--v-soft)}
.mb .mb-inp[data-v="error"] .field{border-style:dashed;border-color:var(--v-ink);animation:mb-shake calc(var(--k) * 380ms) 1}
.mb .mb-inp[data-v="error"] .msg,.mb .mb-inp[data-v="success"] .msg{color:var(--v-soft)}
.mb .mb-inp[data-v="disabled"]{opacity:.32}
.mb .mb-inp[data-v="disabled"] .field{background:transparent;border-style:dotted}
.mb .mb-inp .v-ph,.mb .mb-inp .m-none{opacity:1;transform:none}
.mb .mb-inp[data-v="focus"] .v-ph.ph,.mb .mb-inp[data-v="active"] .v-ph,.mb .mb-inp[data-v="loading"] .v-ph,.mb .mb-inp[data-v="success"] .v-ph,.mb .mb-inp[data-v="error"] .v-ph{opacity:0}
.mb .mb-inp[data-v="focus"] .v-cur{opacity:1;transform:none}
.mb .mb-inp .v-cur{opacity:0}
.mb .mb-inp[data-v="active"] .v-typ,.mb .mb-inp[data-v="error"] .v-typ,.mb .mb-inp[data-v="loading"] .v-full,.mb .mb-inp[data-v="success"] .v-full{opacity:1;transform:none}
.mb .mb-inp[data-v="error"] .m-none,.mb .mb-inp[data-v="success"] .m-none{opacity:0}
.mb .mb-inp[data-v="error"] .m-err,.mb .mb-inp[data-v="success"] .m-ok{opacity:1;transform:none}

/* toast */
.mb .mb-toast{position:relative;width:132px;height:44px;outline:0}
.mb .mb-toast .ghost{position:absolute;inset:0;display:grid;place-items:center;border:1px dashed var(--v-steel);font-size:11px;color:var(--v-dim)}
.mb .mb-toast .card{position:absolute;inset:0;display:flex;align-items:center;gap:6px;padding:0 8px;background:var(--v-ink);color:var(--v-bg);font-size:12px;font-weight:600;opacity:0;transform:translateY(10px) scale(.96);overflow:hidden}
.mb .mb-toast .txt{flex:1;justify-items:start;white-space:nowrap}
.mb .mb-toast .act{font-size:11px;font-weight:700;text-decoration:underline;text-underline-offset:2px;background:none;border:0;color:inherit;padding:2px 3px;cursor:pointer;outline:2px solid transparent;outline-offset:1px}
.mb .mb-toast .bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--v-bg);transform-origin:left;opacity:.55;animation:mb-drain calc(var(--k) * 3000ms) linear infinite}
.mb .mb-live .mb-toast .bar{animation-iteration-count:1;animation-fill-mode:forwards}
.mb .mb-toast .act .spin{width:10px;height:10px}
.mb .mb-toast:not([data-v="rest"]) .card{opacity:1;transform:none}
.mb .mb-toast:not([data-v="rest"]) .ghost{opacity:0}
.mb .mb-toast[data-v="hover"] .card{transform:translateY(-2px);box-shadow:0 6px 0 -2px var(--v-steel)}
.mb .mb-toast[data-v="hover"] .bar,.mb .mb-live .mb-toast .card:hover .bar,.mb .mb-live .mb-toast .card:focus-within .bar{animation-play-state:paused}
.mb .mb-toast[data-v="focus"] .act,.mb .mb-live .mb-toast .act:focus-visible{outline-color:var(--v-bg)}
.mb .mb-toast[data-v="active"] .act,.mb .mb-live .mb-toast .act:active{transform:translateY(1px) scale(.94);background:#d6d6d6}
.mb .mb-toast[data-v="error"] .card{animation:mb-shake calc(var(--k) * 380ms) 1;background:var(--v-bg);color:var(--v-ink);border:1px dashed var(--v-ink)}
.mb .mb-toast[data-v="error"] .bar{background:var(--v-ink)}
.mb .mb-toast[data-v="disabled"] .act{opacity:.35;text-decoration:none;cursor:not-allowed}
.mb .mb-toast[data-v="disabled"] .bar,.mb .mb-toast[data-v="loading"] .bar{animation:none;transform:scaleX(0)}
.mb .mb-toast .x-rest,.mb .mb-toast .a-undo{opacity:1;transform:none}
.mb .mb-toast[data-v="loading"] .x-rest,.mb .mb-toast[data-v="success"] .x-rest,.mb .mb-toast[data-v="error"] .x-rest{opacity:0}
.mb .mb-toast[data-v="loading"] .x-load,.mb .mb-toast[data-v="success"] .x-ok,.mb .mb-toast[data-v="error"] .x-err{opacity:1;transform:none}
.mb .mb-toast[data-v="loading"] .a-undo,.mb .mb-toast[data-v="error"] .a-undo,.mb .mb-toast[data-v="success"] .a-undo{opacity:0}
.mb .mb-toast[data-v="loading"] .a-load,.mb .mb-toast[data-v="error"] .a-retry{opacity:1;transform:none}
`;

/* ───────────────────────── components ───────────────────────── */

interface LiveApi {
  btn: () => void;
  tgl: () => void;
  chk: () => void;
  tab: number;
  setTab: (i: number) => void;
  text: string;
  setText: (s: string) => void;
  check: () => void;
  undo: () => void;
  toastKey: number;
}

const TickPath = ({ className }: { className?: string }) => <path className={className} d="M2.5 7.5l3 3 6-7" pathLength={1} />;

/** One component drawn in a state. `live` wires the real handlers; state cells are inert pictures. */
function Comp({ id, v, live }: { id: RowId; v: V; live?: LiveApi }) {
  const t = live ? 0 : -1;
  switch (id) {
    case 'btn':
      return (
        <button
          type="button"
          className="mb-c mb-btn"
          data-v={v}
          tabIndex={t}
          disabled={live ? v === 'disabled' : undefined}
          aria-busy={live ? v === 'loading' : undefined}
          onClick={live?.btn}
        >
          <span className="stk">
            <span className="lb l-rest">Save</span>
            <span className="lb l-load">
              <i className="spin" />
            </span>
            <span className="lb l-ok ok">
              <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden>
                <path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" />
              </svg>
              Saved
            </span>
            <span className="lb l-err">Try again</span>
          </span>
        </button>
      );
    case 'tgl':
      return (
        <button
          type="button"
          role="switch"
          aria-checked={live ? v === 'success' : undefined}
          aria-label={live ? 'Notifications' : undefined}
          className="mb-c mb-tgl"
          data-v={v}
          tabIndex={t}
          onClick={live?.tgl}
        >
          <span className="knob">
            <i className="spin" />
          </span>
        </button>
      );
    case 'chk':
      return (
        <button
          type="button"
          role="checkbox"
          aria-checked={live ? v === 'success' : undefined}
          className="mb-c mb-chk"
          data-v={v}
          tabIndex={t}
          onClick={live?.chk}
        >
          <span className="box">
            <svg viewBox="0 0 14 14" aria-hidden>
              <TickPath className="tick" />
            </svg>
            <i className="dash" />
          </span>
          <span className="stk">
            <span className="lb t-rest">Agree</span>
            <span className="lb t-err">Required</span>
          </span>
        </button>
      );
    case 'tabs':
      return (
        <div className="mb-c mb-tabs" data-v={v} role={live ? 'tablist' : undefined} style={{ '--i': live?.tab ?? 0 } as CSSProperties}>
          {['Day', 'Week', 'Year'].map((l, i) => (
            <button
              key={l}
              type="button"
              role={live ? 'tab' : undefined}
              aria-selected={live ? live.tab === i : undefined}
              className={`tab t${i}`}
              tabIndex={t}
              onClick={live ? () => live.setTab(i) : undefined}
            >
              {l}
            </button>
          ))}
          <i className="ind" />
        </div>
      );
    case 'inp':
      return (
        <div className="mb-c mb-inp" data-v={v}>
          <span className="field">
            {live ? (
              <input
                type="email"
                aria-label="Email"
                placeholder="email"
                value={live.text}
                onChange={(e) => live.setText(e.target.value)}
                onBlur={live.check}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <span className="stk val">
                <span className="lb v-ph ph">email</span>
                <span className="lb v-cur">
                  <i className="caret" style={{ marginLeft: 0 }} />
                </span>
                <span className="lb v-typ">
                  hi@
                  <i className="caret" />
                </span>
                <span className="lb v-full">hi@site.io</span>
              </span>
            )}
            <span className="stk end">
              <i className="spin" style={{ width: 10, height: 10 }} />
              <svg viewBox="0 0 14 14" className="ok" aria-hidden>
                <path d="M2.5 7.5l3 3 6-7" />
              </svg>
              <b className="bang">!</b>
            </span>
          </span>
          <span className="stk msg" aria-live={live ? 'polite' : undefined}>
            <span className="lb m-none">&nbsp;</span>
            <span className="lb m-err">Add a domain after @</span>
            <span className="lb m-ok">Looks good</span>
          </span>
        </div>
      );
    case 'toast':
      return (
        <div className="mb-c mb-toast" data-v={v}>
          <span className="ghost">no toast</span>
          <span className="card" role={live && v !== 'rest' ? 'status' : undefined}>
            <span className="stk txt">
              <span className="lb x-rest">Saved</span>
              <span className="lb x-load">Undoing</span>
              <span className="lb x-ok">Undone</span>
              <span className="lb x-err">Not saved</span>
            </span>
            <button
              type="button"
              className="act stk"
              tabIndex={live && v === 'open' ? 0 : -1}
              onClick={live?.undo}
              disabled={live ? v !== 'open' : undefined}
            >
              <span className="lb a-undo">Undo</span>
              <span className="lb a-load">
                <i className="spin" />
              </span>
              <span className="lb a-retry">Retry</span>
            </button>
            <i className="bar" key={live?.toastKey} />
          </span>
        </div>
      );
  }
}

/* ───────────────────────── live cell ───────────────────────── */

function LiveCell({ id, slow, reduced }: { id: RowId; slow: boolean; reduced: boolean }) {
  const [v, setV] = useState<V>('rest');
  const [tab, setTab] = useState(0);
  const [text, setText] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const timers = useRef<number[]>([]);
  const clicks = useRef(0);
  const k = slow ? 4 : 1;
  const later = useCallback(
    (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms * k));
    },
    [k],
  );
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const api: LiveApi = {
    // every third save fails, so the error path shows up too
    btn: () => {
      if (v !== 'rest') return;
      clicks.current++;
      setV('loading');
      later(900, () => {
        setV(clicks.current % 3 === 0 ? 'error' : 'success');
        later(1400, () => setV('rest'));
      });
    },
    tgl: () => {
      if (v === 'loading') return;
      clear();
      if (v === 'success') return setV('rest');
      setV('loading');
      later(450, () => setV('success'));
    },
    chk: () => setV((s) => (s === 'success' ? 'rest' : 'success')),
    tab,
    setTab,
    text,
    setText: (s) => {
      setText(s);
      if (v === 'error' || v === 'success') setV('rest');
    },
    check: () => {
      clear();
      if (!text) return setV('rest');
      setV('loading');
      later(500, () => setV(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text) ? 'success' : 'error'));
    },
    undo: () => {
      clear();
      setV('loading');
      later(700, () => {
        setV('success');
        later(1500, () => setV('rest'));
      });
    },
    toastKey,
  };

  // The toast needs something to raise it: a small trigger under it. Its timer is the CSS bar, which
  // pauses on hover and focus; the close waits for the bar, not a fixed timeout.
  if (id === 'toast') {
    const show = () => {
      clear();
      setToastKey((n) => n + 1);
      setV('open');
      // reduced motion has no draining bar to wait for
      if (reduced) later(3000, () => setV('rest'));
    };
    return (
      <div className="flex flex-col items-center gap-2">
        <div onAnimationEnd={(e) => (e.target as HTMLElement).classList.contains('bar') && v === 'open' && setV('rest')}>
          <Comp id="toast" v={v} live={api} />
        </div>
        <button
          type="button"
          onClick={show}
          className="pixel text-[16px] leading-[16px] text-[var(--v-soft)] underline underline-offset-4 hover:text-[var(--v-ink)]"
        >
          show toast
        </button>
      </div>
    );
  }
  return <Comp id={id} v={v} live={api} />;
}

/* ───────────────────────── bench ───────────────────────── */

function Row({ row, reduced, slow, compact }: { row: (typeof ROWS)[number]; reduced: boolean; slow: boolean; compact: boolean }) {
  return (
    <section className="flex flex-col gap-2" aria-label={row.name}>
      {!compact && (
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">{row.name}</p>
          <p className="min-w-0 text-[13px] leading-[18px] text-[var(--v-soft)]">{row.note}</p>
        </div>
      )}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))' }}>
        <div className="mb-live flex min-h-[96px] flex-col border border-[var(--v-steel)] bg-[#0d0d0d]">
          <span className="pixel px-1.5 pt-1 text-[16px] leading-[16px] text-[var(--v-ink)]">try it</span>
          <div className="flex flex-1 items-center justify-center px-1 py-2">
            <LiveCell id={row.id} slow={slow} reduced={reduced} />
          </div>
        </div>
        {STATES.map((s) => (
          <div key={s} className="flex min-h-[96px] flex-col border border-[var(--v-line)]" aria-hidden>
            <span className="pixel px-1.5 pt-1 text-[16px] leading-[16px] text-[var(--v-dim)]">{LABEL[s]}</span>
            <div className="pointer-events-none flex flex-1 items-center justify-center px-1 py-2" data-demo={s}>
              <Comp id={row.id} v={reduced ? s : 'rest'} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function MicroBench({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const [slow, setSlow] = useState(false);
  const [w, setW] = useState(0);
  const [pick, setPick] = useState(0);
  const driven = progress !== undefined;
  const compact = w > 0 && w < 700;
  const p = Math.min(1, Math.max(0, progress ?? 0));

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // On a phone one component shows at a time; progress walks through the six.
  const row = compact && driven ? Math.min(ROWS.length - 1, Math.floor(p * ROWS.length)) : pick;

  // The demo: flip each state cell from rest into its state, left to right, then back to rest.
  // Scrubbed by progress when the page drives it, looped otherwise.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || reducedMotion || w === 0) return;
    const ctx = gsap.context(() => {
      const t = gsap.timeline({ paused: true, repeat: driven ? 0 : -1 });
      el.querySelectorAll<HTMLElement>('[data-demo]').forEach((c) => {
        const target = c.firstElementChild;
        const s = c.dataset.demo as State;
        if (!target || s === 'rest') return;
        const j = STATES.indexOf(s);
        if (driven) {
          t.set(target, { attr: { 'data-v': s } }, 0.2 + j * 0.7);
        } else {
          t.set(target, { attr: { 'data-v': s } }, 0.3 + j * 0.18);
          t.set(target, { attr: { 'data-v': 'rest' } }, 4.6 + j * 0.06);
        }
      });
      t.to({}, { duration: driven ? 5.4 : 5.8 }, 0);
      tl.current = t;
    }, el);
    return () => {
      tl.current = null;
      ctx.revert();
    };
  }, [reducedMotion, driven, compact, row, w === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = tl.current;
    if (!t) return;
    t.timeScale(slow ? 0.25 : 1);
    if (driven) {
      // within a phone's single row the whole sweep replays per row
      t.progress(compact ? (p * ROWS.length) % 1 || (p >= 1 ? 1 : 0) : p);
      return;
    }
    if (active) t.play();
    else t.pause();
  }, [active, slow, driven, p, reducedMotion, compact, row, w]);

  // progress also scrolls the list on wider screens
  useEffect(() => {
    if (!driven || compact || !scroller.current) return;
    const s = scroller.current;
    s.scrollTop = p * Math.max(0, s.scrollHeight - s.clientHeight);
  }, [driven, p, compact, w]);

  const rows = compact ? [ROWS[row]] : ROWS;

  return (
    <div
      ref={host}
      className="mb relative h-full w-full overflow-hidden bg-[var(--v-bg)] font-sans text-[var(--v-ink)]"
      data-slow={slow ? 1 : 0}
      data-rm={reducedMotion ? 1 : 0}
      data-active={active ? 1 : 0}
    >
      <style>{CSS}</style>
      <Corner title="Micro-interaction Bench" tools={TOOLS} />
      <button
        type="button"
        aria-pressed={slow}
        aria-label="Slow motion, quarter speed"
        onClick={() => setSlow((s) => !s)}
        className="pixel absolute top-3 right-3 z-20 flex items-center gap-2 border border-[var(--v-steel)] bg-[var(--v-bg)] px-2 py-1 text-[16px] leading-[16px] text-[var(--v-soft)] hover:text-[var(--v-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]"
      >
        <span aria-hidden className="relative inline-block h-[12px] w-[22px] border border-current" style={{ background: slow ? 'var(--v-ink)' : 'transparent' }}>
          <span
            className="absolute top-[1px] h-[8px] w-[8px] transition-[left] duration-200 motion-reduce:transition-none"
            style={{ left: slow ? 11 : 1, background: slow ? 'var(--v-bg)' : 'currentColor' }}
          />
        </span>
        x0.25
      </button>

      {w > 0 && (
        <div
          ref={scroller}
          data-lenis-prevent={driven ? undefined : ''}
          className={`absolute inset-x-0 top-[52px] bottom-0 px-2 pb-3 sm:px-3 ${driven ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain'}`}
        >
          {compact && (
            <div className="mb-3 flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-1" role="tablist" aria-label="Component">
                {ROWS.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    role="tab"
                    aria-selected={row === i}
                    onClick={() => setPick(i)}
                    className={`pixel border px-1 py-1 text-[16px] leading-[16px] ${
                      row === i ? 'border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]' : 'border-[var(--v-steel)] text-[var(--v-soft)]'
                    }`}
                  >
                    {r.short}
                  </button>
                ))}
              </div>
              <p className="text-[13px] leading-[18px] text-[var(--v-soft)]">{ROWS[row].note}</p>
            </div>
          )}
          <div className="flex flex-col gap-4">
            {rows.map((r) => (
              <Row key={r.id} row={r} reduced={reducedMotion} slow={slow} compact={compact} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
