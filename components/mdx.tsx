import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import type { MDXComponents } from 'mdx/types';
import { ContrastPair, EasingPlayground, Preview, ReducedMotionDemo, SpacingRhythm, TypeScale } from './demos';
import { BentoDemo, MarqueeDemo, ShaderPlayground, TiltCard } from './demos-2';
import { ColourBudget, Decision, EasingCurves, Flow, HierarchyDiagram, PageTemplate, PromptAnatomy, ProximityDiagram, ScaleLadder } from './diagrams';
import { MotionPoster, PaletteSheet, TypeSpecimen } from './specimen';
import { Banner, ShowcaseGrid, Shot } from './showcase-grid';
import { ToolkitTable } from './toolkit-table';
import { Examples } from './examples-row';
import { GridOverlay, OklchPaletteLab, VariableFontPlayground } from './demos/principles-lab';
import { ScrollProgressDemo, SpringVsBezier, StaggerPlayground } from './demos/motion-lab';
import { ButtonStatesLab, MagneticButton, SpotlightCard, TextRevealDemo } from './demos/interaction-lab';

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
    Examples,
    VariableFontPlayground,
    OklchPaletteLab,
    GridOverlay,
    SpringVsBezier,
    StaggerPlayground,
    ScrollProgressDemo,
    ButtonStatesLab,
    SpotlightCard,
    TextRevealDemo,
    MagneticButton,
    TiltCard,
    ShaderPlayground,
    MarqueeDemo,
    BentoDemo,
    Flow,
    EasingCurves,
    ColourBudget,
    ProximityDiagram,
    HierarchyDiagram,
    ScaleLadder,
    Decision,
    PromptAnatomy,
    PageTemplate,
    TypeSpecimen,
    PaletteSheet,
    MotionPoster,
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
