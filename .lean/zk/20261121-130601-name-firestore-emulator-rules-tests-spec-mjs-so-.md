---
id: 20261121-130601
type: gotcha
title: Name Firestore emulator rules tests *.spec.mjs so the unit glob skips them
tags: [testing, firebase]
links: []
source: T-007
created: 2026-11-21
---
Why: rules tests need the emulator; node --test on *.test.mjs would run them without it.
Apply: npm test = unit glob, then firebase emulators:exec running test/rules.spec.mjs; gitignore *-debug.log written by the emulator.
