import Link from 'next/link';
import { isKnown } from './data';
import { ring, ToolChip } from './tool-chip';

/* Three decision trees drawn as ladders: ask each question in order, take the first "yes".
   Plain HTML so they read as nested lists to a screen reader and reflow at 390px. */

interface Answer {
  tools: string[];
  text: string;
}
interface Tree {
  id: string;
  title: string;
  lead: string;
  steps: Array<{ q: string; yes: Answer }>;
  otherwise: Answer;
  link?: { href: string; label: string };
}

const TREES: Tree[] = [
  {
    id: 'tree-3d',
    title: 'Do I need 3D?',
    lead: 'Most of the time I don’t. 3D costs load time and battery, so it has to earn its place.',
    steps: [
      {
        q: 'Does the idea still work flat, with shadows, layers and parallax?',
        yes: { tools: ['gsap'], text: 'Stay 2D. CSS, SVG and GSAP fake depth for almost nothing.' },
      },
      {
        q: 'Is it one flat surface with an effect on it, like a moving background?',
        yes: { tools: ['ogl'], text: 'That’s a shader, not a scene. OGL draws it on one plane.' },
      },
      {
        q: 'Will a designer build it by hand, and will it rarely change?',
        yes: { tools: ['spline', 'vectary'], text: 'Build it in a no-code editor and embed it. Vectary if it’s a product mockup.' },
      },
      {
        q: 'Do I only need a ready piece, like an orb, a globe or a card?',
        yes: { tools: ['threeui'], text: 'Take the piece and restyle it.' },
      },
    ],
    otherwise: {
      tools: ['threejs', 'r3f', 'postprocessing'],
      text: 'Write the scene in three.js with React Three Fiber. Add postprocessing for bloom or grain.',
    },
    link: { href: '/docs/how-to/pick-a-3d-tool', label: 'Pick a 3D tool' },
  },
  {
    id: 'tree-shader',
    title: 'Code the shader or design it?',
    lead: 'A shader is a small program the graphics card runs for every pixel. I can write one, or tune one in an editor.',
    steps: [
      {
        q: 'Must it react to my own data, scroll or state, and live in my repo?',
        yes: { tools: ['ogl', 'glsl'], text: 'Code it. OGL is tiny and I write the GLSL myself.' },
      },
      {
        q: 'Is it only a soft gradient that moves?',
        yes: { tools: ['shadergradient'], text: 'Tune it in their editor and paste the settings in.' },
      },
      {
        q: 'Do I want it as a React component with props, like grain, dither or liquid metal?',
        yes: { tools: ['paper-shaders'], text: 'Drop the component in and set its props.' },
      },
    ],
    otherwise: {
      tools: ['unicorn-studio'],
      text: 'Design it. Layer shaders, images and mouse effects by eye, then embed it. The free plan shows their logo and is not for commercial work. Nothing on this site runs a Unicorn Studio scene yet.',
    },
    link: { href: '/docs/how-to/shader-background', label: 'Shader background' },
  },
  {
    id: 'tree-components',
    title: 'Which component library?',
    lead: 'All of these copy the code into my project, so I can change anything later.',
    steps: [
      {
        q: 'Do I need the plain parts, like buttons, dialogs and forms, to restyle?',
        yes: { tools: ['shadcn'], text: 'Start here on every project.' },
      },
      {
        q: 'Has someone probably built this pattern already, like a pricing table or a command menu?',
        yes: { tools: ['21st'], text: 'Search the community catalogue, then install it with the shadcn command.' },
      },
      {
        q: 'Should the motion come built in?',
        yes: {
          tools: ['motion-primitives', 'magic-ui', 'react-bits'],
          text: 'Quiet motion: Motion Primitives. Landing page effects: Magic UI. Loud text and backgrounds: React Bits.',
        },
      },
      {
        q: 'Is it a dashboard with charts?',
        yes: { tools: ['bklit'], text: 'Charts that match shadcn.' },
      },
    ],
    otherwise: { tools: ['cult-ui'], text: 'Something with character, like a dynamic island or a textured button.' },
    link: { href: '/docs/how-to/own-your-components', label: 'Own your components' },
  },
];

const label = 'pixel text-[16px] leading-[16px] text-[var(--v-dim)]';

function AnswerBox({ a, tag }: { a: Answer; tag: string }) {
  return (
    <div className="min-w-0 border border-[var(--v-ink)] p-3 sm:p-4">
      <p className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">{tag}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {a.tools.filter(isKnown).map((id) => (
          <li key={id}>
            <ToolChip id={id} strong />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[15px] leading-[1.5] text-[var(--v-soft)]">{a.text}</p>
    </div>
  );
}

function TreeFigure({ t }: { t: Tree }) {
  return (
    <figure aria-labelledby={`${t.id}-h`} id={t.id} className="scroll-mt-32 border-t border-[var(--v-line)] pt-8">
      <h3 id={`${t.id}-h`} className="font-display text-[28px] leading-[1.1] sm:text-[36px]">
        {t.title}
      </h3>
      <p className="mt-3 max-w-[62ch] text-[16px] leading-[1.6] text-[var(--v-soft)]">{t.lead}</p>
      <ol className="mt-8">
        {t.steps.map((s, i) => (
          <li key={s.q}>
            <div className="grid items-center gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)]">
              <div className="min-w-0 border border-[var(--v-steel)] bg-[var(--v-surface)] p-3 sm:p-4">
                <p className={label}>Q{i + 1}</p>
                <p className="mt-2 text-[17px] leading-[1.45] text-[var(--v-ink)]">{s.q}</p>
              </div>
              {/* the "yes" branch: a rule to the right on desktop, a short drop on phones */}
              <div className="flex items-center gap-2 pl-6 md:pl-0">
                <span className="hidden h-px flex-1 bg-[var(--v-ink)] md:block" />
                <span className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">
                  <span className="sr-only">If yes:</span>
                  <span aria-hidden>
                    <span className="md:hidden">↓ </span>YES<span className="hidden md:inline"> →</span>
                  </span>
                </span>
              </div>
              <div className="pl-6 md:pl-0">
                <AnswerBox a={s.yes} tag="then use" />
              </div>
            </div>
            <div className="flex h-12 items-stretch pl-6">
              <span aria-hidden className="w-px bg-[var(--v-steel)]" />
              <span className={`${label} self-center pl-3`}>
                <span className="sr-only">If not, </span>
                <span aria-hidden>NO ↓</span>
              </span>
            </div>
          </li>
        ))}
        <li className="md:w-[calc(50%-2.5rem-1rem)]">
          <AnswerBox a={t.otherwise} tag="otherwise" />
        </li>
      </ol>
      {t.link ? (
        <figcaption className="mt-6">
          <Link href={t.link.href} className={`pixel text-[16px] leading-[16px] text-[var(--v-soft)] underline underline-offset-4 hover:text-[var(--v-ink)] ${ring}`}>
            how-to: {t.link.label} →
          </Link>
        </figcaption>
      ) : null}
    </figure>
  );
}

export function DecisionTrees() {
  return (
    <div className="mt-10 space-y-16">
      {TREES.map((t) => (
        <TreeFigure key={t.id} t={t} />
      ))}
    </div>
  );
}
