'use client';

import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Mesh, Plane, Program, Renderer, Texture, Triangle } from 'ogl';
import gsap from 'gsap';
import type { ExperienceProps } from '@/lib/experiences/types';
import { G4Label, PIXEL_FONT, cssFont, useFontsReady, useSize } from './g4-shared';

/** useSize, plus a synchronous first measure before paint so page 01 never waits on the observer. */
function useStageSize(ref: React.RefObject<HTMLDivElement | null>) {
  const observed = useSize(ref);
  const [first, setFirst] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r && r.width && r.height) setFirst({ w: Math.round(r.width), h: Math.round(r.height) });
  }, [ref]);
  return observed.w ? observed : first;
}

/*
 * Page Transitions: a showcase of route transitions. Ten pages, each titled in giant single-colour
 * type with a 01/10 counter; each hop uses a different transition, all built as seekable GSAP
 * timelines (so a parent's progress, a wheel scrub or autoplay can all drive them).
 *  - Tear (OGL): signed distance to a wavy line through an impact point, fibrous FBM edges, and a
 *    single uCrack/uOpen pair (not time) that opens the gap from the centre outward over a texture of
 *    the next page. Phases: calm, tear, open, reform. The mono page tears to reveal colour.
 *  - Blackout (OGL, after p5aholic Day 016): five hue layers of noisy radial falloff, mapped so
 *    saturation = sin and brightness = cos (black core, saturated rim); type inside turns white.
 *  - Persistent planes (OGL): image planes detach from their DOM slots, glide to the next page's
 *    slots, then hand back to the DOM.
 *  - Blinds, columns, curtain (scale staggers), iris (clip-path circle), wipe and split (inset()).
 * One WebGL context serves all three GL effects. Reduced motion: a plain fade.
 */

const TOOLS = ['ogl', 'glsl', 'gsap', 'css', 'svg'];

type Fx = 'tear' | 'blinds' | 'iris' | 'wipe' | 'blackout' | 'planes' | 'columns' | 'split' | 'curtain';
type Page = { word: string; bg: string; ink: string; caption: string; slots?: 'row' | 'feature' };

const PAGES: Page[] = [
  { word: 'Pages', bg: '#f5f5f5', ink: '#080808', caption: 'a mono page. press next and it tears' },
  { word: 'Torn', bg: '#ff2e00', ink: '#080808', caption: 'the paper ripped from the centre out' },
  { word: 'Blinds', bg: '#7b2cff', ink: '#ffffff', caption: 'slats scaleY in turn, then open' },
  { word: 'Iris', bg: '#ffe600', ink: '#080808', caption: 'clip-path: circle(0%) to circle(150%)' },
  { word: 'Wipe', bg: '#00b3ff', ink: '#080808', caption: 'clip-path: inset() from the right' },
  { word: 'Blackout', bg: '#080808', ink: '#ff00a8', caption: 'a blob swallows the page', slots: 'row' },
  { word: 'Planes', bg: '#00e676', ink: '#080808', caption: 'the images glide to their new slots', slots: 'feature' },
  { word: 'Columns', bg: '#ff00a8', ink: '#080808', caption: 'columns from the centre out' },
  { word: 'Split', bg: '#080808', ink: '#ffe600', caption: 'inset() opens from the middle' },
  { word: 'Curtain', bg: '#7b2cff', ink: '#ffffff', caption: 'one curtain up, one curtain off' },
];
/* EFFECTS[i] carries page i to page i + 1 */
const EFFECTS: Fx[] = ['tear', 'blinds', 'iris', 'wipe', 'blackout', 'planes', 'columns', 'split', 'curtain', 'tear'];
const IMAGES = ['/showcase/igloo.jpg', '/showcase/lusion.jpg', '/showcase/raycast.jpg'];
const SLATS = 10;

/* ───────────────────────────── layout shared by the DOM and Canvas2D ───────────────────────────── */

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(word: string, font: string) {
  if (typeof document === 'undefined') return word.length * 50;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  measureCtx!.font = `italic 400 100px ${font}`;
  return measureCtx!.measureText(word).width;
}

type Rect = { x: number; y: number; w: number; h: number };
function layout(page: Page, w: number, h: number, font: string) {
  const pad = Math.max(16, Math.round(w * 0.04));
  const maxW = w - pad * 2;
  const unit = measure(page.word, font) / 100;
  const fs = Math.max(24, Math.min(maxW / Math.max(0.1, unit), h * (page.slots ? 0.3 : 0.44)));
  const wordTop = page.slots ? Math.max(pad + 40, h * 0.12) : (h - fs) / 2;
  const slots: Rect[] = [];
  if (page.slots) {
    const top = wordTop + fs * 1.12;
    const bottom = h - pad - 40;
    const gap = Math.max(8, pad * 0.6);
    const H = Math.max(40, bottom - top);
    if (page.slots === 'row') {
      const sw = (maxW - gap * 2) / 3;
      for (let i = 0; i < 3; i++) slots.push({ x: pad + i * (sw + gap), y: top, w: sw, h: H });
    } else {
      const bw = (maxW - gap) * 0.6;
      const sw = maxW - gap - bw;
      const sh = (H - gap) / 2;
      slots.push({ x: pad, y: top, w: bw, h: H });
      slots.push({ x: pad + bw + gap, y: top, w: sw, h: sh });
      slots.push({ x: pad + bw + gap, y: top + sh + gap, w: sw, h: sh });
    }
  }
  // the caption keeps clear of the [next →] button (right-3 + its width + a gap)
  const capW = Math.max(120, Math.min(w * 0.6, w - pad - BTN_RESERVE));
  return { pad, fs, wordTop, slots, capW };
}

/** px the caption leaves free on the right for the absolute [next →] button (12 + 8ch·8px + 24 + 12). */
const BTN_RESERVE = 12 + 96 + 16;

/**
 * y of the alphabetic baseline for text set in a CSS line box of height `lineH` starting at `top`:
 * CSS centres the font's ascent+descent in the line box (half-leading), so do exactly that here,
 * with the current ctx.font. This keeps the Canvas2D texture pixel-aligned with the DOM page.
 */
function baseline(x: CanvasRenderingContext2D, top: number, lineH: number) {
  const m = x.measureText('Hg');
  const A = m.fontBoundingBoxAscent;
  const D = m.fontBoundingBoxDescent;
  return top + (lineH - (A + D)) / 2 + A;
}

/** Greedy word wrap at spaces, the way CSS wraps a normal paragraph. */
function wrap(x: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const tryLine = line ? `${line} ${word}` : word;
    if (line && x.measureText(tryLine).width > maxW + 0.5) {
      out.push(line);
      line = word;
    } else line = tryLine;
  }
  if (line) out.push(line);
  return out;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement | undefined, r: Rect) {
  if (!img || !img.complete || !img.naturalWidth) {
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    return;
  }
  const ia = img.naturalWidth / img.naturalHeight;
  const ra = r.w / r.h;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (ia > ra) sw = sh * ra;
  else sh = sw / ra;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, r.x, r.y, r.w, r.h);
}

/** Draws a page exactly like <PageView>; textOnly draws white type on transparent (blackout mask). */
function drawPage(i: number, w: number, h: number, dpr: number, font: string, imgs: HTMLImageElement[], textOnly = false) {
  const page = PAGES[i];
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w * dpr));
  c.height = Math.max(2, Math.round(h * dpr));
  const x = c.getContext('2d')!;
  x.scale(dpr, dpr);
  const L = layout(page, w, h, font);
  const ink = textOnly ? '#ffffff' : page.ink;
  if (!textOnly) {
    x.fillStyle = page.bg;
    x.fillRect(0, 0, w, h);
  }
  // Every line uses the DOM's own box maths (top + line-height, alphabetic baseline) so the texture
  // and the DOM page sit on the same pixels at the GL -> DOM handoff.
  x.fillStyle = ink;
  x.textBaseline = 'alphabetic';
  x.font = `italic 400 ${L.fs}px ${font}`;
  x.textAlign = 'center';
  x.fillText(page.word, w / 2, baseline(x, L.wordTop, L.fs));
  x.textAlign = 'right';
  x.font = `32px ${PIXEL_FONT}`;
  x.fillText(`${String(i + 1).padStart(2, '0')}/10`, w - L.pad, baseline(x, L.pad + 2, 32));
  x.font = `16px ${PIXEL_FONT}`;
  x.fillText(`next → ${EFFECTS[i]}`, w - L.pad, baseline(x, L.pad + 2 + 32 + 6, 16));
  x.textAlign = 'left';
  const lines = wrap(x, page.caption, L.capW);
  const capTop = h - L.pad - lines.length * 16;
  lines.forEach((ln, k) => x.fillText(ln, L.pad, baseline(x, capTop + k * 16, 16)));
  if (!textOnly) L.slots.forEach((r, k) => drawCover(x, imgs[k], r));
  return c;
}

const PageView = forwardRef<HTMLDivElement, { index: number; w: number; h: number; font: string; layer: 'a' | 'b' }>(function PageView(
  { index, w, h, font, layer },
  ref,
) {
  const page = PAGES[index];
  const L = layout(page, w, h, font);
  return (
    // transition-none: the global reduced-motion rule turns every style change into a 0.01ms
    // transition, which left one frame of the old background under the new type at each page swap.
    <div ref={ref} data-layer={layer} className={`absolute inset-0 transition-none ${layer === 'b' ? 'invisible' : ''}`}>
      <div className="absolute inset-0 overflow-hidden transition-none" style={{ background: page.bg, color: page.ink }}>
        <p className="absolute right-0 left-0 text-center font-display whitespace-nowrap italic" style={{ top: L.wordTop, fontSize: L.fs, lineHeight: 1 }}>
          {page.word}
        </p>
        <p className="pixel absolute text-right" style={{ top: L.pad + 2, right: L.pad }}>
          <span className="block text-[32px] leading-[32px]">{`${String(index + 1).padStart(2, '0')}/10`}</span>
          <span className="mt-[6px] block text-[16px] leading-[16px]">next → {EFFECTS[index]}</span>
        </p>
        <p className="pixel absolute text-[16px] leading-[16px]" style={{ left: L.pad, bottom: L.pad, maxWidth: L.capW }}>
          {page.caption}
        </p>
        {L.slots.map((r, k) => (
          <div key={k} data-slot={k} className="absolute overflow-hidden" style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
            <Image src={IMAGES[k]} alt="" fill sizes="(max-width: 700px) 60vw, 40vw" className="object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
});

/* ───────────────────────────── shaders ───────────────────────────── */

const FULL_VERT = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

const NOISE = /* glsl */ `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}`;

const TEAR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tFrom;
uniform sampler2D tTo;
uniform vec2 uRes;
uniform vec2 uImpact;
uniform float uCalm;
uniform float uCrack;
uniform float uOpen;
uniform float uReform;
uniform float uSeed;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 uv = vUv;
  float ar = uRes.x / uRes.y;
  float dx = abs(uv.x - uImpact.x) * ar;
  float reach = uCrack * 1.25 * ar;
  float along = smoothstep(reach, reach - 0.2, dx);
  float L = uImpact.y + (fbm(vec2(uv.x * 3.2, uSeed)) - 0.5) * 0.2 + (uv.x - uImpact.x) * 0.06;
  float fall = 1.0 - clamp(dx / ar, 0.0, 1.0);
  float open = (uOpen * uOpen * 1.5 + uOpen * 0.05) * mix(0.35 + 0.65 * fall, 1.0, uOpen) + 0.003 * uCrack;
  open *= along;
  float fT = ((fbm(uv * vec2(70.0, 22.0) + uSeed) - 0.5) * 0.016 + (vnoise(uv * vec2(420.0, 60.0)) - 0.5) * 0.005) * along;
  float fB = ((fbm(uv * vec2(66.0, 20.0) + uSeed + 7.3) - 0.5) * 0.016 + (vnoise(uv * vec2(400.0, 70.0) + 3.0) - 0.5) * 0.005) * along;
  float topEdge = L + open + fT;
  float botEdge = L - open + fB;
  vec2 tuv = (uv - 0.5) / (1.0 + 0.05 * (1.0 - uReform)) + 0.5;
  vec3 col = texture2D(tTo, tuv).rgb;
  vec3 fibre = vec3(0.985, 0.975, 0.95);
  if (uv.y > topEdge) {
    col = texture2D(tFrom, vec2(uv.x, uv.y - open)).rgb;
    float d = uv.y - topEdge;
    float rim = 1.0 - smoothstep(0.0, 0.004 + 0.007 * vnoise(uv * vec2(160.0, 8.0)), d);
    col = mix(col, fibre, rim * along * 0.95);
    col *= 1.0 - 0.18 * along * smoothstep(0.0, 0.2, uOpen) * exp(-d * 40.0);
  } else if (uv.y < botEdge) {
    col = texture2D(tFrom, vec2(uv.x, uv.y + open)).rgb;
    float d = botEdge - uv.y;
    float rim = 1.0 - smoothstep(0.0, 0.004 + 0.007 * vnoise(uv * vec2(150.0, 9.0) + 4.0), d);
    col = mix(col, fibre, rim * along * 0.95);
    col *= 1.0 - 0.18 * along * smoothstep(0.0, 0.2, uOpen) * exp(-d * 40.0);
  } else {
    float e = min(uv.y - botEdge, topEdge - uv.y);
    col *= 1.0 - 0.45 * exp(-e * 45.0) * (1.0 - uReform);
  }
  // calm: a faint crease where it will tear
  col *= 1.0 - 0.07 * uCalm * (1.0 - uCrack) * exp(-abs(uv.y - L) * 90.0);
  gl_FragColor = vec4(col, 1.0);
}`;

const BLACKOUT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tFrom;
uniform sampler2D tTo;
uniform sampler2D tTxtFrom;
uniform sampler2D tTxtTo;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uSize;
uniform float uPhase;
uniform float uTime;
uniform vec3 uHue[5];
varying vec2 vUv;
${NOISE}
void main(){
  vec2 p = (vUv - uCenter) * vec2(uRes.x / uRes.y, 1.0);
  vec3 col = mix(texture2D(tFrom, vUv).rgb, texture2D(tTo, vUv).rgb, uPhase);
  float txt = mix(texture2D(tTxtFrom, vUv).a, texture2D(tTxtTo, vUv).a, uPhase);
  float ang = atan(p.y, p.x);
  float core = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 off = vec2(cos(fi * 2.4 + uTime * 0.9), sin(fi * 1.9 + uTime * 0.7)) * 0.035 * uSize;
    vec2 q = p - off;
    float a = atan(q.y, q.x);
    float n = fbm(vec2(cos(a), sin(a)) * 1.3 + vec2(fi * 1.7, uTime * 0.35));
    float r = uSize * (1.0 - fi * 0.045) * (0.72 + 0.5 * n);
    float d = length(q);
    float m = clamp((r - d) / (0.09 + 0.06 * uSize), 0.0, 1.0);
    float t = m * 1.5707963;
    vec3 grey = vec3(dot(uHue[i], vec3(0.299, 0.587, 0.114)));
    vec3 layer = mix(mix(vec3(1.0), grey, 0.4), uHue[i], sin(t)) * cos(t);
    col = mix(col, layer, smoothstep(0.0, 0.18, m));
    core = max(core, m);
  }
  col = mix(col, vec3(1.0), txt * smoothstep(0.6, 1.0, core));
  gl_FragColor = vec4(col, 1.0);
}`;

const PLANE_VERT = /* glsl */ `
attribute vec2 uv;
attribute vec3 position;
uniform vec4 uRect;
uniform vec2 uRes;
uniform float uBend;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec2 px = uRect.xy + vec2(uv.x, 1.0 - uv.y) * uRect.zw;
  px.y += sin(uv.x * 3.14159) * uBend * 0.06 * uRect.w;
  vec2 clip = px / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const PLANE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tMap;
uniform vec4 uRect;
uniform float uImgAspect;
uniform float uBend;
varying vec2 vUv;
void main(){
  float ra = uRect.z / max(1.0, uRect.w);
  vec2 uv = vUv - 0.5;
  if (ra > uImgAspect) uv.y *= uImgAspect / ra; else uv.x *= ra / uImgAspect;
  uv *= 1.0 - uBend * 0.18 * (1.0 - dot(uv, uv) * 3.0);
  uv += 0.5;
  vec3 col = vec3(texture2D(tMap, uv + vec2(uBend * 0.006, 0.0)).r, texture2D(tMap, uv).g, texture2D(tMap, uv - vec2(uBend * 0.006, 0.0)).b);
  gl_FragColor = vec4(col, 1.0);
}`;

const HUES = ['#ff2e00', '#ff00a8', '#7b2cff', '#00b3ff', '#ffe600'].map((h) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
});

type GL = {
  renderer: Renderer;
  tear: Mesh;
  blackout: Mesh;
  planes: Mesh[];
  planeTex: Texture[];
  mode: 'none' | 'tear' | 'blackout' | 'planes';
  render: () => void;
  texture: (src: HTMLCanvasElement) => Texture;
};

/* ───────────────────────────── the experience ───────────────────────────── */

export default function PageTransitions({ active, reducedMotion, progress }: ExperienceProps) {
  const root = useRef<HTMLDivElement>(null);
  const layerA = useRef<HTMLDivElement>(null);
  const layerB = useRef<HTMLDivElement>(null);
  const slats = useRef<HTMLDivElement>(null);
  const glHost = useRef<HTMLDivElement>(null);
  const { w, h } = useStageSize(root);
  const fontsReady = useFontsReady();
  const [cur, setCur] = useState(0);
  const nxt = (cur + 1) % PAGES.length;
  const glRef = useRef<GL | null>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const playing = useRef(false);
  const impact = useRef({ x: 0.5, y: 0.5 });
  const scrub = useRef({ v: 0, releaseAt: 0 });
  const lastInput = useRef(0);
  const imgs = useRef<HTMLImageElement[]>([]);
  const [glReady, setGlReady] = useState(false);
  const driven = progress !== undefined;
  const font = useMemo(() => (fontsReady ? cssFont('--font-display', 'Georgia, serif') : 'Georgia, serif'), [fontsReady]);

  // Preload slot images for Canvas2D and the GL planes.
  useEffect(() => {
    imgs.current = IMAGES.map((src) => {
      const im = new window.Image();
      im.decoding = 'async';
      im.src = `/_next/image?url=${encodeURIComponent(src)}&w=1080&q=75`;
      return im;
    });
  }, []);

  // One OGL context for tear, blackout and the persistent planes.
  useEffect(() => {
    const host = glHost.current;
    if (!host) return;
    let renderer: Renderer;
    try {
      renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio || 1, 1.75), alpha: true, premultipliedAlpha: false });
    } catch {
      return;
    }
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(gl.canvas);
    const tri = new Triangle(gl);
    const blank = new Texture(gl, { generateMipmaps: false });
    const tear = new Mesh(gl, {
      geometry: tri,
      program: new Program(gl, {
        vertex: FULL_VERT,
        fragment: TEAR_FRAG,
        depthTest: false,
        uniforms: {
          tFrom: { value: blank },
          tTo: { value: blank },
          uRes: { value: [1, 1] },
          uImpact: { value: [0.5, 0.5] },
          uCalm: { value: 0 },
          uCrack: { value: 0 },
          uOpen: { value: 0 },
          uReform: { value: 0 },
          uSeed: { value: 1.7 },
        },
      }),
    });
    const blackout = new Mesh(gl, {
      geometry: tri,
      program: new Program(gl, {
        vertex: FULL_VERT,
        fragment: BLACKOUT_FRAG,
        depthTest: false,
        uniforms: {
          tFrom: { value: blank },
          tTo: { value: blank },
          tTxtFrom: { value: blank },
          tTxtTo: { value: blank },
          uRes: { value: [1, 1] },
          uCenter: { value: [0.5, 0.5] },
          uSize: { value: 0 },
          uPhase: { value: 0 },
          uTime: { value: 0 },
          uHue: { value: HUES.flat() },
        },
      }),
    });
    const plane = new Plane(gl, { widthSegments: 16, heightSegments: 4 });
    const planeTex = IMAGES.map(() => new Texture(gl, { generateMipmaps: false }));
    const planes = IMAGES.map(
      (_, k) =>
        new Mesh(gl, {
          geometry: plane,
          program: new Program(gl, {
            vertex: PLANE_VERT,
            fragment: PLANE_FRAG,
            depthTest: false,
            cullFace: false,
            uniforms: {
              tMap: { value: planeTex[k] },
              uRect: { value: [0, 0, 1, 1] },
              uRes: { value: [1, 1] },
              uImgAspect: { value: 1.6 },
              uBend: { value: 0 },
            },
          }),
        }),
    );
    const g: GL = {
      renderer,
      tear,
      blackout,
      planes,
      planeTex,
      mode: 'none',
      render: () => {
        if (g.mode === 'tear') renderer.render({ scene: tear });
        else if (g.mode === 'blackout') {
          blackout.program.uniforms.uTime.value = performance.now() / 1000;
          renderer.render({ scene: blackout });
        } else if (g.mode === 'planes') {
          planes.forEach((m, i) => renderer.render({ scene: m, clear: i === 0 }));
        }
      },
      texture: (src) => new Texture(gl, { image: src, generateMipmaps: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR }),
    };
    glRef.current = g;
    setGlReady(true);
    return () => {
      glRef.current = null;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      gl.canvas.remove();
    };
  }, []);

  // Keep the GL canvas sized to the stage.
  useEffect(() => {
    const g = glRef.current;
    if (!g || !w || !h) return;
    g.renderer.setSize(w, h);
    const res = [g.renderer.gl.canvas.width, g.renderer.gl.canvas.height];
    g.tear.program.uniforms.uRes.value = res;
    g.blackout.program.uniforms.uRes.value = res;
    g.planes.forEach((m) => (m.program.uniforms.uRes.value = [w, h]));
  }, [w, h, glReady]);

  // Build the (paused, seekable) timeline for cur → nxt. Rebuilt after every commit.
  useLayoutEffect(() => {
    const r = root.current;
    const A = layerA.current;
    const B = layerB.current;
    const S = slats.current;
    const G = glHost.current;
    if (!r || !A || !B || !S || !G || !w || !h) return;
    const g = glRef.current;
    const fx: Fx = EFFECTS[cur];
    const from = cur;
    const to = nxt;
    const made: Texture[] = [];
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true, onUpdate: () => g?.render() });
      const slatEls = gsap.utils.toArray<HTMLElement>(S.children);
      const cx = `${impact.current.x * 100}%`;
      const cy = `${impact.current.y * 100}%`;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      if (reducedMotion) {
        // one plain crossfade: the whole next page (colour and type together) fades over the old one
        tl.fromTo(B, { visibility: 'visible', opacity: 0 }, { opacity: 1, duration: 0.45, ease: 'none' });
      } else if (fx === 'tear' && g) {
        g.mode = 'tear';
        const u = g.tear.program.uniforms;
        const tf = g.texture(drawPage(from, w, h, dpr, font, imgs.current));
        const tt = g.texture(drawPage(to, w, h, dpr, font, imgs.current));
        made.push(tf, tt);
        u.tFrom.value = tf;
        u.tTo.value = tt;
        u.uImpact.value = [impact.current.x, 1 - impact.current.y];
        u.uSeed.value = 1 + cur * 3.1;
        const U = { calm: 0, crack: 0, open: 0, reform: 0 };
        const sync = () => {
          u.uCalm.value = U.calm;
          u.uCrack.value = U.crack;
          u.uOpen.value = U.open;
          u.uReform.value = U.reform;
        };
        tl.eventCallback('onUpdate', () => {
          sync();
          g.render();
        });
        tl.set(G, { autoAlpha: 1 }, 0)
          .to(U, { calm: 1, duration: 0.35, ease: 'sine.inOut' }, 0)
          .to(U, { crack: 1, duration: 0.55, ease: 'power2.in' }, 0.3)
          .to(U, { open: 1, duration: 1.05, ease: 'power3.inOut' }, 0.8)
          .to(U, { reform: 1, duration: 0.5, ease: 'power2.out' }, 1.5)
          // hard cut on one frame, after reform has fully settled (no cross-fade to double the type)
          .set(B, { visibility: 'visible' }, 2.0)
          .set(G, { autoAlpha: 0 }, 2.0);
      } else if (fx === 'blackout' && g) {
        g.mode = 'blackout';
        const u = g.blackout.program.uniforms;
        const tex = [
          g.texture(drawPage(from, w, h, dpr, font, imgs.current)),
          g.texture(drawPage(to, w, h, dpr, font, imgs.current)),
          g.texture(drawPage(from, w, h, dpr, font, imgs.current, true)),
          g.texture(drawPage(to, w, h, dpr, font, imgs.current, true)),
        ];
        made.push(...tex);
        u.tFrom.value = tex[0];
        u.tTo.value = tex[1];
        u.tTxtFrom.value = tex[2];
        u.tTxtTo.value = tex[3];
        u.uCenter.value = [impact.current.x, 1 - impact.current.y];
        const U = { size: 0, phase: 0 };
        tl.eventCallback('onUpdate', () => {
          u.uSize.value = U.size;
          u.uPhase.value = U.phase;
          g.render();
        });
        tl.set(G, { autoAlpha: 1 }, 0)
          .to(U, { size: 1.9, duration: 1.05, ease: 'power2.in' }, 0)
          .set(U, { phase: 1 }, 1.05)
          .to(U, { size: 0, duration: 1.05, ease: 'power2.out' }, 1.15)
          .set(B, { visibility: 'visible' }, 2.2)
          .set(G, { autoAlpha: 0 }, 2.2);
      } else if (fx === 'planes' && g) {
        g.mode = 'planes';
        const fromR = layout(PAGES[from], w, h, font).slots;
        const toR = layout(PAGES[to], w, h, font).slots;
        const rects = fromR.map((r0) => ({ ...r0, bend: 0 }));
        imgs.current.forEach((im, k) => {
          if (im.complete && im.naturalWidth) {
            g.planeTex[k].image = im;
            g.planes[k].program.uniforms.uImgAspect.value = im.naturalWidth / im.naturalHeight;
          }
        });
        tl.eventCallback('onUpdate', () => {
          rects.forEach((rc, k) => {
            g.planes[k].program.uniforms.uRect.value = [rc.x, rc.y, rc.w, rc.h];
            g.planes[k].program.uniforms.uBend.value = rc.bend;
          });
          g.render();
        });
        const slotsA = A.querySelectorAll('[data-slot]');
        const slotsB = B.querySelectorAll('[data-slot]');
        tl.set(G, { autoAlpha: 1 }, 0)
          .set(slotsA, { opacity: 0 }, 0)
          .set(slotsB, { opacity: 0 }, 0)
          .set(B, { visibility: 'visible' }, 0)
          .fromTo(B, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.0, ease: 'power3.inOut' }, 0.1);
        rects.forEach((rc, k) => {
          tl.to(rc, { x: toR[k].x, y: toR[k].y, w: toR[k].w, h: toR[k].h, duration: 1.15, ease: 'power3.inOut' }, 0.15 + k * 0.08);
          tl.to(rc, { bend: 1, duration: 0.55, ease: 'sine.in', yoyo: true, repeat: 1 }, 0.15 + k * 0.08);
        });
        tl.set(slotsB, { opacity: 1 }, 1.55).to(G, { autoAlpha: 0, duration: 0.1 }, 1.56);
      } else if (fx === 'blinds' || fx === 'columns' || fx === 'curtain') {
        // Slats alternate the next page's ink and colour, and each slat opens as soon as it has
        // covered its band (the next page is revealed band by band behind it), so the stage is never
        // one flat sheet: some bands always show type from the old or the new page.
        const P = PAGES[to];
        const cols = fx === 'columns';
        const curtain = fx === 'curtain';
        const els = curtain ? slatEls.slice(0, 1) : slatEls;
        const n = els.length;
        const each = 0.05;
        const d1 = curtain ? 0.7 : 0.45;
        const d2 = curtain ? 0.7 : 0.5;
        const hold = curtain ? 0.04 : 0.06;
        const prop = cols ? 'scaleX' : 'scaleY';
        // stagger order: rows top-down, columns from the centre out
        const order = els.map((_, i) => (cols ? Math.abs(i - (n - 1) / 2) - (n % 2 ? 0 : 0.5) : i));
        els.forEach((el, i) => {
          gsap.set(el, {
            display: 'block',
            background: curtain ? P.bg : i % 2 ? P.bg : P.ink,
            boxShadow: curtain ? `inset 0 -3px 0 ${P.ink}` : 'none',
            left: cols ? `${(i * 100) / n}%` : '0%',
            top: cols ? '0%' : `${(i * 100) / n}%`,
            width: cols ? `${100 / n + 0.2}%` : '100%',
            height: cols ? '100%' : `${100 / n + 0.2}%`,
            scaleX: cols ? 0 : 1,
            scaleY: cols ? 1 : 0,
            transformOrigin: cols ? '0% 50%' : curtain ? '50% 100%' : '50% 0%',
          });
          const t0 = order[i] * each;
          tl.to(el, { [prop]: 1, duration: d1, ease: 'power3.in' }, t0)
            .set(el, { transformOrigin: cols ? '100% 50%' : curtain ? '50% 0%' : '50% 100%' }, t0 + d1)
            .to(el, { [prop]: 0, duration: d2, ease: 'power3.out' }, t0 + d1 + hold);
        });
        // reveal the next page behind every band that is fully covered
        const steps = [...new Set(order)].sort((a, b) => a - b);
        steps.forEach((o) => {
          const idx = order.map((v, i) => (v <= o ? i : -1)).filter((i) => i >= 0);
          const lo = (Math.min(...idx) * 100) / n;
          const hi = ((Math.max(...idx) + 1) * 100) / n;
          const clip = cols ? `inset(0% ${100 - hi}% 0% ${lo}%)` : `inset(${lo}% 0% ${100 - hi}% 0%)`;
          tl.set(B, { visibility: 'visible', clipPath: clip }, o * each + d1);
        });
      } else if (fx === 'iris') {
        tl.set(B, { visibility: 'visible' }, 0)
          .fromTo(B, { clipPath: `circle(0% at ${cx} ${cy})` }, { clipPath: `circle(150% at ${cx} ${cy})`, duration: 1.2, ease: 'power3.inOut' }, 0)
          .to(A, { scale: 0.92, duration: 1.2, ease: 'power3.inOut' }, 0);
      } else if (fx === 'wipe') {
        tl.set(B, { visibility: 'visible' }, 0)
          .fromTo(B, { clipPath: 'inset(0% 0% 0% 100%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.0, ease: 'power4.inOut' }, 0)
          .to(A, { xPercent: -12, duration: 1.0, ease: 'power4.inOut' }, 0);
      } else {
        // split (and the fallback when WebGL is missing)
        tl.set(B, { visibility: 'visible' }, 0).fromTo(
          B,
          { clipPath: 'inset(50% 0% 50% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: 'expo.inOut' },
          0,
        );
      }
      tlRef.current = tl;
    }, r);
    return () => {
      tlRef.current = null;
      // a rebuild mid-play (resize, fonts) drops that transition; let the next press or tick start fresh
      playing.current = false;
      ctx.revert();
      if (glRef.current) glRef.current.mode = 'none';
      made.forEach((t) => glRef.current?.renderer.gl.deleteTexture(t.texture));
    };
  }, [cur, nxt, w, h, font, reducedMotion, glReady]);

  const commit = useCallback(() => {
    playing.current = false;
    setCur((c) => (c + 1) % PAGES.length);
  }, []);

  const next = useCallback(
    (x?: number, y?: number) => {
      const tl = tlRef.current;
      if (!tl) return;
      if (playing.current) {
        // a press during a running transition hurries it along instead of skipping to the end
        tl.timeScale(Math.min(4, tl.timeScale() * 2));
        return;
      }
      if (x !== undefined && y !== undefined) impact.current = { x, y };
      playing.current = true;
      tl.eventCallback('onComplete', commit);
      tl.play();
    },
    [commit],
  );

  // Autoplay (not when reduced, driven or off screen). The first transition starts about a second
  // after the stage is ready, so the page never sits dead; then one every 3.2 s.
  useEffect(() => {
    if (!active || reducedMotion || driven) return;
    const idle = () => !playing.current && performance.now() - lastInput.current > 3000 && scrub.current.v === 0;
    let first = 0;
    const kick = (delay: number) => {
      first = window.setTimeout(() => {
        if (!tlRef.current) return kick(250); // stage not measured yet
        if (idle()) next();
      }, delay);
    };
    kick(1000);
    const id = window.setInterval(() => {
      if (idle()) next();
    }, 3200);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [active, reducedMotion, driven, next]);

  // Pause a running transition when the experience goes off screen.
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl || !playing.current) return;
    if (active) tl.play();
    else tl.pause();
  }, [active]);

  // Parent progress: page = floor(p * 10), the fraction scrubs that page's transition.
  useLayoutEffect(() => {
    if (!driven) return;
    if (playing.current) {
      // the parent takes over: stop any running autoplay transition without committing
      tlRef.current?.eventCallback('onComplete', null);
      tlRef.current?.pause();
      playing.current = false;
    }
    const pos = Math.min(0.9999, Math.max(0, progress!)) * PAGES.length;
    const idx = Math.floor(pos);
    if (idx !== cur) {
      setCur(idx);
      return;
    }
    tlRef.current?.progress(pos - idx);
  }, [driven, progress, cur, w, h]);

  // Wheel scrubs the tear (and any transition) directly; release eases back or commits.
  useEffect(() => {
    const el = root.current;
    if (!el || driven) return;
    const onWheel = (e: WheelEvent) => {
      const tl = tlRef.current;
      if (!tl || playing.current) return;
      e.preventDefault();
      lastInput.current = performance.now();
      const s = scrub.current;
      s.v = Math.max(0, Math.min(1, s.v + e.deltaY / 900));
      gsap.killTweensOf(s);
      tl.progress(s.v);
      if (s.v >= 1) {
        s.v = 0;
        playing.current = true;
        commit();
        return;
      }
      window.clearTimeout(s.releaseAt);
      s.releaseAt = window.setTimeout(() => {
        const t = tlRef.current;
        if (!t) return;
        gsap.to(s, {
          v: s.v > 0.55 ? 1 : 0,
          duration: 0.5,
          ease: 'power2.out',
          onUpdate: () => t.progress(s.v),
          onComplete: () => {
            if (s.v >= 1) {
              s.v = 0;
              playing.current = true;
              commit();
            }
          },
        });
      }, 220);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [driven, commit]);

  const onStageClick = (e: React.MouseEvent) => {
    if (driven) return;
    const r = root.current!.getBoundingClientRect();
    lastInput.current = performance.now();
    next((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  return (
    <div
      ref={root}
      onClick={onStageClick}
      className="relative h-full w-full cursor-pointer overflow-hidden bg-[var(--v-bg)] select-none"
      style={{ containerType: 'size' }}
    >
      {w > 0 ? (
        <>
          <PageView ref={layerA} index={cur} w={w} h={h} font={font} layer="a" />
          <PageView ref={layerB} index={nxt} w={w} h={h} font={font} layer="b" />
        </>
      ) : (
        // static page 01 in CSS units (the stage is a size container) until the stage is measured,
        // so a slow first load shows the page, never an empty black stage
        <div className="absolute inset-0 grid place-items-center" style={{ background: PAGES[0].bg, color: PAGES[0].ink }}>
          <p className="font-display whitespace-nowrap italic" style={{ fontSize: 'min(36cqw, 44cqh)', lineHeight: 1 }}>
            {PAGES[0].word}
          </p>
          <p className="pixel absolute top-4 right-4 text-[32px] leading-[32px]">01/10</p>
        </div>
      )}
      <div ref={slats} className="pointer-events-none absolute inset-0 z-10" aria-hidden>
        {Array.from({ length: SLATS }, (_, i) => (
          <div key={i} className="absolute hidden" />
        ))}
      </div>
      <div ref={glHost} className="pointer-events-none invisible absolute inset-0 z-20" aria-hidden />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          lastInput.current = performance.now();
          next(0.5, 0.5);
        }}
        className="pixel absolute right-3 bottom-3 z-30 bg-[#080808] px-3 py-2 text-[16px] leading-[16px] text-[#f5f5f5] hover:bg-[#f5f5f5] hover:text-[#080808]"
      >
        [next →]
      </button>
      <G4Label title="Page Transitions" tools={TOOLS} />
    </div>
  );
}
