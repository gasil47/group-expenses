import { h } from '../dom.js';
import { recordPayment } from '../api.js';
import { netBalances, simplifyDebts, breakdown, parseAed, formatAed } from '../ledger.js';
import { toLedgerExpense, toLedgerSettlement } from '../routes.js';
import { paymentText, netText } from '../expense-logic.js';

// Pure render of the current state; group.js calls it again on every live update.
export function render(root, ctx) {
  const { user, group, members, ui, onError } = ctx;
  const nameOf = (id) => (members.find((m) => m.id === id) || {}).name || 'Member';
  const expenses = ctx.expenses.map(toLedgerExpense);
  const settlements = ctx.settlements.map(toLedgerSettlement);
  const nets = netBalances(expenses, settlements);
  const payments = simplifyDebts(nets);

  const detail = h('div', {});
  const drawDetail = () => {
    const uid = ui.detail;
    if (!uid) { detail.replaceChildren(); return; }
    const items = breakdown(uid, expenses, settlements).map((i) => ({
      ...i, label: i.kind === 'payment' ? i.label.replace(/Paid (\S+)|Received from (\S+)/, (m, a, b) => (a ? `Paid ${nameOf(a)}` : `Received from ${nameOf(b)}`)) : i.label,
    }));
    detail.replaceChildren(h('div', { class: 'card' },
      h('h2', {}, `${nameOf(uid)}: how it adds up`),
      items.length ? h('ul', { class: 'list' }, items.map((i) => h('li', { class: 'row' },
        h('span', {}, i.label || 'Expense'),
        h('span', { class: i.deltaFils >= 0 ? 'pos' : 'neg' }, `${i.deltaFils >= 0 ? '+' : ''}${formatAed(i.deltaFils)}`))))
        : h('p', { class: 'muted' }, 'Nothing yet.'),
      h('button', { class: 'btn', onclick: () => { ui.detail = null; drawDetail(); } }, 'Close')));
  };
  const showBreakdown = (uid) => { ui.detail = uid; drawDetail(); };

  // The guard lives in ui so a live re-render mid-save can't allow a double submit.
  const setBusy = (b) => root.querySelectorAll('button').forEach((x) => { x.disabled = b; });
  const pay = async (from, to, fils) => {
    if (ui.paying) return;
    ui.paying = true;
    setBusy(true);
    try { await recordPayment(group.id, from, to, fils); ui.payAmount = ''; } catch (e) { onError(e); } finally {
      ui.paying = false;
      setBusy(false); // the live listener re-renders with the new payment
    }
  };
  if (ui.paying) queueMicrotask(() => setBusy(true));

  const people = h('ul', { class: 'list' }, members.map((m) => {
    const t = netText(nets.get(m.id) || 0);
    return h('li', {}, h('button', { class: 'row', onclick: () => showBreakdown(m.id) },
      h('span', {}, m.id === user.id ? `${m.name} (you)` : m.name), h('span', { class: t.cls }, t.text)));
  }));

  // Either side of a suggested payment can record it.
  const suggested = payments.length ? h('ul', { class: 'list' }, payments.map((p) => h('li', { class: 'card pay' },
    h('button', { class: 'linklike', onclick: () => showBreakdown(p.to) }, paymentText(p, nameOf)),
    p.from === user.id || p.to === user.id
      ? h('button', { class: 'btn primary', onclick: () => pay(p.from, p.to, p.fils) }, `Record payment of ${formatAed(p.fils)}`)
      : h('span', { class: 'muted small' }, `Only ${nameOf(p.from)} or ${nameOf(p.to)} can record this payment.`))))
    : h('p', { class: 'muted' }, 'Everyone is settled up.');

  // Free-form payment: me -> chosen member.
  const others = members.filter((m) => m.id !== user.id);
  const who = h('select', { class: 'sel', 'aria-label': 'Pay to' }, others.map((m) => h('option', { value: m.id, selected: m.id === ui.payTo }, m.name)));
  const amt = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Payment amount in AED', value: ui.payAmount });
  who.addEventListener('change', () => { ui.payTo = who.value; });
  amt.addEventListener('input', () => { ui.payAmount = amt.value; });
  const err = h('p', { class: 'neg small', role: 'alert' });
  const free = others.length ? h('form', { class: 'card', novalidate: '', onsubmit: (e) => {
    e.preventDefault();
    const fils = parseAed(amt.value);
    if (!fils) { err.textContent = 'Enter an amount greater than 0'; return; }
    err.textContent = '';
    pay(user.id, who.value, fils);
  } }, h('h2', {}, 'Record a payment'), h('p', { class: 'muted small' }, 'Money you paid to someone else.'),
    who, amt, err, h('button', { type: 'submit', class: 'btn' }, 'Record payment')) : null;

  drawDetail();
  root.replaceChildren(
    h('h2', {}, 'Balances'), people,
    h('h2', {}, 'Suggested payments'), suggested,
    detail, free);
}
