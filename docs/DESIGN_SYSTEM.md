# VYBORA design system

_Established 2026-10-14. Source of truth for tokens: [`packages/config/src/index.ts`](../packages/config/src/index.ts) (mirrored as CSS variables in [`apps/web/src/styles/index.css`](../apps/web/src/styles/index.css)). Chat themes: [`packages/config/src/chat.ts`](../packages/config/src/chat.ts)._

## Direction

A private messaging product should feel **quiet, precise and trustworthy**: the interface recedes so conversations are the focus. Style family: _Minimalism / Swiss_ (selected with the UI/UX Pro Max design-system search for "private secure messaging"; its default palette and typeface were overridden by the product brief).

| Principle                  | In practice                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Flat, layered by tone      | Surfaces are separated by 1px borders and three surface tones — never by shadows or gradients                      |
| One accent, used sparingly | Teal/turquoise marks the primary action, the current selection, focus and unread state. Everything else is neutral |
| Data looks like data       | Timestamps, counts and protocol details use IBM Plex Mono; labels stay in sentence case                            |
| Dense but calm             | Compact type scale and 4‑pt spacing so chat lists and threads show more content                                    |
| Motion only for state      | Colour/opacity transitions ≤ 180 ms in the app (see Motion and libraries). No lift, scale or decorative animation  |

### Hard constraints

No gradients · no drop shadows · no Lucide icons · no emoji as interface icons · no hover lift/scale · no gratuitous animation · no pill-shaped controls · no arbitrary radii or spacing · no oversized headings in messaging screens. Enforced in code: Tailwind's shadow tokens are set to `none` and radius utilities collapse to the three allowed values.

## Colour

Midnight graphite and deep teal, with turquoise (dark) / teal‑700 (light) accents and emerald for success. Every text pair below meets **WCAG AA (4.5:1)**; `subtle` text meets 4.5:1 on `surface`.

| Token                            | Light                             | Dark                              | Use                                         |
| -------------------------------- | --------------------------------- | --------------------------------- | ------------------------------------------- |
| `bg`                             | `#F3F6F6`                         | `#0A0E0F`                         | App background, chat canvas                 |
| `surface`                        | `#FFFFFF`                         | `#0F1517`                         | Panels, lists, headers, cards               |
| `surface-muted`                  | `#EDF2F2`                         | `#151D1F`                         | Hover / pressed                             |
| `surface-strong`                 | `#E2EAEA`                         | `#1B2528`                         | Selected row, group avatar                  |
| `line` / `line-strong`           | `#DCE4E4` / `#C2CFCF`             | `#1F2A2D` / `#2E3D41`             | Dividers / control borders                  |
| `ink` / `muted` / `subtle`       | `#0B1416` / `#4B5C5E` / `#5F7173` | `#E6EEEE` / `#9AACAD` / `#75898B` | Text hierarchy                              |
| `accent` / `on-accent`           | `#0F766E` / `#FFFFFF`             | `#2DD4BF` / `#04201D`             | Primary actions, focus, selection           |
| `accent-soft`                    | `#DDF3F0`                         | `#0E2B2A`                         | Selected reaction / segment background      |
| `bubble-in`                      | `#EDF2F2`                         | `#1B2528`                         | Incoming message                            |
| `danger` · `success` · `warning` | `#B42318` · `#047857` · `#B45309` | `#F87171` · `#34D399` · `#FBBF24` | Status (always paired with text or an icon) |

**Chat themes** (shared per conversation, synced to all members): eight flat outgoing-bubble colours — Teal (default), Emerald, Ocean, Indigo, Violet, Rose, Ember, Graphite — each with white text ≥ 4.5:1 and separate accents for dark and light mode. Wallpapers are flat line/dot patterns (Constellation, Waves, Grid, Rings, Dunes, Stars) drawn in the accent at ≤ 22% opacity. Preset and wallpaper keys are validated by the database and must not be renamed.

## Typography

| Family            | Role                                                                                                                                                            | Weights            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **Archivo**       | All interface text. Display headings use the expanded width (125%, `.type-display`) — the brand’s one bold typographic move; web only (the variable width axis) | 400, 500, 600, 700 |
| **IBM Plex Mono** | Timestamps, counts, unread badges, safety numbers, ciphertext, protocol details                                                                                 | 400, 500           |

Web loads both from Google Fonts with `display=swap`; mobile bundles them with `expo-font` (`@expo-google-fonts/*`). React Native ignores `fontWeight` with custom fonts, so mobile uses `components/Text.tsx`, which maps weight → font file.

| Step   | Size / line height | Use                             |
| ------ | ------------------ | ------------------------------- |
| xs     | 11/16 mono         | Metadata, timestamps            |
| sm     | 13/19              | Secondary text, previews        |
| base   | 15/22              | Body, messages                  |
| md     | 16–17              | Row titles, header titles       |
| lg     | 18–22              | Screen titles (Chats, Settings) |
| xl–3xl | 24–48              | Marketing pages only            |

Body text on mobile inputs is 16px (prevents iOS zoom).

## Spacing, radius, sizing

- **Spacing**: 4‑pt scale — 4, 8, 12, 16, 20, 24, 32, 40, 48.
- **Radius**: `sm` 4 (badges, segments, reaction chips) · `md` 8 (buttons, inputs, cards' inner controls) · `lg` 12 (panels, dialogs, message bubbles; 4 on the tail corner). Circles only for avatars and status dots.
- **Touch targets**: ≥ 44×44 on mobile, ≥ 32×32 visible with ≥ 40 px hit area on web.
- **Icons**: Phosphor, regular weight (≈1.5 px stroke). Sizes 16 / 20 / 24. Decorative icons are hidden from assistive tech; standalone icon buttons always have a label.

## Components

| Component               | Rules                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button                  | Variants: primary (accent fill), secondary, outline, ghost, danger. 8px radius. Press/hover changes colour only. Loading shows a spinner and sets `aria-busy` |
| Input / textarea        | 1px `line-strong` border, accent border on focus plus the global 2px focus ring. Labels always visible; errors below the field with `role="alert"`            |
| Toggle                  | Square-cornered switch with `role="switch"` and `aria-checked`                                                                                                |
| Segmented control       | Joined rectangular segments (theme, phone visibility)                                                                                                         |
| Tabs / filters          | Text tabs with a 2px accent underline (no pills)                                                                                                              |
| List row                | 44–48px avatar, title + mono time, preview; selected = `surface-strong` + 2px accent bar                                                                      |
| Message bubble          | Outgoing = theme colour, white text; incoming = `bubble-in` + border. Mono timestamp and receipt ticks inside the bubble                                      |
| Section                 | Sentence-case semibold label, bordered `surface` card, muted footnote                                                                                         |
| Dialog / sheet          | Bordered `surface`, scrim, focus trap, Escape/close button; bottom sheet on phones                                                                            |
| Empty / error / loading | Bordered icon tile + title + one line + optional action; skeletons pulse in tone (no shimmer gradient)                                                        |

## Layout

- **Web** (≥ 768 px): 72 px navigation rail · 340–360 px list pane · flexible content · optional 360 px details pane (overlay below 1280 px). **Phones**: one pane at a time, bottom bar (Chats / Settings) on list screens, back links inside content.
- Breakpoints: 375 (phone), 768 (tablet), 1024/1280 (laptop), 1440+ (desktop). No horizontal scrolling at any width (checked by Playwright).
- Mobile app: header-less inbox with its own top bar; stack navigation for chat, details, verification, privacy and settings; safe areas respected.

## Motion and libraries (web)

| Where                   | What                                                                                                                                                                                                               | Library                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Messaging workspace     | Colour/opacity state changes ≤ 180 ms; tooltips fade in (120 ms); the details drawer slides 24 px in from its edge (220 ms, below `xl`) because it answers a click                                                 | CSS, [`@radix-ui/react-tooltip`](https://www.radix-ui.com/primitives/docs/components/tooltip)              |
| Command menu (Ctrl/⌘ K) | Jump to any chat, start a message, open settings or switch theme                                                                                                                                                   | [`cmdk`](https://cmdk.paco.me)                                                                             |
| Landing page only       | One orchestrated hero reveal (masked headline lines); the "How a message travels" diagram is driven by scroll position; the workspace preview reveals once; FAQ expands to measured height; smooth wheel scrolling | [`motion`](https://motion.dev), [`lenis`](https://lenis.darkroom.engineering), `@radix-ui/react-accordion` |

Everything is wrapped in `MotionConfig reducedMotion="user"`; Lenis and the ciphertext scramble switch off under `prefers-reduced-motion`, and the global CSS rule collapses keyframe and transition durations. Nothing lifts, scales or bounces.

## Accessibility

Visible focus ring on every interactive element (2px accent, 2px offset); skip link to content; icon-only controls labelled; status changes announced with `aria-live` / `accessibilityLiveRegion`; colour never the only signal (receipts have labels, unread counts have text); reduced motion disables animation; dark and light themes checked separately.
