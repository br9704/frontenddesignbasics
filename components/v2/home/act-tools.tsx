'use client';

import Link from 'next/link';
import { AsciiFrame } from '@/components/v2/ascii-frame';
import { P, PAD } from './acts';
import { LiveSlot } from './live-slot';
import { FlyTitle } from './motion';
import { CircleOpen, DitherWipe } from './transitions';

export interface ToolCategory {
  id: string;
  label: string;
  count: number;
  tools: { id: string; name: string }[];
}

/*
 * Act 03, TOOLS. Structure first: the DOM table is readable even if the 3D never loads.
 * Tool Blocks drops the 37 tools into nine towers as you scroll (desktop pins; phones get the poster).
 */
export function ActTools({ categories, total }: { categories: ToolCategory[]; total: number }) {
  return (
    <section id="tools" data-act="3" className="relative md:h-[260vh] motion-reduce:!h-auto">
      <CircleOpen from="#f5f5f5" className="md:sticky md:top-12 md:h-[calc(100svh-3rem)] motion-reduce:!static motion-reduce:!h-auto">
        <div className={`grid min-h-[calc(100svh-3rem)] gap-6 bg-[var(--v-bg)] py-8 md:h-[calc(100svh-3rem)] md:grid-cols-[1.1fr_1fr] md:py-10 motion-reduce:h-auto ${PAD}`}>
          <div className="flex min-h-0 flex-col">
            <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[03 TOOLS] /tools</p>
            <FlyTitle className="mt-3 font-display text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.95] tracking-[-0.03em]">Here are the tools.</FlyTitle>
            <LiveSlot id="tool-blocks" progress={P.tools} mobilePoster className="mt-6 h-[260px] md:h-auto md:min-h-0 md:flex-1" />
          </div>
          <AsciiFrame title="tools.txt" right={`${total} tools`} className="min-h-0 self-center">
            <table className="pixel w-full text-[16px] leading-[16px]">
              <caption className="sr-only">Tool categories with counts</caption>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="group align-top">
                    <td className="py-[6px] pr-3 whitespace-nowrap">
                      <Link href={`/tools#${c.id}`} className="group-hover:bg-[var(--v-ink)] group-hover:text-[var(--v-bg)]">
                        {c.id.padEnd(10, '.')}
                      </Link>
                    </td>
                    <td className="py-[6px] pr-3 text-right text-[var(--v-ink)]">{String(c.count).padStart(2, '0')}</td>
                    <td className="hidden py-[6px] text-[var(--v-dim)] sm:table-cell">
                      {c.tools.map((t, i) => (
                        <span key={t.id}>
                          {i > 0 && ' '}
                          <Link href={`/tools#${t.id}`} className="hover:text-[var(--v-ink)]">
                            {t.id}
                          </Link>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pixel mt-4 text-[16px] leading-[16px]">
              <Link href="/tools" className="bg-[var(--v-ink)] px-1 text-[var(--v-bg)] hover:bg-[var(--v-soft)]">
                [open /tools]
              </Link>
            </p>
          </AsciiFrame>
        </div>
      </CircleOpen>
      <div className="md:absolute md:inset-x-0 md:bottom-0">
        <DitherWipe label="[03 TOOLS] → [04 MAKE]" />
      </div>
    </section>
  );
}
