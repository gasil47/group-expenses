import { getGroup, listMembers, joinGroup } from '../api.js';
import { inviteUrl, whatsappUrl } from '../routes.js';
import { h } from '../dom.js';

export async function renderJoin(root, token) {
  root.replaceChildren(h('p', { class: 'muted' }, 'Joining group…'));
  const gid = await joinGroup(token);
  sessionStorage.removeItem('pendingJoin');
  location.replace(`#/group/${gid}`);
}

// Tab modules (expenses.js, balances.js) come from T-004; a missing one shows "coming soon".
async function loadTab(name) {
  try { return await import(`./${name}.js`); } catch { return null; }
}

export async function renderGroup(root, user, gid, onError) {
  root.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  const [group, members] = await Promise.all([getGroup(gid), listMembers(gid)]);
  if (!group) { root.replaceChildren(h('p', {}, 'Group not found.'), h('a', { href: '#/' }, 'Back')); return; }
  const url = inviteUrl(location.href, group.invite_token);
  const toast = h('span', { class: 'muted', role: 'status' });
  const body = h('div', { class: 'tab-body' });
  const tabs = {};
  const show = async (name) => {
    for (const [k, b] of Object.entries(tabs)) b.setAttribute('aria-selected', String(k === name));
    body.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
    const mod = await loadTab(name);
    if (!mod || typeof mod.render !== 'function') {
      body.replaceChildren(h('p', { class: 'muted' }, 'Coming soon.'));
      return;
    }
    try { await mod.render(body, { user, group, members }); } catch (e) { onError(e); }
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
