'use client';

import { useState } from 'react';
import { CHECKLIST } from './data';

/* The last strip on /principles: every rule as a plain list, with a copy button. */
export function Checklist() {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const text = [
    'My checklist (frontenddesignbasics /principles)',
    '',
    ...CHECKLIST.flatMap(({ chapter, rules }) => [`${chapter.numeral}. ${chapter.title}`, ...rules.map((r) => `- [ ] ${r}`), '']),
  ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
    window.setTimeout(() => setCopied('idle'), 2000);
  };

  return (
    <section id="checklist" aria-labelledby="checklist-h" className="scroll-mt-24 border-t border-[var(--v-line)] pt-12 pb-24">
      <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">[✓] #checklist</p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h2 id="checklist-h" className="font-display text-[40px] leading-[1.02] tracking-[-0.02em] text-[var(--v-ink)] sm:text-[56px]">
          My checklist
        </h2>
        <button
          type="button"
          onClick={copy}
          className="pixel border border-[var(--v-ink)] px-3 py-2 text-[16px] leading-[16px] text-[var(--v-ink)] hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]"
        >
          {copied === 'done' ? '[✓] copied' : copied === 'failed' ? '[!] select and copy' : '[copy] all rules'}
        </button>
      </div>
      <p className="mt-4 max-w-[62ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
        Every rule on this page, plain. I run down it before I call something done. Copy it into a pull request or a note.
      </p>
      <span className="sr-only" aria-live="polite">{copied === 'done' ? 'Checklist copied' : ''}</span>
      <div className="mt-8 grid gap-px border border-[var(--v-line)] bg-[var(--v-line)] sm:grid-cols-2 lg:grid-cols-4">
        {CHECKLIST.map(({ chapter, rules }) => (
          <div key={chapter.id} className="min-w-0 bg-[var(--v-bg)] p-4 sm:last:col-span-2">
            <h3 className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">
              <a href={`#${chapter.id}`} className="underline-offset-4 hover:underline">
                {chapter.numeral}. {chapter.title}
              </a>
            </h3>
            <ul className="mt-3 space-y-1.5 text-[15px] leading-[1.45] text-[var(--v-soft)]">
              {rules.map((r) => (
                <li key={r} className="flex gap-2">
                  <span aria-hidden className="shrink-0 whitespace-pre font-mono text-[var(--v-dim)]">[ ]</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
