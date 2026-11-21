import { listGroups, listExpenses, listShares, listSettlements, createGroup } from '../api.js';
import { formatAed } from '../ledger.js';
import { toLedgerExpense, toLedgerSettlement, userNet, totalNet } from '../routes.js';
import { h } from '../dom.js';

async function groupNet(uid, gid) {
  const [exps, sets] = await Promise.all([listExpenses(gid), listSettlements(gid)]);
  const shares = await listShares(exps.map((e) => e.id));
  const ex = exps.map((e) => toLedgerExpense(e, shares.filter((s) => s.expense_id === e.id)));
  return userNet(uid, ex, sets.map(toLedgerSettlement));
}

const netLabel = (n) => (n > 0 ? `you are owed ${formatAed(n)}` : n < 0 ? `you owe ${formatAed(-n)}` : 'settled up');
const netClass = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'muted');

export async function renderHome(root, user, onError) {
  root.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  const groups = await listGroups();
  const nets = await Promise.all(groups.map((g) => groupNet(user.id, g.id)));
  const total = totalNet(nets);
  const nameIn = h('input', { type: 'text', placeholder: 'New group name', 'aria-label': 'Group name' });
  root.replaceChildren(
    h('div', { class: 'card total' }, h('span', { class: 'muted' }, 'Across all groups'),
      h('strong', { class: netClass(total) }, netLabel(total))),
    groups.length ? h('ul', { class: 'list' }, groups.map((g, i) =>
      h('li', {}, h('a', { class: 'row', href: `#/group/${g.id}` },
        h('span', {}, g.name), h('span', { class: netClass(nets[i]) }, netLabel(nets[i])))))) :
      h('p', { class: 'muted' }, 'No groups yet. Create one or open an invite link.'),
    h('div', { class: 'form' }, nameIn,
      h('button', { class: 'btn primary', onclick: async () => {
        const n = nameIn.value.trim();
        if (!n) return;
        try { location.hash = `#/group/${await createGroup(n)}`; } catch (e) { onError(e); }
      } }, 'New group')),
  );
}
