---
version: 1
slug: "apps-web-src-features-connect-workspace-tsx"
primary_target: "apps/web/src/features/connect/Workspace.tsx"
related_targets: ["apps/mobile/src/app/messages/index.tsx"]
---

# Messaging workspace (web + mobile) — surface brief

Scope: the signed-in messenger — chat list, chat view, friends, empty states, first run — on web (`apps/web`) and mobile (`apps/mobile`). Visitor mode: **Operate** (landing stays Persuade, separate).

Audience/job: young social users chatting with friends and small groups every day; they should find the app warm, lively and obviously theirs, with privacy felt rather than lectured.

Constraints: on 2026-10-18 the owner dropped the flat rules (no gradients/shadows, graphite + teal only, Archivo, radii 4/8/12). The app now ships three looks × light/dark from `packages/config/src/looks.ts`: Velvet (default), Aurora, Bloom. Still binding: Phosphor icons, sentence case, motion only where it means something, reduced motion respected (ambient effects stop), ≥ 44 px touch targets, per-device text size, WCAG AA (HC 7:1, flat and shared by all looks), no invented claims, E2EE truth (no plaintext anywhere).

## Direction contract

THESIS: "Your circle, in colour." People are the colour: each person carries a stable personal tone; the interface stays graphite. Refuses the category default of a grey, faceless list with one brand accent and blank empty screens.

OWN-WORLD: The chosen look sets ground, surfaces, type, radii, elevation and the outgoing bubble (Velvet: warm black / ivory, emerald bubble, gold accent, soft real shadows, no glass; Aurora: graphite, teal → indigo bubble, frosted panels, slow drift; Bloom: pearl / plum night, pink → orange bubble, violet accent, frosted panels, soft pulse). An 8-tone personal palette per look (`personTonesByLook`), each with light/dark/HC-safe ink and fill pairs, used for avatar fills, group sender names, mentions and friend chips. Flat authored SVG illustrations (2–3 tones + graphite line, 1.5 px stroke, 8–12 px radii) for empty states. Phosphor regular icons.

STORY: New user lands in an inbox that says what to do next (share @handle → add a friend → say hi), recognises friends by colour at a glance, feels each send "seal", and sees a new friendship arrive as a small shared moment.

FIRST VIEWPORT: Inbox on first run — header "Chats", a "Get started" panel at the top of the list (three steps with check states, @handle copy/share inline, dismiss), below it the illustrated empty state with primary "Add a friend" and secondary "New message"; content pane shows the illustrated welcome with the user's own @handle card.

FORM: Three owner-chosen looks on one shared structure (Velvet default); the layout and the signature interactions are the same in every look. Signature interactions: sealed send (send glyph → closing lock, ≤ 320 ms, opacity/transform/clip only) and friendship joined (two avatars slide together with "Say hi").

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
