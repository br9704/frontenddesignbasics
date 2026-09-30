import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import type { MDXComponents } from 'mdx/types';
import type { ComponentType } from 'react';
import { ContrastPair, EasingPlayground, Preview, ReducedMotionDemo, SpacingRhythm, TypeScale } from './demos';
import { BentoDemo, MarqueeDemo, ShaderPlayground, TiltCard } from './demos-2';
import { ColourBudget, Decision, EasingCurves, Flow, HierarchyDiagram, PageTemplate, PromptAnatomy, ProximityDiagram, ScaleLadder } from './diagrams';
import { MotionPoster, PaletteSheet, TypeSpecimen } from './specimen';
import { Banner, ShowcaseGrid, Shot } from './showcase-grid';
import { ToolkitTable } from './toolkit-table';
import { Examples } from './examples-row';
import { Reference } from './reference';
import { GridOverlay, OklchPaletteLab, VariableFontPlayground } from './demos/principles-lab';
import { ScrollProgressDemo, SpringVsBezier, StaggerPlayground } from './demos/motion-lab';
import { ButtonStatesLab, MagneticButton, SpotlightCard, TextRevealDemo } from './demos/interaction-lab';

/*
 * Visual components get a data-export wrapper so scripts/export-md.ts can screenshot each one
 * and put the picture into the GitHub markdown version of the guide (guide/).
 */
function exportable<P extends object>(name: string, C: ComponentType<P>) {
  function Exported(props: P) {
    return (
      <div data-export={name}>
        <C {...props} />
      </div>
    );
  }
  Exported.displayName = `Exported(${name})`;
  return Exported;
}

const visual = {
  Preview, EasingPlayground, TypeScale, ContrastPair, SpacingRhythm, ReducedMotionDemo,
  TiltCard, ShaderPlayground, MarqueeDemo, BentoDemo,
  Flow, EasingCurves, ColourBudget, ProximityDiagram, HierarchyDiagram, ScaleLadder, Decision, PromptAnatomy, PageTemplate,
  TypeSpecimen, PaletteSheet, MotionPoster,
  VariableFontPlayground, OklchPaletteLab, GridOverlay,
  SpringVsBezier, StaggerPlayground, ScrollProgressDemo,
  ButtonStatesLab, SpotlightCard, TextRevealDemo, MagneticButton,
};

/** Names of components that scripts/export-md.ts replaces with a screenshot. */
export const VISUAL_COMPONENTS = Object.keys(visual);

const wrapped = Object.fromEntries(
  Object.entries(visual).map(([name, C]) => [name, exportable(name, C as ComponentType<object>)]),
) as unknown as typeof visual;

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Tab,
    Tabs,
    Step,
    Steps,
    ...wrapped,
    ToolkitTable,
    Examples,
    ShowcaseGrid,
    Banner,
    Shot,
    Reference,
    // Spread as `object`: @react-three/fiber adds never-typed three.js intrinsics to JSX, which would
    // otherwise leak through MDXComponents' index signature and fail the `satisfies` check.
    ...(components as object),
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
