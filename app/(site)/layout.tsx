import { SiteNav } from '@/components/v2/site-nav';
import { SiteFooter } from '@/components/v2/site-footer';

/* The collection pages: v2 nav and footer, no Fumadocs chrome. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--v-bg)] text-[var(--v-ink)]">
      <SiteNav />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
