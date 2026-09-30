'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useFps, useInView, useReduce, useReplay } from './context';
import { Action, BeforeAfter, Choice, ControlBar, Readout, Replay, Slider, Stage } from './kit';

/* Chapter II, blur. CSS filter, backdrop-filter and one SVG filter. */

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '');

/* ── B1: motion blur that follows speed ─────────────────────────────── */
export function MotionBlurCarousel() {
  const reduce = useReduce();
  const fid = `fdb-mb-${safeId(useId())}`;
  const wrap = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const blur = useRef<SVGFEGaussianBlurElement>(null);
  const [after, setAfter] = useState(true);
  const [dur, setDur] = useState(700);
  const [index, setIndex] = useState(0);
  const [peak, setPeak] = useState(0);
  const pos = useRef(0);
  const raf = useRef(0);
  const SLIDES = 5;

  const go = (next: number) => {
    const w = wrap.current?.clientWidth ?? 320;
    const to = -next * w;
    setIndex(next);
    cancelAnimationFrame(raf.current);
    if (reduce) {
      pos.current = to;
      if (track.current) track.current.style.transform = `translate3d(${to}px,0,0)`;
      return;
    }
    const from = pos.current;
    const t0 = performance.now();
    let prev = from, top = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const x = from + (to - from) * e;
      const v = Math.abs(x - prev);
      prev = x;
      pos.current = x;
      const amount = after ? Math.min(14, v * 0.35) : 0;
      top = Math.max(top, amount);
      blur.current?.setAttribute('stdDeviation', `${amount.toFixed(2)} 0`);
      if (track.current) track.current.style.transform = `translate3d(${x}px,0,0)`;
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else {
        blur.current?.setAttribute('stdDeviation', '0 0');
        setPeak(Math.round(top * 10) / 10);
      }
    };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => {
    const onResize = () => {
      const w = wrap.current?.clientWidth ?? 320;
      pos.current = -index * w;
      if (track.current) track.current.style.transform = `translate3d(${pos.current}px,0,0)`;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [index]);

  return (
    <div>
      <ControlBar>
        <BeforeAfter after={after} onChange={setAfter} before="No blur" afterLabel="Motion blur" />
        <Slider label="Slow-mo" min={250} max={2500} step={50} value={dur} unit="ms" onChange={setDur} />
        <Replay onClick={() => go((index + 1) % SLIDES)} label="Next" />
      </ControlBar>
      <svg width="0" height="0" className="absolute" aria-hidden>
        <filter id={fid} x="-20%" y="0" width="140%" height="100%">
          <feGaussianBlur ref={blur} stdDeviation="0 0" />
        </filter>
      </svg>
      <div ref={wrap} className="relative mt-4 h-44 overflow-hidden border border-[var(--v-line)] bg-[var(--v-bg)]" role="group" aria-roledescription="carousel" aria-label="Slides">
        <div ref={track} className="flex h-full" style={{ filter: `url(#${fid})`, willChange: 'transform' }}>
          {Array.from({ length: SLIDES }, (_, i) => (
            <div key={i} className="flex h-full w-full shrink-0 items-center justify-between gap-4 px-6" aria-hidden={i !== index}>
              <span className="font-display text-[72px] leading-none text-[var(--v-ink)]">0{i + 1}</span>
              <div className="grid h-24 flex-1 grid-cols-6 gap-1">
                {Array.from({ length: 6 }, (_, j) => (
                  <div key={j} className={(i + j) % 2 ? 'bg-[var(--v-ink)]' : 'bg-[var(--v-steel)]'} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Readout live>
        Slide {index + 1} of {SLIDES}. Peak blur on the last move: {peak}px. Slow it right down to see the blur follow the speed.
      </Readout>
    </div>
  );
}

/* ── B2: blur-in beats fade-in for text ─────────────────────────────── */
export function BlurInText() {
  const ref = useRef<HTMLDivElement>(null);
  const { armed, playing, replay } = useReplay(ref);
  const [amount, setAmount] = useState(10);
  const rows = [
    { label: 'fade', from: { opacity: 0 } },
    { label: 'slide', from: { opacity: 0, transform: 'translateY(24px)' } },
    { label: 'blur in', from: { opacity: 0, filter: `blur(${amount}px)` } },
  ];
  return (
    <div ref={ref}>
      <ControlBar>
        <Slider label="Blur" min={0} max={24} value={amount} unit="px" onChange={(n) => { setAmount(n); replay(); }} />
        <Replay onClick={replay} />
      </ControlBar>
      <Stage className="space-y-4 p-4" label="Three headline entrances">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[4.5rem_1fr] items-baseline gap-3">
            <span className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">{r.label}</span>
            <p
              className="truncate font-display text-[26px] leading-[1.2] text-[var(--v-ink)] sm:text-[32px]"
              style={{
                ...(armed ? { opacity: 1, transform: 'none', filter: 'blur(0px)' } : r.from),
                transition: playing ? 'opacity 700ms cubic-bezier(0.22,1,0.36,1), transform 700ms cubic-bezier(0.22,1,0.36,1), filter 700ms cubic-bezier(0.22,1,0.36,1)' : 'none',
              }}
            >
              Things I’ve learnt
            </p>
          </div>
        ))}
      </Stage>
      <Readout>The blur-in has no travel, so it still feels calm when someone asks for less motion.</Readout>
    </div>
  );
}

/* ── B3: focus blur shows what matters ─────────────────────────────── */
const PRESETS = [
  { value: 'none', label: 'None', blur: 0, dim: 0 },
  { value: 'right', label: 'Right', blur: 4, dim: 0.35 },
  { value: 'much', label: 'Too much', blur: 24, dim: 0.8 },
] as const;
type Preset = (typeof PRESETS)[number]['value'];

export function FocusBlur() {
  const ref = useRef<HTMLDivElement>(null);
  const { armed, playing, replay } = useReplay(ref);
  const [preset, setPreset] = useState<Preset>('right');
  const [blur, setBlur] = useState(4);
  const dim = PRESETS.find((p) => p.value === preset)!.dim;
  return (
    <div ref={ref}>
      <ControlBar>
        <Choice
          label="Backdrop preset"
          value={preset}
          options={PRESETS}
          onChange={(v) => { setPreset(v); setBlur(PRESETS.find((p) => p.value === v)!.blur); replay(); }}
        />
        <Slider label="Blur" min={0} max={30} value={blur} unit="px" onChange={setBlur} />
        <Replay onClick={replay} />
      </ControlBar>
      <Stage className="h-60" label="A dialog over a page">
        <div className="space-y-3 p-4" aria-hidden>
          <p className="font-display text-[26px] text-[var(--v-ink)]">Your projects</p>
          <div className="grid grid-cols-3 gap-2">
            {['Poster', 'Deck', 'Site', 'Map', 'Type', 'Grid'].map((t) => (
              <div key={t} className="border border-[var(--v-steel)] p-2 text-[13px] text-[var(--v-soft)]">
                <div className="mb-2 h-8 bg-[var(--v-steel)]" />
                {t}
              </div>
            ))}
          </div>
        </div>
        <div
          className="absolute inset-0 grid place-items-center"
          style={{
            backdropFilter: armed ? `blur(${blur}px)` : 'blur(0px)',
            WebkitBackdropFilter: armed ? `blur(${blur}px)` : 'blur(0px)',
            background: `rgba(8,8,8,${armed ? dim : 0})`,
            transition: playing ? 'backdrop-filter 300ms ease-out, -webkit-backdrop-filter 300ms ease-out, background-color 300ms ease-out' : 'none',
          }}
        >
          <div
            role="dialog"
            aria-label="Rename project"
            className="w-[min(18rem,85%)] border border-[var(--v-ink)] bg-[var(--v-surface)] p-4"
            style={{
              opacity: armed ? 1 : 0,
              transform: armed ? 'none' : 'scale(0.96)',
              transition: playing ? 'opacity 250ms ease-out, transform 250ms cubic-bezier(0.22,1,0.36,1)' : 'none',
            }}
          >
            <p className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">Rename project</p>
            <div className="mt-3 border border-[var(--v-steel)] px-2 py-1 text-[14px] text-[var(--v-soft)]">Poster</div>
          </div>
        </div>
      </Stage>
      <Readout>{preset === 'much' ? 'You can’t tell where you were any more.' : preset === 'none' ? 'The dialog competes with the page behind it.' : 'The page is still there, just out of the way.'}</Readout>
    </div>
  );
}

/* ── B4: frosted glass needs something to blur, and a tint ─────────────────────────────── */
function lum(r: number, g: number, b: number) {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function FrostedHeader() {
  const [after, setAfter] = useState(true);
  const [tint, setTint] = useState(70);
  const alpha = after ? tint / 100 : 0;
  // Worst case under the header: pure white content. Text is --v-ink (#f5f5f5).
  const c = Math.round(8 * alpha + 255 * (1 - alpha));
  const bgL = lum(c, c, c), fgL = lum(245, 245, 245);
  const ratio = (Math.max(bgL, fgL) + 0.05) / (Math.min(bgL, fgL) + 0.05);
  const pass = ratio >= 4.5;
  return (
    <div>
      <ControlBar>
        <BeforeAfter after={after} onChange={setAfter} before="Blur only" afterLabel="Blur + tint" />
        <Slider label="Tint" min={0} max={95} step={5} value={tint} unit="%" onChange={(n) => { setTint(n); setAfter(true); }} />
      </ControlBar>
      <div className="relative mt-4 h-60 overflow-hidden border border-[var(--v-line)]">
        <div
          tabIndex={0}
          aria-label="Scrollable page under a frosted header"
          className="h-full overflow-y-auto overscroll-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v-ink)]"
        >
          <div
            className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
            style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', background: `rgba(8,8,8,${alpha})` }}
          >
            <span className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">Frosted header</span>
            <span className="text-[13px] text-[var(--v-ink)]">Menu</span>
          </div>
          <div className="space-y-3 px-4 pb-6">
            <div className="h-16 bg-[#ffffff]" />
            <p className="font-display text-[40px] leading-none text-[var(--v-ink)]">Busy content</p>
            <div className="h-10 bg-[repeating-linear-gradient(90deg,#fff_0_10px,#080808_10px_20px)]" />
            <div className="h-24 bg-[#ffffff]" />
            <p className="text-[15px] text-[var(--v-soft)]">Scroll this panel. The header blurs whatever passes under it.</p>
            <div className="h-10 bg-[repeating-linear-gradient(0deg,#fff_0_4px,#080808_4px_8px)]" />
            <div className="h-24 bg-[var(--v-steel)]" />
            <div className="h-24 bg-[#ffffff]" />
          </div>
        </div>
      </div>
      <Readout live>
        Header text over white, worst case: {ratio.toFixed(2)}:1, {pass ? 'passes AA' : 'fails AA (needs 4.5:1)'}.
      </Readout>
    </div>
  );
}

/* ── B5: blur is expensive, so budget it ─────────────────────────────── */
export function BlurBudget() {
  const reduce = useReduce();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [after, setAfter] = useState(false);
  const [layers, setLayers] = useState(6);
  const running = inView && !reduce;
  const fps = useFps(running);
  const realBlurred = after ? Math.min(1, layers) : layers;
  return (
    <div ref={ref}>
      <ControlBar>
        <BeforeAfter after={after} onChange={setAfter} before="Blur every layer" afterLabel="Budget: 1 real" />
        <Slider label="Layers" min={1} max={12} value={layers} onChange={setLayers} />
        <Action onClick={() => setLayers(12)}>Max it</Action>
      </ControlBar>
      <Stage className="h-60" label="Moving shapes under stacked frosted layers">
        <div aria-hidden className="absolute inset-0">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="fdb-p-drift absolute size-24 bg-[var(--v-ink)]"
              style={{
                left: `${10 + i * 30}%`,
                top: `${15 + (i % 2) * 40}%`,
                borderRadius: i === 1 ? '50%' : 0,
                animationDelay: `${-i * 1.3}s`,
                animationPlayState: running ? 'running' : 'paused',
                animationName: reduce ? 'none' : undefined,
              }}
            />
          ))}
        </div>
        {Array.from({ length: layers }, (_, i) => {
          const real = !after || i === 0;
          const inset = 8 + i * 6;
          return (
            <div
              key={i}
              aria-hidden
              className="absolute border border-[var(--v-steel)]"
              style={{
                inset: `${inset}px`,
                backdropFilter: real ? 'blur(10px)' : undefined,
                WebkitBackdropFilter: real ? 'blur(10px)' : undefined,
                background: real ? 'rgba(8,8,8,0.12)' : 'rgba(14,14,14,0.18)',
              }}
            />
          );
        })}
      </Stage>
      <Readout>
        {running ? `${fps} fps` : 'paused'} · {realBlurred} real blur{realBlurred === 1 ? '' : 's'} re-sampled every frame{after ? ', the rest are a flat tint' : ''}.
      </Readout>
      <style>{`.fdb-p-drift { animation: fdb-p-drift 4s ease-in-out infinite alternate; }
      @keyframes fdb-p-drift { to { transform: translate(60px, 40px) rotate(90deg); } }`}</style>
    </div>
  );
}
