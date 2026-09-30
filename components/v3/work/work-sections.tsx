import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { MADE_HERE, OFFERS } from "./work-data";

const SITE = "https://brunojaamaa.dev";

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
      {children}
    </p>
  );
}

const linkBtn =
  "pixel inline-block border border-[var(--v-line)] px-3 py-2 text-[16px] leading-[16px] text-[var(--v-ink)] hover:border-[var(--v-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]";

export function FeaturedBr95() {
  return (
    <section
      aria-labelledby="featured"
      className="border-t border-[var(--v-line)] pt-10"
    >
      <Eyebrow>[FEATURED] brunojaamaa.dev</Eyebrow>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-end">
        <a
          href={SITE}
          className="block overflow-hidden border border-[var(--v-line)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]"
        >
          <Image
            src="/showcase/br95-work.jpg"
            alt="The BR95 desktop: pixel icons and folders down the left, a Welcome to BR95 dialog in the middle, a dotted map as wallpaper and a Windows 95 taskbar along the bottom"
            width={1440}
            height={900}
            sizes="(min-width: 1024px) 60vw, 100vw"
            className="h-auto w-full"
            priority
          />
        </a>
        <div>
          <h2
            id="featured"
            className="font-display text-[40px] leading-[1.05] sm:text-[56px]"
          >
            BR95
          </h2>
          <div className="mt-5 max-w-[48ch] space-y-3 text-[17px] leading-[1.6] text-[var(--v-soft)]">
            <p>My own site is a Windows 95 desktop that runs in the browser.</p>
            <p>
              It boots like an old PC. Then you drag windows, open the Start
              menu and meet a desktop cat called BUBBA.
            </p>
            <p>
              Every window is still a real page underneath, so search engines
              and screen readers can read it all.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={SITE} className={linkBtn}>
              [visit site ↗]
            </a>
            <Link href="/docs/cases/br95" className={linkBtn}>
              [how it was made]
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MadeHereGrid({ total }: { total: number }) {
  return (
    <section
      id="made-here"
      aria-labelledby="made-here-h"
      className="mt-20 scroll-mt-20 border-t border-[var(--v-line)] pt-10"
    >
      <Eyebrow>
        [MADE HERE] {MADE_HERE.length} of {total}
      </Eyebrow>
      <h2
        id="made-here-h"
        className="mt-4 font-display text-[36px] leading-[1.1] sm:text-[48px]"
      >
        Made for this site
      </h2>
      <p className="mt-4 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
        I built each of these to learn a tool properly. Each one says what I
        would use it for on a real site. Open any of them to play with it full
        screen.
      </p>
      <ul className="mt-8 grid gap-px border border-[var(--v-line)] bg-[var(--v-line)] sm:grid-cols-2 lg:grid-cols-5">
        {MADE_HERE.map((m) => (
          <li key={m.id} className="bg-[var(--v-bg)]">
            <Link
              href={`/lab/${m.id}`}
              className="group block h-full p-3 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--v-ink)]"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[var(--v-surface)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/posters/${m.id}.webp`}
                  alt={m.alt}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <h3 className="pixel mt-3 text-[16px] leading-[16px] text-[var(--v-ink)] group-hover:underline group-hover:underline-offset-4">
                {m.title}
              </h3>
              <p className="mt-2 text-[15px] leading-[1.5] text-[var(--v-soft)]">
                <span className="text-[var(--v-dim)]">Use it for </span>
                {m.useFor}.
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6">
        <Link href="/make" className={linkBtn}>
          [see all {total} →]
        </Link>
      </p>
    </section>
  );
}

export function OfferTiles() {
  return (
    <section
      aria-labelledby="offers"
      className="mt-20 border-t border-[var(--v-line)] pt-10"
    >
      <Eyebrow>[FOR YOU] {OFFERS.length} kinds of site</Eyebrow>
      <h2
        id="offers"
        className="mt-4 font-display text-[36px] leading-[1.1] sm:text-[48px]"
      >
        What I could make for you
      </h2>
      <p className="mt-4 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
        These are the kinds of sites I like building. Where I have already made
        something close, the tile links to it. A concept is an idea I have not
        built here yet.
      </p>
      <ul className="mt-8 grid gap-px border border-[var(--v-line)] bg-[var(--v-line)] sm:grid-cols-2 lg:grid-cols-4">
        {OFFERS.map((o) => (
          <li
            key={o.title}
            className="bg-[var(--v-bg)] sm:last:col-span-2 lg:last:col-span-2"
          >
            {o.demo ? (
              <Link
                href={`/lab/${o.demo.id}`}
                className="group flex h-full flex-col p-3 hover:bg-[var(--v-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--v-ink)]"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-[var(--v-surface)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/posters/${o.demo.id}.webp`}
                    alt={`Still of ${o.demo.title}, the closest thing I have built to a ${o.title.toLowerCase()}`}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <h3 className="pixel mt-4 px-1 text-[16px] leading-[16px] text-[var(--v-ink)]">
                  {o.title}
                </h3>
                <p className="mt-3 flex-1 px-1 text-[15px] leading-[1.5] text-[var(--v-soft)]">
                  {o.what}
                </p>
                <span className="pixel mt-4 px-1 text-[14px] leading-[16px] text-[var(--v-dim)] underline underline-offset-4 group-hover:text-[var(--v-ink)]">
                  demo: {o.demo.title} →
                </span>
              </Link>
            ) : (
              <div className="flex h-full flex-col p-3">
                <ConceptChart />
                <h3 className="pixel mt-4 px-1 text-[16px] leading-[16px] text-[var(--v-ink)]">
                  {o.title}
                </h3>
                <p className="mt-3 flex-1 px-1 text-[15px] leading-[1.5] text-[var(--v-soft)]">
                  {o.what}
                </p>
                <p className="pixel mt-4 px-1 text-[14px] leading-[16px] text-[var(--v-dim)]">
                  [concept] not built here yet
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A still, drawn chart for the one concept tile: a data story sketched in bars, one of them picked out. */
function ConceptChart() {
  const bars = [22, 30, 26, 38, 34, 47, 44, 58, 55, 71, 66, 86];
  return (
    <div
      aria-hidden="true"
      className="relative flex aspect-[16/9] items-end gap-[3%] overflow-hidden border border-dashed border-[var(--v-steel)] bg-[var(--v-surface)] px-[5%] pb-[6%] pt-[12%] sm:aspect-[32/9]"
    >
      <span className="pixel absolute left-3 top-3 text-[14px] leading-[16px] text-[var(--v-dim)]">
        sketch · 12 months
      </span>
      {bars.map((h, i) => (
        <span
          key={i}
          className={
            i === bars.length - 1
              ? "flex-1 bg-[var(--v-ink)]"
              : "flex-1 bg-[var(--v-dim)] opacity-60"
          }
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

export function GetInTouch() {
  return (
    <section
      aria-labelledby="touch"
      className="mt-20 border-t border-[var(--v-line)] pt-10 pb-24"
    >
      <div className="border border-[var(--v-line)] bg-[var(--v-surface)] p-6 sm:p-10">
        <Eyebrow>[CONTACT] brunojaamaa.dev</Eyebrow>
        <h2
          id="touch"
          className="mt-4 font-display text-[36px] leading-[1.1] sm:text-[56px]"
        >
          Get in touch
        </h2>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
          If you have a site in mind, or one of these pieces sparked an idea,
          you can reach me through my own site.
        </p>
        <a
          href={SITE}
          className="pixel mt-8 inline-block bg-[var(--v-ink)] px-4 py-3 text-[16px] leading-[16px] text-[var(--v-bg)] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]"
        >
          [brunojaamaa.dev ↗]
        </a>
      </div>
    </section>
  );
}
