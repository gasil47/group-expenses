---
id: T-010
title: Creating and listing groups works; audit trail is tamper-proof
spec: S-002
status: done
depends: [T-007, T-008]
files: [firestore.rules, test/rules.spec.mjs, js/api.js, js/views/group.js, js/app.js]
tdd: strict
done: 2026-11-21
---
## Goal
Fix the 9 code-review findings on e4760d7..c2fae02. Every rules fix gets a failing emulator test first that runs the **exact write or query shape `js/api.js` uses** (same fields, batch, serverTimestamp, query filters), so app and rules can't drift again.

## Steps
1. createGroup batch (group + invite) is denied: invite create must use getAfter on the group. Test: the full createGroup batch succeeds.
2. watchGroups `where('memberIds','array-contains',uid)` query is rejected: split groups read into `allow get: if isMember(gid)` and `allow list: if signedIn() && request.auth.uid in resource.data.memberIds`. Test: getDocs on that query works for a member and returns only their groups.
3. History reuse: an expense write must create a new history doc (`!exists(history/<historyId>)` before + `existsAfter`), and the history action must be create|update|delete. Test: reusing an old historyId fails.
4. Settlements update: `allow update: if false` (client never updates). Test: a member can't flip deleted.
5. Forged history: history create requires `getAfter(expenses/<expenseId>).data.historyId == hid`; validExpense requires `paidBy in memberIds`. Tests for both.
6. Timestamps: `updatedAt == request.time` (expense), `changedAt == request.time` (history), `createdAt == request.time` (settlement). Tests: forged timestamp fails, serverTimestamp passes.
7. Nits: shares.size() > 0 and values are int >= 0 where expressible; settlement toUser != fromUser; group rename requires name is string, size 1..80; users read only own doc (check that no view reads other profiles; names come from group.memberNames), write hasOnly(['displayName']) and string 1..60. Tests.
8. Client (tdd after): joinGroup only treats `permission-denied` from getDoc as "not a member"; group.js/app.js clear pendingJoin only after success or a definitive invalid-invite error.

## Done when
- [ ] `npm test` passes (unit + emulator), with the new tests failing before the fixes
- [ ] S-002 A2, A3, A4, A6 still hold; createGroup and watchGroups shapes are proven by tests
