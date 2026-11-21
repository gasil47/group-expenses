// Pure write payloads. api.js sends exactly these, and test/rules.spec.mjs imports them,
// so the Firestore rules are tested against the real app shapes. `ts` is serverTimestamp().
import { expenseDoc, historyEntry } from './routes.js';

export const groupPayload = (name, uid, myName, token) => (
  { name, createdBy: uid, memberIds: [uid], memberNames: { [uid]: myName }, inviteToken: token });

export const invitePayload = (groupId) => ({ groupId });

// arrayUnion is F.arrayUnion (injected so this module stays SDK-free).
export const joinPayload = (uid, myName, token, arrayUnion) => (
  { memberIds: arrayUnion(uid), [`memberNames.${uid}`]: myName, joinToken: token });

export const expensePayload = (expense, uid, historyId, deleted, ts) => (
  { ...expenseDoc(expense, uid, historyId, deleted), updatedAt: ts });

export function historyPayload(expenseId, action, before, after, uid, ts) {
  const entry = historyEntry(action, before, after);
  return { expenseId, action: entry.action, changedBy: uid, changedAt: ts, before: entry.before, after: entry.after };
}

export const settlementPayload = (fromUser, toUser, amountFils, uid, ts) => (
  { fromUser, toUser, amountFils, createdBy: uid, createdAt: ts, deleted: false });

export const profilePayload = (name) => ({ displayName: name });
