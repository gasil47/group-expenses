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

// Save payload for save_expense.
export function buildPayload(form, groupId, expenseId, evalResult, spentOn) {
  const expense = {
    group_id: groupId,
    description: String(form.description || '').trim(),
    amount_fils: evalResult.total,
    paid_by: form.paidBy,
  };
  if (expenseId) expense.id = expenseId;
  if (spentOn) expense.spent_on = spentOn;
  return { expense, shares: evalResult.shares.map((s) => ({ user_id: s.userId, fils: s.fils })) };
}

// "You owe 12.00 AED" / "You lent 30.00 AED" / "" when not involved. shareRows are DB rows.
export function youLine(userId, expenseRow, shareRows) {
  const mine = (shareRows || []).filter((s) => s.user_id === userId).reduce((a, s) => a + s.fils, 0);
  if (expenseRow.paid_by === userId) {
    const lent = expenseRow.amount_fils - mine;
    return lent > 0 ? { kind: 'lent', text: `You lent ${formatAed(lent)}` } : { kind: 'none', text: 'Not involved' };
  }
  return mine > 0 ? { kind: 'owe', text: `You owe ${formatAed(mine)}` } : { kind: 'none', text: 'Not involved' };
}

// Plain-language list of changes between two history rows (old/new jsonb, snake_case).
export function describeChange(entry, nameOf) {
  const who = nameOf(entry.changed_by);
  if (entry.action === 'create') return { who, lines: ['Created'] };
  if (entry.action === 'delete') return { who, lines: ['Deleted'] };
  const o = entry.old_row || {}, n = entry.new_row || {};
  const lines = [];
  if (o.amount_fils !== n.amount_fils) lines.push(`Amount ${formatAed(o.amount_fils).replace(' AED', '')} → ${formatAed(n.amount_fils)}`);
  if ((o.description || '') !== (n.description || '')) lines.push(`Description "${o.description || ''}" → "${n.description || ''}"`);
  if (o.paid_by !== n.paid_by) lines.push(`Paid by ${nameOf(o.paid_by)} → ${nameOf(n.paid_by)}`);
  if (o.spent_on !== n.spent_on) lines.push(`Date ${o.spent_on} → ${n.spent_on}`);
  if (JSON.stringify(o.shares || []) !== JSON.stringify(n.shares || [])) lines.push('Split changed');
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
