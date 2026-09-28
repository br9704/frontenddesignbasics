import Image from 'next/image';
import Link from 'next/link';
import { InkField } from '@/components/ink-field';
import { showcase } from '@/lib/showcase';
import toolkit from '@/toolkit/toolkit.json';

const chapters = [
  { n: '01', title: 'Principles', href: '/docs/principles', text: 'Type, space, colour, hierarchy. The rules that make anything look considered.', ready: true },
  { n: '02', title: 'Motion', href: '/docs/motion', text: 'Easing, duration, choreography, and respecting reduced motion.', ready: true },
  { n: '03', title: '3D', href: '/docs/3d', text: 'three.js, R3F, Threlte, Spline: when a scene earns its weight.', ready: true },
  { n: '04', title: 'Shaders', href: '/docs/shaders', text: 'Gradients, noise and ink. Play with the hero above, uniform by uniform.', ready: true },
  { n: '05', title: 'Components', href: '/docs/components', text: 'React Bits, Magic UI, Cult UI, 21st.dev, through one registry.', ready: true },
  { n: '06', title: 'Recipes', href: '/docs/recipes', text: 'Heroes, scroll stories, bento grids, footers, built end to end.', ready: true },
  { n: '07', title: 'Case studies', href: '/docs/case-studies/br95', text: 'How real sites were designed and built, decisions included.', ready: true },
  { n: '08', title: 'Showcase', href: '/docs/showcase', text: 'Standout sites by other people, and what to steal from each.', ready: true },
  { n: '09', title: 'Toolkit', href: '/docs/toolkit', text: `${toolkit.tools.length} tools, MCPs and skills, with when to reach for each.`, ready: true },
  { n: '10', title: 'Workflow', href: '/docs/workflow', text: 'Ask first, clone real assets, prove motion with frames.', ready: true },
];

export default function HomePage() {
  const picks = showcase.filter((s) => ['linear', 'lusion', 'rauno'].includes(s.id));

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
                the code, and the reason it works.
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

      {/* Contents: a book's table of contents, because this is one. */}
      <section className="mx-auto w-full max-w-[1400px] px-4 py-20 sm:px-6 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-soft)]">Contents</p>
            <h2 className="mt-3 font-display text-4xl leading-tight tracking-[-0.02em] sm:text-5xl">
              Ten chapters, one standard.
            </h2>
            <p className="mt-4 max-w-[38ch] text-[var(--text-soft)]">
              Every page follows the same template: a live demo, the code, how to install it, and why it works.
            </p>
          </div>
          <ol className="border-t border-[var(--rule)]">
            {chapters.map((c) => (
              <li key={c.n} className="border-b border-[var(--rule)]">
                <Link
                  href={c.href}
                  className="group grid grid-cols-[3rem_1fr] items-baseline gap-x-4 gap-y-1 py-5 sm:grid-cols-[3rem_12rem_1fr_auto]"
                >
                  <span className="font-mono text-xs text-[var(--text-soft)] tabular-nums">{c.n}</span>
                  <span className="font-display text-2xl tracking-[-0.01em] transition-colors group-hover:text-[var(--accent)]">
                    {c.title}
                  </span>
                  <span className="col-start-2 text-sm text-[var(--text-soft)] sm:col-start-auto">{c.text}</span>
                  <span className="col-start-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-soft)] sm:col-start-auto">
                    {c.ready ? 'Read →' : 'Soon'}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Showcase teaser */}
      <section className="border-y border-[var(--rule)] bg-[var(--surface-raised)]">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-20 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-[18ch] font-display text-4xl leading-tight tracking-[-0.02em] sm:text-5xl">
              Learn from sites that already got it right.
            </h2>
            <Link href="/docs/showcase" className="text-sm underline underline-offset-4">
              See all {showcase.length} →
            </Link>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {picks.map((s) => (
              <Link key={s.id} href="/docs/showcase" className="group block">
                <div className="relative aspect-[16/10] overflow-hidden rounded-md border border-[var(--rule)]">
                  <Image
                    src={`/showcase/${s.id}.jpg`}
                    alt={`Screenshot of ${s.name}`}
                    fill
                    sizes="(min-width: 768px) 30vw, 100vw"
                    className="object-cover object-top transition-transform duration-700 ease-[var(--ease-out-quint)] group-hover:scale-[1.03]"
                  />
                </div>
                <p className="mt-3 font-display text-xl">{s.name}</p>
                <p className="mt-1 text-sm text-[var(--text-soft)]">{s.why}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How to use it with an agent */}
      <section className="mx-auto w-full max-w-[1400px] px-4 py-20 sm:px-6 lg:py-28">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-soft)]">Use it with your agent</p>
            <h2 className="mt-3 font-display text-4xl leading-tight tracking-[-0.02em] sm:text-5xl">
              Point at the repo. Ask what fits.
            </h2>
            <p className="mt-4 max-w-[46ch] text-[var(--text-soft)]">
              The toolkit is one JSON file, and the whole guide is available as <code>llms.txt</code>. Start a project, point
              your agent here, and it proposes the principles and tools that fit the brief before a line is designed.
            </p>
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
