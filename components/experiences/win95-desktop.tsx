'use client';

import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { ExperienceProps } from '@/lib/experiences/types';
import { ExperienceFrame } from '@/components/v2/experience-frame';
import { getExperience } from '@/lib/experiences';

gsap.registerPlugin(Flip);

/*
 * Win95 Desktop: the hub of the retro stage.
 *  - CSS bevels (four inset box-shadows), pixel-exact borders, pixel icons (image-rendering: pixelated)
 *  - windows are absolutely positioned; drag by the title bar
 *  - maximise: Flip.getState → class change → Flip.from; minimise: Flip.fit flies the window into its
 *    taskbar button; every window move uses stepped eases, like the period
 *  - the terminal is a Canvas2D glyph matrix (cols x rows glyph + alpha arrays, sized to DPR) that
 *    mutates 4% of cells every 90ms; its colour is read from a CSS token through a 1x1 probe canvas
 *  - walk away and the 3D Pipes screensaver takes over; any input stops it
 */

const IDLE_MS = 9000;
const TASKBAR = 30;
const EXPS = ['win95-boot', 'pixel-blast', 'pipes-screensaver', 'ascii-cursor-field'] as const;
const GLYPHS = '·:+=*<>/\\01░▒';

type Kind = 'terminal' | 'readme' | 'exp';
type Win = { id: string; kind: Kind; title: string; expId?: string; x: number; y: number; w: number; h: number; z: number; min: boolean; max: boolean };

/* ---------- pixel icons (16x16, drawn as crisp rects) ---------- */

type R = [number, number, number, number, string];
const ICONS: Record<string, R[]> = {
  'win95-boot': [
    [1, 2, 14, 10, '#c0c0c0'],
    [2, 3, 12, 8, '#000'],
    [3, 4, 5, 1, '#dfdfdf'],
    [3, 6, 7, 1, '#808080'],
    [3, 8, 3, 1, '#808080'],
    [5, 12, 6, 2, '#808080'],
    [3, 14, 10, 1, '#c0c0c0'],
  ],
  'pixel-blast': [
    [2, 2, 3, 3, '#dfdfdf'],
    [7, 3, 2, 2, '#00b3ff'],
    [11, 2, 3, 3, '#c0c0c0'],
    [4, 7, 3, 3, '#fff'],
    [9, 8, 3, 3, '#dfdfdf'],
    [2, 12, 2, 2, '#808080'],
    [7, 12, 3, 2, '#c0c0c0'],
    [12, 11, 2, 3, '#00b3ff'],
  ],
  'pipes-screensaver': [
    [2, 3, 8, 3, '#ff2e00'],
    [8, 3, 3, 11, '#ff2e00'],
    [1, 2, 3, 5, '#ffe600'],
    [7, 2, 5, 5, '#ffe600'],
    [8, 3, 3, 3, '#fff'],
    [2, 10, 4, 3, '#00b3ff'],
    [5, 9, 3, 5, '#00b3ff'],
  ],
  'ascii-cursor-field': [
    [1, 1, 14, 14, '#000'],
    [3, 3, 2, 2, '#808080'],
    [7, 3, 2, 2, '#c0c0c0'],
    [11, 3, 2, 2, '#808080'],
    [3, 7, 2, 2, '#c0c0c0'],
    [7, 7, 2, 2, '#fff'],
    [11, 7, 2, 2, '#c0c0c0'],
    [3, 11, 2, 2, '#808080'],
    [7, 11, 2, 2, '#c0c0c0'],
    [11, 11, 2, 2, '#808080'],
  ],
  terminal: [
    [1, 2, 14, 12, '#c0c0c0'],
    [2, 4, 12, 9, '#000'],
    [2, 2, 12, 2, '#000'],
    [3, 6, 1, 1, '#c0c0c0'],
    [4, 7, 1, 1, '#c0c0c0'],
    [3, 8, 1, 1, '#c0c0c0'],
    [6, 8, 4, 1, '#c0c0c0'],
  ],
  readme: [
    [3, 1, 9, 14, '#fff'],
    [12, 4, 1, 11, '#808080'],
    [3, 15, 10, 0.01, '#000'],
    [5, 4, 5, 1, '#000'],
    [5, 6, 5, 1, '#808080'],
    [5, 8, 5, 1, '#808080'],
    [5, 10, 4, 1, '#808080'],
  ],
};

function Icon({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden style={{ imageRendering: 'pixelated' }}>
      {(ICONS[name] ?? ICONS.readme).map(([x, y, w, h, c], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={c} />
      ))}
    </svg>
  );
}

const bevelOut = { boxShadow: 'var(--w-bevel-out)' };
const bevelIn = { boxShadow: 'var(--w-bevel-in)' };

function WinButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className="grid h-[14px] w-[16px] place-items-center bg-w-face text-[9px] leading-none text-black active:[box-shadow:var(--w-bevel-in)]"
      style={bevelOut}
    >
      {children}
    </button>
  );
}

/* ---------- terminal: Canvas2D glyph matrix ---------- */

function readToken(el: HTMLElement, name: string, fallback: string): [number, number, number] {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const g = probe.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = fallback;
  g.fillStyle = getComputedStyle(el).getPropertyValue(name).trim() || fallback;
  g.fillRect(0, 0, 1, 1);
  const d = g.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

function Terminal({ running, phase }: { running: boolean; phase?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const fit = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!box.w || !box.h) return;
    const canvas = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(box.w * dpr);
    canvas.height = Math.round(box.h * dpr);
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [r, gg, b] = readToken(wrapRef.current!, '--v-soft', '#b0b0b0');
    const cw = 10;
    const ch = 16;
    const top = 40;
    const cols = Math.floor((box.w - 8) / cw);
    const rows = Math.max(0, Math.floor((box.h - top - 4) / ch));
    let seed = 1 + Math.floor((phase ?? 0) * 1000);
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const glyph = new Uint8Array(cols * rows).map(() => Math.floor(rand() * GLYPHS.length));
    const alpha = new Float32Array(cols * rows).map(() => 0.15 + rand() * 0.75);

    const draw = () => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, box.w, box.h);
      g.font = "16px 'Web IBM VGA 8x16', monospace";
      g.textBaseline = 'top';
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillText('C:\\FDB> dir /tools /w', 4, 4);
      g.fillText('37 tool(s)   293 example(s)', 4, 20);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const fade = 1 - (y / Math.max(1, rows)) * 0.55;
          g.fillStyle = `rgba(${r},${gg},${b},${(alpha[i] * fade).toFixed(3)})`;
          g.fillText(GLYPHS[glyph[i]], 4 + x * cw, top + y * ch);
        }
      }
      // blinking block cursor on the prompt line
      if (Math.floor(performance.now() / 500) % 2 === 0 || !running) {
        g.fillStyle = `rgb(${r},${gg},${b})`;
        g.fillRect(4 + 22 * 8, 4, 8, 14);
      }
    };
    let id = 0;
    const start = () => {
      draw();
      if (!running) return;
      id = window.setInterval(() => {
        for (let i = 0; i < glyph.length; i++) {
          if (Math.random() < 0.04) {
            glyph[i] = Math.floor(Math.random() * GLYPHS.length);
            alpha[i] = 0.15 + Math.random() * 0.75;
          }
        }
        draw();
      }, 90);
    };
    let cancelled = false;
    document.fonts.load("16px 'Web IBM VGA 8x16'").then(
      () => !cancelled && start(),
      () => !cancelled && start(),
    );
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [box, running, phase]);

  return (
    <div ref={wrapRef} className="relative h-full w-full bg-black">
      <canvas ref={canvasRef} aria-label="terminal glyph matrix" className="absolute inset-0 h-full w-full" />
    </div>
  );
}

/* ---------- desktop ---------- */

export default function Win95Desktop({ active, reducedMotion, progress }: ExperienceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const winEls = useRef(new Map<string, HTMLDivElement>());
  const taskEls = useRef(new Map<string, HTMLButtonElement>());
  const zTop = useRef(10);
  const [wins, setWins] = useState<Win[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [saver, setSaver] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [clock, setClock] = useState('12:00');
  const saverGuard = useRef(0);

  const size = () => ({ W: rootRef.current?.clientWidth ?? 800, H: (rootRef.current?.clientHeight ?? 500) - TASKBAR });

  // Initial windows, laid out for the container.
  useLayoutEffect(() => {
    const { W, H } = size();
    const narrow = W < 560;
    const nx = W >= 340 ? 86 : 8; // clear of the icon column on phones
    const wide = W >= 980 && H >= 420;
    const tw = narrow ? W - nx - 8 : Math.min(wide ? 500 : 400, W - 16);
    const th = Math.min(wide ? 310 : 240, Math.round(H * (H < 380 ? 0.66 : narrow ? 0.4 : 0.52)));
    const rw = narrow ? W - nx - 8 : Math.min(260, W - 16);
    const list: Win[] = [
      { id: 'terminal', kind: 'terminal', title: 'MS-DOS Prompt', x: narrow ? nx : 104, y: narrow ? 44 : 40, w: tw, h: th, z: 2, min: false, max: false },
      {
        id: 'readme',
        kind: 'readme',
        title: 'Readme.txt',
        x: narrow ? nx : 104 + Math.round(tw * 0.35),
        y: narrow ? Math.min(H - 170, 44 + th + 12) : Math.min(H - 170, 40 + th + 16),
        w: rw,
        h: narrow ? 160 : 150,
        z: 3,
        min: H < 380, // short cards: the readme waits in the taskbar
        max: false,
      },
    ];
    // wide screens: the boot runs in its own window, so the hub is alive on arrival
    if (wide && getExperience('win95-boot')) {
      const ew = Math.min(580, W - 104 - tw - 48);
      list.push({
        id: 'exp',
        kind: 'exp',
        expId: 'win95-boot',
        title: 'Win95 Boot.exe',
        x: W - ew - 32,
        y: Math.min(96, Math.max(24, H - Math.round(ew * 0.625) - 64)),
        w: ew,
        h: Math.round(ew * 0.625) + 24,
        z: 4,
        min: false,
        max: false,
      });
    }
    setWins(list);
    setFocus(H < 380 ? 'terminal' : 'readme');
  }, []);

  // Keep windows on screen when the container resizes (card → full screen → phone).
  useEffect(() => {
    const root = rootRef.current!;
    const ro = new ResizeObserver(() => {
      const { W, H } = size();
      setWins((ws) => {
        let changed = false;
        const next = ws.map((w) => {
          const nw = Math.min(w.w, W - 16);
          const nh = Math.min(w.h, H - 16);
          const nx = Math.max(8, Math.min(w.x, W - nw - 8));
          const ny = Math.max(8, Math.min(w.y, H - nh - 8));
          if (nw === w.w && nh === w.h && nx === w.x && ny === w.y) return w;
          changed = true;
          return { ...w, w: nw, h: nh, x: nx, y: ny };
        });
        return changed ? next : ws;
      });
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // Clock.
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, []);

  const raise = useCallback((id: string) => {
    zTop.current += 1;
    const z = zTop.current;
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, z } : w)));
    setFocus(id);
  }, []);

  const openWin = useCallback(
    (kind: Kind, expId?: string) => {
      setStartOpen(false);
      const { W, H } = size();
      zTop.current += 1;
      const z = zTop.current;
      const id = kind === 'exp' ? 'exp' : kind;
      const title = kind === 'exp' ? (getExperience(expId!)?.title ?? expId!) + '.exe' : kind === 'terminal' ? 'MS-DOS Prompt' : 'Readme.txt';
      let created = false;
      setWins((ws) => {
        const found = ws.find((w) => w.id === id);
        if (found) return ws.map((w) => (w.id === id ? { ...w, expId, title, min: false, z } : w));
        created = true;
        const w = kind === 'exp' ? Math.min(460, W - 16) : kind === 'terminal' ? Math.min(400, W - 16) : Math.min(260, W - 16);
        const h = kind === 'exp' ? Math.min(Math.round(w * 0.625) + 22, H - 16) : kind === 'terminal' ? Math.min(240, H - 16) : 150;
        const x = Math.max(8, Math.min(W - w - 8, Math.round((W - w) / 2) + 24));
        const y = Math.max(8, Math.min(H - h - 8, Math.round((H - h) / 2) - 10));
        return [...ws, { id, kind, title, expId, x, y, w, h, z, min: false, max: false }];
      });
      setFocus(id);
      // stepped pop-in once mounted
      requestAnimationFrame(() => {
        const el = winEls.current.get(id);
        if (el && !reducedMotion)
          gsap.fromTo(
            el,
            { scale: created ? 0.55 : 0.9, opacity: 0.3 },
            { scale: 1, opacity: 1, duration: 0.22, ease: 'steps(4)', clearProps: 'transform,opacity' },
          );
      });
    },
    [reducedMotion],
  );

  const closeWin = (id: string) => setWins((ws) => ws.filter((w) => w.id !== id));

  const toggleMax = (id: string) => {
    const el = winEls.current.get(id);
    if (!el) return;
    const state = Flip.getState(el);
    flushSync(() => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, max: !w.max } : w))));
    if (!reducedMotion) Flip.from(state, { duration: 0.3, ease: 'steps(6)' });
    raise(id);
  };

  const minimise = (id: string) => {
    const el = winEls.current.get(id);
    const btn = taskEls.current.get(id);
    const done = () => {
      setWins((ws) => ws.map((w) => (w.id === id ? { ...w, min: true } : w)));
      setFocus(null);
      if (el) gsap.set(el, { clearProps: 'transform' });
    };
    if (!el || !btn || reducedMotion) return done();
    Flip.fit(el, btn, { scale: true, duration: 0.28, ease: 'steps(6)', onComplete: done });
  };

  const restore = (id: string) => {
    const w = wins.find((x) => x.id === id);
    if (!w) return;
    if (!w.min) {
      if (focus === id) return minimise(id);
      return raise(id);
    }
    flushSync(() => setWins((ws) => ws.map((x) => (x.id === id ? { ...x, min: false } : x))));
    raise(id);
    const el = winEls.current.get(id);
    const btn = taskEls.current.get(id);
    if (!el || !btn || reducedMotion) return;
    Flip.fit(el, btn, { scale: true });
    gsap.to(el, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 0.28, ease: 'steps(6)', clearProps: 'transform' });
  };

  // Drag by title bar (direct DOM during the drag, committed to state on release).
  const startDrag = (e: React.PointerEvent, id: string) => {
    const w = wins.find((x) => x.id === id);
    const el = winEls.current.get(id);
    if (!w || !el || w.max) return;
    raise(id);
    const { W, H } = size();
    const sx = e.clientX;
    const sy = e.clientY;
    let nx = w.x;
    let ny = w.y;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      nx = Math.round(Math.max(-w.w + 60, Math.min(W - 40, w.x + ev.clientX - sx)));
      ny = Math.round(Math.max(0, Math.min(H - 20, w.y + ev.clientY - sy)));
      el.style.left = `${nx}px`;
      el.style.top = `${ny}px`;
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      setWins((ws) => ws.map((x) => (x.id === id ? { ...x, x: nx, y: ny } : x)));
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  // Idle → screensaver; any input stops it.
  const saverAllowed = active && !reducedMotion && progress === undefined;
  useEffect(() => {
    if (!saverAllowed) {
      setSaver(false);
      return;
    }
    const root = rootRef.current!;
    let timer = window.setTimeout(() => setSaver(true), IDLE_MS);
    const input = () => {
      if (performance.now() < saverGuard.current) return;
      setSaver(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSaver(true), IDLE_MS);
    };
    const evs = ['pointermove', 'pointerdown', 'wheel', 'touchstart'] as const;
    evs.forEach((ev) => root.addEventListener(ev, input, { passive: true }));
    window.addEventListener('keydown', input);
    return () => {
      window.clearTimeout(timer);
      evs.forEach((ev) => root.removeEventListener(ev, input));
      window.removeEventListener('keydown', input);
    };
  }, [saverAllowed]);

  const launchSaver = () => {
    setStartOpen(false);
    if (!saverAllowed) return;
    saverGuard.current = performance.now() + 700;
    setSaver(true);
  };

  const pipes = getExperience('pipes-screensaver');
  // the glyph matrix is ambient: it idles whenever the desktop is on screen, even when a parent drives progress
  const terminalRunning = active && !reducedMotion && !saver;

  const icons: { id: string; label: string; open: () => void }[] = [
    ...EXPS.map((id) => ({ id, label: getExperience(id)?.title ?? id, open: () => openWin('exp', id) })),
    { id: 'terminal', label: 'MS-DOS Prompt', open: () => openWin('terminal') },
    { id: 'readme', label: 'Readme.txt', open: () => openWin('readme') },
  ];

  return (
    <div
      ref={rootRef}
      className="font-w95 relative h-full w-full overflow-hidden bg-w-desk text-[11px] text-black select-none"
      style={{ WebkitFontSmoothing: 'none' }}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest('[data-start]')) setStartOpen(false);
        if (!(e.target as HTMLElement).closest('[data-icon]')) setSelected(null);
      }}
    >
      {/* desktop icons */}
      <div className="absolute top-2 left-2 grid grid-flow-col grid-rows-[repeat(auto-fill,72px)] gap-x-1" style={{ height: `calc(100% - ${TASKBAR + 12}px)` }}>
        {icons.map((ic) => (
          <button
            key={ic.id}
            type="button"
            data-icon
            onClick={(e) => {
              setSelected(ic.id);
              // touch has no double-click: a tap opens
              if ((e.nativeEvent as PointerEvent).pointerType === 'touch') ic.open();
            }}
            onDoubleClick={ic.open}
            onKeyDown={(e) => e.key === 'Enter' && ic.open()}
            className="flex h-[70px] w-[76px] flex-col items-center gap-1 pt-1 text-center text-white outline-none"
          >
            <span style={selected === ic.id ? { filter: 'brightness(0.6)' } : undefined}>
              <Icon name={ic.id} />
            </span>
            <span className={`px-[2px] leading-[13px] ${selected === ic.id ? 'bg-black outline-1 outline-dotted outline-white' : ''}`}>{ic.label}</span>
          </button>
        ))}
      </div>

      {/* windows */}
      {wins.map((w) => {
        const isFocus = focus === w.id;
        const exp = w.expId ? getExperience(w.expId) : undefined;
        return (
          <div
            key={w.id}
            ref={(el) => {
              if (el) winEls.current.set(w.id, el);
              else winEls.current.delete(w.id);
            }}
            role="dialog"
            aria-label={w.title}
            onPointerDown={() => focus !== w.id && raise(w.id)}
            className="absolute flex flex-col bg-w-face p-[3px]"
            style={{
              ...bevelOut,
              zIndex: w.z,
              display: w.min ? 'none' : 'flex',
              ...(w.max ? { left: 0, top: 0, width: '100%', height: `calc(100% - ${TASKBAR}px)` } : { left: w.x, top: w.y, width: w.w, height: w.h }),
            }}
          >
            <div
              onPointerDown={(e) => startDrag(e, w.id)}
              onDoubleClick={() => toggleMax(w.id)}
              className="flex h-[18px] shrink-0 cursor-default items-center gap-1 px-[2px] font-bold text-white"
              style={{ background: isFocus ? 'linear-gradient(90deg, #000 0%, #1a1a1a 30%, #6e6e6e 100%)' : 'linear-gradient(90deg, #808080 0%, #b4b4b4 100%)', touchAction: 'none' }}
            >
              <Icon name={w.kind === 'exp' ? (w.expId ?? 'readme') : w.id} size={14} />
              <span className="min-w-0 flex-1 truncate">{w.title}</span>
              <WinButton label="Minimise" onClick={() => minimise(w.id)}>
                <span className="mt-[5px] block h-[2px] w-[6px] bg-black" />
              </WinButton>
              <WinButton label={w.max ? 'Restore' : 'Maximise'} onClick={() => toggleMax(w.id)}>
                <span className="block h-[7px] w-[8px] border border-t-2 border-black" />
              </WinButton>
              <span className="w-[2px]" />
              <WinButton label="Close" onClick={() => closeWin(w.id)}>
                <span className="font-bold">x</span>
              </WinButton>
            </div>
            <div className="relative mt-[2px] min-h-0 flex-1 overflow-hidden" style={w.kind === 'readme' ? bevelIn : undefined}>
              {w.kind === 'terminal' && <Terminal running={terminalRunning && !w.min} phase={reducedMotion ? progress : undefined} />}
              {w.kind === 'readme' && (
                <div className="h-full overflow-auto bg-white p-2 leading-[14px]">
                  <p className="font-bold">FDB/95 hub</p>
                  <p className="mt-1">Double-click an icon to open an experience. Drag windows by the title bar. Minimise sends a window to the taskbar.</p>
                  <p className="mt-1">Walk away for 9 seconds and the pipes come out. Any input stops them.</p>
                </div>
              )}
              {w.kind === 'exp' &&
                (exp && !saver ? (
                  <ExperienceFrame experience={exp} eager className="bg-black" />
                ) : (
                  <div className="grid h-full place-items-center bg-black">
                    <span className="pixel text-[16px] leading-[16px] text-[#808080]">{exp ? '[ paused ]' : `[ ${w.expId} not found ]`}</span>
                  </div>
                ))}
            </div>
          </div>
        );
      })}

      {/* start menu */}
      {startOpen && (
        <div data-start className="absolute left-[2px] z-[900] flex bg-w-face p-[3px]" style={{ ...bevelOut, bottom: TASKBAR - 2 }}>
          <div className="flex w-[22px] items-end justify-center bg-black pb-2">
            <span className="font-bold text-[#c0c0c0] [writing-mode:vertical-rl] rotate-180">
              FDB<span className="text-white">95</span>
            </span>
          </div>
          <ul className="flex w-[196px] flex-col py-[2px]">
            {icons.map((ic) => (
              <li key={ic.id}>
                <button type="button" onClick={ic.open} className="flex h-[28px] w-full items-center gap-2 px-2 text-left hover:bg-black hover:text-white">
                  <Icon name={ic.id} size={20} />
                  {ic.label}
                </button>
              </li>
            ))}
            <li className="mx-1 my-[3px] h-[2px]" style={{ boxShadow: 'inset 0 1px #808080, inset 0 -1px #fff' }} />
            <li>
              <button type="button" onClick={launchSaver} className="flex h-[28px] w-full items-center gap-2 px-2 text-left hover:bg-black hover:text-white">
                <Icon name="pipes-screensaver" size={20} />
                Screensaver now
              </button>
            </li>
          </ul>
        </div>
      )}

      {/* taskbar */}
      <div
        className="absolute inset-x-0 bottom-0 z-[800] flex items-center gap-[3px] bg-w-face px-[2px]"
        style={{ height: TASKBAR, boxShadow: 'inset 0 1px #dfdfdf, inset 0 2px #fff' }}
      >
        <button
          type="button"
          data-start
          aria-expanded={startOpen}
          onClick={() => setStartOpen((o) => !o)}
          className="flex h-[22px] shrink-0 items-center gap-1 bg-w-face px-[5px] font-bold"
          style={startOpen ? bevelIn : bevelOut}
        >
          <Icon name="pixel-blast" size={16} />
          Start
        </button>
        <div className="flex min-w-0 flex-1 gap-[3px] overflow-hidden">
          {wins.map((w) => (
            <button
              key={w.id}
              type="button"
              ref={(el) => {
                if (el) taskEls.current.set(w.id, el);
                else taskEls.current.delete(w.id);
              }}
              onClick={() => restore(w.id)}
              className={`flex h-[22px] max-w-[150px] min-w-0 flex-1 items-center gap-1 bg-w-face px-[4px] text-left ${focus === w.id && !w.min ? 'font-bold' : ''}`}
              style={focus === w.id && !w.min ? { ...bevelIn, background: 'repeating-conic-gradient(#c0c0c0 0 25%, #fff 0 50%) 0 0 / 2px 2px' } : bevelOut}
            >
              <Icon name={w.kind === 'exp' ? (w.expId ?? 'readme') : w.id} size={14} />
              <span className="truncate">{w.title}</span>
            </button>
          ))}
        </div>
        <span className="flex h-[22px] shrink-0 items-center px-2" style={bevelIn}>
          {clock}
        </span>
      </div>

      {/* screensaver */}
      {saver && pipes && (
        <div className="absolute inset-0 z-[1000] bg-black">
          <ExperienceFrame experience={pipes} eager />
        </div>
      )}
    </div>
  );
}
