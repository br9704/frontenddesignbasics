import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Ids with a poster in public/posters/<id>.webp, read on the server so the client never 404s. */
export function posterIds(): string[] {
  try {
    return readdirSync(join(process.cwd(), 'public', 'posters'))
      .filter((f) => f.endsWith('.webp'))
      .map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}
