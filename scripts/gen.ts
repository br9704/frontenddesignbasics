/*
 * pnpm gen: regenerate files derived from toolkit/toolkit.json and data/examples.json.
 *  - GALLERY.md: every example screenshot, by section (visible on GitHub)
 *  - README.md: 3 examples per section between <!-- gallery:begin --> and <!-- gallery:end -->
 *  - README.md: the table between <!-- toolkit:begin --> and <!-- toolkit:end -->
 *  - AGENTS.md: the full agent brief (rules + toolkit)
 * The site's Toolkit page and /llms.txt read the JSON directly, so they need no step.
 */
import { readFile, writeFile } from 'node:fs/promises';
import toolkit from '../toolkit/toolkit.json';
import examplesData from '../data/examples.json';
import { experiences as EXPS } from '../lib/experiences';
import { readFileSync } from 'node:fs';

const LIVE = 'https://frontenddesignbasics.vercel.app';

/* docs page titles from frontmatter, in meta.json order (--- separators become group labels) */
function docsList(dir: string) {
  const meta = JSON.parse(readFileSync(`content/docs/${dir}/meta.json`, 'utf8')) as { pages: string[] };
  return meta.pages.map((pg) => {
    if (pg.startsWith('---')) return { group: pg.replace(/-/g, '').trim() };
    const src = readFileSync(`content/docs/${dir}/${pg}.mdx`, 'utf8');
    const title = src.match(/^title:\s*['"]?(.*?)['"]?\s*$/m)?.[1]?.replace(/''/g, "'") ?? pg;
    return { slug: pg, title };
  });
}

function directory() {
  const sites = Object.values(examples).reduce((n, v) => n + v.length, 0);
  const rows: [string, number, string][] = [
    ['/make', EXPS.length, 'experiences built by mixing the tools'],
    ['/tools', toolkit.tools.length, 'libraries, MCPs and skills I use daily'],
    ['/inspiration', Object.keys(examples).length, 'design inspiration, by principle'],
    ['/sites', sites, 'real websites, filterable'],
    ['/docs/how-to', docsList('how-to').filter((x) => 'slug' in x).length, 'short numbered task guides'],
    ['/docs/rules', docsList('rules').filter((x) => 'slug' in x).length, 'rules and conventions, TL;DR first'],
    ['/docs/cases', docsList('cases').filter((x) => 'slug' in x).length, 'great sites, broken down'],
  ];
  const lines = rows.map(([p, n, d]) => `│  ${p.padEnd(15)}${String(n).padStart(4)}  ${d.padEnd(40)}│`);
  const w = lines[0].length - 2;
  return ['```text', `┌─ frontenddesignbasics.vercel.app ${'─'.repeat(w - 34)}┐`, ...lines, `└${'─'.repeat(w)}┘`, '```'].join('\n');
}

function experienceGrid() {
  const rows: string[] = [];
  for (let i = 0; i < EXPS.length; i += 3) {
    const cells = EXPS.slice(i, i + 3).map(
      (e) =>
        `<td width="33%" valign="top"><a href="${LIVE}/lab/${e.id}"><img src="public/posters/${e.id}.jpg" alt="${e.title}" /></a><br/><b><a href="${LIVE}/lab/${e.id}">${e.title}</a></b> <sub>· ${e.stage} · ${e.kind}</sub><br/><sub>${e.blurb.replace(/</g, '&lt;')}</sub><br/><sub><code>${e.tools.slice(0, 5).join(' · ')}</code></sub></td>`,
    );
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>\n\nSource for each lives in [\`components/experiences/\`](components/experiences), registered in [\`lib/experiences/\`](lib/experiences).`;
}

function learn() {
  const block = (dir: string, label: string, blurb: string) => {
    const items = docsList(dir);
    const body = items
      .map((x) => ('group' in x ? `\n**${x.group}**` : `- [${x.title}](${LIVE}/docs/${dir}/${x.slug}) · [md](guide/${dir}/${x.slug}.md)`))
      .join('\n');
    return `### ${label}\n\n${blurb}\n${body}`;
  };
  return [
    block('how-to', 'How-tos', 'Short, numbered task guides. Each links to a live experience that uses the technique.'),
    block('rules', 'Rules and conventions', 'TL;DR first, then the detail, with sources.'),
    block('cases', 'Case studies', 'Great sites broken down from their makers\' own write-ups, plus two of mine.'),
  ].join('\n\n');
}

type Ex = { id: string; name: string; url: string; by?: string; note: string; image: string };
const examples = examplesData as Record<string, Ex[]>;

/* Section order and titles for the GitHub gallery. */
const SECTIONS: [string, string][] = [
  ['typography', 'Typography'], ['colour', 'Colour'], ['darkmode', 'Dark mode'], ['layout', 'Layout & space'],
  ['hierarchy', 'Hierarchy'], ['hero', 'Heroes'], ['bento', 'Bento grids'], ['footer', 'Footers'],
  ['motion', 'Motion'], ['scroll', 'Scroll stories'], ['3d', '3D & WebGL'], ['shaders', 'Shaders & gradients'],
  ['components', 'Components'], ['saas', 'SaaS landing pages'], ['ecommerce', 'E-commerce'], ['portfolio', 'Portfolios'],
  ['editorial', 'Editorial'], ['specimen', 'Specimens & design systems'], ['ai', 'AI products'],
];
const slug = (t: string) => t.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* A 3-column HTML table of screenshots. GitHub renders <table>/<img> in markdown. */
function grid(items: Ex[], width = 3) {
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += width) {
    const cells = items.slice(i, i + width).map(
      (e) => `<td width="33%" valign="top"><a href="${e.url}"><img src="public${e.image}" alt="${e.name}" /></a><br/><b><a href="${e.url}">${e.name}</a></b><br/><sub>${e.note.replace(/</g, '&lt;')}</sub></td>`,
    );
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>`;
}

function gallery() {
  const total = Object.values(examples).reduce((n, v) => n + v.length, 0);
  const toc = SECTIONS.filter(([k]) => examples[k]?.length)
    .map(([k, t]) => `[${t} (${examples[k].length})](#${slug(t)})`)
    .join(' · ');
  const body = SECTIONS.filter(([k]) => examples[k]?.length)
    .map(([k, t]) => `## ${t}\n\n${grid(examples[k])}\n\n[↑ back to top](#gallery)`)
    .join('\n\n');
  return `# Gallery\n\n<!-- generated by \`pnpm gen\` from data/examples.json. Edit the JSON, not this file. -->\n\n**${total} real websites**, screenshotted and checked by eye, grouped by what they teach. Click any image to visit the live site. Screenshots belong to their owners and are shown for commentary.\n\n${toc}\n\n${body}\n`;
}

function readmePreview() {
  return SECTIONS.filter(([k]) => examples[k]?.length)
    .map(([k, t]) => `### ${t}\n\n${grid(examples[k].slice(0, 3))}\n\n[All ${examples[k].length} ${t.toLowerCase()} examples →](GALLERY.md#${slug(t)})`)
    .join('\n\n');
}

const cats = toolkit.categories as Record<string, string>;
const esc = (s: string) => s.replaceAll('|', '\\|');

function table() {
  const lines: string[] = [];
  for (const [key, label] of Object.entries(cats)) {
    const rows = toolkit.tools.filter((t) => t.category === key);
    if (!rows.length) continue;
    lines.push(`\n**${label}**\n`, '| Tool | What | Status |', '|---|---|---|');
    for (const t of rows) lines.push(`| [${t.name}](${t.url}) | ${esc(t.what)} | \`${t.mcp.status}\` |`);
  }
  return lines.join('\n');
}

async function main() {
  const readme = await readFile('README.md', 'utf8');
  const next = readme.replace(
    /<!-- toolkit:begin -->[\s\S]*<!-- toolkit:end -->/,
    `<!-- toolkit:begin -->\n<!-- generated by \`pnpm gen\` from toolkit/toolkit.json. Edit the JSON, not this table. -->\n${table()}\n\n<!-- toolkit:end -->`,
  );
  const withGallery = next.replace(
    /<!-- gallery:begin -->[\s\S]*<!-- gallery:end -->/,
    `<!-- gallery:begin -->\n<!-- generated by \`pnpm gen\` from data/examples.json -->\n\n${readmePreview()}\n\n<!-- gallery:end -->`,
  );
  const fill = (text: string, name: string, body: string) =>
    text.replace(new RegExp(`<!-- ${name}:begin -->[\\s\\S]*<!-- ${name}:end -->`), `<!-- ${name}:begin -->\n<!-- generated by \`pnpm gen\` -->\n\n${body}\n\n<!-- ${name}:end -->`);
  let readmeOut = fill(withGallery, 'directory', directory());
  readmeOut = fill(readmeOut, 'experiences', experienceGrid());
  readmeOut = fill(readmeOut, 'learn', learn());
  await writeFile('README.md', readmeOut);
  await writeFile('GALLERY.md', gallery());

  const agents = `# AGENTS.md

Instructions for coding agents working **with** this guide (reading it for a project) or **on** it (editing this repo).

## Using this guide on a project

When a person starts a new project or design task and points you here:

1. Read \`toolkit/toolkit.json\` and the Principles chapter (\`content/docs/principles/\`).
2. **Before designing anything**, propose a short list: 3–6 tools and 3–5 principles that fit *this* brief, each with one line on why.
3. Ask the person to choose. Don't install or apply anything they haven't picked.
4. Respect each tool's \`mcp.status\`: \`needs-key\` and \`dormant\` tools need the person to sign in or pay first. Say so rather than failing silently.

Non-negotiables from this guide:
- Honour \`prefers-reduced-motion\` in every animation. Pause off-screen loops.
- Prove motion with two frames ~1.5 s apart. A single screenshot proves nothing.
- Test at 390px wide with no horizontal scroll.
- Measure contrast (4.5:1 body text).
- Don't default to the fonts every generator uses. Choose type for the subject.

## Editing this repo

- Stack: Next.js 16 + Fumadocs + MDX + Tailwind 4. Content lives in \`content/docs\`.
- Every guide page follows: live demo → code → install → why it works → links.
- \`toolkit/toolkit.json\` is the single source of truth. After editing it, run \`pnpm gen\`.
- Showcase entries (\`lib/showcase.ts\`) credit and link the owner and never copy their code or assets. Capture with \`pnpm shots --only=<id>\`.
- Before committing: \`pnpm build\` and \`pnpm verify\` (needs \`pnpm start\` on :3000).

## Toolkit (${toolkit.tools.length} tools, updated ${toolkit.updated})
${table()}
`;
  await writeFile('AGENTS.md', agents);
  console.log(`README table + AGENTS.md regenerated from ${toolkit.tools.length} tools`);
}

main();
