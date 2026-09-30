import type { Experience } from './types';
import { experiences as g1 } from './g1';
import { experiences as g2 } from './g2';
import { experiences as g3 } from './g3';
import { experiences as g4 } from './g4';
import { experiences as g5 } from './g5';
import { experiences as g6 } from './g6';
import { experiences as g7 } from './g7';
import { experiences as g8 } from './g8';

export type { Experience, ExperienceProps, Kind, Stage } from './types';

/** Every experience on the site, in group order. */
export const experiences: Experience[] = [...g1, ...g2, ...g3, ...g4, ...g5, ...g6, ...g7, ...g8];

export function getExperience(id: string): Experience | undefined {
  return experiences.find((e) => e.id === id);
}
