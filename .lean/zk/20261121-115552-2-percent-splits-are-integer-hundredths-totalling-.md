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
Apply: pass percent values as typed (33.33); computeSplit converts to hundredths internally.
