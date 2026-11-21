import { signInGoogle, signInEmail, saveProfile } from '../api.js';
import { h } from '../dom.js';

export function renderSignIn(root, onError) {
  const msg = h('p', { class: 'muted', role: 'status' });
  const email = h('input', { type: 'email', placeholder: 'you@example.com', autocomplete: 'email', 'aria-label': 'Email' });
  const guard = (fn) => async () => { try { await fn(); } catch (e) { onError(e); } };
  root.replaceChildren(
    h('h1', {}, 'Group expenses'),
    h('p', { class: 'muted' }, 'Split costs with friends. Sign in to continue.'),
    h('button', { class: 'btn primary', onclick: guard(signInGoogle) }, 'Continue with Google'),
    h('div', { class: 'or' }, 'or'),
    email,
    h('button', { class: 'btn', onclick: guard(async () => {
      if (!email.value.includes('@')) { msg.textContent = 'Enter a valid email.'; return; }
      await signInEmail(email.value.trim());
      msg.textContent = 'Check your inbox for the sign-in link.';
    }) }, 'Email me a sign-in link'),
    msg,
  );
}

export function renderNamePrompt(root, uid, onDone, onError) {
  const name = h('input', { type: 'text', placeholder: 'Your name', autocomplete: 'name', 'aria-label': 'Display name' });
  root.replaceChildren(
    h('h1', {}, 'What should friends call you?'),
    name,
    h('button', { class: 'btn primary', onclick: async () => {
      const v = name.value.trim();
      if (!v) return;
      try { await saveProfile(uid, v); onDone(v); } catch (e) { onError(e); }
    } }, 'Continue'),
  );
}
