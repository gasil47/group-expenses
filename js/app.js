import { configured, getClient, getSession, getProfile, ServerAsleepError } from './api.js';
import { parseRoute } from './routes.js';
import { renderSignIn, renderNamePrompt } from './views/signin.js';
import { renderHome } from './views/home.js';
import { renderGroup, renderJoin } from './views/group.js';
import { h } from './dom.js';

const root = document.getElementById('app');
const banner = document.getElementById('banner');

function onError(e) {
  banner.textContent = e instanceof ServerAsleepError ? e.message : `Something went wrong: ${e.message || e}`;
  banner.hidden = false;
}

async function route() {
  banner.hidden = true;
  try {
    const session = await getSession();
    const r = parseRoute(location.hash);
    if (r.name === 'join') sessionStorage.setItem('pendingJoin', r.token);
    if (!session) return renderSignIn(root, onError);
    const user = session.user;
    const profile = await getProfile(user.id);
    if (!profile || !profile.display_name) {
      return renderNamePrompt(root, user.id, () => route(), onError);
    }
    const pending = sessionStorage.getItem('pendingJoin');
    if (pending) return await renderJoin(root, pending);
    if (r.name === 'group') return await renderGroup(root, user, r.id, onError);
    return await renderHome(root, user, onError);
  } catch (e) { onError(e); }
}

async function start() {
  if (!configured) {
    root.replaceChildren(h('h1', {}, 'Not configured yet'),
      h('p', { class: 'muted' }, 'This app has no server connection yet. Ask the owner to finish setup.'));
    return;
  }
  const c = await getClient();
  c.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') route(); });
  window.addEventListener('hashchange', route);
  route();
}
start().catch(onError);
