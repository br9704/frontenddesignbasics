import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LabView } from './view';
import { experiences, getExperience } from '@/lib/experiences';

/*
 * /lab/<id>: one experience, full screen with a thin ASCII header and controls. Used by validators
 * (frames, console, 390px, reduced motion) and linked from /make as [open ↗].
 * /lab/<id>?still=1 renders only the composed reduced-motion frame, which is what posters are made from.
 */
export function generateStaticParams() {
  return experiences.map((e) => ({ id: e.id }));
}

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const e = getExperience(id);
  return e ? { title: `${e.title} · lab`, description: e.blurb } : {};
}

export default async function LabPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ still?: string }> }) {
  const { id } = await props.params;
  const { still } = await props.searchParams;
  if (!getExperience(id)) notFound();
  return <LabView id={id} still={still === '1'} />;
}
