// Pure, DOM-free logic for the expense form, list and history views.
import { computeSplit, parseAed, formatAed } from './ledger.js';

export const MODES = [['equal', 'Equal'], ['exact', 'Exact'], ['shares', 'Shares'], ['percent', '%']];

// Rows for a fresh form: everyone included for Equal, nothing typed yet.
export function newRows(members) {
  return members.map((m) => ({ userId: m.id, on: true, text: '' }));
}

// Rows for editing: everyone who has a share is on; exact amounts prefilled so Exact mode works.
export function rowsFromShares(members, shares) {
  const by = new Map(shares.map((s) => [s.userId, s.fils]));
  return members.map((m) => ({
    userId: m.id,
    on: by.has(m.id),
    text: by.has(m.id) ? formatAed(by.get(m.id)).replace(' AED', '') : '',
  }));
}

// Initial form state when editing: 'equal' if saved shares match an equal split of the
// same people, otherwise 'exact' with the saved amounts so saving unchanged is lossless.
export function initialFormFromShares(members, shares, totalFils) {
  const rows = rowsFromShares(members, shares);
  const eq = computeSplit(totalFils, 'equal', shares.map((s) => ({ userId: s.userId, value: true })));
  const same = eq.ok && eq.shares.length === shares.length && eq.shares.every((e) => {
    const s = shares.find((x) => x.userId === e.userId);
    return s && s.fils === e.fils;
  });
  if (same) return { mode: 'equal', rows: rows.map((r) => ({ ...r, text: '' })) };
  return { mode: 'exact', rows };
}

function toValue(mode, r) {
  if (mode === 'equal') return r.on;
  const t = String(r.text || '').trim();
  if (!t) return 0;
  if (mode === 'exact') return parseAed(t) ?? NaN;
  if (mode === 'shares') return /^\d+$/.test(t) ? Number(t) : NaN;
  if (mode === 'percent') return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
  return 0;
}

// form: { amountText, mode, rows }. Returns { ok, error, total, shares, remaining }.
export function evaluateForm(form) {
  const total = parseAed(String(form.amountText || ''));
  if (total === null || total <= 0) {
    return { ok: false, error: 'Enter an amount greater than 0', total: null, remaining: null };
  }
  const vals = form.rows.map((r) => ({ userId: r.userId, value: toValue(form.mode, r) }));
  if (vals.some((v) => Number.isNaN(v.value))) {
    return { ok: false, error: 'Enter valid numbers', total, remaining: null };
  }
  const res = computeSplit(total, form.mode, vals);
  let remaining = null;
  if (form.mode === 'exact') {
    const left = total - vals.reduce((a, v) => a + v.value, 0);
    remaining = left === 0 ? 'Fully split' : `${formatAed(left)} left to split`;
  } else if (form.mode === 'percent') {
    const left = Math.round(10000 - vals.reduce((a, v) => a + v.value * 100, 0)) / 100;
    remaining = left === 0 ? 'Fully split' : `${left}% left to split`;
  }
  return { ok: res.ok, error: res.error || null, total, shares: res.shares, remaining };
}

// Local calendar date as YYYY-MM-DD.
export function todayLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Expense object for api.saveExpense (camelCase, shares as [{userId,fils}]).
export function buildPayload(form, expenseId, evalResult, spentOn) {
  const expense = {
    description: String(form.description || '').trim(),
    amountFils: evalResult.total,
    paidBy: form.paidBy,
    spentOn: spentOn || todayLocal(),
    shares: evalResult.shares.map((s) => ({ userId: s.userId, fils: s.fils })),
  };
  if (expenseId) expense.id = expenseId;
  return expense;
}

// "You owe 12.00 AED" / "You lent 30.00 AED" / "" when not involved. expense is a mapped expense.
export function youLine(userId, expense) {
  const mine = (expense.shares || []).filter((s) => s.userId === userId).reduce((a, s) => a + s.fils, 0);
  if (expense.paidBy === userId) {
    const lent = expense.amountFils - mine;
    return lent > 0 ? { kind: 'lent', text: `You lent ${formatAed(lent)}` } : { kind: 'none', text: 'Not involved' };
  }
  return mine > 0 ? { kind: 'owe', text: `You owe ${formatAed(mine)}` } : { kind: 'none', text: 'Not involved' };
}

const sharesKey = (m) => JSON.stringify(Object.entries(m || {}).sort(([a], [b]) => (a < b ? -1 : 1)));

// Plain-language list of changes for a history entry {action, changedBy, before, after} (snapshots, shares as map).
export function describeChange(entry, nameOf) {
  const who = nameOf(entry.changedBy);
  if (entry.action === 'create') return { who, lines: ['Created'] };
  if (entry.action === 'delete') return { who, lines: ['Deleted'] };
  const o = entry.before || {}, n = entry.after || {};
  const lines = [];
  if (o.amountFils !== n.amountFils) lines.push(`Amount ${formatAed(o.amountFils).replace(' AED', '')} → ${formatAed(n.amountFils)}`);
  if ((o.description || '') !== (n.description || '')) lines.push(`Description "${o.description || ''}" → "${n.description || ''}"`);
  if (o.paidBy !== n.paidBy) lines.push(`Paid by ${nameOf(o.paidBy)} → ${nameOf(n.paidBy)}`);
  if (o.spentOn !== n.spentOn) lines.push(`Date ${o.spentOn} → ${n.spentOn}`);
  if (sharesKey(o.shares) !== sharesKey(n.shares)) lines.push('Split changed');
  return { who, lines: lines.length ? lines : ['Saved without changes'] };
}

// "Ali pays Sara 120.00 AED"
export function paymentText(p, nameOf) {
  return `${nameOf(p.from)} pays ${nameOf(p.to)} ${formatAed(p.fils)}`;
}

// Net line for a member: { cls, text }.
export function netText(fils) {
  if (fils > 0) return { cls: 'pos', text: `is owed ${formatAed(fils)}` };
  if (fils < 0) return { cls: 'neg', text: `owes ${formatAed(-fils)}` };
  return { cls: 'muted', text: 'is settled up' };
}
