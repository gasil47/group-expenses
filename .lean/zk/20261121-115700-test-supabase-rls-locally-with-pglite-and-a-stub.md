---
id: 20261121-115700
type: pattern
title: Test Supabase RLS locally with PGlite and a stubbed auth schema
tags: [supabase, testing, pglite]
links: []
source: T-002
created: 2026-11-21
---
Why: no Docker or live project needed for RLS/RPC tests.
Apply: test/helpers/pg.mjs stubs auth.users + auth.uid() from request.jwt.claim.sub; as(db,user,fn) sets role+claim. Covers logic, not real Supabase config.
