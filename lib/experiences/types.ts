import type { ComponentType } from 'react';

/**
 * An experience: a small, self-contained piece of the site built by mixing tools from the toolkit.
 * Each one renders inside any container (card on /make, full screen on /lab/[id], an act on /).
 */
export interface ExperienceProps {
  /** true while on screen; stop rAF loops, timelines and canvases when false */
  active: boolean;
  /** user prefers reduced motion: render a composed still state, no loops */
  reducedMotion: boolean;
  /**
   * Optional 0..1 progress supplied by a parent (e.g. the home page scroll). When defined, drive the
   * experience from it instead of time or internal scroll. When undefined, run on your own.
   */
  progress?: number;
}

export type Stage = 'win95' | 'mono' | 'colour';
export type Kind = '3d' | 'shader' | 'type' | 'motion-design' | 'scroll' | 'interaction' | 'layout' | 'retro' | 'generative';

export interface Experience {
  id: string;
  title: string;
  /** one sentence: what you see and what it teaches */
  blurb: string;
  /** toolkit ids (toolkit/toolkit.json) plus plain techniques like 'css', 'svg', 'canvas2d', 'glsl' */
  tools: string[];
  stage: Stage;
  kind: Kind;
  /** repo path of the component, for the "view source" link */
  source: string;
  /** dynamic import of the component (default export) */
  load: () => Promise<{ default: ComponentType<ExperienceProps> }>;
}
