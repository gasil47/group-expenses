import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newRows, rowsFromShares, evaluateForm, buildPayload, youLine, describeChange, paymentText, netText,
} from '../js/expense-logic.js';

const members = [{ id: 'a', name: 'Ali' }, { id: 'b', name: 'Sara' }, { id: 'c', name: 'Raj' }];
const nameOf = (id) => ({ a: 'Ali', b: 'Sara', c: 'Raj' }[id] || 'Member');

test('equal is preselected for all members and splits with remainder', () => {
  const rows = newRows(members);
  assert.ok(rows.every((r) => r.on));
  const r = evaluateForm({ amountText: '100', mode: 'equal', rows });
  assert.equal(r.ok, true);
  assert.deepEqual(r.shares.map((s) => s.fils), [3334, 3333, 3333]);
});

test('invalid amount blocks save with a message', () => {
  const rows = newRows(members);
  assert.equal(evaluateForm({ amountText: '', mode: 'equal', rows }).ok, false);
  assert.match(evaluateForm({ amountText: '0', mode: 'equal', rows }).error, /greater than 0/);
});

test('equal with nobody selected is invalid', () => {
  const rows = newRows(members).map((r) => ({ ...r, on: false }));
  const r = evaluateForm({ amountText: '10', mode: 'equal', rows });
  assert.equal(r.ok, false);
  assert.match(r.error, /at least one/);
});

test('exact mode reports remaining and blocks on mismatch', () => {
  const rows = newRows(members);
  rows[0].text = '30'; rows[1].text = '20';
  const r = evaluateForm({ amountText: '60', mode: 'exact', rows });
  assert.equal(r.ok, false);
  assert.match(r.error, /add up to 50\.00 AED but the total is 60\.00 AED/);
  assert.equal(r.remaining, '10.00 AED left to split');
  rows[2].text = '10';
  const ok = evaluateForm({ amountText: '60', mode: 'exact', rows });
  assert.equal(ok.ok, true);
  assert.equal(ok.remaining, 'Fully split');
});

test('shares mode weights', () => {
  const rows = newRows(members);
  rows[0].text = '2'; rows[1].text = '1';
  const r = evaluateForm({ amountText: '30', mode: 'shares', rows });
  assert.deepEqual(r.shares, [{ userId: 'a', fils: 2000 }, { userId: 'b', fils: 1000 }]);
});

test('percent mode must total 100', () => {
  const rows = newRows(members);
  rows[0].text = '50'; rows[1].text = '30';
  const bad = evaluateForm({ amountText: '10', mode: 'percent', rows });
  assert.equal(bad.ok, false);
  assert.equal(bad.remaining, '20% left to split');
  rows[2].text = '20';
  const ok = evaluateForm({ amountText: '10', mode: 'percent', rows });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.shares.map((s) => s.fils), [500, 300, 200]);
});

test('garbage numbers are rejected', () => {
  const rows = newRows(members);
  rows[0].text = 'abc';
  assert.equal(evaluateForm({ amountText: '10', mode: 'exact', rows }).error, 'Enter valid numbers');
});

test('buildPayload shapes the save_expense args', () => {
  const rows = newRows(members);
  const ev = evaluateForm({ amountText: '9', mode: 'equal', rows });
  const p = buildPayload({ description: ' Lunch ', paidBy: 'a' }, 'g1', 'e1', ev, '2026-01-02');
  assert.deepEqual(p.expense, { group_id: 'g1', description: 'Lunch', amount_fils: 900, paid_by: 'a', id: 'e1', spent_on: '2026-01-02' });
  assert.equal(p.shares.length, 3);
  assert.equal(p.shares[0].user_id, 'a');
  assert.equal('id' in buildPayload({ description: '', paidBy: 'a' }, 'g1', null, ev).expense, false);
});

test('rowsFromShares prefills edit state', () => {
  const rows = rowsFromShares(members, [{ userId: 'a', fils: 1250 }]);
  assert.deepEqual(rows[0], { userId: 'a', on: true, text: '12.50' });
  assert.equal(rows[1].on, false);
});

test('youLine owe / lent / none', () => {
  const exp = { paid_by: 'a', amount_fils: 3000 };
  const shares = [{ user_id: 'a', fils: 1000 }, { user_id: 'b', fils: 2000 }];
  assert.equal(youLine('a', exp, shares).text, 'You lent 20.00 AED');
  assert.equal(youLine('b', exp, shares).text, 'You owe 20.00 AED');
  assert.equal(youLine('c', exp, shares).kind, 'none');
});

test('describeChange shows amount diff, create and delete', () => {
  const upd = describeChange({ action: 'update', changed_by: 'b',
    old_row: { amount_fils: 5000, description: 'x', paid_by: 'a', shares: [] },
    new_row: { amount_fils: 6000, description: 'x', paid_by: 'a', shares: [] } }, nameOf);
  assert.deepEqual(upd, { who: 'Sara', lines: ['Amount 50.00 → 60.00 AED'] });
  assert.deepEqual(describeChange({ action: 'create', changed_by: 'a' }, nameOf).lines, ['Created']);
  assert.deepEqual(describeChange({ action: 'delete', changed_by: 'a' }, nameOf).lines, ['Deleted']);
  const who = describeChange({ action: 'update', changed_by: 'a',
    old_row: { amount_fils: 1, paid_by: 'a' }, new_row: { amount_fils: 1, paid_by: 'b' } }, nameOf);
  assert.deepEqual(who.lines, ['Paid by Ali → Sara']);
});

test('paymentText and netText', () => {
  assert.equal(paymentText({ from: 'a', to: 'b', fils: 12000 }, nameOf), 'Ali pays Sara 120.00 AED');
  assert.equal(netText(500).cls, 'pos');
  assert.equal(netText(-500).text, 'owes 5.00 AED');
  assert.equal(netText(0).text, 'is settled up');
});
