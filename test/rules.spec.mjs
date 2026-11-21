import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, writeBatch, addDoc, query, where, orderBy,
  serverTimestamp, arrayUnion, Timestamp,
} from 'firebase/firestore';
import {
  groupPayload, invitePayload, joinPayload, expensePayload, historyPayload, settlementPayload, profilePayload,
} from '../js/payloads.js';

let env;
const G = 'g1';
const db = (uid) => env.authenticatedContext(uid).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-group-expenses',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'groups', G), {
      name: 'Trip', createdBy: 'alice', memberIds: ['alice', 'bob'],
      memberNames: { alice: 'Alice', bob: 'Bob' }, inviteToken: 'tok1',
    });
    await setDoc(doc(d, 'groups', 'g2'), {
      name: 'Other', createdBy: 'dave', memberIds: ['dave'],
      memberNames: { dave: 'Dave' }, inviteToken: 'tok2',
    });
    await setDoc(doc(d, 'invites', 'tok1'), { groupId: G });
    await setDoc(doc(d, 'invites', 'tok2'), { groupId: 'g2' });
    await setDoc(doc(d, 'groups', G, 'expenses', 'e0'), {
      description: 'Old', amountFils: 1000, paidBy: 'alice',
      shares: { alice: 500, bob: 500 }, historyId: 'h0', updatedBy: 'alice', deleted: false,
    });
    await setDoc(doc(d, 'groups', G, 'history', 'h0'), {
      expenseId: 'e0', action: 'create', changedBy: 'alice',
    });
    await setDoc(doc(d, 'groups', G, 'settlements', 's0'), {
      fromUser: 'bob', toUser: 'alice', amountFils: 100, createdBy: 'bob', deleted: false,
    });
  });
});

// Payloads come from js/payloads.js, the same builders api.js sends, so rules and app cannot drift.
const appExpense = (over = {}) => ({
  description: 'Lunch', amountFils: 2000, paidBy: 'alice',
  shares: [{ userId: 'alice', fils: 1000 }, { userId: 'bob', fils: 1000 }], spentOn: '2026-01-01', ...over,
});
// Mirrors api.writeExpense: one batch of expense + history. eo/ho override raw doc fields.
async function writeExpense(uid, { e = {}, eid = 'e1', hid = 'h1', action = 'create', deleted = false, eo = {}, ho = {}, withHistory = true, withExpense = true } = {}) {
  const d = db(uid);
  const b = writeBatch(d);
  const ex = appExpense(e);
  if (withExpense) b.set(doc(d, 'groups', G, 'expenses', eid), { ...expensePayload(ex, uid, hid, deleted, serverTimestamp()), ...eo });
  if (withHistory) b.set(doc(d, 'groups', G, 'history', hid), { ...historyPayload(eid, action, null, deleted ? null : ex, uid, serverTimestamp()), ...ho });
  return b.commit();
}
const settle = (uid, over = {}, from = 'alice', to = 'bob', amt = 500) => addDoc(
  collection(db(uid), 'groups', G, 'settlements'), { ...settlementPayload(from, to, amt, uid, serverTimestamp()), ...over });

// ---- users ----
test('users: owner writes own doc, others cannot read or write', async () => {
  await assertSucceeds(setDoc(doc(db('alice'), 'users', 'alice'), profilePayload('A')));
  await assertFails(setDoc(doc(db('bob'), 'users', 'alice'), profilePayload('X')));
  await assertSucceeds(getDoc(doc(db('alice'), 'users', 'alice')));
  await assertFails(getDoc(doc(db('bob'), 'users', 'alice')));
});

test('users: only displayName, a string of 1..60 chars', async () => {
  const w = (data) => setDoc(doc(db('alice'), 'users', 'alice'), data);
  await assertFails(w({ displayName: 'A', admin: true }));
  await assertFails(w({ displayName: 5 }));
  await assertFails(w({ displayName: '' }));
  await assertFails(w({ displayName: 'x'.repeat(61) }));
  await assertSucceeds(w(profilePayload('x'.repeat(60))));
});

// ---- groups ----
test('groups: createGroup batch (group + invite) succeeds exactly as api sends it', async () => {
  const d = db('carol');
  const ref = doc(collection(d, 'groups'));
  const b = writeBatch(d);
  b.set(ref, groupPayload('Flat', 'carol', 'Carol', 'newtok'));
  b.set(doc(d, 'invites', 'newtok'), invitePayload(ref.id));
  await assertSucceeds(b.commit());
  await assertSucceeds(getDoc(doc(d, 'groups', ref.id)));
});

test('groups: create needs memberIds == [me]', async () => {
  await assertFails(setDoc(doc(db('carol'), 'groups', 'g4'), {
    ...groupPayload('N', 'carol', 'C', 't'), memberIds: ['carol', 'bob'],
  }));
  await assertFails(setDoc(doc(db('carol'), 'groups', 'g5'), { ...groupPayload('N', 'carol', 'C', 't'), createdBy: 'bob' }));
});

test('groups: watchGroups query (array-contains uid) works and returns only my groups', async () => {
  const q = (uid) => getDocs(query(collection(db(uid), 'groups'), where('memberIds', 'array-contains', uid)));
  const snap = await assertSucceeds(q('bob'));
  assert.deepEqual(snap.docs.map((x) => x.id), [G]);
  assert.equal((await assertSucceeds(q('carol'))).size, 0);
  await assertFails(getDocs(collection(db('bob'), 'groups')));
  await assertFails(getDocs(query(collection(db('bob'), 'groups'), where('memberIds', 'array-contains', 'dave'))));
});

test('groups: members read, non-members cannot read or add others', async () => {
  await assertSucceeds(getDoc(doc(db('bob'), 'groups', G)));
  await assertFails(getDoc(doc(db('carol'), 'groups', G)));
  await assertFails(updateDoc(doc(db('carol'), 'groups', G), {
    memberIds: ['alice', 'bob', 'dave'], memberNames: { alice: 'A', bob: 'B', dave: 'D' },
  }));
  await assertSucceeds(updateDoc(doc(db('bob'), 'groups', G), { name: 'Renamed' }));
  await assertFails(updateDoc(doc(db('bob'), 'groups', G), { memberIds: ['alice'] }));
});

test('groups: rename must be a string of 1..80 chars', async () => {
  const r = (name) => updateDoc(doc(db('bob'), 'groups', G), { name });
  await assertFails(r(5));
  await assertFails(r({ a: 1 }));
  await assertFails(r(''));
  await assertFails(r('x'.repeat(81)));
  await assertSucceeds(r('x'.repeat(80)));
});

// ---- invites ----
test('invites: member creates, signed-in get ok, list denied', async () => {
  await assertSucceeds(setDoc(doc(db('alice'), 'invites', 'new'), invitePayload(G)));
  await assertFails(setDoc(doc(db('carol'), 'invites', 'new2'), invitePayload(G)));
  await assertSucceeds(getDoc(doc(db('carol'), 'invites', 'tok1')));
  await assertFails(getDocs(collection(db('carol'), 'invites')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'invites', 'tok1')));
});

// ---- join ----
test('join: the exact updateDoc payload from api.joinGroup succeeds', async () => {
  await assertSucceeds(updateDoc(doc(db('carol'), 'groups', G), joinPayload('carol', 'Carol', 'tok1', arrayUnion)));
  let ids;
  await env.withSecurityRulesDisabled(async (c) => { ids = (await getDoc(doc(c.firestore(), 'groups', G))).data().memberIds; });
  assert.deepEqual(ids, ['alice', 'bob', 'carol']);
});

test('join: wrong token, other group token, or adding others rejected', async () => {
  const join = (uid, token, ids, names) => updateDoc(doc(db(uid), 'groups', G), {
    memberIds: ids, memberNames: names, joinToken: token,
  });
  const names = { alice: 'Alice', bob: 'Bob' };
  await assertFails(updateDoc(doc(db('carol'), 'groups', G), joinPayload('carol', 'C', 'nope', arrayUnion)));
  await assertFails(updateDoc(doc(db('carol'), 'groups', G), joinPayload('carol', 'C', 'tok2', arrayUnion)));
  await assertFails(join('carol', 'tok1', ['alice', 'bob', 'carol', 'eve'], { ...names, carol: 'C', eve: 'E' }));
  await assertFails(join('carol', 'tok1', ['alice', 'bob', 'eve'], { ...names, eve: 'E' }));
  await assertFails(join('carol', 'tok1', ['carol'], { carol: 'C' }));
});

// ---- expenses + history ----
test('expenses: member write (create and update) with matching history succeeds', async () => {
  await assertSucceeds(writeExpense('alice'));
  await assertSucceeds(writeExpense('bob', { eid: 'e0', hid: 'h2', action: 'update', e: { amountFils: 1500, shares: [{ userId: 'alice', fils: 750 }, { userId: 'bob', fils: 750 }] } }));
});

test('expenses: missing history, wrong author, bad shares, bad amount fail', async () => {
  await assertFails(writeExpense('alice', { withHistory: false }));
  await assertFails(writeExpense('alice', { eo: { updatedBy: 'bob' } }));
  await assertFails(writeExpense('alice', { ho: { changedBy: 'bob' } }));
  await assertFails(writeExpense('alice', { ho: { expenseId: 'other' } }));
  await assertFails(writeExpense('alice', { e: { shares: [{ userId: 'alice', fils: 1000 }, { userId: 'carol', fils: 1000 }] } }));
  await assertFails(writeExpense('alice', { e: { amountFils: 0 } }));
  await assertFails(writeExpense('alice', { e: { amountFils: -5 } }));
  await assertFails(writeExpense('carol'));
});

test('expenses: hard delete denied, soft delete with history ok, non-member read denied', async () => {
  await assertFails(deleteDoc(doc(db('alice'), 'groups', G, 'expenses', 'e0')));
  await assertSucceeds(writeExpense('alice', { eid: 'e0', hid: 'h3', action: 'delete', deleted: true }));
  await assertSucceeds(getDoc(doc(db('bob'), 'groups', G, 'expenses', 'e0')));
  await assertFails(getDoc(doc(db('carol'), 'groups', G, 'expenses', 'e0')));
});

test('expenses: reusing an old historyId fails', async () => {
  // h0 already exists (e0's entry): an expense pointing at it must fail with or without a history write.
  await assertFails(writeExpense('alice', { eid: 'e1', hid: 'h0' }));
  await assertFails(writeExpense('alice', { eid: 'e1', hid: 'h0', withHistory: false }));
  await assertFails(writeExpense('alice', { eid: 'e0', hid: 'h0', action: 'update', withHistory: false }));
});

test('expenses: history action must be create|update|delete and match deleted', async () => {
  await assertFails(writeExpense('alice', { action: 'purge' }));
  await assertFails(writeExpense('alice', { action: 'delete' }));
  await assertFails(writeExpense('alice', { eid: 'e0', hid: 'h4', action: 'update', deleted: true }));
});

test('expenses: paidBy must be a group member; shares non-empty', async () => {
  await assertFails(writeExpense('alice', { e: { paidBy: 'carol' } }));
  await assertFails(writeExpense('alice', { eo: { shares: {} } }));
  await assertFails(writeExpense('alice', { eo: { shares: 'x' } }));
});

test('expenses: updatedAt and changedAt must be the server time', async () => {
  const forged = Timestamp.fromMillis(1000);
  await assertFails(writeExpense('alice', { eo: { updatedAt: forged } }));
  await assertFails(writeExpense('alice', { ho: { changedAt: forged } }));
  await assertFails(writeExpense('alice', { eo: { updatedAt: Timestamp.now() } }));
  await assertFails(writeExpense('alice', { ho: { changedAt: null } }));
  await assertSucceeds(writeExpense('alice'));
});

test('history: written entries appear in the listHistory query (orderBy changedAt)', async () => {
  await assertSucceeds(writeExpense('alice'));
  const snap = await assertSucceeds(getDocs(query(collection(db('bob'), 'groups', G, 'history'), orderBy('changedAt', 'desc'))));
  assert.deepEqual(snap.docs.map((x) => x.id), ['h1']);
});

test('history: immutable, member-only read', async () => {
  const ref = (uid) => doc(db(uid), 'groups', G, 'history', 'h0');
  await assertFails(updateDoc(ref('alice'), { action: 'update' }));
  await assertFails(deleteDoc(ref('alice')));
  await assertFails(getDoc(ref('carol')));
  await assertSucceeds(getDoc(ref('bob')));
});

test('history: cannot fabricate an entry without a matching expense write', async () => {
  await assertFails(writeExpense('alice', { eid: 'e0', hid: 'hx', withExpense: false }));
  await assertFails(writeExpense('alice', { eid: 'nope', hid: 'hy', withExpense: false }));
  const d = db('alice');
  const b = writeBatch(d);
  b.set(doc(d, 'groups', G, 'expenses', 'e1'), expensePayload(appExpense(), 'alice', 'hz', false, serverTimestamp()));
  b.set(doc(d, 'groups', G, 'history', 'hz'), historyPayload('e1', 'create', null, appExpense(), 'alice', serverTimestamp()));
  b.set(doc(d, 'groups', G, 'history', 'hfake'), historyPayload('e1', 'create', null, appExpense(), 'alice', serverTimestamp()));
  await assertFails(b.commit());
});

// ---- settlements ----
test('settlements: payer or receiver records (api shape), third party denied, no delete', async () => {
  await assertSucceeds(settle('alice'));
  await assertSucceeds(settle('bob'));
  await assertFails(settle('carol'));
  await assertFails(settle('alice', {}, 'alice', 'carol'));
  await assertFails(settle('alice', {}, 'alice', 'bob', 0));
  await assertFails(deleteDoc(doc(db('alice'), 'groups', G, 'settlements', 's0')));
  await assertFails(getDoc(doc(db('carol'), 'groups', G, 'settlements', 's0')));
});

test('settlements: from == to rejected; createdAt must be server time', async () => {
  await assertFails(settle('alice', {}, 'alice', 'alice'));
  await assertFails(settle('alice', { createdAt: Timestamp.fromMillis(5) }));
  await assertFails(settle('alice', { createdAt: null }));
});

test('settlements: no client updates (cannot flip deleted)', async () => {
  await assertFails(updateDoc(doc(db('alice'), 'groups', G, 'settlements', 's0'), { deleted: true }));
  await assertFails(updateDoc(doc(db('bob'), 'groups', G, 'settlements', 's0'), { deleted: true }));
});

