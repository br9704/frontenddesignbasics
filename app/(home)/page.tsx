import Image from 'next/image';
import Link from 'next/link';
import { InkField } from '@/components/ink-field';
import { NameMarquee, ScrollGallery } from '@/components/scroll-gallery';
import { showcase } from '@/lib/showcase';
import toolkit from '@/toolkit/toolkit.json';

/* Chapter cards: each carries a real picture, so the contents page is itself a gallery. */
const chapters = [
  { n: '01', title: 'Principles', href: '/docs/principles', text: 'Type, space, colour, hierarchy.', img: '/showcase/teenage.jpg', span: 'md:col-span-2 md:row-span-2' },
  { n: '02', title: 'Motion', href: '/docs/motion', text: 'Easing, duration, reduced motion.', img: '/showcase/cosmos.jpg', span: '' },
  { n: '03', title: '3D', href: '/docs/3d', text: 'When a scene earns its weight.', img: '/showcase/igloo.jpg', span: '' },
  { n: '04', title: 'Shaders', href: '/docs/shaders', text: 'The hero shader, uniform by uniform.', img: '/banners/shaders.jpg', span: 'md:col-span-2' },
  { n: '05', title: 'Components', href: '/docs/components', text: 'Own your components.', img: '/showcase/family.jpg', span: '' },
  { n: '06', title: 'Recipes', href: '/docs/recipes', text: 'Hero, bento, scroll story.', img: '/showcase/linear.jpg', span: '' },
  { n: '07', title: 'AI assets', href: '/docs/ai-assets', text: 'Higgsfield, prompts, generators.', img: '/banners/ai-assets.jpg', span: 'md:row-span-2' },
  { n: '08', title: 'Specimen', href: '/docs/specimen', text: 'This site’s own system, as posters.', img: '/banners/principles.jpg', span: '' },
  { n: '09', title: 'Conventions', href: '/docs/conventions', text: 'Tokens, scales, states, accessibility, copy.', img: '/examples/layout-pentagram.jpg', span: '' },
  { n: '10', title: 'Case studies', href: '/docs/case-studies/br95', text: 'Decisions, not just screenshots.', img: '/showcase/br95.jpg', span: 'md:col-span-2' },
  { n: '11', title: 'Showcase', href: '/docs/showcase', text: 'Hundreds of standout sites, by category.', img: '/showcase/lusion.jpg', span: '' },
  { n: '12', title: 'Toolkit', href: '/docs/toolkit', text: `${toolkit.tools.length} tools, MCPs and skills.`, img: '/showcase/raycast.jpg', span: 'md:col-span-2' },
  { n: '13', title: 'Workflow', href: '/docs/workflow', text: 'Ask first, prove motion.', img: '/showcase/basement.jpg', span: 'md:col-span-2' },
];

export default function HomePage() {
  return (
    <main className="flex-1">
      {/* Hero: a printed plate. It stays paper-toned in dark mode on purpose. */}
      <section className="relative isolate mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-6">
        <div className="relative min-h-[82svh] overflow-hidden rounded-xl bg-[#f2eee6] text-[#16140f]">
          <InkField />
          <div className="relative flex min-h-[82svh] flex-col justify-between p-6 sm:p-10 lg:p-14">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em]">A field guide · est. 2026</p>
            <div>
              <h1 className="max-w-[14ch] font-display text-[clamp(3rem,9vw,8.5rem)] leading-[0.9] tracking-[-0.035em]">
                Complete, <em className="italic">beautiful</em> web design.
              </h1>
              <p className="mt-6 max-w-[44ch] text-[clamp(1rem,1.4vw,1.2rem)] leading-snug">
                The principles, motion, 3D and shaders behind sites people remember. Every idea comes with a live demo,
                a diagram, the code, and the reason it works.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/docs"
                  className="rounded-full bg-[#16140f] px-5 py-2.5 text-sm text-[#f2eee6] transition-transform duration-200 ease-[var(--ease-out-quint)] hover:-translate-y-0.5"
                >
                  Start reading
                </Link>
                <Link
                  href="/docs/toolkit"
                  className="rounded-full border border-[#16140f]/30 bg-[#f2eee6]/70 px-5 py-2.5 text-sm backdrop-blur transition-colors hover:border-[#16140f]"
                >
                  Open the toolkit
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-10">
        <NameMarquee />
      </div>

      {/* Contents as a bento of image cards. */}
      <section className="mx-auto w-full max-w-[1400px] px-4 py-20 sm:px-6 lg:py-28">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-soft)]">Contents</p>
            <h2 className="mt-3 font-display text-4xl leading-tight tracking-[-0.02em] sm:text-5xl">Thirteen chapters, one standard.</h2>
          </div>
          <p className="max-w-[40ch] text-[var(--text-soft)]">
            Every page follows the same template: see it, read the code, install it, know why.
          </p>
        </div>
        <div className="grid auto-rows-[15rem] grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {chapters.map((c) => (
            <Link
              key={c.n}
              href={c.href}
              className={`group relative overflow-hidden rounded-xl border border-[var(--rule)] ${c.span}`}
            >
              <Image
                src={c.img}
                alt=""
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover object-top transition-transform duration-[900ms] ease-[var(--ease-out-quint)] group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f0e0b]/90 via-[#0f0e0b]/25 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-[#f2eee6]">
                <p className="font-mono text-[11px] opacity-70">{c.n}</p>
                <p className="font-display text-3xl leading-tight tracking-[-0.01em]">{c.title}</p>
                <p className="mt-1 max-w-[34ch] text-sm opacity-80">{c.text}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <ScrollGallery />

      {/* How to use it with an agent */}
      <section className="mx-auto w-full max-w-[1400px] px-4 py-20 sm:px-6 lg:py-28">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-soft)]">Use it with your agent</p>
            <h2 className="mt-3 font-display text-4xl leading-tight tracking-[-0.02em] sm:text-5xl">
              Install the skill. Ask what fits.
            </h2>
            <p className="mt-4 max-w-[46ch] text-[var(--text-soft)]">
              The guide ships as an agent skill. Install it once, and at the start of every project your agent reads the
              toolkit and principles, proposes what fits the brief, and asks you to choose before designing.
            </p>
            <code className="mt-6 block w-fit rounded-md bg-[var(--color-fd-muted)] px-3 py-2 font-mono text-sm">
              npx skills add br9704/frontenddesignbasics
            </code>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-[#16140f] p-6 font-mono text-[13px] leading-relaxed text-[#ece6da]">
            <span className="text-[#a39c8d]">you ›</span> new landing page for a coffee roaster.{'\n'}
            {'      '}anything in frontenddesignbasics we can use?{'\n\n'}
            <span className="text-[#ff7a45]">agent ›</span> From the toolkit: Lenis + GSAP for a{'\n'}
            {'        '}scroll story, ShaderGradient for a warm{'\n'}
            {'        '}roast-tone hero, Refero for café flows.{'\n'}
            {'        '}Principles: a 1.333 type scale, one{'\n'}
            {'        '}accent, reduced-motion fallbacks.{'\n'}
            {'        '}Which of these do you want?
          </pre>
        </div>
      </section>

      <footer className="border-t border-[var(--rule)]">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-[var(--text-soft)] sm:px-6">
          <span>
            Made by <a href="https://brunojaamaa.dev" className="underline underline-offset-4">Bruno Jaamaa</a>. MIT licensed.
          </span>
          <a href="https://github.com/br9704/frontenddesignbasics" className="underline underline-offset-4">
            github.com/br9704/frontenddesignbasics
          </a>
        </div>
      </footer>
    </main>
  );
}
