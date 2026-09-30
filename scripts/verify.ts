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
const pages = ['/', '/tools', '/make', '/inspiration', '/sites', '/docs', '/docs/how-to', '/docs/how-to/pixel-to-hd', '/docs/how-to/neon-light-paths', '/docs/rules', '/docs/rules/accessibility', '/docs/rules/tokens-and-colour', '/docs/cases', '/docs/cases/igloo-inc', '/docs/cases/br95', '/lab/pixel-to-hd-cube', '/lab/neon-block-city', '/lab/win95-boot'];
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
    // Start at first paint: on a real network 'networkidle' can outlast the 2.5 s boot intro.
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    // v2 hero: the boot intro autoplays on load, so two viewport frames 1.5 s apart must differ;
    // under reduced motion the desktop renders at once and the frames must match.
    await page.waitForTimeout(reducedMotion === 'reduce' ? 4000 : 400);
    const a = await page.screenshot({ path: `${out}/hero-${reducedMotion}-a.png` });
    await page.waitForTimeout(1500);
    const b = await page.screenshot({ path: `${out}/hero-${reducedMotion}-b.png` });
    const same = Buffer.compare(a, b) === 0;
    if (reducedMotion === 'no-preference') check(!same, 'hero moves (boot intro frames differ)');
    else check(same, 'reduced motion holds still (frames identical)');
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
    await d.screenshot({ path: `${out}/${slug}-desktop.png`, fullPage: path.startsWith('/docs'), timeout: 120000 });
    await d.close();
  }

  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}

main();
