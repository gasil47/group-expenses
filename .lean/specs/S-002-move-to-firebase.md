---
id: S-002
title: Expenses that never go to sleep and update live
status: agreed
tags: [firebase, firestore, auth, security-rules]
---
## Problem
S-001 was built on Supabase, whose free projects pause after 7 days and need custom SMTP for
email sign-in. The user chose Firebase Spark (free) instead: it never pauses and syncs live to
every phone. Replace the backend; keep the ledger math, screens and behaviour of S-001.

## Decisions
- D1: Firebase Spark: Auth + Firestore only. No Cloud Functions (Blaze only), so every access rule and history guarantee lives in `firestore.rules` (zk 20261121-125645).
- D2: Sign-in: Google, plus email + password (sign-up, sign-in, "forgot password"). No email-link sign-in: Spark caps it at 5 emails/day.
- D3: Data model (the contract for T-007 and T-008):
  - `users/{uid}`: `{displayName}`. Owner writes; any signed-in user reads.
  - `groups/{gid}`: `{name, createdBy, memberIds:[uid], memberNames:{uid:name}, inviteToken, joinToken?}`. Members read and update `name`. Creator creates with `memberIds == [uid]`.
  - `invites/{token}`: `{groupId}`. Members create; signed-in users `get` it but cannot `list`.
  - Join: user updates the group, adding only their own uid to `memberIds`/`memberNames` and setting `joinToken` to a token where `get(invites/token).groupId == gid`.
  - `groups/{gid}/expenses/{eid}`: `{description, amountFils, paidBy, shares:{uid:fils}, spentOn, updatedBy, updatedAt, historyId, deleted}`. Shares are embedded, so a write is atomic.
  - `groups/{gid}/history/{hid}`: `{expenseId, action:create|update|delete, changedBy, changedAt, before, after}`. Create-only and immutable.
  - Expense writes are allowed only by members, with `updatedBy == auth.uid`, `existsAfter(history/<historyId>)`, and `getAfter(history).changedBy == auth.uid`. Shares keys must be members, `amountFils > 0`, no hard delete.
  - `groups/{gid}/settlements/{sid}`: `{fromUser, toUser, amountFils, createdBy, createdAt, deleted}`. Members create when `auth.uid` is `fromUser` or `toUser` (now either side can record a payment). No hard delete.
- D4: Live updates via `onSnapshot` on the group's expenses and settlements; home screen totals update live too.
- D5: Firebase JS SDK modular from gstatic CDN, exact version pinned (13.4.0, verified 200).
- D6: Rules are tested locally with the Firestore emulator and `@firebase/rules-unit-testing` (Java 21 present).
- D7: Supabase code is removed (migration, PGlite tests, keep-alive). Git history keeps it.

## Defaults
- Invite link format stays `#/join/<token>`; the pending join is kept in localStorage for 24h.
- Firebase web config in `js/config.js` is public by design. Security comes from the rules.
- Share-sum == amount is validated client-side only, because rules can't loop over a map (see Risks).

## Out of scope
Cloud Functions, push notifications, offline-first persistence tuning, data migration (no live data yet).

## Acceptance
- A1: Sign in with Google, or email + password (sign-up, sign-in, reset); display name asked once.
- A2: The rules emulator suite proves non-members cannot read or write a group, its expenses, history or settlements, and cannot list invites.
- A3: Joining with a valid token adds only yourself; a wrong or other group's token is rejected.
- A4: An expense write without a matching history doc by the same user is rejected; history cannot be edited or deleted.
- A5: An expense added on one phone appears on another without a refresh.
- A6: Either the payer or the receiver can record a payment.
- A7: All S-001 ledger and form tests still pass; `npm test` runs unit and rules tests.

## Risks
- Share sums aren't enforced by rules. A modified client could store wrong shares, but history shows who did it. Acceptable among friends.
- Spark quotas (50k reads/day): live listeners re-read only changed docs. Fine for 15 people.
- The rules limit of 10 `get()` calls per request keeps rules simple.

## Cards
T-007, T-008, T-009
