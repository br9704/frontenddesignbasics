# DESIGN.md: the v2 system

The site is a **journey through the toolkit**. Every section is a different *experience*, built with
one or more of the resources this guide collects, and says which ones it used. It starts inside a
Windows 95 world, pixel-blasts into sleek black and white with 3D, and ends in full, loud colour.

```
 WIN95 ──pixel blast──▶ BLACK & WHITE + 3D ──resolve──▶ CRAZY COLOUR
 grey bevels             pixel cube → high-def cube       every experience lights up
 pixel fonts, ASCII      flying text, shaders             colour fields, gradients, chaos
```

## Information architecture (daily-use order)

| Route | What | Source data |
|---|---|---|
| `/` | The journey: a scroll experience through every act below, each built with a named tool | all |
| `/tools` | **The tools**: every library, MCP and skill I use, with screenshot and "make with it" links | `toolkit/toolkit.json` |
| `/make` | **What you can make with them**: live example assets (preview + code + "made with") | `lib/assets.ts` |
| `/inspiration` | **Design inspiration**: type, colour, layout, hierarchy, specimens, editorial | `data/examples.json` |
| `/sites` | **Website inspiration**: every site, filterable by category, searchable | `data/examples.json` |
| `/docs/how-to/*` | **How-tos**: short numbered task guides | MDX |
| `/docs/rules/*` | **Rules & conventions**: TL;DR first, then detail | MDX |
| `/docs/cases/*` | **Case studies**: breakdowns of great sites from their own write-ups, plus BR95 and Balatro | MDX |

## Tokens

Defined in `app/global.css`. Use the CSS variables, never raw hex, except inside a colour experience.

### Mono (the default)

| Token | Value | Use |
|---|---|---|
| `--v-bg` | `#080808` | page ground (from BR95 `--desktop`) |
| `--v-ink` | `#f5f5f5` | primary text |
| `--v-soft` | `#b0b0b0` | secondary text |
| `--v-dim` | `#8a8a8a` | labels, metadata (AA on `--v-bg`) |
| `--v-line` | `#1a1a1a` | hairlines |
| `--v-steel` | `#2c2c2c` | stronger borders, hover surfaces |
| `--v-surface` | `#0e0e0e` | raised panels |

### Win95 (act 0 only)

| Token | Value |
|---|---|
| `--w-desk` | `#2c2c2c` desktop (grey, not the classic teal: B&W brief) |
| `--w-face` | `#c0c0c0` button face |
| `--w-hi` | `#ffffff` highlight |
| `--w-shadow` | `#808080` shadow |
| `--w-dark` | `#000000` dark edge |
| `--w-title` | `#000000` title bar (black, not the classic navy) |

Bevels: `box-shadow: inset -1px -1px #000, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;`

### Colour (the finale): "crazy colour"

| Token | Value |
|---|---|
| `--c-1` | `#ff2e00` signal red-orange |
| `--c-2` | `#ff00a8` hot magenta |
| `--c-3` | `#7b2cff` electric violet |
| `--c-4` | `#00b3ff` cyan |
| `--c-5` | `#00e676` acid green |
| `--c-6` | `#ffe600` yellow |

Colour enters gradually: first as a single hue inside one experience, then as full-bleed fields, then
everything at once. Text on colour is always `#080808` or `#ffffff`, whichever passes 4.5:1.

## Type

| Role | Family | Variable |
|---|---|---|
| Pixel display, labels, ASCII, nav | Web IBM VGA 8x16 (`/fonts/web_ibm_vga_8x16.woff`) | `--font-pixel` |
| Win95 UI (act 0 only) | MS Sans Serif pixel (`/fonts/ms_sans_serif*.woff2`) | `--font-w95` |
| Reading text | Schibsted Grotesk | `--font-sans` |
| Big editorial display | Newsreader (italic allowed) | `--font-display` |
| Code | IBM Plex Mono | `--font-mono` |

- Pixel font sizes are multiples of 16px (8x16 grid): 16, 32, 48, 64, 96, 128. Use `-webkit-font-smoothing: none` on pixel text.
- Reading text: 17px / 1.6, max 68ch. Easy to read beats clever.

## ASCII everywhere

- Box-drawing frames (`┌─┐│└┘├┤`) for panels: use `<AsciiFrame>`.
- Section headers carry an ASCII label like `[01] /tools`.
- Diagrams are ASCII in `<pre>` (they also render on GitHub).
- Loading and progress: `[████████░░░░] 64%`.

## 3D and shaders

- three.js via `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing`.
- Signature: **pixel → high-def**. Objects start as chunky pixel blocks (pixelation effect or voxel geometry) and resolve to smooth, lit, high-resolution geometry as you scroll.
- Also: drei `AsciiRenderer` (3D as ASCII), dither post-process (1-bit Bayer), pixel-blast dissolves.
- Every canvas: `dpr={[1, 1.75]}`, pauses off-screen (`frameloop="demand"` + IntersectionObserver or drei `View`), and shows a still frame under `prefers-reduced-motion`.
- Load 3D with `next/dynamic` and `ssr: false`, with a styled ASCII placeholder while loading.

## Motion

- GSAP (with ScrollTrigger and SplitText, both free and installed) + Lenis for the home journey.
- Text flies: SplitText chars/words with stagger; eases `expo.out`, `power4.inOut`.
- Every scroll animation lives inside `gsap.matchMedia('(prefers-reduced-motion: no-preference)')`. Reduced motion gets the final state instantly.
- Scroll structure: pinned acts with clear numbered labels, so it feels like a bonanza but you always know where you are (a fixed progress rail: `[00 BOOT] [01 TOOLS] [02 MAKE] …`).

## Rules for builders

- Own only the files you're assigned. Never edit `package.json`, `app/global.css`, `components/mdx.tsx` or files another builder owns; report anything you need added.
- Must work at 390px with no horizontal overflow; must type-check (`npx tsc --noEmit -p .`).
- Every experience shows a small `built with: gsap · lenis · three` tag linking to `/tools`.
- No em dashes in copy. British spelling. Short sentences.
