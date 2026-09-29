import data from '@/data/examples.json';

export interface Example {
  id: string;
  name: string;
  url: string;
  by?: string;
  /** What this screenshot demonstrates for its section, written from the capture. */
  note: string;
  /** public path, e.g. /examples/type-klim.jpg (captured with scripts/example-shot.ts) */
  image: string;
}

/** Real-site examples keyed by guide section (typography, colour, motion, 3d, …). */
export const examples = data as Record<string, Example[]>;
