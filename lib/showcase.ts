export interface ShowcaseEntry {
  id: string;
  name: string;
  url: string;
  by: string;
  /** What to steal (the idea, never the code or assets). */
  lessons: string[];
  why: string;
  tags: string[];
  /** ms to wait for intro animation before capture */
  settle?: number;
  /** click through a start screen: 'center' or a button name */
  start?: string;
  mine?: boolean;
}

export const showcase: ShowcaseEntry[] = [
  {
    id: 'linear',
    name: 'Linear',
    url: 'https://linear.app',
    by: 'Linear',
    why: 'Restraint as a brand. A near-monochrome palette, one typeface family, and product UI treated as the hero image.',
    lessons: ['Show the real product, not an illustration of it', 'Let a single accent colour mean "interactive"', 'Tight, confident type with generous line-height in body'],
    tags: ['product', 'typography', 'dark'],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    url: 'https://stripe.com',
    by: 'Stripe',
    why: 'The benchmark for gradients with purpose: colour carries energy while the grid and copy stay strict.',
    lessons: ['A living gradient can carry brand without a mascot', 'Dense information stays calm on a strict column grid', 'Micro-diagrams explain the product faster than paragraphs'],
    tags: ['gradient', 'grid', 'product'],
  },
  {
    id: 'lusion',
    name: 'Lusion',
    url: 'https://lusion.co',
    by: 'Lusion',
    why: 'WebGL as craft, not decoration: every scene reacts to the pointer and scroll, and the UI stays out of its way.',
    lessons: ['Interaction is the portfolio', 'Keep chrome minimal when the canvas is the content', 'Transitions between scenes sell continuity'],
    tags: ['webgl', '3d', 'studio'],
    settle: 22000,
  },
  {
    id: 'igloo',
    name: 'Igloo Inc.',
    url: 'https://www.igloo.inc',
    by: 'Igloo Inc. (built with Abeto)',
    why: 'Scroll as a camera. A single 3D world, cold material palette and sound design make a company page feel like an object.',
    lessons: ['One world, one camera path, many chapters', 'Material and lighting do the branding', 'Sound is an optional layer, not a default'],
    tags: ['webgl', 'scroll', 'award'],
    settle: 22000,
  },
  {
    id: 'rauno',
    name: 'Rauno Freiberg',
    url: 'https://rauno.me',
    by: 'Rauno Freiberg',
    why: 'Interaction details as the whole point. Small, precise prototypes and an interface that rewards curiosity.',
    lessons: ['Tiny interactions, done perfectly, beat big ones done roughly', 'Quiet typography lets craft show', 'Every hover and focus state is designed'],
    tags: ['interaction', 'minimal', 'personal'],
  },
  {
    id: 'emil',
    name: 'Emil Kowalski',
    url: 'https://emilkowal.ski',
    by: 'Emil Kowalski',
    why: 'Almost nothing on the page, and all of it considered: small type, soft grey, generous space. The craft lives in the projects it links to (Sonner, Vaul, animations.dev).',
    lessons: ['Restraint is a style', 'Let the work carry the personality', 'Explain the why next to the demo, as his articles do'],
    tags: ['motion', 'writing', 'personal'],
  },
  {
    id: 'darkroom',
    name: 'darkroom.engineering',
    url: 'https://darkroom.engineering',
    by: 'darkroom.engineering (makers of Lenis)',
    why: 'The studio behind Lenis commits to one idea: a red-on-black, terminal-and-darkroom aesthetic with display type stretched edge to edge.',
    lessons: ['One strong constraint (a single colour on black) reads as identity', 'Oversized type as layout', 'Open-source your tools and let the site prove them'],
    tags: ['scroll', 'typography', 'studio'],
  },
  {
    id: 'bruno-simon',
    name: 'Bruno Simon',
    url: 'https://bruno-simon.com',
    by: 'Bruno Simon',
    why: 'A portfolio you drive. The most famous proof that a personal site can be a game and still get the job done.',
    lessons: ['A concept can carry the whole site', 'Physics and playfulness make people share', 'Always offer a plain fallback for people in a hurry'],
    tags: ['three.js', 'game', 'personal'],
    settle: 20000,
    start: 'center',
  },
  {
    id: 'br95',
    name: 'BR95: brunojaamaa.dev',
    url: 'https://brunojaamaa.dev',
    by: 'Bruno Jaamaa',
    why: 'A portfolio that pretends to be a Windows 95 computer without paying the SEO price: real routes and server HTML inside window chrome.',
    lessons: ['A concept backed by research reads as craft, not costume', 'Parity rule: a window and its route render the same server component', 'Constraints (one sanctioned colour) make a system'],
    tags: ['case study', 'three.js', 'concept'],
    settle: 5000,
    start: 'START',
    mine: true,
  },
];
