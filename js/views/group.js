import { watchGroup, watchExpenses, watchSettlements, joinGroup } from '../api.js';
import { inviteUrl, whatsappUrl, activeOnly } from '../routes.js';
import { h } from '../dom.js';

export async function renderJoin(root, user, token) {
  root.replaceChildren(h('p', { class: 'muted' }, 'Joining group…'));
  // Keep pendingJoin through transient failures (offline, etc.) so a retry still joins;
  // drop it on success or a definitive answer (bad invite, rules rejected the token).
  let gid;
  try {
    gid = await joinGroup(token, user.name);
  } catch (e) {
    if (e && (e.code === 'invalid-invite' || e.code === 'permission-denied')) localStorage.removeItem('pendingJoin');
    throw e;
  }
  localStorage.removeItem('pendingJoin');
  location.replace(`#/group/${gid}`);
}

const TABS = { expenses: () => import('./expenses.js'), balances: () => import('./balances.js') };

// Owns the three live listeners of a group. Returns a cleanup that drops them.
export async function renderGroup(root, user, gid, onError) {
  root.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  const st = { group: null, expenses: null, settlements: null, missing: false };
  const ui = { history: null, detail: null, payAmount: '', payTo: '' }; // survives live re-renders
  let gone = false;
  let current = 'expenses';
  let seq = 0;
  let built = false;
  const body = h('div', { class: 'tab-body' });
  const tabs = {};
  const title = h('h1', {});
  const memberLine = h('p', { class: 'muted' });
  const toast = h('span', { class: 'muted', role: 'status' });
  const invite = { url: '' };

  const ctx = () => ({
    user, group: st.group, members: st.group.members, ui,
    expenses: activeOnly(st.expenses), settlements: activeOnly(st.settlements),
    onError: (e) => body.prepend(h('p', { class: 'neg', role: 'alert' }, e.message || String(e))),
  });

  const show = async (name) => {
    current = name;
    const mine = ++seq;
    for (const [k, b] of Object.entries(tabs)) b.setAttribute('aria-selected', String(k === name));
    if (!st.group || !st.expenses || !st.settlements) return;
    try {
      const mod = await TABS[name]();
      if (mine !== seq || gone) return; // stale: a newer render or a route change won
      const stage = h('div', {});
      mod.render(stage, ctx());
      body.replaceChildren(stage);
    } catch (e) { if (mine === seq && !gone) onError(e); }
  };

  const build = () => {
    built = true;
    for (const [k, label] of [['expenses', 'Expenses'], ['balances', 'Balances']]) {
      tabs[k] = h('button', { class: 'tab', role: 'tab', onclick: () => show(k) }, label);
    }
    root.replaceChildren(
      h('a', { href: '#/', class: 'back' }, '‹ Groups'),
      title, memberLine,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: async () => {
          try { await navigator.clipboard.writeText(invite.url); toast.textContent = 'Invite link copied.'; }
          catch { prompt('Copy invite link', invite.url); }
        } }, 'Invite'),
        h('a', { class: 'btn', id: 'wa', href: '#', target: '_blank', rel: 'noopener' }, 'Share on WhatsApp'),
        toast),
      h('div', { class: 'tabs', role: 'tablist' }, tabs.expenses, tabs.balances),
      body,
    );
  };

  const update = () => {
    if (gone) return;
    if (st.missing) { root.replaceChildren(h('p', {}, 'Group not found.'), h('a', { href: '#/' }, 'Back')); return; }
    if (!st.group || !st.expenses || !st.settlements) return;
    if (!built) build();
    title.textContent = st.group.name;
    memberLine.textContent = st.group.members.map((m) => m.name).join(', ');
    invite.url = inviteUrl(location.href, st.group.inviteToken);
    const wa = root.querySelector('#wa');
    if (wa) wa.setAttribute('href', whatsappUrl(st.group.name, invite.url));
    show(current);
  };

  const notFound = () => { st.missing = true; update(); };
  const offs = [
    watchGroup(gid, (g) => { if (!g) return notFound(); st.group = g; update(); }, notFound),
    watchExpenses(gid, (x) => { st.expenses = x; update(); }, onError),
    watchSettlements(gid, (x) => { st.settlements = x; update(); }, onError),
  ];
  return () => { gone = true; seq++; offs.forEach((f) => f()); };
}
