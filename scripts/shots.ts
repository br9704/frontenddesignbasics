/*
 * pnpm shots             → showcase screenshots (desktop 1440×900 + mobile 390×844)
 * pnpm shots --banners   → README/section banners from the local /banner route (needs `pnpm dev` on :3000)
 *
 * Output: public/showcase/<id>.jpg, public/showcase/<id>-mobile.jpg, public/banners/*.jpg
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { showcase } from '../lib/showcase';

const onlyBanners = process.argv.includes('--banners');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const banners = [
  { name: 'readme', w: 1600, h: 560, q: '' },
  { name: 'og', w: 1200, h: 630, q: '' },
  { name: 'principles', w: 1600, h: 480, q: 'section=Principles&n=01' },
  { name: 'motion', w: 1600, h: 480, q: 'section=Motion&n=02&seed=11' },
  { name: '3d', w: 1600, h: 480, q: 'section=3D&n=03&seed=5' },
  { name: 'shaders', w: 1600, h: 480, q: 'section=Shaders&n=04&seed=61' },
  { name: 'components', w: 1600, h: 480, q: 'section=Components&n=05&seed=29' },
  { name: 'recipes', w: 1600, h: 480, q: 'section=Recipes&n=06&seed=41' },
  { name: 'ai-assets', w: 1600, h: 480, q: 'section=AI%20assets&n=07&seed=73' },
  { name: 'specimen', w: 1600, h: 480, q: 'section=Specimen&n=08&seed=83' },
  { name: 'showcase', w: 1600, h: 480, q: 'section=Showcase&n=10&seed=23' },
  { name: 'toolkit', w: 1600, h: 480, q: 'section=Toolkit&n=11&seed=31' },
  { name: 'case-studies', w: 1600, h: 480, q: 'section=Case%20studies&n=09&seed=47' },
  { name: 'workflow', w: 1600, h: 480, q: 'section=Workflow&n=12&seed=53' },
];

async function main() {
  // Real GPU (Metal via ANGLE) so WebGL sites render instead of showing a grey canvas.
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

  if (onlyBanners) {
    await mkdir('public/banners', { recursive: true });
    for (const b of banners) {
      const page = await browser.newPage({ viewport: { width: b.w, height: b.h }, deviceScaleFactor: 1 });
      await page.goto(`http://localhost:3000/banner?still&${b.q}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `public/banners/${b.name}.jpg`, type: 'jpeg', quality: 86 });
      await page.close();
      console.log('banner', b.name);
    }
  } else {
    await mkdir('public/showcase', { recursive: true });
    for (const s of showcase.filter((x) => !only || x.id === only)) {
      for (const [suffix, vp] of [
        ['', { width: 1440, height: 900 }],
        ['-mobile', { width: 390, height: 844 }],
      ] as const) {
        const ctx = await browser.newContext({
          viewport: vp,
          deviceScaleFactor: 1,
          isMobile: suffix === '-mobile',
          userAgent:
            suffix === '-mobile'
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
              : undefined,
        });
        const page = await ctx.newPage();
        try {
          await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.waitForTimeout(s.settle ?? 6000);
          if (s.start) {
            if (s.start === 'center') await page.mouse.click(vp.width / 2, vp.height / 2);
            else await page.getByRole('button', { name: new RegExp(s.start, 'i') }).first().click({ timeout: 5000 }).catch(() => page.keyboard.press('Enter'));
            await page.waitForTimeout(9000);
          }
          if (s.dismiss) await page.getByText(s.dismiss, { exact: true }).first().click({ timeout: 3000 }).catch(() => {});
          // Dismiss cookie banners so the shot shows the design, not the consent UI.
          for (const label of [/reject all/i, /decline/i, /accept all/i, /^accept$/i, /got it/i]) {
            const btn = page.getByRole('button', { name: label }).first();
            if (await btn.isVisible().catch(() => false)) {
              await btn.click({ timeout: 2000 }).catch(() => {});
              await page.waitForTimeout(800);
              break;
            }
          }
          // Last resort: remove any fixed/sticky overlay that talks about cookies.
          await page.evaluate(() => {
            for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
              const pos = getComputedStyle(el).position;
              if ((pos === 'fixed' || pos === 'sticky') && /cookie|consent/i.test(el.innerText || '')) el.remove();
            }
          });
          await page.waitForTimeout(300);
          await page.screenshot({ path: `public/showcase/${s.id}${suffix}.jpg`, type: 'jpeg', quality: 82 });
          console.log('shot', s.id + suffix);
        } catch (e) {
          console.warn('FAILED', s.id + suffix, (e as Error).message.split('\n')[0]);
        }
        await ctx.close();
      }
    }
  }
  await browser.close();
}

main();
