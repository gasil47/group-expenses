import { h } from '../dom.js';
import { listExpenses, listShares, listSettlements, recordPayment } from '../api.js';
import { netBalances, simplifyDebts, breakdown, parseAed, formatAed } from '../ledger.js';
import { toLedgerExpense, toLedgerSettlement } from '../routes.js';
import { paymentText, netText } from '../expense-logic.js';

export async function render(root, ctx) {
  const { user, group, members } = ctx;
  const nameOf = (id) => (members.find((m) => m.id === id) || {}).name || 'Member';
  const rerender = () => render(root, ctx);
  const onError = (e) => root.prepend(h('p', { class: 'neg', role: 'alert' }, e.message || String(e)));

  const [expRows, setRows] = await Promise.all([listExpenses(group.id), listSettlements(group.id)]);
  const shareRows = await listShares(expRows.map((e) => e.id));
  const expenses = expRows.map((r) => ({ ...toLedgerExpense(r, shareRows.filter((s) => s.expense_id === r.id)), id: r.id, title: r.description }));
  const settlements = setRows.map((r) => ({ ...toLedgerSettlement(r), id: r.id }));
  const nets = netBalances(expenses, settlements);
  const payments = simplifyDebts(nets);

  const detail = h('div', {});
  const showBreakdown = (uid) => {
    const items = breakdown(uid, expenses, settlements).map((i) => ({
      ...i, label: i.kind === 'payment' ? i.label.replace(/Paid (\S+)|Received from (\S+)/, (m, a, b) => (a ? `Paid ${nameOf(a)}` : `Received from ${nameOf(b)}`)) : i.label,
    }));
    detail.replaceChildren(h('div', { class: 'card' },
      h('h2', {}, `${nameOf(uid)}: how it adds up`),
      items.length ? h('ul', { class: 'list' }, items.map((i) => h('li', { class: 'row' },
        h('span', {}, i.label || 'Expense'),
        h('span', { class: i.deltaFils >= 0 ? 'pos' : 'neg' }, `${i.deltaFils >= 0 ? '+' : ''}${formatAed(i.deltaFils)}`))))
        : h('p', { class: 'muted' }, 'Nothing yet.'),
      h('button', { class: 'btn', onclick: () => detail.replaceChildren() }, 'Close')));
  };

  let paying = false;
  const pay = async (to, fils) => {
    if (paying) return;
    paying = true;
    root.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try { await recordPayment(group.id, to, fils); await rerender(); } catch (e) {
      paying = false;
      root.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      onError(e);
    }
  };

  const people = h('ul', { class: 'list' }, members.map((m) => {
    const t = netText(nets.get(m.id) || 0);
    return h('li', {}, h('button', { class: 'row', onclick: () => showBreakdown(m.id) },
      h('span', {}, m.id === user.id ? `${m.name} (you)` : m.name), h('span', { class: t.cls }, t.text)));
  }));

  const suggested = payments.length ? h('ul', { class: 'list' }, payments.map((p) => h('li', { class: 'card pay' },
    h('button', { class: 'linklike', onclick: () => showBreakdown(p.to) }, paymentText(p, nameOf)),
    p.from === user.id
      ? h('button', { class: 'btn primary', onclick: () => pay(p.to, p.fils) }, `Record payment of ${formatAed(p.fils)}`)
      : h('span', { class: 'muted small' }, `Only ${nameOf(p.from)} can record this payment.`))))
    : h('p', { class: 'muted' }, 'Everyone is settled up.');

  // Free-form payment: me -> chosen member.
  const others = members.filter((m) => m.id !== user.id);
  const who = h('select', { class: 'sel', 'aria-label': 'Pay to' }, others.map((m) => h('option', { value: m.id }, m.name)));
  const amt = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Payment amount in AED' });
  const err = h('p', { class: 'neg small', role: 'alert' });
  const free = others.length ? h('form', { class: 'card', novalidate: '', onsubmit: (e) => {
    e.preventDefault();
    const fils = parseAed(amt.value);
    if (!fils) { err.textContent = 'Enter an amount greater than 0'; return; }
    err.textContent = '';
    pay(who.value, fils);
  } }, h('h2', {}, 'Record a payment'), h('p', { class: 'muted small' }, 'Money you paid to someone else.'),
    who, amt, err, h('button', { type: 'submit', class: 'btn' }, 'Record payment')) : null;

  root.replaceChildren(
    h('h2', {}, 'Balances'), people,
    h('h2', {}, 'Suggested payments'), suggested,
    detail, free);
}
