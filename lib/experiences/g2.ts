import type { Experience } from './types';

/* Group g2: filled by its builder. Each entry's component lives in components/experiences/<id>.tsx */
export const experiences: Experience[] = [
  {
    id: 'dither-wave',
    title: 'Dither Wave',
    blurb:
      'A razor-crisp two-tone dither field drawn only in Bayer dots: switch the pattern, the source and the pixel size to see how ordered dithering turns light into dots.',
    tools: ['ogl', 'glsl', 'gsap'],
    stage: 'mono',
    kind: 'shader',
    source: 'components/experiences/dither-wave.tsx',
    load: () => import('@/components/experiences/dither-wave'),
  },
  {
    id: 'liquid-gradient',
    title: 'Gradient Lab',
    blurb:
      'Big colour as a lab: a displaced silk mesh, domain-warped ink, a predawn horizon, a prismatic orb, fluted glass and stochastic grain, with GSAP morphing every uniform between numbered presets.',
    tools: ['threejs', 'r3f', 'glsl', 'gsap'],
    stage: 'colour',
    kind: 'shader',
    source: 'components/experiences/liquid-gradient.tsx',
    load: () => import('@/components/experiences/liquid-gradient'),
  },
  {
    id: 'glass-lens',
    title: 'Liquid Lens',
    blurb:
      'A wobbling liquid-glass lens follows the cursor over a wall of scrolling type, magnifying and bending the words into thin-film fringes; switch to a square colour lens, fluted glass or a real transmission disc.',
    tools: ['threejs', 'r3f', 'drei', 'glsl', 'gsap'],
    stage: 'colour',
    kind: 'shader',
    source: 'components/experiences/glass-lens.tsx',
    load: () => import('@/components/experiences/glass-lens'),
  },
  {
    id: 'light-painting',
    title: 'Light Painting',
    blurb:
      'Glossy neon tubes swoop after the pointer over thin long-exposure bands while thousands of curl-noise threads carry the colour on, ending in a radial burst; click to change the palette.',
    tools: ['threejs', 'r3f', 'postprocessing', 'glsl', 'gsap', 'canvas2d'],
    stage: 'colour',
    kind: 'shader',
    source: 'components/experiences/light-painting.tsx',
    load: () => import('@/components/experiences/light-painting'),
  },
  {
    id: 'crt-signal-lost',
    title: 'Signal Lost',
    blurb:
      'An isometric line-art CRT workstation streams code until the signal dies: pixel-crushed rows, RGB split and a static-filled brush X over NO SIGNAL, then a datamosh drags old pixels until the picture returns.',
    tools: ['threejs', 'r3f', 'drei', 'glsl', 'gsap', 'canvas2d'],
    stage: 'win95',
    kind: 'shader',
    source: 'components/experiences/crt-signal-lost.tsx',
    load: () => import('@/components/experiences/crt-signal-lost'),
  },
];
