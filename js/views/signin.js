import { signInGoogle, signInEmail, signUpEmail, resetPassword, saveProfile, friendlyAuthError } from '../api.js';
import { h } from '../dom.js';

export function renderSignIn(root, onError) {
  let creating = false;
  const msg = h('p', { class: 'muted', role: 'status' });
  const name = h('input', { type: 'text', placeholder: 'Your name', autocomplete: 'name', 'aria-label': 'Display name' });
  const email = h('input', { type: 'email', placeholder: 'you@example.com', autocomplete: 'email', 'aria-label': 'Email' });
  const pw = h('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password', 'aria-label': 'Password' });
  const nameField = h('div', { hidden: '' }, name);
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Sign in');
  const toggle = h('button', { class: 'linklike', type: 'button' }, 'New here? Create account');
  const forgot = h('button', { class: 'linklike', type: 'button' }, 'Forgot password?');
  let busy = false;
  const run = async (fn) => {
    if (busy) return;
    busy = true; submit.disabled = true; msg.textContent = '';
    try { await fn(); } catch (e) { onError(friendlyAuthError(e)); } finally { busy = false; submit.disabled = false; }
  };
  const redraw = () => {
    nameField.hidden = !creating;
    pw.setAttribute('autocomplete', creating ? 'new-password' : 'current-password');
    submit.textContent = creating ? 'Create account' : 'Sign in';
    toggle.textContent = creating ? 'Have an account? Sign in' : 'New here? Create account';
    forgot.hidden = creating;
  };
  toggle.addEventListener('click', () => { creating = !creating; msg.textContent = ''; redraw(); });
  forgot.addEventListener('click', () => run(async () => {
    if (!email.value.includes('@')) { msg.textContent = 'Enter your email above first.'; return; }
    await resetPassword(email.value.trim());
    msg.textContent = 'If that email has an account, a reset link is on its way.';
  }));
  const form = h('form', { class: 'form', novalidate: '', onsubmit: (e) => {
    e.preventDefault();
    run(async () => {
      const em = email.value.trim();
      if (!em.includes('@')) { msg.textContent = 'Enter a valid email.'; return; }
      if (!pw.value) { msg.textContent = 'Enter a password.'; return; }
      if (creating) {
        if (!name.value.trim()) { msg.textContent = 'Enter your name.'; return; }
        await signUpEmail(em, pw.value, name.value.trim());
      } else await signInEmail(em, pw.value);
    });
  } }, nameField, email, pw, submit, toggle, forgot, msg);
  root.replaceChildren(
    h('h1', {}, 'Group expenses'),
    h('p', { class: 'muted' }, 'Split costs with friends. Sign in to continue.'),
    h('button', { class: 'btn primary', onclick: () => run(signInGoogle) }, 'Continue with Google'),
    h('div', { class: 'or' }, 'or'),
    form,
  );
  redraw();
}

// Asked once (Google users; email sign-up collects the name directly).
export function renderNamePrompt(root, uid, suggested, onDone, onError) {
  const name = h('input', { type: 'text', placeholder: 'Your name', autocomplete: 'name', 'aria-label': 'Display name', value: suggested || '' });
  let busy = false;
  root.replaceChildren(
    h('h1', {}, 'What should friends call you?'),
    name,
    h('button', { class: 'btn primary', onclick: async (ev) => {
      const v = name.value.trim();
      if (!v || busy) return;
      busy = true; ev.currentTarget.disabled = true;
      try { await saveProfile(uid, v); onDone(v); } catch (e) { busy = false; ev.currentTarget.disabled = false; onError(e); }
    } }, 'Continue'),
  );
}
