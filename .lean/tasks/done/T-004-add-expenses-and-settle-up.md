---
id: T-004
title: Add expenses, see balances, record payments
spec: S-001
status: done
depends: [T-001, T-003]
files: [js/views/expenses.js, js/views/balances.js, js/views/expense-form.js, css/expenses.css]
tdd: after
done: 2026-11-21
---
## Goal
Core screens: one-screen expense form, expense list with history, balances with simplified payments and per-person breakdown, record payment. No limits, no ads.

## Steps
1. `expense-form.js`: sheet with amount (decimal keypad), description, "Paid by" (default me), split tabs Equal / Exact / Shares / % with all members preselected for Equal; live "remaining" line from `computeSplit`; Save disabled with the error text while invalid; calls `save_expense`. Same form edits; Delete calls `delete_expense`.
2. `expenses.js`: list newest first (date, description, payer, amount, "you owe / you lent X"); floating "+ Add"; tap row -> edit; "History" shows `expense_history` (who, when, what changed).
3. `balances.js`: each member's net (owed / owes) and simplified payments ("Ali pays Sara 120.00 AED"). Tap person or payment -> breakdown from `breakdown()`. "Record payment" on each suggested payment (prefilled) plus a free-form one -> `record_payment`, refresh.
4. Refresh data after every save.

## Done when
- [ ] `npm test` passes
- [ ] A3: add expense in one screen; Equal preselected for all members
- [ ] A4 (UI): invalid splits block Save with a clear message
- [ ] A5/A6: balances and breakdown render from ledger.js
- [ ] A7: edit/delete by any member, history visible
- [ ] A8: recording a payment updates balances immediately
- [ ] A11: no cap on expenses, no ads
