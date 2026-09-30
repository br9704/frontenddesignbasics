/*
 * npx tsx scripts/validate-exp.ts <id|/path> [baseUrl]
 * Checks one experience at /lab/<id> (or any path starting with /):
 *  - console errors / page errors
 *  - motion: two frames 1.5 s apart must differ (unless it is pointer-only; the report says so)
 *  - reduced motion: two frames must be identical
 *  - 390px: no horizontal overflow
 * Screenshots go to .validate/<id>/ (desktop-a, desktop-b, reduced, mobile). Prints a JSON report.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const target = process.argv[2];
const base = process.argv[3] ?? process.env.BASE_URL ?? 'http://localhost:3000';
if (!target) {
  console.log('usage: validate-exp <id|/path> [baseUrl]');
  process.exit(2);
}
const path = target.startsWith('/') ? target : `/lab/${target}`;
const slug = target.replace(/[^a-z0-9-]+/gi, '_').replace(/^_+/, '') || 'root';
const out = `.validate/${slug}`;

async function main() {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const errors: string[] = [];
  const report: Record<string, unknown> = { path };

  const run = async (opts: { reduced: boolean; width: number; height: number; tag: string }) => {
    const ctx = await browser.newContext({
      viewport: { width: opts.width, height: opts.height },
      reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
      isMobile: opts.width < 500,
    });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(`[${opts.tag}] ${m.text().slice(0, 300)}`));
    page.on('pageerror', (e) => errors.push(`[${opts.tag}] pageerror: ${e.message.slice(0, 300)}`));
    const res = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 90000 });
    report[`${opts.tag}_status`] = res?.status();
    await page.waitForTimeout(4500); // compile + lazy load + first frames
    await page.mouse.move(opts.width * 0.6, opts.height * 0.45);
    const a = await page.screenshot({ path: `${out}/${opts.tag}-a.png` });
    await page.waitForTimeout(1500);
    await page.mouse.move(opts.width * 0.4, opts.height * 0.55);
    const b = await page.screenshot({ path: `${out}/${opts.tag}-b.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await ctx.close();
    return { changed: Buffer.compare(a, b) !== 0, overflow };
  };

  const desktop = await run({ reduced: false, width: 1280, height: 800, tag: 'desktop' });
  const reduced = await run({ reduced: true, width: 1280, height: 800, tag: 'reduced' });
  const mobile = await run({ reduced: false, width: 390, height: 844, tag: 'mobile' });
  await browser.close();

  Object.assign(report, {
    moves: desktop.changed,
    reducedStill: !reduced.changed,
    mobileOverflowPx: mobile.overflow,
    errors,
    screenshots: `${out}/{desktop,reduced,mobile}-{a,b}.png`,
  });
  report.pass = desktop.changed && !reduced.changed && mobile.overflow <= 0 && errors.length === 0;
  console.log(JSON.stringify(report, null, 2));
}

main();
