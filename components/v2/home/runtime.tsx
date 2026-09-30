'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/*
 * Home runtime: tiny external stores so scroll never re-renders the page.
 *  - Progress stores: one per act, written by ScrollTrigger, read in rAF loops or by the one
 *    component that needs a number (ExperienceFrame's `progress` prop).
 *  - Active act: the rail reads it.
 *  - GL budget: at most two live WebGL contexts at any time, picked by visibility.
 */

type Listener = () => void;

export interface ProgressStore {
  get: () => number;
  set: (v: number) => void;
  subscribe: (fn: Listener) => () => void;
}

export function createProgress(initial = 0): ProgressStore {
  let v = initial;
  const ls = new Set<Listener>();
  return {
    get: () => v,
    set: (n) => {
      if (n === v) return;
      v = n;
      ls.forEach((l) => l());
    },
    subscribe: (fn) => {
      ls.add(fn);
      return () => ls.delete(fn);
    },
  };
}

/** Read a store as a number, quantised so React re-renders at most ~200 times across the whole range. */
export function useQuantised(store: ProgressStore | undefined, step = 0.005) {
  return useSyncExternalStore(
    (fn) => (store ? store.subscribe(fn) : () => {}),
    () => (store ? Math.round(store.get() / step) * step : 0),
    () => 0,
  );
}

export const activeAct = createProgress(0);
/** 0 while the preloader runs, 1 once the journey may start (boot intro plays, scroll unlocks). */
export const ready = createProgress(0);
export const overall = createProgress(0);

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function useIsNarrow(px = 768) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px - 1}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [px]);
  return narrow;
}

/* ───────────── GL budget ───────────── */

/*
 * Live WebGL contexts at once: 3 on desktop, 2 on phones. On-screen slots rank first (by visible
 * ratio + priority); the rest of the budget goes to slots within ~0.75 screens, so the next piece
 * already holds a live context before you reach it instead of swapping in from its still.
 */
const maxGl = () => (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? 2 : 3);
const slots = new Map<string, { ratio: number; near: boolean; priority: number }>();
let allowed = new Set<string>();
const budgetListeners = new Set<Listener>();

function recompute() {
  const ranked = [...slots.entries()]
    .filter(([, s]) => s.ratio > 0 || s.near)
    .map(([id, s]) => ({ id, score: s.ratio > 0 ? 1 + s.ratio + s.priority : s.priority * 0.01 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxGl())
    .map((r) => r.id);
  const next = new Set(ranked);
  const same = next.size === allowed.size && ranked.every((id) => allowed.has(id));
  if (same) return;
  allowed = next;
  budgetListeners.forEach((l) => l());
}

/**
 * Registers a WebGL user. Returns true while it may hold a live context. On-screen slots win, by
 * visible ratio; ties favour `priority` (the signature cube gets a bonus). Near slots fill what's left.
 */
export function useGlBudget(id: string, ref: React.RefObject<HTMLElement | null>, enabled = true, priority = 0) {
  const live = useSyncExternalStore(
    (fn) => {
      budgetListeners.add(fn);
      return () => budgetListeners.delete(fn);
    },
    () => allowed.has(id),
    () => false,
  );
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    slots.set(id, { ratio: 0, near: false, priority });
    const vis = new IntersectionObserver(
      ([e]) => {
        const s = slots.get(id);
        if (!s) return;
        s.ratio = e.isIntersecting ? Math.max(e.intersectionRatio, 0.001) : 0;
        recompute();
      },
      { threshold: [0, 0.01, 0.1, 0.25, 0.5, 0.75, 1] },
    );
    const near = new IntersectionObserver(
      ([e]) => {
        const s = slots.get(id);
        if (!s) return;
        s.near = e.isIntersecting;
        recompute();
      },
      { rootMargin: '75% 0px' },
    );
    vis.observe(el);
    near.observe(el);
    return () => {
      vis.disconnect();
      near.disconnect();
      slots.delete(id);
      recompute();
    };
  }, [id, ref, enabled, priority]);
  return live;
}

/** Visible-on-screen flag for non-GL loops (canvas2d, DOM). */
export function useOnScreen(ref: React.RefObject<HTMLElement | null>, margin = '0px') {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return on;
}

export function useLatest<T>(v: T) {
  const r = useRef(v);
  r.current = v;
  return r;
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Local progress of `p` inside [a, b]. */
export const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

/* ───────────── scrolling ───────────── */

type Scroller = { scrollTo: (target: HTMLElement | number, opts?: { immediate?: boolean; duration?: number; offset?: number }) => void };
export const scroller: { current: Scroller | null } = { current: null };

/** Jump to an act by id. Lenis when running, native otherwise. */
export function scrollToAct(id: string, immediate = false) {
  const el = document.getElementById(id);
  if (!el && id !== 'top') return;
  const target = id === 'top' ? 0 : el!;
  if (scroller.current) scroller.current.scrollTo(target, { immediate, duration: 1.4, offset: id === 'top' ? 0 : -48 });
  else if (id === 'top') window.scrollTo({ top: 0 });
  else window.scrollTo({ top: el!.getBoundingClientRect().top + window.scrollY - 48 });
}
