---
id: T-002
title: Database where only group members see their data
spec: S-001
status: todo
depends: []
files: [supabase/migrations/001_init.sql, test/db.test.mjs, test/helpers/pg.mjs]
tdd: strict
---
## Goal
Postgres schema, RLS, group/invite/expense functions and audit history for Supabase, tested locally with PGlite (in-process Postgres) and a stub `auth` schema. Adds devDependency `@electric-sql/pglite` via `npm i -D` (package.json created by T-001; if run in parallel, the merge just adds devDependencies).

## Steps
1. `001_init.sql` tables (RLS on all): `profiles(id uuid pk refs auth.users, display_name)`, `groups(id, name, created_by, invite_token unique default random hex)`, `group_members(group_id, user_id, pk both)`, `expenses(id, group_id, description, amount_fils int >0, paid_by, spent_on date, created_by, deleted_at)`, `expense_shares(expense_id, user_id, fils int >=0)`, `settlements(id, group_id, from_user, to_user, amount_fils >0, created_by, deleted_at)`, `expense_history(id, expense_id, changed_by, changed_at, action, old_row jsonb, new_row jsonb)`.
2. `is_member(gid)` security definer. Policies: members select their groups' rows; profiles readable by people sharing a group; writes only through RPCs or member-checked policies; no hard deletes.
3. RPCs: `create_group(name)` (group + creator membership); `join_group(token)` security definer (adds auth.uid(), raises `invalid invite`); `save_expense(expense jsonb, shares jsonb)` upserts expense + replaces shares atomically, checks sum = amount and share users are members, writes `expense_history` (who, old/new with shares); `delete_expense(id)` soft delete + history; `record_payment(group, to, amount)`.
4. `test/helpers/pg.mjs`: boots PGlite, stub `auth.users` + `auth.uid()` from `current_setting('request.jwt.claim.sub', true)`, roles `authenticated`/`anon`, runs migration; `as(userId, fn)` sets role + claim.
5. Tests: non-member cannot select group/expenses; non-member save_expense rejected; valid token joins; bad token raises; share sum mismatch rejected; edit writes history with changed_by and old values; soft delete hides expense, keeps history.

## Done when
- [ ] `npm test` passes
- [ ] A2: valid invite joins; invalid token rejected
- [ ] A7: edits by any member logged with who and old values
- [ ] A9: non-member cannot read or write group data
## Watch
- All access enforced by RLS; never ship the service-role key (zk 20261121-115045-2)
- Edits open to all, always audited; soft deletes (zk 20261121-115045-3)
