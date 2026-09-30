import Link from "next/link";
import { ring } from "./views";

const STEPS = [
  {
    n: "01",
    title: "Hierarchy first",
    body: [
      "Before anything else, I squint. I blur my eyes until I can’t read the words, and I ask what I see first, second and third. That order is the hierarchy: what the page wants me to look at, and in what order.",
      "If the first thing I see isn’t the most important thing, nothing else on the site will save it. Size, weight, contrast and space do this work. Colour and motion come later.",
    ],
    link: {
      href: "/examples?view=sites#s-hierarchy",
      label: "sites with clear hierarchy",
    },
  },
  {
    n: "02",
    title: "Then type",
    body: [
      "Next I count the type sizes. Good sites use fewer than I expect, often four or five. I look at the line length of the body text, the gap between lines, and how big the jump is from body to heading.",
      "I note one pairing: which family does the shouting and which does the reading. That pairing is often the whole personality of the site.",
    ],
    link: {
      href: "/docs/rules/scales-and-type",
      label: "my rules for scales and type",
    },
  },
  {
    n: "03",
    title: "Then colour",
    body: [
      "I count the colours too. Most sites I love have a ground, an ink, a few greys and one accent. The accent tells me where to click. If everything is loud, nothing is.",
      "I check what happens to text on colour. Is it still easy to read? The best sites pick black or white by contrast, never a tint that almost works.",
    ],
    link: {
      href: "/docs/how-to/make-colour-look-expensive",
      label: "make colour look expensive",
    },
  },
  {
    n: "04",
    title: "Then motion",
    body: [
      "Last, I scroll slowly and click everything. I watch how long things take and how they slow down at the end. That slowing down is the ease: the curve that sets how a movement speeds up and settles.",
      "I ask whether the motion explains something (where a panel came from, what just changed) or just performs. I keep the first kind.",
    ],
    link: { href: "/docs/how-to/pick-an-ease", label: "pick an ease" },
  },
];

export function ThinkView() {
  return (
    <article aria-labelledby="think-title" className="mt-10 pb-8">
      <h2
        id="think-title"
        className="font-display text-[40px] leading-[1.05] sm:text-[56px]"
      >
        How I look at a site
      </h2>
      <p className="mt-6 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
        When I open a site I like, I don&rsquo;t try to take it all in. I look
        at it in the same order every time, and I leave with one thing. Here is
        that order.
      </p>

      <ol className="mt-10 grid gap-px border border-[var(--v-line)] bg-[var(--v-line)] md:grid-cols-2">
        {STEPS.map((s) => (
          <li key={s.n} className="flex flex-col bg-[var(--v-bg)] p-5 sm:p-8">
            <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
              [{s.n}]
            </p>
            <h3 className="font-display mt-3 text-[28px] leading-[1.15] sm:text-[34px]">
              {s.title}
            </h3>
            {s.body.map((para) => (
              <p
                key={para.slice(0, 24)}
                className="mt-4 text-[17px] leading-[1.6] text-[var(--v-soft)]"
              >
                {para}
              </p>
            ))}
            <p className="mt-auto pt-6">
              <Link
                href={s.link.href}
                className={`pixel text-[16px] leading-[16px] text-[var(--v-ink)] underline-offset-4 hover:underline ${ring}`}
              >
                → {s.link.label}
              </Link>
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-16 grid gap-10 lg:grid-cols-2 lg:gap-12">
        <section
          aria-labelledby="one-thing"
          className="border-t border-[var(--v-line)] pt-10"
        >
          <h3
            id="one-thing"
            className="font-display text-[28px] leading-[1.15] sm:text-[34px]"
          >
            Take one thing from each site
          </h3>
          <p className="mt-4 text-[17px] leading-[1.6] text-[var(--v-soft)]">
            I write down a single idea per site. The way one footer lists its
            links. The size jump between two headings. A hover that lifts a card
            by one shade of grey. One idea is small enough to reuse and too
            small to copy a whole look.
          </p>
          <p className="mt-4 text-[17px] leading-[1.6] text-[var(--v-soft)]">
            Ten sites later I have ten ideas, and they mix into something that
            is mine.
          </p>
        </section>

        <figure className="border border-[var(--v-steel)] bg-[var(--v-surface)] p-6 sm:p-10">
          <blockquote>
            <p className="font-display text-[36px] italic leading-[1.1] sm:text-[56px]">
              Steal a palette, not a layout.
            </p>
          </blockquote>
          <figcaption className="mt-6 text-[17px] leading-[1.6] text-[var(--v-soft)]">
            A palette, a type pairing or an ease is an idea. You can carry it
            into your own work and it still fits. A layout is someone
            else&rsquo;s answer to someone else&rsquo;s content. Copy it and
            your page ends up saying their thing.
          </figcaption>
        </figure>
      </div>

      <p className="mt-10 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
        Want to practise?{" "}
        <Link
          href="/examples"
          className={`text-[var(--v-ink)] underline underline-offset-4 ${ring}`}
        >
          Open the sites
        </Link>
        , pick one, and go through the four steps. Write down one thing. Then
        close the tab.
      </p>
    </article>
  );
}
