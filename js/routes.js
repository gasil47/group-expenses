// Pure, DOM-free helpers for routing, invite links and per-user nets.
import { netBalances } from './ledger.js';

export function parseRoute(hash) {
  const h = String(hash || '').replace(/^#/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'group' && parts[1]) return { name: 'group', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'join' && parts[1]) return { name: 'join', token: decodeURIComponent(parts[1]) };
  return { name: 'home' };
}

export function inviteUrl(baseUrl, token) {
  const base = String(baseUrl).split('#')[0];
  return `${base}#/join/${encodeURIComponent(token)}`;
}

export function whatsappUrl(groupName, url) {
  const text = `Join "${groupName}" on our group expenses: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// Convert DB rows (snake_case) into the shapes ledger.js expects.
export function toLedgerExpense(row, shareRows) {
  return {
    paidBy: row.paid_by,
    amount: row.amount_fils,
    shares: (shareRows || []).map((s) => ({ userId: s.user_id, fils: s.fils })),
  };
}
export function toLedgerSettlement(row) {
  return { fromUser: row.from_user, toUser: row.to_user, amount: row.amount_fils };
}

// Net for one user in one group; positive = they are owed.
export function userNet(userId, expenses, settlements) {
  return netBalances(expenses, settlements).get(userId) || 0;
}

export function totalNet(nets) {
  return nets.reduce((a, b) => a + b, 0);
}

export function isConfigured(url, key) {
  const bad = (v) => !v || /YOUR_|PLACEHOLDER|example/i.test(v);
  return !bad(url) && !bad(key);
}
