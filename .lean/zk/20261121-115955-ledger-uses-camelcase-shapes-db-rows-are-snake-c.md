---
id: 20261121-115955
type: gotcha
title: Ledger uses camelCase shapes; DB rows are snake_case and must be mapped
tags: [ledger, supabase]
links: []
source: T-003
created: 2026-11-21
---
Why: netBalances expects paidBy/amount/shares[{userId,fils}].
Apply: map rows with toLedgerExpense/toLedgerSettlement in js/routes.js before calling ledger functions.
