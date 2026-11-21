// Pure money logic. All amounts are integer fils (1 AED = 100 fils).

export function parseAed(input) {
  if (typeof input !== 'string') return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0') || 0);
}

export function formatAed(fils) {
  const neg = fils < 0;
  const a = Math.abs(fils);
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')} AED`;
}

// Split total by integer weights; remainder fils go one each to the first rows.
function allocate(total, rows, weights) {
  const W = weights.reduce((a, b) => a + b, 0);
  const out = rows.map((r, i) => ({ userId: r.userId, fils: Math.floor((total * weights[i]) / W) }));
  let rem = total - out.reduce((a, s) => a + s.fils, 0);
  for (let i = 0; rem > 0; i = (i + 1) % out.length) {
    if (weights[i] > 0) { out[i].fils += 1; rem -= 1; }
  }
  return out;
}

const fail = (error) => ({ ok: false, error });

export function computeSplit(totalFils, mode, rows) {
  if (!Number.isInteger(totalFils) || totalFils < 0) return fail('Invalid total amount');
  rows = rows || [];
  if (mode === 'equal') {
    const inc = rows.filter((r) => r.value);
    if (!inc.length) return fail('Select at least one participant');
    return { ok: true, shares: allocate(totalFils, inc, inc.map(() => 1)) };
  }
  if (mode === 'exact') {
    const inc = rows.filter((r) => r.value > 0);
    if (!inc.length) return fail('Select at least one participant');
    const s = inc.reduce((a, r) => a + r.value, 0);
    if (s !== totalFils) return fail(`Amounts add up to ${formatAed(s)} but the total is ${formatAed(totalFils)}`);
    return { ok: true, shares: inc.map((r) => ({ userId: r.userId, fils: r.value })) };
  }
  if (mode === 'shares') {
    const inc = rows.filter((r) => r.value > 0);
    if (!inc.length) return fail('Give at least one participant a share');
    return { ok: true, shares: allocate(totalFils, inc, inc.map((r) => r.value)) };
  }
  if (mode === 'percent') {
    const inc = rows.filter((r) => r.value > 0);
    if (!inc.length) return fail('Select at least one participant');
    const w = inc.map((r) => Math.round(r.value * 100));
    if (w.reduce((a, b) => a + b, 0) !== 10000) return fail('Percentages must add up to 100');
    return { ok: true, shares: allocate(totalFils, inc, w) };
  }
  return fail('Unknown split mode');
}

export function netBalances(expenses, settlements) {
  const net = new Map();
  const add = (u, d) => net.set(u, (net.get(u) || 0) + d);
  for (const e of expenses) {
    add(e.paidBy, e.amount);
    for (const s of e.shares) add(s.userId, -s.fils);
  }
  for (const s of settlements) {
    add(s.fromUser, s.amount);
    add(s.toUser, -s.amount);
  }
  return net;
}

export function simplifyDebts(netMap) {
  const cmp = (a, b) => b.fils - a.fils || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const debtors = [], creditors = [];
  for (const [id, v] of netMap) {
    if (v < 0) debtors.push({ id, fils: -v });
    else if (v > 0) creditors.push({ id, fils: v });
  }
  const out = [];
  while (debtors.length && creditors.length) {
    debtors.sort(cmp);
    creditors.sort(cmp);
    const d = debtors[0], c = creditors[0];
    const x = Math.min(d.fils, c.fils);
    out.push({ from: d.id, to: c.id, fils: x });
    d.fils -= x;
    c.fils -= x;
    if (!d.fils) debtors.shift();
    if (!c.fils) creditors.shift();
  }
  return out;
}

export function breakdown(userId, expenses, settlements) {
  const out = [];
  for (const e of expenses) {
    let d = e.paidBy === userId ? e.amount : 0;
    for (const s of e.shares) if (s.userId === userId) d -= s.fils;
    if (d !== 0 || e.paidBy === userId || e.shares.some((s) => s.userId === userId)) {
      out.push({ kind: 'expense', id: e.id, label: e.title || 'Expense', deltaFils: d });
    }
  }
  for (const s of settlements) {
    let d = 0;
    if (s.fromUser === userId) d += s.amount;
    if (s.toUser === userId) d -= s.amount;
    if (d !== 0) out.push({ kind: 'payment', id: s.id, label: s.fromUser === userId ? `Paid ${s.toUser}` : `Received from ${s.fromUser}`, deltaFils: d });
  }
  return out;
}
