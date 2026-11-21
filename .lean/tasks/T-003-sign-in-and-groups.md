---
id: T-003
title: Friends sign in and join groups by link
spec: S-001
status: todo
depends: [T-002]
files: [index.html, css/app.css, js/config.js, js/api.js, js/app.js, js/views/signin.js, js/views/home.js, js/views/group.js, manifest.webmanifest, icon.svg]
tdd: after
---
## Goal
App shell: mobile-first single page with hash router, sign-in, display name, group list with cross-group total, create group, invite link, join via link. `js/views/group.js` has tabs Expenses / Balances that lazily import `js/views/expenses.js` and `js/views/balances.js` (filled by T-004; missing module shows "coming soon").

## Steps
1. `js/config.js`: `SUPABASE_URL`, `SUPABASE_ANON_KEY` placeholders (filled in T-005).
2. `js/api.js`: supabase-js v2 pinned from jsdelivr ESM; wraps calls; network failure throws `ServerAsleepError` -> banner "Server asleep — ask the owner to resume it".
3. Sign-in: "Continue with Google" (`signInWithOAuth`) + "Email me a sign-in link" (`signInWithOtp`, redirect to current URL). First sign-in asks display name once.
4. Home: groups with your net per group and total across all (ledger.js `netBalances`), "New group" (`create_group`).
5. Group header: name, members, "Invite" copies `#/join/<token>` URL and offers WhatsApp share. `#/join/<token>` calls `join_group`, keeps the token through sign-in (sessionStorage).
6. Theme tokens with prefers-color-scheme; 16px gutters; manifest + icon for add-to-home-screen.

## Done when
- [ ] `npm test` passes
- [ ] A1: sign-in screen offers Google and email link; display name asked once (live check in T-005)
- [ ] A2: join link flow adds user and opens the group
- [ ] static server shows the app with no console errors at 375px width
