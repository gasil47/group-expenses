import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { boot, addUser, as } from './helpers/pg.mjs';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
let db, gid, eid, token;

const exp = (o = {}) => JSON.stringify({ group_id: gid, description: 'Dinner', amount_fils: 3000, paid_by: A, ...o });
const shares = (a = 1500, b = 1500) => JSON.stringify([{ user_id: A, fils: a }, { user_id: B, fils: b }]);
const save = (e, s) => db.query('select save_expense($1::jsonb, $2::jsonb) as id', [e, s]);

before(async () => {
  db = await boot();
  for (const u of [A, B, C]) await addUser(db, u);
  gid = await as(db, A, async () => (await db.query(`select create_group('Trip') as id`)).rows[0].id);
  token = (await as(db, A, () => db.query('select invite_token from groups'))).rows[0].invite_token;
  await as(db, B, () => db.query('select join_group($1)', [token]));
  eid = await as(db, A, async () => (await save(exp(), shares())).rows[0].id);
});

test('non-member cannot select group or expenses', async () => {
  await as(db, C, async () => {
    assert.equal((await db.query('select * from groups')).rows.length, 0);
    assert.equal((await db.query('select * from expenses')).rows.length, 0);
    assert.equal((await db.query('select * from expense_history')).rows.length, 0);
    assert.equal((await db.query('select * from profiles where id = $1', [A])).rows.length, 0);
  });
});

test('non-member cannot write', async () => {
  await as(db, C, async () => {
    await assert.rejects(save(exp(), shares()), /not a member/);
    await assert.rejects(db.query(`insert into expenses (group_id, amount_fils, paid_by, created_by) values ($1, 5, $2, $2)`, [gid, C]));
    await assert.rejects(db.query(`select delete_expense($1)`, [eid]), /not a member/);
  });
});

test('members see group data', async () => {
  await as(db, B, async () => {
    assert.equal((await db.query('select * from expenses')).rows.length, 1);
    assert.equal((await db.query('select * from profiles')).rows.length, 2);
  });
});

test('valid token joins, bad token raises', async () => {
  await as(db, C, async () => {
    await assert.rejects(db.query(`select join_group('nope')`), /invalid invite/);
    assert.equal((await db.query('select * from groups')).rows.length, 0);
    await db.query('select join_group($1)', [token]);
    assert.equal((await db.query('select * from groups')).rows.length, 1);
  });
  await db.query('delete from group_members where user_id = $1', [C]);
});

test('share sum mismatch and non-member share rejected', async () => {
  await as(db, A, async () => {
    await assert.rejects(save(exp(), shares(1000, 1000)), /add up/);
    await assert.rejects(save(exp(), JSON.stringify([{ user_id: C, fils: 3000 }])), /not a member/);
  });
});

test('edit by another member writes history with changed_by and old values', async () => {
  await as(db, B, () => save(exp({ id: eid, amount_fils: 4000, description: 'Big dinner' }), shares(2000, 2000)));
  const h = (await db.query(`select * from expense_history where expense_id = $1`, [eid])).rows;
  const upd = h.find((r) => r.action === 'update');
  assert.equal(upd.changed_by, B);
  assert.equal(upd.old_row.amount_fils, 3000);
  assert.equal(upd.old_row.description, 'Dinner');
  assert.equal(upd.old_row.shares.length, 2);
  assert.equal(upd.new_row.amount_fils, 4000);
  assert.equal(h.find((r) => r.action === 'create').changed_by, A);
});

test('soft delete hides expense but keeps history', async () => {
  await as(db, A, async () => {
    await db.query('select delete_expense($1)', [eid]);
    assert.equal((await db.query('select * from expenses')).rows.length, 0);
    const h = await db.query('select action from expense_history where expense_id = $1', [eid]);
    assert.ok(h.rows.some((r) => r.action === 'delete'));
    await assert.rejects(db.query('delete from expenses'));
  });
});

test('record_payment by member', async () => {
  await as(db, A, async () => {
    await db.query('select record_payment($1, $2, 500)', [gid, B]);
    assert.equal((await db.query('select * from settlements')).rows.length, 1);
  });
  await as(db, C, () => assert.rejects(db.query('select record_payment($1, $2, 500)', [gid, B]), /not a member/));
});

test('non-member cannot call shares_json or expense_group', async () => {
  await as(db, C, async () => {
    const s = (await db.query('select shares_json($1) as j', [eid])).rows[0].j;
    assert.deepEqual(s, []);
    assert.equal((await db.query('select expense_group($1) as g', [eid])).rows[0].g, null);
  });
});

test('deleted expense appears in group history with who deleted it', async () => {
  const e2 = await as(db, A, async () => (await save(exp({ description: 'Gone' }), shares())).rows[0].id);
  await as(db, B, () => db.query('select delete_expense($1)', [e2]));
  await as(db, A, async () => {
    const h = (await db.query('select * from group_history($1)', [gid])).rows;
    const d = h.find((r) => r.expense_id === e2 && r.action === 'delete');
    assert.ok(d);
    assert.equal(d.changed_by, B);
  });
  await as(db, C, async () => {
    await assert.rejects(db.query('select * from group_history($1)', [gid]), /not a member/);
  });
});
