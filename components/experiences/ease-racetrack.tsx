'use client';

/*
 * Ease Racetrack: the same move under twelve eases, side by side, in pure black and white.
 * Every lane runs the same distance in the same duration, so the ease is the only difference.
 * One paused gsap.timeline holds twelve real tweens at position 0 (one per lane), on the property
 * you pick: x, scale, filter blur, rotation or clip-path. The timeline is what plays, scrubs and
 * slows down (timeScale 0.25). Each lane has its curve (gsap.parseEase sampled into an SVG path)
 * with a playhead dot, a live readout of the value, and copies its exact GSAP string on click.
 */

import gsap from 'gsap';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner } from './g3-kit';

const TOOLS = ['gsap', 'svg', 'css'];

type Lane = { ease: string; use: string; never: string };
const LANES: Lane[] = [
  {
    ease: 'none',
    use: 'loops, marquees, scroll scrubs and progress bars.',
    never: 'UI that arrives or leaves. It feels robotic.',
  },
  {
    ease: 'power1.out',
    use: 'small hovers and colour fades.',
    never: 'big moves. It is too soft to read as intent.',
  },
  {
    ease: 'power2.out',
    use: 'the default UI move: menus, cards, toasts.',
    never: 'long, cinematic moves. It runs out of drama.',
  },
  {
    ease: 'power3.out',
    use: 'panels and drawers sliding in.',
    never: 'tiny nudges. The long tail is wasted.',
  },
  {
    ease: 'power4.out',
    use: 'hero text and big entrances.',
    never: 'micro interactions seen many times a minute.',
  },
  {
    ease: 'expo.out',
    use: 'snappy reveals that land softly: headlines, image wipes.',
    never: 'things leaving. The fast start reads as a jump.',
  },
  {
    ease: 'circ.out',
    use: 'a hard brake: counters, dropdowns.',
    never: 'playful motion. It feels mechanical.',
  },
  {
    ease: 'sine.inOut',
    use: 'breathing, floating and gentle yoyo loops.',
    never: 'a click response. It starts too slowly.',
  },
  {
    ease: 'power2.inOut',
    use: 'things moving across: carousels, page slides.',
    never: 'entrances from off screen. The slow start feels late.',
  },
  {
    ease: 'back.out(1.7)',
    use: 'playful pop ins: badges, tooltips, buttons.',
    never: 'text blocks or serious data.',
  },
  {
    ease: 'elastic.out(1,0.4)',
    use: 'one moment of joy: a like, a success tick.',
    never: 'navigation, or anything seen twice a minute.',
  },
  {
    ease: 'steps(8)',
    use: 'sprites, pixel art, typewriters and clock ticks.',
    never: 'smooth UI. It reads as lag.',
  },
];

type Prop = 'x' | 'scale' | 'blur' | 'rotation' | 'clip';
const PROPS: { id: Prop; label: string; note: string }[] = [
  {
    id: 'x',
    label: 'x',
    note: 'Position. Distance makes the ease easy to read. Overshoot runs past the line.',
  },
  {
    id: 'scale',
    label: 'scale',
    note: 'Scale 0 to 1 from the left edge. Overshoot grows past the line, then settles.',
  },
  {
    id: 'blur',
    label: 'blur',
    note: 'filter: blur(12px) to 0. Blur cannot go below 0, so back and elastic look sharp early. Blur is costly: keep it small.',
  },
  {
    id: 'rotation',
    label: 'rotation',
    note: 'Rotation 0 to 360 degrees. Watch the notch: overshoot spins past the top and comes back.',
  },
  {
    id: 'clip',
    label: 'clip',
    note: 'clip-path: inset() reveal. Overshoot is invisible here: past 0% there is nothing left to show.',
  },
];

/** elastic.out(1,0.4) peaks near 1.37 and back.out(1.7) at 1.10: movers end at 1/OVER of the track. */
const OVER = 1.4;
const RUNNER = 14;
const CYCLE = 3.5;
const HOLD = 1.1;
const STILL_AT = 0.4;
const SLOW = 0.25;
/** spacing ticks: where each lane is at every 1/8 of the duration */
const TICKS = [1, 2, 3, 4, 5, 6, 7];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fmtDur = (d: number) => String(Math.round(d * 10) / 10);

function codeFor(prop: Prop, ease: string, dur: number, dist: number) {
  const tail = `duration: ${fmtDur(dur)}, ease: "${ease}" }`;
  switch (prop) {
    case 'x':
      return `gsap.to(el, { x: ${dist}, ${tail})`;
    case 'scale':
      return `gsap.fromTo(el, { scale: 0, transformOrigin: "left center" }, { scale: 1, ${tail})`;
    case 'blur':
      return `gsap.fromTo(el, { filter: "blur(12px)" }, { filter: "blur(0px)", ${tail})`;
    case 'rotation':
      return `gsap.to(el, { rotation: 360, ${tail})`;
    case 'clip':
      return `gsap.fromTo(el, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", ${tail})`;
  }
}

function readout(prop: Prop, v: number, dist: number) {
  switch (prop) {
    case 'x':
      return `${Math.round(v * dist)}px`;
    case 'scale':
      return v.toFixed(2);
    case 'blur':
      return `${Math.max(0, 12 * (1 - v)).toFixed(1)}px`;
    case 'rotation':
      return `${Math.round(v * 360)}°`;
    case 'clip':
      return `${Math.round(clamp01(v) * 100)}%`;
  }
}

// curve box: values -0.1..1.45 mapped into the height, so back and elastic overshoot stay inside
const vy = (v: number, h: number, pad: number) => pad + (1 - (v + 0.1) / 1.55) * (h - pad * 2);
function curvePath(fn: (t: number) => number, w: number, h: number, pad: number) {
  let d = '';
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    d += `${i ? 'L' : 'M'}${(pad + t * (w - pad * 2)).toFixed(2)},${vy(fn(t), h, pad).toFixed(2)}`;
  }
  return d;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
  className = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt: (v: number) => string;
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 items-center gap-2 text-[var(--v-dim)] ${className}`}>
      <span className="shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-4 min-w-0 flex-1 accent-[var(--v-ink)]"
      />
      <span className="w-[4ch] shrink-0 text-right text-[var(--v-soft)]">{fmt(value)}</span>
    </label>
  );
}

export default function EaseRacetrack({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const lanesBox = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLSpanElement>(null);
  const codeRef = useRef<HTMLElement>(null);
  const movers = useRef<(HTMLSpanElement | null)[]>([]);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const reads = useRef<(HTMLSpanElement | null)[]>([]);
  const scrubEl = useRef<HTMLInputElement>(null);
  const clockEl = useRef<HTMLSpanElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const raceRef = useRef<() => void>(() => {});
  const scrubRef = useRef<(v: number) => void>(() => {});
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const slowRef = useRef(false);
  const copyTimer = useRef(0);

  const [prop, setProp] = useState<Prop>('x');
  const [dur, setDur] = useState(0.8);
  const [slow, setSlow] = useState(false);
  const [focus, setFocus] = useState(5);
  const [copied, setCopied] = useState<null | { i: number; ok: boolean }>(null);
  const [sz, setSz] = useState({ w: 0, h: 0 });
  const [trackW, setTrackW] = useState(0);
  const [lanesH, setLanesH] = useState(0);

  const fns = useMemo(() => LANES.map((l) => gsap.parseEase(l.ease)), []);
  const scripted = progress !== undefined;

  useLayoutEffect(() => {
    const measure = () => {
      if (host.current) setSz({ w: host.current.clientWidth, h: host.current.clientHeight });
      if (track.current) setTrackW(Math.round(track.current.clientWidth));
      if (lanesBox.current) setLanesH(lanesBox.current.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    [host.current, lanesBox.current, track.current].forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, []);

  const barW = Math.max(40, Math.round(trackW / OVER));
  const dist = barW - RUNNER;
  const laneH = lanesH / LANES.length;
  const cw = sz.w >= 1000 ? 56 : sz.w < 460 ? 28 : 40;
  const ch = Math.round(Math.min(36, Math.max(12, laneH - 10)));
  const rot = Math.round(Math.min(40, Math.max(10, laneH * 0.7)));
  const showRead = sz.w >= 560;
  const showScrub = sz.w >= 520;
  const showCode = sz.h >= 380;
  const showNotes = sz.h >= 600;
  const showFooter = sz.h >= 480;
  // very short hosts: keep the property switch and give the rest of the room to the lanes
  const tight = sz.h > 0 && sz.h < 280;
  const noNames = tight && laneH < 13;
  const cols = `${noNames ? '0px' : '144px'} ${cw}px minmax(0,1fr)${showRead ? ' 64px' : ''}`;

  /* the race: one paused timeline, twelve tweens at position 0 */
  useLayoutEffect(() => {
    if (!trackW) return;
    const els = movers.current.slice(0, LANES.length).filter((e): e is HTMLSpanElement => !!e);
    if (els.length !== LANES.length) return;
    const auto = active && !reducedMotion && !scripted;
    let call: gsap.core.Tween | null = null;
    const cpad = 3;

    const paint = (p: number) => {
      for (let i = 0; i < LANES.length; i++) {
        const v = fns[i](p);
        const d = dots.current[i];
        if (d) {
          d.setAttribute('cx', (cpad + p * (cw - cpad * 2)).toFixed(2));
          d.setAttribute('cy', vy(v, ch, cpad).toFixed(2));
        }
        const r = reads.current[i];
        if (r) r.textContent = readout(prop, v, dist);
      }
      if (scrubEl.current) scrubEl.current.value = String(p);
      if (clockEl.current) clockEl.current.textContent = `t ${p.toFixed(2)}`;
    };

    const tl = gsap.timeline({
      paused: true,
      onUpdate: () => paint(tl.progress()),
      onComplete: () => {
        paint(1);
        if (!auto) return;
        call?.kill();
        call = gsap.delayedCall(HOLD, race); // short rest at the line, then race again
      },
    });
    const race = () => {
      call?.kill();
      tl.restart();
    };

    els.forEach((el, i) => {
      const v = { duration: dur, ease: LANES[i].ease };
      if (prop === 'x') tl.fromTo(el, { x: 0 }, { x: dist, ...v }, 0);
      else if (prop === 'scale') tl.fromTo(el, { scale: 0, transformOrigin: 'left center' }, { scale: 1, ...v }, 0);
      else if (prop === 'blur') tl.fromTo(el, { filter: 'blur(12px)' }, { filter: 'blur(0px)', ...v }, 0);
      else if (prop === 'rotation') tl.fromTo(el, { rotation: 0 }, { rotation: 360, ...v }, 0);
      else tl.fromTo(el, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ...v }, 0);
    });
    tl.timeScale(slowRef.current ? SLOW : 1);
    tlRef.current = tl;

    raceRef.current = () => {
      if (reducedMotion || scripted) return;
      race();
    };
    scrubRef.current = (p: number) => {
      if (scripted) return;
      call?.kill();
      tl.pause();
      tl.progress(p);
      paint(p);
      // hand back to autoplay after a pause, so a scrub never leaves the page frozen
      call?.kill(); // scrubbing to 1 fires onComplete, which may have queued a race
      if (auto) call = gsap.delayedCall(CYCLE, race);
    };

    if (reducedMotion) {
      tl.progress(STILL_AT);
      paint(STILL_AT);
    } else if (scripted) {
      const p = clamp01(progressRef.current ?? 0);
      tl.progress(p);
      paint(p);
    } else if (!active) {
      tl.progress(1);
      paint(1);
    } else {
      paint(0);
      call = gsap.delayedCall(0.4, race);
    }

    return () => {
      call?.kill();
      tl.kill();
      tlRef.current = null;
      raceRef.current = () => {};
      scrubRef.current = () => {};
      gsap.set(els, { clearProps: 'transform,filter,clipPath' });
    };
  }, [prop, dur, trackW, dist, cw, ch, active, reducedMotion, scripted, fns]);

  /* progress from a parent scrubs every lane together */
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl || progress === undefined || reducedMotion) return;
    tl.pause();
    tl.progress(clamp01(progress));
  }, [progress, reducedMotion]);

  /* slow-mo: timeScale on the one timeline, no rebuild */
  useEffect(() => {
    slowRef.current = slow;
    tlRef.current?.timeScale(slow ? SLOW : 1);
  }, [slow]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const copy = useCallback(
    async (i: number) => {
      setFocus(i);
      const text = codeFor(prop, LANES[i].ease, dur, dist);
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        ok = false;
      }
      if (!ok) {
        // fallback: select the code line so Ctrl+C or Cmd+C still works
        requestAnimationFrame(() => {
          const el = codeRef.current;
          const sel = window.getSelection();
          if (!el || !sel) return;
          const r = document.createRange();
          r.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(r);
        });
      }
      setCopied({ i, ok });
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(null), 1600);
    },
    [prop, dur, dist],
  );

  const lane = LANES[focus];
  const propInfo = PROPS.find((p) => p.id === prop)!;
  const status = reducedMotion ? 'still at 40%' : scripted ? 'scroll drives it' : null;
  const btn = 'px-1 border border-[var(--v-steel)] hover:border-[var(--v-soft)] disabled:opacity-40 disabled:hover:border-[var(--v-steel)]';

  return (
    <div ref={host} className="relative h-full w-full overflow-hidden bg-[var(--v-bg)] text-[var(--v-ink)]">
      <Corner title="Ease Racetrack" tools={TOOLS} />
      <div className="absolute inset-x-2 top-[52px] bottom-2 flex flex-col gap-2 sm:inset-x-3 sm:bottom-3">
        {/* controls */}
        <div className="pixel flex flex-wrap items-center gap-x-4 gap-y-2 text-[16px] leading-[16px]">
          <div role="group" aria-label="property the ease is applied to" className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[var(--v-dim)]">property</span>
            {PROPS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={prop === p.id}
                onClick={() => setProp(p.id)}
                className={`${btn} ${prop === p.id ? 'bg-[var(--v-ink)] text-[var(--v-bg)]' : 'text-[var(--v-soft)]'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {!tight && (
            <>
              <Slider
                label="duration"
                value={dur}
                min={0.2}
                max={2}
                step={0.1}
                onChange={setDur}
                fmt={(v) => `${v.toFixed(1)}s`}
                className="w-[230px] max-w-full"
              />
              <button type="button" onClick={() => raceRef.current()} disabled={reducedMotion || scripted} className={`${btn} text-[var(--v-ink)]`}>
                [race]
              </button>
              <button
                type="button"
                aria-pressed={slow}
                onClick={() => setSlow((s) => !s)}
                className={`${btn} ${slow ? 'bg-[var(--v-ink)] text-[var(--v-bg)]' : 'text-[var(--v-soft)]'}`}
              >
                slow-mo x0.25 {slow ? 'on' : 'off'}
              </button>
            </>
          )}
          {showScrub && !tight && (
            <label className="flex min-w-0 items-center gap-2 text-[var(--v-dim)]">
              <span className="shrink-0">scrub</span>
              <input
                ref={scrubEl}
                type="range"
                min={0}
                max={1}
                step={0.001}
                defaultValue={0}
                disabled={scripted}
                onInput={(e) => scrubRef.current(Number((e.target as HTMLInputElement).value))}
                className="h-4 w-[120px] accent-[var(--v-ink)] disabled:opacity-40"
                aria-label="scrub the race by hand"
              />
            </label>
          )}
          <span ref={clockEl} className="text-[var(--v-soft)]">
            t 0.00
          </span>
          {noNames && <span className="text-[var(--v-ink)]">{lane.ease}</span>}
          {status && <span className="text-[var(--v-dim)]">{status}</span>}
        </div>

        {/* the code for the lane under the pointer */}
        {showCode && (
          <div className="border border-[var(--v-steel)] bg-[var(--v-surface)] px-2 py-1">
            <div className={`flex gap-x-3 gap-y-1 ${sz.w < 560 ? 'flex-col' : 'items-start justify-between'}`}>
              <code ref={codeRef} className="min-w-0 font-mono text-[13px] leading-[18px] [overflow-wrap:anywhere] text-[var(--v-ink)]">
                {codeFor(prop, lane.ease, dur, dist)}
              </code>
              <span className="pixel shrink-0 text-[16px] leading-[16px] text-[var(--v-dim)]" aria-live="polite">
                {copied ? (
                  <span className="bg-[var(--v-ink)] px-1 text-[var(--v-bg)]">{copied.ok ? 'copied' : 'selected: press Ctrl+C'}</span>
                ) : (
                  'click a lane to copy'
                )}
              </span>
            </div>
            {showNotes && (
              <div className="mt-1 grid gap-x-6 gap-y-0.5 text-[14px] leading-[20px] text-[var(--v-soft)] md:grid-cols-2">
                <p>
                  <span className="text-[var(--v-ink)]">{lane.ease}</span> use it for: {lane.use}
                </p>
                <p>
                  <span className="text-[var(--v-ink)]">{lane.ease}</span> never for: {lane.never}
                </p>
                <p className="text-[var(--v-dim)] md:col-span-2">
                  on <span className="text-[var(--v-soft)]">{propInfo.label}</span>: {propInfo.note}
                  {prop !== 'blur' && prop !== 'rotation' && ' Grey ticks mark every 1/8 of the time: bunched ticks mean slow, spread ticks mean fast.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* twelve lanes */}
        <div ref={lanesBox} className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-[var(--v-line)]">
          {LANES.map((l, i) => {
            const on = i === focus;
            const isCopied = copied?.i === i;
            return (
              <button
                key={l.ease}
                type="button"
                onClick={() => copy(i)}
                onMouseEnter={reducedMotion ? undefined : () => setFocus(i)}
                onFocus={() => setFocus(i)}
                aria-label={`${l.ease}: copy its GSAP string`}
                className={`grid ${tight ? 'min-h-0 overflow-hidden' : 'min-h-[16px]'} flex-1 items-center gap-2 border-b border-[var(--v-line)] text-left ${on ? 'bg-[var(--v-surface)]' : ''}`}
                style={{ gridTemplateColumns: cols }}
              >
                <span
                  className={`pixel truncate ${noNames ? 'invisible text-[1px]' : 'text-[16px] leading-[16px]'} ${
                    isCopied ? 'bg-[var(--v-ink)] text-[var(--v-bg)]' : on ? 'text-[var(--v-ink)]' : 'text-[var(--v-soft)]'
                  }`}
                >
                  {l.ease}
                </span>
                <svg width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} className="shrink-0 overflow-visible" aria-hidden>
                  <rect x="0.5" y="0.5" width={cw - 1} height={ch - 1} fill="none" stroke="var(--v-line)" />
                  <path d={curvePath(fns[i], cw, ch, 3)} fill="none" stroke={on ? 'var(--v-ink)' : 'var(--v-dim)'} strokeWidth="1.25" />
                  <circle
                    ref={(el) => {
                      dots.current[i] = el;
                    }}
                    r="2"
                    cx="3"
                    cy={vy(0, ch, 3)}
                    fill="var(--v-ink)"
                  />
                </svg>
                <span ref={i === 0 ? track : undefined} className="relative flex h-full min-w-0 items-center overflow-x-clip">
                  <span aria-hidden className="absolute top-1/2 right-0 left-0 border-t border-dashed border-[var(--v-steel)]" />
                  {trackW > 0 &&
                    (prop === 'x' || prop === 'scale' || prop === 'clip') &&
                    TICKS.map((k) => {
                      const v = fns[i](k / 8);
                      const left = prop === 'x' ? v * dist + RUNNER / 2 : (prop === 'clip' ? clamp01(v) : v) * barW;
                      return (
                        <span
                          key={k}
                          aria-hidden
                          className="absolute top-[14%] bottom-[14%] w-px bg-[var(--v-steel)]"
                          style={{ left: Math.round(left) }}
                        />
                      );
                    })}
                  {trackW > 0 && prop !== 'rotation' && (
                    <span aria-hidden className="absolute top-[18%] bottom-[18%] w-px bg-[var(--v-dim)]" style={{ left: barW }} />
                  )}
                  {prop === 'x' && (
                    <span
                      key="x"
                      ref={(el) => {
                        movers.current[i] = el;
                      }}
                      className="relative block h-[14px] w-[14px] shrink-0 bg-[var(--v-ink)]"
                    />
                  )}
                  {(prop === 'scale' || prop === 'blur' || prop === 'clip') && (
                    <span
                      key={prop}
                      ref={(el) => {
                        movers.current[i] = el;
                      }}
                      className="relative block h-[12px] shrink-0 bg-[var(--v-ink)]"
                      style={{ width: barW }}
                    />
                  )}
                  {prop === 'rotation' && (
                    <span
                      key="rotation"
                      ref={(el) => {
                        movers.current[i] = el;
                      }}
                      className="relative block shrink-0 rounded-full border-2 border-[var(--v-ink)]"
                      style={{
                        width: rot,
                        height: rot,
                        marginLeft: Math.max(0, barW - rot / 2),
                      }}
                    >
                      <span aria-hidden className="absolute top-0 left-1/2 block h-1/2 w-[2px] -translate-x-1/2 bg-[var(--v-ink)]" />
                    </span>
                  )}
                </span>
                {showRead && (
                  <span
                    ref={(el) => {
                      reads.current[i] = el;
                    }}
                    className="pixel pr-1 text-right text-[16px] leading-[16px] text-[var(--v-soft)]"
                  />
                )}
              </button>
            );
          })}
        </div>

        {showFooter && (
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-soft)]">
            Ease out for things arriving. Ease in for things leaving. In-out for things moving across. Linear only for loops and scrubs.
          </p>
        )}
      </div>
    </div>
  );
}
