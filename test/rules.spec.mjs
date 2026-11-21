import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, writeBatch,
} from 'firebase/firestore';

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

const expense = (over = {}) => ({
  description: 'Lunch', amountFils: 2000, paidBy: 'alice',
  shares: { alice: 1000, bob: 1000 }, spentOn: '2026-01-01',
  updatedBy: 'alice', historyId: 'h1', deleted: false, ...over,
});
const hist = (over = {}) => ({
  expenseId: 'e1', action: 'create', changedBy: 'alice', before: null, after: {}, ...over,
});
async function writeExpense(uid, { e = {}, h = {}, eid = 'e1', withHistory = true } = {}) {
  const d = db(uid);
  const b = writeBatch(d);
  b.set(doc(d, 'groups', G, 'expenses', eid), expense(e));
  if (withHistory) b.set(doc(d, 'groups', G, 'history', e.historyId ?? 'h1'), hist({ expenseId: eid, changedBy: uid, ...h }));
  return b.commit();
}

test('users: owner writes own doc, others cannot', async () => {
  await assertSucceeds(setDoc(doc(db('alice'), 'users', 'alice'), { displayName: 'A' }));
  await assertFails(setDoc(doc(db('bob'), 'users', 'alice'), { displayName: 'X' }));
  await assertSucceeds(getDoc(doc(db('bob'), 'users', 'alice')));
});

test('groups: create needs memberIds == [me]', async () => {
  await assertSucceeds(setDoc(doc(db('carol'), 'groups', 'g3'), {
    name: 'N', createdBy: 'carol', memberIds: ['carol'], memberNames: { carol: 'C' }, inviteToken: 't',
  }));
  await assertFails(setDoc(doc(db('carol'), 'groups', 'g4'), {
    name: 'N', createdBy: 'carol', memberIds: ['carol', 'bob'], memberNames: {}, inviteToken: 't',
  }));
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

test('invites: member creates, signed-in get ok, list denied', async () => {
  await assertSucceeds(setDoc(doc(db('alice'), 'invites', 'new'), { groupId: G }));
  await assertFails(setDoc(doc(db('carol'), 'invites', 'new2'), { groupId: G }));
  await assertSucceeds(getDoc(doc(db('carol'), 'invites', 'tok1')));
  await assertFails(getDocs(collection(db('carol'), 'invites')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'invites', 'tok1')));
});

test('join: valid token adds only me', async () => {
  await assertSucceeds(updateDoc(doc(db('carol'), 'groups', G), {
    memberIds: ['alice', 'bob', 'carol'],
    memberNames: { alice: 'Alice', bob: 'Bob', carol: 'Carol' },
    joinToken: 'tok1',
  }));
});

test('join: wrong token, other group token, or adding others rejected', async () => {
  const join = (uid, token, ids, names) => updateDoc(doc(db(uid), 'groups', G), {
    memberIds: ids, memberNames: names, joinToken: token,
  });
  const names = { alice: 'Alice', bob: 'Bob' };
  await assertFails(join('carol', 'nope', ['alice', 'bob', 'carol'], { ...names, carol: 'C' }));
  await assertFails(join('carol', 'tok2', ['alice', 'bob', 'carol'], { ...names, carol: 'C' }));
  await assertFails(join('carol', 'tok1', ['alice', 'bob', 'carol', 'eve'], { ...names, carol: 'C', eve: 'E' }));
  await assertFails(join('carol', 'tok1', ['alice', 'bob', 'eve'], { ...names, eve: 'E' }));
  await assertFails(join('carol', 'tok1', ['carol'], { carol: 'C' }));
});

test('expenses: member write with matching history succeeds', async () => {
  await assertSucceeds(writeExpense('alice'));
  await assertSucceeds(writeExpense('bob', {
    eid: 'e0', e: { updatedBy: 'bob', historyId: 'h2', amountFils: 1500, shares: { alice: 750, bob: 750 } },
  }));
});

test('expenses: missing history, wrong author, bad shares, bad amount fail', async () => {
  await assertFails(writeExpense('alice', { withHistory: false }));
  await assertFails(writeExpense('alice', { e: { updatedBy: 'bob' } }));
  await assertFails(writeExpense('alice', { h: { changedBy: 'bob' } }));
  await assertFails(writeExpense('alice', { h: { expenseId: 'other' } }));
  await assertFails(writeExpense('alice', { e: { shares: { alice: 1000, carol: 1000 } } }));
  await assertFails(writeExpense('alice', { e: { amountFils: 0 } }));
  await assertFails(writeExpense('alice', { e: { amountFils: -5 } }));
  await assertFails(writeExpense('carol', { e: { updatedBy: 'carol' } }));
});

test('expenses: hard delete denied, soft delete with history ok, non-member read denied', async () => {
  await assertFails(deleteDoc(doc(db('alice'), 'groups', G, 'expenses', 'e0')));
  await assertSucceeds(writeExpense('alice', { eid: 'e0', e: { deleted: true, historyId: 'h3' }, h: { action: 'delete' } }));
  await assertSucceeds(getDoc(doc(db('bob'), 'groups', G, 'expenses', 'e0')));
  await assertFails(getDoc(doc(db('carol'), 'groups', G, 'expenses', 'e0')));
});

test('history: immutable, member-only read', async () => {
  const ref = (uid) => doc(db(uid), 'groups', G, 'history', 'h0');
  await assertFails(updateDoc(ref('alice'), { action: 'update' }));
  await assertFails(deleteDoc(ref('alice')));
  await assertFails(getDoc(ref('carol')));
  await assertSucceeds(getDoc(ref('bob')));
});

test('settlements: payer or receiver records, third party denied, no delete', async () => {
  const s = (uid, over) => setDoc(doc(db(uid), 'groups', G, 'settlements', 's' + Math.random()), {
    fromUser: 'alice', toUser: 'bob', amountFils: 500, createdBy: uid, deleted: false, ...over,
  });
  await assertSucceeds(s('alice'));
  await assertSucceeds(s('bob'));
  await assertFails(s('carol'));
  await assertFails(s('alice', { toUser: 'carol' }));
  await assertFails(s('alice', { amountFils: 0 }));
  await assertFails(deleteDoc(doc(db('alice'), 'groups', G, 'settlements', 's0')));
  await assertFails(getDoc(doc(db('carol'), 'groups', G, 'settlements', 's0')));
});
