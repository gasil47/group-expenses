---
id: 20261121-130644
type: gotcha
title: Live Firestore re-renders wipe UI state unless it lives outside the render closure
tags: [firestore, ui]
links: []
source: T-008
created: 2026-11-21
---
Why: onSnapshot fires render again, resetting open breakdowns, typed input and in-flight guards.
Apply: keep UI state in a ui object owned by the group view.
