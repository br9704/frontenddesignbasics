/*
 * pnpm export:md  (needs the site running: pnpm build && pnpm start, or BASE_URL=...)
 *
 * Turns every chapter in content/docs/*.mdx into GitHub-readable markdown in guide/, so the
 * repo itself is the guide:
 *  - diagrams, demos and posters (data-export components) → screenshots in guide/img/
 *  - <Examples>/<ShowcaseGrid> → HTML image grids linking to the live sites
 *  - <Banner>/<Shot> → images; <Steps>/<Tabs>/<Cards>/<Callout> → plain markdown
 *  - /docs/... links → relative links between guide/ files
 */
import { chromium, type Page } from 'playwright';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import examplesData from '../data/examples.json';
import { showcase } from '../lib/showcase';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LIVE = 'https://frontenddesignbasics.vercel.app';
const DOCS = 'content/docs';
const OUT = 'guide';
const examples = examplesData as Record<string, { id: string; name: string; url: string; note: string; image: string }[]>;

// Keep in sync with VISUAL_COMPONENTS in components/mdx.tsx.
const VISUAL = new Set([
  'Preview', 'EasingPlayground', 'TypeScale', 'ContrastPair', 'SpacingRhythm', 'ReducedMotionDemo',
  'TiltCard', 'ShaderPlayground', 'MarqueeDemo', 'BentoDemo',
  'Flow', 'EasingCurves', 'ColourBudget', 'ProximityDiagram', 'HierarchyDiagram', 'ScaleLadder', 'Decision', 'PromptAnatomy', 'PageTemplate',
  'TypeSpecimen', 'PaletteSheet', 'MotionPoster',
  'VariableFontPlayground', 'OklchPaletteLab', 'GridOverlay',
  'SpringVsBezier', 'StaggerPlayground', 'ScrollProgressDemo',
  'ButtonStatesLab', 'SpotlightCard', 'TextRevealDemo', 'MagneticButton',
]);

interface Page_ { file: string; slug: string; out: string }

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.mdx')) out.push(p);
  }
  return out;
}

async function isDir(p: string) {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

/* content/docs/principles/index.mdx → slug "principles", out guide/principles/README.md */
function toPage(file: string): Page_ {
  const rel = path.relative(DOCS, file).replace(/\.mdx$/, '');
  const slug = rel === 'index' ? '' : rel.replace(/\/index$/, '');
  const out = rel.endsWith('index') ? path.join(OUT, path.dirname(rel) === '.' ? '' : path.dirname(rel), 'README.md') : path.join(OUT, `${rel}.md`);
  return { file, slug, out };
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? tag.match(new RegExp(`${name}='([^']*)'`))?.[1];

/* Find the end index of a JSX element starting at `i` (text[i] === '<'). Handles nested braces and same-name nesting. */
function jsxEnd(text: string, i: number, name: string): number {
  let depth = 0;
  let j = i + 1;
  // end of opening tag
  for (; j < text.length; j++) {
    const c = text[j];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) break;
  }
  if (text[j - 1] === '/') return j + 1; // self-closing
  let level = 1;
  const open = new RegExp(`<${name}(?=[\\s>/])`, 'g');
  const close = new RegExp(`</${name}>`, 'g');
  let k = j + 1;
  while (level > 0) {
    open.lastIndex = k;
    close.lastIndex = k;
    const o = open.exec(text);
    const c = close.exec(text);
    if (!c) return text.length;
    if (o && o.index < c.index) { level++; k = o.index + 1; } else { level--; k = c.index + c[0].length; }
  }
  return k;
}

function rel(from: string, to: string) {
  let r = path.relative(path.dirname(from), to);
  if (!r.startsWith('.')) r = `./${r}`;
  return r;
}

function grid(items: { name: string; url: string; note: string; image: string }[], outFile: string) {
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 3) {
    const cells = items.slice(i, i + 3).map(
      (e) => `<td width="33%" valign="top"><a href="${e.url}"><img src="${rel(outFile, `public${e.image}`)}" alt="${e.name}" /></a><br/><b><a href="${e.url}">${e.name}</a></b><br/><sub>${e.note.replace(/</g, '&lt;')}</sub></td>`,
    );
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>`;
}

interface Ctx { page: Page_; slugToOut: Map<string, string>; visuals: string[] }

/* Convert an MDX body (no frontmatter) to GitHub markdown. Collects visual component names in order. */
function convert(text: string, ctx: Ctx): string {
  let out = '';
  let i = 0;
  let inFence = false;
  while (i < text.length) {
    const lineStart = i === 0 || text[i - 1] === '\n';
    if (lineStart && text.startsWith('```', i)) inFence = !inFence;
    const m = !inFence && lineStart ? text.slice(i).match(/^<([A-Za-z][A-Za-z0-9]*)/) : null;
    if (!m) {
      out += text[i++];
      continue;
    }
    const name = m[1];
    const end = jsxEnd(text, i, name);
    const block = text.slice(i, end);
    const openTag = block.slice(0, block.indexOf('>') + 1);
    const inner = block.includes(`</${name}>`) ? block.slice(openTag.length, block.lastIndexOf(`</${name}>`)) : '';
    out += replace(name, openTag, inner, block, ctx);
    i = end;
  }
  return out;
}

function replace(name: string, openTag: string, inner: string, block: string, ctx: Ctx): string {
  const outFile = ctx.page.out;
  if (VISUAL.has(name)) {
    const n = ctx.visuals.push(name);
    const img = `img/${ctx.page.slug.replaceAll('/', '-') || 'start'}/${String(n).padStart(2, '0')}-${name}.jpg`;
    const live = `${LIVE}/docs${ctx.page.slug ? `/${ctx.page.slug}` : ''}`;
    const caption = attr(openTag, 'caption');
    const interactive = /Playground|Lab|Demo|Pair|Rhythm|Scale$|TiltCard|Overlay|Bezier|Card|Button|Reveal/.test(name) || name === 'Preview';
    return `<img src="${rel(outFile, path.join(OUT, img))}" alt="${name}" />\n\n${caption ? `<sub>${caption}</sub>\n\n` : ''}${interactive ? `<sub>▶ Interactive on the [live site](${live}).</sub>\n` : ''}`;
  }
  switch (name) {
    case 'Banner':
      return `<img src="${rel(outFile, `public/banners/${attr(openTag, 'name')}.jpg`)}" alt="${attr(openTag, 'alt') ?? ''}" />\n`;
    case 'Shot':
      return `<img src="${rel(outFile, `public${attr(openTag, 'src')}`)}" alt="${attr(openTag, 'alt') ?? ''}" />\n\n${attr(openTag, 'caption') ? `<sub>${attr(openTag, 'caption')}</sub>\n` : ''}`;
    case 'Examples': {
      const section = attr(openTag, 'section')!;
      const items = examples[section] ?? [];
      const title = attr(openTag, 'title') ?? 'In the wild';
      return `**${title} · ${items.length} examples**\n\n${grid(items, outFile)}\n`;
    }
    case 'ShowcaseGrid': {
      const mine = /\bmine\b/.test(openTag);
      const items = showcase.filter((s) => Boolean(s.mine) === mine);
      return items
        .map((s, i) => `### ${String(i + 1).padStart(2, '0')} · [${s.name}](${s.url})\n\n<a href="${s.url}"><img src="${rel(outFile, `public/showcase/${s.id}.jpg`)}" alt="${s.name}" /></a>\n\n*by ${s.by}*\n\n${s.why}\n\n${s.lessons.map((l) => `- ${l}`).join('\n')}\n`)
        .join('\n');
    }
    case 'ToolkitTable':
      return `The full, searchable toolkit is in the [README](${rel(outFile, 'README.md')}#toolkit) and on the [live site](${LIVE}/docs/toolkit).\n`;
    case 'Steps':
      return convert(inner.trim(), ctx) + '\n';
    case 'Step':
      return convert(inner.trim(), ctx) + '\n';
    case 'Tabs':
      return convert(inner.trim(), ctx) + '\n';
    case 'Tab':
      return `**${attr(openTag, 'value')}**\n\n${convert(inner.trim(), ctx)}\n`;
    case 'Cards':
      return convert(inner.trim(), ctx) + '\n';
    case 'Card':
      return `- **[${attr(openTag, 'title')}](${attr(openTag, 'href')})**: ${inner.trim()}`;
    case 'Reference':
      return `<details><summary>${attr(openTag, 'title') ?? 'Reference'}</summary>\n\n${convert(inner.trim(), ctx)}\n\n</details>\n`;
    case 'Callout':
      return `> ${convert(inner.trim(), ctx).replace(/\n/g, '\n> ')}\n`;
    case 'pre': {
      // ASCII diagrams written as <pre>{["line", "line"].join('\n')}</pre> → a plain text block.
      const arr = block.match(/\{\s*\[([\s\S]*?)\]\s*\.join\(/);
      if (arr) {
        const lines = [...arr[1].matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)].map((m) =>
          m[1] !== undefined ? JSON.parse(`"${m[1]}"`) : m[2].replace(/\\'/g, "'"),
        );
        return '```text\n' + lines.join('\n') + '\n```\n';
      }
      const inner = block.replace(/^<pre[^>]*>/, '').replace(/<\/pre>$/, '');
      return '```text\n' + inner.replace(/^\{`|`\}$/g, '') + '\n```\n';
    }
    default:
      // Raw HTML (div/img/figure…): make absolute asset paths relative to public/.
      return block.replace(/src="\/([^"]+)"/g, (_, p) => `src="${rel(outFile, `public/${p}`)}"`).replace(/className=/g, 'class=');
  }
}

function fixLinks(md: string, ctx: Ctx): string {
  return md
    .replace(/\]\((\/docs[^)#\s]*)(#[^)]*)?\)/g, (_, p: string, hash = '') => {
      const slug = p.replace(/^\/docs\/?/, '').replace(/\/$/, '');
      const target = ctx.slugToOut.get(slug);
      return target ? `](${rel(ctx.page.out, target)}${hash})` : `](${LIVE}${p}${hash})`;
    })
    .replace(/href="(\/docs[^"#]*)(#[^"]*)?"/g, (_, p: string, hash = '') => {
      const slug = p.replace(/^\/docs\/?/, '').replace(/\/$/, '');
      const target = ctx.slugToOut.get(slug);
      return `href="${target ? rel(ctx.page.out, target) : LIVE + p}${hash}"`;
    })
    .replace(/\]\(\/(llms\.txt)\)/g, `](${LIVE}/$1)`);
}

async function shoot(page: Page, pg: Page_, visuals: string[]) {
  const url = `${BASE}/docs${pg.slug ? `/${pg.slug}` : ''}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const handles = await page.$$('[data-export]:not([data-export] [data-export])');
  const names = await Promise.all(handles.map((h) => h.getAttribute('data-export')));
  if (names.join() !== visuals.join()) {
    console.warn(`  ! ${pg.slug || 'start'}: DOM ${names.length} vs MDX ${visuals.length}`, names, visuals);
  }
  const dir = path.join(OUT, 'img', pg.slug.replaceAll('/', '-') || 'start');
  await mkdir(dir, { recursive: true });
  for (let i = 0; i < Math.min(handles.length, visuals.length); i++) {
    await handles[i].scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await handles[i].screenshot({ path: path.join(dir, `${String(i + 1).padStart(2, '0')}-${visuals[i]}.jpg`), type: 'jpeg', quality: 86 });
  }
  return handles.length;
}

async function main() {
  const files = (await walk(DOCS)).sort();
  const pages = files.map(toPage);
  const slugToOut = new Map(pages.map((p) => [p.slug, p.out]));
  await rm(OUT, { recursive: true, force: true });

  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctxB = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await ctxB.newPage();

  for (const pg of pages) {
    const raw = await readFile(pg.file, 'utf8');
    const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
    const body = fm ? raw.slice(fm[0].length) : raw;
    const title = fm?.[1].match(/^title:\s*['"]?(.*?)['"]?$/m)?.[1]?.replace(/''/g, "'") ?? '';
    const desc = fm?.[1].match(/^description:\s*['"]?(.*?)['"]?$/m)?.[1]?.replace(/''/g, "'") ?? '';
    const ctx: Ctx = { page: pg, slugToOut, visuals: [] };
    let md = convert(body, ctx);
    md = fixLinks(md, ctx);
    const live = `${LIVE}/docs${pg.slug ? `/${pg.slug}` : ''}`;
    const header = `<!-- generated by \`pnpm export:md\` from ${pg.file}. Edit the MDX, not this file. -->\n\n# ${title}\n\n*${desc}*\n\n<sub>📖 [Read this chapter on the live site](${live}) for the interactive version · [← Guide contents](${rel(pg.out, path.join(OUT, 'README.md'))})</sub>\n`;
    md = `${header}\n${md.replace(/\n{3,}/g, '\n\n').trim()}\n`;
    await mkdir(path.dirname(pg.out), { recursive: true });
    await writeFile(pg.out, md);
    const shot = ctx.visuals.length ? await shoot(page, pg, ctx.visuals) : 0;
    console.log(`${pg.out}  (${ctx.visuals.length} visuals, ${shot} captured)`);
  }
  await browser.close();
}

main();
