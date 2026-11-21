import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAed, formatAed, computeSplit, netBalances, simplifyDebts, breakdown } from '../js/ledger.js';

const f = (r) => r.shares.map((s) => s.fils);
const sum = (a) => a.reduce((x, y) => x + y, 0);

test('parseAed / formatAed', () => {
  assert.equal(parseAed('12.5'), 1250);
  assert.equal(parseAed('12'), 1200);
  assert.equal(parseAed('0.05'), 5);
  assert.equal(formatAed(1250), '12.50 AED');
  for (const bad of ['-1', '1.234', 'abc', '', '1e3', null, '1,5']) assert.equal(parseAed(bad), null, String(bad));
});

test('equal split remainder goes to first rows', () => {
  const r = computeSplit(100, 'equal', [{ userId: 'a', value: true }, { userId: 'b', value: true }, { userId: 'c', value: true }]);
  assert.deepEqual(f(r), [34, 33, 33]);
});
test('equal skips excluded; none -> error', () => {
  const r = computeSplit(100, 'equal', [{ userId: 'a', value: false }, { userId: 'b', value: true }]);
  assert.deepEqual(r.shares, [{ userId: 'b', fils: 100 }]);
  assert.equal(computeSplit(100, 'equal', [{ userId: 'a', value: false }]).ok, false);
  assert.equal(computeSplit(100, 'equal', []).ok, false);
});
test('percent 33.33/33.33/33.34', () => {
  const rows = [{ userId: 'a', value: 33.33 }, { userId: 'b', value: 33.33 }, { userId: 'c', value: 33.34 }];
  assert.deepEqual(f(computeSplit(10000, 'percent', rows)), [3333, 3333, 3334]);
  assert.equal(sum(f(computeSplit(101, 'percent', rows))), 101);
  const bad = computeSplit(100, 'percent', [{ userId: 'a', value: 50 }, { userId: 'b', value: 49 }]);
  assert.equal(bad.ok, false);
  assert.ok(bad.error);
});
test('shares 2:1 of 1000', () => {
  const r = computeSplit(1000, 'shares', [{ userId: 'a', value: 2 }, { userId: 'b', value: 1 }]);
  assert.deepEqual(f(r), [667, 333]);
  assert.equal(computeSplit(1000, 'shares', [{ userId: 'a', value: 0 }, { userId: 'b', value: 0 }]).ok, false);
});
test('exact', () => {
  assert.deepEqual(f(computeSplit(500, 'exact', [{ userId: 'a', value: 200 }, { userId: 'b', value: 300 }])), [200, 300]);
  const bad = computeSplit(500, 'exact', [{ userId: 'a', value: 200 }, { userId: 'b', value: 200 }]);
  assert.equal(bad.ok, false);
  assert.ok(bad.error);
});

function rnd(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function world() {
  const r = rnd(42), users = ['u1', 'u2', 'u3', 'u4', 'u5'];
  const expenses = [], settlements = [];
  for (let i = 0; i < 200; i++) {
    const total = 1 + Math.floor(r() * 100000);
    const rows = users.map((u) => ({ userId: u, value: r() < 0.7 }));
    if (!rows.some((x) => x.value)) rows[0].value = true;
    const sp = computeSplit(total, 'equal', rows);
    expenses.push({ id: 'e' + i, paidBy: users[Math.floor(r() * 5)], amount: total, shares: sp.shares });
    if (i % 10 === 0) settlements.push({ id: 's' + i, fromUser: users[i % 5], toUser: users[(i + 1) % 5], amount: 1 + Math.floor(r() * 5000) });
  }
  return { users, expenses, settlements };
}

test('nets sum to zero; breakdown sums to net; simplify settles', () => {
  const { users, expenses, settlements } = world();
  const net = netBalances(expenses, settlements);
  assert.equal(sum([...net.values()]), 0);
  for (const u of users) assert.equal(sum(breakdown(u, expenses, settlements).map((b) => b.deltaFils)), net.get(u) ?? 0);
  const pays = simplifyDebts(net);
  assert.ok(pays.length <= users.length - 1);
  const after = new Map(net);
  for (const p of pays) { after.set(p.from, (after.get(p.from) ?? 0) + p.fils); after.set(p.to, (after.get(p.to) ?? 0) - p.fils); }
  for (const v of after.values()) assert.equal(v, 0);
  assert.deepEqual(simplifyDebts(net), pays);
});
test('settlement reduces debt', () => {
  const ex = [{ id: 'e', paidBy: 'a', amount: 1000, shares: [{ userId: 'a', fils: 500 }, { userId: 'b', fils: 500 }] }];
  const st = [{ id: 's', fromUser: 'b', toUser: 'a', amount: 200 }];
  assert.equal(netBalances(ex, []).get('b'), -500);
  const n = netBalances(ex, st);
  assert.equal(n.get('b'), -300);
  assert.equal(n.get('a'), 300);
  assert.deepEqual(breakdown('b', ex, st).map((x) => x.kind), ['expense', 'payment']);
});
