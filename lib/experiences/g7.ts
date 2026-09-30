import type { Experience } from './types';

/* Group g7 (v3): the teaching pieces for easing, blur and transitions. Components in components/experiences/<id>.tsx */
export const experiences: Experience[] = [
  {
    id: 'ease-racetrack',
    title: 'Ease Racetrack',
    blurb: 'Twelve eases race the same distance in the same time, applied to position, scale, blur and clip; click a lane to copy its GSAP string.',
    tools: ['gsap', 'svg', 'css'],
    stage: 'mono',
    kind: 'motion-design',
    source: 'components/experiences/ease-racetrack.tsx',
    load: () => import('@/components/experiences/ease-racetrack'),
  },
  {
    id: 'blur-lab',
    title: 'Blur Lab',
    blurb: 'Six kinds of blur on one scene (gaussian, motion, radial, tilt-shift, frosted glass, progressive), each with when to use it and when never to.',
    tools: ['ogl', 'glsl', 'css', 'gsap'],
    stage: 'colour',
    kind: 'shader',
    source: 'components/experiences/blur-lab.tsx',
    load: () => import('@/components/experiences/blur-lab'),
  },
  {
    id: 'transition-deck',
    title: 'Transition Deck',
    blurb: 'Eight ways to get from one card to the next, from a 200ms crossfade to a shared-element FLIP and a pixel wipe, with which one to use when.',
    tools: ['gsap', 'css', 'svg'],
    stage: 'mono',
    kind: 'motion-design',
    source: 'components/experiences/transition-deck.tsx',
    load: () => import('@/components/experiences/transition-deck'),
  },
];
