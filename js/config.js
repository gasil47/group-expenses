// Firebase web config is public by design; security comes from firestore.rules.
// Filled in during T-009. Leave placeholders until then.
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  appId: 'YOUR_APP_ID',
};

export function isConfigured(cfg = firebaseConfig) {
  const bad = (v) => !v || /YOUR_|PLACEHOLDER/i.test(v);
  return !!cfg && !bad(cfg.apiKey) && !bad(cfg.projectId) && !bad(cfg.appId) && !bad(cfg.authDomain);
}
