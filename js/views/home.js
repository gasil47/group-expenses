import { watchGroups, watchExpenses, watchSettlements, createGroup } from '../api.js';
import { formatAed } from '../ledger.js';
import { toLedgerExpense, toLedgerSettlement, userNet, totalNet, activeOnly } from '../routes.js';
import { h } from '../dom.js';

const netLabel = (n) => (n > 0 ? `you are owed ${formatAed(n)}` : n < 0 ? `you owe ${formatAed(-n)}` : 'settled up');
const netClass = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'muted');

// Live home screen. Returns a cleanup that drops every listener.
export async function renderHome(root, user, onError) {
  let groups = null;                 // null until the first snapshot
  const per = new Map();             // gid -> { exps, sets, off:[fn,fn] }
  let gone = false;

  const nameIn = h('input', { type: 'text', placeholder: 'New group name', 'aria-label': 'Group name' });
  const list = h('div', {});
  const totalBox = h('div', { class: 'card total' });
  const netOf = (gid) => {
    const p = per.get(gid);
    return p && p.exps && p.sets
      ? userNet(user.id, activeOnly(p.exps).map(toLedgerExpense), activeOnly(p.sets).map(toLedgerSettlement)) : null;
  };

  const draw = () => {
    if (gone || !groups) return;
    const nets = groups.map((g) => netOf(g.id));
    const total = totalNet(nets.map((n) => n || 0));
    const loading = nets.some((n) => n === null);
    totalBox.replaceChildren(h('span', { class: 'muted' }, 'Across all groups'),
      h('strong', { class: loading ? 'muted' : netClass(total) }, loading ? '…' : netLabel(total)));
    list.replaceChildren(groups.length ? h('ul', { class: 'list' }, groups.map((g, i) =>
      h('li', {}, h('a', { class: 'row', href: `#/group/${g.id}` },
        h('span', {}, g.name),
        nets[i] === null ? h('span', { class: 'muted' }, '…') : h('span', { class: netClass(nets[i]) }, netLabel(nets[i])))))) :
      h('p', { class: 'muted' }, 'No groups yet. Create one or open an invite link.'));
  };

  const onGroups = (gs) => {
    groups = gs;
    const ids = new Set(gs.map((g) => g.id));
    for (const [gid, p] of per) if (!ids.has(gid)) { p.off.forEach((f) => f()); per.delete(gid); }
    for (const g of gs) {
      if (per.has(g.id)) continue;
      const p = { exps: null, sets: null, off: [] };
      per.set(g.id, p);
      p.off.push(watchExpenses(g.id, (x) => { p.exps = x; draw(); }, onError));
      p.off.push(watchSettlements(g.id, (x) => { p.sets = x; draw(); }, onError));
    }
    draw();
  };

  root.replaceChildren(
    totalBox, list,
    h('div', { class: 'form' }, nameIn,
      h('button', { class: 'btn primary', onclick: async (ev) => {
        const btn = ev.currentTarget;
        const n = nameIn.value.trim();
        if (!n || btn.disabled) return;
        btn.disabled = true;
        try { location.hash = `#/group/${await createGroup(n, user.name)}`; } catch (e) { btn.disabled = false; onError(e); }
      } }, 'New group')),
  );
  list.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  const offGroups = watchGroups(user.id, onGroups, onError);
  return () => {
    gone = true;
    offGroups();
    for (const p of per.values()) p.off.forEach((f) => f());
    per.clear();
  };
}
