---
id: T-008
title: App runs on Firebase with live updates
spec: S-002
status: todo
depends: []
files: [js/api.js, js/config.js, js/app.js, js/routes.js, js/views/signin.js, js/views/home.js, js/views/group.js, js/views/expenses.js, js/views/balances.js, js/views/expense-form.js, js/expense-logic.js, test/routes.test.mjs, test/expense-logic.test.mjs, index.html]
tdd: after
---
## Goal
Swap the data layer from supabase-js to the Firebase modular SDK using the S-002 D3 data model, keeping the screens' behaviour. Add live listeners. Keep api.js the only module that touches Firebase.

## Steps
1. `js/config.js`: `firebaseConfig` placeholder object + `isConfigured()` (filled in T-009).
2. `js/api.js` rewrite (gstatic CDN 13.4.0 imports: firebase-app, firebase-auth, firebase-firestore): auth (`signInGoogle` popup with redirect fallback on mobile, `signUpEmail(email, pw, name)`, `signInEmail`, `resetPassword`, `onUser(cb)`), profile, `createGroup` (group doc + invite doc in one batch), `joinGroup(token)` (get invite then update group per D3), `watchGroups(uid, cb)` (`where('memberIds','array-contains',uid)`), `watchGroup(gid, cb)`, `watchExpenses(gid, cb)`, `watchSettlements(gid, cb)`, `saveExpense(gid, expense, before)` and `deleteExpense` as a `writeBatch` of expense + history doc (history id pre-generated, `historyId` set on the expense), `recordPayment(gid, from, to, fils)`, `listHistory(gid)`. Each `watch*` returns an unsubscribe.
3. Pure mapping in `js/routes.js` (or a new pure module): Firestore doc -> ledger shapes, `shares` map <-> `[{userId,fils}]`, history entry builder `{action, before, after}`; unit tests in test/routes.test.mjs.
4. Views: replace fetch-and-render with watch-and-render; unsubscribe on route change (group.js owns the listeners for its tabs). Remove "server asleep" handling. Balances: show "Record payment" when I am payer OR receiver (A6).
5. Sign-in view: "Continue with Google", then email + password with toggle Sign in / Create account, plus "Forgot password?". Display name asked once (create account takes it directly).
6. `node --check` every js file; `npm run test:unit` passes (or `node --test "test/**/*.test.mjs"` if T-007 hasn't landed).

## Done when
- [ ] unit tests pass, including new mapping tests
- [ ] A1: Google + email/password sign-in UI with reset
- [ ] A5: views use onSnapshot listeners and unsubscribe on leave
- [ ] A6 (UI): payer or receiver sees Record payment
- [ ] no `supabase` string left in js/ or index.html
## Watch
- Ledger uses camelCase; map Firestore docs first (zk 20261121-115955)
- Percent values pass as typed (zk 20261121-115552-2)
