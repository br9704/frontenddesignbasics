import Link from "next/link";
import { source } from "@/lib/source";
import { ring } from "./views";

/** Case studies of other people's sites. My own (BR95) and the deck case stay out of this list. */
const EXCLUDE = new Set(["br95", "balatro-deck"]);

/** Lead screenshot per case, taken from the case page itself. github-globe has none, so it gets a drawn dot globe. */
const SHOTS: Record<string, { src: string; alt: string }> = {
  "bruno-simon-folio": {
    src: "/examples/case-bruno-simon-folio-2.jpg",
    alt: "Bruno Simon\u2019s portfolio: a red off-road car on a pink-lit path between trees and large purple 3D letters",
  },
  "emil-sonner": {
    src: "/examples/case-emil-sonner-1.jpg",
    alt: "The Sonner site with three toasts stacked in the bottom-right corner",
  },
  "igloo-inc": {
    src: "/examples/case-igloo-inc-1.jpg",
    alt: "The Igloo Inc. home screen: a glowing igloo of ice blocks in a snowy mountain landscape",
  },
  "josh-comeau": {
    src: "/examples/case-josh-comeau-1.jpg",
    alt: "Josh W. Comeau\u2019s blog home page",
  },
  "linear-redesign": {
    src: "/examples/case-linear-redesign-1.jpg",
    alt: "Linear\u2019s homepage in dark mode: a large white headline on near-black above a product screenshot",
  },
  "stripe-connect": {
    src: "/examples/case-stripe-connect-2.jpg",
    alt: "The Stripe Connect page: a dark headline, faint dashed grid lines and a phone showing a dashboard",
  },
  "vercel-3d-badge": {
    src: "/examples/case-vercel-3d-badge-1.jpg",
    alt: "The Vercel badge hanging from its lanyard: a black card with a large SHIP graphic",
  },
};

function DotGlobe() {
  return (
    <svg
      viewBox="0 0 320 180"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
    >
      <rect width="320" height="180" fill="#05070d" />
      <defs>
        <clipPath id="globe-clip">
          <circle cx="160" cy="98" r="70" />
        </clipPath>
      </defs>
      <circle
        cx="160"
        cy="98"
        r="72"
        fill="none"
        stroke="#2c3a66"
        strokeWidth="1"
      />
      <g clipPath="url(#globe-clip)" fill="#8aa4ff">
        {Array.from({ length: 15 }, (_, row) =>
          Array.from({ length: 30 }, (_, col) => {
            const y = 34 + row * 9;
            const lat = (y - 98) / 70;
            const w = Math.sqrt(Math.max(0, 1 - lat * lat)) * 70;
            const x = 160 - w + ((col + 0.5) / 30) * 2 * w;
            const on = (row * 7 + col * 3) % 5 < 3 && !(row > 9 && col < 12);
            return on ? (
              <circle
                key={`${row}-${col}`}
                cx={x.toFixed(1)}
                cy={y}
                r={0.5 + (1 - Math.abs(lat)) * 1.1}
                opacity={0.35 + (1 - Math.abs(lat)) * 0.5}
              />
            ) : null;
          }),
        )}
      </g>
      <path
        d="M112 70 C 150 20, 210 30, 222 96"
        fill="none"
        stroke="#ff7ac6"
        strokeWidth="1.5"
      />
      <path
        d="M130 120 C 170 60, 230 70, 206 132"
        fill="none"
        stroke="#7af0ff"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function BreakdownsView() {
  const cases = source
    .getPages()
    .filter(
      (p) =>
        p.slugs.length === 2 &&
        p.slugs[0] === "cases" &&
        !EXCLUDE.has(p.slugs[1]),
    );
  return (
    <div>
      <p className="mt-8 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
        Great sites taken apart, using their makers&rsquo; own write-ups. Each
        one says what they decided, how they built it, and what I take from it.
      </p>
      <h2 className="sr-only">Case studies</h2>
      <ol className="mt-8 grid gap-px border border-[var(--v-line)] bg-[var(--v-line)] md:grid-cols-2">
        {cases.map((p, i) => (
          <li key={p.url} className="bg-[var(--v-bg)]">
            <Link
              href={p.url}
              className={`group flex h-full flex-col p-4 hover:bg-[var(--v-surface)] sm:p-6 ${ring}`}
            >
              <div className="relative mb-5 aspect-[16/9] overflow-hidden border border-[var(--v-line)] bg-[var(--v-surface)]">
                {SHOTS[p.slugs[1]] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={SHOTS[p.slugs[1]].src}
                    alt={SHOTS[p.slugs[1]].alt}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover object-top motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.02]"
                  />
                ) : (
                  <DotGlobe />
                )}
              </div>
              <span className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
                [{String(i + 1).padStart(2, "0")}] {p.slugs[1]}
              </span>
              <h3 className="font-display mt-4 text-[26px] leading-[1.15] text-[var(--v-ink)] sm:text-[30px]">
                {p.data.title}
              </h3>
              {p.data.description ? (
                <p className="mt-3 flex-1 text-[16px] leading-[1.55] text-[var(--v-soft)]">
                  {p.data.description}
                </p>
              ) : null}
              <span className="pixel mt-4 text-[16px] leading-[16px] text-[var(--v-ink)] group-hover:underline group-hover:underline-offset-4">
                read the breakdown →
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
