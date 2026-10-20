'use strict';
/* Lagringsadapter. Appen pratar bara med STORE – aldrig direkt med localStorage eller Supabase.
   Lägen:
   - demo     (alltid när ingen backend är konfigurerad): fiktiva data, sparas bara i den här webbläsaren (localStorage 'oh-app-demo-v7')
   - supabase (backend konfigurerad): inloggning med magisk länk, data i Supabase bakom RLS, offline-cache i localStorage
              ('oh-sb-cache-v2') på den inloggade enheten som rensas vid utloggning.
   Det finns inget läge för riktiga data enbart i webbläsaren: riktiga data får bara sparas i Supabase.
   Backendkonfiguration läses i ordning: js/config.local.js (gitignorerad) → inställningsskärmen (localStorage)
   → js/config.js (publik, normalt tom). Inga nycklar committas. */
const Q = new URLSearchParams(location.search);
function backendConfig() {
  const L = window.APP_CONFIG_LOCAL || {};
  let R = {}; try { R = JSON.parse(localStorage.getItem('oh-backend')) || {}; } catch (e) {}
  const pick = k => L[k] || R[k] || APP_CONFIG[k] || '';
  const url = pick('supabaseUrl').trim().replace(/\/+$/, ''), key = pick('supabaseAnonKey').trim();
  if (!url || !key) return null;
  return { url, key, source: L.supabaseUrl ? 'config.local.js' : R.supabaseUrl ? 'inställningar' : 'config.js',
    accessToken: (L.testAccessToken && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) ? L.testAccessToken : null };
}
/* Läge väljs vid start: med konfigurerad backend körs Supabase-läget bara när användaren är inloggad (sparad session),
   kommer tillbaka via magisk länk (?code=) eller har valt "Logga in". Utloggade ser demoläget med banderoll. */
const SB_CFG = Q.get('demo') === '1' ? null : backendConfig();
function wantsBackend(c) {
  if (!c) return false;
  try { if (c.accessToken || Q.has('code') || Q.has('error_description') || /error_description|access_token/.test(location.hash) || Q.get('login') === '1') return true;
    return localStorage.getItem('oh-mode') === 'login' || !!localStorage.getItem('oh-sb-auth'); } catch (e) { return false; }
}
const BACKEND = wantsBackend(SB_CFG) ? SB_CFG : null;
const DEMO = !BACKEND;
function goLogin() { try { localStorage.setItem('oh-mode', 'login'); } catch (e) {} location.href = location.pathname; }
function goDemo() { try { localStorage.removeItem('oh-mode'); } catch (e) {} location.href = location.pathname; }
const KEY = BACKEND ? 'oh-sb-cache-v2' : 'oh-app-demo-v7';
try { ['oh-app-demo-v1', 'oh-app-demo-v2', 'oh-app-demo-v3', 'oh-app-demo-v4', 'oh-app-demo-v5', 'oh-app-demo-v6', 'oh-sb-cache-v1'].forEach(k => localStorage.removeItem(k)); } catch (e) {}

const FEATURES = {
  authMock: !BACKEND && (Q.get('auth') === 'mock' || localStorage.getItem('oh-flag-auth') === 'mock'),
  backend: BACKEND ? 'supabase' : 'local',
  /* Check-in för besvär och träningsregler (restriktioner): finns i koden men är AVSTÄNGDA tills riktig inloggning
     med RLS är verifierad (Oskar 2026-10-12). Slås på endast via js/config.local.js: window.APP_FEATURES = { checkin: true, restrictions: true }.
     Går inte att slå på via URL eller inställningar. */
  checkin: !!(window.APP_FEATURES && window.APP_FEATURES.checkin),
  restrictions: !!(window.APP_FEATURES && window.APP_FEATURES.restrictions)
};
/* Validering av anslutningsuppgifter från inställningsskärmen. Avvisar service_role-nycklar. */
function jwtPayload(t) { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return null; } }
function checkBackendInput(url, key) {
  url = (url || '').trim().replace(/\/+$/, ''); key = (key || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) return 'Adressen ska se ut som https://<projekt>.supabase.co';
  if (/^sb_secret_/.test(key)) return 'Det där är en hemlig nyckel. Använd den publika anon-/publishable-nyckeln.';
  const p = jwtPayload(key);
  if (p && p.role === 'service_role') return 'Det där är service_role-nyckeln. Den får aldrig användas i appen – använd anon-nyckeln.';
  if (!p && !/^sb_publishable_/.test(key)) return 'Nyckeln känns inte igen. Kopiera anon/publishable key från Supabase → Project Settings → API.';
  return null;
}
function saveBackend(url, key) { localStorage.setItem('oh-backend', JSON.stringify({ supabaseUrl: url.trim().replace(/\/+$/, ''), supabaseAnonKey: key.trim() })); }
function clearBackend() { localStorage.removeItem('oh-backend'); localStorage.removeItem('oh-sb-cache-v2'); localStorage.removeItem('oh-sb-group'); }

class LocalStorageAdapter {
  constructor(key) { this.key = key; this.kind = 'local'; this._user = null; }
  loadAll() { try { return JSON.parse(localStorage.getItem(this.key)); } catch (e) { return null; } }
  saveAll(db) { try { localStorage.setItem(this.key, JSON.stringify(db)); return true; } catch (e) { console.warn('Kunde inte spara', e); return false; } }
  clear() { localStorage.removeItem(this.key); }
  /* Autentisering – lokal attrapp. Lösenord kontrolleras INTE och inget lämnar enheten. */
  user() { if (this._user) return this._user; try { return this._user = JSON.parse(sessionStorage.getItem('oh-mock-user')); } catch (e) { return null; } }
  async signIn(email) {
    const role = (localStorage.getItem('oh-role') === 'swimmer') ? 'swimmer' : 'coach';
    this._user = { id: 'mock-' + role, email, role, mock: true };
    sessionStorage.setItem('oh-mock-user', JSON.stringify(this._user)); return this._user;
  }
  async signOut() { this._user = null; sessionStorage.removeItem('oh-mock-user'); }
}
/* SupabaseAdapter finns i js/sync.js (laddas bara när backend är konfigurerad). */
let STORE = new LocalStorageAdapter(KEY);
