import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import type { MDXComponents } from 'mdx/types';
import { ContrastPair, EasingPlayground, Preview, ReducedMotionDemo, SpacingRhythm, TypeScale } from './demos';
import { Banner, ShowcaseGrid, Shot } from './showcase-grid';
import { ToolkitTable } from './toolkit-table';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Tab,
    Tabs,
    Step,
    Steps,
    Preview,
    EasingPlayground,
    TypeScale,
    ContrastPair,
    SpacingRhythm,
    ReducedMotionDemo,
    ToolkitTable,
    ShowcaseGrid,
    Banner,
    Shot,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
