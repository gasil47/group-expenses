import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  parseRoute, inviteUrl, whatsappUrl, userNet, totalNet, toLedgerExpense, toLedgerSettlement,
  sharesToMap, sharesFromMap, toGroup, toExpense, toSettlement, activeOnly, sortExpenses,
  expenseSnapshot, historyEntry, expenseDoc, randomToken,
} from '../js/routes.js';
import { isConfigured, firebaseConfig } from '../js/config.js';

test('parseRoute', () => {
  assert.deepEqual(parseRoute(''), { name: 'home' });
  assert.deepEqual(parseRoute('#/'), { name: 'home' });
  assert.deepEqual(parseRoute('#/group/abc'), { name: 'group', id: 'abc' });
  assert.deepEqual(parseRoute('#/join/tok123'), { name: 'join', token: 'tok123' });
  assert.deepEqual(parseRoute('#/group/'), { name: 'home' });
  assert.deepEqual(parseRoute('#/nope'), { name: 'home' });
});

test('invite and whatsapp urls', () => {
  const u = inviteUrl('https://x.github.io/app/index.html#/group/1', 'tok');
  assert.equal(u, 'https://x.github.io/app/index.html#/join/tok');
  const w = whatsappUrl('Trip', u);
  assert.ok(w.startsWith('https://wa.me/?text='));
  assert.ok(decodeURIComponent(w).includes(u));
});

const doc = {
  description: 'Lunch', amountFils: 3000, paidBy: 'a', shares: { b: 1000, a: 1000, c: 1000 },
  spentOn: '2026-01-02', updatedBy: 'a', historyId: 'h1', deleted: false, updatedAt: 1700000000000,
};

test('shares map <-> array round trip (sorted by user)', () => {
  assert.deepEqual(sharesFromMap({ b: 2, a: 1 }), [{ userId: 'a', fils: 1 }, { userId: 'b', fils: 2 }]);
  assert.deepEqual(sharesToMap([{ userId: 'a', fils: 1 }, { userId: 'b', fils: 2 }]), { a: 1, b: 2 });
  assert.deepEqual(sharesFromMap(undefined), []);
});

test('toExpense maps a Firestore doc, tolerating a pending timestamp', () => {
  const e = toExpense('e1', doc);
  assert.equal(e.id, 'e1');
  assert.equal(e.amountFils, 3000);
  assert.deepEqual(e.shares.map((s) => s.userId), ['a', 'b', 'c']);
  assert.equal(e.updatedAt, 1700000000000);
  assert.equal(toExpense('e2', { ...doc, updatedAt: null, deleted: undefined }).updatedAt, null);
  assert.equal(toExpense('e2', { ...doc, deleted: undefined }).deleted, false);
});

test('toGroup builds members from memberIds + memberNames', () => {
  const g = toGroup('g1', { name: 'Trip', createdBy: 'a', memberIds: ['a', 'b'], memberNames: { a: 'Ali' }, inviteToken: 't' });
  assert.deepEqual(g.members, [{ id: 'a', name: 'Ali' }, { id: 'b', name: 'Member' }]);
  assert.equal(g.inviteToken, 't');
});

test('userNet and totalNet from mapped docs; deleted rows are ignored', () => {
  const ex = activeOnly([toExpense('e1', doc), toExpense('e2', { ...doc, deleted: true })]).map(toLedgerExpense);
  const st = activeOnly([
    toSettlement('s1', { fromUser: 'b', toUser: 'a', amountFils: 400, deleted: false }),
    toSettlement('s2', { fromUser: 'c', toUser: 'a', amountFils: 999, deleted: true }),
  ]).map(toLedgerSettlement);
  assert.equal(ex.length, 1);
  assert.equal(st.length, 1);
  assert.equal(userNet('a', ex, st), 1600);
  assert.equal(userNet('b', ex, st), -600);
  assert.equal(userNet('zz', ex, st), 0);
  assert.equal(totalNet([1600, -600, 0]), 1000);
});

test('sortExpenses: newest date first, then latest update', () => {
  const l = sortExpenses([
    toExpense('old', { ...doc, spentOn: '2026-01-01' }),
    toExpense('b', { ...doc, spentOn: '2026-01-02', updatedAt: 5 }),
    toExpense('c', { ...doc, spentOn: '2026-01-02', updatedAt: 9 }),
  ]);
  assert.deepEqual(l.map((e) => e.id), ['c', 'b', 'old']);
});

test('history entry builder: create, update, delete', () => {
  const e = toExpense('e1', doc);
  const edited = { ...e, amountFils: 4000 };
  assert.deepEqual(historyEntry('create', null, e), { action: 'create', before: null, after: expenseSnapshot(e) });
  const up = historyEntry('update', e, edited);
  assert.equal(up.before.amountFils, 3000);
  assert.equal(up.after.amountFils, 4000);
  assert.deepEqual(up.before.shares, { a: 1000, b: 1000, c: 1000 });
  assert.deepEqual(historyEntry('delete', e, null), { action: 'delete', before: expenseSnapshot(e), after: null });
});

test('expenseDoc matches the D3 write shape', () => {
  const d = expenseDoc(toExpense('e1', doc), 'me', 'hist9', false);
  assert.deepEqual(Object.keys(d).sort(), ['amountFils', 'deleted', 'description', 'historyId', 'paidBy', 'shares', 'spentOn', 'updatedBy']);
  assert.equal(d.updatedBy, 'me');
  assert.equal(d.historyId, 'hist9');
  assert.deepEqual(d.shares, { a: 1000, b: 1000, c: 1000 });
  assert.equal(expenseDoc(toExpense('e1', doc), 'me', 'h', true).deleted, true);
});

test('randomToken is long, url-safe and varies', () => {
  const a = randomToken(webcrypto), b = randomToken(webcrypto);
  assert.ok(a.length >= 24);
  assert.match(a, /^[a-z0-9]+$/);
  assert.notEqual(a, b);
});

test('isConfigured', () => {
  assert.equal(isConfigured(firebaseConfig), true); // real project config since T-009
  const ok = { apiKey: 'AIza1', authDomain: 'p.firebaseapp.com', projectId: 'p', appId: '1:2:web:3' };
  assert.equal(isConfigured(ok), true);
  assert.equal(isConfigured({ ...ok, apiKey: 'YOUR_API_KEY' }), false);
});
