---
id: 20261121-115552-2
type: decision
title: Percent splits are integer hundredths totalling 10000; remainders go to first rows
tags: [money, ledger]
links: []
source: T-001
created: 2026-11-21
---
Why: avoids float drift so every split sums exactly.
Apply: UI converts 33.33% to 3333 before computeSplit.
