---
id: 20261121-125645
type: fact
title: Firebase Spark caps email-link sign-in emails at 5 per day; no Cloud Functions on Spark
tags: [firebase, auth]
links: []
source: S-001
created: 2026-11-21
---
Source: https://firebase.google.com/docs/auth/limits ; https://firebase.google.com/pricing
Apply: Google sign-in as primary; email link only as a rare fallback (sessions persist, one sign-in per device). Enforce access + history purely in security rules (getAfter/existsAfter).
