/*
 * Capture one example-site thumbnail.
 *   npx tsx scripts/example-shot.ts <id> <url> [settleMs] [scrollY]
 * Writes public/examples/<id>.jpg (1280×800, JPEG q80). Uses the real GPU so WebGL renders,
 * removes cookie/consent overlays, and can scroll to a section before capturing.
 * Prints OK <path> <bytes> or FAIL <reason>. Always look at the image before using it.
 */
import { chromium } from 'playwright';
import { mkdir, stat } from 'node:fs/promises';

const [id, url, settleArg, scrollArg] = process.argv.slice(2);
if (!id || !url) {
  console.log('usage: example-shot <id> <url> [settleMs] [scrollY]');
  process.exit(2);
}

async function main() {
  await mkdir('public/examples', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`);
    await page.waitForTimeout(Number(settleArg ?? 7000));
    for (const label of [/reject all/i, /decline/i, /accept all/i, /^accept$/i, /got it/i, /allow all/i]) {
      const btn = page.getByRole('button', { name: label }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(600);
        break;
      }
    }
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const pos = getComputedStyle(el).position;
        if ((pos === 'fixed' || pos === 'sticky') && /cookie|consent|privacy settings/i.test(el.innerText || '')) el.remove();
      }
    });
    if (scrollArg) {
      await page.evaluate((y) => window.scrollTo(0, Number(y)), scrollArg);
      await page.waitForTimeout(2500);
    }
    const path = `public/examples/${id}.jpg`;
    await page.screenshot({ path, type: 'jpeg', quality: 80 });
    console.log('OK', path, (await stat(path)).size);
  } catch (e) {
    console.log('FAIL', (e as Error).message.split('\n')[0]);
  }
  await browser.close();
}

main();
