import type { Metadata } from 'next';
import Link from 'next/link';
import examples from '@/data/examples.json';
import { AsciiFrame } from '@/components/v2/ascii-frame';
import { InspirationGrid, type Shot } from '@/components/v2/inspiration-grid';
import { InspirationLive } from '@/components/v2/inspiration-live';
import { PostersProvider } from '@/components/v2/make-live';
import { posterIds } from '@/components/v2/make-posters';

export const metadata: Metadata = {
  title: 'Design inspiration',
  description: 'Inspiration organised by principle: typography, colour, layout, hierarchy, specimens, editorial and dark mode.',
};

/** Credited experiments and tool demos: what the experiences on this site learned from. */
const FEATURED: Shot[] = [
  { name: 'Day 028 "Zero To One"', url: 'https://experiments.p5aholic.me/day/028/', by: 'p5aholic (Keita Yamada)', note: 'A faceted crystal refracts neon type while rings of letters orbit it. The benchmark for type and 3D in one scene.', image: '/examples/p5-day-028.jpg' },
  { name: 'Day 034 "Noise Addict"', url: 'https://experiments.p5aholic.me/day/034/', by: 'p5aholic (Keita Yamada)', note: 'Sliced type rows loop at their own speeds around a pastel blob. Pure kinetic-poster energy.', image: '/examples/p5-day-034.jpg' },
  { name: 'Day 010 "Simplicity"', url: 'https://experiments.p5aholic.me/day/010/', by: 'p5aholic (Keita Yamada)', note: 'Isometric type blocks with index faces and noise dropouts. Clean type and three.js together.', image: '/examples/p5-day-010.jpg' },
  { name: 'Day 031 "Madness"', url: 'https://experiments.p5aholic.me/day/031/', by: 'p5aholic (Keita Yamada)', note: 'Extruded letters ripple on a travelling sine wave and melt into paper grain.', image: '/examples/p5-day-031.jpg' },
  { name: 'Day 017 "Lost And Found"', url: 'https://experiments.p5aholic.me/day/017/', by: 'p5aholic (Keita Yamada)', note: 'A flickering neon sign with glow baked from a triple blur, plus physical sparks on a tiled wall.', image: '/examples/p5-day-017.jpg' },
  { name: 'Day 004 "This Data is Corrupted"', url: 'https://experiments.p5aholic.me/day/004/', by: 'p5aholic (Keita Yamada)', note: 'A recursive isometric cube octree with low-res RGB-split bands sweeping through it.', image: '/examples/p5-day-004.jpg' },
  { name: 'Day 032 "EXIT"', url: 'https://experiments.p5aholic.me/day/032/', by: 'p5aholic (Keita Yamada)', note: 'Brightness-driven pixelation and row tears on 3D type. A broken VHS exit sign.', image: '/examples/p5-day-032.jpg' },
  { name: 'Day 026 "Forget Everything"', url: 'https://experiments.p5aholic.me/day/026/', by: 'p5aholic (Keita Yamada)', note: 'A liquid-glass lens magnifies and splits rows of scrolling serif type.', image: '/examples/p5-day-026.jpg' },
  { name: 'Animating 160,000 cubes to visualize dithering', url: 'https://tympanus.net/Tutorials/VisualizingDitheringThreejs/', by: 'visualrambling, via Codrops', note: 'Cubes fly through a threshold map and snap to 1-bit, so you watch dithering happen in 3D.', image: '/examples/tool-idea-codrops-10.jpg' },
  { name: 'Shape-aware ASCII renderer', url: 'https://tympanus.net/Tutorials/ASCIILogo/', by: 'Edoardo Lunardi, via Codrops', note: 'Glyphs are matched to the silhouette, so edges read as clean strokes.', image: '/examples/tool-idea-codrops-1.jpg' },
  { name: 'Unwoven', url: 'https://tympanus.net/Development/Unwoven/', by: 'Clément Grellier, via Codrops', note: 'Image cards unravel into threads at the edges of an endless loom.', image: '/examples/tool-idea-codrops-3.jpg' },
  { name: 'Reactive Glow Grid', url: 'https://21st.dev/@carolinaraulino/components/reactive-glow-grid', by: '@carolinaraulino on 21st.dev', note: 'Neon light bleeds along the glass seams of a Mondrian grid.', image: '/examples/tool-idea-21st-8.jpg' },
  { name: 'Color Bends', url: 'https://reactbits.dev/backgrounds/color-bends', by: 'React Bits', note: 'Thin domain-warped light bands that look like long-exposure neon trails.', image: '/examples/tool-idea-reactbits-color-bends.jpg' },
  { name: 'Event Horizon', url: 'https://radiant-shaders.com/shader/event-horizon', by: 'Radiant Shaders', note: 'A raymarched black hole with a lensed accretion disk, all in one fragment shader.', image: '/examples/tool-idea-radiant-event-horizon.jpg' },
  { name: 'Torn Paper', url: 'https://radiant-shaders.com/shader/torn-paper', by: 'Radiant Shaders', note: 'Paper tears open and light pours through: a stage change you can scrub.', image: '/examples/tool-idea-radiant-torn-paper.jpg' },
  { name: 'Halftone CMYK', url: 'https://shaders.paper.design/halftone-cmyk', by: 'Paper Shaders (paper.design)', note: 'Real four-screen halftone at classic screen angles on warm paper.', image: '/examples/tool-idea-paper-halftone-cmyk.jpg' },
  { name: 'Fractal topography', url: 'https://motion.dev/examples/js-three-shader-topography', by: 'Matt Perry, Motion', note: 'A layered risograph print (contours, dots, overprint) built in one texture-free shader.', image: '/examples/tool-idea-motion-1.jpg' },
  { name: 'Typography Vortex', url: 'https://threeui.com/text-animation/typography-vortex', by: 'ThreeUI', note: 'A tunnel of counter-rotating text rings zooming toward the viewer.', image: '/examples/tool-idea-threeui-11.jpg' },
  { name: 'ShaderGradient', url: 'https://www.shadergradient.co/', by: 'ruucm (ShaderGradient)', note: 'Displaced-mesh gradients that fold like silk, with presets stored as parameters.', image: '/examples/tool-idea-shadergradient-1.jpg' },
  { name: 'Three.js scroll-driven logo', url: 'https://motion.dev/examples/js-three-scroll', by: 'Motion', note: "An extruded logo's wireframe draws itself in, then fills with chrome as you scroll.", image: '/examples/tool-idea-motion-3.jpg' },
];

/** Each principle opens with its numbered rule from The rules and, where one exists, a live experience. */
const PRINCIPLES: Array<{ key: keyof typeof examples; title: string; rule: { n: string; text: string; href: string }; live: string[] }> = [
  { key: 'typography', title: 'Typography', rule: { n: '05', text: 'Type is chosen and set for reading. Body 16px or more, lines 65ch or fewer.', href: '/docs/rules/scales-and-type' }, live: ['flying-type'] },
  { key: 'colour', title: 'Colour', rule: { n: '03', text: 'One accent, one meaning. Body text meets 4.5:1, large text 3:1.', href: '/docs/rules/tokens-and-colour' }, live: ['palette-thief', 'glass-lens'] },
  { key: 'layout', title: 'Layout', rule: { n: '06', text: 'Mobile first, and 390px never scrolls sideways.', href: '/docs/rules/breakpoints-and-layout' }, live: ['flip-bento'] },
  { key: 'hierarchy', title: 'Hierarchy', rule: { n: '04', text: 'Every size comes from a scale. Scale is what makes the reading order obvious.', href: '/docs/rules/scales-and-type' }, live: ['kinetic-poster'] },
  { key: 'specimen', title: 'Specimen', rule: { n: '01', text: 'Every value is a token. A specimen is the system, shown off.', href: '/docs/rules/tokens-and-colour' }, live: [] },
  { key: 'editorial', title: 'Editorial', rule: { n: '12', text: 'Words and speed are part of the design. Buttons say what they do.', href: '/docs/rules/copy' }, live: [] },
  { key: 'darkmode', title: 'Dark mode', rule: { n: '11', text: 'It meets WCAG 2.2 AA. Measure contrast on the dark ground too.', href: '/docs/rules/accessibility' }, live: [] },
];

export default function InspirationPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
      <header className="pt-12 pb-8 sm:pt-16">
        <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
          [INSPIRATION] <span className="text-[var(--v-ink)]">/inspiration</span>
        </p>
        <h1 className="pixel mt-6 max-w-[20ch] text-[32px] leading-[32px] sm:text-[64px] sm:leading-[64px]">Design inspiration, by principle</h1>
        <p className="mt-6 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
          Not a list of sites. Each section starts with the rule it teaches and a live piece that shows it, then the screenshots
          that do it best. Steal the technique, never the asset.
        </p>
        <nav aria-label="Sections" className="pixel mt-8 flex flex-wrap gap-2 text-[16px] leading-[16px]">
          {[{ key: 'experiments', title: 'Experiments & tools' }, ...PRINCIPLES].map((p) => (
            <a
              key={p.key}
              href={`#${p.key}`}
              className="border border-[var(--v-steel)] px-2 py-1 text-[var(--v-soft)] outline-none hover:border-[var(--v-ink)] hover:text-[var(--v-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]"
            >
              {p.title}
            </a>
          ))}
        </nav>
      </header>

      <PostersProvider ids={posterIds()}>
        <section id="experiments" className="scroll-mt-20 border-t border-[var(--v-line)] pt-12">
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[FEATURED]</p>
          <h2 className="pixel mt-4 text-[32px] leading-[32px] sm:text-[48px] sm:leading-[48px]">Experiments & tools</h2>
          <p className="mt-4 mb-10 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
            The pieces the experiences here learned from. Every one is credited and links to the original.
          </p>
          <InspirationGrid items={FEATURED} label="experiments" />
        </section>

        {PRINCIPLES.map((p) => {
          const items = (examples[p.key] as Shot[]) ?? [];
          return (
            <section key={p.key} id={p.key} className="mt-24 scroll-mt-20 border-t border-[var(--v-line)] pt-12">
              <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
                [{p.key.toUpperCase()}] <span>({items.length})</span>
              </p>
              <h2 className="pixel mt-4 text-[32px] leading-[32px] sm:text-[48px] sm:leading-[48px]">{p.title}</h2>
              <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <AsciiFrame title={`rule ${p.rule.n}`} right="the rules" invert>
                  <p className="pixel text-[16px] leading-[16px]">[{p.rule.n}]</p>
                  <p className="mt-3 font-display text-[28px] leading-[1.15] sm:text-[36px]">{p.rule.text}</p>
                  <Link
                    href={p.rule.href}
                    className="pixel mt-5 inline-block text-[16px] leading-[16px] underline underline-offset-4 outline-none hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-bg)]"
                  >
                    read rule {p.rule.n} →
                  </Link>
                </AsciiFrame>
                <InspirationLive ids={p.live} />
              </div>
              <div className="mt-10">
                <InspirationGrid items={items} label={p.key} />
              </div>
            </section>
          );
        })}
      </PostersProvider>
    </div>
  );
}
