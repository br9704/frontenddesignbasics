import { InkField } from '@/components/ink-field';
import { appName, appTagline } from '@/lib/shared';

/*
 * Banner renderer. Not linked anywhere; `pnpm shots --banners` screenshots it at fixed sizes
 * to produce the README banner, OG image and section banners from the site's own shader.
 */
export const metadata = { robots: { index: false } };

export default async function BannerPage(props: {
  searchParams: Promise<{ section?: string; n?: string; seed?: string }>;
}) {
  const { section, n, seed } = await props.searchParams;
  const still = 38 + Number(seed ?? 0);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#f2eee6] text-[#16140f]">
      <InkField stillTime={still} density={section ? 0.03 : 0.06} clear={0.95} />
      <div className="absolute inset-0 flex flex-col justify-between p-[4vw]">
        <div className="flex items-center justify-between font-mono text-[max(12px,1vw)] uppercase tracking-[0.18em]">
          <span className="flex items-center gap-3">
            <span className="inline-block size-[0.8em] rounded-full bg-[#16140f]" />
            {appName}
          </span>
          <span>{n ? `Chapter ${n}` : 'github.com/br9704/frontenddesignbasics'}</span>
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
          <p className="max-w-[46ch] text-[max(13px,1.15vw)] leading-snug">{appTagline} Principles, motion, 3D, shaders, a showcase and a toolkit you can install today.</p>
        )}
      </div>
    </main>
  );
}
