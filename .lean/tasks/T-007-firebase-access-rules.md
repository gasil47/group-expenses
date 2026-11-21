---
id: T-007
title: Only group members can see or change their data
spec: S-002
status: todo
depends: []
files: [firestore.rules, firebase.json, .firebaserc, test/rules.test.mjs, package.json, package-lock.json, supabase/migrations/001_init.sql, test/db.test.mjs, test/helpers/pg.mjs]
tdd: strict
---
## Goal
Write `firestore.rules` for the S-002 D3 data model and prove it with the Firestore emulator. Remove the Supabase backend files and PGlite.

## Steps
1. `npm i -D firebase-tools@14 @firebase/rules-unit-testing firebase` (exact versions locked); `npm uninstall @electric-sql/pglite`. Delete `supabase/`, `test/db.test.mjs`, `test/helpers/pg.mjs`.
2. `firebase.json`: firestore rules path + emulator port 8080, `ui.enabled false`. `.firebaserc` default project `demo-group-expenses` (demo- prefix = offline emulator, no login).
3. package.json scripts: `"test": "npm run test:unit && npm run test:rules"`, `"test:unit": "node --test \"test/**/*.test.mjs\""` (exclude rules.test via naming: rules file is `test/rules.spec.mjs`? Keep `test/rules.test.mjs` but skip when `FIRESTORE_EMULATOR_HOST` is unset), `"test:rules": "firebase emulators:exec --only firestore --project demo-group-expenses \"node --test test/rules.test.mjs\""`.
4. Test first (rules.test.mjs, node:test + rules-unit-testing), then rules:
   - users: owner writes own doc; others can't.
   - groups: create with memberIds==[me]; non-member can't read; member reads; non-member can't add someone else.
   - invites: member creates; signed-in get ok; list denied.
   - join: valid token adds only me (memberIds + memberNames[me] + joinToken); wrong token / other group's token / adding others rejected.
   - expenses: member write with matching history in same batch (changedBy me, expenseId matches) succeeds; without history fails; updatedBy != me fails; share key non-member fails; amountFils <= 0 fails; delete denied (soft delete via deleted:true with history ok).
   - history: update/delete denied; non-member read denied.
   - settlements: create allowed when me is fromUser or toUser and both are members; third party denied; delete denied.
5. Helper functions in rules: `isMember(gid)`, `onlyAddsSelf()`, `validShares()` (keys().hasOnly(memberIds)).

## Done when
- [ ] `npm test` passes (unit + emulator rules)
- [ ] A2, A3, A4, A6 (rules side) each have a passing test
## Watch
- No Cloud Functions on Spark; rules are the only guard (zk 20261121-125645)
- Edits open to all members but always audited (zk 20261121-115045-3)
- Node 22 Windows needs test globs, not `test/` (zk 20261121-115552)
