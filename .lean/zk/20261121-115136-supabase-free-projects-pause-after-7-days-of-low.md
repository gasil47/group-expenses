---
id: 20261121-115136
type: fact
title: Supabase free projects pause after 7 days of low activity and resume only manually
tags: [supabase, hosting]
links: []
source: S-001
created: 2026-11-21
---
Source: https://supabase.com/docs/guides/platform/free-project-pausing.md
Apply: add a GitHub Actions keep-alive cron that queries the DB every few days; show a 'server asleep' message on fetch failure. 2 active free projects per org.
