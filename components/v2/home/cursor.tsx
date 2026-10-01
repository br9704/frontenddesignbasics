'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from './motion';
import { useReducedMotion } from './runtime';
import { useActiveStage } from './transitions';

/*
 * The cursor as a character. A layer that rides along with the native cursor (which is never hidden,
 * so text, inputs and links keep their usual pointer). Its look follows the act on screen:
 *   win95  -> a pixel block that moves on a 4px grid, with two stepped ghosts behind it
 *   mono   -> a crosshair whose corner brackets snap (gsap.quickTo) round links, buttons and
 *             clickable 3D (anything that sets cursor: pointer)
 *   colour -> a fluid brush: a springy head that leaves a fading, hue-shifting ribbon
 * Desktop fine pointers only; nothing mounts on touch. Reduced motion: a plain dot, no trail, no snap.
 */

const HIT = 'a[href],button,[role="button"],[role="link"],[role="tab"],summary,select,label[for],[data-cursor-target]';
const pos = { x: -200, y: -200, in: false, down: false, target: null as Element | null };

function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return fine;
}

export function StageCursor() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const stage = useActiveStage();
  const root = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const block = useRef<HTMLDivElement>(null);
  const ghosts = useRef<(HTMLDivElement | null)[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const cross = useRef<HTMLDivElement>(null);
  const brush = useRef<HTMLCanvasElement>(null);
  const on = fine;

  // pointer tracking, shared by every mode
  useEffect(() => {
    const el = root.current;
    if (!on || !el) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') {
        pos.in = false;
        el.style.opacity = '0';
        return;
      }
      pos.x = e.clientX;
      pos.y = e.clientY;
      pos.target = e.target as Element;
      if (!pos.in) {
        pos.in = true;
        el.style.opacity = '1';
      }
    };
    const out = (e: MouseEvent) => {
      if (e.relatedTarget) return;
      pos.in = false;
      el.style.opacity = '0';
    };
    const down = () => (pos.down = true);
    const up = () => (pos.down = false);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', down, { passive: true });
    window.addEventListener('pointerup', up, { passive: true });
    document.addEventListener('mouseout', out);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      document.removeEventListener('mouseout', out);
    };
  }, [on]);

  // reduced motion: a dot that sits exactly on the pointer
  useEffect(() => {
    const d = dot.current;
    if (!on || !reduced || !d) return;
    const tick = () => {
      d.style.transform = `translate3d(${pos.x - 4}px, ${pos.y - 4}px, 0)`;
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [on, reduced]);

  // win95: pixel block on a 4px grid, ghosts step behind it every 50ms
  useEffect(() => {
    const b = block.current;
    if (!on || reduced || stage !== 'win95' || !b) return;
    const G = 4;
    let x = pos.x;
    let y = pos.y;
    const trail: [number, number][] = [];
    let lastStep = 0;
    const tick = () => {
      x += (pos.x + 10 - x) * 0.35;
      y += (pos.y + 14 - y) * 0.35;
      const sx = Math.round(x / G) * G;
      const sy = Math.round(y / G) * G;
      b.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
      b.dataset.down = pos.down ? '1' : '0';
      const now = performance.now();
      if (now - lastStep > 50) {
        lastStep = now;
        trail.unshift([sx, sy]);
        trail.length = Math.min(trail.length, 6);
        ghosts.current.forEach((g, i) => {
          const p = trail[(i + 1) * 2 + 1] ?? trail[trail.length - 1];
          if (g && p) g.style.transform = `translate3d(${p[0]}px, ${p[1]}px, 0)`;
        });
      }
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [on, reduced, stage]);

  // mono: crosshair on the pointer, brackets snap round whatever is clickable under it
  useEffect(() => {
    const bx = box.current;
    const cx = cross.current;
    if (!on || reduced || stage !== 'mono' || !bx || !cx) return;
    const dur = { duration: 0.28, ease: 'power3.out' };
    const qx = gsap.quickTo(bx, 'x', dur);
    const qy = gsap.quickTo(bx, 'y', dur);
    const qw = gsap.quickTo(bx, 'width', dur);
    const qh = gsap.quickTo(bx, 'height', dur);
    gsap.set(bx, { x: pos.x - 14, y: pos.y - 14, width: 28, height: 28 });
    let lastTarget: Element | null = null;
    let hit: Element | null = null;
    let pointer = false;
    const tick = () => {
      cx.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      if (pos.target !== lastTarget) {
        lastTarget = pos.target;
        hit = lastTarget?.closest?.(HIT) ?? null;
        // clickable 3D and other custom targets: R3F handlers set cursor: pointer on hover
        pointer = !hit && !!lastTarget && lastTarget instanceof HTMLElement && getComputedStyle(lastTarget).cursor === 'pointer';
      }
      const threeHover = document.body.style.cursor === 'pointer';
      if (hit && hit.isConnected) {
        const r = hit.getBoundingClientRect();
        const pad = 6;
        qx(r.left - pad);
        qy(r.top - pad);
        qw(r.width + pad * 2);
        qh(r.height + pad * 2);
        bx.dataset.lock = '1';
      } else if (pointer || threeHover) {
        qx(pos.x - 22);
        qy(pos.y - 22);
        qw(44);
        qh(44);
        bx.dataset.lock = '1';
      } else {
        qx(pos.x - 14);
        qy(pos.y - 14);
        qw(28);
        qh(28);
        bx.dataset.lock = '0';
      }
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      gsap.killTweensOf(bx);
    };
  }, [on, reduced, stage]);

  // colour: a springy brush head leaving a fading ribbon (canvas 2D)
  useEffect(() => {
    const c = brush.current;
    if (!on || reduced || stage !== 'colour' || !c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const size = () => {
      c.width = Math.round(window.innerWidth * dpr);
      c.height = Math.round(window.innerHeight * dpr);
    };
    size();
    window.addEventListener('resize', size);
    const head = { x: pos.x, y: pos.y };
    const qx = gsap.quickTo(head, 'x', { duration: 0.45, ease: 'elastic.out(1, 0.6)' });
    const qy = gsap.quickTo(head, 'y', { duration: 0.45, ease: 'elastic.out(1, 0.6)' });
    const pts: { x: number; y: number; t: number; w: number }[] = [];
    const LIFE = 650;
    let hue = 320;
    let dirty = true;
    const tick = () => {
      qx(pos.x);
      qy(pos.y);
      const now = performance.now();
      const last = pts[pts.length - 1];
      const moved = !last || Math.hypot(head.x - last.x, head.y - last.y) > 1.5;
      if (pos.in && moved) {
        const sp = last ? Math.min(1, Math.hypot(head.x - last.x, head.y - last.y) / 40) : 0;
        pts.push({ x: head.x, y: head.y, t: now, w: 8 + 22 * sp });
        hue = (hue + 2.5) % 360;
      }
      while (pts.length && now - pts[0].t > LIFE) pts.shift();
      if (!pts.length && !dirty) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      dirty = pts.length > 0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const k = 1 - (now - b.t) / LIFE;
        if (k <= 0) continue;
        ctx.strokeStyle = `hsla(${(hue - (pts.length - i) * 2.5 + 360) % 360}, 100%, 58%, ${0.85 * k})`;
        ctx.lineWidth = b.w * k;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      if (pos.in) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(head.x, head.y, pos.down ? 7 : 4, 0, Math.PI * 2);
        ctx.fill();
        dirty = true;
      }
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener('resize', size);
      gsap.killTweensOf(head);
      ctx.clearRect(0, 0, c.width, c.height);
    };
  }, [on, reduced, stage]);

  if (!on) return null;
  const show = (s: string) => (!reduced && stage === s ? '' : 'hidden');
  return (
    <div ref={root} aria-hidden data-stage-cursor className="pointer-events-none fixed inset-0 z-[80] overflow-hidden opacity-0 transition-opacity duration-200">
      {reduced && <div ref={dot} className="absolute top-0 left-0 h-2 w-2 rounded-full bg-white mix-blend-difference" />}

      <div className={show('win95')}>
        {[0, 1].map((i) => (
          <div
            key={i}
            ref={(n) => {
              ghosts.current[i] = n;
            }}
            className="absolute top-0 left-0 h-3 w-3 bg-white mix-blend-difference"
            style={{ opacity: 0.45 - i * 0.2 }}
          />
        ))}
        <div
          ref={block}
          className="absolute top-0 left-0 h-3 w-3 border-2 border-black bg-white data-[down=1]:bg-black data-[down=1]:border-white"
        />
      </div>

      <div className={show('mono')}>
        <div ref={box} className="group absolute top-0 left-0 mix-blend-difference">
          <span className="absolute top-0 left-0 h-2 w-2 border-t-2 border-l-2 border-white" />
          <span className="absolute top-0 right-0 h-2 w-2 border-t-2 border-r-2 border-white" />
          <span className="absolute bottom-0 left-0 h-2 w-2 border-b-2 border-l-2 border-white" />
          <span className="absolute right-0 bottom-0 h-2 w-2 border-r-2 border-b-2 border-white" />
        </div>
        <div ref={cross} className="absolute top-0 left-0 mix-blend-difference">
          <span className="absolute -top-px -left-[7px] h-[2px] w-[14px] bg-white" />
          <span className="absolute -top-[7px] -left-px h-[14px] w-[2px] bg-white" />
        </div>
      </div>

      <canvas ref={brush} className={`absolute inset-0 h-full w-full ${show('colour')}`} />
    </div>
  );
}
