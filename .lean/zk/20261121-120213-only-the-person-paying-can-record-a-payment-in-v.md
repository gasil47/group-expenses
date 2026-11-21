---
id: 20261121-120213
type: decision
title: Only the person paying can record a payment in v1
tags: [payments, ui]
links: []
source: T-004
created: 2026-11-21
---
Why: record_payment uses auth.uid() as from_user, so nobody can log a payment on someone else's behalf.
Apply: UI shows Record payment only to the payer; a receiver-confirms flow would need a to_user-side RPC.
