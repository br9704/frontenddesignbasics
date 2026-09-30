'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { InkField } from './ink-field';
import { Preview } from './demos';

/* 3D without a library: CSS perspective + pointer tilt. Often all a "3D" brief needs. */
export function TiltCard() {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ x: 0, y: 0 });
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    setT({ x: ((e.clientY - b.top) / b.height - 0.5) * -14, y: ((e.clientX - b.left) / b.width - 0.5) * 18 });
  };
  return (
    <Preview caption="Move your pointer over the card. CSS perspective and two rotations, no WebGL. Start here before reaching for three.js.">
      <div className="flex justify-center py-4" style={{ perspective: 900 }}>
        <div
          ref={ref}
          onPointerMove={onMove}
          onPointerLeave={() => setT({ x: 0, y: 0 })}
          className="relative aspect-[1.6] w-full max-w-sm border border-[var(--v-steel)] bg-[var(--v-bg)] p-6 text-[var(--v-ink)] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
          style={{ transform: `rotateX(${t.x}deg) rotateY(${t.y}deg)`, transformStyle: 'preserve-3d' }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: `radial-gradient(circle at ${50 + t.y * 3}% ${50 - t.x * 3}%, rgba(245,245,245,0.22), transparent 55%)` }}
          />
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]" style={{ transform: 'translateZ(30px)' }}>
            [member] 2026
          </p>
          <p className="mt-10 font-display text-3xl" style={{ transform: 'translateZ(60px)' }}>
            Depth without a scene
          </p>
        </div>
      </div>
    </Preview>
  );
}

/* Shader playground: the site's own InkField with its uniforms exposed. */
export function ShaderPlayground() {
  const [density, setDensity] = useState(0.06);
  const [inkA, setInkA] = useState('#ff00a8');
  const [inkB, setInkB] = useState('#00b3ff');
  const [clear, setClear] = useState(0);
  return (
    <Preview caption="An ogl ink shader with its uniforms on sliders. Deliberately in colour: two finale inks multiply where they overlap. Every change is a uniform update, not a recompile.">
      <div className="relative -m-6 mb-5 h-72 overflow-hidden border-b border-[var(--v-steel)] sm:-m-8 sm:mb-6">
        <InkField paper="#f5f5f5" density={density} inkA={inkA} inkB={inkB} clear={clear} />
      </div>
      <div className="grid gap-4 text-xs sm:grid-cols-2">
        <label className="flex items-center gap-3">
          <span className="w-16 text-[var(--text-soft)]">Density</span>
          <input type="range" min={-0.1} max={0.2} step={0.01} value={density} onChange={(e) => setDensity(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
        </label>
        <label className="flex items-center gap-3">
          <span className="w-16 text-[var(--text-soft)]">Clear zone</span>
          <input type="range" min={0} max={1} step={0.05} value={clear} onChange={(e) => setClear(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
        </label>
        <label className="flex items-center gap-3">
          <span className="w-16 text-[var(--text-soft)]">Ink A</span>
          <input type="color" value={inkA} onChange={(e) => setInkA(e.target.value)} className="h-7 w-10" />
        </label>
        <label className="flex items-center gap-3">
          <span className="w-16 text-[var(--text-soft)]">Ink B</span>
          <input type="color" value={inkB} onChange={(e) => setInkB(e.target.value)} className="h-7 w-10" />
        </label>
      </div>
    </Preview>
  );
}

/* Marquee: the most-copied landing-page component, built with one keyframe. */
export function MarqueeDemo() {
  const items = ['Linear', 'Stripe', 'Lusion', 'Igloo', 'Rauno', 'darkroom', 'Emil Kowalski', 'Bruno Simon'];
  return (
    <Preview caption="Two copies of the list, one translateX keyframe, a mask for soft edges. Hover pauses it; reduced motion stops it.">
      <div
        className="group flex overflow-hidden"
        style={{ maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)' }}
      >
        {[0, 1].map((k) => (
          <ul
            key={k}
            aria-hidden={k === 1}
            className="flex shrink-0 items-center gap-10 pr-10 motion-safe:animate-[fdb-marquee_28s_linear_infinite] group-hover:[animation-play-state:paused]"
          >
            {items.map((i) => (
              <li key={i} className="font-display text-3xl whitespace-nowrap">
                {i}
              </li>
            ))}
          </ul>
        ))}
      </div>
      <style>{`@keyframes fdb-marquee { to { transform: translateX(-100%); } }`}</style>
    </Preview>
  );
}

/* Bento grid: asymmetric cells from one grid definition. */
export function BentoDemo() {
  const cells = [
    { c: 'sm:col-span-2 sm:row-span-2', t: 'The one big idea', d: 'Largest cell, strongest image or number.', big: true },
    { c: '', t: 'Proof', d: 'A metric or a logo.' },
    { c: '', t: 'Detail', d: 'A feature worth a close-up.' },
    { c: 'sm:col-span-2', t: 'Supporting story', d: 'Wide cells read as sentences.' },
    { c: '', t: 'Call to action', d: 'Small, bright, obvious.', accent: true },
  ];
  return (
    <Preview caption="One grid, five cells, three sizes. Asymmetry creates hierarchy; the gap stays constant so it still reads as one object.">
      <div className="grid auto-rows-[7.5rem] gap-3 sm:grid-cols-4">
        {cells.map((x) => (
          <div
            key={x.t}
            className={`flex flex-col justify-end border p-4 ${x.c} ${
              x.big
                ? 'border-[var(--v-soft)] bg-[var(--v-steel)] text-[var(--v-ink)]'
                : x.accent
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]'
                  : 'border-[var(--v-steel)] bg-[var(--v-bg)] text-[var(--v-ink)]'
            }`}
          >
            <p className={`font-display ${x.big ? 'text-3xl sm:text-4xl' : 'text-xl'}`}>{x.t}</p>
            <p className="text-xs opacity-80">{x.d}</p>
          </div>
        ))}
      </div>
    </Preview>
  );
}
