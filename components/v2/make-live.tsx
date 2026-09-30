'use client';

import { Component, createContext, lazy, use, Suspense, useEffect, useId, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { ExperienceProps } from '@/lib/experiences/types';
import { AsciiLoading } from './experience-frame';
import { getEntry, isGL } from './make-data';
import { promote, useGlSlot } from './make-budget';

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

/** Keeps a broken experience from taking the page down with it. */
class Boundary extends Component<{ children: ReactNode; label: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="grid h-full w-full place-items-center bg-[var(--v-bg)]">
          <pre className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[err] {this.props.label} did not load</pre>
        </div>
      );
    return this.props.children;
  }
}

function asciiCard(title: string) {
  const t = title.slice(0, 18);
  const w = Math.max(t.length, 10) + 4;
  const fill = (c: string) => c.repeat(w - 4);
  return `┌${'─'.repeat(w)}┐\n│  ${'░▒▓█'.repeat(8).slice(0, w - 4)}  │\n│  ${t.padEnd(w - 4, ' ')}  │\n│  ${fill('░')}  │\n└${'─'.repeat(w)}┘`;
}

/** Ids that have public/posters/<id>.webp. Pages read the folder on the server and provide it. */
const PostersContext = createContext<Set<string> | null>(null);
export function PostersProvider({ ids, children }: { ids: string[]; children: ReactNode }) {
  const set = useMemo(() => new Set(ids), [ids]);
  return <PostersContext value={set}>{children}</PostersContext>;
}

/** Poster, or an ASCII card when the poster is missing. Always underneath the live piece. */
export function Poster({ id, title }: { id: string; title: string }) {
  const known = use(PostersContext);
  const [failed, setFailed] = useState(false);
  const missing = failed || (known ? !known.has(id) : false);
  return missing ? (
    <div className="absolute inset-0 grid place-items-center bg-[var(--v-surface)]" aria-hidden>
      <pre className="pixel text-center text-[16px] leading-[16px] text-[var(--v-dim)]">
        {asciiCard(title)}
      </pre>
    </div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/posters/${id}.webp`}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

/**
 * One experience as a 16:10 (or any) preview. GL pieces take a slot from the shared budget; DOM pieces
 * play while in view. When a piece stops being live it unmounts at once (freeing its GL context), then and the
 * poster shows again.
 */
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: none)');
    setCoarse(mq.matches);
  }, []);
  return coarse;
}

/**
 * mode 'auto' (the /make grid): GL pieces compete for the budget by centre distance, DOM pieces play in view.
 * mode 'hover' (tool thumbnails): poster until hovered or focused; on touch, the centred one plays.
 */
export function LivePreview({
  id,
  className = '',
  forceLive = false,
  hot,
  mode = 'auto',
}: {
  id: string;
  className?: string;
  forceLive?: boolean;
  /** parent is hovered or focused: promote this preview to the front of the GL queue */
  hot?: boolean;
  mode?: 'auto' | 'hover';
}) {
  const entry = getEntry(id);
  const ref = useRef<HTMLDivElement>(null);
  const key = useId() + id;
  const gl = entry ? isGL(entry) : false;
  const reducedMotion = useReducedMotion();
  const coarse = useCoarsePointer();
  const [selfHot, setSelfHot] = useState(false);
  const isHot = !!hot || selfHot;
  const eligible = !!entry?.load && (mode === 'auto' || isHot || coarse);
  const glLive = useGlSlot(key, ref, gl && eligible);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || gl) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: coarse ? 0.6 : 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, [gl, coarse]);

  useEffect(() => {
    promote(key, isHot);
  }, [isHot, key, eligible]);

  const live = !!entry?.load && (forceLive || (eligible && (gl ? glLive : inView)));
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (live) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), 0);
    return () => clearTimeout(t);
  }, [live]);

  // Small cards render the piece at a full 1280px-wide layout and scale it down, so each
  // experience's own labels and controls keep their full-screen proportions instead of colliding.
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const STAGE_W = 1280;
  const scale = box.w > 0 && box.w < 900 ? box.w / STAGE_W : 1;

  const Comp = useMemo(
    () => (entry?.load ? (lazy(entry.load) as ComponentType<ExperienceProps>) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry?.id],
  );

  return (
    <div
      ref={ref}
      data-live={live ? 'on' : 'off'}
      className={`relative overflow-hidden bg-[var(--v-surface)] ${className}`}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setSelfHot(true)}
      onPointerLeave={() => setSelfHot(false)}
    >
      <Poster id={id} title={entry?.title ?? id} />
      {mounted && Comp ? (
        <div
          className="absolute top-0 left-0"
          style={
            scale < 1
              ? { width: STAGE_W, height: box.h / scale, transform: `scale(${scale})`, transformOrigin: '0 0' }
              : { width: '100%', height: '100%' }
          }
        >
          <Boundary label={id}>
            <Suspense fallback={<AsciiLoading label={id} />}>
              <Comp active={live} reducedMotion={reducedMotion} />
            </Suspense>
          </Boundary>
        </div>
      ) : null}
      {!entry?.load ? (
        <span className="pixel absolute bottom-2 left-2 bg-[var(--v-bg)] px-1 text-[16px] leading-[16px] text-[var(--v-dim)]">[in progress]</span>
      ) : mode === 'hover' && !live && !coarse ? (
        <span className="pixel absolute bottom-2 left-2 bg-[var(--v-bg)] px-1 text-[16px] leading-[16px] text-[var(--v-dim)]">[hover to play]</span>
      ) : null}
    </div>
  );
}
