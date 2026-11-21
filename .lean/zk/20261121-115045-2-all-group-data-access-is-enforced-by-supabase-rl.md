---
id: 20261121-115045-2
type: decision
title: All group data access is enforced by Supabase RLS, not the client
tags: [supabase, security]
links: []
source: S-001
created: 2026-11-21
---
Why: the app is a public static site with the anon key in the browser.
Apply: every table has RLS keyed on group membership; invite joins go through a security-definer RPC; never ship the service-role key.
