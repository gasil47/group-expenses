// The only module that touches Firebase. Everything returned is a plain app shape (see routes.js).
import { firebaseConfig, isConfigured } from './config.js';
import { toGroup, toExpense, toSettlement, randomToken } from './routes.js';
import {
  groupPayload, invitePayload, joinPayload, expensePayload, historyPayload, settlementPayload, profilePayload,
} from './payloads.js';

const V = '13.4.0';
const BASE = `https://www.gstatic.com/firebasejs/${V}`;

export const configured = isConfigured(firebaseConfig);

let fb = null; // { auth, db, A, F }
async function sdk() {
  if (!configured) throw new Error('not configured');
  if (!fb) {
    const [{ initializeApp }, A, F] = await Promise.all([
      import(`${BASE}/firebase-app.js`), import(`${BASE}/firebase-auth.js`), import(`${BASE}/firebase-firestore.js`),
    ]);
    const app = initializeApp(firebaseConfig);
    fb = { auth: A.getAuth(app), db: F.getFirestore(app), A, F };
  }
  return fb;
}

const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);
const SNAP = { serverTimestamps: 'estimate' };
const data = (doc) => {
  const d = doc.data(SNAP);
  if ('updatedAt' in d) d.updatedAt = ms(d.updatedAt);
  if ('createdAt' in d) d.createdAt = ms(d.createdAt);
  return d;
};

// Wrap a snapshot subscription; returns an unsubscribe usable before the SDK has loaded.
function watch(subscribe) {
  let off = null, cancelled = false;
  subscribe().then((u) => { if (cancelled) u(); else off = u; }).catch(() => {});
  return () => { cancelled = true; if (off) off(); };
}

// ---- auth ----
const toUser = (u) => (u ? { id: u.uid, authName: u.displayName || '', email: u.email || '' } : null);
let pendingSignup = null; // resolves once a new email account's profile is saved

export function onUser(cb, onErr) {
  return watch(async () => {
    const { auth, A } = await sdk();
    A.getRedirectResult(auth).catch((e) => onErr && onErr(e));
    return A.onAuthStateChanged(auth, async (u) => {
      if (pendingSignup) await pendingSignup.catch(() => {});
      cb(toUser(u));
    });
  });
}

export async function signInGoogle() {
  const { auth, A } = await sdk();
  const provider = new A.GoogleAuthProvider();
  try { await A.signInWithPopup(auth, provider); } catch (e) {
    const code = e && e.code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await A.signInWithRedirect(auth, provider);
      return;
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    throw e;
  }
}

export async function signUpEmail(email, password, name) {
  const { auth, db, A, F } = await sdk();
  let done;
  pendingSignup = new Promise((r) => { done = r; });
  try {
    const cred = await A.createUserWithEmailAndPassword(auth, email, password);
    await F.setDoc(F.doc(db, 'users', cred.user.uid), profilePayload(name));
  } finally { done(); pendingSignup = null; }
}
export async function signInEmail(email, password) {
  const { auth, A } = await sdk();
  await A.signInWithEmailAndPassword(auth, email, password);
}
export async function resetPassword(email) {
  const { auth, A } = await sdk();
  await A.sendPasswordResetEmail(auth, email);
}
export async function signOut() {
  const { auth, A } = await sdk();
  await A.signOut(auth);
}

export function friendlyAuthError(e) {
  const map = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/email-already-in-use': 'That email already has an account. Try signing in.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Enter a valid email.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/network-request-failed': 'Network problem. Check your connection.',
  };
  return new Error((e && map[e.code]) || (e && e.message) || String(e));
}

// ---- profile ----
export async function getProfile(uid) {
  const { db, F } = await sdk();
  const s = await F.getDoc(F.doc(db, 'users', uid));
  return s.exists() ? { displayName: s.data().displayName } : null;
}
export async function saveProfile(uid, name) {
  const { db, F } = await sdk();
  await F.setDoc(F.doc(db, 'users', uid), profilePayload(name));
}

// ---- groups ----
export function watchGroups(uid, cb, onErr) {
  return watch(async () => {
    const { db, F } = await sdk();
    const q = F.query(F.collection(db, 'groups'), F.where('memberIds', 'array-contains', uid));
    return F.onSnapshot(q, (snap) => cb(snap.docs.map((d) => toGroup(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name))), onErr);
  });
}
export function watchGroup(gid, cb, onErr) {
  return watch(async () => {
    const { db, F } = await sdk();
    return F.onSnapshot(F.doc(db, 'groups', gid), (s) => cb(s.exists() ? toGroup(s.id, s.data()) : null), onErr);
  });
}

export async function createGroup(name, myName) {
  const { auth, db, F } = await sdk();
  const uid = auth.currentUser.uid;
  const ref = F.doc(F.collection(db, 'groups'));
  const token = randomToken(crypto);
  const batch = F.writeBatch(db);
  batch.set(ref, groupPayload(name, uid, myName, token));
  batch.set(F.doc(db, 'invites', token), invitePayload(ref.id));
  await batch.commit();
  return ref.id;
}

export async function joinGroup(token, myName) {
  const { auth, db, F } = await sdk();
  const uid = auth.currentUser.uid;
  const inv = await F.getDoc(F.doc(db, 'invites', token));
  if (!inv.exists()) throw Object.assign(new Error('This invite link is not valid.'), { code: 'invalid-invite' });
  const gid = inv.data().groupId;
  const gref = F.doc(db, 'groups', gid);
  try { // already a member? then reading the group works and there is nothing to join
    const g = await F.getDoc(gref);
    if (g.exists() && (g.data().memberIds || []).includes(uid)) return gid;
  } catch (e) {
    if (!e || e.code !== 'permission-denied') throw e; // only "denied" means not a member yet
  }
  await F.updateDoc(gref, joinPayload(uid, myName, token, F.arrayUnion));
  return gid;
}

// ---- expenses, settlements, history ----
export function watchExpenses(gid, cb, onErr) {
  return watch(async () => {
    const { db, F } = await sdk();
    return F.onSnapshot(F.collection(db, 'groups', gid, 'expenses'),
      (snap) => cb(snap.docs.map((d) => toExpense(d.id, data(d)))), onErr);
  });
}
export function watchSettlements(gid, cb, onErr) {
  return watch(async () => {
    const { db, F } = await sdk();
    return F.onSnapshot(F.collection(db, 'groups', gid, 'settlements'),
      (snap) => cb(snap.docs.map((d) => toSettlement(d.id, data(d)))), onErr);
  });
}

// expense: app expense ({id?, description, amountFils, paidBy, shares:[{userId,fils}], spentOn}).
// before: the app expense as it was (null for a new one). One atomic batch: expense + history entry.
async function writeExpense(gid, expense, before, action, deleted) {
  const { auth, db, F } = await sdk();
  const uid = auth.currentUser.uid;
  const eref = expense.id ? F.doc(db, 'groups', gid, 'expenses', expense.id) : F.doc(F.collection(db, 'groups', gid, 'expenses'));
  const href = F.doc(F.collection(db, 'groups', gid, 'history'));
  const batch = F.writeBatch(db);
  batch.set(eref, expensePayload(expense, uid, href.id, deleted, F.serverTimestamp()));
  batch.set(href, historyPayload(eref.id, action, before, deleted ? null : expense, uid, F.serverTimestamp()));
  await batch.commit();
  return eref.id;
}
export const saveExpense = (gid, expense, before) => writeExpense(gid, expense, before || null, before ? 'update' : 'create', false);
export const deleteExpense = (gid, expense) => writeExpense(gid, expense, expense, 'delete', true);

export async function recordPayment(gid, fromUser, toUser, amountFils) {
  const { auth, db, F } = await sdk();
  await F.addDoc(F.collection(db, 'groups', gid, 'settlements'),
    settlementPayload(fromUser, toUser, amountFils, auth.currentUser.uid, F.serverTimestamp()));
}

export async function listHistory(gid) {
  const { db, F } = await sdk();
  const snap = await F.getDocs(F.query(F.collection(db, 'groups', gid, 'history'), F.orderBy('changedAt', 'desc')));
  return snap.docs.map((d) => { const x = d.data(SNAP); return { id: d.id, ...x, changedAt: ms(x.changedAt) }; });
}
