'use client';

import { useEffect, useSyncExternalStore } from 'react';

/*
 * The shared GL budget. Every WebGL card on a page registers here; at most MAX_DESKTOP (2) are live
 * on desktop and 1 on phones. Priority: the most recently hovered or focused card first, then the
 * in-view cards closest to the viewport centre. One scroll listener for the whole page, rAF-throttled.
 * Losing a slot is reported at once; the card itself waits 800ms before unmounting (see make-live).
 */

const MAX_DESKTOP = 2;
const MAX_PHONE = 1;

interface Slot {
  el: HTMLElement;
  inView: boolean;
  promotedAt: number;
}

const slots = new Map<string, Slot>();
let allowed = new Set<string>();
const listeners = new Set<() => void>();
let raf = 0;
let io: IntersectionObserver | null = null;
let wired = false;

function capacity() {
  return window.matchMedia('(max-width: 639px)').matches ? MAX_PHONE : MAX_DESKTOP;
}

function recompute() {
  raf = 0;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const ranked = [...slots.entries()]
    .filter(([, s]) => s.inView)
    .map(([key, s]) => {
      const r = s.el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - vw / 2;
      const dy = r.top + r.height / 2 - vh / 2;
      return { key, promotedAt: s.promotedAt, d: Math.hypot(dx, dy) };
    })
    .sort((a, b) => b.promotedAt - a.promotedAt || a.d - b.d);
  const next = new Set(ranked.slice(0, capacity()).map((r) => r.key));
  let same = next.size === allowed.size;
  if (same) for (const k of next) if (!allowed.has(k)) same = false;
  if (!same) {
    allowed = next;
    listeners.forEach((l) => l());
  }
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(recompute);
}

function wire() {
  if (wired) return;
  wired = true;
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const key = (e.target as HTMLElement).dataset.glKey;
        const s = key ? slots.get(key) : undefined;
        if (s) s.inView = e.isIntersecting;
      }
      schedule();
    },
    { threshold: 0.25 },
  );
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Hover or focus: jump to the front of the queue. Pass false on leave to drop back to distance order. */
export function promote(key: string, on = true) {
  const s = slots.get(key);
  if (!s) return;
  s.promotedAt = on ? performance.now() : 0;
  schedule();
}

/** Register an element under a unique key. Returns whether it currently holds a live slot. */
export function useGlSlot(key: string, ref: React.RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    wire();
    el.dataset.glKey = key;
    slots.set(key, { el, inView: false, promotedAt: 0 });
    io!.observe(el);
    schedule();
    return () => {
      io?.unobserve(el);
      slots.delete(key);
      schedule();
    };
  }, [key, ref, enabled]);

  return useSyncExternalStore(
    subscribe,
    () => allowed.has(key),
    () => false,
  );
}
