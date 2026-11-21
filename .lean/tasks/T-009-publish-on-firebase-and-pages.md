---
id: T-009
title: Put the app online for the group
spec: S-002
status: todo
depends: [T-007, T-008]
deploy: true
files: [.github/workflows/pages.yml, README.md, js/config.js, .firebaserc]
tdd: after
---
## Goal
Live on GitHub Pages (gasil47/group-expenses, public, user approved) backed by a free Firebase Spark project with rules deployed. Replaces T-005.

## Steps
1. User runs `! npx firebase login` (interactive). Create the project `firebase projects:create` (Spark, no billing) and register a web app; put its config in `js/config.js`.
2. User (console, ~5 min, README steps): enable Auth providers Google + Email/Password; add `gasil47.github.io` to Authorized domains; create Firestore database (region near UAE e.g. me-central2 / asia-south1, production mode).
3. `firebase deploy --only firestore:rules`.
4. `pages.yml` deploys the static site on push to main; create repo, push, enable Pages.
5. `lean audit`, `/lean:secure`, then live smoke test on the Pages URL: sign up, create group, invite, add expense, see it live on a second browser.

## Done when
- [ ] Pages URL loads on a phone browser (S-001 A10)
- [ ] A1/A5 live: sign-in works; expense appears on a second browser without refresh
- [ ] `lean audit` clean; no service-account keys in the repo
