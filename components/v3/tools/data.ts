import toolkit from '@/toolkit/toolkit.json';
import jobsData from '@/data/jobs.json';
import { TECHNIQUES } from '@/lib/techniques';
import { getExperience } from '@/lib/experiences';

/* The "what for what" data: data/jobs.json checked against toolkit.json and the experience registry. */

export interface Alternative {
  id: string;
  when: string;
}

export interface Job {
  id: string;
  chip: string;
  job: string;
  default: string[];
  why: string;
  alternatives: Alternative[];
  see: string[];
  note?: string;
  feature?: { id: string; text: string };
  links?: Array<{ href: string; label: string }>;
}

type Tool = (typeof toolkit.tools)[number] & { image?: string };

const TOOLS = new Map((toolkit.tools as Tool[]).map((t) => [t.id, t]));
const BLOCKS = new Map<string, (typeof TECHNIQUES)[number]>(TECHNIQUES.map((t) => [t.id, t]));

export function getTool(id: string): Tool | undefined {
  return TOOLS.get(id);
}

/** True for a toolkit id or a building-block technique (both have an anchor on /tools). */
export function isKnown(id: string) {
  return TOOLS.has(id) || BLOCKS.has(id);
}

/** Short display name: "Motion (motion.dev)" reads as "Motion". */
export function toolName(id: string) {
  const name = TOOLS.get(id)?.name ?? BLOCKS.get(id)?.name ?? id;
  return name.replace(/\s*\(.*\)\s*$/, '');
}

/** Jobs with unknown tool ids dropped, so a chip never points at an anchor that isn't there. */
export const JOBS: Job[] = (jobsData.jobs as Job[]).map((j) => ({
  ...j,
  default: j.default.filter((id) => TOOLS.has(id)),
  alternatives: j.alternatives.filter((a) => TOOLS.has(a.id)),
}));

/** Only experiences that exist in the registry and have a poster get a "see it" card. */
export function seeIt(ids: string[], posters: Set<string>) {
  return ids.flatMap((id) => {
    const e = getExperience(id);
    return e && posters.has(id) ? [{ id, title: e.title }] : [];
  });
}
