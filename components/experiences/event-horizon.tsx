'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { BuiltWith } from '@/components/v2/experience-frame';

/*
 * Event Horizon: a raymarched Schwarzschild black hole.
 *  - Rays bend with Verlet steps under a = -1.5 h² p / r⁵ (units: Schwarzschild radius = 1).
 *  - Each disk-plane crossing is shaded with a Novikov-Thorne temperature profile, Doppler beaming
 *    and fbm streaks that orbit at the Keplerian rate.
 *  - Escaped rays read a star sphere (PCG cell hashing, no sin) and our wordmark on an equirect
 *    canvas texture that stays behind the hole, so the type bends into an Einstein ring.
 *  - The march runs at half resolution into a float target; a second pass upsamples, adds a cheap
 *    glow, tone maps and grains it.
 */

const TOOLS = ['threejs', 'r3f', 'glsl', 'gsap'];

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const rayFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uTilt;
uniform float uYaw;
uniform float uSpin;
uniform float uReveal;
uniform float uMono;
uniform sampler2D uWord;

const float ISCO = 3.0;
const float ROUT = 13.0;

uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3(vec3 p) { return vec3(pcg3d(uvec3(ivec3(floor(p)) + 32768))) / float(0xffffffffu); }

float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash3(i).x, b = hash3(i + vec3(1,0,0)).x, c = hash3(i + vec3(0,1,0)).x, d = hash3(i + vec3(1,1,0)).x;
  float e = hash3(i + vec3(0,0,1)).x, f1 = hash3(i + vec3(1,0,1)).x, g = hash3(i + vec3(0,1,1)).x, h = hash3(i + vec3(1,1,1)).x;
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y), mix(mix(e,f1,u.x), mix(g,h,u.x), u.y), u.z);
}
float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  mat3 m = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = m * p * 2.03; a *= 0.5; }
  return v;
}

vec3 ramp(float t) {
  vec3 deep = vec3(0.30, 0.06, 0.01);
  vec3 amber = vec3(1.00, 0.42, 0.08);
  vec3 gold = vec3(1.00, 0.80, 0.50);
  vec3 hot = vec3(1.00, 0.97, 0.92);
  vec3 c = mix(deep, amber, smoothstep(0.0, 0.35, t));
  c = mix(c, gold, smoothstep(0.3, 0.7, t));
  c = mix(c, hot, smoothstep(0.65, 1.1, t));
  return mix(c, vec3(dot(c, vec3(0.3, 0.55, 0.15))), uMono);
}

vec4 disk(vec3 p, vec3 dir) {
  float r = length(p.xz);
  float x = (r - ISCO) / (ROUT - ISCO);
  // Novikov-Thorne: T^4 ~ (1 - sqrt(isco / r)) / r^3, peak near r = 4.08
  float T = pow(max(1e-5, (1.0 - sqrt(ISCO / r)) / (r * r * r)), 0.25) / 0.2087;
  float ang = atan(p.z, p.x);
  float omega = pow(r, -1.5);
  float phi = ang - uTime * uSpin * omega * 6.0;
  vec3 np = vec3(cos(phi) * 2.2, sin(phi) * 2.2, r * 1.6);
  float streak = fbm(np * vec3(1.0, 1.0, 1.0) + vec3(0.0, 0.0, uTime * 0.02));
  float fine = fbm(vec3(cos(phi) * 5.0, sin(phi) * 5.0, r * 3.5));
  float s = smoothstep(0.18, 0.85, streak) * (0.55 + 0.6 * fine);
  // Doppler beaming: Keplerian speed, photon heads to camera = -dir
  vec3 t = normalize(vec3(-p.z, 0.0, p.x));
  float beta = sqrt(0.5 / r) * 0.92;
  float gamma = inversesqrt(1.0 - beta * beta);
  float D = 1.0 / (gamma * (1.0 - beta * dot(t, -dir)));
  float g = sqrt(max(0.0, 1.0 - 1.0 / r));
  float I = T * D * D * D * g;
  float edge = smoothstep(0.0, 0.06, x) * (1.0 - smoothstep(0.55, 1.0, x));
  float reveal = 1.0 - smoothstep(uReveal * 1.25 - 0.25, uReveal * 1.25, x);
  float bright = I * s * edge * reveal;
  vec3 col = ramp(clamp(I * 0.62 * (0.6 + 0.5 * s), 0.0, 1.3)) * bright * 2.1;
  float a = clamp(bright * 1.6, 0.0, 0.94);
  return vec4(col, a);
}

vec3 stars(vec3 d) {
  vec3 c = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float sc = l == 0 ? 42.0 : 110.0;
    vec3 p = d * sc;
    vec3 cell = floor(p);
    vec3 h = hash3(cell + float(l) * 91.0);
    vec3 sp = cell + 0.2 + 0.6 * h;
    float dist = length(p - sp);
    float on = step(0.82, h.z);
    float tw = 0.7 + 0.3 * h.y;
    c += vec3(1.0, 0.93, 0.85) * on * tw * smoothstep(0.16, 0.0, dist) * (l == 0 ? 1.2 : 0.6);
  }
  return c;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  // Keep the whole disk in frame on tall screens.
  float zoom = uRes.x < uRes.y ? 1.0 + 0.55 * (uRes.y / uRes.x - 1.0) : 1.0;
  uv *= zoom;

  float dist = 36.0;
  vec3 ro = dist * vec3(cos(uTilt) * sin(uYaw), sin(uTilt), cos(uTilt) * cos(uYaw));
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * 1.55 + uv.x * rt + uv.y * up);

  vec3 pos = ro;
  vec3 vel = rd;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  bool escaped = false;

  for (int i = 0; i < 200; i++) {
    float r = length(pos);
    float dt = clamp(0.07 * r, 0.03, 1.4);
    vec3 acc = -1.5 * h2 * pos / pow(r, 5.0);
    vec3 prev = pos;
    pos += vel * dt + 0.5 * acc * dt * dt;
    float r2 = length(pos);
    vec3 acc2 = -1.5 * h2 * pos / pow(r2, 5.0);
    vel += 0.5 * (acc + acc2) * dt;
    if (prev.y * pos.y < 0.0) {
      float f = prev.y / (prev.y - pos.y);
      vec3 p = mix(prev, pos, f);
      float rr = length(p.xz);
      if (rr > ISCO && rr < ROUT) {
        vec4 d = disk(p, normalize(vel));
        col += (1.0 - alpha) * d.rgb;
        alpha += (1.0 - alpha) * d.a;
      }
    }
    if (r2 < 1.0) { alpha = 1.0; break; }
    if (r2 > 60.0 && dot(pos, vel) > 0.0) { escaped = true; break; }
    if (alpha > 0.985) break;
  }

  if (escaped) {
    vec3 d = normalize(vel);
    vec3 bg = stars(d);
    // wordmark sphere lives in camera space: always behind the hole
    vec3 cd = vec3(dot(d, rt), dot(d, up), dot(d, fw));
    vec2 eq = vec2(atan(cd.x, cd.z) / 6.28318 + 0.5, asin(clamp(cd.y, -1.0, 1.0)) / 3.14159 + 0.5);
    float w = texture2D(uWord, eq).r;
    vec3 wc = mix(vec3(1.0, 0.88, 0.72), vec3(1.0), uMono);
    bg += wc * w * 0.7;
    col += (1.0 - alpha) * bg;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const outFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uTime;
uniform float uGrain;
float h(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236;
    vec2 o = vec2(cos(a), sin(a));
    glow += texture2D(uTex, vUv + o * uTexel * 7.0).rgb + texture2D(uTex, vUv + o * uTexel * 18.0).rgb * 0.6;
  }
  c += max(glow / 19.2 - 0.25, 0.0) * 0.55;
  c = 1.0 - exp(-c * 1.35);
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.9;
  c += (h(gl_FragCoord.xy + fract(uTime) * 311.0) - 0.5) * 0.016 * uGrain;
  gl_FragColor = vec4(pow(max(c, 0.0), vec3(0.4545)), 1.0);
}`;

// Portrait screens stack the words above and below the hole so each one lands inside the frame
// (the texture spans 360 x 180 degrees: 2048 px of height is 180 degrees).
function makeWordmark(portrait = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4096;
  c.height = 2048;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  const draw = (family: string) => {
    const g = c.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (portrait) {
      g.font = `italic 400 50px ${family}`;
      g.fillText('frontend', 2048, 935);
      g.fillText('design', 2048, 1105);
      g.font = `400 22px 'Web IBM VGA 8x16', monospace`;
      g.fillText('B A S I C S', 2048, 1152);
    } else {
      g.font = `italic 400 64px ${family}`;
      g.fillText('frontend design', 2048, 1000);
      g.font = `400 26px 'Web IBM VGA 8x16', monospace`;
      g.fillText('B A S I C S', 2048, 1062);
    }
    tex.needsUpdate = true;
  };
  const css = getComputedStyle(document.body).getPropertyValue('--font-display').trim();
  const family = css ? `${css}, Georgia, serif` : 'Georgia, serif';
  draw(family);
  return tex;
}

function Hole({
  active,
  reducedMotion,
  state,
  onReady,
}: {
  active: boolean;
  reducedMotion: boolean;
  state: React.MutableRefObject<{ tilt: number; yaw: number; spin: number; reveal: number; mono: number; time: number }>;
  onReady: (redraw: () => void) => void;
}) {
  const { gl, size, invalidate } = useThree();
  const dpr = gl.getPixelRatio();
  const w = Math.max(2, Math.floor(size.width * dpr * 0.5));
  const h = Math.max(2, Math.floor(size.height * dpr * 0.5));
  const portrait = size.width < size.height;
  const fbo = useFBO(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });

  const word = useMemo(() => makeWordmark(), []);
  const { rayScene, outScene, rayMat, outMat, cam } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(2, 2);
    const rayMat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: rayFrag,
      uniforms: {
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uTilt: { value: 0.12 },
        uYaw: { value: 0 },
        uSpin: { value: 1 },
        uReveal: { value: 0 },
        uMono: { value: 0 },
        uWord: { value: word },
      },
      depthTest: false,
      depthWrite: false,
    });
    const outMat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: outFrag,
      uniforms: { uTex: { value: null }, uTexel: { value: new THREE.Vector2() }, uTime: { value: 0 }, uGrain: { value: 1 } },
      depthTest: false,
      depthWrite: false,
    });
    const rayScene = new THREE.Scene();
    const m1 = new THREE.Mesh(geo, rayMat);
    m1.frustumCulled = false;
    rayScene.add(m1);
    const outScene = new THREE.Scene();
    const m2 = new THREE.Mesh(geo, outMat);
    m2.frustumCulled = false;
    outScene.add(m2);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { rayScene, outScene, rayMat, outMat, cam };
  }, [word]);

  // Swap in a wordmark drawn with the loaded fonts, laid out for the current orientation.
  useEffect(() => {
    let alive = true;
    const css = getComputedStyle(document.body).getPropertyValue('--font-display').trim();
    const fam = css || 'Georgia';
    const swap = () => {
      if (!alive) return;
      const prev = rayMat.uniforms.uWord.value as THREE.Texture;
      rayMat.uniforms.uWord.value = makeWordmark(portrait);
      if (prev !== word) prev.dispose();
      invalidate();
    };
    swap();
    Promise.all([document.fonts.load(`italic 64px ${fam}`), document.fonts.load(`26px 'Web IBM VGA 8x16'`)])
      .catch(() => null)
      .then(swap);
    return () => {
      alive = false;
    };
  }, [portrait, rayMat, word, invalidate]);

  // Demand mode (reduced motion) never renders by itself: force frames once the canvas has its size,
  // FBO and compiled shader, and again whenever the size or the active state changes.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let n = 0;
    const kick = () => {
      invalidate();
      if (++n < 4) raf = requestAnimationFrame(kick);
    };
    kick();
    const t = window.setTimeout(() => invalidate(), 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [active, reducedMotion, w, h, fbo, invalidate]);

  useEffect(() => {
    onReady(() => invalidate());
    return () => {
      (rayMat.uniforms.uWord.value as THREE.Texture).dispose();
      word.dispose();
      rayMat.dispose();
      outMat.dispose();
      (rayScene.children[0] as THREE.Mesh).geometry.dispose();
    };
  }, [rayMat, outMat, rayScene, word, invalidate, onReady]);

  useFrame((_, delta) => {
    const s = state.current;
    if (!reducedMotion) s.time += Math.min(delta, 0.05);
    const u = rayMat.uniforms;
    u.uRes.value.set(w, h);
    u.uTime.value = s.time;
    u.uTilt.value = s.tilt;
    u.uYaw.value = s.yaw;
    u.uSpin.value = s.spin;
    u.uReveal.value = s.reveal;
    u.uMono.value = s.mono;
    gl.setRenderTarget(fbo);
    gl.render(rayScene, cam);
    gl.setRenderTarget(null);
    outMat.uniforms.uTex.value = fbo.texture;
    outMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    outMat.uniforms.uTime.value = s.time;
    outMat.uniforms.uGrain.value = reducedMotion ? 0 : 1;
    gl.render(outScene, cam);
  }, 1);

  return null;
}

export default function EventHorizon({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ tilt: 0.14, yaw: 0.35, spin: 1, reveal: 0, mono: 0, time: 14 });
  const target = useRef({ tilt: 0.14, yaw: 0.35 });
  const [mono, setMono] = useState(false);
  const redraw = useRef<() => void>(() => {});
  const entered = useRef(false);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const onReady = useMemo(
    () => (fn: () => void) => {
      redraw.current = fn;
    },
    [],
  );

  // Entry: the disk brightens outward from the inner edge.
  useEffect(() => {
    if (!active || entered.current) return;
    entered.current = true;
    if (reducedMotion) {
      state.current.reveal = 1;
      redraw.current();
      return;
    }
    gsap.fromTo(state.current, { reveal: 0.2 }, { reveal: 1, duration: 2.4, ease: 'expo.out' });
  }, [active, reducedMotion]);

  // The system preference arrives after mount: settle any running tween and draw the still.
  useEffect(() => {
    if (!reducedMotion) return;
    gsap.killTweensOf(state.current);
    Object.assign(state.current, { reveal: 1, spin: 1 });
    redraw.current();
  }, [reducedMotion]);

  // Mono preset.
  useEffect(() => {
    if (reducedMotion) {
      state.current.mono = mono ? 1 : 0;
      redraw.current();
    } else gsap.to(state.current, { mono: mono ? 1 : 0, duration: 0.8, ease: 'power2.inOut' });
  }, [mono, reducedMotion]);

  // Progress: edge-on to top-down.
  useEffect(() => {
    if (progress === undefined) return;
    target.current.tilt = 0.1 + progress * 1.2;
    if (reducedMotion) {
      state.current.tilt = target.current.tilt;
      redraw.current();
    }
  }, [progress, reducedMotion]);

  // Damped camera follow + slow yaw drift.
  useEffect(() => {
    if (!active || reducedMotion) return;
    const tick = (_t: number, dt: number) => {
      const s = state.current;
      const k = 1 - Math.exp(-dt / 220);
      if (!dragging.current) target.current.yaw += dt * 0.00003;
      s.tilt += (target.current.tilt - s.tilt) * k;
      s.yaw += (target.current.yaw - s.yaw) * k;
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [active, reducedMotion]);

  const onDown = (e: React.PointerEvent) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const el = host.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Hover over the wordmark (centre band) raises the disk's spin.
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    const over = Math.abs(nx) < 0.22 && Math.abs(ny) < 0.2;
    if (!reducedMotion) gsap.to(state.current, { spin: over ? 3.2 : 1, duration: 1.2, ease: 'power3.out', overwrite: 'auto' });
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    target.current.yaw -= dx * 0.005;
    target.current.tilt = Math.min(1.4, Math.max(0.03, target.current.tilt + dy * 0.004));
    if (reducedMotion) {
      state.current.yaw = target.current.yaw;
      state.current.tilt = target.current.tilt;
      redraw.current();
    }
  };
  const onUp = () => {
    dragging.current = false;
  };

  // Wheel inside the stage moves between edge-on and top-down (only when no parent drives progress).
  useEffect(() => {
    const el = host.current;
    if (!el || progress !== undefined) return;
    const onWheel = (e: WheelEvent) => {
      const t = target.current.tilt + e.deltaY * 0.0012;
      if ((t <= 0.03 && e.deltaY < 0) || (t >= 1.4 && e.deltaY > 0)) return;
      e.preventDefault();
      target.current.tilt = Math.min(1.4, Math.max(0.03, t));
      if (reducedMotion) {
        state.current.tilt = target.current.tilt;
        redraw.current();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [progress, reducedMotion]);

  return (
    <div
      ref={host}
      className="relative h-full w-full touch-pan-y select-none overflow-hidden bg-black"
      style={{ cursor: 'grab' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => !reducedMotion && gsap.to(state.current, { spin: 1, duration: 1.2, overwrite: 'auto' })}
    >
      <Canvas
        dpr={[1, 1.75]}
        frameloop={!active ? 'never' : reducedMotion ? 'demand' : 'always'}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Hole active={active} reducedMotion={reducedMotion} state={state} onReady={onReady} />
      </Canvas>

      <div className="pointer-events-none absolute top-3 left-3 max-w-[70%] sm:top-4 sm:left-4">
        <p className="pixel text-[16px] leading-[16px] text-white">EVENT HORIZON</p>
        <BuiltWith tools={TOOLS} className="pointer-events-auto mt-1 hidden sm:block" />
      </div>
      <div className="absolute top-3 right-3 flex gap-1 sm:top-4 sm:right-4" onPointerDown={(e) => e.stopPropagation()}>
        {(['amber', 'mono'] as const).map((k) => {
          const on = (k === 'mono') === mono;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setMono(k === 'mono')}
              className={`pixel border px-2 py-1 text-[16px] leading-[16px] ${
                on ? 'border-white bg-white text-black' : 'border-white/30 bg-black/50 text-white/70 hover:text-white'
              }`}
            >
              {k}
            </button>
          );
        })}
      </div>
      <p className="pixel pointer-events-none absolute right-3 bottom-16 text-[16px] leading-[16px] text-white/50 sm:right-4 sm:bottom-4">
        drag · scroll to tilt
      </p>
    </div>
  );
}
