/*
 * pnpm journey:gif  (needs the site running; BASE_URL=... to use the live site)
 * Scrolls the home journey from top to bottom, capturing frames, then encodes
 * public/banners/journey.gif (the README preview) and public/banners/journey-poster.jpg.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const FRAMES = Number(process.env.FRAMES ?? 90);
const W = 1280;
const H = 720;
const TMP = '.journey-frames';

async function main() {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  // Warm-up pass: scroll the whole page once so every lazy experience has loaded before recording.
  for (let y = 0; y <= total; y += 700) {
    await page.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' as ScrollBehavior }), y);
    await page.waitForTimeout(450);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2500);
  for (let i = 0; i < FRAMES; i++) {
    // ease-in-out through the page so each act gets screen time
    const t = i / (FRAMES - 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.wheel(0, 0);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }), Math.round(eased * total));
    await page.waitForTimeout(260);
    await page.screenshot({ path: `${TMP}/f${String(i).padStart(3, '0')}.png` });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'public/banners/journey-poster.jpg', type: 'jpeg', quality: 85 });
  await browser.close();

  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-framerate', '12', '-i', `${TMP}/f%03d.png`,
    '-vf', 'scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    'public/banners/journey.gif',
  ]);
  await rm(TMP, { recursive: true, force: true });
  console.log('wrote public/banners/journey.gif and journey-poster.jpg');
}

main();
