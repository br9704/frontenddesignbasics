/*
 * The cube act's script: seven beats on one 0..1 progress (P.cube), the six faces of the net, the
 * six render styles and the 30 cards. Shared by the act (captions, links), the scene (timing) and
 * the reduced-motion still. Plain data, no React.
 */

export interface Beat {
  n: number;
  from: number;
  to: number;
  label: string;
  caption: string;
}

export const BEATS: Beat[] = [
  { n: 1, from: 0, to: 0.125, label: 'PIXEL TO HD', caption: 'Pixel to HD: a pass steps from 48px to 1px while 296 blocks close into one smooth cube.' },
  { n: 2, from: 0.125, to: 0.19, label: 'UNFOLD', caption: 'The cube opens flat like a paper net. Six faces, six jobs.' },
  { n: 3, from: 0.19, to: 0.28, label: 'PICK A FACE', caption: 'Hover a face to lift it. Click one to see the tools for that job.' },
  { n: 4, from: 0.28, to: 0.48, label: 'RENDER STYLES', caption: 'One object, six ways to render it. Only a setting changes.' },
  { n: 5, from: 0.48, to: 0.645, label: 'BLOCK MORPH', caption: 'The 296 blocks move between shapes. The graphics card does the maths.' },
  { n: 6, from: 0.645, to: 0.88, label: 'THIRTY PIECES', caption: 'The blocks become 30 cards, one per piece on this site. Click one to open it.' },
  { n: 7, from: 0.88, to: 1.01, label: 'COLLAPSE', caption: 'Everything folds back into one white pixel. Next: the tools.' },
];

export function beatAt(p: number) {
  for (let i = BEATS.length - 1; i >= 0; i--) if (p >= BEATS[i].from) return i;
  return 0;
}

/** Timing used by the scene. Kept here so captions and links switch on the same numbers. */
export const T = {
  netOn: 0.125,
  facesLive: [0.19, 0.28] as const,
  knotOn: 0.31,
  styles: [0.31, 0.47] as const,
  blocksBack: 0.48,
  cardsLive: [0.715, 0.88] as const,
  pixel: 0.955,
};

export const STYLES = ['1-BIT DITHER', 'ASCII', 'HALFTONE', 'GLASS', 'WIREFRAME', 'CHROME'];

/** Style index and wipe (0..1 into the next style) for a progress value. */
export function styleAt(p: number) {
  const [a, b] = T.styles;
  const local = Math.min(5.999, Math.max(0, ((p - a) / (b - a)) * 6));
  const i = Math.floor(local);
  const f = local - i;
  const wipe = i >= 5 ? 0 : Math.min(1, Math.max(0, (f - 0.72) / 0.28));
  return { i, next: Math.min(5, i + 1), wipe };
}

/** The six faces, in net order: front, top, right, bottom, left, back. */
export const FACES: { cat: string; label: string; icon: string[] }[] = [
  { cat: 'motion', label: 'MOTION', icon: ['00000000', '00001000', '00001100', '11111110', '11111110', '00001100', '00001000', '00000000'] },
  { cat: '3d', label: '3D', icon: ['00111111', '01000011', '10000101', '11111001', '10001001', '10001010', '10001100', '11111000'] },
  { cat: 'shaders', label: 'SHADERS', icon: ['11111111', '11101110', '10111011', '10101010', '10001000', '00100010', '10000000', '00001000'] },
  { cat: 'components', label: 'COMPONENTS', icon: ['11101110', '10101010', '11101110', '00000000', '11101110', '10101010', '11101110', '00000000'] },
  { cat: 'skills', label: 'SKILLS', icon: ['00010000', '00010000', '00111000', '11111110', '00111000', '00101000', '01000100', '00000000'] },
  { cat: 'research', label: 'RESEARCH', icon: ['01110000', '10001000', '10001000', '10001000', '01110000', '00001000', '00000100', '00000010'] },
];

/** Experiences that have a poster in public/posters. The act keeps the first 30 the registry knows. */
export const POSTER_IDS = [
  'pixel-to-hd-cube', 'voxel-type-assembly', 'ascii-3d', 'neon-block-city', 'crystal-type-rings', 'dither-wave', 'liquid-gradient',
  'glass-lens', 'light-painting', 'crt-signal-lost', 'flying-type', 'circuit-board', 'easing-lab', 'kinetic-poster',
  'wave-extrude-type', 'pinned-chapters', 'velocity-gallery', 'type-vortex', 'flip-bento', 'page-transitions', 'pixel-blast',
  'pipes-screensaver', 'ascii-cursor-field', 'win95-desktop', 'event-horizon', 'halftone-develop', 'colour-riot', 'ease-racetrack',
  'blur-lab', 'transition-deck', 'win95-boot', 'site-wall-3d', 'tool-blocks',
];

export const CARD_COUNT = 30;

export interface CubeCard {
  id: string;
  title: string;
}
