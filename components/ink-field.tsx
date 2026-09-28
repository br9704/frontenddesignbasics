'use client';

import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';

/*
 * InkField: riso-printed ink drifting through paper.
 * Domain-warped fbm split into two ink drums (orange, blue) over a paper ground,
 * finished with print grain. The pointer drags the warp field.
 *
 * Motion rules it follows:
 *  - prefers-reduced-motion → one still frame, no loop
 *  - offscreen or hidden tab → the loop stops
 *  - DPR capped at 1.75 so a 4K laptop does not melt
 */

const vertex = /* glsl */ `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uPointer;
uniform vec3 uPaper;
uniform vec3 uInkA;
uniform vec3 uInkB;
uniform float uDensity;
uniform float uClear;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 2.2;
  float t = uTime * 0.045;

  vec2 toPointer = p - (uPointer - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 2.2;
  float pull = exp(-dot(toPointer, toPointer) * 1.6);

  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 1.4 + pull * 0.6),
                fbm(p + 3.0 * q + vec2(8.3, 2.8) - t * 1.1));
  float f = fbm(p + 3.2 * r);

  // Two ink drums with soft, slightly misregistered edges.
  float inkA = smoothstep(0.56 - uDensity, 0.66 - uDensity, f + 0.12 * r.x);
  float inkB = smoothstep(0.58 - uDensity, 0.70 - uDensity, fbm(p * 1.05 + 3.1 * r + vec2(0.012, -0.008)) + 0.1 * q.y);

  // Clear zone: ink thins out towards the left, where text sits, along an inky, irregular edge.
  // Landscape: text on the left, so clear the left. Portrait: text sits low, so clear the bottom.
  float wobble = 0.18 * (fbm(p * 1.3 + 7.0) - 0.5);
  float edgeLandscape = uv.x + wobble - 0.12 * (1.0 - uv.y);
  float edgePortrait = uv.y + wobble - 0.08;
  float portrait = step(uRes.x, uRes.y * 0.9);
  float keep = mix(1.0, smoothstep(0.34, 0.72, mix(edgeLandscape, edgePortrait + 0.12, portrait)), uClear);
  inkA *= keep;
  inkB *= keep;

  vec3 col = uPaper;
  col = mix(col, col * uInkA, inkA * 0.92);        // multiply, like overprinted ink
  col = mix(col, col * uInkB, inkB * 0.85);

  // Paper tooth and print grain.
  float grain = hash(uv * uRes + fract(uTime) * 91.0) - 0.5;
  col += grain * 0.045;
  col *= 0.97 + 0.03 * noise(uv * uRes * 0.35);

  gl_FragColor = vec4(col, 1.0);
}`;

function hexToVec3(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export interface InkFieldProps {
  className?: string;
  paper?: string;
  inkA?: string;
  inkB?: string;
  /** 0 = sparse ink, 0.15 = heavy ink */
  density?: number;
  /** 0 = ink everywhere, 1 = keep the left side clear for text */
  clear?: number;
  /** Seek the still frame used for reduced motion and screenshots. */
  stillTime?: number;
}

export function InkField({
  className,
  paper = '#f2eee6',
  inkA = '#ff5c1f',
  inkB = '#2f4ec2',
  density = 0.04,
  clear = 0.9,
  stillTime = 38,
}: InkFieldProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 1.75), alpha: false });
    const gl = renderer.gl;
    gl.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(gl.canvas);

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: stillTime },
        uRes: { value: [1, 1] },
        uPointer: { value: [0.62, 0.45] },
        uPaper: { value: hexToVec3(paper) },
        uInkA: { value: hexToVec3(inkA) },
        uInkB: { value: hexToVec3(inkB) },
        uDensity: { value: density },
        uClear: { value: clear },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      renderer.setSize(Math.max(1, width), Math.max(1, height));
      program.uniforms.uRes.value = [gl.canvas.width, gl.canvas.height];
      renderer.render({ scene: mesh });
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const params = new URLSearchParams(window.location.search);
    const reduced =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('still');

    // Pointer target is eased so the ink drags rather than snaps.
    const target = [0.62, 0.45];
    const onMove = (e: PointerEvent) => {
      const b = host.getBoundingClientRect();
      target[0] = (e.clientX - b.left) / b.width;
      target[1] = 1 - (e.clientY - b.top) / b.height;
    };

    let raf = 0;
    let visible = true;
    const start = performance.now() - stillTime * 1000;
    const loop = (now: number) => {
      const ptr = program.uniforms.uPointer.value as number[];
      ptr[0] += (target[0] - ptr[0]) * 0.04;
      ptr[1] += (target[1] - ptr[1]) * 0.04;
      program.uniforms.uTime.value = (now - start) / 1000;
      renderer.render({ scene: mesh });
      raf = requestAnimationFrame(loop);
    };
    const play = () => {
      if (!raf && visible && !document.hidden && !reduced) raf = requestAnimationFrame(loop);
    };
    const pause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) play();
      else pause();
    });
    io.observe(host);
    const onVisibility = () => (document.hidden ? pause() : play());
    document.addEventListener('visibilitychange', onVisibility);
    if (!reduced) window.addEventListener('pointermove', onMove, { passive: true });
    host.dataset.motion = reduced ? 'still' : 'live';
    play();

    return () => {
      pause();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onMove);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      gl.canvas.remove();
    };
  }, [paper, inkA, inkB, density, clear, stillTime]);

  return <div ref={ref} aria-hidden className={className} style={{ position: 'absolute', inset: 0 }} />;
}
