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

const JOIN_TTL_MS = 24 * 60 * 60 * 1000;
function readPendingJoin() {
  try {
    const p = JSON.parse(localStorage.getItem('pendingJoin') || 'null');
    if (p && p.token && Date.now() - p.at < JOIN_TTL_MS) return p.token;
  } catch { /* fall through and clear */ }
  localStorage.removeItem('pendingJoin');
  return null;
}

async function route() {
  banner.hidden = true;
  try {
    const session = await getSession();
    const r = parseRoute(location.hash);
    if (r.name === 'join') localStorage.setItem('pendingJoin', JSON.stringify({ token: r.token, at: Date.now() }));
    if (!session) return renderSignIn(root, onError);
    const user = session.user;
    const profile = await getProfile(user.id);
    if (!profile || !profile.display_name) {
      return renderNamePrompt(root, user.id, () => route(), onError);
    }
    const pending = readPendingJoin();
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
  // The initial route() below covers the session already present; INITIAL_SESSION and
  // tab-focus SIGNED_IN events for the same user must not re-render.
  let lastUid;
  const initial = await getSession();
  lastUid = initial ? initial.user.id : null;
  c.auth.onAuthStateChange((ev, session) => {
    const uid = session ? session.user.id : null;
    if (uid === lastUid) return;
    lastUid = uid;
    route();
  });
  window.addEventListener('hashchange', route);
  route();
}
start().catch(onError);
