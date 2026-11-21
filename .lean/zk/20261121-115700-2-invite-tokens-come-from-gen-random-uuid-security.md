---
id: 20261121-115700-2
type: decision
title: Invite tokens come from gen_random_uuid, security definer functions pin search_path
tags: [supabase, security]
links: []
source: T-002
created: 2026-11-21
---
Why: gen_random_uuid is core Postgres 13+, so no pgcrypto schema differences between PGlite and Supabase.
Apply: every security definer function sets search_path = public.
