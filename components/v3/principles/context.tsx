'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/*
 * Page-wide motion state for /principles. The page has its own "Reduce motion" switch, and the OS
 * setting always wins: reduce = system setting OR the switch. Every demo reads useReduce().
 */
type MotionState = { os: boolean; forced: boolean; setForced: (v: boolean) => void };

const MotionCtx = createContext<MotionState>({ os: false, forced: false, setForced: () => {} });

function useOsReduce() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

export function ReduceMotionProvider({ children }: { children: ReactNode }) {
  const os = useOsReduce();
  const [forced, setForced] = useState(false);
  return <MotionCtx.Provider value={{ os, forced, setForced }}>{children}</MotionCtx.Provider>;
}

/** true when demos should show their composed still: the OS asks for it or the page switch is on. */
export function useReduce() {
  const { os, forced } = useContext(MotionCtx);
  return os || forced;
}

/** The page-wide switch. When the OS already reduces motion it shows that and stays on. */
export function ReduceToggle({ className = '' }: { className?: string }) {
  const { os, forced, setForced } = useContext(MotionCtx);
  const on = os || forced;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={os}
      onClick={() => setForced(!forced)}
      className={`pixel inline-flex items-center gap-3 border border-[var(--v-steel)] bg-[var(--v-bg)] px-3 py-2 text-[16px] leading-[16px] text-[var(--v-ink)] hover:border-[var(--v-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)] disabled:cursor-not-allowed ${className}`}
    >
      <span aria-hidden className="inline-block w-[3ch] text-left">{on ? '[x]' : '[ ]'}</span>
      <span>Reduce motion{os ? ' (from your system)' : ''}</span>
    </button>
  );
}

/** true while the element is on screen. Loops and meters stop when this is false. */
export function useInView(ref: RefObject<HTMLElement | null>, margin = '0px') {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return inView;
}

/**
 * Replay helper for transition demos. Plays once when the demo first comes on screen, then on every
 * replay(). `armed` is false for two frames (start state, no transition) and then true (end state).
 * Under reduced motion `armed` is always true, so the demo shows its composed end state.
 */
export function useReplay(ref: RefObject<HTMLElement | null>) {
  const reduce = useReduce();
  const inView = useInView(ref);
  const [run, setRun] = useState(0);
  const [armed, setArmed] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (inView && !started.current) {
      started.current = true;
      setRun((r) => r + 1);
    }
  }, [inView]);
  useEffect(() => {
    if (run === 0) return;
    setArmed(false);
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setArmed(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [run]);
  const replay = useCallback(() => setRun((r) => r + 1), []);
  // Before the first play the end state shows, so nothing is hidden without JavaScript or off screen.
  return { armed: reduce || run === 0 || armed, playing: !reduce && run > 0 && armed, run, replay, inView, reduce };
}

/** Frames per second, measured while `on`. Updates twice a second. */
export function useFps(on: boolean) {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let frames = 0;
    let t0 = performance.now();
    const tick = (now: number) => {
      frames++;
      if (now - t0 >= 500) {
        setFps(Math.round((frames * 1000) / (now - t0)));
        frames = 0;
        t0 = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return fps;
}
