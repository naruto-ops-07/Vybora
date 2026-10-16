# Messenger layout — deferred follow-ups

_From the 2026-10-15 build (branch feat/messenger-layout). Items reviewers flagged as minor and deferred, plus findings parked after the final review. None block merge; see the final review triage in the branch history._

## Parked after final review

- mobile high-contrast reply-quote sender name hardcoded #FFFFFF on filled bubble (~1.5:1 in dark HC) — Ruling: real, minor, deferred to a follow-up (one-line fix) — cost if wrong: low-contrast 12 px name in dark HC replies.
- formatter cache freezes device time zone when timeZone undefined (OS zone change mid-session) — Ruling: rare edge, deferred — cost if wrong: times in old zone until reload.
- registry keeps a server-closed channel while holders remain — Ruling: deferred; prior behaviour was equally dead for existing holders — cost if wrong: new acquirer shares a dead channel until all release.

## Deferred minors by task

- **Task 1:** no 6/7-day boundary tests; no invalid-date guard (RangeError on bad timestamp); formatUnread(NaN/5.5); formatClock hourCycle / en-GB "Sept" locale variance
- **Task 2-4:** contrast test omits success/warning and bubbleIn/bg/accentSoft pairs; swipe boundary edges (63/64, 23/24, 799/800, dy==dx) untested; receiptOf non-null assertions; unknown attachment kind → "File: …"; text-size list duplicates TEXT_SIZE_PX keys; layout forEach mutation style; layout tests lack non-UTC zone / unread-on-new-day / multi-run cases
- **Task 5:** no tests for own id / empty-null array / missing settings row; fetchLastSeen silently drops >100 and doesn't dedupe; gen-db-types doesn't run prettier (next regen churns 3000 lines); Realtime may cache policy decision until rejoin (⚠️ for docs)
- **Task 5:** caller_blocked_with duplicates existing public.is_blocked_with(uuid) (relationships.sql:89) — could reuse
- **Task 6:** data-* attrs applied in useEffect → landing useScramble first run misses stored override (use useLayoutEffect); no pre-paint apply of contrast/text size (flash); Segmented radiogroup lacks arrow-key/roving tabindex (a11y gap on the a11y page — candidate to fix in final); defaults written to storage on first mount; no tests for 'off'/system resolution/storage throw; CSS unverified in browser; .text-msg etc in @layer utilities (no variant prefixes); import order in test/utils
- **Task 7:** no ChatPane-level tests for readMark/scroll-to-divider/group avatar; role=article label + exposed children may double-read; readMark may freeze a stale cached lastReadSeq; onSelect no-op until Task 9/10
- **Task 7:** day <section aria-label> creates many region landmarks (use role=group / unlabeled div); groupByDay drops items before first date item (unreachable today); stale-cache lastSeq freeze edge
- **Task 8:** jumpToLatest smooth scroll briefly re-counts arrivals mid-animation; identical consecutive announcements not re-read; announcer baseline '' if isSuccess before sync; ChatPane not keyed by id (lastSeenSeq reset via effect); Space scrolls pane until select mode; no ChatPane-level tests for jump/new-count/live region
- **Task 9:** no flick/select/Bubble-level swipe tests; `armed` unused (no distinct armed visual); old inline reaction picker coexists with menu reaction bar (two role=menu surfaces); multi-touch unguarded in useSwipeReply; reply arrow -left-8 off-edge at small offsets
- **Task 9:** .hover-actions display:none on coarse pointers not unit-testable in jsdom (verify in browser in Task 18); pointer:coarse is primary-pointer only (hybrid devices)
- **Task 10:** bulk delete clears selection before sends, partial failure untraceable; select-mode ChatPane flow untested (Esc ordering, Space, canBulkDelete, copy output); every row's checkbox is a tab stop in select mode
- **Task 10:** links/media controls inside bubble remain keyboard-activatable in select mode (use `inert`); prune effect clears selection if `ordered` transiently empty; copy-failure toast text assumes "blocked"; prune/copy paths untested
- **Task 11:** typing tests miss stop path/20 cap; row menu tests miss Unpin/Unmute/Mute submenu/More; tick glyph precedes "You:" prefix; alwaysShowActions bar overlaps row time
- **Task 11:** live.has(conv) can't distinguish old/new channel after userId change (tiny window); same-topic leave→rejoin on rare lifecycle flips depends on supabase-js async removal
- **Task 12:** no ChatPane/InboxPane/ConnectProvider tests for privacy gating & touch-after-send; privacy query loading briefly hides dots
- **Task 12:** inactive useLastSeen returns isSuccess true with data undefined; spread of tracked props
- **Task 13:** early toggle before SecureStore load can be reverted; redundant write after load; no tests for Text scale / HC theme switch; reply quotes etc unscaled in bubbles; scaled row title/preview truncate at xl (check device)
- **Task 14:** screen-level behaviours untested (readMark/unreadUntilSeq wiring, counter, announcements); group bubble maxWidth 82% inside shrink-wrapped row may overflow (device check); onScrollToIndexFailed fallback approximate
- **Task 14:** beginScroll doesn't stop in-flight fade-out; iOS momentum-end after new drag may clear flag; unread-divider top row keeps previous label; Animated.Value allocated per render (useRef(new …)); "Open photo" a11y action missing (see ruling)
- **Task 15:** any message (deleted/failed/undecryptable) selectable by tap; Gesture.Pan rebuilt each render (useMemo); swipe test is render-smoke only; clipboard calls lack .catch; MessageActions test may flake on cold jest cache
- **Task 15:** prune effect / disabled Copy / singular title untested; real inner-Pressable fall-through only prop-tested (Attachment mocked)
- **Task 16:** multiple swipeables can stay open; Mute label uses isMuted only vs badge/icon muted (web parity quirk); undo id Date.now
- **Task 16:** announceForAccessibility not iOS-gated (TalkBack may double-speak "Archived"); screen composition (swipeable wiring, undo key) untested
- **Task 17:** no screen-level tests for touchActivity/inbox gating/header; online not reset on toggle off→on (web parity); last-seen text doesn't advance without rerender; "no request when disabled" test asserts synchronously
- **Task 18:** CONNECT.md implies touch_activity itself checks show_online (clients gate it); DESIGN_SYSTEM "secondary text ≥4.5:1" understates textMuted 7:1; FEATURE_STATUS a11y row implies web haptics; mobile a11y.test timing-sensitive under parallel load (5 s timeout once)
