'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PAD } from './acts';
import { LiveSlot } from './live-slot';
import { FlyTitle } from './motion';
import { C, ON } from './act-motion';
import { CircleOpen } from './transitions';

/*
 * Act 06, INSPIRATION. Design inspiration as principles, not sites. Each principle opens with its
 * numbered rule in pixel type (linking to /docs/rules) on its own field colour.
 */

export interface PaletteSource {
  name: string;
  image: string;
  url: string;
}

/** Palette thief: lifts the dominant colours out of a real screenshot (same-origin canvas). */
function usePalette(src: string, n = 6) {
  const [sw, setSw] = useState<string[]>([]);
  useEffect(() => {
    const img = new window.Image();
    img.src = src;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 48;
      c.height = 30;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 48, 30);
      const d = ctx.getImageData(0, 0, 48, 30).data;
      const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
      for (let i = 0; i < d.length; i += 4) {
        const key = `${d[i] >> 5}-${d[i + 1] >> 5}-${d[i + 2] >> 5}`;
        const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        bk.n++;
        bk.r += d[i];
        bk.g += d[i + 1];
        bk.b += d[i + 2];
        buckets.set(key, bk);
      }
      const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
      setSw(
        [...buckets.values()]
          .sort((a, b) => b.n - a.n)
          .slice(0, n)
          .map((b) => `#${hex(b.r / b.n)}${hex(b.g / b.n)}${hex(b.b / b.n)}`),
      );
    };
  }, [src, n]);
  return sw;
}

function Principle({
  n,
  rule,
  title,
  text,
  field,
  children,
}: {
  n: string;
  rule: string;
  title: string;
  text: string;
  field: number;
  children: React.ReactNode;
}) {
  const ink = ON[field];
  return (
    <div style={{ background: C[field], color: ink }}>
      <div className={`grid gap-6 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] md:items-center md:py-16 ${PAD}`}>
        <div>
          <Link href={`/docs/rules#${rule}`} className="pixel text-[16px] leading-[16px] underline-offset-4 hover:underline" style={{ color: ink }}>
            [rule {n}] /docs/rules
          </Link>
          <FlyTitle from="side" className="mt-3 font-display text-[clamp(2rem,4.4vw,3.8rem)] leading-[0.95] tracking-[-0.03em]">
            {title}
          </FlyTitle>
          <p className="mt-4 max-w-[44ch] text-[17px] leading-[1.6]">{text}</p>
        </div>
        <div className="h-[56svh] min-h-[300px] border-2" style={{ borderColor: ink }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function ActInspiration({ source }: { source: PaletteSource }) {
  const swatches = usePalette(source.image);
  return (
    <section id="inspiration" data-act="6">
      <CircleOpen from={C[2]}>
        <div className="bg-[#080808]">
          <div className={`py-14 ${PAD}`}>
            <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[06 INSPIRATION] /inspiration</p>
            <FlyTitle className="mt-3 max-w-[16ch] font-display text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.95] tracking-[-0.03em]">
              Principles, <em>not</em> sites.
            </FlyTitle>
            <Link href="/inspiration" className="pixel mt-6 inline-block bg-[var(--v-ink)] px-1 text-[16px] leading-[16px] text-[var(--v-bg)]">
              [/inspiration]
            </Link>
          </div>
        </div>
      </CircleOpen>

      <Principle n="01" rule="colour" field={5} title="Steal a palette, not a layout." text="Take the colours from something real and let them set the rules. Here they are lifted straight out of a screenshot.">
        <div className="grid h-full grid-rows-[1fr_auto]">
          <div className="relative min-h-0">
            <Image src={source.image} alt={`${source.name} screenshot`} fill sizes="(min-width: 768px) 55vw, 100vw" className="object-cover object-top" />
          </div>
          <div className="grid grid-cols-6 border-t-2 border-[#080808]">
            {(swatches.length ? swatches : Array(6).fill('#080808')).map((s, i) => (
              <div key={i} className="pixel flex h-16 items-end p-1 text-[16px] leading-[16px]" style={{ background: s, color: '#f5f5f5', mixBlendMode: 'normal' }}>
                <span className="bg-[#080808] px-[2px]">{s.slice(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </Principle>

      <Principle n="02" rule="colour-material" field={3} title="Colour is a material." text="Light bends through it. The glass refracts the six bars and the logotype; the colours stay true, only the shape moves.">
        <LiveSlot id="glass-lens" tone="colour" className="h-full" showTools={false} />
      </Principle>

      <Principle n="03" rule="hierarchy" field={0} title="One thing first." text="A poster has one loudest element. Six scenes, cut hard, each with a single thing you read first.">
        <LiveSlot id="kinetic-poster" tone="colour" className="h-full" showTools={false} />
      </Principle>

      <Principle n="04" rule="typography" field={4} title="Two families, one scale." text="A serif for voice, a grotesk for reading, pixel faces for labels. Sizes step on a fixed scale.">
        <div className="flex h-full flex-col justify-between bg-[#080808] p-5 text-[#f5f5f5]">
          <p className="font-display text-[clamp(2.6rem,6vw,5.5rem)] leading-[0.9] italic">Newsreader</p>
          <p className="font-sans text-[clamp(1.4rem,3vw,2.4rem)] leading-tight font-semibold">Schibsted Grotesk</p>
          <p className="pixel text-[32px] leading-[32px]">VGA 8x16</p>
          <p className="font-w95 text-[22px] [-webkit-font-smoothing:none]">MS Sans Serif</p>
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">16 · 17 · 24 · 32 · 48 · 64 · 96 · 128</p>
        </div>
      </Principle>

      <Principle n="05" rule="focus" field={1} title="Pull the eye to one point." text="Everything bends toward the centre. Depth and contrast decide where you look before you decide to.">
        <LiveSlot id="event-horizon" tone="colour" className="h-full" showTools={false} />
      </Principle>
    </section>
  );
}
