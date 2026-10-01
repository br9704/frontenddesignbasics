'use client';

import { useEffect, useRef } from 'react';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner, resolveFamily } from './g3-kit';

/*
 * Infinite Zoom: a Win95 desktop, a photo of a desk on it, the monitor on that desk, a phone drawn
 * in Paint on that monitor, one pixel of that phone's screen, and inside the pixel the desktop again.
 *
 * Every layer is drawn as vectors in canvas2d on a 1200x900 (4:3) board, and every "portal" into
 * the next layer is also exactly 4:3, so one layer fits its portal with a single scale and offset.
 * Chaining the four portals gives one map from layer 4 back to layer 0: p0 = o + s·p4. The camera
 * zooms about that map's fixed point, so after zooming by 1/s the picture is identical to where it
 * started, and the loop has no seam. Layers are drawn fresh each frame (crisp at any depth) and
 * anything smaller than a couple of pixels, or fully covered by a deeper layer, is skipped.
 * No WebGL at all.
 */

const TOOLS = ['canvas2d'];
const W = 1200;
const H = 900;
const LOOP_SECONDS = 18;
const NAMES = ['desktop', 'monitor', 'phone', 'pixel'];
const BEVEL = 'inset -1px -1px #000, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf';

/** Portal of each layer into the next: [x, y, w, h], all 4:3. */
const PORTALS: [number, number, number, number][] = [
  [380, 280, 440, 330], // the picture inside the desk.bmp window
  [462, 206.5, 276, 207], // the monitor's screen
  [498, 363.5, 204, 153], // the photo on the phone
  [553, 414.75, 94, 70.5], // one pixel
];
const RATIO = PORTALS.map((p) => p[2] / W);
const LOOP = (() => {
  let ox = 0;
  let oy = 0;
  let s = 1;
  for (const p of PORTALS) {
    ox += s * p[0];
    oy += s * p[1];
    s *= p[2] / W;
  }
  return { s, fx: ox / (1 - s), fy: oy / (1 - s) };
})();

// Win95 tokens (DESIGN.md): grey desktop, black title bars
const DESK = '#2c2c2c';
const FACE = '#c0c0c0';
const HI = '#ffffff';
const LITE = '#dfdfdf';
const SHADOW = '#808080';
const DARK = '#000000';

type Ctx = CanvasRenderingContext2D;

/* ─────────── Win95 bits ─────────── */

function bevel(c: Ctx, x: number, y: number, w: number, h: number, inset = false, t = 2) {
  c.fillStyle = FACE;
  c.fillRect(x, y, w, h);
  const [a, b, a2, b2] = inset ? [SHADOW, HI, DARK, LITE] : [HI, DARK, LITE, SHADOW];
  c.fillStyle = a;
  c.fillRect(x, y, w, t);
  c.fillRect(x, y, t, h);
  c.fillStyle = b;
  c.fillRect(x, y + h - t, w, t);
  c.fillRect(x + w - t, y, t, h);
  c.fillStyle = a2;
  c.fillRect(x + t, y + t, w - 2 * t, t);
  c.fillRect(x + t, y + t, t, h - 2 * t);
  c.fillStyle = b2;
  c.fillRect(x + t, y + h - 2 * t, w - 2 * t, t);
  c.fillRect(x + w - 2 * t, y + t, t, h - 2 * t);
}

function text(c: Ctx, font: string, s: string, x: number, y: number, size: number, color: string, weight = '') {
  c.font = `${weight} ${size}px ${font}`.trim();
  c.fillStyle = color;
  c.textBaseline = 'middle';
  c.fillText(s, x, y);
}

function windowFrame(c: Ctx, font: string, x: number, y: number, w: number, h: number, title: string) {
  bevel(c, x, y, w, h, false, 3);
  c.fillStyle = DARK;
  c.fillRect(x + 6, y + 6, w - 12, 30);
  text(c, font, title, x + 14, y + 22, 18, HI);
  // minimise, maximise, close
  for (let i = 0; i < 3; i++) {
    const bx = x + w - 6 - 26 * (3 - i) - (i === 2 ? 0 : 4);
    bevel(c, bx, y + 10, 22, 20, false, 2);
    c.fillStyle = DARK;
    if (i === 0) c.fillRect(bx + 6, y + 23, 9, 3);
    if (i === 1) {
      c.strokeStyle = DARK;
      c.lineWidth = 2;
      c.strokeRect(bx + 6, y + 14, 10, 10);
      c.fillRect(bx + 6, y + 14, 10, 3);
    }
    if (i === 2) {
      c.strokeStyle = DARK;
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(bx + 6, y + 14);
      c.lineTo(bx + 16, y + 25);
      c.moveTo(bx + 16, y + 14);
      c.lineTo(bx + 6, y + 25);
      c.stroke();
    }
  }
}

/* ─────────── layer 0: the desktop ─────────── */

function drawDesktop(c: Ctx, font: string) {
  c.fillStyle = DESK;
  c.fillRect(0, 0, W, H);

  // icons
  const icons = ['My Computer', 'Recycle Bin', 'Documents', 'Paint'];
  icons.forEach((name, i) => {
    const x = 44;
    const y = 250 + i * 118;
    c.fillStyle = '#e8e8e8';
    if (i === 0) {
      c.fillRect(x + 8, y, 48, 38);
      c.fillStyle = '#3a3a3a';
      c.fillRect(x + 13, y + 5, 38, 27);
      c.fillStyle = '#e8e8e8';
      c.fillRect(x + 22, y + 40, 20, 6);
      c.fillRect(x + 4, y + 48, 56, 10);
    } else if (i === 1) {
      c.fillRect(x + 14, y + 6, 36, 6);
      c.fillRect(x + 18, y + 14, 28, 42);
      c.fillStyle = '#6a6a6a';
      for (let k = 0; k < 3; k++) c.fillRect(x + 23 + k * 8, y + 18, 3, 34);
    } else if (i === 2) {
      c.fillRect(x + 6, y + 10, 22, 8);
      c.fillRect(x + 6, y + 16, 52, 38);
      c.fillStyle = '#9a9a9a';
      c.fillRect(x + 6, y + 16, 52, 5);
    } else {
      c.fillRect(x + 10, y + 8, 44, 44);
      c.fillStyle = '#3a3a3a';
      c.fillRect(x + 16, y + 14, 32, 32);
      c.fillStyle = '#e8e8e8';
      c.save();
      c.translate(x + 40, y + 20);
      c.rotate(0.7);
      c.fillRect(-3, -4, 6, 34);
      c.restore();
    }
    c.textAlign = 'center';
    text(c, font, name, x + 32, y + 78, 17, HI);
    c.textAlign = 'left';
  });

  // a note window behind
  windowFrame(c, font, 858, 548, 316, 240, 'notes.txt');
  c.fillStyle = HI;
  c.fillRect(868, 592, 296, 186);
  ['keep zooming.', 'it goes all the way', 'down and back up.'].forEach((l, i) => text(c, font, l, 880, 616 + i * 28, 18, DARK));

  // the main window with the picture of a desk
  windowFrame(c, font, 364, 230, 472, 396, 'desk.bmp');
  bevel(c, 374, 274, 452, 342, true, 3);
  c.fillStyle = '#4a4a4a';
  c.fillRect(380, 280, 440, 330);

  // taskbar
  c.fillStyle = FACE;
  c.fillRect(0, 846, W, 54);
  c.fillStyle = HI;
  c.fillRect(0, 848, W, 3);
  bevel(c, 8, 856, 118, 36, false, 3);
  c.fillStyle = DARK;
  c.fillRect(20, 866, 16, 16);
  text(c, font, 'Start', 44, 875, 20, DARK, 'bold');
  bevel(c, 136, 856, 220, 36, true, 3);
  text(c, font, 'desk.bmp', 150, 875, 18, DARK);
  bevel(c, 1070, 856, 122, 36, true, 3);
  text(c, font, '12:00', 1104, 875, 18, DARK);
}

/* ─────────── layer 1: the desk ─────────── */

function drawDesk(c: Ctx) {
  const wall = c.createLinearGradient(0, 0, 0, 600);
  wall.addColorStop(0, '#565656');
  wall.addColorStop(1, '#3c3c3c');
  c.fillStyle = wall;
  c.fillRect(0, 0, W, 600);
  // a framed print on the wall
  c.fillStyle = '#1c1c1c';
  c.fillRect(90, 90, 200, 150);
  c.fillStyle = '#8c8c8c';
  c.fillRect(104, 104, 172, 122);
  c.fillStyle = '#5a5a5a';
  c.beginPath();
  c.moveTo(104, 226);
  c.lineTo(170, 150);
  c.lineTo(220, 196);
  c.lineTo(250, 170);
  c.lineTo(276, 226);
  c.fill();
  // lamp light on the wall
  const glow = c.createRadialGradient(1010, 250, 10, 1010, 250, 330);
  glow.addColorStop(0, 'rgba(255,255,255,0.22)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = glow;
  c.fillRect(600, 0, 600, 600);

  // desk top
  c.fillStyle = '#262626';
  c.fillRect(0, 600, W, 300);
  c.fillStyle = '#6e6e6e';
  c.fillRect(0, 600, W, 6);
  c.fillStyle = '#1a1a1a';
  c.fillRect(0, 606, W, 10);

  // monitor: base, neck, body, bezel, screen
  c.fillStyle = '#a8a8a8';
  c.beginPath();
  c.ellipse(600, 598, 120, 18, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#b8b8b8';
  c.fillRect(560, 500, 80, 90);
  c.fillStyle = '#d2d2d2';
  c.beginPath();
  c.roundRect(400, 140, 400, 370, 18);
  c.fill();
  c.fillStyle = '#e6e6e6';
  c.fillRect(410, 146, 380, 6);
  c.fillStyle = '#9c9c9c';
  c.fillRect(410, 494, 380, 8);
  c.fillStyle = '#7a7a7a';
  c.beginPath();
  c.roundRect(444, 188, 312, 238, 10);
  c.fill();
  c.fillStyle = '#101010';
  c.fillRect(462, 206.5, 276, 207);
  // power light and dials
  c.fillStyle = '#f5f5f5';
  c.fillRect(740, 460, 14, 8);
  c.fillStyle = '#9a9a9a';
  for (let i = 0; i < 3; i++) c.fillRect(456 + i * 26, 458, 18, 14);

  // keyboard
  c.fillStyle = '#c8c8c8';
  c.beginPath();
  c.moveTo(390, 650);
  c.lineTo(810, 650);
  c.lineTo(840, 750);
  c.lineTo(360, 750);
  c.closePath();
  c.fill();
  c.fillStyle = '#9e9e9e';
  for (let r = 0; r < 4; r++) {
    const y = 660 + r * 22;
    const inset = 30 - r * 7.5;
    const x0 = 390 - (r * 30) / 4 + inset * 0.2;
    const w = 420 + (r * 60) / 4;
    const n = 14;
    for (let k = 0; k < n; k++) c.fillRect(x0 + (k * w) / n + 3, y, w / n - 6, 16);
  }
  // mouse
  c.fillStyle = '#c8c8c8';
  c.beginPath();
  c.ellipse(900, 710, 28, 40, -0.15, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#8a8a8a';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(900, 690);
  c.bezierCurveTo(910, 640, 860, 640, 840, 700);
  c.stroke();

  // mug
  c.fillStyle = '#e0e0e0';
  c.fillRect(1010, 540, 90, 100);
  c.beginPath();
  c.ellipse(1055, 640, 45, 10, 0, 0, Math.PI);
  c.fill();
  c.strokeStyle = '#e0e0e0';
  c.lineWidth = 12;
  c.beginPath();
  c.arc(1104, 590, 24, -1.2, 1.2);
  c.stroke();
  c.fillStyle = '#1a1a1a';
  c.beginPath();
  c.ellipse(1055, 540, 45, 10, 0, 0, Math.PI * 2);
  c.fill();

  // lamp
  c.strokeStyle = '#1a1a1a';
  c.lineWidth = 12;
  c.beginPath();
  c.moveTo(150, 600);
  c.lineTo(200, 420);
  c.lineTo(310, 380);
  c.stroke();
  c.fillStyle = '#1a1a1a';
  c.fillRect(100, 590, 110, 16);
  c.beginPath();
  c.moveTo(290, 350);
  c.lineTo(370, 390);
  c.lineTo(330, 440);
  c.closePath();
  c.fill();
  const cone = c.createLinearGradient(340, 420, 420, 600);
  cone.addColorStop(0, 'rgba(255,255,255,0.18)');
  cone.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = cone;
  c.beginPath();
  c.moveTo(335, 425);
  c.lineTo(355, 400);
  c.lineTo(470, 600);
  c.lineTo(330, 600);
  c.closePath();
  c.fill();
}

/* ─────────── layer 2: the monitor's screen ─────────── */

function drawScreen(c: Ctx, font: string) {
  c.fillStyle = DESK;
  c.fillRect(0, 0, W, H);
  windowFrame(c, font, 0, 0, W, H, 'phone.bmp - Paint');
  // menu bar
  ['File', 'Edit', 'View', 'Image', 'Colours', 'Help'].forEach((m, i) => text(c, font, m, 20 + i * 92, 56, 18, DARK));
  // tool box
  for (let r = 0; r < 8; r++)
    for (let k = 0; k < 2; k++) {
      bevel(c, 14 + k * 42, 84 + r * 42, 38, 38, r === 3 && k === 0, 2);
      c.fillStyle = '#404040';
      c.fillRect(26 + k * 42, 96 + r * 42, 14, 14);
    }
  // canvas
  bevel(c, 104, 80, 1082, 704, true, 3);
  c.fillStyle = '#fafafa';
  c.fillRect(110, 86, 1070, 692);
  // palette: greys only
  bevel(c, 14, 800, 1172, 88, false, 2);
  bevel(c, 24, 812, 60, 64, true, 2);
  c.fillStyle = DARK;
  c.fillRect(34, 822, 26, 26);
  for (let i = 0; i < 14; i++) {
    const v = Math.round((i / 13) * 255);
    c.fillStyle = `rgb(${v},${v},${v})`;
    c.fillRect(100 + (i % 7) * 36, 814 + Math.floor(i / 7) * 32, 30, 28);
  }
  text(c, font, 'For help, click Help Topics.', 380, 844, 18, DARK);

  // doodles
  c.strokeStyle = '#1a1a1a';
  c.lineWidth = 5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(170, 700);
  c.bezierCurveTo(230, 600, 300, 760, 360, 650);
  c.stroke();
  c.fillStyle = '#1a1a1a';
  for (let i = 0; i < 60; i++) {
    const a = i * 2.4;
    const r = 8 + ((i * 37) % 50);
    c.fillRect(930 + Math.cos(a) * r, 220 + Math.sin(a) * r, 4, 4);
  }

  // the phone
  c.fillStyle = '#141414';
  c.beginPath();
  c.roundRect(470, 140, 260, 600, 40);
  c.fill();
  c.strokeStyle = '#6a6a6a';
  c.lineWidth = 4;
  c.stroke();
  c.fillStyle = '#262626';
  c.beginPath();
  c.roundRect(484, 160, 232, 560, 28);
  c.fill();
  c.fillStyle = '#0a0a0a';
  c.beginPath();
  c.roundRect(560, 170, 80, 20, 10);
  c.fill();
  text(c, font, '12:00', 506, 208, 16, '#f0f0f0');
  c.fillStyle = '#f0f0f0';
  for (let i = 0; i < 4; i++) c.fillRect(660 + i * 9, 214 - i * 4, 6, 4 + i * 4);
  text(c, font, 'Photos', 506, 250, 22, '#f0f0f0', 'bold');
  // thumbnail strip above
  for (let i = 0; i < 3; i++) {
    c.fillStyle = i === 1 ? '#8a8a8a' : '#4a4a4a';
    c.fillRect(498 + i * 70, 280, 64, 64);
  }
  c.fillStyle = '#101010';
  c.fillRect(498, 363.5, 204, 153);
  // caption and controls under the photo
  text(c, font, 'IMG_0001', 506, 538, 16, '#b0b0b0');
  c.fillStyle = '#5a5a5a';
  c.fillRect(506, 560, 188, 4);
  c.fillStyle = '#f0f0f0';
  c.fillRect(506, 560, 120, 4);
  for (let i = 0; i < 4; i++) {
    c.fillStyle = '#4a4a4a';
    c.beginPath();
    c.arc(530 + i * 48, 620, 16, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#d0d0d0';
  c.beginPath();
  c.roundRect(560, 694, 80, 6, 3);
  c.fill();
}

/* ─────────── layer 3: magnified pixels ─────────── */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function drawPixels(c: Ctx) {
  c.fillStyle = '#050505';
  c.fillRect(0, 0, W, H);
  const cw = 100;
  const ch = 75;
  for (let j = -1; j < 13; j++) {
    for (let i = -1; i < 13; i++) {
      const x = 50 + i * cw;
      const y = 37.5 + j * ch;
      const dx = (x + cw / 2 - 600) / 600;
      const dy = (y + ch / 2 - 450) / 450;
      const f = 1 - Math.min(1, Math.hypot(dx, dy) * 0.95);
      const th = BAYER[((i + 4) % 4) * 4 + ((j + 4) % 4)] / 16;
      const lit = f > th;
      const v = lit ? 150 + Math.round(f * 90) : 26 + Math.round(f * 30);
      // three subpixel stripes, as a screen looks under a loupe (kept grey for this stage)
      for (let s = 0; s < 3; s++) {
        const k = [0.86, 1, 0.9][s];
        const g = Math.round(v * k);
        c.fillStyle = `rgb(${g},${g},${g})`;
        c.fillRect(x + 3 + s * 31.33 + 1, y + 2.25, 29.33, 70.5);
      }
    }
  }
  // the one pixel we dive into: outlined
  c.strokeStyle = '#f5f5f5';
  c.lineWidth = 3;
  c.strokeRect(550, 411.75, 100, 76.5);
  c.fillStyle = '#2c2c2c';
  c.fillRect(553, 414.75, 94, 70.5);
}

/* ─────────── component ─────────── */

export default function InfiniteZoom({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  const zoomEl = useRef<HTMLSpanElement>(null);
  const api = useRef<{ start: () => void; stop: () => void; draw: () => void } | null>(null);
  const activeRef = useRef(active);
  const reducedRef = useRef(reducedMotion);
  const progressRef = useRef(progress);
  activeRef.current = active;
  reducedRef.current = reducedMotion;
  progressRef.current = progress;

  useEffect(() => {
    const el = host.current;
    const canvas = cvs.current;
    if (!el || !canvas) return;
    const c = canvas.getContext('2d', { alpha: false });
    if (!c) return;
    let font = resolveFamily('font-pixel');
    let dead = false;
    document.fonts
      .load(`18px ${font}`)
      .catch(() => [])
      .then(() => {
        if (dead) return;
        font = resolveFamily('font-pixel');
        if (!raf) draw();
      });

    let vw = 1;
    let vh = 1;
    let dpr = 1;
    const state = { u: progressRef.current ?? 0, clock: 0, layer: -1, zoomText: '' };

    const paint = (i: number) => {
      if (i === 0) drawDesktop(c, font);
      else if (i === 1) drawDesk(c);
      else if (i === 2) drawScreen(c, font);
      else drawPixels(c);
    };

    /** Still frame: parent progress when given, else the reduced-motion still, else wherever the loop is. */
    const draw = () => {
      const pr = progressRef.current;
      if (pr !== undefined) state.u = Math.min(1, Math.max(0, pr));
      else if (reducedRef.current) state.u = 0;
      render(state.u);
    };

    const render = (uIn: number) => {
      const u = ((uIn % 1) + 1) % 1;

      // camera: cover-fit layer 0 (centred across, sitting on the taskbar), then zoom about the loop's fixed point
      const z0 = Math.max(vw / W, vh / H);
      const qx = (LOOP.fx - W / 2) * z0 + vw / 2;
      const qy = LOOP.fy * z0 + (vh - H * z0);
      const Z = z0 * Math.pow(LOOP.s, -u);

      // layer transforms in layer-0 coordinates: p0 = o + s·p
      const chain: { i: number; ox: number; oy: number; s: number }[] = [];
      let ox = 0;
      let oy = 0;
      let s = 1;
      for (let d = 0; d < 16; d++) {
        const i = d % 4;
        const sw = W * s * Z;
        if (sw < 2) break;
        chain.push({ i, ox, oy, s });
        const p = PORTALS[i];
        ox += s * p[0];
        oy += s * p[1];
        s *= RATIO[i];
      }
      // start from the deepest layer that already covers the whole view
      let first = 0;
      for (let d = chain.length - 1; d >= 0; d--) {
        const L = chain[d];
        const x = (L.ox - LOOP.fx) * Z + qx;
        const y = (L.oy - LOOP.fy) * Z + qy;
        if (x <= 0.5 && y <= 0.5 && x + W * L.s * Z >= vw - 0.5 && y + H * L.s * Z >= vh - 0.5) {
          first = d;
          break;
        }
      }

      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = DESK;
      c.fillRect(0, 0, canvas.width, canvas.height);
      for (let d = first; d < chain.length; d++) {
        const L = chain[d];
        const k = dpr * Z * L.s;
        c.setTransform(k, 0, 0, k, dpr * ((L.ox - LOOP.fx) * Z + qx), dpr * ((L.oy - LOOP.fy) * Z + qy));
        if (d > first) {
          c.save();
          c.beginPath();
          c.rect(0, 0, W, H);
          c.clip();
        }
        paint(L.i);
      }
      // unwind the nested clips
      for (let d = first + 1; d < chain.length; d++) c.restore();

      // readouts
      const layer = chain[first].i;
      if (layer !== state.layer && trail.current) {
        state.layer = layer;
        trail.current.textContent = NAMES.map((n, i) => (i === layer ? `[${n}]` : n)).join(' > ');
      }
      const zt = `${NAMES[layer]} x${Math.max(1, Math.round(Math.pow(LOOP.s, -u)))}`;
      if (zt !== state.zoomText && zoomEl.current) {
        state.zoomText = zt;
        zoomEl.current.textContent = zt;
      }
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      vw = Math.max(1, el.clientWidth);
      vh = Math.max(1, el.clientHeight);
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      if (!raf) draw();
    };

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const pr = progressRef.current;
      if (pr !== undefined) {
        // ease towards the parent's depth so a scroll flick does not jump
        const k = 1 - Math.exp(-dt * 7);
        const p = Math.min(1, Math.max(0, pr));
        state.u += (p - state.u) * k;
        if (Math.abs(p - state.u) < 1e-5) state.u = p;
      } else state.u = (state.u + dt / LOOP_SECONDS) % 1;
      render(state.u);
    };
    const start = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    api.current = { start, stop, draw };
    if (activeRef.current && !reducedRef.current) start();
    else draw();

    return () => {
      dead = true;
      stop();
      ro.disconnect();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    const a = api.current;
    if (!a) return;
    if (active && !reducedMotion) a.start();
    else {
      a.stop();
      a.draw();
    }
  }, [active, reducedMotion, progress]);

  return (
    <div ref={host} className="relative h-full w-full overflow-hidden bg-[#2c2c2c] select-none">
      <canvas ref={cvs} aria-hidden className="absolute inset-0 block h-full w-full" />
      <Corner title="Infinite Zoom" tools={TOOLS} />
      {/* top right, clear of the taskbar: layer trail (wider screens) and zoom depth */}
      <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-1">
        <span
          ref={zoomEl}
          className="pixel bg-[#c0c0c0] px-2 py-1 text-[16px] leading-[16px] text-black"
          style={{ boxShadow: BEVEL }}
        >
          desktop x1
        </span>
        <div ref={trail} className="pixel hidden bg-[#c0c0c0] px-2 py-1 text-[16px] leading-[16px] text-black sm:block" style={{ boxShadow: BEVEL }}>
          [desktop] &gt; monitor &gt; phone &gt; pixel
        </div>
      </div>
    </div>
  );
}
