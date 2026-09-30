import { source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import type { MDXComponents } from 'mdx/types';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getPageImageUrl, getPageMarkdownUrl, gitConfig } from '@/lib/shared';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <p className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">
        [§] <span className="text-[var(--v-ink)]">{page.url}</span>
      </p>
      <DocsTitle className="pixel text-[32px] leading-[40px] font-normal [-webkit-font-smoothing:none] sm:text-[48px] sm:leading-[56px]">
        {page.data.title}
      </DocsTitle>
      <DocsDescription className="mb-0 text-[17px] leading-[1.6] text-[var(--v-soft)]">{page.data.description}</DocsDescription>
      <div className="flex flex-row items-center gap-2 border-b border-[var(--v-line)] pb-6 [&_button]:rounded-none [&_a]:rounded-none">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/content/docs/${page.path}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={
            // Cast: @react-three/fiber's never-typed JSX intrinsics make MDXComponents fail to match itself.
            getMDXComponents({
              // this allows you to link to other pages with relative file paths
              a: createRelativeLink(source, page),
            }) as MDXComponents
          }
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImageUrl(page).url,
    },
  };
}
