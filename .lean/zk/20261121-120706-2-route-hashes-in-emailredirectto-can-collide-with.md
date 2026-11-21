---
id: 20261121-120706-2
type: gotcha
title: Route hashes in emailRedirectTo can collide with implicit-flow auth tokens
tags: [auth, invite]
links: []
source: T-006
created: 2026-11-21
---
Why: supabase-js implicit flow returns tokens in the URL hash.
Apply: keep pending invite in localStorage (24h); live-test email sign-in from an invite in T-005.
