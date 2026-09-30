/*
 * Building blocks the experiences' "built with" tags name that are not toolkit entries on their own
 * (they ship inside, or alongside, a toolkit tool). /tools renders these as anchors so every tag
 * link lands somewhere real.
 */
export const TECHNIQUES = [
  { id: 'r3f', name: 'React Three Fiber', with: 'threejs', url: 'https://r3f.docs.pmnd.rs', what: 'three.js as React components. Every 3D piece on this site is written with it.' },
  { id: 'drei', name: 'drei', with: 'threejs', url: 'https://github.com/pmndrs/drei', what: 'Ready-made helpers for R3F: cameras, text, environment, instancing, views.' },
  { id: 'glsl', name: 'GLSL', with: 'ogl', url: 'https://thebookofshaders.com', what: 'The shader language itself. Every custom look here (dither, fluid, glass) is a small GLSL program.' },
  { id: 'canvas2d', name: 'Canvas 2D', with: null, url: 'https://developer.mozilla.org/docs/Web/API/Canvas_API', what: 'The browser’s 2D drawing API. Used for ASCII, pixel blasts and textures fed to 3D.' },
  { id: 'svg', name: 'SVG', with: null, url: 'https://developer.mozilla.org/docs/Web/SVG', what: 'Vector drawing in the page. Curves, paths and diagrams that animate with GSAP.' },
  { id: 'css', name: 'CSS', with: null, url: 'https://developer.mozilla.org/docs/Web/CSS', what: 'Layout, transitions and the Win95 bevels. The cheapest motion there is.' },
  { id: 'next-image', name: 'next/image', with: null, url: 'https://nextjs.org/docs/app/api-reference/components/image', what: 'Next.js image resizing and lazy loading. Every screenshot on the site goes through it.' },
] as const;
