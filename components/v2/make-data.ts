import type { ComponentType } from 'react';
import { experiences as registry } from '@/lib/experiences';
import type { ExperienceProps, Kind, Stage } from '@/lib/experiences/types';

/*
 * The catalogue every collection page reads: the registry (lib/experiences) merged with the planned
 * journey list, so a card exists for every experience even before its builder lands it. A registry
 * entry always wins; a planned-only entry has no `load` and renders as "in progress".
 */

export interface CatalogEntry {
  id: string;
  title: string;
  blurb: string;
  tools: string[];
  stage: Stage;
  kind: Kind;
  source?: string;
  load?: () => Promise<{ default: ComponentType<ExperienceProps> }>;
  /** index in the home journey (planned list order); Infinity when not on home */
  order: number;
  /** built only for /make, not a home act */
  makeOnly: boolean;
}

/** Home journey order. Anything in the registry that is not here sorts after, flagged [make only]. */
const PLANNED: Array<Pick<CatalogEntry, 'id' | 'title' | 'tools' | 'stage' | 'kind'>> = [
  { id: 'win95-boot', title: 'Win95 Boot', tools: ['gsap', 'css', 'canvas2d'], stage: 'win95', kind: 'retro' },
  { id: 'win95-desktop', title: 'Win95 Desktop', tools: ['css', 'gsap', 'canvas2d'], stage: 'win95', kind: 'interaction' },
  { id: 'pipes-screensaver', title: '3D Pipes', tools: ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'gsap'], stage: 'win95', kind: 'retro' },
  { id: 'crt-signal-lost', title: 'Signal Lost', tools: ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'gsap', 'canvas2d'], stage: 'win95', kind: 'shader' },
  { id: 'pixel-blast', title: 'Pixel Blast', tools: ['threejs', 'postprocessing', 'glsl', 'canvas2d', 'gsap'], stage: 'win95', kind: 'retro' },
  { id: 'pixel-to-hd-cube', title: 'Pixel to HD', tools: ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'gsap'], stage: 'mono', kind: '3d' },
  { id: 'voxel-type-assembly', title: 'Type Blocks', tools: ['threejs', 'r3f', 'drei', 'glsl', 'gsap', 'canvas2d'], stage: 'mono', kind: '3d' },
  { id: 'ascii-3d', title: 'Shape-Aware ASCII', tools: ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'canvas2d', 'gsap'], stage: 'mono', kind: '3d' },
  { id: 'ascii-cursor-field', title: 'ASCII Field', tools: ['canvas2d', 'svg', 'css', 'gsap'], stage: 'mono', kind: 'interaction' },
  { id: 'tool-blocks', title: 'Tool Blocks', tools: ['r3f', 'drei', 'postprocessing', 'glsl', 'gsap', 'canvas2d', 'svg'], stage: 'mono', kind: '3d' },
  { id: 'dither-wave', title: 'Dither Wave', tools: ['ogl', 'glsl', 'gsap'], stage: 'mono', kind: 'shader' },
  { id: 'flying-type', title: 'Flying Type', tools: ['r3f', 'drei', 'glsl', 'gsap', 'lenis', 'canvas2d'], stage: 'mono', kind: 'type' },
  { id: 'wave-extrude-type', title: 'Wave Extrude Type', tools: ['r3f', 'drei', 'glsl', 'gsap', 'svg'], stage: 'mono', kind: 'type' },
  { id: 'type-vortex', title: 'Type Vortex', tools: ['r3f', 'drei', 'canvas2d', 'svg', 'gsap', 'lenis', 'glsl'], stage: 'mono', kind: 'motion-design' },
  { id: 'easing-lab', title: 'Easing Lab', tools: ['gsap', 'svg', 'canvas2d', 'css'], stage: 'mono', kind: 'motion-design' },
  { id: 'pinned-chapters', title: 'Pinned Chapters', tools: ['gsap', 'lenis', 'svg', 'css', 'r3f', 'glsl'], stage: 'mono', kind: 'scroll' },
  { id: 'flip-bento', title: 'Flip Bento', tools: ['gsap', 'css', 'next-image'], stage: 'mono', kind: 'motion-design' },
  { id: 'site-wall-3d', title: 'Reference Hall', tools: ['r3f', 'drei', 'glsl', 'gsap', 'next-image'], stage: 'colour', kind: '3d' },
  { id: 'velocity-gallery', title: 'Unwoven Gallery', tools: ['threejs', 'r3f', 'glsl', 'gsap', 'lenis', 'next-image', 'canvas2d'], stage: 'colour', kind: 'scroll' },
  { id: 'halftone-develop', title: 'Halftone Develop', tools: ['ogl', 'glsl', 'gsap', 'next-image'], stage: 'colour', kind: 'shader' },
  { id: 'glass-lens', title: 'Liquid Lens', tools: ['r3f', 'drei', 'postprocessing', 'glsl', 'gsap'], stage: 'colour', kind: 'shader' },
  { id: 'kinetic-poster', title: 'Kinetic Poster', tools: ['r3f', 'drei', 'glsl', 'gsap', 'lenis', 'canvas2d', 'css'], stage: 'colour', kind: 'motion-design' },
  { id: 'circuit-board', title: 'Circuit Board', tools: ['svg', 'css', 'gsap', 'ogl', 'glsl'], stage: 'colour', kind: 'motion-design' },
  { id: 'liquid-gradient', title: 'Gradient Lab', tools: ['r3f', 'drei', 'ogl', 'glsl', 'gsap'], stage: 'colour', kind: 'shader' },
  { id: 'neon-block-city', title: 'Neon Block City', tools: ['threejs', 'r3f', 'drei', 'postprocessing', 'ogl', 'glsl', 'gsap', 'canvas2d'], stage: 'colour', kind: '3d' },
  { id: 'crystal-type-rings', title: 'Zero to One', tools: ['threejs', 'r3f', 'drei', 'postprocessing', 'glsl', 'canvas2d', 'gsap'], stage: 'colour', kind: '3d' },
  { id: 'page-transitions', title: 'Page Transitions', tools: ['r3f', 'drei', 'ogl', 'glsl', 'gsap', 'css', 'svg'], stage: 'colour', kind: 'motion-design' },
  { id: 'event-horizon', title: 'Event Horizon', tools: ['threejs', 'r3f', 'glsl', 'gsap'], stage: 'colour', kind: 'shader' },
  { id: 'colour-riot', title: 'Colour Riot', tools: ['threejs', 'r3f', 'postprocessing', 'ogl', 'glsl', 'gsap'], stage: 'colour', kind: 'generative' },
  { id: 'light-painting', title: 'Light Painting', tools: ['r3f', 'drei', 'postprocessing', 'ogl', 'glsl', 'gsap', 'canvas2d'], stage: 'colour', kind: 'shader' },
];

/** Built for /make only; these are not home acts. */
export const MAKE_ONLY = new Set(['light-painting', 'droste-zoom']);

const plannedIndex = new Map(PLANNED.map((p, i) => [p.id, i]));

export const catalog: CatalogEntry[] = (() => {
  const byId = new Map<string, CatalogEntry>();
  for (const p of PLANNED) {
    byId.set(p.id, {
      ...p,
      blurb: 'In progress. The builder is still putting this one together.',
      order: MAKE_ONLY.has(p.id) ? Infinity : plannedIndex.get(p.id)!,
      makeOnly: MAKE_ONLY.has(p.id),
    });
  }
  for (const e of registry) {
    byId.set(e.id, {
      id: e.id,
      title: e.title,
      blurb: e.blurb,
      tools: e.tools,
      stage: e.stage,
      kind: e.kind,
      source: e.source,
      load: e.load,
      order: MAKE_ONLY.has(e.id) ? Infinity : (plannedIndex.get(e.id) ?? Infinity),
      makeOnly: MAKE_ONLY.has(e.id) || !plannedIndex.has(e.id),
    });
  }
  return [...byId.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
})();

export function getEntry(id: string) {
  return catalog.find((e) => e.id === id);
}

/** Touches the GPU: goes through the live budget. Everything else is DOM and plays while in view. */
const GL_TOOLS = new Set(['threejs', 'r3f', 'drei', 'postprocessing', 'ogl', 'glsl']);
export function isGL(e: Pick<CatalogEntry, 'tools'>) {
  return e.tools.some((t) => GL_TOOLS.has(t));
}

export const KINDS: Kind[] = ['3d', 'shader', 'type', 'motion-design', 'scroll', 'interaction', 'layout', 'retro', 'generative'];
export const STAGES: Stage[] = ['win95', 'mono', 'colour'];

/** Plain techniques: not toolkit entries, listed under /tools#techniques. */
export const TECHNIQUES: Array<{ id: string; name: string; what: string }> = [
  { id: 'css', name: 'CSS', what: 'Transforms, grid, clip-path, blend modes and view transitions. No library needed.' },
  { id: 'svg', name: 'SVG', what: 'Paths, masks, filters and stroke-dash drawing, animated with GSAP or CSS.' },
  { id: 'glsl', name: 'GLSL', what: 'Fragment and vertex shaders: the maths that draws every pixel on the GPU.' },
  { id: 'canvas2d', name: 'Canvas 2D', what: 'Immediate-mode drawing for glyph atlases, dithering, particles and textures.' },
  { id: 'next-image', name: 'next/image', what: 'Sized, lazy, responsive images with a tiny placeholder that resolves to HD.' },
  { id: 'r3f', name: 'React Three Fiber', what: 'three.js as React components. The host for every 3D piece here.' },
  { id: 'drei', name: 'drei', what: 'Helpers for R3F: Text, AsciiRenderer, Instances, MeshTransmissionMaterial, View.' },
  { id: 'postprocessing', name: 'postprocessing', what: 'Pixelation, glitch, chromatic aberration, bloom and custom screen effects.' },
];

export const GITHUB_BLOB = 'https://github.com/br9704/frontenddesignbasics/blob/main/';

/** Tool ids to the experiences that use them, in journey order. Computed, so it never drifts. */
export function experiencesUsing(toolId: string) {
  const ids = TOOL_ALIASES[toolId] ?? [toolId];
  return catalog.filter((e) => e.tools.some((t) => ids.includes(t)));
}

/** R3F, drei and postprocessing are all three.js underneath, so they count for the three.js row. */
const TOOL_ALIASES: Record<string, string[]> = {
  threejs: ['threejs', 'r3f', 'drei', 'postprocessing'],
};

/** The how-to that teaches each experience's core trick. Falls back to the how-to index. */
const HOWTO: Record<string, string> = {
  'pixel-to-hd-cube': 'pixel-to-hd',
  'voxel-type-assembly': 'instanced-blocks',
  'tool-blocks': 'instanced-blocks',
  'neon-block-city': 'instanced-blocks',
  'ascii-3d': 'ascii-and-dither',
  'ascii-cursor-field': 'ascii-and-dither',
  'dither-wave': 'ascii-and-dither',
  'halftone-develop': 'ascii-and-dither',
  'crt-signal-lost': 'post-processing-stack',
  'pixel-blast': 'post-processing-stack',
  'pipes-screensaver': 'post-processing-stack',
  'kinetic-poster': 'kinetic-type-and-posters',
  'flying-type': 'kinetic-type-and-posters',
  'wave-extrude-type': 'kinetic-type-and-posters',
  'type-vortex': 'kinetic-type-and-posters',
  'crystal-type-rings': 'kinetic-type-and-posters',
  'flip-bento': 'flip-layouts-and-page-transitions',
  'page-transitions': 'flip-layouts-and-page-transitions',
  'easing-lab': 'pick-an-ease',
  'win95-boot': 'pick-an-ease',
  'win95-desktop': 'progress-driven-components',
  'pinned-chapters': 'scroll-without-hijacking',
  'velocity-gallery': 'images-at-scale',
  'site-wall-3d': 'images-at-scale',
  'circuit-board': 'draw-and-morph-svg',
  'light-painting': 'neon-light-paths',
  'liquid-gradient': 'make-colour-look-expensive',
  'colour-riot': 'make-colour-look-expensive',
  'glass-lens': 'make-colour-look-expensive',
  'event-horizon': 'post-processing-stack',
};

export function howToHref(id: string) {
  return HOWTO[id] ? `/docs/how-to/${HOWTO[id]}` : '/docs/how-to';
}
