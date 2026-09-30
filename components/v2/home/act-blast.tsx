'use client';

import { useEffect, useRef, useState } from 'react';
import { BuiltWith } from '@/components/v2/experience-frame';
import { P, pinSection, pinStage } from './acts';
import { useOnScreen, useReducedMotion, span } from './runtime';

/*
 * Act 01, PIXEL BLAST. The desktop from act 00, redrawn into an offscreen canvas, bursts out of the
 * CRT dot as 16px tiles in Bayer-plus-distance order. Fully scrubbed, so scrolling up rebuilds it.
 * At the end, tiles fly back and settle on the edges of a wireframe cube, drawn with the same
 * camera as act 02's cube, so the handoff has no cut. Canvas 2D: no WebGL context spent.
 */

const TILE = 16;
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51,
  19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

/** Same numbers as the cube scene: camera z 6, fov 35, cube 1.7, rotation x 0.52 y 0.72. */
export const CUBE_VIEW = { camZ: 6, fov: 35, size: 1.7, rx: 0.52, ry: 0.72 };

function projectCube(w: number, h: number) {
  const s = CUBE_VIEW.size / 2;
  const verts: [number, number, number][] = [];
  for (const x of [-s, s]) for (const y of [-s, s]) for (const z of [-s, s]) verts.push([x, y, z]);
  const { rx, ry } = CUBE_VIEW;
  const f = 1 / Math.tan(((CUBE_VIEW.fov / 2) * Math.PI) / 180);
  const pts = verts.map(([x, y, z]) => {
    // rotate Y then X (three's default XYZ order applies X first; this matches Euler(rx, ry, 0) on points)
    const x1 = x * Math.cos(ry) + z * Math.sin(ry);
    const z1 = -x * Math.sin(ry) + z * Math.cos(ry);
    const y2 = y * Math.cos(rx) - z1 * Math.sin(rx);
    const z2 = y * Math.sin(rx) + z1 * Math.cos(rx);
    const depth = CUBE_VIEW.camZ - z2;
    return [w / 2 + ((x1 * f) / depth) * (h / 2), h / 2 - ((y2 * f) / depth) * (h / 2)] as [number, number];
  });
  const depth = verts.map(([x, y, z]) => {
    const z1 = -x * Math.sin(ry) + z * Math.cos(ry);
    return y * Math.sin(rx) + z1 * Math.cos(rx);
  });
  const edges: [number, number][] = [];
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    const d = [0, 1, 2].filter((k) => verts[i][k] !== verts[j][k]).length;
    if (d === 1) edges.push([i, j]);
  }
  // faces as vertex indices (index = xi*4 + yi*2 + zi) with a flat grey per axis, like the lit voxels
  const faces = [
    { v: [0, 1, 3, 2], c: '#b4b4b4' },
    { v: [4, 5, 7, 6], c: '#b4b4b4' },
    { v: [0, 1, 5, 4], c: '#3c3c3c' },
    { v: [2, 3, 7, 6], c: '#dcdcdc' },
    { v: [0, 2, 6, 4], c: '#9a9a9a' },
    { v: [1, 3, 7, 5], c: '#9a9a9a' },
  ]
    .map((f) => ({ ...f, d: f.v.reduce((a, i) => a + depth[i], 0) / 4 }))
    .sort((a, b) => a.d - b.d);
  return { pts, edges, faces };
}

function drawDesktop(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(0, 0, w, h);
  const bevel = (x: number, y: number, bw: number, bh: number) => {
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, bw, 1);
    ctx.fillRect(x, y, 1, bh);
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y + bh - 1, bw, 1);
    ctx.fillRect(x + bw - 1, y, 1, bh);
  };
  ctx.font = '11px "MS Sans Serif Pixel", sans-serif';
  ctx.textBaseline = 'top';
  // icons
  const labels = ['Tools', 'Make', 'Inspiration', 'Sites', 'How-to', 'Rules', 'Cases', 'Recycle Bin'];
  const rows = w < 640 ? 4 : 8;
  labels.forEach((l, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const x = 12 + col * 80 + 20;
    const y = 12 + row * 62;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, 32, 28);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(x + 2, y + 4, 28, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(l, x + 16 - ctx.measureText(l).width / 2, y + 34);
  });
  // Tools.exe
  if (w >= 640) {
    const x = w >= 1024 ? w * 0.3 : 180;
    const ww = w >= 1024 ? 460 : w - x - 12;
    const y = h * 0.12;
    bevel(x, y, ww, 250);
    ctx.fillStyle = '#808080';
    ctx.fillRect(x + 3, y + 3, ww - 6, 18);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillText('Tools.exe', x + 7, y + 6);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 5, y + 40, ww - 10, 186);
    ctx.fillStyle = '#000';
    for (let r = 0; r < 9; r++) ctx.fillRect(x + 10, y + 64 + r * 16, 90 + ((r * 37) % 60), 8);
  }
  // dialog
  const dw = Math.min(340, w - 32);
  const dx = w / 2 - dw / 2;
  const dy = h / 2 - 50;
  bevel(dx, dy, dw, 100);
  ctx.fillStyle = '#000';
  ctx.fillRect(dx + 3, dy + 3, dw - 6, 18);
  ctx.fillStyle = '#fff';
  ctx.fillText('Welcome', dx + 7, dy + 6);
  ctx.fillStyle = '#000';
  ctx.fillText('Welcome to Front End Design Basics.', dx + 56, dy + 34);
  ctx.fillText('Scroll to continue.', dx + 56, dy + 50);
  bevel(dx + dw / 2 - 37, dy + 70, 75, 23);
  ctx.fillStyle = '#000';
  ctx.fillText('OK', dx + dw / 2 - 6, dy + 76);
  // taskbar
  bevel(0, h - 30, w, 30);
  bevel(2, h - 26, 58, 22);
  ctx.fillStyle = '#000';
  ctx.fillText('Start', 24, h - 20);
}

export function ActBlast() {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const on = useOnScreen(stage, '200px');
  const [tiles, setTiles] = useState(3600);

  useEffect(() => {
    const cv = canvas.current;
    const st = stage.current;
    if (!cv || !st) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let src: HTMLCanvasElement | null = null;
    const tiny = document.createElement('canvas');
    let T: { hx: number; hy: number; th: number; spin: number; jx: number; jy: number }[] = [];
    let cube = projectCube(1, 1);
    let edgePts: { x: number; y: number; ox: number; oy: number; d: number }[] = [];

    const build = () => {
      w = st.clientWidth;
      h = st.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      src = document.createElement('canvas');
      src.width = w;
      src.height = h;
      const sctx = src.getContext('2d');
      if (sctx) drawDesktop(sctx, w, h);
      const cols = Math.ceil(w / TILE);
      const rows = Math.ceil(h / TILE);
      const maxD = Math.hypot(w / 2, h / 2);
      T = [];
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const hx = x * TILE;
          const hy = y * TILE;
          const d = Math.hypot(hx + TILE / 2 - w / 2, hy + TILE / 2 - h / 2) / maxD;
          const b = BAYER8[(y % 8) * 8 + (x % 8)] / 64;
          const r = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
          const rnd = r - Math.floor(r);
          T.push({ hx, hy, th: 0.45 * b + 0.55 * d, spin: (rnd - 0.5) * 6, jx: (rnd - 0.5) * 0.5, jy: (((rnd * 7.13) % 1) - 0.5) * 0.5 });
        }
      setTiles(T.length);
      cube = projectCube(w, h);
      edgePts = [];
      const per = 18;
      cube.edges.forEach(([a, b], ei) => {
        for (let k = 0; k <= per; k++) {
          const t = k / per;
          const x = cube.pts[a][0] + (cube.pts[b][0] - cube.pts[a][0]) * t;
          const y = cube.pts[a][1] + (cube.pts[b][1] - cube.pts[a][1]) * t;
          const ang = (ei * 0.61 + k * 2.39) % (Math.PI * 2);
          edgePts.push({ x, y, ox: w / 2 + Math.cos(ang) * w, oy: h / 2 + Math.sin(ang) * h, d: ((ei * 7 + k * 3) % 23) / 23 });
        }
      });
    };

    const draw = (p: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      // Until the blast has started, stay transparent so the boot's CRT power-off shows through
      // (the section overlaps the end of the boot act by one viewport).
      if (hud.current) hud.current.style.opacity = p > 0.002 ? '1' : '0';
      if (p <= 0.002) {
        ctx.clearRect(0, 0, w, h);
        return;
      }
      ctx.fillStyle = '#080808';
      ctx.fillRect(0, 0, w, h);
      if (!src) return;
      const q = span(p, 0, 0.72);
      const cx = w / 2;
      const cy = h / 2;
      // the CRT dot the blast comes out of
      if (q < 0.25) {
        const r = 3 + q * 40;
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 1 - q * 4;
        ctx.fillRect(cx - r, cy - 1.5, r * 2, 3);
        ctx.fillRect(cx - 3, cy - 3, 6, 6);
        ctx.globalAlpha = 1;
      }
      if (q > 0 && q < 1) {
        for (let i = 0; i < T.length; i++) {
          const t = T[i];
          const l = span(q * 1.7 - t.th * 0.85, 0, 0.55);
          if (l <= 0 || l >= 1) continue;
          const e = 1 - (1 - l) * (1 - l);
          const k = e * 2.6;
          const x = cx + (t.hx - cx) * k + t.jx * w * e;
          const y = cy + (t.hy - cy) * k + t.jy * h * e;
          const s = TILE * Math.min(1, l * 5) * (1 + e * 0.8);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t.spin * e);
          ctx.drawImage(src, t.hx, t.hy, TILE, TILE, -s / 2, -s / 2, s, s);
          ctx.restore();
        }
      }
      // converge: tiles fly in to the edges of the cube, chunky, then refine.
      const c = span(p, 0.42, 0.9);
      if (c > 0) {
        const px = [48, 32, 24, 16][Math.min(3, Math.floor(c * 4))];
        ctx.fillStyle = '#f5f5f5';
        for (const e of edgePts) {
          const l = span(c * 1.4 - e.d * 0.4, 0, 1);
          if (l <= 0) continue;
          const ee = 1 - Math.pow(1 - l, 3);
          const x = e.ox + (e.x - e.ox) * ee;
          const y = e.oy + (e.y - e.oy) * ee;
          const s = l < 1 ? 10 : Math.max(2, px / 8);
          ctx.fillRect(Math.round(x / 4) * 4 - s / 2, Math.round(y / 4) * 4 - s / 2, s, s);
        }
        // the cube at 48px, as act 02 opens: faces drawn tiny, scaled up without smoothing
        const fill = span(p, 0.86, 1);
        if (fill > 0 && tiny) {
          const tctx = tiny.getContext('2d');
          if (tctx) {
            const k = 1 / 48;
            tiny.width = Math.ceil(w * k);
            tiny.height = Math.ceil(h * k);
            tctx.fillStyle = '#080808';
            tctx.fillRect(0, 0, tiny.width, tiny.height);
            for (const f of cube.faces) {
              tctx.fillStyle = f.c;
              tctx.beginPath();
              f.v.forEach((vi, j) => (j ? tctx.lineTo : tctx.moveTo).call(tctx, cube.pts[vi][0] * k, cube.pts[vi][1] * k));
              tctx.closePath();
              tctx.fill();
            }
            ctx.globalAlpha = fill;
            ctx.drawImage(tiny, 0, 0, tiny.width / k, tiny.height / k);
            ctx.globalAlpha = 1;
          }
        }
        if (c >= 1) {
          ctx.strokeStyle = '#f5f5f5';
          ctx.lineWidth = 2;
          ctx.globalAlpha = span(p, 0.9, 1) * 0.5;
          ctx.beginPath();
          for (const [a, b] of cube.edges) {
            ctx.moveTo(cube.pts[a][0], cube.pts[a][1]);
            ctx.lineTo(cube.pts[b][0], cube.pts[b][1]);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    };

    build();
    let last = -1;
    let raf = 0;
    const loop = () => {
      const p = reduced ? 1 : P.blast.get();
      if (p !== last) {
        draw(p);
        last = p;
      }
      if (!reduced && on) raf = requestAnimationFrame(loop);
    };
    loop();
    const ro = new ResizeObserver(() => {
      build();
      last = -1;
      draw(reduced ? 1 : P.blast.get());
    });
    ro.observe(st);
    // fonts land after first paint; redraw the source when they do
    document.fonts?.ready.then(() => {
      build();
      last = -1;
    });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduced, on]);

  return (
    <section ref={section} id="blast" data-act="1" className={`${pinSection} -mt-[calc(100svh-3rem)] h-[220vh] motion-reduce:mt-0`}>
      <div ref={stage} className={`${pinStage}`}>
        <canvas ref={canvas} className="absolute inset-0 h-full w-full [image-rendering:pixelated]" aria-hidden />
        <div ref={hud} style={{ opacity: 0 }} className="pixel absolute bottom-14 left-4 lg:bottom-4 border border-[var(--v-steel)] bg-[var(--v-bg)] px-2 py-1 text-[16px] leading-[16px] lg:left-[136px]">
          <p>[01 BLAST] [TILES {tiles.toLocaleString('en-GB')}]</p>
          <BuiltWith tools={['canvas2d', 'gsap']} className="mt-1" />
        </div>
        <h2 className="sr-only">Pixel blast</h2>
      </div>
    </section>
  );
}
