---
id: T-006
title: Fix edit, invite, history and privacy bugs
spec: S-001
status: todo
depends: [T-004]
files: [supabase/migrations/001_init.sql, test/db.test.mjs, js/app.js, js/api.js, js/views/expense-form.js, js/views/expenses.js, js/views/balances.js, js/views/home.js, js/views/group.js, js/ledger.js, js/expense-logic.js, test/expense-logic.test.mjs, test/ledger.test.mjs]
tdd: strict
---
## Goal
Fix the 10 findings from code review of 8d26ca9..80e3c3d. Logic and SQL fixes are test-first; UI-only fixes are tdd after.

## Steps
1. SQL (test first, test/db.test.mjs): revoke execute on `shares_json` and `expense_group` from authenticated/public (keep usable inside policies/definer RPCs) or add an is_member check; test "non-member cannot call shares_json". Edit 001_init.sql in place (not deployed yet).
2. SQL: history by group — add `group_id` to expense_history (filled by the RPCs) or a definer RPC `group_history(grp)` checking is_member; test "deleted expense appears in group history with who deleted it".
3. Edit keeps uneven splits (test first in expense-logic): when editing, derive the initial form state from saved shares — equal if they match computeSplit equal over the same people, else 'exact' with saved amounts; test "editing 70/30 then saving unchanged keeps 70/30".
4. Invites: persist pending join in localStorage (with timestamp) and include `#/join/<token>` in emailRedirectTo; remove pending join before calling join_group and show an error once on failure.
5. app.js: re-route on auth change only when the user id changes; skip the duplicate initial route.
6. Double-submit: disable the button while in flight for Record payment (balances.js) and New group (home.js).
7. expenses.js: History uses the group query from step 2 so deletions show; restore the 'Deleted' description.
8. group.js: drop stale tab renders (request counter); remove the 'Coming soon' catch and route errors to the app's error banner.
9. ledger.js breakdown label: `e.title || 'Expense'`; test it.

## Done when
- [ ] `npm test` passes with the new regression tests
- [ ] A7: deleted expenses appear in history with who deleted them
- [ ] A9: non-members cannot read shares through any RPC
- [ ] A2: email-link sign-in from an invite still joins the group
