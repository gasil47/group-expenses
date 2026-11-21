# Group Expenses

Split shared costs with friends. Free, no ads, no daily limits. All amounts are in AED.

**App:** https://gasil47.github.io/group-expenses/

## For friends
1. Open the invite link someone shares in WhatsApp.
2. Sign in with Google, or create an account with email + password.
3. Tap **+ Add** to log an expense. Splits can be equal, exact amounts, shares or percentages.
4. **Balances** shows who pays whom. Tap a line to see the expenses behind it, and tap **Record payment** once you've paid (either the payer or the receiver can record it).
5. Tip: in your phone browser, use "Add to Home Screen" so it opens like an app.

## How it works
- Static site on GitHub Pages: `index.html`, `css/`, `js/`. No build step.
- Firebase Spark (free) for Auth and Firestore. Project: `group-expenses-2106b5`, database in `me-central1`.
- `firestore.rules` is the only access control. Only group members can read or write a group, and every expense edit writes an immutable history entry.
- Money is stored as integer fils (1 AED = 100 fils). The split and balance math is in `js/ledger.js`.

## Owner tasks
- Run the tests (unit tests plus the Firestore rules emulator, needs Java 11+): `npm install`, then `npm test`
- Deploy changed rules: `npx firebase deploy --only firestore:rules --project prod`
- GitHub Pages serves the `main` branch root, so every push to `main` updates the site.
- The web config in `js/config.js` is public by design. Never commit service-account keys.

## One-time Firebase console setup (already done once)
1. Firestore: create the database (production mode, `me-central1`).
2. Authentication > Sign-in method: enable **Google** and **Email/Password**.
3. Authentication > Settings > Authorized domains: add `gasil47.github.io`.
