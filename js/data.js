'use strict';
/* Export (JSON/CSV), import och lokal datahantering. Filerna skapas lokalt i webbläsaren – inget skickas någonstans. */
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const stamp = () => ymd(new Date());
function exportObject() {
  return { format: 'oh-traning-export', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), demo: !!DB.meta.demo,
    athlete: DB.athlete, kpi: DB.kpi, group: DB.group, memberships: DB.memberships,
    sessions: allSessions().filter(s => s.log.status === 'logged' || s.items.some(hasData)) };
}
const hasData = it => it.kind === 'swim' ? it.results.some(Boolean) : it.kind === 'strength' ? it.sets.some(x => x.kg != null || x.reps != null || x.done) : it.done;
function exportJSON() { download(`oskar-traning-${stamp()}.json`, JSON.stringify(exportObject(), null, 2), 'application/json'); toast('JSON exporterad'); }
/* CSV: en rad per lopp/set. Semikolon och decimalkomma för svensk Excel/Sheets. */
/* Rådata som CSV: en rad per mätvärde (sträcka från–till), set, hoppförsök eller moment. Tom cell = okänt (aldrig 0). */
const CSV_H = ['rad', 'datum', 'vecka', 'klockslag', 'pass_id', 'passtyp', 'pass', 'planstatus', 'loggstatus', 'rpe', 'minuter', 'srpe_au', 'moment_id', 'moment', 'genomforande', 'stoppad_vid_rep',
  'nr', 'bassang_m', 'starttyp', 'fran_m', 'till_m', 'tid_s', 'kalla', 'metod', 'fps', 'kontext', 'uppvarmning', 'koffein', 'baslinje', 'reaktion_s', 'vandning_in_s', 'vandning_ut_s', 'antal_tag', 'simfrekvens',
  'kg', 'reps', 'enhet', 'm_per_s', 'rir', 'cm', 'klar', 'video'];
function exportCSVText() {
  const c = v => v == null || v === '' ? '' : typeof v === 'boolean' ? (v ? 'ja' : 'nej') : typeof v === 'number' ? String(v).replace('.', ',') : /[;"\n\r]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const rows = [CSV_H.join(';')], M = allMeasures(), byItem = {};
  M.forEach(m => (byItem[m.iid + ':' + m.rep] = byItem[m.iid + ':' + m.rep] || []).push(m));
  allSessions().forEach(s => {
    const L = s.log, logged = L.status === 'logged', min = logged ? L.durationMin ?? null : null;
    const base = { datum: s.date, vecka: isoWeek(new Date(s.date + 'T12:00')).key, klockslag: s.start, pass_id: s.id, passtyp: TYPE_NAME[s.type], pass: s.title, planstatus: s.planStatus, loggstatus: logged ? 'loggat' : 'planerat',
      rpe: logged ? L.rpe : null, minuter: min, srpe_au: logged && L.rpe && min ? Math.round(L.rpe * min) : null };
    const out = o => rows.push(CSV_H.map(h => c({ ...base, ...o }[h])).join(';'));
    let n = 0;
    s.items.forEach(it => {
      const ex = it.exec || {}, ib = { moment_id: it.id, moment: it.title || it.name, genomforande: ex.status ? EXEC_NAME[ex.status] : null, stoppad_vid_rep: ex.stoppedAtRep || null };
      if (it.kind === 'swim') it.results.forEach((x, r) => { if (!x) return; (byItem[it.id + ':' + (r + 1)] || []).forEach(m => out({ ...ib, rad: 'tid', nr: r + 1, bassang_m: m.pool, starttyp: m.start, fran_m: m.from, till_m: m.to, tid_s: m.t, kalla: m.src,
          metod: m.method, fps: m.fps, kontext: m.context, uppvarmning: m.warmup, koffein: m.caffeine, baslinje: m.baseline, reaktion_s: m.src === 'tid' ? m.reaction : null, vandning_in_s: m.src === 'tid' ? m.turnIn : null, vandning_ut_s: m.src === 'tid' ? m.turnOut : null,
          antal_tag: m.src === 'tid' ? m.strokes : null, simfrekvens: m.src === 'tid' ? m.strokeRate : null, video: m.video })); n++; });
      else if (it.kind === 'strength' && it.test) (it.attempts || []).forEach((v, r) => { if (v != null) { out({ ...ib, rad: 'hopptest', nr: r + 1, cm: v, enhet: it.test.kind, kalla: it.test.method }); n++; } });
      else if (it.kind === 'strength') it.sets.forEach((x, r) => { if (x.kg != null || x.reps != null || x.done) { out({ ...ib, rad: 'set', nr: r + 1, kg: x.kg, reps: x.reps, enhet: it.unit, m_per_s: x.velocity, rir: x.rir, klar: !!x.done }); n++; } });
      else if (it.done || ex.status) { out({ ...ib, rad: 'moment', klar: !!it.done }); n++; }
    });
    if (!n && logged) out({ rad: 'pass' });
  });
  return '\ufeff' + rows.join('\r\n');
}
function exportCSV() { download(`traning-radata-${stamp()}.csv`, exportCSVText(), 'text/csv;charset=utf-8'); toast('CSV exporterad'); }
function exportMeasuresJSON() { download(`matvarden-${stamp()}.json`, JSON.stringify({ format: 'oh-matvarden', exported: new Date().toISOString(), note: 'Saknade värden är null = okänt', measures: allMeasures() }, null, 1), 'application/json'); toast('Mätvärden exporterade'); }
function importJSON(f) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const o = JSON.parse(rd.result);
      if (o.format === 'oh-pass') { openImport(); IMP.text = rd.result; impCheck(); return; }
      if (o.format !== 'oh-traning-export' || o.schemaVersion !== SCHEMA_VERSION || !Array.isArray(o.sessions)) throw new Error('fel format');
      if (!confirm(`Importera ${o.sessions.length} pass? Pass med samma id ersätts.`)) return;
      o.sessions.forEach(s => DB.sessions[s.id] = s); save(); toast(`${o.sessions.length} pass importerade`); dataRender();
    } catch (e) { toast('Filen kunde inte importeras (' + e.message + ')'); }
  };
  rd.readAsText(f);
}
function clearLocal() {
  if (!confirm(DB.meta.demo ? 'Återställ demodata?' : 'Radera all lokal träningsdata på den här enheten? Exportera först om du vill spara den.')) return;
  STORE.clear(); location.reload();
}
function dataRender() {
  const ss = allSessions(), logged = ss.filter(s => s.log.status === 'logged'), res = ss.reduce((a, s) => a + s.items.reduce((b, it) => b + (it.kind === 'swim' ? it.results.filter(Boolean).length : 0), 0), 0);
  const bytes = new Blob([JSON.stringify(DB)]).size, u = STORE.user();
  document.getElementById('v-data').innerHTML = `
  <div class="eyebrow">${DB.meta.demo ? '<span class="demo">Demo</span> ' : ''}${whoHTML()}</div>
  <div class="head"><div><h1>Data</h1><div class="sub">Export, säkerhetskopia och lagring</div></div></div>
  <div class="dgrid">
    <div class="card dcard"><h3>Exportera</h3><p>JSON innehåller hela datamodellen och kan importeras igen. CSV är rådata med en rad per mätvärde, set eller hoppförsök, med bassäng, starttyp, metod och kontext. Tom cell betyder okänt, aldrig noll.</p>
      <div class="btns"><button class="btn" onclick="exportJSON()">Exportera JSON</button><button class="btn sec" onclick="exportCSV()">Rådata CSV</button><button class="btn sec" onclick="exportMeasuresJSON()">Mätvärden JSON</button></div></div>
    <div class="card dcard"><h3>På den här enheten</h3>
      <div class="kv"><div><span>Loggade pass</span><b>${logged.length}</b></div><div><span>Tider</span><b>${res}</b></div><div><span>Lagringsstorlek</span><b>${fmt(bytes / 1024, 0)} kB</b></div><div><span>Lagring</span><b>${STORE.kind === 'local' ? 'Lokalt i webbläsaren' : 'Server'}</b></div><div><span>Grupp</span><b>${esc(DB.group ? DB.group.name : '–')}</b></div></div></div>
    ${isCoach() ? `<div class="card dcard"><h3>Importera pass</h3><p>Pass, veckor, kostplaner och träningsregler i formatet oh-pass v1 – från botarna eller säsongsprogrammet. Valideras och förhandsgranskas, inga dubbletter.</p>
      <div class="btns"><button class="btn" onclick="openImport()">Importera…</button></div></div>` : ''}
    <div class="card dcard"><h3>Säkerhetskopia</h3><p>Läs in en tidigare JSON-export, till exempel från en annan enhet.</p>
      <div class="btns"><label class="btn sec">Välj fil<input type="file" accept="application/json,.json" hidden onchange="this.files[0]&&importJSON(this.files[0]);this.value=''"></label><button class="btn sec danger" onclick="clearLocal()">${DB.meta.demo ? 'Återställ demo' : 'Radera lokal data'}</button></div></div>
    ${BACKEND ? accountCards() + (isCoach() ? botConnectionCard() : '') : `<div class="card dcard"><h3>Roll i demon</h3><p>Du är <b>${isCoach() ? 'coach' : 'simmare'}</b>. Coachen planerar pass och kost, simmaren loggar utfall och godkänner planerade pass.</p>
      <div class="btns"><button class="btn sec" onclick="setRole('${isCoach() ? 'swimmer' : 'coach'}')">Byt till ${isCoach() ? 'simmare' : 'coach'}</button></div>
      ${FEATURES.authMock ? `<p>Inloggning (attrapp): ${u ? `${esc(u.email)} · ${u.role === 'coach' ? 'coach' : 'simmare'}` : 'inte inloggad'}</p><div class="btns"><button class="btn sec" onclick="STORE.signOut().then(()=>location.reload())">Logga ut</button></div>` : ''}</div>
    <div class="card dcard"><h3>Anslut till gruppen</h3><p>Med en Supabase-backend loggar coach och simmare in med e-postlänk och delar gruppens pass, loggar och kost. Uppgifterna sparas bara i den här webbläsaren.</p>
      <form class="bform" onsubmit="backendSubmit(event)"><label>Projektadress<input name="url" placeholder="https://projekt.supabase.co" autocapitalize="none" spellcheck="false" inputmode="url"></label>
      <label>Anon-nyckel (publik)<input name="key" placeholder="eyJ… eller sb_publishable_…" autocapitalize="none" spellcheck="false"></label><p class="err" id="berr" role="alert"></p>
      <div class="btns"><button class="btn">Anslut</button></div></form></div>`}
  </div>
  <p class="caveat">${BACKEND ? 'Data sparas i gruppens databas och cachas på enheten för offline. Åtkomsten styrs av databasens regler: endast gruppens medlemmar ser något.' : 'Webbläsaren kan rensa lokal lagring om enheten får ont om utrymme – exportera regelbundet.'}</p>`;
}

function backendSubmit(e) {
  e.preventDefault(); const f = e.target, url = f.url.value, key = f.key.value, err = checkBackendInput(url, key);
  if (err) { document.getElementById('berr').textContent = err; haptic(30); return; }
  saveBackend(url, key); location.href = location.pathname + '#vecka';
}
const ROLE_SV = { coach: 'Coach', swimmer: 'Simmare' };
/* Rubrik: i Supabase-läge den inloggades roll och e-post (aldrig demosimmarens namn). */
function whoLabel() { return BACKEND && SB.user ? [ROLE_SV[SB.role], SB.user.email].filter(Boolean).join(' · ') : ATHLETE.name; }
const whoHTML = () => `<span class="who">${esc(whoLabel())}</span>`;
function groupCard() {
  const own = sbCanDeleteGroup();
  return `<div class="card dcard" id="groupcard"><h3>Träningsgrupp</h3>
    <label class="glabel">Aktiv grupp<select id="gsel" onchange="sbSwitchGroup(this.value)">${SB.groups.map(g => `<option value="${g.id}"${SB.group && g.id === SB.group.id ? ' selected' : ''}>${esc(sbGroupLabel(g))}</option>`).join('')}</select></label>
    ${own ? `<div class="btns"><button class="btn sec danger" id="gdel" onclick="sbDeleteGroupDialog()">Ta bort grupp</button></div>` : ''}
    <form class="bform" id="gnew" onsubmit="event.preventDefault();sbCreateGroup(this.gname.value)"><label>Skapa ny grupp<input name="gname" maxlength="80" required placeholder="Gruppnamn"></label>
      <div class="btns"><button class="btn">Skapa ny grupp</button></div></form>
    <p class="fine">Du blir coach i grupper du skapar. Bara den som skapat en grupp kan ta bort den.</p></div>`;
}
function accountCards() {
  const st = { ok: 'Synkad', sync: 'Synkar…', pending: 'Sparar…', offline: 'Offline', error: 'Fel', idle: '–' }[SB.state];
  const n = sbPending(), last = SB.lastSync ? SB.lastSync.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '–';
  const inv = (SB.groupInvites || []).filter(i => !i.accepted_at);
  return groupCard() + `<div class="card dcard"><h3>Konto</h3><div class="kv"><div><span>Inloggad</span><b>${esc(SB.user ? SB.user.email : '–')}</b></div><div><span>Roll</span><b>${ROLE_SV[SB.role] || '–'}</b></div>
      <div><span>Synk</span><b>${st}${n ? ` · ${n} väntar` : ''}</b></div><div><span>Senast synkad</span><b>${last}</b></div><div><span>Backend</span><b>${esc(BACKEND.url.replace(/^https?:\/\//, ''))}</b></div></div>
      ${SB.error ? `<p class="err">${esc(SB.error)}</p>` : ''}
      <div class="btns"><button class="btn sec" onclick="sbSync()">Synka nu</button><button class="btn sec" onclick="sbSetPassword()">Sätt lösenord</button><button class="btn sec" onclick="STORE.signOut()">Logga ut</button>${BACKEND.source === 'inställningar' ? '<button class="btn sec danger" onclick="sbDisconnect()">Koppla från</button>' : ''}</div></div>
    <div class="card dcard"><h3>${esc(SB.group ? SB.group.name : 'Grupp')}</h3>
      <div class="members">${SB.members.map(m => `<div><span>${esc(m.email || 'Medlem')}${m.user_id === SB.user.id ? ' (du)' : ''}</span><b>${ROLE_SV[m.role]}</b></div>`).join('')}
      ${inv.map(i => `<div class="pending"><span>${esc(i.email)} · inbjuden</span><b>${ROLE_SV[i.role]}</b>${isCoach() ? `<button class="link danger-t" onclick="sbRevoke('${i.id}')">Ta bort</button>` : ''}</div>`).join('')}</div>
      ${isCoach() ? `<form class="bform" onsubmit="event.preventDefault();sbInvite(this.email.value,this.role.value)"><label>Bjud in<input name="email" type="email" required placeholder="E-postadress" autocapitalize="none"></label>
        <label>Roll<select name="role"><option value="swimmer">Simmare</option><option value="coach">Coach</option></select></label><div class="btns"><button class="btn">Skicka inbjudan</button></div></form>
        <p class="fine">Inget mejl skickas av appen. Den inbjudna loggar in med sin e-postadress och ser inbjudan direkt.</p>` : ''}</div>`;
}

/* Botnycklar visas en gång och sparas aldrig i lokal lagring eller export. */
const BOT_LINK = { group: null, channels: null, config: '', busy: false, error: '' };
function botConnectionCard() {
  if (BOT_LINK.group !== SB.group.id) Object.assign(BOT_LINK, { group: SB.group.id, channels: null, config: '', busy: false, error: '' });
  const swimmers = SB.members.filter(m => m.role === 'swimmer');
  return `<div class="card dcard"><h3>Grok Bot och Codex</h3>
    <p>Anslut träningsbotarna till en simmares pass i den här gruppen. De kan läsa planer och skapa eller uppdatera utkast. Påbörjade loggar skyddas och simmaren godkänner ändrade planer.</p>
    ${swimmers.length ? `<form class="bform" onsubmit="event.preventDefault();botCreate(this)">
      <label>Anslutningens namn<input name="label" required maxlength="80" value="Grok Bot" autocomplete="off"></label>
      <label>Simmare<select name="athlete">${swimmers.map(m => `<option value="${esc(m.user_id)}">${esc(m.email || 'Simmare')}</option>`).join('')}</select></label>
      <div class="btns"><button class="btn"${BOT_LINK.busy ? ' disabled' : ''}>Skapa anslutning</button><button type="button" class="btn sec" onclick="botLoad()"${BOT_LINK.busy ? ' disabled' : ''}>Visa anslutningar</button></div>
    </form><p class="fine">Åtkomsten gäller i 90 dagar och kan stängas av här.</p>` : '<p>Bjud in en simmare innan du skapar en botanslutning.</p>'}
    ${BOT_LINK.error ? `<p class="err" role="alert">${esc(BOT_LINK.error)}</p>` : ''}
    ${BOT_LINK.config ? `<label class="bform">Anslutningsuppgifter – visas bara nu<textarea id="bot-config" readonly rows="9" autocomplete="off" spellcheck="false"></textarea></label>
      <p class="fine">Klistra in uppgifterna i botens privata MCP-inställningar. Lägg nyckeln i Grok Bots Secrets om inställningarna erbjuder det. Dela den inte i en chatt.</p>
      <div class="btns"><button class="btn sec" onclick="botCopy()">Kopiera inställningar</button><button class="btn sec" onclick="botHide()">Dölj nyckeln</button></div>` : ''}
    ${BOT_LINK.channels ? `<div class="members">${BOT_LINK.channels.map(c => `<div><span>${esc(c.label)} · ${c.revoked_at ? 'avstängd' : new Date(c.expires_at) < new Date() ? 'utgången' : 'gäller till ' + esc(c.expires_at.slice(0, 10))}</span>${!c.revoked_at ? `<button class="link danger-t" onclick="botRevoke('${esc(c.id)}')"${BOT_LINK.busy ? ' disabled' : ''}>Stäng av</button>` : ''}</div>`).join('') || '<p>Inga anslutningar skapade.</p>'}</div>` : ''}
  </div>`;
}
function botRender() {
  dataRender();
  const field = document.getElementById('bot-config');
  if (field) field.value = BOT_LINK.config;
}
async function botManage(action, args = {}) {
  if (!BACKEND || !isCoach() || !SB.user || !SB.group) throw new Error('Logga in som coach först.');
  const { data: auth, error: authError } = await SB.client.auth.getSession();
  if (authError || !auth.session) throw new Error('Logga in på nytt.');
  const response = await fetch(BACKEND.url + '/functions/v1/coach-bridge/manage', {
    method: 'POST', headers: { Authorization: 'Bearer ' + auth.session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...args, action, group_id: SB.group.id })
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Anslutningen kunde inte uppdateras.');
  return value;
}
async function botCreate(form) {
  if (BOT_LINK.busy) return;
  const label = form.label.value.trim(), athlete_id = form.athlete.value;
  if (!label) return;
  BOT_LINK.busy = true; BOT_LINK.error = ''; BOT_LINK.config = ''; botRender();
  try {
    const value = await botManage('create', { label, athlete_id });
    BOT_LINK.config = JSON.stringify({ mcpServers: { traningsapp: { type: 'http', url: BACKEND.url + '/functions/v1/coach-bridge', headers: { Authorization: 'Bearer ' + value.token } } } }, null, 2);
    BOT_LINK.channels = await botManage('list');
  } catch (e) { BOT_LINK.error = e.message; }
  finally { BOT_LINK.busy = false; botRender(); }
}
async function botLoad() {
  if (BOT_LINK.busy) return;
  BOT_LINK.busy = true; BOT_LINK.error = ''; botRender();
  try { BOT_LINK.channels = await botManage('list'); }
  catch (e) { BOT_LINK.error = e.message; }
  finally { BOT_LINK.busy = false; botRender(); }
}
async function botRevoke(id) {
  if (BOT_LINK.busy) return;
  BOT_LINK.busy = true; BOT_LINK.error = ''; botRender();
  try { await botManage('revoke', { channel_id: id }); BOT_LINK.config = ''; BOT_LINK.channels = await botManage('list'); }
  catch (e) { BOT_LINK.error = e.message; }
  finally { BOT_LINK.busy = false; botRender(); }
}
async function botCopy() {
  try { await navigator.clipboard.writeText(BOT_LINK.config); toast('Anslutningsuppgifterna är kopierade'); }
  catch { const field = document.getElementById('bot-config'); if (field) { field.focus(); field.select(); } toast('Markera och kopiera inställningarna'); }
}
function botHide() { BOT_LINK.config = ''; botRender(); }
