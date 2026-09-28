/*
 * pnpm verify  (needs the site on :3000)
 * 1. Motion: two hero frames ~1.5s apart must differ.
 * 2. Reduced motion: the same two frames must match, and the shader reports data-motion="still".
 * 3. Mobile: no horizontal scroll at 390px on every key page.
 * Screenshots land in .verify/ (gitignored via /tmp-style folder below).
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const pages = ['/', '/docs', '/docs/principles', '/docs/principles/typography', '/docs/motion', '/docs/3d', '/docs/shaders', '/docs/components', '/docs/recipes', '/docs/showcase', '/docs/toolkit', '/docs/case-studies/br95', '/docs/workflow'];
const out = '.verify';

async function main() {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  let failed = 0;
  const check = (ok: boolean, msg: string) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
    if (!ok) failed++;
  };

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
    const page = await ctx.newPage();
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const hero = page.locator('section').first();
    const a = await hero.screenshot({ path: `${out}/hero-${reducedMotion}-a.png` });
    await page.waitForTimeout(1500);
    const b = await hero.screenshot({ path: `${out}/hero-${reducedMotion}-b.png` });
    const same = Buffer.compare(a, b) === 0;
    const mode = await page.locator('[data-motion]').first().getAttribute('data-motion');
    if (reducedMotion === 'no-preference') check(!same && mode === 'live', `hero moves (frames differ, data-motion=${mode})`);
    else check(same && mode === 'still', `reduced motion holds still (frames identical, data-motion=${mode})`);
    await ctx.close();
  }

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  for (const path of pages) {
    const m = await mobile.newPage();
    const res = await m.goto(base + path, { waitUntil: 'networkidle' });
    check(res?.status() === 200, `${path} → ${res?.status()}`);
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `${path} no horizontal scroll at 390px (overflow ${overflow}px)`);
    const slug = path === '/' ? 'home' : path.slice(1).replaceAll('/', '_');
    await m.screenshot({ path: `${out}/${slug}-mobile.png` });
    await m.close();
    const d = await desktop.newPage();
    await d.goto(base + path, { waitUntil: 'networkidle' });
    await d.waitForTimeout(400);
    await d.screenshot({ path: `${out}/${slug}-desktop.png`, fullPage: path !== '/docs/showcase' && path !== '/docs/toolkit' });
    await d.close();
  }

  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}

main();
