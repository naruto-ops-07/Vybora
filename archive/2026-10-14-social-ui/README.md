# Archived: social & admin UI (2026-10-14)

VYBORA became a messaging-only product on 2026-10-14. The feed, explore, reels,
stories, posts, follower profiles, notifications feed and the staff admin
console were **moved here, not deleted**, so they can be restored. The folder is
not part of any workspace, build, lint or type-check.

- `web/src/...` — former `apps/web/src/...` files (same relative paths)
- `web/tests/e2e/social.spec.ts` — former social end-to-end spec
- `mobile/src/...` — former `apps/mobile/src/...` files (tabs, stories, posts, profiles)

Untouched and still live:

- Every database table, function, policy and migration (posts, stories, follows,
  reports, admin RPCs, …). No data was removed.
- The data-access helpers in `packages/api` for those features.

To restore a screen, move its files back to the same path and re-add its route
(`apps/web/src/app/router.tsx`, or the Expo Router file location for mobile).
The UI would need restyling to the current design system (docs/DESIGN_SYSTEM.md).
