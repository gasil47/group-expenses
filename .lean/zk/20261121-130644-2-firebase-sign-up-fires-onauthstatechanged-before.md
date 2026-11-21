---
id: 20261121-130644-2
type: fact
title: Firebase sign-up fires onAuthStateChanged before the profile doc is written
tags: [firebase, auth]
links: []
source: T-008
created: 2026-11-21
---
Why: createUserWithEmailAndPassword resolves the auth state first.
Apply: api.js holds a pendingSignup promise so the name prompt doesn't flash.
