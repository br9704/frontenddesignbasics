/*
 * pnpm posters  (needs the site running; BASE_URL=... to override)
 * For every experience: open /lab/<id>, let it render, and save a 16:10 still to
 * public/posters/<id>.webp (used by /make, /tools and home cards when a piece is not live)
 * and public/posters/<id>.jpg (used by the README, which renders on GitHub).
 * ONLY=<id>,<id> to redo a few.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { experiences } from '../lib/experiences';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ONLY = process.env.ONLY?.split(',');
const SETTLE = Number(process.env.SETTLE ?? 6500);

async function main() {
  await mkdir('public/posters', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  for (const e of experiences.filter((x) => !ONLY || ONLY.includes(x.id))) {
    try {
      await page.goto(`${BASE}/lab/${e.id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(SETTLE);
      await page.mouse.move(820, 360);
      await page.waitForTimeout(600);
      // hide the lab caption bar so the poster is just the piece
      await page.addStyleTag({ content: 'main > div.pointer-events-none{display:none!important}' });
      const png = `public/posters/${e.id}.png`;
      await page.screenshot({ path: png });
      execFileSync('cwebp', ['-quiet', '-q', '78', '-resize', '960', '0', png, '-o', `public/posters/${e.id}.webp`]);
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '960', png, '--out', `public/posters/${e.id}.jpg`], { stdio: 'ignore' });
      execFileSync('rm', [png]);
      console.log('poster', e.id);
    } catch (err) {
      console.warn('FAILED', e.id, (err as Error).message.split('\n')[0]);
    }
  }
  await browser.close();
}

main();
