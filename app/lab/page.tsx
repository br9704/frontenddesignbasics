import Link from 'next/link';
import { experiences } from '@/lib/experiences';
import { catalog } from '@/components/v2/make-data';

/* /lab: a plain ASCII index of every experience, for validators and debugging. */
export default function LabIndex() {
  const built = new Set(experiences.map((e) => e.id));
  return (
    <main className="mx-auto max-w-3xl p-6 text-[var(--v-ink)]">
      <pre className="pixel text-[16px] leading-[16px]">{`┌─ /lab ─ ${built.size}/${catalog.length} built ─┐`}</pre>
      <ul className="pixel mt-6 space-y-3 text-[16px] leading-[16px]">
        {catalog.map((e) => (
          <li key={e.id} className="flex flex-wrap gap-x-3">
            {built.has(e.id) ? (
              <Link href={`/lab/${e.id}`} className="underline underline-offset-4 hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)]">
                {e.id}
              </Link>
            ) : (
              <span className="text-[var(--v-dim)]">{e.id} (in progress)</span>
            )}
            <span className="text-[var(--v-dim)]">{e.tools.join(' · ')}</span>
          </li>
        ))}
      </ul>
      <p className="pixel mt-8 text-[16px] leading-[16px]">
        <Link href="/make" className="underline underline-offset-4">← /make</Link>
      </p>
    </main>
  );
}
