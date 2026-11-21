import { getGroup, listMembers, joinGroup } from '../api.js';
import { inviteUrl, whatsappUrl } from '../routes.js';
import { h } from '../dom.js';

export async function renderJoin(root, token) {
  root.replaceChildren(h('p', { class: 'muted' }, 'Joining group…'));
  // Clear first so a bad or expired token errors once instead of on every route.
  localStorage.removeItem('pendingJoin');
  const gid = await joinGroup(token);
  location.replace(`#/group/${gid}`);
}

const TABS = { expenses: () => import('./expenses.js'), balances: () => import('./balances.js') };

export async function renderGroup(root, user, gid, onError) {
  root.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  const [group, members] = await Promise.all([getGroup(gid), listMembers(gid)]);
  if (!group) { root.replaceChildren(h('p', {}, 'Group not found.'), h('a', { href: '#/' }, 'Back')); return; }
  const url = inviteUrl(location.href, group.invite_token);
  const toast = h('span', { class: 'muted', role: 'status' });
  const body = h('div', { class: 'tab-body' });
  const tabs = {};
  let seq = 0;
  const show = async (name) => {
    const mine = ++seq;
    for (const [k, b] of Object.entries(tabs)) b.setAttribute('aria-selected', String(k === name));
    // Each call renders into its own container; a stale one ends up detached and harmless.
    const stage = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
    body.replaceChildren(stage);
    try {
      const mod = await TABS[name]();
      if (mine === seq) await mod.render(stage, { user, group, members });
    } catch (e) { if (mine === seq) onError(e); }
  };
  for (const [k, label] of [['expenses', 'Expenses'], ['balances', 'Balances']]) {
    tabs[k] = h('button', { class: 'tab', role: 'tab', onclick: () => show(k) }, label);
  }
  root.replaceChildren(
    h('a', { href: '#/', class: 'back' }, '‹ Groups'),
    h('h1', {}, group.name),
    h('p', { class: 'muted' }, members.map((m) => m.name).join(', ')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: async () => {
        try { await navigator.clipboard.writeText(url); toast.textContent = 'Invite link copied.'; }
        catch { prompt('Copy invite link', url); }
      } }, 'Invite'),
      h('a', { class: 'btn', href: whatsappUrl(group.name, url), target: '_blank', rel: 'noopener' }, 'Share on WhatsApp'),
      toast),
    h('div', { class: 'tabs', role: 'tablist' }, tabs.expenses, tabs.balances),
    body,
  );
  show('expenses');
}
