---
id: T-005
title: Put the app online for the group
spec: S-001
status: todo
depends: [T-004]
deploy: true
files: [.github/workflows/pages.yml, .github/workflows/keepalive.yml, README.md, js/config.js, .gitignore]
tdd: after
---
## Goal
Live on GitHub Pages with a real Supabase project, sign-in providers configured, keep-alive running.

## Steps
1. With user OK: create Supabase project (free, region near UAE); apply `001_init.sql`; put URL + anon/publishable key in `js/config.js`.
2. `pages.yml`: deploy repo root to Pages on push to main. With user OK: create public GitHub repo, push, enable Pages.
3. `keepalive.yml`: cron `0 6 */3 * *` + workflow_dispatch; curl a REST select on `groups?limit=1` with anon key from repo secrets (counts as DB activity).
4. Supabase Auth Site URL + redirect = Pages URL. README steps for the owner: Google Cloud OAuth client (redirect `https://<ref>.supabase.co/auth/v1/callback`), Gmail app password -> Supabase SMTP (smtp.gmail.com:465).
5. `lean audit`, then `/lean:secure`.

## Done when
- [ ] A10: Pages URL loads on a phone browser
- [ ] A12: keepalive workflow succeeds once (manual run); network failure shows the asleep banner
- [ ] A1 live: sign-in works on the published site
- [ ] `lean audit` clean; no service-role key or SMTP password in repo
## Watch
- Default Supabase email only reaches team members (zk 20261121-115123)
- Free project pauses after 7 days low activity (zk 20261121-115136)
