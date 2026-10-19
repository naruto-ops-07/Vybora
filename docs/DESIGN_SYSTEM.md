# VYBORA design system

_Rewritten 2026-10-19 for the three looks. On 2026-10-18 the owner dropped the flat rules of 2026-10-14 (no gradients, no shadows, graphite + teal only, Archivo, radii 4/8/12)._

## Token model

- **Source of truth:** [`packages/config/src/looks.ts`](../packages/config/src/looks.ts): `looks` (three `LookDef`s, each with `fonts`, `radii`, `elevation`, `glass`, `ambient` and `modes.light|dark` tokens), `highContrastThemes`, `personTonesByLook`, `DEFAULT_LOOK = 'velvet'`. Chat themes and `outgoingBubbleFill` are in [`packages/config/src/chat.ts`](../packages/config/src/chat.ts). Contrast for every look × mode is tested in `packages/core/src/looks.test.ts`.
- **Web:** `pnpm theme:css` (`scripts/gen-look-css.mjs`) generates the CSS variables (`--vy-*`: surfaces, text, `--vy-bubble-out-from|to|text`, `--vy-primary-from|to`, `--vy-shadow-1..3`, `--vy-radius-sm|md|lg`, `--vy-font-display|text`, tones), keyed by `data-look` and `data-theme` on `<html>`. Don't hand-edit the generated block: change `looks.ts` and re-run. A pre-paint script in `index.html` (mirrored and parity-tested by `initialAppearance` in `apps/web/src/lib/theme.ts`) sets look, theme, high contrast and text size before first paint.
- **Mobile:** `useTheme()` returns the active look's tokens for the current mode (or the high-contrast set), plus radii, fonts and `shadowStyle(level, t)`.
- **Storage:** the choice is per device under `vybora.appearance` (`APPEARANCE_KEY`, parsed by `parseAppearance` in core). Appearance never leaves the device.

## The looks

|                       | Velvet (default)                                                                                                                       | Aurora                                                                                     | Bloom                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Palette               | Warm black `#0F0D0B` / ivory, deep emerald bubbles (`#145244 → #0D3B31` dark), champagne gold accent (`#D4B483` dark, `#846530` light) | Graphite `#0A0E0F` and teal, teal → indigo bubbles (`#0A8276 → #5F62EE`), turquoise accent | Pearl / plum night, sunset pink → orange bubbles (`#D6336C → #C84A1A`), violet accent and primary (`#6D4AFF → #A23EF0`) |
| Type (display / text) | Fraunces / DM Sans                                                                                                                     | Sora / Manrope                                                                             | Plus Jakarta Sans                                                                                                       |
| Radii sm / md / lg    | 6 / 12 / 18                                                                                                                            | 8 / 14 / 20                                                                                | 10 / 16 / 24                                                                                                            |
| Elevation             | Soft real shadows in three levels (1: bubbles, buttons, cards · 2: menus, popovers, toasts · 3: dialogs, sheets)                       | Same three levels, tuned per look                                                          | Same three levels, tuned per look                                                                                       |
| Glass                 | None (solid panels)                                                                                                                    | Frosted header, composer and popovers (web)                                                | Frosted (web)                                                                                                           |
| Ambient               | None (a still glow)                                                                                                                    | Slow drift                                                                                 | Soft glow pulse                                                                                                         |

IBM Plex Mono stays for timestamps, counts and protocol details in every look. Fonts are **self-hosted**: web bundles them from `@fontsource` / `@fontsource-variable` packages (no Google Fonts request); mobile loads them with `expo-font` from the bundled `@expo-google-fonts/*` packages. Mobile draws headers and popovers solid (no blur).

Hex values moved away from the mockups to pass a contrast floor are listed at the top of `looks.ts`.

### High contrast

One flat set (`highContrastThemes`, light and dark), shared by all three looks: no gradients, no shadows (`--vy-shadow-*` are `0 0 #0000` so focus rings still compose), no ambient, links underlined. Primary text ≥ 7:1, secondary ≥ 4.5:1, borders ≥ 3:1.

### Outgoing bubbles

`outgoingBubbleFill(chatTheme, look, mode, { highContrast })` is the one rule for web and mobile. The **Default** chat theme (the Teal preset too) uses the look's bubble gradient (180° in Velvet, 135° otherwise). Any other chat theme is that theme's flat colour with white text ≥ 4.5:1, drawn with the look's radius and depth. High contrast uses the flat accent.

### Settings → Appearance

Web and mobile: one card per look (name, one-line description, preview) and a Mode control (Light · Dark · Match system). The change applies at once, on this device only.

## Contrast floors

Every text pair meets **WCAG AA (4.5:1)** in every look and mode; control edges (`borderStrong`) ≥ 3:1; `border` is a decorative hairline. Status colours (danger, success, warning) always come with text or an icon.

**Chat themes** (shared per conversation, synced to all members): Default (the look's bubble) plus flat presets (Emerald, Ocean, Indigo, Violet, Rose, Ember, Graphite), each with separate accents for dark and light. Wallpapers are line/dot patterns in the accent at ≤ 22% opacity. Preset and wallpaper keys are validated by the database and must not be renamed.

## Typography scale

React Native ignores `fontWeight` with custom fonts, so mobile uses `components/Text.tsx`, which maps weight → font file.

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
- **Radius**: from the look (`--vy-radius-sm|md|lg` on web, `useTheme` on mobile): `sm` badges, segments, chips · `md` buttons, inputs · `lg` panels, dialogs, message bubbles (tighter on the tail corner). Circles only for avatars and status dots.
- **Touch targets**: ≥ 44×44 on mobile, ≥ 32×32 visible with ≥ 40 px hit area on web.
- **Icons**: Phosphor, regular weight (≈1.5 px stroke). Sizes 16 / 20 / 24. Decorative icons are hidden from assistive tech; standalone icon buttons always have a label.

## Components

| Component               | Rules                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button                  | Variants: primary (the look's primary gradient), secondary, outline, ghost, danger. `md` radius, elevation 1. Press/hover changes colour only. Loading shows a spinner and sets `aria-busy` |
| Input / textarea        | 1px `line-strong` border, accent border on focus plus the global 2px focus ring. Labels always visible; errors below the field with `role="alert"`                                          |
| Toggle                  | Square-cornered switch with `role="switch"` and `aria-checked`                                                                                                                              |
| Segmented control       | Joined rectangular segments (theme, phone visibility)                                                                                                                                       |
| Tabs / filters          | Text tabs with a 2px accent underline (no pills)                                                                                                                                            |
| List row                | 44–48px avatar, title + mono time, preview; selected = `surface-strong` + 2px accent bar                                                                                                    |
| Message bubble          | Outgoing = `outgoingBubbleFill` (look gradient or chat-theme colour); incoming = `bubble-in` + hairline. Mono timestamp and receipt ticks inside the bubble                                 |
| Section                 | Sentence-case semibold label, bordered `surface` card, muted footnote                                                                                                                       |
| Dialog / sheet          | Bordered `surface`, scrim, focus trap, Escape/close button; bottom sheet on phones                                                                                                          |
| Empty / error / loading | Bordered icon tile + title + one line + optional action; skeletons pulse in tone (no shimmer gradient)                                                                                      |

## Layout

- **Web** (≥ 768 px): 72 px navigation rail · 340–360 px list pane · flexible content · optional 360 px details pane (overlay below 1280 px). **Phones**: one pane at a time, bottom bar (Chats / Settings) on list screens, back links inside content.
- Breakpoints: 375 (phone), 768 (tablet), 1024/1280 (laptop), 1440+ (desktop). No horizontal scrolling at any width (checked by Playwright).
- Mobile app: header-less inbox with its own top bar; stack navigation for chat, details, verification, privacy and settings; safe areas respected.

## Messenger patterns

Shared by web and mobile; the grouping logic lives in `packages/core` (`layoutThread`, `chat/time`, `chat/preview`, `chat/swipe`).

- **Runs.** Consecutive messages from the same sender form a run: 2 px between bubbles inside a run, 8 px between runs.
- **Tail.** The last bubble of a run gets a tighter tailed corner; the other corners use the look's `lg` radius.
- **Date chips.** 4 px radius, IBM Plex Mono 11 px. On web the chip is sticky per day section, so it never overlaps the next day's chip; on mobile a floating chip follows the scroll.
- **Unread divider.** A labelled rule above the first unread message. The count is frozen when the chat opens (`unreadUntilSeq` in `layoutThread`; both apps freeze `lastReadSeq` and `lastSeq` at open), so it never grows while you read.
- **Jump to latest.** 8 px radius, 40 px on web and 44 px on mobile, with a count of new messages while you are scrolled up.
- **Badges.** 4 px radius, Plex Mono, text capped at `99+`.
- **Message menu.** A reaction bar plus actions (Reply, Copy, Select, Delete…). Web: hover action bar and a right-click context menu (`@radix-ui/react-context-menu`); the hover bar is hidden on coarse pointers unless "Always show message actions" is on, in which case a slim React / Reply / More bar stays visible. Mobile: long-press opens the `MessageActions` sheet.
- **Select mode.** Entered from the menu's Select action; bubbles show a selection mark, a bar shows the count with Copy and Delete, and taps toggle selection instead of opening actions.
- **Chat rows.** Receipt ticks, sender name in groups, typing indicator, unread badge, muted icon. Web: row context menu. Mobile: swipe actions (`ReanimatedSwipeable`, Archive button; no full-swipe). Destructive row actions show an Undo toast (web: the shared 7 s action toast; mobile: 5 s `UndoBar`, safe-area aware).
- **Header status.** "Online", "last seen …" (minute precision), or the "end-to-end encrypted" line when neither may be shown.

## Personal tones ("Your circle, in colour")

_Added 2026-10-17; per look since 2026-10-18._ People are the colour. `personTone(userId)` in `packages/core` hashes the user id (FNV-1a, 32 bit) into one of eight tone slots, so a person keeps the same slot on every device. Each look fills the slots from `personTonesByLook`: Velvet uses jewel tones (turquoise, emerald, citrine, aquamarine, topaz, garnet, sapphire, amethyst), Aurora the original teal–blue set below, Bloom vivid tones (teal, green, pink, sky, tangerine, sunflower, blue, orchid). Web mirrors them as `--vy-tone-<name>-fill|ink|name`. Aurora's values:

| Tone      | Dark fill / name | Light fill | Light name (text) | Light initials |
| --------- | ---------------- | ---------- | ----------------- | -------------- |
| turquoise | `#2DD4BF`        | `#99F6E4`  | `#0F766E`         | `#115E59`      |
| emerald   | `#34D399`        | `#A7F3D0`  | `#047857`         | `#065F46`      |
| lime      | `#A3E635`        | `#D9F99D`  | `#3F6212`         | `#3F6212`      |
| aqua      | `#22D3EE`        | `#A5F3FC`  | `#0E7490`         | `#155E75`      |
| sky       | `#38BDF8`        | `#BAE6FD`  | `#0369A1`         | `#075985`      |
| mint      | `#6EE7B7`        | `#D1FAE5`  | `#065F46`         | `#065F46`      |
| ocean     | `#60A5FA`        | `#BFDBFE`  | `#1D4ED8`         | `#1D4ED8`      |
| glacier   | `#A5B4FC`        | `#E0E7FF`  | `#4338CA`         | `#4338CA`      |

- Dark initials are `#0A0E0F` on every fill. Contrast is checked in core tests: names ≥ 4.5:1 on surfaces and incoming bubbles, initials ≥ 4.5:1 on fills.
- **Only** for avatar fallbacks (circle, one or two initials in the text font, semibold), group sender names and mentions. Never on chrome, buttons, backgrounds or status: typing and unread stay in the accent.
- High contrast: sender names use the text colour in bold; initials switch to the theme ink.
- Group avatars: the first two other members by id, overlapping, the front one with a 2 px ring in the row colour (a border, not a shadow).

## Illustrations and empty states

Four flat drawings (welcome, no chats, no friends, nothing found) on web (`apps/web/src/components/illustrations`) and mobile (`apps/mobile/src/components/illustrations.tsx`, react-native-svg), in one grammar: a line in the muted text colour at 1.5 px with round caps (non-scaling), two or three flat fills from the tones and the accent, radii 8–12, VYBORA's own bubble tail and a lock seal. They are decorative (hidden from assistive tech). An empty state is an illustration, a heading, one sentence and at most two actions:

| Where                  | Heading                   | Sentence                                                     |
| ---------------------- | ------------------------- | ------------------------------------------------------------ |
| No chat selected (web) | Pick a chat, or start one | Messages here are sealed on your device before they're sent. |
| Empty chat list        | No chats yet              | Add a friend by their username, then say hi.                 |
| No friends             | Your circle starts here   | Share your username or add someone by theirs.                |
| Search found no one    | No one by that name       | Check the spelling, or add them by username.                 |

**Fresh-account chat list** (`chatListEmptyState` and `CHAT_LIST_EMPTY_COPY` in core, same on web and mobile) shows one of three states: no friends ("No friends yet", with Find friends and Share your username), waiting on sent requests ("Waiting on N requests. Find more friends while you wait."), or friends but no chats ("No chats yet", "Say hi to a friend.", New message). Friends → requests has **Received (n)** and **Sent (n)** tabs.

The first-run **Get started** panel sits at the top of the chat list: three steps (share your username, add a friend, say hi), each with a check icon and "Done" in its accessible name (never colour alone), "N of 3" in Plex Mono, three flat progress segments, and a hide button. **HandleCard** shows your avatar, name and `@username` with Copy and Share.

## Accessibility settings

Settings → Accessibility on web and mobile. Preferences are stored **per device** (web `localStorage`, mobile `expo-secure-store`, both under the key `vybora.a11y`) and never leave the device.

| Setting                     | Values                                            | Effect                                                                                        |
| --------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Reduce motion               | System (default) · On · Off                       | Follows the system setting or overrides it                                                    |
| Swipe to reply              | On (default) · Off                                | Swipe a bubble to reply                                                                       |
| Haptics                     | On (default) · Off                                | Vibration on swipe thresholds and selection (mobile)                                          |
| Text size                   | Small 13 · Default 15 · Large 17 · Extra large 20 | Message text size in px                                                                       |
| High contrast               | Off (default) · On                                | Switches to the `highContrastThemes` tokens (`data-contrast="high"` on web); links underlined |
| Always show message actions | Off (default) · On                                | Keeps the action bar visible instead of revealing it on hover                                 |

High-contrast token rules (checked in core tests, light and dark): primary text ≥ 7:1 against its surface, secondary text ≥ 4.5:1, borders ≥ 3:1. The CSS values in `apps/web/src/styles/index.css` mirror `packages/config`.

## Motion and libraries (web)

| Where                   | What                                                                                                                                                                                                                                                                                                                                                  | Library                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Messaging workspace     | Colour/opacity state changes ≤ 180 ms; tooltips fade in (120 ms); the details drawer slides 24 px in from its edge (220 ms, below `xl`) because it answers a click                                                                                                                                                                                    | CSS, [`@radix-ui/react-tooltip`](https://www.radix-ui.com/primitives/docs/components/tooltip)              |
| Two delight moments     | **Sealed send:** after a send goes out, the plane gives way to a lock whose shackle closes, then returns (320 ms in all, opacity/transform only, timeline `sealFrame` in core, mobile via Reanimated plus a light haptic). **Friendship joined:** two avatars slide 16 px together (280 ms) on the new-friend card. Both are off under reduced motion | CSS keyframes; mobile `react-native-reanimated`                                                            |
| Command menu (Ctrl/⌘ K) | Jump to any chat, start a message, open settings or switch theme                                                                                                                                                                                                                                                                                      | [`cmdk`](https://cmdk.paco.me)                                                                             |
| Landing page only       | One orchestrated hero reveal (masked headline lines); the "How a message travels" diagram is driven by scroll position; the workspace preview reveals once; FAQ expands to measured height; smooth wheel scrolling                                                                                                                                    | [`motion`](https://motion.dev), [`lenis`](https://lenis.darkroom.engineering), `@radix-ui/react-accordion` |

**Ambient:** each look has at most one ambient effect (Aurora drifts, Bloom pulses, Velvet stays still) behind signed-out surfaces and as the chat canvas glow. It stops under reduced motion and is absent in high contrast. Motion uses opacity and transform only.

Everything is wrapped in `MotionConfig reducedMotion="user"`; Lenis and the ciphertext scramble switch off under `prefers-reduced-motion`, and the global CSS rule collapses keyframe and transition durations. Nothing lifts, scales or bounces on hover.

## Accessibility

Visible focus ring on every interactive element (2px accent, 2px offset); skip link to content; icon-only controls labelled; status changes announced with `aria-live` / `accessibilityLiveRegion`; colour never the only signal (receipts have labels, unread counts have text); reduced motion disables animation; dark and light themes checked separately.
