import { h } from '../dom.js';
import { saveExpense, deleteExpense } from '../api.js';
import { MODES, newRows, initialFormFromShares, evaluateForm, buildPayload } from '../expense-logic.js';
import { formatAed } from '../ledger.js';

const HINT = { equal: '', exact: 'Amount each person owes (AED)', shares: 'Shares per person (e.g. 2, 1, 1)', percent: 'Percent per person (must total 100)' };

// Opens the add/edit sheet. expense is a mapped expense when editing; live listeners refresh the lists.
export function openExpenseForm({ user, group, members, expense, onError }) {
  const editing = !!expense;
  const init = editing ? initialFormFromShares(members, expense.shares, expense.amountFils) : null;
  const form = {
    amountText: editing ? formatAed(expense.amountFils).replace(' AED', '') : '',
    description: editing ? expense.description : '',
    paidBy: editing ? expense.paidBy : user.id,
    mode: editing ? init.mode : 'equal',
    rows: editing ? init.rows : newRows(members),
  };
  const nameOf = (id) => (members.find((m) => m.id === id) || {}).name || 'Member';

  const overlay = h('div', { class: 'sheet-backdrop' });
  const sheet = h('form', { class: 'sheet', role: 'dialog', 'aria-label': editing ? 'Edit expense' : 'Add expense', novalidate: '' });
  overlay.append(sheet);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const amount = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Amount in AED', value: form.amountText, autocomplete: 'off' });
  const desc = h('input', { type: 'text', placeholder: 'What was it for?', 'aria-label': 'Description', value: form.description, maxlength: '120' });
  const paid = h('select', { 'aria-label': 'Paid by', class: 'sel' },
    members.map((m) => h('option', { value: m.id, selected: m.id === form.paidBy }, m.id === user.id ? `${m.name} (me)` : m.name)));
  const modeBar = h('div', { class: 'seg', role: 'tablist' });
  const rowsBox = h('div', { class: 'split-rows' });
  const hint = h('p', { class: 'muted small' });
  const remaining = h('p', { class: 'remaining', role: 'status' });
  const error = h('p', { class: 'neg small', role: 'alert' });
  const save = h('button', { type: 'submit', class: 'btn primary' }, editing ? 'Save changes' : 'Save expense');
  const busy = (b) => { save.disabled = b; };

  const refresh = () => {
    const r = evaluateForm(form);
    remaining.textContent = r.remaining || '';
    error.textContent = r.ok ? '' : (r.error || '');
    save.disabled = !r.ok;
    return r;
  };

  const drawRows = () => {
    hint.textContent = HINT[form.mode];
    rowsBox.replaceChildren(...form.rows.map((row) => {
      const name = nameOf(row.userId);
      if (form.mode === 'equal') {
        const cb = h('input', { type: 'checkbox', checked: row.on, 'aria-label': name, onchange: (e) => { row.on = e.target.checked; refresh(); } });
        return h('label', { class: 'split-row' }, cb, h('span', {}, name));
      }
      const inp = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', 'aria-label': `${name} value`, value: row.text, autocomplete: 'off',
        oninput: (e) => { row.text = e.target.value; refresh(); } });
      return h('label', { class: 'split-row' }, h('span', {}, name), inp);
    }));
    refresh();
  };

  const drawModes = () => {
    modeBar.replaceChildren(...MODES.map(([k, label]) => h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(k === form.mode),
      onclick: () => { form.mode = k; drawModes(); drawRows(); } }, label)));
  };

  amount.addEventListener('input', () => { form.amountText = amount.value; refresh(); });
  desc.addEventListener('input', () => { form.description = desc.value; });
  paid.addEventListener('change', () => { form.paidBy = paid.value; });

  sheet.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = refresh();
    if (!r.ok) return;
    busy(true);
    try {
      const ex = buildPayload(form, editing ? expense.id : null, r, editing ? expense.spentOn : null);
      await saveExpense(group.id, ex, editing ? expense : null);
      close();
    } catch (err) { busy(false); onError(err); }
  });

  let deleting = false;
  const del = editing ? h('button', { type: 'button', class: 'btn danger', onclick: async () => {
    if (deleting || !confirm('Delete this expense? It stays in the history.')) return;
    deleting = true;
    try { await deleteExpense(group.id, expense); close(); } catch (err) { deleting = false; onError(err); }
  } }, 'Delete expense') : null;

  sheet.append(
    h('h2', {}, editing ? 'Edit expense' : 'Add expense'),
    h('label', { class: 'field' }, 'Amount (AED)', amount),
    h('label', { class: 'field' }, 'Description', desc),
    h('label', { class: 'field' }, 'Paid by', paid),
    h('p', { class: 'field-label' }, 'Split'),
    modeBar, hint, rowsBox, remaining, error,
    save, del,
    h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel'),
  );
  drawModes();
  drawRows();
  document.body.append(overlay);
  amount.focus();
}
