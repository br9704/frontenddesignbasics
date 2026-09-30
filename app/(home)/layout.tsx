import { SiteNav } from '@/components/v2/site-nav';

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SiteNav />
      {children}
    </>
  );
}
