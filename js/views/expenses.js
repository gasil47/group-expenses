import { h } from '../dom.js';
import { getClient, listExpenses, listShares } from '../api.js';
import { formatAed } from '../ledger.js';
import { youLine, describeChange } from '../expense-logic.js';
import { openExpenseForm } from './expense-form.js';

export async function render(root, ctx) {
  const { user, group, members } = ctx;
  const nameOf = (id) => (members.find((m) => m.id === id) || {}).name || 'Member';
  const rerender = () => render(root, ctx);
  const onError = (e) => root.prepend(h('p', { class: 'neg', role: 'alert' }, e.message || String(e)));

  const expenses = await listExpenses(group.id);
  const shares = await listShares(expenses.map((e) => e.id));
  const sharesOf = (id) => shares.filter((s) => s.expense_id === id);
  const open = (expense) => openExpenseForm({ user, group, members, expense, shareRows: expense ? sharesOf(expense.id) : [], onSaved: rerender, onError });

  const sorted = [...expenses].sort((a, b) => (b.spent_on + b.created_at).localeCompare(a.spent_on + a.created_at));
  const list = sorted.length ? h('ul', { class: 'list' }, sorted.map((e) => {
    const you = youLine(user.id, e, sharesOf(e.id));
    return h('li', {}, h('button', { class: 'row exp-row', onclick: () => open(e) },
      h('span', { class: 'exp-main' },
        h('strong', {}, e.description || 'Expense'),
        h('span', { class: 'muted small' }, `${e.spent_on} · paid by ${e.paid_by === user.id ? 'you' : nameOf(e.paid_by)}`)),
      h('span', { class: 'exp-amt' },
        h('strong', {}, formatAed(e.amount_fils)),
        h('span', { class: `small ${you.kind === 'owe' ? 'neg' : you.kind === 'lent' ? 'pos' : 'muted'}` }, you.text))));
  })) : h('p', { class: 'muted' }, 'No expenses yet. Tap + Add to create the first one.');

  const historyBox = h('div', {});
  const histBtn = h('button', { class: 'btn', onclick: async () => {
    if (historyBox.childNodes.length) { historyBox.replaceChildren(); return; }
    try {
      const c = await getClient();
      const ids = expenses.map((e) => e.id);
      // History of deleted expenses is not readable under RLS (expenses_select hides them), so show what is.
      const { data, error } = ids.length
        ? await c.from('expense_history').select('*').in('expense_id', ids).order('changed_at', { ascending: false })
        : { data: [] };
      if (error) throw new Error(error.message);
      const titleOf = (id) => (expenses.find((e) => e.id === id) || {}).description || 'Expense';
      historyBox.replaceChildren(data.length ? h('ul', { class: 'list' }, data.map((en) => {
        const d = describeChange(en, nameOf);
        return h('li', { class: 'card hist' },
          h('strong', {}, `${d.who} · ${titleOf(en.expense_id)}`),
          h('span', { class: 'muted small' }, new Date(en.changed_at).toLocaleString()),
          d.lines.map((l) => h('div', { class: 'small' }, l)));
      })) : h('p', { class: 'muted' }, 'No history yet.'));
    } catch (e) { onError(e); }
  } }, 'History');

  root.replaceChildren(list, histBtn, historyBox,
    h('button', { class: 'fab', 'aria-label': 'Add expense', onclick: () => open(null) }, '+ Add'));
}
