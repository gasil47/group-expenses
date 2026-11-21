// Firebase web config is public by design; security comes from firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyDYlN72D58tDNlQeBfraSJWAvtXj0Hg6vY',
  authDomain: 'group-expenses-2106b5.firebaseapp.com',
  projectId: 'group-expenses-2106b5',
  appId: '1:976319175238:web:5e6776bd70e0d620f08847',
  messagingSenderId: '976319175238',
};

export function isConfigured(cfg = firebaseConfig) {
  const bad = (v) => !v || /YOUR_|PLACEHOLDER/i.test(v);
  return !!cfg && !bad(cfg.apiKey) && !bad(cfg.projectId) && !bad(cfg.appId) && !bad(cfg.authDomain);
}
