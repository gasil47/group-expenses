---
id: 20261121-115045
type: decision
title: Money is stored as integer fils, splits as exact per-person amounts
tags: [expenses, money]
links: []
source: S-001
created: 2026-11-21
---
Why: floats drift and shares/percent splits produce remainders; storing exact amounts per person makes balances provably sum to zero.
Apply: every split mode converts to integer fils summing to the total; remainder goes to the first participants.
