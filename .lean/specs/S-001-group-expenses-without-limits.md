---
id: S-001
title: Group expense sharing for friends, without limits or confusion
status: agreed
tags: [expenses, supabase, github-pages, auth]
---
## Problem
A group of 10-15 friends uses Splitwise. The free plan caps expenses per day, shows ads and
Pro upsells, takes too many taps to add an expense, and its simplified balances are hard to
follow. They want a free, self-hosted alternative they control.

## Decisions
- D1: Static web app on GitHub Pages + Supabase (Postgres, Auth, RLS) free tier — $0, no server to run. Mobile-first PWA (add to home screen).
- D2: Sign-in with Google (primary button) plus email magic link sent through Gmail SMTP (app password) as fallback — Supabase default email only reaches team members (zk 20261121-115123).
- D3: Multiple groups; membership via invite link (random token) shared on WhatsApp. Home shows a total across groups.
- D4: Single currency AED, stored as integer fils (1 AED = 100 fils) — no float drift. (zk 20261121-115045)
- D5: One-screen add-expense: amount, description, payer, split. Split modes: equal among selected (default), exact amounts, shares, percentages. Every split is stored as exact per-person fils that sum to the total; rounding remainder goes to the first participants.
- D6: Balances shown as the minimal set of payments (greedy largest-debtor ↔ largest-creditor). Tapping a payment or a person shows the per-expense breakdown of each side's net balance.
- D7: Any group member can edit/delete any expense; every insert/update/delete writes an audit row (who, when, old values). Deletes are soft. (zk 20261121-115045-3)
- D9: Keep-alive: GitHub Actions cron every 3 days runs a read query against Supabase so the free project never pauses; on fetch failure the app shows 'Server asleep — ask the owner to resume it' (zk 20261121-115136).
- D8: "Record payment" stores a settlement (from, to, amount) that counts in balances like a two-person expense.

## Defaults
- Plain HTML/CSS/vanilla JS ES modules, supabase-js from a pinned CDN version; no build step.
- Pure logic (split, balances, settle-up) in one module with node:test unit tests.
- Display name asked once after first sign-in.
- Expense date defaults to today; category optional free text — not in v1 UI.
- Dark/light follows the phone setting.
- Data refreshes on open and after each change (no realtime subscriptions in v1).
- Supabase anon key in the client is fine; all access is enforced by RLS. (zk 20261121-115045-2)

## Research
- R1: Does Supabase free tier's built-in email send magic links to arbitrary addresses, and at what rate? If not, what is the cheapest fix (custom SMTP like Resend/Gmail, or Google sign-in)?
  → No: team members only, 2/hour. Fix: Google OAuth and/or custom SMTP (Gmail app password ~500/day, Brevo ~300/day) (source: https://supabase.com/docs/guides/auth/auth-smtp; confidence: high; zk 20261121-115123)
- R2: Does a Supabase free project pause after inactivity, and what does a user see when it does?
  → Yes: after 7 days of low DB activity; manual resume only; requests just fail; 2 active free projects/org (source: https://supabase.com/docs/guides/platform/free-project-pausing.md; confidence: medium; zk 20261121-115136)

## Out of scope
Receipt photos, multiple payers per expense, other currencies, push notifications, recurring
expenses, native app-store apps, import from Splitwise.

## Acceptance
- A1: A new user signs in with Google or an emailed magic link, sets a display name, and lands on their groups.
- A2: Opening an invite link (signed in) adds the user to that group; an invalid token is rejected.
- A3: A member adds an expense in one screen; equal split is preselected for all members.
- A4: Exact, shares and percentage splits always store per-person amounts summing exactly to the total; invalid input (sum mismatch, 0 shares, % ≠ 100) blocks saving with a clear message.
- A5: Group balances show net per person and the minimal payment list; net balances sum to 0.
- A6: Tapping a balance shows the expenses and payments that make it up.
- A7: Any member can edit/delete an expense; the history shows who changed what.
- A8: Recording a payment updates balances immediately.
- A9: A non-member cannot read or write a group's data (RLS enforced, verified by SQL test).
- A10: The app is served from GitHub Pages and works on a phone browser.
- A12: A scheduled GitHub Action pings Supabase every 3 days; a network failure in the app shows the 'server asleep' message.
- A11: No limits on number of expenses; no ads.

## Risks
- Gmail SMTP app password is a secret: lives only in Supabase dashboard, never in the repo.
- Keep-alive needs the Supabase URL + anon key as GitHub secrets; if the cron is disabled (GitHub disables crons on repos idle 60 days) the project can still pause.
- Public repo: code visible; must never commit service-role keys.

## Cards
T-001, T-002, T-003, T-004, T-005
(Kept chains: T-002→T-003 split SQL/RLS from UI to stay under ~400 lines each; T-005 is deploy needing user approvals.)
