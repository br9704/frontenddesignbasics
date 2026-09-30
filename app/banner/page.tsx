import { InkField } from '@/components/ink-field';
import { appTagline } from '@/lib/shared';

/*
 * Banner renderer. Not linked anywhere; `pnpm shots --banners` screenshots it at fixed sizes
 * to produce the README banner, OG image and section banners from the site's own shader.
 */
export const metadata = { robots: { index: false } };

export default async function BannerPage(props: {
  searchParams: Promise<{ section?: string; n?: string; seed?: string; speed?: string }>;
}) {
  const { section, n, seed, speed } = await props.searchParams;
  const still = 38 + Number(seed ?? 0);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[var(--v-bg)] text-[var(--v-ink)]">
      {/* InkField multiplies ink into paper, so it prints grey ink on white; invert turns that into white ink on black. */}
      <div className="absolute inset-0 [filter:invert(1)]">
        <InkField
          paper="#f5f5f5"
          inkA="#5a5a5a"
          inkB="#9a9a9a"
          stillTime={still}
          density={section ? 0.03 : 0.06}
          clear={0.95}
          timeScale={Number(speed ?? 1)}
        />
      </div>
      <div className="absolute inset-0 flex flex-col justify-between p-[4vw]">
        <div className="pixel flex items-center justify-between text-[max(16px,1.25vw)] leading-none">
          <span>
            ■ fdb <span className="text-[var(--v-dim)]">/docs</span>
          </span>
          <span className="text-[var(--v-soft)]">{n ? `[${n}] chapter` : 'github.com/br9704/frontenddesignbasics'}</span>
        </div>
        <h1
          className="max-w-[16ch] font-display leading-[0.92] tracking-[-0.03em]"
          style={{ fontSize: section ? 'min(11vw, 15vh * 1.4)' : 'min(7.4vw, 13vh * 1.2)' }}
        >
          {section ?? (
            <>
              Complete, <em className="italic">beautiful</em> web design.
            </>
          )}
        </h1>
        {!section && (
          <p className="max-w-[46ch] text-[max(13px,1.15vw)] leading-snug text-[var(--v-soft)]">{appTagline} Principles, motion, 3D, shaders, a showcase and a toolkit you can install today.</p>
        )}
      </div>
    </main>
  );
}
