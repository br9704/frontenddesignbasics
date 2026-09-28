# AGENTS.md

Instructions for coding agents working **with** this guide (reading it for a project) or **on** it (editing this repo).

## Using this guide on a project

When a person starts a new project or design task and points you here:

1. Read `toolkit/toolkit.json` and the Principles chapter (`content/docs/principles/`).
2. **Before designing anything**, propose a short list: 3–6 tools and 3–5 principles that fit *this* brief, each with one line on why.
3. Ask the person to choose. Don't install or apply anything they haven't picked.
4. Respect each tool's `mcp.status`: `needs-key` and `dormant` tools need the person to sign in or pay first. Say so rather than failing silently.

Non-negotiables from this guide:
- Honour `prefers-reduced-motion` in every animation. Pause off-screen loops.
- Prove motion with two frames ~1.5 s apart. A single screenshot proves nothing.
- Test at 390px wide with no horizontal scroll.
- Measure contrast (4.5:1 body text).
- Don't default to the fonts every generator uses. Choose type for the subject.

## Editing this repo

- Stack: Next.js 16 + Fumadocs + MDX + Tailwind 4. Content lives in `content/docs`.
- Every guide page follows: live demo → code → install → why it works → links.
- `toolkit/toolkit.json` is the single source of truth. After editing it, run `pnpm gen`.
- Showcase entries (`lib/showcase.ts`) credit and link the owner and never copy their code or assets. Capture with `pnpm shots --only=<id>`.
- Before committing: `pnpm build` and `pnpm verify` (needs `pnpm start` on :3000).

## Toolkit (36 tools, updated 2026-09-28)

**Motion & scroll**

| Tool | What | Status |
|---|---|---|
| [GSAP](https://gsap.com) | The animation engine. Timelines, ScrollTrigger, SplitText, MorphSVG, Flip, all plugins now free. | `live` |
| [Lenis](https://lenis.darkroom.engineering) | Smooth scroll that keeps native scroll semantics. Pairs with GSAP ScrollTrigger. | `library` |
| [Motion (motion.dev)](https://motion.dev) | React/JS animation with springs, layout animation and gestures. Formerly Framer Motion. | `live` |
| [Scroll World](https://github.com/oso95/scroll-world) | Agent skill that turns a brand into a scrollable 3D-world landing page. | `live` |
| [ScrollCraft](https://github.com/nateherkai/scroll-craft) | Skill for premium scroll-driven landing pages: scrubbed video, pinned sections, one signature move. | `live` |

**3D & WebGL**

| Tool | What | Status |
|---|---|---|
| [three.js](https://threejs.org) | The 3D library of the web. R3F wraps it for React. | `live` |
| [img2threejs](https://github.com/img2threejs/img2threejs) | Skill that rebuilds an object from a reference image as a procedural, animation-ready three.js model. | `live` |
| [Threlte](https://threlte.xyz) | three.js for Svelte, declarative and typed. | `library` |
| [ThreeUI](https://threeui.com) | Catalogue of three.js UI components by Design+Code. Community edition is open source. | `library` |
| [Spline](https://spline.design) | Browser/desktop 3D design tool with exportable interactive scenes. | `needs-key` |
| [PlayCanvas](https://playcanvas.com) | WebGL/WebGPU game engine with a collaborative editor. | `on-demand` |
| [Vectary](https://www.vectary.com) | No-code 3D and AR design in the browser. (Logged from 'Vectory.com': vectory.com is a sensor company.) | `tool` |

**Shaders & gradients**

| Tool | What | Status |
|---|---|---|
| [OGL](https://github.com/oframe/ogl) | Tiny WebGL library. This site's hero shader runs on it. | `library` |
| [ShaderGradient](https://shadergradient.co) | Moving 3D gradients for React, Framer and Figma, tuned in a visual editor. | `library` |
| [GetLayers](https://www.getlayers.ai) | Library of prompts plus source for templates, 3D/WebGL scenes, motion sections and animated backgrounds. | `dormant` |

**Component libraries**

| Tool | What | Status |
|---|---|---|
| [React Bits](https://reactbits.dev) | Animated React components with live prop controls, in JS/TS × CSS/Tailwind variants. | `live` |
| [Magic UI](https://magicui.design) | Motion-first shadcn-style components for landing pages. | `live` |
| [Cult UI](https://www.cult-ui.com) | shadcn-compatible animated components with character. | `live` |
| [21st.dev](https://21st.dev) | Community component catalogue plus AI UI generation. | `needs-key` |
| [Bklit UI](https://ui.bklit.com) | UI and chart components shipped as a shadcn registry. | `live` |
| [shadcn/ui](https://ui.shadcn.com) | Copy-in component system and the registry protocol most libraries above ship through. | `live` |

**Reference & research**

| Tool | What | Status |
|---|---|---|
| [Refero](https://refero.design) | Searchable library of real app and web screens, flows and styles. | `needs-key` |
| [Jitter](https://jitter.video) | Web motion-design tool for animating UI and exporting video/Lottie. | `tool` |
| [Paper](https://paper.design) | Design canvas with a local MCP. Bruno uses it to scope ideas. | `on-demand` |

**Claude skills (taste & rules)**

| Tool | What | Status |
|---|---|---|
| [frontend-design (official)](https://github.com/anthropics/skills) | Anthropic's skill for distinctive, non-templated visual direction. | `live` |
| [impeccable](https://github.com/pbakaus/impeccable) | Design language and audit skill: critique, polish, harden, animate, colourise. | `live` |
| [taste-skill](https://github.com/Leonxlnx/taste-skill) | design-taste-frontend, high-end-visual-design and redesign-existing-projects: anti-generic rules. | `live` |
| [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Searchable database of 79 styles, 192 palettes and 74 font pairings. | `live` |
| [Web Interface Guidelines](https://vercel.com/design/guidelines) | Rauno/Vercel's MUST/SHOULD interface rules as a review skill, plus React best practices, composition patterns and view transitions. | `live` |
| [Anthropic example skills](https://github.com/anthropics/skills) | canvas-design, theme-factory, algorithmic-art, web-artifacts-builder, brand-guidelines, webapp-testing. | `live` |
| [frontend-design-basics (Bruno's)](https://github.com/br9704/frontenddesignbasics) | Reads this toolkit and the Principles chapter, then asks which tools and principles fit the brief. | `live` |

**Agent infrastructure**

| Tool | What | Status |
|---|---|---|
| [Context7](https://context7.com) | Current, versioned library docs on demand (GSAP, three.js, Lenis, Next.js…). | `live` |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Drive a real browser: screenshots, frames, interaction. | `live` |
| [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Performance traces, console, network from a live Chrome. | `live` |

**Voice & messaging**

| Tool | What | Status |
|---|---|---|
| [VoiceStudio](https://github.com/debpalash/VoiceStudio) | Local, open-source voice cloning, TTS, dubbing and transcription. | `on-demand` |
| [OpenWA](https://github.com/rmyndharis/OpenWA) | Self-hosted WhatsApp API gateway with a built-in MCP. | `on-demand` |
