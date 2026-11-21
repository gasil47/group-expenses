import { configured, onUser, getProfile } from './api.js';
import { parseRoute } from './routes.js';
import { renderSignIn, renderNamePrompt } from './views/signin.js';
import { renderHome } from './views/home.js';
import { renderGroup, renderJoin } from './views/group.js';
import { h } from './dom.js';

const root = document.getElementById('app');
const banner = document.getElementById('banner');

function onError(e) {
  banner.textContent = `Something went wrong: ${(e && e.message) || e}`;
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

let authUser;        // undefined until Firebase reports, then a user or null
let cleanup = null;  // unsubscribes the listeners of the current screen
let seq = 0;

async function route() {
  const mine = ++seq;
  if (cleanup) { cleanup(); cleanup = null; }
  banner.hidden = true;
  if (authUser === undefined) return;
  const keep = (fn) => { if (mine === seq) cleanup = fn || null; else if (fn) fn(); };
  try {
    const r = parseRoute(location.hash);
    if (r.name === 'join') localStorage.setItem('pendingJoin', JSON.stringify({ token: r.token, at: Date.now() }));
    if (!authUser) return renderSignIn(root, onError);
    const profile = await getProfile(authUser.id);
    if (mine !== seq) return;
    if (!profile || !profile.displayName) {
      return renderNamePrompt(root, authUser.id, authUser.authName, () => route(), onError);
    }
    const user = { id: authUser.id, name: profile.displayName };
    const pending = readPendingJoin();
    if (pending) return await renderJoin(root, user, pending, onError);
    if (r.name === 'group') keep(await renderGroup(root, user, r.id, onError));
    else keep(await renderHome(root, user, onError));
  } catch (e) { if (mine === seq) onError(e); }
}

function start() {
  if (!configured) {
    root.replaceChildren(h('h1', {}, 'Not configured yet'),
      h('p', { class: 'muted' }, 'This app has no server connection yet. Ask the owner to finish setup.'));
    return;
  }
  let lastUid;
  onUser((u) => {
    const uid = u ? u.id : null;
    if (authUser !== undefined && uid === lastUid) return;
    lastUid = uid;
    authUser = u;
    route();
  }, onError);
  window.addEventListener('hashchange', route);
}
start();
