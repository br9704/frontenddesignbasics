import type { Metadata } from 'next';
import { Hero } from '@/components/v2/home/hero';
import { HomeJourney } from '@/components/v2/home/journey';
import { experiences } from '@/lib/experiences';
import { source } from '@/lib/source';
import { examples } from '@/lib/examples';
import toolkit from '@/toolkit/toolkit.json';

export const metadata: Metadata = {
  title: { absolute: 'Front End Design Basics' },
  description:
    'A design guide: the tools I use, the principles I have learnt, and what I build. The site is the live guide; the GitHub repo is the same guide in Markdown plus a toolkit.json your AI agent can read.',
};

export default function HomePage() {
  const labels = toolkit.categories as Record<string, string>;
  const categories = Object.keys(labels)
    .map((id) => {
      const tools = toolkit.tools.filter((t) => t.category === id).map((t) => ({ id: t.id, name: t.name }));
      return { id, label: labels[id], count: tools.length, tools };
    })
    .filter((c) => c.count > 0);

  const sectionIds = Object.keys(examples);
  const wall = sectionIds.map((id) => ({
    id,
    count: examples[id].length,
    tiles: examples[id].slice(0, 6).map((e) => ({ id: e.id, name: e.name, image: e.image })),
  }));
  const sitesTotal = sectionIds.reduce((a, id) => a + examples[id].length, 0);
  const src = examples.colour?.[0] ?? examples[sectionIds[0]][0];

  return (
    <main className="flex-1">
      <Hero
        counts={{
          tools: toolkit.tools.length,
          experiences: experiences.length,
          sites: sitesTotal,
          guides: source.getPages().filter((pg) => /^\/docs\/(how-to|rules|cases)\/./.test(pg.url)).length,
        }}
      />
      <HomeJourney
        categories={categories}
        total={toolkit.tools.length}
        wall={wall}
        sitesTotal={sitesTotal}
        paletteSource={{ name: src.name, image: src.image, url: src.url }}
      />
    </main>
  );
}
