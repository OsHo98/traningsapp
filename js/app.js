'use strict';
/* Navigering, toast, inloggningsattrapp (bakom flagga) och service worker. */
let ROUTE = null;
const ROUTES = ['vecka', 'statistik', 'data'];
function go(r, push = true) {
  if (!ROUTES.includes(r)) r = 'vecka';
  ROUTE = r;
  ROUTES.forEach(x => { document.getElementById('v-' + x).hidden = x !== r; });
  document.querySelectorAll('[data-route]').forEach(b => b.classList.toggle('on', b.dataset.route === r));
  if (r === 'vecka') weekRender(); if (r === 'statistik') statsRender(); if (r === 'data') dataRender();
  if (push && location.hash !== '#' + r) history.replaceState(null, '', location.pathname + location.search + '#' + r);
  window.scrollTo(0, 0);
}
let toastT;
function toast(msg, action, fn) {
  const t = document.getElementById('toast'); t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); fn(); };
  t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2600);
}
function loginGate(next) {
  if (!FEATURES.authMock || STORE.user()) return next();
  const el = document.getElementById('login'); el.hidden = false;
  el.querySelector('form').onsubmit = async e => { e.preventDefault(); await STORE.signIn(el.querySelector('input[type=email]').value.trim()); el.hidden = true; next(); };
}
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (ROUTE === 'statistik' && STV.redraw) STV.redraw(); }, 150); });
window.addEventListener('hashchange', () => go(location.hash.slice(1), false));
function demoBanner() {
  if (!DEMO || document.getElementById('demobanner')) return;
  const d = document.createElement('div'); d.id = 'demobanner'; d.className = 'demobanner'; d.setAttribute('role', 'note');
  d.innerHTML = `<span><b>Demoläge.</b> Fiktiva data som bara sparas lokalt i den här webbläsaren – lägg inte in riktiga uppgifter.</span>${SB_CFG ? '<button class="btn" onclick="goLogin()">Logga in</button>' : ''}`;
  document.body.prepend(d);
}
document.addEventListener('DOMContentLoaded', () => {
  demoBanner();
  const rp = document.getElementById('rolepill'); if (rp) rp.textContent = BACKEND ? '' : isCoach() ? 'Coach' : 'Simmare';
  const start = () => {
    go(location.hash.slice(1) || Q.get('view') || 'vecka', false);
    if (Q.get('scroll')) { const t = document.getElementById(Q.get('scroll')); if (t) setTimeout(() => window.scrollTo(0, t.getBoundingClientRect().top + scrollY - 16), 0); }
  };
  if (BACKEND) {
    if (typeof supabase === 'undefined') { document.getElementById('login').hidden = false; document.getElementById('login').innerHTML = '<div class="card"><h2>Kunde inte ladda</h2><p>Supabase-klienten saknas. Ladda om sidan.</p></div>'; }
    else sbBoot(start);
  } else loginGate(start);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ED) edClose(); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !Q.get('nosw')) navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
});
