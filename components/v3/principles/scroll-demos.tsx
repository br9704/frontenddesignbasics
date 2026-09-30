'use client';

import { useEffect, useRef, useState } from 'react';
import { Poster, LiveSlot } from '@/components/v2/home/live-slot';
import { useInView, useReduce } from './context';
import { Action, BeforeAfter, Choice, ControlBar, Readout, Replay, Slider } from './kit';

/* Chapter IV, scroll. Every demo scrolls inside its own panel, never the page. */

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]';
const panel = `h-64 overflow-y-auto overscroll-contain border border-[var(--v-line)] bg-[var(--v-bg)] ${focus}`;

/* ── S1: scroll-linked, scroll-triggered, or CSS view() ─────────────────────────────── */
type LinkMode = 'linked' | 'triggered' | 'css';
const LINK_MODES = [
  { value: 'linked', label: 'Linked (scrub)' },
  { value: 'triggered', label: 'Triggered' },
  { value: 'css', label: 'CSS view()' },
] as const;

export function LinkedOrTriggered() {
  const reduce = useReduce();
  const scroller = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<LinkMode>('linked');
  const [seen, setSeen] = useState<Set<number>>(() => new Set());
  const [cssOk, setCssOk] = useState<boolean | null>(null);
  useEffect(() => setCssOk(typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()')), []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>('[data-i]'));
    let raf = 0;
    const update = () => {
      raf = 0;
      const p = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
      bar.current?.style.setProperty('transform', `scaleX(${p})`);
      if (mode !== 'linked') return;
      const box = el.getBoundingClientRect();
      for (const it of items) {
        const r = it.getBoundingClientRect();
        // 0 when the item's top sits at the panel bottom, 1 once it is 40% up the panel
        const t = reduce ? 1 : Math.max(0, Math.min(1, (box.bottom - r.top) / (box.height * 0.4)));
        it.style.opacity = String(0.15 + 0.85 * t);
        it.style.transform = `translateX(${(1 - t) * -24}px) scale(${0.9 + 0.1 * t})`;
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    for (const it of items) { it.style.opacity = ''; it.style.transform = ''; }
    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    let io: IntersectionObserver | undefined;
    if (mode === 'triggered') {
      io = new IntersectionObserver(
        (entries) => setSeen((prev) => {
          const next = new Set(prev);
          for (const e of entries) if (e.isIntersecting) next.add(Number((e.target as HTMLElement).dataset.i));
          return next;
        }),
        { root: el, threshold: 0.3 },
      );
      items.forEach((n) => io!.observe(n));
    }
    return () => { el.removeEventListener('scroll', onScroll); io?.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [mode, reduce]);

  const itemClass = (i: number) => {
    if (reduce) return '';
    if (mode === 'triggered') return `transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${seen.has(i) ? '' : 'opacity-0 translate-y-4'}`;
    if (mode === 'css' && cssOk) return 'fdb-p-view';
    return '';
  };

  return (
    <div>
      <ControlBar>
        <Choice label="Scroll mode" value={mode} options={LINK_MODES} onChange={(v) => { setMode(v); setSeen(new Set()); scroller.current?.scrollTo({ top: 0 }); }} />
        <Replay onClick={() => { setSeen(new Set()); scroller.current?.scrollTo({ top: 0 }); }} label="Back to top" />
      </ControlBar>
      <div className="mt-4 h-1 bg-[var(--v-line)]" aria-hidden>
        <div ref={bar} className="h-full origin-left bg-[var(--v-ink)]" style={{ transform: 'scaleX(0)' }} />
      </div>
      <div ref={scroller} tabIndex={0} aria-label="Scrollable demo panel" className={`${panel} space-y-4 p-4`}>
        <p className="text-[14px] text-[var(--v-soft)]">Scroll this panel ↓ then back up.</p>
        {['Arrive', 'Orient', 'Explain', 'Show', 'Prove', 'Act'].map((s, i) => (
          <div key={`${mode}-${s}`} data-i={i} className={`border border-[var(--v-steel)] bg-[var(--v-surface)] p-4 ${itemClass(i)}`}>
            <p className="font-mono text-[12px] text-[var(--v-dim)]">0{i + 1}</p>
            <p className="font-display text-[24px] text-[var(--v-ink)]">{s}</p>
          </div>
        ))}
        <div className="h-24" />
      </div>
      <Readout>
        {mode === 'linked'
          ? 'Linked: the cards follow your scroll both ways. The bar on top is linked too.'
          : mode === 'triggered'
            ? 'Triggered: each card plays once when it arrives and stays put.'
            : cssOk === false
              ? 'Your browser has no scroll timelines yet, so the cards just sit there. That is a fine fallback.'
              : 'CSS only: animation-timeline: view(). No JavaScript runs for the cards.'}
      </Readout>
      <style>{`@supports (animation-timeline: view()) {
        .fdb-p-view { animation: fdb-p-view linear both; animation-timeline: view(); animation-range: entry 0% cover 35%; }
      }
      @keyframes fdb-p-view { from { opacity: 0.15; transform: translateX(-24px) scale(0.9); } }`}</style>
    </div>
  );
}

/* ── S2: smooth, never hijacked ─────────────────────────────── */
type SmoothMode = 'native' | 'smooth' | 'hijack';
const SMOOTH_MODES = [
  { value: 'native', label: 'Native' },
  { value: 'smooth', label: 'Smoothed' },
  { value: 'hijack', label: 'Hijacked' },
] as const;

export function SmoothNotHijack() {
  const reduce = useReduce();
  const scroller = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<SmoothMode>('smooth');
  const [lerp, setLerp] = useState(0.12);
  const [ignored, setIgnored] = useState(0);
  const live = useRef({ mode, lerp, reduce });
  live.current = { mode, lerp, reduce };

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let target = el.scrollTop;
    let raf = 0;
    let busyUntil = 0;
    const max = () => el.scrollHeight - el.clientHeight;
    const step = () => {
      const cur = el.scrollTop;
      const next = cur + (target - cur) * live.current.lerp;
      el.scrollTop = Math.abs(target - next) < 0.5 ? target : next;
      raf = Math.abs(target - el.scrollTop) >= 0.5 ? requestAnimationFrame(step) : 0;
    };
    const onWheel = (e: WheelEvent) => {
      const { mode: m, reduce: r } = live.current;
      if (m === 'native' || (m === 'smooth' && r)) return;
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const canMove = (d > 0 && el.scrollTop < max() - 1) || (d < 0 && el.scrollTop > 1);
      if (!canMove) return; // at the ends, let the page scroll on
      e.preventDefault();
      if (m === 'smooth') {
        if (!raf) target = el.scrollTop;
        target = Math.max(0, Math.min(max(), target + d));
        if (!raf) raf = requestAnimationFrame(step);
        return;
      }
      // hijack: one wheel = one whole section on a fixed 900ms ride; everything else is thrown away
      const now = performance.now();
      if (now < busyUntil) { setIgnored((n) => n + 1); return; }
      const h = el.clientHeight;
      const idx = Math.round(el.scrollTop / h) + (d > 0 ? 1 : -1);
      const to = Math.max(0, Math.min(max(), idx * h));
      const from = el.scrollTop, t0 = now, dur = r ? 0 : 900;
      busyUntil = now + dur;
      const ride = (t: number) => {
        const p = dur ? Math.min(1, (t - t0) / dur) : 1;
        const e2 = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        el.scrollTop = from + (to - from) * e2;
        if (p < 1) requestAnimationFrame(ride);
      };
      requestAnimationFrame(ride);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div>
      <ControlBar>
        <Choice label="Scroll behaviour" value={mode} options={SMOOTH_MODES} onChange={(v) => { setMode(v); setIgnored(0); }} />
        <Slider label="Lerp" min={0.04} max={0.5} step={0.02} value={lerp} onChange={(n) => { setLerp(n); setMode('smooth'); }} format={(n) => n.toFixed(2)} />
      </ControlBar>
      <div ref={scroller} tabIndex={0} aria-label="Scrollable demo panel" className={`${panel} mt-4`}>
        {['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map((s, i) => (
          <section key={s} className="flex h-64 flex-col justify-center border-b border-[var(--v-line)] px-5" aria-label={`Section ${s}`}>
            <p className="font-mono text-[12px] text-[var(--v-dim)]">0{i + 1} / 06</p>
            <p className="font-display text-[40px] leading-none text-[var(--v-ink)]">{s}</p>
            <p className="mt-2 text-[14px] text-[var(--v-soft)]">Use a mouse wheel or trackpad over this panel.</p>
          </section>
        ))}
      </div>
      <Readout live>
        {mode === 'hijack'
          ? `Hijacked: ${ignored} of your scrolls were thrown away while it played its own ride.`
          : mode === 'smooth'
            ? reduce
              ? 'Smoothing is off while motion is reduced: you get native scroll.'
              : `Smoothed: every scroll counts, eased at ${lerp.toFixed(2)} a frame. Lower is floatier.`
            : 'Native: exactly what your device does. On touch screens all three stay native.'}
      </Readout>
    </div>
  );
}

/* ── S3: reveals must never hide content (the fling test) ─────────────────────────────── */
export function FlingTest() {
  const reduce = useReduce();
  const scroller = useRef<HTMLDivElement>(null);
  const [after, setAfter] = useState(true);
  const [shown, setShown] = useState<Set<number>>(() => new Set());
  const [blank, setBlank] = useState<number | null>(null);
  const N = 16;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>('[data-i]'));
    const reveal = (ids: number[]) => setShown((prev) => (ids.every((i) => prev.has(i)) ? prev : new Set([...prev, ...ids])));
    if (after) {
      // Robust: IntersectionObserver reports everything on screen after any jump, and anything
      // already passed counts as seen too.
      const io = new IntersectionObserver(
        (entries) => {
          const ids: number[] = [];
          for (const e of entries) {
            const i = Number((e.target as HTMLElement).dataset.i);
            if (e.isIntersecting || e.boundingClientRect.bottom < (e.rootBounds?.top ?? 0)) ids.push(i);
          }
          if (ids.length) reveal(ids);
        },
        { root: el, threshold: 0 },
      );
      items.forEach((n) => io.observe(n));
      return () => io.disconnect();
    }
    // Fragile: only reveals an item while its top is inside a thin band at the panel bottom.
    const check = () => {
      const box = el.getBoundingClientRect();
      const ids: number[] = [];
      for (const it of items) {
        const top = it.getBoundingClientRect().top - box.top;
        if (top < box.height && top > box.height - 60) ids.push(Number(it.dataset.i));
      }
      if (ids.length) reveal(ids);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    return () => el.removeEventListener('scroll', check);
  }, [after]);

  const count = () => {
    const el = scroller.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    let n = 0;
    el.querySelectorAll<HTMLElement>('[data-i]').forEach((it) => {
      const r = it.getBoundingClientRect();
      if (r.bottom > box.top && r.top < box.bottom && Number(getComputedStyle(it).opacity) < 0.5) n++;
    });
    setBlank(n);
  };

  const reset = () => {
    setShown(new Set());
    setBlank(null);
    scroller.current?.scrollTo({ top: 0 });
  };

  const fling = () => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + 3000);
    window.setTimeout(count, 700);
  };

  const hidden = (i: number) => !reduce && !shown.has(i);

  return (
    <div>
      <ControlBar>
        <BeforeAfter after={after} onChange={(v) => { setAfter(v); reset(); }} before="Fragile reveal" afterLabel="Robust reveal" />
        <Action onClick={fling}>Fling 3000px</Action>
        <Replay onClick={reset} label="Reset" />
      </ControlBar>
      <div ref={scroller} tabIndex={0} aria-label="Scrollable panel of cards" className={`${panel} mt-4 space-y-3 p-4`}>
        {Array.from({ length: N }, (_, i) => (
          <div
            key={i}
            data-i={i}
            className="border border-[var(--v-steel)] bg-[var(--v-surface)] p-3 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ opacity: hidden(i) ? 0 : 1, transform: hidden(i) ? 'translateY(16px)' : 'none' }}
          >
            <p className="font-mono text-[12px] text-[var(--v-dim)]">card {String(i + 1).padStart(2, '0')}</p>
            <p className="text-[15px] text-[var(--v-ink)]">Content you came here to read.</p>
          </div>
        ))}
      </div>
      <Readout live>
        {blank === null
          ? 'Press Fling. It jumps the panel 3000px in one go, like a hard flick on a phone.'
          : blank === 0
            ? 'Blank cards on screen after the fling: 0. Nothing got stuck.'
            : `Blank cards on screen after the fling: ${blank}. They skipped their trigger and stay hidden.`}
      </Readout>
    </div>
  );
}

/* ── S4: heavy scenes get a still and leave off screen ─────────────────────────────── */
export function HeavyScene() {
  const reduce = useReduce();
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const el = wrap.current?.querySelector('[data-slot]');
    if (!el) return;
    const read = () => setLive(el.getAttribute('data-live') === '1');
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ['data-live'] });
    return () => mo.disconnect();
  }, [reduce]);
  return (
    <div>
      <div ref={wrap} className="relative mt-4 aspect-[16/10] w-full overflow-hidden border border-[var(--v-line)] bg-[var(--v-bg)]">
        {reduce ? <Poster id="dither-wave" note="still: motion is reduced" /> : <LiveSlot id="dither-wave" className="absolute inset-0" showTools={false} />}
      </div>
      <Readout live>
        {reduce
          ? 'Motion is reduced, so you only get the still.'
          : live
            ? `Live WebGL scene running${inView ? '' : ' (off screen, so it is not drawing)'}.`
            : 'Still image showing. The live scene starts when it is on screen and the page has room for it.'}
      </Readout>
    </div>
  );
}

/* ── R1: reduced motion removes travel, not feedback ─────────────────────────────── */
type RMode = 'full' | 'right' | 'wrong';
const R_MODES = [
  { value: 'full', label: 'Full motion' },
  { value: 'right', label: 'Reduced, done right' },
  { value: 'wrong', label: 'Reduced, done wrong' },
] as const;

export function ReducedFeedback() {
  const reduce = useReduce();
  const [mode, setMode] = useState<RMode>(reduce ? 'right' : 'full');
  useEffect(() => { if (reduce) setMode((m) => (m === 'full' ? 'right' : m)); }, [reduce]);
  const [saved, setSaved] = useState(0);
  const m = reduce && mode === 'full' ? 'right' : mode;
  const save = () => setSaved((n) => n + 1);
  const toastCls = m === 'full' ? 'fdb-p-rm-fly' : m === 'right' ? 'fdb-p-rm-fade' : '';
  return (
    <div>
      <ControlBar>
        <Choice label="Motion setting" value={mode} options={R_MODES} onChange={setMode} />
        <Replay onClick={save} label="Press save" />
      </ControlBar>
      <div className="relative mt-4 h-40 overflow-hidden border border-[var(--v-line)] bg-[var(--v-bg)] p-4">
        <button
          type="button"
          onClick={save}
          className={`pixel px-3 py-2 text-[16px] leading-[16px] ${focus} ${m === 'wrong' ? 'bg-[var(--v-ink)] text-[var(--v-bg)]' : saved ? 'border border-[var(--v-ink)] text-[var(--v-ink)]' : 'bg-[var(--v-ink)] text-[var(--v-bg)]'} ${m === 'full' ? 'active:scale-95 transition-transform' : ''}`}
        >
          {m !== 'wrong' && saved ? 'Saved ✓' : 'Save'}
        </button>
        {saved && m !== 'wrong' ? (
          <p key={`${saved}-${m}`} role="status" className={`absolute inset-x-4 bottom-4 border border-[var(--v-steel)] bg-[var(--v-surface)] px-3 py-2 text-[14px] text-[var(--v-ink)] ${toastCls}`}>
            Your changes are saved.
          </p>
        ) : null}
      </div>
      <table className="mt-4 w-full border-collapse text-left text-[13px]">
        <caption className="sr-only">What reduced motion keeps and removes</caption>
        <thead>
          <tr className="text-[var(--v-dim)]">
            <th scope="col" className="border-b border-[var(--v-line)] py-1 pr-2 font-normal">Full motion</th>
            <th scope="col" className="border-b border-[var(--v-line)] py-1 font-normal">Reduced</th>
          </tr>
        </thead>
        <tbody className="text-[var(--v-soft)]">
          {[
            ['Slides in from below', 'Fades in'],
            ['Parallax and scroll scrub', 'Static, final layout'],
            ['Looping background', 'One composed still'],
            ['Button press scale', 'Colour and label change'],
            ['Spinner', 'Kept: it is feedback'],
          ].map(([a, b]) => (
            <tr key={a}>
              <td className="border-b border-[var(--v-line)] py-1 pr-2">{a}</td>
              <td className="border-b border-[var(--v-line)] py-1 text-[var(--v-ink)]">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <style>{`.fdb-p-rm-fly { animation: fdb-p-rm-fly 450ms cubic-bezier(0.22,1,0.36,1) both; }
      .fdb-p-rm-fade { animation: fdb-p-rm-fade 200ms linear both; }
      @keyframes fdb-p-rm-fly { from { opacity: 0; transform: translateY(48px); } }
      @keyframes fdb-p-rm-fade { from { opacity: 0; } }`}</style>
    </div>
  );
}

/* ── R2: anything that loops can be stopped ─────────────────────────────── */
export function StoppableLoop() {
  const reduce = useReduce();
  const wrap = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [frames, setFrames] = useState(0);
  const stopped = paused || reduce;
  const running = inView && !stopped;
  const live = useRef(speed);
  live.current = speed;

  useEffect(() => {
    if (!running) return;
    let raf = 0, x = 0, last = performance.now(), n = 0, lastReport = 0;
    const cur = strip.current?.style.transform.match(/-?[\d.]+/);
    if (cur) x = Number(cur[0]);
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const half = (strip.current?.scrollWidth ?? 0) / 2;
      x -= live.current * dt;
      if (half && -x >= half) x += half;
      if (strip.current) strip.current.style.transform = `translateX(${x}px)`;
      n++;
      if (now - lastReport > 250) { lastReport = now; setFrames((f) => f + n); n = 0; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); setFrames((f) => f + n); };
  }, [running]);

  const words = ['EASE OUT', 'BLUR IN', 'KEEP YOUR PLACE', 'NEVER HIJACK', 'STOP THE LOOP'];
  return (
    <div>
      <ControlBar>
        <Action onClick={() => setPaused((p) => !p)} pressed={paused}>{paused ? '▶ Play' : '❚❚ Pause'}</Action>
        <Slider label="Speed" min={20} max={240} step={10} value={speed} unit="px/s" onChange={setSpeed} format={(n) => `${n}px/s`} />
      </ControlBar>
      <div ref={wrap} className="relative mt-4 overflow-hidden border border-[var(--v-line)] bg-[var(--v-bg)] py-6" aria-label="Scrolling marquee" role="group">
        <div ref={strip} className="flex w-max" aria-hidden>
          {[0, 1].map((k) => (
            <div key={k} className="flex shrink-0">
              {words.map((w) => (
                <span key={w} className="pixel shrink-0 px-6 text-[32px] leading-[32px] text-[var(--v-ink)]">{w} ·</span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <Readout>
        Frames drawn: {frames}. {reduce ? 'Stopped: motion is reduced.' : paused ? 'Stopped by you.' : inView ? 'Running.' : 'Frozen: off screen.'}
      </Readout>
    </div>
  );
}

