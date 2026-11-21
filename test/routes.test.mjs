import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, inviteUrl, whatsappUrl, userNet, totalNet, toLedgerExpense, toLedgerSettlement, isConfigured } from '../js/routes.js';

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

test('userNet and totalNet', () => {
  const ex = [toLedgerExpense({ paid_by: 'a', amount_fils: 3000 }, [
    { user_id: 'a', fils: 1000 }, { user_id: 'b', fils: 1000 }, { user_id: 'c', fils: 1000 }])];
  const st = [toLedgerSettlement({ from_user: 'b', to_user: 'a', amount_fils: 400 })];
  assert.equal(userNet('a', ex, st), 1600);
  assert.equal(userNet('b', ex, st), -600);
  assert.equal(userNet('zz', ex, st), 0);
  assert.equal(totalNet([1600, -600, 0]), 1000);
});

test('isConfigured', () => {
  assert.equal(isConfigured('YOUR_SUPABASE_URL', 'k'), false);
  assert.equal(isConfigured('https://abc.supabase.co', 'YOUR_ANON_KEY'), false);
  assert.equal(isConfigured('https://abc.supabase.co', 'eyJ'), true);
});
