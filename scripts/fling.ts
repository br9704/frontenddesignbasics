/*
 * pnpm fling  (needs the site running; BASE_URL=... for the live site; THROTTLE=1 for Fast 3G + 4x CPU)
 * Scrolls the home journey at three speeds with the wheel. At stops along the way it waits for
 * reveals to finish, then fails if:
 *   - a heading inside an act, on screen, is still hidden (opacity < 0.95)
 *   - a slot on screen is blank (no live piece and no still image loaded)
 * and reports how many slots per act were showing a still instead of the live piece
 * (at normal speed, at most 1 per act is allowed; throttled runs only report).
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const THROTTLE = process.env.THROTTLE === '1';
const SPEEDS = [
  { name: 'normal', delta: 350, every: 120 },
  { name: 'fast', delta: 900, every: 80 },
  { name: 'fling', delta: 2400, every: 60 },
];

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  let failed = 0;
  for (const sp of SPEEDS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    if (THROTTLE) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 90_000 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    // tsx (esbuild keepNames) wraps nested functions in __name(); give the page a no-op one
    await page.addInitScript('window.__name = (f) => f');
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => !document.querySelector('[aria-label^="Loading the journey"]'), null, { timeout: 60_000 });
    await page.waitForTimeout(1500);
    const hidden = new Set<string>();
    const blank = new Set<string>();
    const stills = new Map<string, Set<string>>();
    let steps = 0;
    let lastY = -1, stuck = 0;
    for (;;) {
      if (steps > 900) { console.log('   (step cap reached)'); break; }
      await page.mouse.wheel(0, sp.delta);
      await page.waitForTimeout(sp.every);
      steps++;
      // every ~1.5 screens, stop and look
      const y = await page.evaluate(() => scrollY);
      stuck = y === lastY ? stuck + 1 : 0;
      lastY = y;
      if (stuck > 25) { console.log(`   (scroll stuck at y=${y})`); break; }
      if (steps % Math.max(1, Math.round(1350 / sp.delta)) !== 0) {
        if (await page.evaluate(() => scrollY >= document.documentElement.scrollHeight - innerHeight - 2)) break;
        continue;
      }
      // FlyTitle: 1.1s per char plus up to ~1s of random stagger
      await page.waitForTimeout(2600);
      const r = await page.evaluate(() => {
        const H = innerHeight;
        const inView = (el: Element) => {
          const b = el.getBoundingClientRect();
          // horizontally too: the MAKE carousel and the sites wall slide sideways
          return b.width > 4 && b.height > 4 && b.top < H * 0.85 && b.bottom > H * 0.15 && b.left < innerWidth * 0.9 && b.right > innerWidth * 0.1;
        };
        const opacity = (el: Element) => {
          let o = 1;
          for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
          return o;
        };
        const act = (el: Element) => el.closest('[data-act]')?.getAttribute('data-act') ?? '?';
        const hidden: string[] = [];
        document.querySelectorAll('[data-act] h2, [data-act] h3').forEach((h) => {
          if (!inView(h) || !(h.textContent ?? '').trim()) return;
          const chars = h.querySelectorAll('.fly-char');
          const o = chars.length ? Math.min(...[...chars].map(opacity)) : opacity(h);
          // a heading faded out by its own act's scrubbed timeline is fine only if the act says so
          if (o < 0.95 && !h.closest('[data-fade-ok]')) hidden.push(`act ${act(h)}: "${(h.textContent ?? '').trim().slice(0, 40)}" (${o.toFixed(2)})`);
        });
        const blank: string[] = [];
        const stills: [string, string][] = [];
        document.querySelectorAll('[data-slot]').forEach((s) => {
          if (!inView(s) || opacity(s) < 0.05) return;
          const live = s.getAttribute('data-live') === '1' && !!s.querySelector('canvas, [data-experience] > *:not(:has(img))');
          const img = s.querySelector('img') as HTMLImageElement | null;
          const still = !!img && img.complete && img.naturalWidth > 0;
          if (!live && !still) blank.push(`act ${act(s)}: ${s.getAttribute('data-slot')}`);
          if (s.getAttribute('data-live') !== '1') stills.push([act(s), s.getAttribute('data-slot')!]);
        });
        return { hidden, blank, stills, end: scrollY >= document.documentElement.scrollHeight - H - 2 };
      });
      r.hidden.forEach((h) => hidden.add(h));
      r.blank.forEach((b) => blank.add(b));
      r.stills.forEach(([a, id]) => (stills.get(a) ?? stills.set(a, new Set()).get(a)!).add(id));
      if (r.end) break;
    }
    const overStill = [...stills.entries()].filter(([, s]) => s.size > 1);
    const bad = hidden.size + blank.size + (THROTTLE || sp.name !== 'normal' ? 0 : overStill.length);
    failed += bad;
    console.log(`${bad ? 'FAIL' : 'PASS'}  ${sp.name}${THROTTLE ? ' (throttled)' : ''}`);
    hidden.forEach((h) => console.log('   hidden heading ·', h));
    blank.forEach((b) => console.log('   blank slot ·', b));
    stills.forEach((s, a) => console.log(`   stills in act ${a}: ${[...s].join(', ')}`));
    await page.close();
  }
  await browser.close();
  if (failed) process.exit(1);
}

main();
