---
version: 1
slug: "apps-web-src-features-connect-workspace-tsx"
primary_target: "apps/web/src/features/connect/Workspace.tsx"
related_targets: ["apps/mobile/src/app/messages/index.tsx"]
---

# Messaging workspace (web + mobile) — surface brief

Scope: the signed-in messenger — chat list, chat view, friends, empty states, first run — on web (`apps/web`) and mobile (`apps/mobile`). Visitor mode: **Operate** (landing stays Persuade, separate).

Audience/job: young social users chatting with friends and small groups every day; they should find the app warm, lively and obviously theirs, with privacy felt rather than lectured.

Constraints: owner-confirmed rules — flat, midnight graphite + deep teal, turquoise/emerald accents, Archivo + IBM Plex Mono, no gradients/shadows/pills, radii 4/8/12, Phosphor, no hover lift/scale, motion only where it means something, reduced motion respected; WCAG AA (HC 7:1); E2EE truth (no plaintext anywhere).

## Direction contract

THESIS: "Your circle, in colour." People are the colour: each person carries a stable personal tone; the interface stays graphite. Refuses the category default of a grey, faceless list with one brand accent and blank empty screens.

OWN-WORLD: Graphite ground and surfaces as today; a curated 8-tone personal palette in the teal–green–blue family (turquoise, emerald, jade, aqua, sea, mint, lagoon, glacier), each with light/dark/HC-safe ink and fill pairs, used for avatar fills, group sender names, mentions and friend chips. Flat authored SVG illustrations (2–3 tones + graphite line, 1.5 px stroke, 8–12 px radii) for empty states. Phosphor regular icons.

STORY: New user lands in an inbox that says what to do next (share @handle → add a friend → say hi), recognises friends by colour at a glance, feels each send "seal", and sees a new friendship arrive as a small shared moment.

FIRST VIEWPORT: Inbox on first run — header "Chats", a "Get started" panel at the top of the list (three steps with check states, @handle copy/share inline, dismiss), below it the illustrated empty state with primary "Add a friend" and secondary "New message"; content pane shows the illustrated welcome with the user's own @handle card.

FORM: Established-world refinement (no concept roll — owner kept the existing world). Signature interactions: sealed send (send glyph → closing lock, ≤ 320 ms, opacity/transform/clip only) and friendship joined (two avatars slide together with "Say hi").

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
