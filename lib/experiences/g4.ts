import type { Experience } from './types';

/* Group g4: scroll stories, galleries and transitions. Each component lives in components/experiences/<id>.tsx */
export const experiences: Experience[] = [
  {
    id: 'pinned-chapters',
    title: 'Pinned Chapters',
    blurb:
      'A pinned mono story: cling film ripples over a giant headline, then each chapter plate opens through SVG blinds while the narration lights up word by word.',
    tools: ['gsap', 'lenis', 'svg', 'css', 'r3f', 'glsl'],
    stage: 'mono',
    kind: 'scroll',
    source: 'components/experiences/pinned-chapters.tsx',
    load: () => import('@/components/experiences/pinned-chapters'),
  },
  {
    id: 'velocity-gallery',
    title: 'Unwoven Gallery',
    blurb:
      'An endless strip of portrait cards made of 26 threads each: clean in the centre, unravelling and bleaching towards the edges, and the faster you scroll the more it comes undone.',
    tools: ['threejs', 'r3f', 'glsl', 'gsap', 'lenis', 'next-image', 'canvas2d'],
    stage: 'colour',
    kind: 'scroll',
    source: 'components/experiences/velocity-gallery.tsx',
    load: () => import('@/components/experiences/velocity-gallery'),
  },
  {
    id: 'type-vortex',
    title: 'Type Vortex',
    blurb:
      'An endless dive down a funnel of spinning type rings that wrap to the back as you pass them, framed by a crisp SVG ring headline, with an ASCII tunnel variant.',
    tools: ['r3f', 'drei', 'canvas2d', 'svg', 'gsap', 'lenis', 'glsl'],
    stage: 'mono',
    kind: 'motion-design',
    source: 'components/experiences/type-vortex.tsx',
    load: () => import('@/components/experiences/type-vortex'),
  },
  {
    id: 'flip-bento',
    title: 'Flip Bento',
    blurb:
      'A mono bento of type and dithered images: a full-bleed hero scrubs back into its cell, any tile flies into a detail view and back, then the grid becomes an endless scatter.',
    tools: ['gsap', 'css', 'next-image'],
    stage: 'mono',
    kind: 'motion-design',
    source: 'components/experiences/flip-bento.tsx',
    load: () => import('@/components/experiences/flip-bento'),
  },
  {
    id: 'page-transitions',
    title: 'Page Transitions',
    blurb:
      'Ten pages in giant single-colour type, each reached by a different route transition: paper that tears, blinds, iris, wipes, a Blackout blob and image planes that glide to their new slots.',
    tools: ['ogl', 'glsl', 'gsap', 'css', 'svg'],
    stage: 'colour',
    kind: 'motion-design',
    source: 'components/experiences/page-transitions.tsx',
    load: () => import('@/components/experiences/page-transitions'),
  },
];
