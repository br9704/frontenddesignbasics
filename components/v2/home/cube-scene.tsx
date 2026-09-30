'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { EffectComposer, Pixelation } from '@react-three/postprocessing';
import type { PixelationEffect } from 'postprocessing';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CUBE_VIEW } from './act-blast';
import type { ProgressStore } from './runtime';
import { span } from './runtime';

/*
 * The signature moment. One scene:
 *  - a wireframe cube where act 01's tiles landed,
 *  - 296 surface voxels that close their gaps while a Pixelation pass steps 48px → 1px,
 *  - a smooth, lit, high-def rounded cube that takes over,
 *  - then the voxels leave the cube and spell MAKE, TOOLS, LOOK, come back, and the camera
 *    pushes through the face.
 * Behind it, dither-wave breathes at 12% as a background quad in the same scene.
 */

const N = 8;
const SIZE = CUBE_VIEW.size;
const VOX = SIZE / N;

const FONT: Record<string, string[]> = {
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
};
const WORDS = ['MAKE', 'TOOLS', 'LOOK'];
const PITCH = 0.16;

function wordPoints(word: string) {
  const pts: [number, number, number][] = [];
  const cols = word.length * 6 - 1;
  [...word].forEach((ch, li) => {
    FONT[ch].forEach((row, y) =>
      [...row].forEach((bit, x) => {
        if (bit !== '1') return;
        const px = (li * 6 + x - (cols - 1) / 2) * PITCH;
        const py = (3 - y) * PITCH;
        pts.push([px, py, PITCH * 0.5], [px, py, -PITCH * 0.5]);
      }),
    );
  });
  return { pts, width: cols * PITCH };
}

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const frag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  vec2 uv = vUv;
  float w = 0.5 + 0.5 * sin(uv.x * 9.0 + uTime * 0.7 + sin(uv.y * 6.0 - uTime * 0.4) * 1.6);
  w *= 0.35 + 0.65 * (0.5 + 0.5 * sin(uv.y * 4.0 + uTime * 0.3));
  float b = bayer8(gl_FragCoord.xy / 3.0);
  float v = step(b, w * 0.85);
  gl_FragColor = vec4(vec3(1.0), v * uOpacity);
}`;

function Scene({ store, reduced, staticP, onPx }: { store: ProgressStore; reduced: boolean; staticP: number; onPx?: (px: number) => void }) {
  const inst = useRef<THREE.InstancedMesh>(null);
  const hd = useRef<THREE.Mesh>(null);
  const hdMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const wire = useRef<THREE.LineSegments>(null);
  const pix = useRef<PixelationEffect>(null);
  const bg = useRef<THREE.ShaderMaterial>(null);
  const lastPx = useRef(-1);
  const { camera, size } = useThree();

  const data = useMemo(() => {
    const cube: THREE.Vector3[] = [];
    for (let x = 0; x < N; x++)
      for (let y = 0; y < N; y++)
        for (let z = 0; z < N; z++) {
          if (x > 0 && x < N - 1 && y > 0 && y < N - 1 && z > 0 && z < N - 1) continue;
          cube.push(new THREE.Vector3((x - (N - 1) / 2) * VOX, (y - (N - 1) / 2) * VOX, (z - (N - 1) / 2) * VOX));
        }
    const words = WORDS.map(wordPoints);
    const rnd = cube.map((_, i) => {
      const r = Math.sin(i * 91.7 + 3.1) * 43758.5453;
      return r - Math.floor(r);
    });
    return { cube, words, rnd };
  }, []);

  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE, SIZE, SIZE)), []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uOpacity: { value: 0.03 } }), []);
  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), qc: new THREE.Quaternion(), qi: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() }),
    [],
  );

  useFrame((state) => {
    const p = reduced ? staticP : store.get();
    const t = state.clock.elapsedTime;
    if (bg.current) bg.current.uniforms.uTime.value = reduced ? 2 : t;

    // stepped pixel size 48 → 1
    const steps = [48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1];
    const r = span(p, 0.03, 0.4);
    const px = r >= 1 ? 1 : steps[Math.min(steps.length - 1, Math.floor(r * steps.length))];
    if (pix.current) pix.current.granularity = px <= 1 ? 0 : px;
    if (px !== lastPx.current) {
      lastPx.current = px;
      onPx?.(px);
    }

    // cube rotation: starts exactly where act 01 drew it, then turns with scroll
    const spin = span(p, 0.06, 1) * Math.PI * 1.4;
    const rx = CUBE_VIEW.rx + Math.sin(spin * 0.5) * 0.12;
    const ry = CUBE_VIEW.ry + spin;
    tmp.e.set(rx, ry, 0);

    // wireframe hands over from the blast
    if (wire.current) {
      wire.current.rotation.copy(tmp.e);
      (wire.current.material as THREE.LineBasicMaterial).opacity = 1 - span(p, 0.06, 0.16);
      wire.current.visible = p < 0.16;
    }

    // HD cube
    const hdIn = span(p, 0.34, 0.42);
    const hdOut = span(p, 0.46, 0.52);
    const hdBack = span(p, 0.86, 0.92);
    const hdScale = Math.max(0.0001, hdIn > 0 ? 1 - hdOut + hdBack : 1);
    if (hd.current && hdMat.current) {
      hd.current.rotation.copy(tmp.e);
      hd.current.scale.setScalar(Math.min(1, hdScale));
      hdMat.current.opacity = hdIn;
      hd.current.visible = hdIn > 0 && hdScale > 0.01;
    }

    // voxels
    const m = inst.current;
    if (m) {
      const vIn = 1;
      const gap = 0.42 * (1 - span(p, 0.05, 0.4));
      const vw = size.width / size.height;
      const visW = 2 * CUBE_VIEW.camZ * Math.tan((CUBE_VIEW.fov * Math.PI) / 360) * vw;
      const phases: [number, number, number, number][] = [
        // [start, end, from, to] where -1 = cube, 0..2 = word index
        [0.46, 0.58, -1, 0],
        [0.6, 0.7, 0, 1],
        [0.72, 0.82, 1, 2],
        [0.84, 0.91, 2, -1],
      ];
      let from = -1;
      let to = -1;
      let k = 0;
      for (const [a, b, f, tt] of phases) {
        if (p >= a) {
          from = f;
          to = tt;
          k = span(p, a, b);
        }
      }
      tmp.qc.setFromEuler(tmp.e);
      const pos = (which: number, i: number, out: THREE.Vector3) => {
        if (which === -1) return out.copy(data.cube[i]).applyEuler(tmp.e);
        const w = data.words[which];
        const sc = Math.min(1, (visW * 0.72) / w.width);
        if (i < w.pts.length) return out.set(w.pts[i][0] * sc, w.pts[i][1] * sc + 0.1, w.pts[i][2] * sc);
        return out.set(0, 0, -2).applyEuler(tmp.e);
      };
      const scaleOf = (which: number, i: number) => {
        if (which === -1) return 1;
        const w = data.words[which];
        return i < w.pts.length ? Math.min(1, (visW * 0.72) / w.width) * (PITCH / VOX) : 0;
      };
      for (let i = 0; i < data.cube.length; i++) {
        const l = span(k * 1.35 - data.rnd[i] * 0.35, 0, 1);
        const e = l < 0.5 ? 4 * l * l * l : 1 - Math.pow(-2 * l + 2, 3) / 2;
        pos(from, i, tmp.a);
        pos(to, i, tmp.b);
        tmp.c.lerpVectors(tmp.a, tmp.b, e);
        // a little arc so blocks fly rather than slide
        tmp.c.z += Math.sin(e * Math.PI) * (0.6 + data.rnd[i]);
        const sA = scaleOf(from, i);
        const sB = scaleOf(to, i);
        const s = (sA + (sB - sA) * e) * VOX * (1 - gap) * Math.min(1, vIn * 1.5 + data.rnd[i] * vIn);
        tmp.q.copy(from === -1 ? tmp.qc : tmp.qi).slerp(to === -1 ? tmp.qc : tmp.qi, e);
        tmp.s.setScalar(Math.max(s, 0.00001));
        tmp.m.compose(tmp.c, tmp.q, tmp.s);
        m.setMatrixAt(i, tmp.m);
      }
      m.instanceMatrix.needsUpdate = true;
      m.visible = vIn > 0 && !(hdIn >= 1 && (p < 0.46 || p > 0.92));
    }

    // camera push through the face
    const push = span(p, 0.9, 0.99);
    camera.position.z = CUBE_VIEW.camZ - Math.pow(push, 1.6) * (CUBE_VIEW.camZ - 0.2);
    camera.updateProjectionMatrix();
  });

  return (
    <>
      <color attach="background" args={['#080808']} />
      <mesh position={[0, 0, -4]}>
        <planeGeometry args={[40, 24]} />
        <shaderMaterial ref={bg} vertexShader={vert} fragmentShader={frag} uniforms={uniforms} transparent depthWrite={false} />
      </mesh>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 5]} intensity={2.4} />
      <directionalLight position={[-4, -2, 2]} intensity={0.6} />
      <pointLight position={[0, 0, 0]} intensity={3} distance={3} />
      <lineSegments ref={wire} geometry={edges}>
        <lineBasicMaterial color="#f5f5f5" transparent />
      </lineSegments>
      <instancedMesh ref={inst} args={[undefined, undefined, 296]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.55} metalness={0.05} />
      </instancedMesh>
      <RoundedBox ref={hd} args={[SIZE, SIZE, SIZE]} radius={0.09} smoothness={8} creaseAngle={0.4}>
        <meshPhysicalMaterial ref={hdMat} color="#f2f2f2" roughness={0.18} metalness={0.05} clearcoat={1} clearcoatRoughness={0.1} transparent side={THREE.DoubleSide} />
      </RoundedBox>
      <EffectComposer multisampling={0}>
        <Pixelation ref={pix} granularity={48} />
      </EffectComposer>
    </>
  );
}

export default function CubeScene({
  store,
  reduced,
  active,
  onPx,
}: {
  store: ProgressStore;
  reduced: boolean;
  active: boolean;
  onPx?: (px: number) => void;
}) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={reduced ? 'demand' : active ? 'always' : 'never'}
      camera={{ position: [0, 0, CUBE_VIEW.camZ], fov: CUBE_VIEW.fov, near: 0.05, far: 50 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <Scene store={store} reduced={reduced} staticP={0.44} onPx={onPx} />
    </Canvas>
  );
}
