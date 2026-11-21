import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { isConfigured } from './routes.js';

export class ServerAsleepError extends Error {
  constructor() { super('Server asleep — ask the owner to resume it'); this.name = 'ServerAsleepError'; }
}

export const configured = isConfigured(SUPABASE_URL, SUPABASE_ANON_KEY);

let client = null;
export async function getClient() {
  if (!configured) throw new Error('not configured');
  if (!client) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, detectSessionInUrl: true },
    });
  }
  return client;
}

function isNetworkError(err) {
  const m = String((err && (err.message || err)) || '');
  return err instanceof TypeError || /failed to fetch|network|load failed|timeout/i.test(m);
}

// Run a supabase call; throw ServerAsleepError on network failure, Error on API error.
async function run(fn) {
  let res;
  try { res = await fn(await getClient()); } catch (e) {
    if (isNetworkError(e)) throw new ServerAsleepError();
    throw e;
  }
  if (res.error) {
    if (isNetworkError(res.error) || res.status === 0 || res.status >= 502) throw new ServerAsleepError();
    throw new Error(res.error.message);
  }
  return res.data;
}

export const getSession = async () => (await (await getClient()).auth.getSession()).data.session;
export const signInGoogle = () => run((c) => c.auth.signInWithOAuth({
  provider: 'google', options: { redirectTo: location.href.split('#')[0] } }));
export const signInEmail = (email) => run((c) => c.auth.signInWithOtp({
  email, options: { emailRedirectTo: location.href.split('#')[0] } }));
// Note: the redirect URL carries no #/join hash (implicit-flow tokens use the hash); pending joins live in localStorage.
export const signOut = async () => (await getClient()).auth.signOut();

export const getProfile = (uid) => run((c) => c.from('profiles').select('display_name').eq('id', uid).maybeSingle());
export const saveProfile = (uid, name) => run((c) => c.from('profiles').upsert({ id: uid, display_name: name }));

export const listGroups = () => run((c) => c.from('groups').select('id,name,invite_token').order('created_at'));
export const getGroup = (id) => run((c) => c.from('groups').select('id,name,invite_token').eq('id', id).maybeSingle());
export const listMembers = async (gid) => {
  const rows = await run((c) => c.from('group_members').select('user_id').eq('group_id', gid));
  const ids = rows.map((r) => r.user_id);
  const profs = ids.length ? await run((c) => c.from('profiles').select('id,display_name').in('id', ids)) : [];
  const names = new Map(profs.map((p) => [p.id, p.display_name]));
  return ids.map((id) => ({ id, name: names.get(id) || 'Member' }));
};
export const listExpenses = (gid) => run((c) => c.from('expenses').select('*').eq('group_id', gid).order('spent_on', { ascending: false }));
export const groupHistory = (grp) => run((c) => c.rpc('group_history', { grp }));
export const listShares = (eids) => eids.length
  ? run((c) => c.from('expense_shares').select('*').in('expense_id', eids)) : Promise.resolve([]);
export const listSettlements = (gid) => run((c) => c.from('settlements').select('*').eq('group_id', gid));

export const createGroup = (name) => run((c) => c.rpc('create_group', { name }));
export const joinGroup = (token) => run((c) => c.rpc('join_group', { token }));
export const saveExpense = (expense, shares) => run((c) => c.rpc('save_expense', { expense, shares }));
export const deleteExpense = (id) => run((c) => c.rpc('delete_expense', { id }));
export const recordPayment = (grp, to_user, amount) => run((c) => c.rpc('record_payment', { grp, to_user, amount }));
