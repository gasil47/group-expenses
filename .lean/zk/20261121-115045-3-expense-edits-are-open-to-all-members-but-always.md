---
id: 20261121-115045-3
type: decision
title: Expense edits are open to all members but always audited
tags: [expenses, audit]
links: []
source: S-001
created: 2026-11-21
---
Why: friends need to fix mistakes without asking the creator; history keeps it trustworthy.
Apply: DB trigger writes old/new rows to expense_history; deletes are soft.
