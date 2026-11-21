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

// ---- Firestore doc <-> app shapes (all pure; api.js is the only module touching Firebase) ----

export const sharesToMap = (shares) => Object.fromEntries((shares || []).map((s) => [s.userId, s.fils]));
export const sharesFromMap = (map) => Object.entries(map || {})
  .map(([userId, fils]) => ({ userId, fils })).sort((a, b) => (a.userId < b.userId ? -1 : 1));

// Group doc -> { id, name, inviteToken, createdBy, members:[{id,name}] }.
export function toGroup(id, d) {
  const names = d.memberNames || {};
  return {
    id, name: d.name, inviteToken: d.inviteToken, createdBy: d.createdBy,
    members: (d.memberIds || []).map((uid) => ({ id: uid, name: names[uid] || 'Member' })),
  };
}

// Expense doc -> app expense. updatedAt is epoch ms (api converts Timestamps) or null while pending.
export function toExpense(id, d) {
  return {
    id, description: d.description || '', amountFils: d.amountFils, paidBy: d.paidBy,
    shares: sharesFromMap(d.shares), spentOn: d.spentOn || '', deleted: !!d.deleted,
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : null,
  };
}

export function toSettlement(id, d) {
  return { id, fromUser: d.fromUser, toUser: d.toUser, amountFils: d.amountFils, deleted: !!d.deleted, createdAt: typeof d.createdAt === 'number' ? d.createdAt : null };
}

export const activeOnly = (list) => list.filter((x) => !x.deleted);

// Newest first by date spent, then by last update.
export function sortExpenses(list) {
  return [...list].sort((a, b) => (b.spentOn + String(b.updatedAt || 0).padStart(16, '0'))
    .localeCompare(a.spentOn + String(a.updatedAt || 0).padStart(16, '0')));
}

// Shapes ledger.js expects.
export function toLedgerExpense(e) {
  return { id: e.id, title: e.description, paidBy: e.paidBy, amount: e.amountFils, shares: e.shares };
}
export function toLedgerSettlement(s) {
  return { id: s.id, fromUser: s.fromUser, toUser: s.toUser, amount: s.amountFils };
}

// What history stores for before/after: the business fields, shares as a map.
export function expenseSnapshot(e) {
  if (!e) return null;
  return { description: e.description, amountFils: e.amountFils, paidBy: e.paidBy, spentOn: e.spentOn, shares: sharesToMap(e.shares) };
}

// History entry body (api adds expenseId, changedBy, changedAt).
export function historyEntry(action, before, after) {
  return { action, before: expenseSnapshot(before), after: expenseSnapshot(after) };
}

// Expense doc fields written by api.saveExpense (api adds updatedAt: serverTimestamp()).
export function expenseDoc(e, uid, historyId, deleted) {
  return {
    description: e.description, amountFils: e.amountFils, paidBy: e.paidBy, shares: sharesToMap(e.shares),
    spentOn: e.spentOn, updatedBy: uid, historyId, deleted: !!deleted,
  };
}

// Random invite token: 32 hex-ish chars from the given crypto-like source.
export function randomToken(cryptoLike, len = 32) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = cryptoLike.getRandomValues(new Uint8Array(len));
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// Net for one user in one group; positive = they are owed.
export function userNet(userId, expenses, settlements) {
  return netBalances(expenses, settlements).get(userId) || 0;
}

export function totalNet(nets) {
  return nets.reduce((a, b) => a + b, 0);
}
