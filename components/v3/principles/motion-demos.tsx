'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useFps, useInView, useReduce, useReplay } from './context';
import { Action, BeforeAfter, ControlBar, Readout, Replay, Slider, Stage } from './kit';

/* Chapter I, motion feel. DOM and CSS only. */

export const EASES = {
  'ease-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
  'ease-in': 'cubic-bezier(0.55, 0, 1, 0.45)',
  'ease-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
  ease: 'ease',
  linear: 'linear',
} as const;
type EaseName = keyof typeof EASES;

/* ── M1: three menus, three curves ─────────────────────────────── */
export function EaseOutMenus() {
  const ref = useRef<HTMLDivElement>(null);
  const { armed, playing, replay } = useReplay(ref);
  const [dur, setDur] = useState(300);
  const menus: { name: EaseName; note: string }[] = [
    { name: 'ease-in', note: 'sluggish start' },
    { name: 'ease', note: 'fine' },
    { name: 'ease-out', note: 'answers at once' },
  ];
  return (
    <div ref={ref}>
      <ControlBar>
        <Replay onClick={replay} />
        <Slider label="Duration" min={150} max={1200} step={50} value={dur} unit="ms" onChange={setDur} />
      </ControlBar>
      <Stage className="grid grid-cols-3 gap-2 p-3 sm:gap-4 sm:p-4" label="Three menus opening with different curves">
        {menus.map((m) => (
          <div key={m.name} className="min-w-0">
            <p className="pixel truncate text-[16px] leading-[16px] text-[var(--v-ink)]">{m.name}</p>
            <p className="mt-1 truncate text-[12px] text-[var(--v-dim)]">{m.note}</p>
            <div className="mt-3 border border-[var(--v-steel)] px-2 py-1 text-[13px] text-[var(--v-soft)]">Menu ▾</div>
            <div
              className="mt-1 origin-top border border-[var(--v-steel)] bg-[var(--v-surface)] p-2"
              style={{
                transition: playing ? `transform ${dur}ms ${EASES[m.name]}, opacity ${dur}ms ${EASES[m.name]}` : 'none',
                transform: armed ? 'none' : 'scaleY(0.6) translateY(-6px)',
                opacity: armed ? 1 : 0,
              }}
            >
              {['Open', 'Rename', 'Delete'].map((t) => (
                <div key={t} className="truncate py-1 text-[13px] text-[var(--v-soft)]">
                  {t}
                </div>
              ))}
            </div>
          </div>
        ))}
      </Stage>
    </div>
  );
}

/* ── M2: pick the ease for each job ─────────────────────────────── */
const JOBS: { id: string; label: string; best: EaseName }[] = [
  { id: 'enter', label: 'A panel arrives', best: 'ease-out' },
  { id: 'exit', label: 'A panel leaves', best: 'ease-in' },
  { id: 'move', label: 'A dot moves across', best: 'ease-in-out' },
  { id: 'fill', label: 'A progress bar fills', best: 'linear' },
  { id: 'spin', label: 'A loader spins', best: 'linear' },
];

export function EaseByJob() {
  const ref = useRef<HTMLDivElement>(null);
  const { armed, playing, replay, inView, reduce } = useReplay(ref);
  const [after, setAfter] = useState(false);
  const [dur, setDur] = useState(700);
  const [picks, setPicks] = useState<Record<string, EaseName>>({ enter: 'ease-in', exit: 'ease-out', move: 'linear', fill: 'ease-out', spin: 'ease-in-out' });
  const ease = (id: string, best: EaseName) => (after ? best : picks[id]);
  const right = JOBS.filter((j) => ease(j.id, j.best) === j.best).length;

  const shape = (id: string): CSSProperties => {
    if (id === 'enter') return { transform: armed ? 'none' : 'translateX(-110%)', opacity: armed ? 1 : 0 };
    if (id === 'exit') return { transform: armed ? 'translateX(110%)' : 'none', opacity: armed ? 0 : 1 };
    if (id === 'move') return { transform: armed ? 'translateX(calc(100% - 20px))' : 'none' };
    return { transform: armed ? 'scaleX(1)' : 'scaleX(0)' };
  };

  return (
    <div ref={ref}>
      <ControlBar>
        <BeforeAfter after={after} onChange={(v) => { setAfter(v); replay(); }} before="My picks" afterLabel="The rule" />
        <Slider label="Duration" min={300} max={1500} step={50} value={dur} unit="ms" onChange={setDur} />
        <Replay onClick={replay} />
      </ControlBar>
      <Stage className="space-y-3 p-3 sm:p-4" label="Five motions, each with its own ease">
        {JOBS.map((j) => {
          const e = ease(j.id, j.best);
          const ok = e === j.best;
          return (
            <div key={j.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr] sm:items-center">
              <div className="flex items-center justify-between gap-2 sm:block">
                <p className="text-[13px] text-[var(--v-soft)]">{j.label}</p>
                <label className="flex items-center gap-2 text-[12px] text-[var(--v-dim)] sm:mt-1">
                  <span className="sr-only">Ease for {j.label}</span>
                  <select
                    value={e}
                    disabled={after}
                    onChange={(ev) => { setPicks((p) => ({ ...p, [j.id]: ev.target.value as EaseName })); replay(); }}
                    className="border border-[var(--v-steel)] bg-[var(--v-bg)] px-1 py-0.5 font-mono text-[12px] text-[var(--v-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v-ink)]"
                  >
                    {(Object.keys(EASES) as EaseName[]).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <span aria-label={ok ? 'fits' : `try ${j.best}`} className={ok ? 'text-[var(--v-ink)]' : ''}>{ok ? '✓' : '✗'}</span>
                </label>
              </div>
              <div className="relative h-7 overflow-hidden border border-[var(--v-line)] bg-[var(--v-surface)]">
                {j.id === 'spin' ? (
                  <div className="grid h-full place-items-center">
                    <div
                      className="size-4 rounded-full border-2 border-[var(--v-steel)] border-t-[var(--v-ink)]"
                      style={{
                        animation: reduce ? 'none' : `fdb-p-spin 900ms ${EASES[e]} infinite`,
                        animationPlayState: inView ? 'running' : 'paused',
                      }}
                    />
                  </div>
                ) : j.id === 'fill' ? (
                  <div
                    className="absolute inset-y-2 left-2 right-2 origin-left bg-[var(--v-ink)]"
                    style={{ ...shape('fill'), transition: playing ? `transform ${dur * 1.6}ms ${EASES[e]}` : 'none' }}
                  />
                ) : j.id === 'move' ? (
                  <div className="absolute inset-y-0 left-1 right-1" style={{ ...shape('move'), transition: playing ? `transform ${dur}ms ${EASES[e]}` : 'none' }}>
                    <div className="absolute top-1 left-0 size-5 rounded-full bg-[var(--v-ink)]" />
                  </div>
                ) : (
                  <div
                    className="absolute inset-1 bg-[var(--v-steel)]"
                    style={{ ...shape(j.id), transition: playing ? `transform ${dur}ms ${EASES[e]}, opacity ${dur}ms ${EASES[e]}` : 'none' }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </Stage>
      <Readout live>{right} of 5 fit the job.</Readout>
      <style>{`@keyframes fdb-p-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── M3: duration grows with distance ─────────────────────────────── */
export function DistanceDuration() {
  const ref = useRef<HTMLDivElement>(null);
  const { armed, playing, replay } = useReplay(ref);
  const [dist, setDist] = useState(90);
  const d = dist / 100;
  const scaled = Math.round(160 + 340 * d);
  const rows = [
    { label: 'fixed 300ms', ms: 300 },
    { label: `scaled ${scaled}ms`, ms: scaled },
  ];
  return (
    <div ref={ref}>
      <ControlBar>
        <Slider label="Distance" min={10} max={100} step={5} value={dist} unit="%" onChange={(n) => { setDist(n); replay(); }} />
        <Replay onClick={replay} />
      </ControlBar>
      <Stage className="space-y-3 p-3 sm:p-4" label="The same move with a fixed and a scaled duration">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[7rem_1fr] items-center gap-3">
            <span className="font-mono text-[12px] text-[var(--v-soft)]">{r.label}</span>
            <div className="relative h-7 border border-[var(--v-line)] bg-[var(--v-surface)]">
              <div
                className="absolute inset-y-0 left-1 right-1"
                style={{
                  transform: armed ? `translateX(calc((100% - 20px) * ${d}))` : 'none',
                  transition: playing ? `transform ${r.ms}ms ${EASES['ease-out']}` : 'none',
                }}
              >
                <div className="absolute top-1 left-0 size-5 bg-[var(--v-ink)]" />
              </div>
            </div>
          </div>
        ))}
      </Stage>
      <Readout>Short hops at 300ms feel slow; long ones feel rushed. I use about 160ms plus a bit per unit of distance.</Readout>
    </div>
  );
}

/* ── M4: fling a card, catch it mid-flight ─────────────────────────────── */
type Vec = { x: number; y: number };

export function FlingCard() {
  const reduce = useReduce();
  const stage = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [after, setAfter] = useState(true);
  const [k, setK] = useState(220);
  const s = useRef({
    pos: { x: 16, y: 0 } as Vec,
    vel: { x: 0, y: 0 } as Vec,
    target: { x: 16, y: 0 } as Vec,
    mode: 'idle' as 'idle' | 'drag' | 'spring' | 'tween',
    tween: { from: { x: 0, y: 0 }, t0: 0, dur: 400 },
    grab: { x: 0, y: 0 },
    samples: [] as { t: number; x: number; y: number }[],
    raf: 0,
    side: 0,
  });
  const live = useRef({ after, k, reduce });
  live.current = { after, k, reduce };
  const [side, setSide] = useState(0);

  const W = 112, H = 72;
  const anchors = useCallback(() => {
    const r = stage.current?.getBoundingClientRect();
    const w = r?.width ?? 320, h = r?.height ?? 224;
    const y = (h - H) / 2;
    return [{ x: 16, y }, { x: Math.max(16, w - W - 16), y }];
  }, []);

  const paint = () => {
    const { x, y } = s.current.pos;
    if (card.current) card.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const loop = useCallback(() => {
    const st = s.current;
    cancelAnimationFrame(st.raf);
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      if (st.mode === 'spring') {
        const kk = live.current.k, c = 2 * Math.sqrt(kk) * 0.62;
        for (const ax of ['x', 'y'] as const) {
          const a = -kk * (st.pos[ax] - st.target[ax]) - c * st.vel[ax];
          st.vel[ax] += a * dt;
          st.pos[ax] += st.vel[ax] * dt;
        }
        const still = Math.hypot(st.pos.x - st.target.x, st.pos.y - st.target.y) < 0.3 && Math.hypot(st.vel.x, st.vel.y) < 5;
        if (still) { st.pos = { ...st.target }; st.mode = 'idle'; }
      } else if (st.mode === 'tween') {
        const p = Math.min(1, (now - st.tween.t0) / st.tween.dur);
        const e = 1 - Math.pow(1 - p, 3);
        st.pos = { x: st.tween.from.x + (st.target.x - st.tween.from.x) * e, y: st.tween.from.y + (st.target.y - st.tween.from.y) * e };
        if (p >= 1) st.mode = 'idle';
      }
      paint();
      if (st.mode === 'spring' || st.mode === 'tween') st.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame(tick);
  }, []);

  const release = useCallback((vx: number, vy: number) => {
    const st = s.current;
    const a = anchors();
    const projected = st.pos.x + vx * 0.25;
    const mid = (a[0].x + a[1].x) / 2;
    st.side = projected > mid ? 1 : 0;
    setSide(st.side);
    st.target = { ...a[st.side] };
    if (live.current.reduce) {
      st.pos = { ...st.target };
      st.mode = 'idle';
      paint();
      return;
    }
    if (live.current.after) {
      st.vel = { x: vx, y: vy };
      st.mode = 'spring';
    } else {
      st.tween = { from: { ...st.pos }, t0: performance.now(), dur: 400 };
      st.mode = 'tween';
    }
    loop();
  }, [anchors, loop]);

  useEffect(() => {
    const st = s.current;
    st.pos = { ...anchors()[0] };
    st.target = { ...st.pos };
    paint();
    const onResize = () => { st.pos = { ...anchors()[st.side] }; st.target = { ...st.pos }; st.mode = 'idle'; paint(); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(st.raf); };
  }, [anchors]);

  const onDown = (e: React.PointerEvent) => {
    const st = s.current;
    cancelAnimationFrame(st.raf);
    const r = stage.current!.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    // A spring can be caught where it is. A fixed tween only knows where it is going, so it jumps.
    const from = live.current.after || st.mode !== 'tween' ? st.pos : st.target;
    st.grab = { x: px - from.x, y: py - from.y };
    st.mode = 'drag';
    st.samples = [{ t: performance.now(), x: px, y: py }];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    st.pos = { x: px - st.grab.x, y: py - st.grab.y };
    paint();
  };
  const onMove = (e: React.PointerEvent) => {
    const st = s.current;
    if (st.mode !== 'drag') return;
    const r = stage.current!.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    st.pos = { x: Math.max(-40, Math.min(r.width - W + 40, px - st.grab.x)), y: Math.max(-20, Math.min(r.height - H + 20, py - st.grab.y)) };
    st.samples.push({ t: performance.now(), x: px, y: py });
    if (st.samples.length > 8) st.samples.shift();
    paint();
  };
  const onUp = () => {
    const st = s.current;
    if (st.mode !== 'drag') return;
    const now = performance.now();
    const recent = st.samples.filter((p) => now - p.t < 90);
    let vx = 0, vy = 0;
    if (recent.length > 1) {
      const a = recent[0], b = recent[recent.length - 1];
      const dt = Math.max(0.008, (b.t - a.t) / 1000);
      vx = (b.x - a.x) / dt;
      vy = (b.y - a.y) / dt;
    }
    release(vx, vy);
  };

  const throwIt = () => {
    const st = s.current;
    cancelAnimationFrame(st.raf);
    st.mode = 'idle';
    release(st.side === 0 ? 2600 : -2600, -300);
  };

  return (
    <div>
      <ControlBar>
        <BeforeAfter after={after} onChange={setAfter} before="Fixed curve" afterLabel="Spring" />
        <Slider label="Stiffness" min={80} max={600} step={10} value={k} onChange={setK} />
        <Action onClick={throwIt}>Throw it</Action>
      </ControlBar>
      <div
        ref={stage}
        className="relative mt-4 h-56 touch-none overflow-hidden border border-[var(--v-line)] bg-[var(--v-bg)]"
        role="group"
        aria-label="Drag and fling the card to either side"
      >
        <div className="pointer-events-none absolute inset-y-0 left-4 my-auto h-[72px] w-[112px] border border-dashed border-[var(--v-steel)]" />
        <div className="pointer-events-none absolute inset-y-0 right-4 my-auto h-[72px] w-[112px] border border-dashed border-[var(--v-steel)]" />
        <div
          ref={card}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="absolute top-0 left-0 grid h-[72px] w-[112px] cursor-grab place-items-center border border-[var(--v-ink)] bg-[var(--v-surface)] select-none active:cursor-grabbing"
          style={{ willChange: 'transform' }}
        >
          <span className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">grab me</span>
        </div>
      </div>
      <Readout live>
        Resting on the {side ? 'right' : 'left'}. Fling it, then grab it again before it lands. {after ? 'The spring stops in your hand.' : 'The fixed curve jumps to where it was going.'}
      </Readout>
    </div>
  );
}

/* ── M5: stagger in small steps, with a cap ─────────────────────────────── */
export function StaggerCap() {
  const ref = useRef<HTMLDivElement>(null);
  const { run, replay, reduce } = useReplay(ref);
  const [after, setAfter] = useState(true);
  const [step, setStep] = useState(60);
  const N = 40, CAP = 500;
  const eff = after ? Math.min(step, CAP / (N - 1)) : step;
  const last = Math.round(eff * (N - 1) + 400);
  return (
    <div ref={ref}>
      <ControlBar>
        <BeforeAfter after={after} onChange={(v) => { setAfter(v); replay(); }} before="No cap" afterLabel="Capped" />
        <Slider label="Step" min={10} max={120} step={5} value={step} unit="ms" onChange={(n) => { setStep(n); replay(); }} />
        <Replay onClick={replay} />
      </ControlBar>
      <Stage className="p-3 sm:p-4" label="A grid of 40 tiles appearing one after another">
        <div key={run} className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: N }, (_, i) => (
            <div
              key={i}
              className={`aspect-square bg-[var(--v-ink)] ${reduce || run === 0 ? '' : 'fdb-p-pop'}`}
              style={{ animationDelay: `${Math.round(i * eff)}ms` }}
            />
          ))}
        </div>
      </Stage>
      <Readout live>
        {Math.round(eff)}ms a step. The last tile lands at {last}ms{last > 1000 ? ', so people wait for it' : ''}.
      </Readout>
      <style>{`.fdb-p-pop { animation: fdb-p-pop 400ms cubic-bezier(0.22,1,0.36,1) both; }
      @keyframes fdb-p-pop { from { opacity: 0; transform: translateY(10px) scale(0.8); } }`}</style>
    </div>
  );
}

/* ── M6: motion that explains ─────────────────────────────── */
export function ExplainCart() {
  const reduce = useReduce();
  const stage = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const cart = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [after, setAfter] = useState(true);
  const [count, setCount] = useState(0);
  const [bump, setBump] = useState(0);

  const add = () => {
    const st = stage.current, t = thumb.current, c = cart.current;
    if (!st || !t || !c) return;
    if (reduce) {
      setCount((n) => n + 1);
      setBump((b) => b + 1);
      return;
    }
    if (!after) {
      btn.current?.animate(
        [{ transform: 'none' }, { transform: 'rotate(-8deg) scale(1.15)' }, { transform: 'rotate(8deg) scale(1.15)' }, { transform: 'none' }],
        { duration: 600, easing: 'ease-in-out' },
      );
      st.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], { duration: 500 });
      setCount((n) => n + 1);
      return;
    }
    const sr = st.getBoundingClientRect(), tr = t.getBoundingClientRect(), cr = c.getBoundingClientRect();
    const dot = document.createElement('div');
    dot.setAttribute('aria-hidden', 'true');
    Object.assign(dot.style, {
      position: 'absolute', left: '0', top: '0', width: '20px', height: '20px', background: 'var(--v-ink)', pointerEvents: 'none',
    });
    st.appendChild(dot);
    const from = { x: tr.left - sr.left + tr.width / 2 - 10, y: tr.top - sr.top + tr.height / 2 - 10 };
    const to = { x: cr.left - sr.left + cr.width / 2 - 10, y: cr.top - sr.top + cr.height / 2 - 10 };
    const midY = Math.min(from.y, to.y) - 40;
    const a = dot.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px) scale(1.4)` },
        { transform: `translate(${(from.x + to.x) / 2}px, ${midY}px) scale(1)`, offset: 0.5 },
        { transform: `translate(${to.x}px, ${to.y}px) scale(0.5)` },
      ],
      { duration: 520, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
    );
    a.onfinish = () => {
      dot.remove();
      setCount((n) => n + 1);
      setBump((b) => b + 1);
    };
  };

  return (
    <div>
      <ControlBar>
        <BeforeAfter after={after} onChange={setAfter} before="Decorates" afterLabel="Explains" />
        <Replay onClick={add} label="Add again" />
      </ControlBar>
      <div ref={stage} className="relative mt-4 h-56 overflow-hidden border border-[var(--v-line)] bg-[var(--v-bg)] p-4" role="group" aria-label="Add to cart">
        <div className="flex items-start justify-between">
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">shop</p>
          <div ref={cart} className="relative border border-[var(--v-steel)] px-3 py-2">
            <span className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">cart</span>
            <span
              key={bump}
              className={`absolute -top-2 -right-2 grid size-6 place-items-center bg-[var(--v-ink)] font-mono text-[12px] text-[var(--v-bg)] ${after && !reduce && bump ? 'fdb-p-bump' : ''}`}
              aria-live="polite"
            >
              {count}
            </span>
          </div>
        </div>
        <div className="mt-6 flex items-end gap-4">
          <div ref={thumb} className="size-20 shrink-0 bg-[repeating-linear-gradient(45deg,var(--v-steel)_0_6px,var(--v-surface)_6px_12px)]" aria-hidden />
          <div className="min-w-0">
            <p className="text-[15px] text-[var(--v-ink)]">Grey wool scarf</p>
            <button
              ref={btn}
              type="button"
              onClick={add}
              className="pixel mt-3 bg-[var(--v-ink)] px-3 py-2 text-[16px] leading-[16px] text-[var(--v-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]"
            >
              Add to cart
            </button>
          </div>
        </div>
      </div>
      <Readout>{after ? 'The item travels to the cart and the count bumps: you see where it went.' : 'The button wiggles and the screen flashes. Fun, but where did it go?'}</Readout>
      <style>{`.fdb-p-bump { animation: fdb-p-bump 320ms cubic-bezier(0.34,1.56,0.64,1); }
      @keyframes fdb-p-bump { 40% { transform: scale(1.5); } }`}</style>
    </div>
  );
}

/* ── M7: frequent actions get no animation ─────────────────────────────── */
export function FrequentPalette() {
  const reduce = useReduce();
  const [after, setAfter] = useState(false);
  const [dur, setDur] = useState(300);
  const [open, setOpen] = useState(false);
  const [opens, setOpens] = useState(0);
  const [waited, setWaited] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const cost = after || reduce ? 0 : dur;

  const toggle = useCallback(() => {
    if (!open) setOpens((n) => n + 1);
    setWaited((w) => w + cost);
    setOpen(!open);
  }, [cost, open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => input.current?.focus(), cost);
      return () => clearTimeout(t);
    }
  }, [open, cost]);

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggle(); }
    if (e.key === 'Escape' && open) toggle();
  };

  return (
    <div onKeyDown={onKey}>
      <ControlBar>
        <BeforeAfter after={after} onChange={setAfter} before="Animated" afterLabel="Instant" />
        <Slider label="Open time" min={100} max={600} step={50} value={dur} unit="ms" onChange={setDur} />
        <Replay onClick={() => { setOpens(0); setWaited(0); setOpen(false); }} label="Reset count" />
      </ControlBar>
      <Stage className="h-56 p-4" label="Command palette">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="pixel border border-[var(--v-steel)] px-3 py-2 text-[16px] leading-[16px] text-[var(--v-ink)] hover:border-[var(--v-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]"
        >
          {open ? 'Close' : 'Open'} palette <span className="text-[var(--v-dim)]">⌘K</span>
        </button>
        <div
          className="absolute inset-x-4 top-16 border border-[var(--v-ink)] bg-[var(--v-surface)] p-3"
          style={{
            transition: cost ? `transform ${cost}ms cubic-bezier(0.22,1,0.36,1), opacity ${cost}ms ease-out, visibility 0s linear ${open ? 0 : cost}ms` : 'none',
            transform: open ? 'none' : 'scale(0.94) translateY(-8px)',
            opacity: open ? 1 : 0,
            visibility: open ? 'visible' : 'hidden',
          }}
        >
          <label className="sr-only" htmlFor="fdb-p-cmd">Command</label>
          <input
            id="fdb-p-cmd"
            ref={input}
            placeholder="Type a command…"
            className="w-full border-b border-[var(--v-steel)] bg-transparent pb-2 text-[15px] text-[var(--v-ink)] outline-none placeholder:text-[var(--v-dim)]"
          />
          {['Go to tools', 'Copy link', 'Toggle theme'].map((c) => (
            <p key={c} className="mt-2 text-[14px] text-[var(--v-soft)]">{c}</p>
          ))}
        </div>
      </Stage>
      <Readout live>
        Opened {opens} times. Time spent watching it: {(waited / 1000).toFixed(1)}s. Try ten times with ⌘K or Ctrl+K.
      </Readout>
    </div>
  );
}

/* ── M8: transform and opacity only ─────────────────────────────── */
export function TransformOnly() {
  const reduce = useReduce();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [after, setAfter] = useState(false);
  const [count, setCount] = useState(60);
  const running = inView && !reduce;
  const fps = useFps(running);

  useEffect(() => {
    const root = ref.current;
    if (!root || !running) return;
    const bars = Array.from(root.querySelectorAll<HTMLElement>('[data-bar]'));
    for (const b of bars) {
      b.style.width = after ? '100%' : '60%';
      b.style.transform = after ? 'scaleX(0.6)' : 'none';
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      for (let i = 0; i < bars.length; i++) {
        const v = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 3 + i * 0.35));
        if (after) bars[i].style.transform = `scaleX(${v})`;
        else bars[i].style.width = `${v * 100}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, after, count]);

  return (
    <div ref={ref}>
      <ControlBar>
        <BeforeAfter after={after} onChange={setAfter} before="width" afterLabel="transform" />
        <Slider label="Bars" min={10} max={400} step={10} value={count} onChange={setCount} />
      </ControlBar>
      <Stage className="h-56 p-3" label="Bars animating width or transform">
        <div className="columns-2 gap-3 sm:columns-4">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="mb-1 flex h-2 items-center">
              <div data-bar className="h-full origin-left bg-[var(--v-ink)]" style={{ width: after ? '100%' : '60%', transform: after ? 'scaleX(0.6)' : 'none' }} />
            </div>
          ))}
        </div>
      </Stage>
      <Readout>
        {running ? `${fps} fps` : 'paused'} · {after ? 'no layout per frame: the GPU moves pixels' : `layout for ${count} bars, every frame`}. A fast laptop hides it; a phone won’t.
      </Readout>
    </div>
  );
}
