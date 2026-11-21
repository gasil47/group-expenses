import { h } from '../dom.js';
import { listHistory } from '../api.js';
import { formatAed } from '../ledger.js';
import { youLine, describeChange } from '../expense-logic.js';
import { sortExpenses } from '../routes.js';
import { openExpenseForm } from './expense-form.js';

// Pure render of the current state; group.js calls it again on every live update.
export function render(root, ctx) {
  const { user, group, members, expenses, ui, onError } = ctx;
  const nameOf = (id) => (members.find((m) => m.id === id) || {}).name || 'Member';
  const open = (expense) => openExpenseForm({ user, group, members, expense, onError });

  const list = expenses.length ? h('ul', { class: 'list' }, sortExpenses(expenses).map((e) => {
    const you = youLine(user.id, e);
    return h('li', {}, h('button', { class: 'row exp-row', onclick: () => open(e) },
      h('span', { class: 'exp-main' },
        h('strong', {}, e.description || 'Expense'),
        h('span', { class: 'muted small' }, `${e.spentOn} · paid by ${e.paidBy === user.id ? 'you' : nameOf(e.paidBy)}`)),
      h('span', { class: 'exp-amt' },
        h('strong', {}, formatAed(e.amountFils)),
        h('span', { class: `small ${you.kind === 'owe' ? 'neg' : you.kind === 'lent' ? 'pos' : 'muted'}` }, you.text))));
  })) : h('p', { class: 'muted' }, 'No expenses yet. Tap + Add to create the first one.');

  const historyBox = h('div', {});
  const drawHistory = () => {
    const data = ui.history;
    if (!data) { historyBox.replaceChildren(); return; }
    const titleOf = (id) => {
      const cur = expenses.find((e) => e.id === id);
      if (cur) return cur.description || 'Expense';
      const en = data.find((x) => x.expenseId === id && x.before);
      return (en && en.before.description) || 'Expense';
    };
    historyBox.replaceChildren(data.length ? h('ul', { class: 'list' }, data.map((en) => {
      const d = describeChange(en, nameOf);
      return h('li', { class: 'card hist' },
        h('strong', {}, `${d.who} · ${titleOf(en.expenseId)}`),
        h('span', { class: 'muted small' }, en.changedAt ? new Date(en.changedAt).toLocaleString() : 'just now'),
        d.lines.map((l) => h('div', { class: 'small' }, l)));
    })) : h('p', { class: 'muted' }, 'No history yet.'));
  };
  const histBtn = h('button', { class: 'btn', onclick: async () => {
    if (ui.history) { ui.history = null; drawHistory(); return; }
    try { ui.history = await listHistory(group.id); drawHistory(); } catch (e) { onError(e); }
  } }, 'History');
  drawHistory();

  root.replaceChildren(list, histBtn, historyBox,
    h('button', { class: 'fab', 'aria-label': 'Add expense', onclick: () => open(null) }, '+ Add'));
}
