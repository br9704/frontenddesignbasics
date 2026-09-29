---
name: frontend-design-basics
description: The guide to complete, beautiful web design, as an agent skill. Use at the START of any new website, landing page, portfolio, redesign, UI, animation, shader or 3D task, or when the user asks "what can we use here?". Proposes tools and principles from the frontenddesignbasics toolkit that fit the brief and asks the user to choose before designing. Then enforces the guide's rules (type scale, one accent, contrast, reduced motion, 390px, prove motion with frames).
---

# frontend-design-basics

Source: https://github.com/br9704/frontenddesignbasics

## At the start of every design task (before any code)

1. Load the toolkit: `toolkit/toolkit.json` in the repo (or fetch
   `https://raw.githubusercontent.com/br9704/frontenddesignbasics/main/toolkit/toolkit.json`).
   Each tool has `category`, `when`, `install` and `mcp.status`.
2. Understand the brief: subject, audience, the one job of the page.
3. Propose a short list, one line of *why here* each:
   - **3–6 tools.** Prefer `live` ones. Flag `needs-key` (sign-in), `dormant` (paid plan) and `on-demand` (start a local server).
   - **3–5 principles** from the list below that matter most for this brief.
   - **1–3 showcase sites** worth studying (see `lib/showcase.ts`).
4. **Ask the user to choose.** Don't install or apply anything they haven't picked.

## Principles (summarised; full chapters in content/docs)

1. **One point of view.** Decide what the thing *is* before what it looks like. The subject's world is where distinctive choices come from.
2. **A scale for everything.** Type on a ratio (1.2 / 1.333 / 1.618), spacing on 4pt, radii from a set.
3. **Colour is a budget.** About 90% neutrals, 8% one accent with one meaning, 2% semantic.
4. **Hierarchy by contrast.** One big thing per view; size, weight and space do the ranking.
5. **Motion explains change.** UI transitions of 150–400ms with ease-out; `gsap.matchMedia()` or CSS gives reduced motion its own path.
6. **Own your components.** Install from registries (shadcn, React Bits, Magic UI, Cult UI) and restyle to your system.
7. **AI assets are briefed, not wished for.** Prompts read like layout specs, colours in hex, and no text inside generated images; set type in HTML.

## Rules to check before calling anything done

- MUST work at 390px with no horizontal scroll.
- MUST meet 4.5:1 contrast for body text.
- MUST show visible focus states and 44px touch targets.
- MUST honour `prefers-reduced-motion`, and pause off-screen canvases and loops.
- MUST prove motion with two frames ~1.5 s apart (a screenshot proves nothing), and with reduced motion on, the two frames must match.
- MUST NOT default to the fonts every generator uses. Choose type for the subject.
