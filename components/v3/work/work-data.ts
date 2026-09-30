/** Content for /work. Ids must exist in lib/experiences; tiles without a demo are marked as concepts. */

export interface MadeHere {
  id: string;
  title: string;
  useFor: string;
  alt: string;
}

export const MADE_HERE: MadeHere[] = [
  {
    id: 'pixel-to-hd-cube',
    title: 'Pixel to HD',
    useFor: 'a product reveal',
    alt: 'A cloud of small cubes turning from 1-bit dither into a sharp HD mark',
  },
  {
    id: 'neon-block-city',
    title: 'Neon Block City',
    useFor: 'a game or event launch',
    alt: 'An isometric night city with glowing streets and a neon sign',
  },
  {
    id: 'liquid-gradient',
    title: 'Gradient Lab',
    useFor: 'a calm landing page background',
    alt: 'A soft moving gradient of blended colour',
  },
  {
    id: 'crt-signal-lost',
    title: 'Signal Lost',
    useFor: 'a 404 page or a loading screen',
    alt: 'An old CRT screen full of static and a lost signal message',
  },
  {
    id: 'flying-type',
    title: 'Flying Type',
    useFor: 'a bold headline that scrolls into place',
    alt: 'Large letters flying through 3D space',
  },
  {
    id: 'ease-racetrack',
    title: 'Ease Racetrack',
    useFor: 'choosing how a brand moves',
    alt: 'Twelve lanes of dots racing the same distance with different easing',
  },
  {
    id: 'transition-deck',
    title: 'Transition Deck',
    useFor: 'moving between pages or slides',
    alt: 'A stack of cards changing from one to the next with a wipe',
  },
  {
    id: 'glass-lens',
    title: 'Liquid Lens',
    useFor: 'a hover effect on a hero image',
    alt: 'A glass lens bending the text and image behind it',
  },
  {
    id: 'event-horizon',
    title: 'Event Horizon',
    useFor: 'a dramatic opening scene',
    alt: 'A black hole bending a bright ring of light into arcs',
  },
  {
    id: 'colour-riot',
    title: 'Colour Riot',
    useFor: 'a loud finale or a music release',
    alt: 'Bright ink swirling with beams of light and neon panels',
  },
];

export interface OfferTile {
  title: string;
  what: string;
  /** closest existing experience, or undefined for a concept */
  demo?: { id: string; title: string };
}

export const OFFERS: OfferTile[] = [
  {
    title: 'SaaS landing hero',
    what: 'A first screen that says what the product does in one line, with a living background that never gets in the way.',
    demo: { id: 'liquid-gradient', title: 'Gradient Lab' },
  },
  {
    title: '3D product viewer',
    what: 'Your product in 3D. People can turn it, see it come together and look at the details up close.',
    demo: { id: 'pixel-to-hd-cube', title: 'Pixel to HD' },
  },
  {
    title: 'Scroll launch story',
    what: 'A launch told in chapters. Each part pins in place while you scroll, so every feature gets its moment.',
    demo: { id: 'pinned-chapters', title: 'Pinned Chapters' },
  },
  {
    title: 'Restaurant or event site',
    what: 'A menu, a date and a mood. Big type that moves like a printed poster come to life.',
    demo: { id: 'kinetic-poster', title: 'Kinetic Poster' },
  },
  {
    title: 'Photographer portfolio',
    what: 'A gallery that lets the pictures lead. Images bend a little with scroll speed, then settle sharp.',
    demo: { id: 'velocity-gallery', title: 'Unwoven Gallery' },
  },
  {
    title: 'Brand motion kit',
    what: 'The eases and transitions your brand uses everywhere, written down so every page moves the same way.',
    demo: { id: 'transition-deck', title: 'Transition Deck' },
  },
  {
    title: 'Data story',
    what: 'Numbers that build up as you read, with charts that explain one thing at a time.',
  },
];
