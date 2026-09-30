'use client';

/*
 * Neon Block City
 * An isometric night city of blocks whose streets are neon light paths. It opens dark; a lamp bar
 * scales open, then light travels down every street and into the glass seams of the ground.
 * A neon sign flickers like a failing tube; click it for sparks. Coloured lights follow the pointer
 * and linger behind it in the street grid. Progress (or a slow drift) moves the camera.
 */
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ExperienceProps } from '@/lib/experiences/types';
import { cssFont, G1Bar, GLSL_HASH, GLSL_HSV, GLSL_SNOISE, loadFont, StillFrames } from './g1-shared';

const TOOLS = ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'gsap', 'canvas2d'];
const PAL = ['#ff2e00', '#ff00a8', '#7b2cff', '#00b3ff', '#00e676', '#ffe600'];
const LOTS = 7;
const P = 2.8; // lot pitch
const HALF = ((LOTS - 1) / 2) * P;
const BG = '#07060d';
const SIGN_Y = 7.6;

type Drive = { on: number; lamp: number; windows: number; heads: number[]; pan: number; pointer: THREE.Vector3; pointerAt: number };

/* ─────────── buildings ─────────── */

const buildVert = /* glsl */ `
attribute vec3 aColor;
attribute float aSeed;
varying vec3 vLocal;
varying vec3 vScale;
varying vec3 vN;
varying vec3 vColor;
varying float vSeed;
void main() {
  vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vLocal = position;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vColor = aColor;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`;
const buildFrag = /* glsl */ `
uniform float uOn;
uniform float uWindows;
uniform float uTime;
uniform vec3 uViewDir;
varying vec3 vLocal;
varying vec3 vScale;
varying vec3 vN;
varying vec3 vColor;
varying float vSeed;
${GLSL_HASH}
void main() {
  vec3 an = abs(vN);
  vec2 f;
  vec2 fs;
  if (an.y > 0.5) { f = vLocal.xz; fs = vScale.xz; }
  else if (an.x > 0.5) { f = vec2(vLocal.z, vLocal.y - 0.5); fs = vScale.zy; }
  else { f = vec2(vLocal.x, vLocal.y - 0.5); fs = vScale.xy; }
  vec2 dEdge = (0.5 - abs(f)) * fs;
  float e = min(dEdge.x, dEdge.y);
  float rim = 1.0 - smoothstep(0.0, 0.03 + fwidth(e), e);
  float fres = pow(1.0 - abs(dot(vN, uViewDir)), 2.5);
  vec3 core = vec3(0.018, 0.016, 0.035) * (an.y > 0.5 ? 1.6 : (an.x > 0.5 ? 1.0 : 0.7));
  vec3 col = mix(core, vColor * 0.22, fres * uOn);
  if (an.y < 0.5) {
    vec2 wp = (f + 0.5) * fs;
    vec2 grid = vec2(0.26, 0.3);
    vec2 cell = floor(wp / grid);
    vec2 lc = fract(wp / grid);
    float win = step(0.28, lc.x) * step(lc.x, 0.72) * step(0.3, lc.y) * step(lc.y, 0.72);
    win *= step(0.12, dEdge.x) * step(0.1, dEdge.y);
    float h = hash12(cell + vSeed * 17.0);
    float lit = step(0.7, h) * smoothstep(h * 0.8, h * 0.8 + 0.1, uWindows);
    float flick = 0.7 + 0.3 * sin(uTime * (0.4 + h) + h * 40.0);
    col += win * lit * mix(vec3(1.0, 0.86, 0.55), vColor, 0.45) * 0.8 * flick;
  }
  col += vColor * rim * (0.12 + 2.2 * uOn);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ─────────── ground: glass panes lit by lights, streets and wet glints ─────────── */

const groundVert = /* glsl */ `
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const groundFrag = /* glsl */ `
uniform vec3 uLightPos[6];
uniform vec3 uLightCol[6];
uniform vec3 uPal[6];
uniform float uOn;
uniform float uTime;
varying vec3 vWorld;
${GLSL_HASH}
float glints(vec2 p, float t) {
  vec2 i = p;
  float c = 1.0;
  float inten = 0.006;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(clamp(c, 0.0, 1.0), 8.0);
}
void main() {
  vec2 p = vWorld.xz;
  // distance to the nearest street centre line, and which street
  vec2 q = mod(p, ${P.toFixed(2)}) - ${(P / 2).toFixed(2)};
  vec2 sd2 = abs(q);
  float sd = min(sd2.x, sd2.y);
  vec2 sid = floor(p / ${P.toFixed(2)});
  float which = sd2.x < sd2.y ? sid.x : sid.y + 7.0;
  vec3 sc = uPal[int(mod(abs(which) * 5.0, 6.0))];

  // glass panes and their seams
  vec2 pane = abs(fract(p / 0.7) - 0.5);
  float seam = 1.0 - smoothstep(0.455, 0.49, max(pane.x, pane.y));
  seam = 1.0 - seam;
  seam = smoothstep(0.0, 1.0, seam);
  float edge = smoothstep(0.44, 0.5, max(pane.x, pane.y));

  vec3 light = vec3(0.0);
  for (int k = 0; k < 6; k++) {
    // sample just past the pane edge so seams catch the light first
    vec2 lp = uLightPos[k].xz;
    float d = length(p - lp);
    float g = exp(-d * d / 0.45);
    float tail = 1.0 / (1.0 + 2.0 * d);
    light += uLightCol[k] * (g * 0.5 + tail * 0.05 + pow(g, 4.0) * 0.8);
  }
  float streetGlow = exp(-sd * sd / 0.006) * uOn;
  float wet = smoothstep(0.55, 0.15, sd);

  vec3 col = vec3(0.012, 0.01, 0.022);
  col += light * (0.1 + edge * 0.9);
  col += sc * streetGlow * (0.22 + edge * 0.4);
  col += sc * wet * uOn * 0.025 * (0.4 + edge);
  col += vec3(0.7, 0.8, 1.0) * glints(p * 1.1, uTime * 0.35) * wet * uOn * 0.25;
  col = 1.0 - exp(-col * 1.2);
  float fade = smoothstep(${(HALF + P * 1.6).toFixed(2)}, ${(HALF - P * 0.4).toFixed(2)}, max(abs(p.x), abs(p.y)));
  col *= fade;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ─────────── streets: tubes with a travelling band ─────────── */

const tubeVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const tubeFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uHead;
uniform float uTime;
uniform float uSpeed;
uniform float uOffset;
varying vec2 vUv;
void main() {
  float x = vUv.x;
  float lit = smoothstep(uHead, uHead - 0.02, x);
  float pulse = pow(fract(x * 2.0 - uTime * uSpeed + uOffset), 14.0);
  float head = exp(-pow((x - uHead) * 30.0, 2.0)) * step(uHead, 0.999);
  vec3 col = uColor * (lit * (0.45 + 2.6 * pulse) + head * 4.0);
  col += vec3(1.0) * pulse * lit * 0.5;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ─────────── sign ─────────── */

const signFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uOn;
uniform float uHue;
varying vec2 vUv;
${GLSL_SNOISE}
${GLSL_HSV}
void main() {
  float a = texture2D(uMap, vUv).r;
  float n = snoise(vec3(uTime * 2.2, 0.0, 0.0));
  float n2 = snoise(vec3(uTime * 13.0, 3.0, 0.0));
  float fl = 1.0 + 1.5 * pow(max(n, 0.0), 3.0) * 3.0 + step(0.82, n2) * 2.5;
  a = pow(a, fl) * uOn;
  vec3 col = hsv2rgb(vec3(uHue, 1.0 - a, 1.0)) * a * 1.6;
  gl_FragColor = vec4(col, a);
}
`;

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 400;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  const font = `italic 300 170px ${cssFont('--font-display', 'Georgia, serif')}`;
  const draw = (blur: number, alpha: number) => {
    ctx.save();
    ctx.filter = blur ? `blur(${blur}px)` : 'none';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font;
    ctx.fillText('open late', 512, 200);
    ctx.restore();
  };
  draw(60, 1);
  draw(60, 0.8);
  draw(14, 0.9);
  draw(0, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/* ─────────── scene ─────────── */

function rand(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function City({ drive, running }: { drive: React.RefObject<Drive>; running: boolean }) {
  const { camera, size } = useThree();
  const time = useRef(0);
  const viewDir = useMemo(() => new THREE.Vector3(1, 0.9, 1).normalize(), []);

  // buildings
  const { geo, mat, count, mats } = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mats: THREE.Matrix4[] = [];
    const colors: number[] = [];
    const seeds: number[] = [];
    const tmp = new THREE.Object3D();
    let s = 1;
    for (let i = 0; i < LOTS; i++)
      for (let j = 0; j < LOTS; j++) {
        const cx = i * P - HALF;
        const cz = j * P - HALF;
        const centre = 1 - Math.hypot(cx, cz) / (HALF * 1.5);
        if (rand(s++) < 0.12) continue;
        const split = rand(s++) < 0.35;
        const parts = split ? 2 : 1;
        for (let k = 0; k < parts; k++) {
          const w = split ? 0.85 + rand(s++) * 0.25 : 1.4 + rand(s++) * 0.55;
          const d = 1.4 + rand(s++) * 0.55;
          const h = 0.5 + Math.pow(rand(s++), 1.6) * 2.6 + Math.max(0, centre) * 1.6;
          const ox = split ? (k === 0 ? -0.55 : 0.55) : 0;
          tmp.position.set(cx + ox, 0, cz);
          tmp.scale.set(w, h, d);
          tmp.updateMatrix();
          mats.push(tmp.matrix.clone());
          const c = new THREE.Color(PAL[Math.floor(rand(s++) * PAL.length)]);
          colors.push(c.r, c.g, c.b);
          seeds.push(rand(s++) * 10);
        }
      }
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: buildVert,
      fragmentShader: buildFrag,
      uniforms: { uOn: { value: 0 }, uWindows: { value: 0 }, uTime: { value: 0 }, uViewDir: { value: viewDir } },
    });
    return { geo, mat, count: mats.length, mats };
  }, [viewDir]);
  const inst = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = inst.current;
    if (!m) return;
    mats.forEach((mt, i) => m.setMatrixAt(i, mt));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [mats]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  // ground
  const groundMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: groundVert,
        fragmentShader: groundFrag,
        uniforms: {
          uLightPos: { value: Array.from({ length: 6 }, () => new THREE.Vector3(0, 0, 0)) },
          uLightCol: { value: PAL.map((c) => new THREE.Color(c)) },
          uPal: { value: PAL.map((c) => new THREE.Color(c)) },
          uOn: { value: 0 },
          uTime: { value: 0 },
        },
      }),
    [],
  );
  useEffect(() => () => groundMat.dispose(), [groundMat]);
  const lights = useMemo(() => Array.from({ length: 6 }, (_, i) => new THREE.Vector3(Math.cos(i) * 3, 0, Math.sin(i) * 3)), []);

  // streets
  const streets = useMemo(() => {
    const out: { geo: THREE.TubeGeometry; mat: THREE.ShaderMaterial }[] = [];
    const ext = HALF + P * 0.9;
    for (let k = 0; k < LOTS - 1; k++) {
      const v = (k + 0.5) * P - HALF;
      for (const dir of [0, 1]) {
        const a = dir ? new THREE.Vector3(v, 0.05, -ext) : new THREE.Vector3(-ext, 0.05, v);
        const b = dir ? new THREE.Vector3(v, 0.05, ext) : new THREE.Vector3(ext, 0.05, v);
        const curve = new THREE.CatmullRomCurve3([a, a.clone().lerp(b, 0.5), b]);
        const geo = new THREE.TubeGeometry(curve, 96, 0.05, 6, false);
        const idx = out.length;
        const mat = new THREE.ShaderMaterial({
          vertexShader: tubeVert,
          fragmentShader: tubeFrag,
          uniforms: {
            uColor: { value: new THREE.Color(PAL[(idx * 5) % PAL.length]).multiplyScalar(1.2) },
            uHead: { value: 0 },
            uTime: { value: 0 },
            uSpeed: { value: 0.12 + ((k + 1) / LOTS) * 0.22 },
            uOffset: { value: rand(idx + 3) },
          },
        });
        out.push({ geo, mat });
      }
    }
    return out;
  }, []);
  useEffect(
    () => () =>
      streets.forEach((s) => {
        s.geo.dispose();
        s.mat.dispose();
      }),
    [streets],
  );

  // sign, lamp bar and sparks
  const [signTex, setSignTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let dead = false;
    let t: THREE.Texture | null = null;
    loadFont(`italic 300 170px ${cssFont('--font-display', 'serif')}`).then(() => {
      if (dead) return;
      t = signTexture();
      setSignTex(t);
    });
    return () => {
      dead = true;
      t?.dispose();
    };
  }, []);
  const signMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: tubeVert,
        fragmentShader: signFrag,
        uniforms: { uMap: { value: null }, uTime: { value: 0 }, uOn: { value: 0 }, uHue: { value: 0.55 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  );
  useEffect(() => {
    signMat.uniforms.uMap.value = signTex;
  }, [signTex, signMat]);
  useEffect(() => () => signMat.dispose(), [signMat]);
  const billboard = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.Mesh>(null);
  const lampGlow = useRef<THREE.Mesh>(null);

  const sparks = useMemo(() => {
    const N = 108;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3).fill(-999);
    const col = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 3.5,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const vel = new Float32Array(N * 3);
    const life = new Float32Array(N);
    return { geo, mat, pos, col, vel, life, N, group: 0 };
  }, []);
  useEffect(
    () => () => {
      sparks.geo.dispose();
      sparks.mat.dispose();
    },
    [sparks],
  );

  const burst = (at: THREE.Vector3) => {
    const g = sparks.group;
    sparks.group = (g + 1) % 6;
    const tint = [new THREE.Color('#ffe600'), new THREE.Color('#ffffff'), new THREE.Color('#00b3ff')];
    for (let i = g * 18; i < g * 18 + 18; i++) {
      sparks.pos.set([at.x + (Math.random() - 0.5) * 0.6, at.y, at.z + (Math.random() - 0.5) * 0.6], i * 3);
      sparks.vel.set([(Math.random() - 0.5) * 0.09, Math.random() * 0.07 + 0.02, (Math.random() - 0.5) * 0.09], i * 3);
      sparks.life[i] = 1;
      const c = tint[i % 3];
      sparks.col.set([c.r, c.g, c.b], i * 3);
    }
  };

  useFrame((_, dt) => {
    const d = drive.current;
    if (!d) return;
    const step = running ? Math.min(dt, 0.05) : 0;
    time.current += step;
    const t = time.current;

    mat.uniforms.uOn.value = d.on;
    mat.uniforms.uWindows.value = d.windows;
    mat.uniforms.uTime.value = t;
    groundMat.uniforms.uOn.value = d.on;
    groundMat.uniforms.uTime.value = t;
    streets.forEach((s, i) => {
      s.mat.uniforms.uHead.value = d.heads[i] ?? 0;
      s.mat.uniforms.uTime.value = t;
    });

    // pointer lights: the first follows the pointer (or wanders), the rest trail behind it
    const idle = t - d.pointerAt > 2.5;
    const target = idle ? new THREE.Vector3(Math.sin(t * 0.37) * HALF * 0.7, 0, Math.sin(t * 0.23 + 1) * Math.cos(t * 0.19) * HALF * 0.7) : d.pointer;
    if (running) {
      const k = 1 - Math.pow(0.001, step);
      lights[0].lerp(target, Math.min(1, k * 2.2));
      for (let i = 1; i < 6; i++) lights[i].lerp(lights[i - 1], Math.min(1, k * 1.4));
    } else {
      // composed still: the six lights fanned along a diagonal street
      lights.forEach((l, i) => l.set(-4 + i * 1.7, 0, 2.2 - i * 1.1));
    }
    groundMat.uniforms.uLightPos.value.forEach((v: THREE.Vector3, i: number) => v.copy(lights[i]));
    const lc = groundMat.uniforms.uLightCol.value as THREE.Color[];
    lc.forEach((c, i) => c.set(PAL[i]).multiplyScalar(0.3 + d.on * 0.9));

    signMat.uniforms.uTime.value = running ? t : 1.3;
    signMat.uniforms.uOn.value = d.on > 0 ? Math.min(1, d.lamp * 1.2) : 0;
    if (lamp.current) lamp.current.scale.x = 0.4 + 0.6 * d.lamp;
    if (lampGlow.current) {
      lampGlow.current.scale.x = 0.4 + 0.6 * d.lamp;
      (lampGlow.current.material as THREE.MeshBasicMaterial).opacity = 0.35 * d.lamp;
    }
    (lamp.current?.material as THREE.MeshBasicMaterial | undefined)?.color.set('#e6f7ff').multiplyScalar(0.3 + 2.2 * d.lamp);

    // sparks under gravity
    if (running) {
      for (let i = 0; i < sparks.N; i++) {
        if (sparks.life[i] <= 0) continue;
        sparks.vel[i * 3 + 1] -= 0.0032;
        sparks.pos[i * 3] += sparks.vel[i * 3];
        sparks.pos[i * 3 + 1] += sparks.vel[i * 3 + 1];
        sparks.pos[i * 3 + 2] += sparks.vel[i * 3 + 2];
        sparks.life[i] -= step * 0.55;
        if (sparks.pos[i * 3 + 1] < 0.02) {
          sparks.pos[i * 3 + 1] = 0.02;
          sparks.vel[i * 3 + 1] *= -0.35;
          sparks.vel[i * 3] *= 0.6;
          sparks.vel[i * 3 + 2] *= 0.6;
        }
        const l = Math.max(0, sparks.life[i]);
        for (let c = 0; c < 3; c++) sparks.col[i * 3 + c] = Math.min(1, sparks.col[i * 3 + c] * 0.995) * (l > 0 ? 1 : 0);
        if (l <= 0) sparks.pos[i * 3 + 1] = -999;
      }
      sparks.geo.attributes.position.needsUpdate = true;
      sparks.geo.attributes.color.needsUpdate = true;
    }

    // camera: iso, panning along the diagonal with progress (or a slow drift)
    const cam = camera as THREE.OrthographicCamera;
    const pan = d.pan;
    const look = new THREE.Vector3(pan * 0.7, 2.9, -pan * 0.7);
    cam.position.copy(look).addScaledVector(viewDir, 40);
    cam.lookAt(look);
    const aspect = size.width / size.height;
    const needW = aspect < 1 ? 19.5 : 26;
    const needH = aspect < 1 ? 26 : 19;
    cam.zoom = Math.min(size.width / needW, size.height / needH);
    cam.updateProjectionMatrix();
    if (billboard.current) billboard.current.quaternion.copy(cam.quaternion);
  });

  const onGround = (e: ThreeEvent<PointerEvent>) => {
    if (!running || !drive.current) return;
    drive.current.pointer.copy(e.point).setY(0);
    drive.current.pointerAt = time.current;
  };
  const onSign = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    burst(e.point.clone());
  };

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={groundMat} onPointerMove={onGround}>
        <planeGeometry args={[HALF * 2 + P * 4, HALF * 2 + P * 4]} />
      </mesh>
      {streets.map((s, i) => (
        <mesh key={i} geometry={s.geo} material={s.mat} />
      ))}
      <instancedMesh ref={inst} args={[geo, mat, count]} />
      <group ref={billboard} position={[0, SIGN_Y, 0]}>
        <mesh ref={lamp} position={[0, 1.55, 0]} renderOrder={10}>
          <planeGeometry args={[6.2, 0.07]} />
          <meshBasicMaterial color="#e6f7ff" toneMapped={false} depthTest={false} />
        </mesh>
        <mesh ref={lampGlow} position={[0, 0.9, -0.01]} renderOrder={9}>
          <planeGeometry args={[7, 1.4]} />
          <meshBasicMaterial
            color="#00b3ff"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            depthTest={false}
            alphaMap={lampAlpha()}
          />
        </mesh>
        <mesh material={signMat} onClick={onSign} renderOrder={10}>
          <planeGeometry args={[7.2, 2.8]} />
        </mesh>
      </group>
      <points geometry={sparks.geo} material={sparks.mat} frustumCulled={false} />
    </>
  );
}

let lampTex: THREE.Texture | null = null;
function lampAlpha() {
  if (lampTex) return lampTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 64);
  const h = ctx.createLinearGradient(0, 0, 128, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)');
  h.addColorStop(0.25, 'rgba(0,0,0,0)');
  h.addColorStop(0.75, 'rgba(0,0,0,0)');
  h.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 128, 64);
  lampTex = new THREE.CanvasTexture(c);
  return lampTex;
}

export default function NeonBlockCity({ active, reducedMotion, progress }: ExperienceProps) {
  const running = active && !reducedMotion;
  const drive = useRef<Drive>({
    on: 0,
    lamp: 0,
    windows: 0,
    heads: Array.from({ length: (LOTS - 1) * 2 }, () => 0),
    pan: 0,
    pointer: new THREE.Vector3(),
    pointerAt: -99,
  });
  const tl = useRef<gsap.core.Timeline | null>(null);
  const drift = useRef<gsap.core.Tween | null>(null);
  const started = useRef(false);

  // the switch-on
  useEffect(() => {
    const d = drive.current;
    if (reducedMotion) {
      tl.current?.kill();
      d.on = 1;
      d.lamp = 1;
      d.windows = 1;
      d.heads.fill(1);
      return;
    }
    if (!active || started.current) return;
    started.current = true;
    const t = gsap.timeline({ delay: 0.5 });
    t.to(d, { lamp: 1, duration: 0.9, ease: 'power3.out' });
    t.set(d, { on: 0.001 }, 0);
    t.to(d, { on: 1, duration: 1.8, ease: 'power2.inOut' }, 0.6);
    d.heads.forEach((_, i) => {
      const o = { v: 0 };
      t.to(o, { v: 1, duration: 1.1, ease: 'power2.in', onUpdate: () => (d.heads[i] = o.v) }, 0.7 + i * 0.16);
    });
    t.to(d, { windows: 1, duration: 2.6, ease: 'none' }, 1.2);
    tl.current = t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion]);

  useEffect(() => {
    const t = tl.current;
    if (!t) return;
    if (running) t.resume();
    else t.pause();
  }, [running]);

  // camera pan: parent progress, else a slow drift
  useEffect(() => {
    drift.current?.kill();
    if (progress !== undefined) {
      gsap.to(drive.current, { pan: (progress - 0.5) * 9, duration: reducedMotion ? 0 : 0.6, ease: 'power3.out' });
      return;
    }
    if (reducedMotion) {
      drive.current.pan = 0;
      return;
    }
    drift.current = gsap.fromTo(drive.current, { pan: -2.2 }, { pan: 2.2, duration: 22, ease: 'sine.inOut', yoyo: true, repeat: -1, paused: !running });
    return () => {
      drift.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, reducedMotion]);
  useEffect(() => {
    if (running) drift.current?.resume();
    else drift.current?.pause();
  }, [running]);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: BG }}>
      <Canvas
        orthographic
        dpr={[1, 1.75]}
        frameloop={running ? 'always' : 'demand'}
        camera={{ position: [30, 28, 30], zoom: 40, near: 0.1, far: 200 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => gl.setClearColor(BG, 1)}
      >
        <City drive={drive} running={running} />
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.3} luminanceSmoothing={0.3} radius={0.65} />
        </EffectComposer>
        <StillFrames running={running} />
      </Canvas>
      <G1Bar title="Neon Block City" tools={TOOLS} hint="move to light the streets · click the sign" />
    </div>
  );
}
