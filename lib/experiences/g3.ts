import type { Experience } from './types';

/* Group g3: filled by its builder. Each entry's component lives in components/experiences/<id>.tsx */
export const experiences: Experience[] = [
  {
    id: 'flying-type',
    title: 'Flying Type',
    blurb:
      'Four mono type beats in one WebGL scene: a torn title that resolves, thin caps that bend with scroll speed, a word that echoes into depth and marquee bands that melt at a seam.',
    tools: ['r3f', 'drei', 'glsl', 'gsap', 'lenis', 'canvas2d'],
    stage: 'mono',
    kind: 'type',
    source: 'components/experiences/flying-type.tsx',
    load: () => import('@/components/experiences/flying-type'),
  },
  {
    id: 'circuit-board',
    title: 'Circuit Board',
    blurb:
      'A laser powers up a CPU chip, then light pulses run along SVG traces over a shifting contour map; flip on kintsugi and molten gold cracks spread across the board.',
    tools: ['svg', 'css', 'gsap', 'ogl', 'glsl'],
    stage: 'colour',
    kind: 'motion-design',
    source: 'components/experiences/circuit-board.tsx',
    load: () => import('@/components/experiences/circuit-board'),
  },
  {
    id: 'easing-lab',
    title: 'Easing Lab',
    blurb:
      'One move under six eases with their curves, a spring mesh against a tween, and toolkit tiles (GSAP, three.js, OGL, Spline...) that swell near the cursor over a field of iron-filing dashes: how motion feels, in black and white.',
    tools: ['gsap', 'svg', 'canvas2d', 'css'],
    stage: 'mono',
    kind: 'motion-design',
    source: 'components/experiences/easing-lab.tsx',
    load: () => import('@/components/experiences/easing-lab'),
  },
  {
    id: 'kinetic-poster',
    title: 'Kinetic Poster',
    blurb:
      'A full-bleed type poster: sliced rows of NOISE / ADDICT slide at seeded speeds around a wobbling fresnel blob, then letters melt into powder and a wall of type waves in depth. Click to change the palette.',
    tools: ['r3f', 'drei', 'glsl', 'gsap', 'lenis', 'canvas2d', 'css'],
    stage: 'colour',
    kind: 'motion-design',
    source: 'components/experiences/kinetic-poster.tsx',
    load: () => import('@/components/experiences/kinetic-poster'),
  },
  {
    id: 'wave-extrude-type',
    title: 'Wave Extrude Type',
    blurb:
      'Solid 3D letters seen from an isometric angle: each extrusion bends like a ribbon as a sine wave rolls letter by letter, and the deep ends dissolve into the paper through a grainy airbrush fade.',
    tools: ['r3f', 'drei', 'glsl', 'gsap', 'svg'],
    stage: 'mono',
    kind: 'type',
    source: 'components/experiences/wave-extrude-type.tsx',
    load: () => import('@/components/experiences/wave-extrude-type'),
  },
];
