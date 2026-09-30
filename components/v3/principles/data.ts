/*
 * The words on /principles for chapters I to IV, plus the whole checklist. Every source URL was
 * checked (HTTP 200) on 30 Sep 2026.
 */

export type Source = { label: string; href: string };

export type Principle = {
  id: string;
  no: string;
  rule: string;
  why: string;
  source: Source;
};

export type ChapterMeta = { id: string; numeral: string; title: string; short: string };

export const CHAPTERS: ChapterMeta[] = [
  { id: 'motion', numeral: 'I', title: 'Motion feel', short: 'Motion' },
  { id: 'blur', numeral: 'II', title: 'Blur', short: 'Blur' },
  { id: 'transitions', numeral: 'III', title: 'Transitions', short: 'Transitions' },
  { id: 'scroll', numeral: 'IV', title: 'Scroll', short: 'Scroll' },
  { id: 'visual', numeral: 'V', title: 'Visual design', short: 'Visual' },
  { id: 'ux', numeral: 'VI', title: 'Laws of UX', short: 'UX' },
  { id: 'states', numeral: 'VII', title: 'States and heuristics', short: 'States' },
];

const emil = (path: string): Source => ({ label: 'emilkowal.ski', href: `https://emilkowal.ski/ui/${path}` });
const nng = (path: string): Source => ({ label: 'nngroup.com', href: `https://www.nngroup.com/articles/${path}/` });
const mdn = (path: string): Source => ({ label: 'MDN', href: `https://developer.mozilla.org/en-US/docs/Web/${path}` });

export const MOTION: Principle[] = [
  {
    id: 'm1',
    no: 'M1',
    rule: 'I ease out by default.',
    why: 'Ease-out starts fast and lands soft, so the thing answers the moment you ask and still settles gently.',
    source: emil('great-animations'),
  },
  {
    id: 'm2',
    no: 'M2',
    rule: 'I pick the ease by what the thing is doing.',
    why: 'Arriving eases out, going away eases in, moving across the screen eases both ways. Linear is only for loops and progress.',
    source: nng('animation-duration'),
  },
  {
    id: 'm3',
    no: 'M3',
    rule: 'My durations grow with distance.',
    why: 'A fixed time makes long moves look rushed and short ones look lazy. The speed should feel the same.',
    source: nng('animation-duration'),
  },
  {
    id: 'm4',
    no: 'M4',
    rule: 'I use springs for anything you can grab.',
    why: 'A spring keeps the speed of your hand, so a flung card carries on and a caught card stops. A fixed curve can do neither.',
    source: { label: 'joshwcomeau.com', href: 'https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/' },
  },
  {
    id: 'm5',
    no: 'M5',
    rule: 'I stagger in small steps, with a cap.',
    why: 'Around 30 to 50ms between items reads as one gesture. A cap on the total means the last item never keeps you waiting.',
    source: { label: 'gsap.com', href: 'https://gsap.com/resources/getting-started/Staggers/' },
  },
  {
    id: 'm6',
    no: 'M6',
    rule: 'My motion explains. It doesn’t decorate.',
    why: 'Good motion shows where something went or what changed. If it tells you nothing, it is in the way.',
    source: nng('animation-purpose-ux'),
  },
  {
    id: 'm7',
    no: 'M7',
    rule: 'I don’t animate things you do a hundred times a day.',
    why: 'A 300ms opening is charming once and a tax the hundredth time. Keyboard actions should feel instant.',
    source: emil('you-dont-need-animations'),
  },
  {
    id: 'm8',
    no: 'M8',
    rule: 'I animate transform and opacity, nothing else.',
    why: 'Those two skip layout and paint, so the GPU can do the work. Width, top or margin make the browser redo the page every frame.',
    source: { label: 'web.dev', href: 'https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count' },
  },
];

export const BLUR: Principle[] = [
  {
    id: 'b1',
    no: 'B1',
    rule: 'I add motion blur to fast moves.',
    why: 'A little blur along the direction of travel tells your eye it moved fast, like a camera would. When it slows, the blur goes.',
    source: mdn('CSS/filter-function/blur'),
  },
  {
    id: 'b2',
    no: 'B2',
    rule: 'I blur text in instead of only fading it.',
    why: 'Text that sharpens into place feels like it comes into focus. It reads sooner than a fade and needs no travel.',
    source: emil('great-animations'),
  },
  {
    id: 'b3',
    no: 'B3',
    rule: 'I blur the background to show what matters.',
    why: 'A light blur behind a dialog says “only this, for now” without hiding where you were. Too much and you lose your place.',
    source: mdn('CSS/backdrop-filter'),
  },
  {
    id: 'b4',
    no: 'B4',
    rule: 'My frosted glass always has something to blur, and a tint.',
    why: 'Backdrop blur over a flat colour does nothing. Over busy content it needs a tint, or the text on top fails contrast.',
    source: nng('glassmorphism'),
  },
  {
    id: 'b5',
    no: 'B5',
    rule: 'I budget blur, because it is expensive.',
    why: 'Every blurred pixel samples its neighbours, every frame. A few big blurred layers can drop a phone below 60fps, so I keep a cheap fallback.',
    source: { label: 'web.dev', href: 'https://web.dev/articles/rendering-performance' },
  },
];

export const TRANSITIONS: Principle[] = [
  {
    id: 't1',
    no: 'T1',
    rule: 'I crossfade swaps and slide for direction.',
    why: 'Tabs are siblings, so they swap in place. Steps in a flow go forward and back, so they slide that way.',
    source: nng('animation-purpose-ux'),
  },
  {
    id: 't2',
    no: 'T2',
    rule: 'I keep your place with shared elements.',
    why: 'When a card grows into its detail view, you never lose what you tapped. FLIP makes it cheap: measure first, measure last, invert, play.',
    source: { label: 'gsap.com', href: 'https://gsap.com/docs/v3/Plugins/Flip/' },
  },
  {
    id: 't3',
    no: 'T3',
    rule: 'I use view transitions between pages.',
    why: 'The browser snapshots both views and morphs what they share. It is built in, and where it isn’t supported you get a plain swap.',
    source: mdn('API/View_Transition_API'),
  },
  {
    id: 't4',
    no: 'T4',
    rule: 'I design the exit as well as the entrance.',
    why: 'Things that vanish in a blink feel like errors. A short exit, quicker than the entrance, says where it went.',
    source: mdn('CSS/@starting-style'),
  },
  {
    id: 't5',
    no: 'T5',
    rule: 'My transitions start where you clicked.',
    why: 'A menu that grows out of its button looks like it came from there. From the centre it looks like it came from nowhere.',
    source: mdn('CSS/transform-origin'),
  },
];

export const SCROLL: Principle[] = [
  {
    id: 's1',
    no: 'S1',
    rule: 'I choose scroll-linked or scroll-triggered on purpose.',
    why: 'Linked follows your scroll both ways, which suits progress. Triggered plays once, which suits reveals. CSS can now do linked with no JavaScript.',
    source: { label: 'gsap.com', href: 'https://gsap.com/docs/v3/Plugins/ScrollTrigger/' },
  },
  {
    id: 's2',
    no: 'S2',
    rule: 'I smooth the scroll, but I never hijack it.',
    why: 'Smoothing keeps your input and softens it. Hijacking throws your input away and plays its own. People hate the second.',
    source: nng('scrolljacking-101'),
  },
  {
    id: 's3',
    no: 'S3',
    rule: 'My reveals never hide content.',
    why: 'If a fast fling skips the trigger, hidden stays hidden. Content is visible by default and motion is only an extra.',
    source: mdn('API/Intersection_Observer_API'),
  },
  {
    id: 's4',
    no: 'S4',
    rule: 'I give heavy scenes a still image and remove them off screen.',
    why: 'A still shows at once and costs nothing. The live scene starts when it is in view and stops when it isn’t, so the page stays quick.',
    source: mdn('CSS/content-visibility'),
  },
  {
    id: 'r1',
    no: 'R1',
    rule: 'My reduced motion removes the travel, not the feedback.',
    why: 'People who turn motion down still need to know something happened. I keep fades and state changes and drop the flying.',
    source: mdn('CSS/@media/prefers-reduced-motion'),
  },
  {
    id: 'r2',
    no: 'R2',
    rule: 'Anything that loops, you can stop.',
    why: 'WCAG asks for a pause on anything that moves for more than five seconds. I also stop loops the moment they leave the screen.',
    source: { label: 'w3.org', href: 'https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html' },
  },
];

/* Chapters V to VII live in visual.tsx, ux.tsx and states.tsx; these lines copy their rules word for word. */
const VISUAL_RULES = [
  "I give each view one big thing.",
  "I set type from a scale, sized for reading.",
  "I keep it mostly neutral with one accent.",
  "I measure contrast, I don't guess it.",
  "I use space to group things.",
  "I use depth to show what floats.",
  "I keep corners concentric and radii few.",
];

const UX_RULES = [
  "I make targets big and close (Fitts).",
  "I cut the choices to speed up the decision (Hick).",
  "I put things where people already look (Jakob).",
  "I answer within 400ms (Doherty).",
  "I end on a high (peak-end).",
  "I make the one thing I want seen different (von Restorff).",
  "I group with space, shape and regions (Gestalt).",
  "I join steps with a line and keep shapes simple (Prägnanz).",
  "I chunk long strings (Miller).",
  "I take on the complexity so you don't have to (Tesler).",
  "I show progress and leave a nudge (goal gradient, Zeigarnik).",
  "I put key items first and last, and polish what matters (serial position).",
];

const STATES_RULES = [
  "I audit every screen against Nielsen's ten.",
  "I give every press feedback.",
  "I make things look like what they do.",
  "I use skeletons, not spinners.",
  "I design empty and error states as real screens.",
  "I make it feel fast first (optimistic UI).",
];

export const CHECKLIST: { chapter: ChapterMeta; rules: string[] }[] = [
  { chapter: CHAPTERS[0], rules: MOTION.map((p) => p.rule) },
  { chapter: CHAPTERS[1], rules: BLUR.map((p) => p.rule) },
  { chapter: CHAPTERS[2], rules: TRANSITIONS.map((p) => p.rule) },
  { chapter: CHAPTERS[3], rules: SCROLL.map((p) => p.rule) },
  { chapter: CHAPTERS[4], rules: VISUAL_RULES },
  { chapter: CHAPTERS[5], rules: UX_RULES },
  { chapter: CHAPTERS[6], rules: STATES_RULES },
];
