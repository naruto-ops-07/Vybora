# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(The same product also ships as a native Expo / React Native app in `apps/mobile`; it follows the same product truth and visual rules.)

## Users

Young social users — students and Gen Z — chatting every day with friends and small groups. They want an app that feels fresh, expressive and fun to open; privacy is a real benefit they appreciate, not the reason they downloaded it.

## Product Purpose

VYBORA is a private messenger: one-to-one and group chats, photos, video, files and voice notes, all end-to-end encrypted (MLS, RFC 9420) on web and phone. Success means people choose it over WhatsApp/Signal because it is more enjoyable to use every day — and stay because nobody, not even VYBORA, can read what they say.

## Positioning

Private and beautiful: Signal-level privacy in an app that is far more enjoyable and expressive to use every day. Neighbours offer one or the other; VYBORA claims both.

## Operating Context

- Phone-first daily use (quick replies, groups, voice notes), with a full web workspace on laptops.
- Add friends by exact username (no phone number required); optional "only friends can start chats".
- Familiar messenger behaviour: runs and tails, swipe to reply, long-press menu with reactions, select mode, read ticks, typing, online / last seen (reciprocal), disappearing messages, chat themes and wallpapers, per-chat mute/pin/archive.
- Per-device accessibility settings: reduce motion, swipe on/off, haptics, four text sizes, high contrast, always-visible actions.

## Capabilities and Constraints

- Web: React 19 + Vite + Tailwind 4 + Radix + Motion/Lenis on the landing; mobile: Expo 57 / React Native 0.86. Shared logic lives in `packages/core`.
- Message content never reaches the server in plaintext; previews, notifications and analytics must never contain message text.
- Encryption has not been independently audited — copy must never claim otherwise or claim "Signal-equivalent" security.
- No admin dashboard or plaintext-access feature may exist.
- Social-network features (feed, stories, followers) were deliberately removed; VYBORA is messaging-only.

## Brand Commitments

- Name: VYBORA (existing logo mark in `apps/web/src/components/ui/Logo.tsx`).
- Binding visual rules from the owner's brief, re-confirmed 2026-10-17: midnight graphite + deep teal with turquoise/emerald accents; Archivo + IBM Plex Mono; no gradients, no drop shadows, no pill-shaped controls, no Lucide icons, no emoji as interface icons, no hover lift/scale animations, no gratuitous animation; radii 4/8/12.
- Voice: plain, warm, sentence case; honest about what is and isn't protected.

## Evidence on Hand

- Real product surfaces: landing (`apps/web/src/routes/Landing.tsx`), workspace, chat, friends, settings, accessibility page; mobile equivalents.
- No user testimonials, user counts, press, ratings or audits exist — none may be invented.

## Product Principles

1. Joy without compromise: every delight must leave privacy intact.
2. Familiar first: people should know how to use it within seconds of coming from WhatsApp/Signal.
3. Honest by default: show exactly what the server can and can't see.
4. Everyone included: accessibility settings are first-class, not an afterthought.

## Accessibility & Inclusion

WCAG 2.2 AA minimum (text pairs ≥ 4.5:1; high-contrast mode targets 7:1), ≥ 44 px touch targets, full keyboard and screen-reader support, reduced motion respected, per-device text size.
