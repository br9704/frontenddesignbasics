import { createProgress, type ProgressStore } from './runtime';

export type ActStage = 'win95' | 'mono' | 'colour';

export interface ActDef {
  n: string;
  id: string;
  title: string;
  stage: ActStage;
}

/** The ten acts. The rail, the section ids and the progress stores all come from this list. */
export const ACTS: ActDef[] = [
  { n: '00', id: 'boot', title: 'BOOT', stage: 'win95' },
  { n: '01', id: 'blast', title: 'BLAST', stage: 'win95' },
  { n: '02', id: 'cube', title: 'CUBE', stage: 'mono' },
  { n: '03', id: 'tools', title: 'TOOLS', stage: 'mono' },
  { n: '04', id: 'make', title: 'MAKE', stage: 'mono' },
  { n: '05', id: 'motion', title: 'MOTION', stage: 'colour' },
  { n: '06', id: 'inspiration', title: 'INSPO', stage: 'colour' },
  { n: '07', id: 'sites', title: 'SITES', stage: 'colour' },
  { n: '08', id: 'learn', title: 'LEARN', stage: 'colour' },
  { n: '09', id: 'colour', title: 'COLOUR', stage: 'colour' },
];

/** One progress store per act (0..1 across its scroll length). Extra stores for sub-beats. */
export const P: Record<string, ProgressStore> = Object.fromEntries(ACTS.map((a) => [a.id, createProgress(0)]));

/** Padding that keeps act content clear of the fixed left rail on desktop. */
export const PAD = 'px-4 sm:px-6 lg:pl-[136px] lg:pr-10';

/**
 * A pinned act: the section is tall, the stage sticks under the 48px nav. With reduced motion the
 * section collapses to its content and nothing pins.
 */
export const pinSection = 'relative motion-reduce:!h-auto';
export const pinStage = 'sticky top-12 h-[calc(100svh-3rem)] overflow-hidden motion-reduce:static motion-reduce:h-auto motion-reduce:min-h-[calc(100svh-3rem)]';
