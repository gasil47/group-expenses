---
id: T-001
title: Splits and balances always add up exactly
spec: S-001
status: todo
depends: []
files: [js/ledger.js, test/ledger.test.mjs, package.json]
tdd: strict
---
## Goal
Pure money logic with no DOM or network, used by the expense and balance screens. All amounts are integer fils (zk 20261121-115045).

## Steps
1. `package.json`: `{"type":"module","scripts":{"test":"node --test test/"}}`, no runtime dependencies.
2. Test first in `test/ledger.test.mjs` (node:test), then `js/ledger.js` exports:
   - `parseAed("12.5") -> 1250`, `formatAed(1250) -> "12.50 AED"`; reject negative, >2 decimals, non-numeric.
   - `computeSplit(totalFils, mode, rows)` with mode `equal|exact|shares|percent`, rows `[{userId, value}]` (included bool / fils / shares / percent). Returns `{ok:true, shares:[{userId, fils}]}` or `{ok:false, error}`. Remainder fils go one each to the first rows. Errors: exact sum != total, all shares 0, percent != 100, no participants.
   - `netBalances(expenses, settlements)`: expense `{id, paidBy, amount, shares:[{userId,fils}]}`; settlement `{id, fromUser, toUser, amount}`. Returns Map userId -> net fils (positive = is owed).
   - `simplifyDebts(netMap)` -> `[{from, to, fils}]`, greedy largest debtor to largest creditor, deterministic tie-break by userId.
   - `breakdown(userId, expenses, settlements)` -> `[{kind:'expense'|'payment', id, label, deltaFils}]` whose deltas sum to that user's net.
3. Test cases: equal 100 fils / 3 -> 34,33,33; percent 33.33/33.33/33.34; shares 2:1 of 1000; exact mismatch errors; nets sum to zero (random 200 expenses loop); simplify settles all nets (count <= n-1); breakdown sums to net; settlement reduces debt.

## Done when
- [ ] `npm test` passes
- [ ] A4: every split mode sums exactly to total; invalid input returns an error message
- [ ] A5: nets sum to 0; simplified payments settle everyone
- [ ] A6: breakdown per user sums to net
- [ ] A8 (logic): settlements count in balances
