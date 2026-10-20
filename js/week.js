'use strict';
/* Veckovy: pass per dag med kantloggning (tid per rep med förifylld starttyp och segment, stopp vid fartfall,
   genomförande per rad), gym (kg, reps, m/s, RIR, hopptester), passets RPE och minuter (sRPE), förhållanden,
   kommentar och videolänk. "Genomfört enligt plan" fyller i från planen så att bara avvikelser behöver loggas. */
const ICON = {
  left: '<svg viewBox="0 0 20 20"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  right: '<svg viewBox="0 0 20 20"><path d="m7.5 4 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
const WK = { monday: mondayOf(TODAY), day: null };
let REPX = null;   // öppen rep för fler mätvärden: { sid, ii, r }
const CONTEXT = { traning: 'Träning', test: 'Test', tavling: 'Tävling' };
const METHOD_ALL = { hand: 'Hand', video: 'Video', touchpad: 'Touchpad', elektronisk: 'Elektronisk', annan: 'Annan' };
const METHOD_SHORT = { hand: 'Hand', video: 'Video', touchpad: 'Touch', elektronisk: 'Elektr.', annan: 'Annan' };

function weekRender() {
  if (!BACKEND && ensureWeek(WK.monday)) save();   // med backend kommer planen från coachen/säsongsprogrammet
  const wk = isoWeek(WK.monday), curWk = isoWeek(TODAY);
  if (WK.day == null) WK.day = wk.key === curWk.key ? (TODAY.getDay() + 6) % 7 : 0;
  const toSM = 50 - wk.w;
  const el = document.getElementById('v-vecka');
  el.innerHTML = `
  <div class="eyebrow">${DB.meta.demo ? '<span class="demo">Demo</span> ' : ''}${whoHTML()}${BACKEND ? '' : ' · ' + esc(ATHLETE.macrocycle)}</div>
  <div class="head">
    <div><div class="wknav"><button class="iconbtn" aria-label="Föregående vecka" onclick="weekGo(-1)">${ICON.left}</button><h1>Vecka ${wk.w}</h1><button class="iconbtn" aria-label="Nästa vecka" onclick="weekGo(1)">${ICON.right}</button>${wk.key !== curWk.key ? '<button class="today" onclick="weekToday()">Idag</button>' : ''}</div>
    <div class="sub">Mot <b>SM v50</b> · 0–25 m fjäril</div></div>
    ${toSM > 0 && wk.y === 2026 ? `<div class="countdown"><div class="n">${toSM}</div><div class="l">${toSM === 1 ? 'vecka' : 'veckor'} till SM</div></div>` : ''}
  </div>
  <div class="sum">
    <div class="card m"><div><div class="k"><i></i>15 m fjäril <span>från block</span></div><div class="big" id="b15"></div><div class="goal">Mål <b>${fmt(KPI.P2.goal)}</b> · <span id="g15"></span></div></div>
      <div class="spark"><svg id="spark15" width="150" height="58" viewBox="0 0 150 58"></svg><div class="cap">Dagens bästa, senaste 8</div></div></div>
    <div class="card m"><div><div class="k"><i></i>25 m fjäril <span>från block</span></div><div class="big" id="b25"></div><div class="goal">Mål <b>${fmt(KPI.P1.goal)}</b> · <span id="g25"></span></div></div>
      <div class="spark"><svg id="spark25" width="230" height="58" viewBox="0 0 230 58"></svg><div class="cap">Dagens bästa, senaste 8</div></div></div>
  </div>
  <div class="card wkload" id="wkload"></div>
  <div class="seg" id="dayseg"></div>
  <div class="dayhead"><h2 id="dn"></h2><span id="dd"></span></div>
  <div class="sessions" id="sess"></div>
  <div class="wkact">${isCoach() ? `<button class="btn sec" onclick="openImport()">Importera</button><button class="btn sec" onclick="copyWeek()">Kopiera veckan till v${isoWeek(addDays(WK.monday, 7)).w}</button>` : ''}</div>
  <div class="note">${DB.meta.demo ? 'Demo · fiktiva exempeldata som bara sparas i den här webbläsaren' : BACKEND ? `Synkas med ${esc(DB.group ? DB.group.name : 'gruppen')} · fungerar offline` : 'Data sparas endast på den här enheten'}</div>`;
  dayRender(); weekSummary();
}
function weekGo(n) { WK.monday = addDays(WK.monday, 7 * n); WK.day = 0; REPX = null; weekRender(); }
function weekToday() { WK.monday = mondayOf(TODAY); WK.day = null; weekRender(); }
function dayGo(i) { WK.day = i; REPX = null; dayRender(); }

function dayRender() {
  document.getElementById('dayseg').innerHTML = DAY_SHORT.map((n, i) => {
    const ss = sessionsOn(ymd(addDays(WK.monday, i))); const logged = ss.some(s => s.log.status === 'logged');
    return `<button class="${i === WK.day ? 'on' : ''} ${ss.length ? '' : 'rest'}" onclick="dayGo(${i})">${n}${logged && i !== WK.day ? '<span class="dot"></span>' : ''}</button>`;
  }).join('');
  const d = addDays(WK.monday, WK.day), ds = ymd(d), ss = sessionsOn(ds);
  document.getElementById('dn').textContent = DAY_NAMES[WK.day];
  document.getElementById('dd').textContent = prettyDate(d) + (OPTIONAL_DAYS.includes(WK.day) && ss.length ? ' · valfritt' : '');
  const drafts = ss.filter(s => s.planStatus === 'utkast').length;
  document.getElementById('sess').innerHTML = rulesHTML(ds) + (!isCoach() && drafts > 1 ? `<div class="card approvebar"><span><b>${drafts} pass</b> väntar på ditt godkännande</span><button class="btn" onclick="approveDay('${ds}')">Godkänn alla</button></div>` : '')
    + (ss.length ? ss.map(sessHTML).join('') : `<div class="card restcard"><h3>${BACKEND && !Object.keys(DB.sessions).length ? 'Inga pass ännu' : 'Vilodag'}</h3>${BACKEND && !Object.keys(DB.sessions).length ? (isCoach() ? 'Lägg till det första passet nedan eller importera en fil.' : 'Coachen har inte lagt in några pass ännu.') : 'Återhämtning, sömn och lätt rörlighet.'}</div>`)
    + nutritionHTML(ds) + checkinHTML(ds)
    + `<div class="addrow">${isCoach() ? `<button class="card addsess" onclick="editSession(null,'${ds}')">+ Nytt pass</button>` : ''}<button class="card addsess" onclick="editComp(null,'${ds}')">+ Tävlingsresultat</button></div>`;
  ss.forEach(s => { if (s.items.some(i => i.kind === 'strength')) volUpd(s.id); loadUpd(s.id); });
  weekLoadRender();
}

/* ---------- Simrad: tid per rep ---------- */
const segLabel = it => { const g = primarySeg(it); return g.to ? `${g.turn ? 'vändning ' : ''}${fmtM(g.from)}–${fmtM(g.to)} m` : ''; };
function swimHTML(s, it, ii) {
  const vals = it.results.map(r => r && r.timeS > 0 ? r.timeS : null), nums = vals.filter(x => x), ex = it.exec || {};
  const best = nums.length ? Math.min(...nums) : null, avg = nums.length ? nums.reduce((a, b) => a + b) / nums.length : null;
  const pers = it.kpi ? persBefore(it.kpi, s.date) : null, pr = it.kpi && best && best < pers && startOf(s, it, null) === 'block';
  const struck = ex.status === 'struken', stop = ex.stoppedAtRep || null;
  const res = struck ? '<span class="xs">Struket</span>' : best ? `<b>${fmt(best)}</b> bäst${pr ? ' · <span class="pr">Nytt pers</span>' : ''}` : `${it.results.length} ${it.results.length === 1 ? 'lopp' : 'lopp'}`;
  const pre = [START_TYPES[startOf(s, it, null)], segLabel(it), `${poolOf(s, null)} m-bassäng`].filter(Boolean).join(' · ');
  let reps = '';
  it.results.forEach((x, r) => {
    const v = x && x.timeS > 0 ? fmt(x.timeS) : '', off = stop && r >= stop, open = REPX && REPX.sid === s.id && REPX.ii === ii && REPX.r === r;
    const extra = x && (x.splits && x.splits.length || x.reactionS || x.strokes || x.videoUrl || (x.startType && x.startType !== (it.startType || 'push')) || (x.method && x.method !== (s.log.timingMethod || 'hand')));
    reps += `<div class="rep ${off ? 'off' : ''}"><label><span>${it.rounds > 1 ? 'Varv ' + repLabel(it, r).replace('V', '').replace('·', ', lopp ') : 'Lopp ' + (r + 1)}</span></label>
      <input class="num ${best && x && x.timeS === best ? 'best' : ''}" inputmode="decimal" placeholder="–" title="${off ? 'Ej simmat (stoppad)' : ''}" value="${v}" aria-label="Tid lopp ${r + 1} (${esc(pre)})" data-s="${s.id}" data-i="${ii}" data-r="${r}" onchange="swimIn(this)" ${struck ? 'disabled' : ''}>
      <button class="more ${extra ? 'has' : ''} ${open ? 'on' : ''}" aria-label="Fler mätvärden för lopp ${r + 1}" onclick="repMore('${s.id}',${ii},${r})">⋯</button></div>
      ${open ? repExtraHTML(s, it, ii, r) : ''}`;
  });
  const anyT = nums.length > 0;
  const subTxt = [rowSub(it) || it.sub, it.kpi ? `pers ${fmt(pers)}` : ''].filter(Boolean).join(' · ');
  return `<div class="row ${nums.length || stop || it.kpi || it.sprint || Q.get('open') ? 'open' : ''} ${struck ? 'struck' : ''}" id="${it.id}"><div class="rh" onclick="this.parentNode.classList.toggle('open')"><div class="t"><b>${esc(it.title)}</b><span>${esc(subTxt)}</span>${ruleBadge(it.restrictionIds, s.date)}</div><div class="res">${res}</div><div class="chev"></div></div>
  <div class="rb"><div class="prefill">${esc(pre)}${it.stopCriterion ? ` · <b>Stopp:</b> ${esc(it.stopCriterion)}` : ''}</div>
  <div class="reps">${reps}</div>
  <div class="rowact">${anyT || stop ? `<button class="chipbtn ${stop ? 'on warn' : ''}" onclick="stopAtDrop('${s.id}',${ii})">${stop ? `Stoppad vid fartfall efter lopp ${stop} · ångra` : 'Stoppad vid fartfall'}</button>` : ''}</div>
  ${execHTML(s, it, ii)}
  <div class="stats"><span>Bäst <b>${fmt(best)}</b></span><span>Snitt <b>${fmt(avg)}</b></span>${pr ? `<span class="pr">Nytt pers, −${fmt(pers - best)} s</span>` : ''}</div></div></div>`;
}
function repExtraHTML(s, it, ii, r) {
  const x = it.results[r] || {}, d = it.distanceM || 0, pool = poolOf(s, x), segs = it.segments || [];
  const f = (k, label, val, ph = '–', mode = 'decimal') => `<label>${label}<input inputmode="${mode}" placeholder="${ph}" value="${val == null ? '' : esc(String(val).replace('.', ','))}" onchange="repSet('${s.id}',${ii},${r},'${k}',this.value)"></label>`;
  const segIn = segs.slice(1).map((g, k) => f('seg' + (k + 2), segText(g), (x.segTimes || {})[k + 2])).join('');
  const spl = SPLIT_AT.filter(a => a < d).map(a => f('split' + a, `Split ${a} m`, ((x.splits || []).find(z => z.at === a) || {}).t)).join('');
  const turn = d > pool || segs.some(g => g.turn);
  return `<div class="repx" role="group" aria-label="Fler mätvärden">
    <div class="seg mini">${Object.entries(START_TYPES).map(([k, v]) => `<button class="${startOf(s, it, x) === k ? 'on' : ''}" onclick="repSet('${s.id}',${ii},${r},'startType','${k}')">${v}</button>`).join('')}</div>
    <div class="seg mini">${Object.entries(METHOD_SHORT).map(([k, v]) => `<button class="${(x.method || s.log.timingMethod || 'hand') === k ? 'on' : ''}" onclick="repSet('${s.id}',${ii},${r},'method','${k}')">${v}</button>`).join('')}</div>
    <div class="ef">${(x.method || s.log.timingMethod) === 'video' ? f('fps', 'Video fps', x.fps, '60', 'numeric') : ''}${segIn}${spl}${f('reactionS', 'Reaktion s', x.reactionS, '0,65')}${turn ? f('turnInS', 'In i vändning s', x.turnInS) + f('turnOutS', 'Ut ur vändning s', x.turnOutS) : ''}
    ${f('strokes', 'Antal tag', x.strokes, '–', 'numeric')}${f('strokeRate', 'Simfrekvens /min', x.strokeRate)}
    <label class="wide2">Videolänk (bara URL)<input inputmode="url" placeholder="https://…" value="${esc(x.videoUrl || '')}" onchange="repSet('${s.id}',${ii},${r},'videoUrl',this.value)"></label></div>
    ${!(x.timeS > 0) ? '<p class="fine">Ange tiden först – mätvärdena sparas på loppet.</p>' : ''}</div>`;
}
function repMore(sid, ii, r) { REPX = REPX && REPX.sid === sid && REPX.ii === ii && REPX.r === r ? null : { sid, ii, r }; dayRender(); }
function newResult(s, it) { return { timeS: null, method: s.log.timingMethod || 'hand', poolM: poolOf(s, null), startType: startOf(s, it, null), fps: s.log.fps || null }; }
function swimIn(el) {
  const s = DB.sessions[el.dataset.s], it = s.items[+el.dataset.i], r = +el.dataset.r, v = num(el.value);
  if (v != null && !(v > 0.5 && v < 3600)) { toast('Tiden ska anges i sekunder, t.ex. 5,62'); el.value = ''; return; }
  if (v) { it.results[r] = { ...(it.results[r] || newResult(s, it)), timeS: v }; } else it.results[r] = null;
  if (!it.exec || !it.exec.status) it.exec = { ...(it.exec || {}), status: 'genomford' };
  it._dirty = true; touch(s); haptic(); save(); dayRender(); weekSummary();
  const nx = document.querySelector(`input[data-s="${s.id}"][data-i="${el.dataset.i}"][data-r="${r + 1}"]`); if (nx && v) nx.focus();
}
function repSet(sid, ii, r, k, raw) {
  const s = DB.sessions[sid], it = s.items[ii], x = it.results[r];
  if (!x) return toast('Ange tiden för loppet först');
  if (k === 'videoUrl') { const u = String(raw).trim(); if (u && !/^https:\/\/[^\s"<>]{3,}$/.test(u)) return toast('Videolänken måste börja med https:// – bara länk, inga filer'); x.videoUrl = u; }
  else if (k === 'startType' || k === 'method') x[k] = raw;
  else if (k.startsWith('split')) { const at = +k.slice(5), v = num(raw); x.splits = (x.splits || []).filter(z => z.at !== at); if (v) x.splits.push({ at, t: v }); x.splits.sort((a, b) => a.at - b.at); }
  else if (k.startsWith('seg')) { const i = +k.slice(3), v = num(raw); x.segTimes = { ...(x.segTimes || {}) }; if (v) x.segTimes[i] = v; else delete x.segTimes[i]; }
  else x[k] = num(raw);
  it._dirty = true; touch(s); save(); dayRender();
}
function stopAtDrop(sid, ii) {
  const s = DB.sessions[sid], it = s.items[ii], ex = it.exec || {};
  if (ex.stoppedAtRep) { it.exec = { ...ex, stoppedAtRep: null, stopReason: '', status: ex.status === 'andrad' && /fartfall/.test(ex.comment || '') ? 'genomford' : ex.status, comment: /fartfall/.test(ex.comment || '') ? '' : ex.comment }; }
  else { const last = it.results.reduce((a, x, i) => x && x.timeS > 0 ? i + 1 : a, 0) || 1;
    it.exec = { ...ex, stoppedAtRep: last, stopReason: 'fartfall', status: 'andrad', comment: ex.comment || `Stoppad vid fartfall efter lopp ${last}` }; }
  it._dirty = true; touch(s); haptic(15); save(); dayRender();
}
/* Genomförande per rad: genomfört, ändrat eller struket, med kommentar */
function execHTML(s, it, ii) {
  const ex = it.exec || {}, st = ex.status || '';
  return `<div class="exec"><div class="seg mini ex">${Object.entries(EXEC_NAME).map(([k, v]) => `<button class="${st === k ? 'on' : ''}" onclick="execSet('${s.id}',${ii},'${k}')">${v}</button>`).join('')}</div>
    ${st === 'andrad' || st === 'struken' ? `<input class="excom" maxlength="300" placeholder="Vad ändrades? (kort, inga hälsouppgifter)" value="${esc(ex.comment || '')}" onchange="execCom('${s.id}',${ii},this.value)">` : ''}</div>`;
}
function execSet(sid, ii, k) { const s = DB.sessions[sid], it = s.items[ii]; it.exec = { ...(it.exec || {}), status: it.exec && it.exec.status === k ? '' : k };
  if (it.kind === 'check') it.done = it.exec.status === 'genomford' || it.exec.status === 'andrad'; it._dirty = true; touch(s); haptic(); save(); dayRender(); }
function execCom(sid, ii, v) { const s = DB.sessions[sid], it = s.items[ii]; it.exec = { ...(it.exec || {}), comment: v.trim().slice(0, 300) }; it._dirty = true; touch(s); save(); }

function checkHTML(s, it, ii) {
  const ex = it.exec || {};
  return `<div class="row ${ex.status === 'struken' ? 'struck' : ''}"><div class="rh"><div class="t" onclick="this.closest('.row').classList.toggle('open')"><b>${esc(it.title)}</b>${it.sub || rowSub(it) ? `<span>${esc(rowSub(it) || it.sub)}</span>` : ''}${ex.status && ex.status !== 'genomford' ? `<span class="xs">${EXEC_NAME[ex.status]}${ex.comment ? ' · ' + esc(ex.comment) : ''}</span>` : ''}${ruleBadge(it.restrictionIds, s.date)}</div><button class="chk ${it.done ? 'on' : ''}" aria-label="Klar" onclick="checkTog('${s.id}',${ii})"></button></div>
  <div class="rb">${execHTML(s, it, ii)}</div></div>`;
}
function checkTog(sid, ii) { const s = DB.sessions[sid], it = s.items[ii]; it.done = !it.done; it.exec = { ...(it.exec || {}), status: it.done ? (it.exec && it.exec.status === 'andrad' ? 'andrad' : 'genomford') : '' }; it._dirty = true; touch(s); haptic(); save(); dayRender(); }

/* ---------- Gym / bål / test ---------- */
function strengthHTML(s, it, ii) {
  if (it.test) return testHTML(s, it, ii);
  const cols = s.type !== 'gym' ? [['reps', it.unit === 's' ? 'Sekunder' : 'Reps']] : it.unit === 's' ? [['kg', 'kg'], ['reps', 's']] : [['kg', 'kg'], ['reps', 'Reps'], ['velocity', 'm/s'], ['rir', 'RIR']];
  let tr = '';
  it.sets.forEach((x, r) => {
    const sp = (it.setPlan || [])[r] || {}, ph = { kg: sp.load ?? it.load ?? 'kg', reps: sp.reps ?? it.targetReps ?? '–', velocity: sp.velocity ?? it.velocityTarget ?? '–', rir: sp.rir ?? it.rir ?? '–' };
    tr += `<tr><td>${r + 1}</td>${cols.map(([f]) => `<td><input class="num" inputmode="decimal" placeholder="${esc(String(ph[f]).replace('.', ','))}" value="${x[f] == null ? '' : String(x[f]).replace('.', ',')}" data-s="${s.id}" data-i="${ii}" data-r="${r}" data-f="${f}" onchange="setIn(this)"></td>`).join('')}<td><button class="chk ${x.done ? 'on' : ''}" onclick="setDone('${s.id}',${ii},${r})" aria-label="Set klart"></button></td></tr>`;
  });
  const done = it.sets.filter(x => x.done).length;
  return `<div class="row open"><div class="rh" style="cursor:default"><div class="t"><b>${esc(it.name)}</b><span>Plan ${esc(it.plan)}</span>${ruleBadge(it.restrictionIds, s.date)}${it.details && (it.details.modification || it.details.progression) ? `<span class="imod">${esc([it.details.modification, it.details.progression && 'Progression: ' + it.details.progression].filter(Boolean).join(' · '))}</span>` : ''}</div><div class="res"><b>${done}</b> av ${it.sets.length} set</div></div>
  <div class="rb"><table class="sets"><thead><tr><th>Set</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>${tr}</tbody></table>${execHTML(s, it, ii)}</div></div>`;
}
function testHTML(s, it, ii) {
  const a = it.attempts || [], v = a.filter(x => x != null), best = v.length ? Math.max(...v) : null, mean = v.length ? v.reduce((p, c) => p + c) / v.length : null;
  return `<div class="row open"><div class="rh" style="cursor:default"><div class="t"><b>${esc(it.name)}</b><span>${esc(planText(it))}</span></div><div class="res">${best != null ? `<b>${fmt(best, 1)}</b> cm bäst` : `${a.length} försök`}</div></div>
  <div class="rb"><div class="reps">${a.map((x, r) => `<div class="rep"><label><span>Försök ${r + 1}</span></label><input class="num" inputmode="decimal" placeholder="cm" value="${x == null ? '' : String(x).replace('.', ',')}" onchange="attIn('${s.id}',${ii},${r},this.value)"></div>`).join('')}</div>
  <div class="stats"><span>Bäst <b>${best != null ? fmt(best, 1) + ' cm' : '–'}</b></span><span>Medel <b>${mean != null ? fmt(mean, 1) + ' cm' : '–'}</b></span><span>Metod <b>${esc((it.test && it.test.method) || '–')}</b></span></div></div></div>`;
}
function attIn(sid, ii, r, raw) { const s = DB.sessions[sid], it = s.items[ii], v = num(raw); if (v != null && (v < 0 || v > 400)) return toast('Ange hopplängd/höjd i cm (0–400)'); it.attempts[r] = v; it._dirty = true; touch(s); save(); dayRender(); }
function setIn(el) { const s = DB.sessions[el.dataset.s]; s.items[+el.dataset.i].sets[+el.dataset.r][el.dataset.f] = num(el.value); s.items[+el.dataset.i]._dirty = true; touch(s); save(); volUpd(s.id); }
function setDone(sid, ii, r) { const s = DB.sessions[sid], it = s.items[ii], x = it.sets[r], sp = (it.setPlan || [])[r] || {};
  x.done = !x.done; if (x.done) { if (x.kg == null && (sp.load ?? it.load) != null) x.kg = sp.load ?? it.load; if (x.reps == null && (sp.reps ?? it.targetReps) != null) x.reps = sp.reps ?? it.targetReps; }
  it._dirty = true; touch(s); haptic(); save(); dayRender(); }

const sessVolume = s => Math.round(s.items.reduce((a, it) => a + (it.kind === 'strength' && it.unit === 'reps' && !it.test ? it.sets.reduce((b, x) => b + (x.kg && x.reps ? x.kg * x.reps : 0), 0) : 0), 0));
function volUpd(sid) { const el = document.getElementById(sid + '-vol'); if (el) el.innerHTML = `Total volym <b>${sessVolume(DB.sessions[sid]).toLocaleString('sv-SE')} kg</b>`; }
function loadUpd(sid) { const s = DB.sessions[sid], el = document.getElementById(sid + '-load'); if (!el) return; const m = s.log.durationMin, r = s.log.rpe;
  el.innerHTML = r && m ? `sRPE <b>${Math.round(r * m)}</b> AU` : 'sRPE okänd'; }

/* ---------- Pass ---------- */
function seriesHead(g, gi) {
  const meta = [g.rounds > 1 ? `${g.rounds} varv` : '', g.timingMode && g.timingValue ? `${g.timingMode === 'starttid' ? 'Starttid' : 'Vila'} ${g.timingValue}${g.rounds > 1 ? ' per varv' : ''}` : ''].filter(Boolean).join(' · ');
  const why = [g.workRest ? `Arbete:vila ${esc(g.workRest)}` : '', g.recovery ? (g.recovery === 'full' ? 'Full återhämtning' : 'Avsiktligt ofullständig återhämtning') : '', g.evidence ? `Evidens: ${{ stark: 'stark', mattlig: 'måttlig', svag: 'svag', extrapolerad: 'extrapolerad' }[g.evidence]}` : ''].filter(Boolean);
  return `<div class="serh"><b>Serie ${gi + 1}${g.title ? ' · ' + esc(g.title) : ''}</b>${g.main ? '<span class="chip main">Huvudset</span>' : ''}${meta ? `<span class="smeta">${meta}</span>` : ''}
    ${g.main && (g.rationale || why.length) ? `<div class="why open"><div class="whyc">${why.map(x => `<span>${x}</span>`).join('')}</div>${g.rationale ? `<p>${esc(g.rationale)}</p>` : ''}</div>`
      : g.rationale || why.length ? `<details class="why"><summary>Motivering</summary>${why.length ? `<div class="whyc">${why.map(x => `<span>${x}</span>`).join('')}</div>` : ''}<p>${esc(g.rationale || '')}</p></details>` : ''}</div>`;
}
function sessHTML(s) {
  const one = (it, i) => it.kind === 'swim' ? swimHTML(s, it, i) : it.kind === 'strength' ? strengthHTML(s, it, i) : checkHTML(s, it, i);
  const ser = s.series || [], idx = new Map(s.items.map((it, i) => [it, i]));
  const body = ser.length ? ser.map((g, gi) => { const rows = s.items.filter(it => it.seriesId === g.id); return rows.length ? `<div class="sgrp ${g.main ? 'main' : ''}">${seriesHead(g, gi)}${rows.map(it => one(it, idx.get(it))).join('')}</div>` : ''; }).join('')
      + s.items.filter(it => !ser.some(g => g.id === it.seriesId)).map(it => one(it, idx.get(it))).join('')
    : s.items.map(one).join('');
  const L = s.log, logged = L.status === 'logged', swim = isSwimLike(s), rpe = L.rpe || s.rpeTarget || 6;
  const draft = s.planStatus === 'utkast', comp = s.type === 'competition';
  const src = s.program && s.program.passId ? ` · ${esc(s.program.passId)}` : '';
  const meals = typeof mealsForSession === 'function' ? mealsForSession(s) : [];
  const canEdit = isCoach() || (comp && (!BACKEND || !SB.user || s.athleteId === SB.user.id));
  return `<div class="card sess ${draft ? 'is-draft' : ''}" id="${s.id}"><div class="sh"><div><div class="type"><i style="background:${TYPE_COLOR[s.type]}"></i>${TYPE_NAME[s.type]}${swim ? ` · ${s.poolM || 25} m` : ''}${statusChip(s)}${s.isBaseline ? '<span class="chip base">Baslinje</span>' : ''}</div><h3>${esc(s.title)}</h3><div class="status ${logged ? 'ok' : ''}">${logged ? 'Loggat' : 'Planerat'}${src}${comp && s.eventName ? ` · ${esc(s.eventName)}` : ''}${s.purpose ? ` · ${esc(s.purpose)}` : ''}</div></div><div class="time">${s.start.replace(':', '.')}–${s.end.replace(':', '.')}${canEdit ? `<br><button class="link" onclick="${comp ? `editComp('${s.id}')` : `editSession('${s.id}')`}">Redigera</button>` : ''}</div></div>
  ${s.focus || s.rpeTarget || s.startsCount ? `<div class="sfocus">${s.focus ? `<span><b>Fokus</b> ${esc(s.focus)}</span>` : ''}${s.rpeTarget ? `<span><b>RPE</b> ${rng(s.rpeTarget, s.rpeMax)} planerat</span>` : ''}${s.startsCount ? `<span><b>Starter</b> ${s.startsCount}</span>` : ''}</div>` : ''}
  ${meals.length ? `<div class="smeals">${meals.map(m => `<span><b>${REL[m.relation]}</b> ${esc(foodText(m))}</span>`).join('')}</div>` : ''}
  ${ruleBadge(s.restrictionIds, s.date)}${detailsHTML(s.details)}${s.rationale ? `<details class="why sess-why"><summary>Motivering</summary><p>${esc(s.rationale)}</p></details>` : ''}
  ${draft && !isCoach() ? `<div class="approve"><span>Nytt eller ändrat av coachen${s.author ? ' (' + esc(s.author) + ')' : ''}. Godkänn när du har läst igenom passet.</span><button class="btn" onclick="approveSession('${s.id}')">Godkänn</button></div>` : ''}
  ${!logged && !comp && s.type !== 'imagery' ? `<button class="btn sec wide asplan" onclick="asPlanned('${s.id}')">Genomfört enligt plan</button>` : ''}
  <div class="rows">${body}</div>${s.items.some(i => i.kind === 'strength' && !i.test) ? `<div class="vol" id="${s.id}-vol"></div>` : ''}
  ${swim ? condHTML(s) : ''}
  <div class="foot"><div class="rpe"><label>RPE</label><input type="range" min="1" max="10" step="0.5" value="${rpe}" style="--p:${(rpe - 1) / 9 * 100}%" oninput="rpeIn(this,'${s.id}')" aria-label="Passets RPE"><output>${L.rpe ? String(L.rpe).replace('.', ',') : '–'}</output></div>
  <div class="dur"><label>Tid</label><input class="num" inputmode="numeric" value="${L.durationMin || ''}" placeholder="${s.plannedMin}" onchange="durIn(this,'${s.id}')" aria-label="Minuter"> min<span class="load" id="${s.id}-load"></span></div>
  <div class="lmore"><input maxlength="500" placeholder="Kommentar om genomförandet (valfri)" value="${esc(L.comment || '')}" onchange="logSet('${s.id}','comment',this.value)" aria-label="Kommentar">
    <input inputmode="url" maxlength="500" placeholder="Videolänk för passet (https://…)" value="${esc(L.videoUrl || '')}" onchange="logSet('${s.id}','videoUrl',this.value)" aria-label="Videolänk"></div>
  <div class="act"><span class="saved" id="${s.id}-sv">Sparat</span><button class="btn" onclick="sessSave('${s.id}')">${logged ? 'Spara' : 'Logga pass'}</button></div></div></div>`;
}
function condHTML(s) {
  const L = s.log, pool = L.poolM || s.poolM || 25, m = L.timingMethod || 'hand', ctx = L.context || (s.type === 'competition' ? 'tavling' : 'traning');
  const b = (k, v, cur, lab) => `<button class="${cur === v ? 'on' : ''}" onclick="logSet('${s.id}','${k}','${v}')">${lab}</button>`;
  return `<div class="cond"><div class="crow"><span>Bassäng</span><div class="seg mini">${b('poolM', 25, pool, '25 m')}${b('poolM', 50, pool, '50 m')}</div></div>
    <div class="crow"><span>Tidtagning</span><div class="seg mini">${Object.entries(METHOD_SHORT).map(([k, v]) => b('timingMethod', k, m, v)).join('')}</div></div>
    ${m === 'video' ? `<div class="crow"><span>Video fps</span><input class="num" inputmode="numeric" placeholder="60" value="${L.fps || ''}" onchange="logSet('${s.id}','fps',this.value)"></div>` : ''}
    <details class="mctx" ${L.context && L.context !== 'traning' || L.warmup || L.caffeine != null || L.conditions ? 'open' : ''}><summary>Mätförhållanden<span>${esc([CONTEXT[ctx], L.warmup, L.caffeine === true ? 'koffein' : '', L.conditions].filter(Boolean).join(' · '))}</span></summary>
    <div class="crow"><span>Sammanhang</span><div class="seg mini">${Object.entries(CONTEXT).map(([k, v]) => b('context', k, ctx, v)).join('')}</div></div>
    <div class="crow"><span>Uppvärmning</span><input maxlength="120" placeholder="t.ex. standard 20 min" value="${esc(L.warmup || '')}" onchange="logSet('${s.id}','warmup',this.value)"></div>
    <div class="crow"><span>Koffein</span><div class="seg mini">${b('caffeine', 'ja', L.caffeine === true ? 'ja' : L.caffeine === false ? 'nej' : '', 'Ja')}${b('caffeine', 'nej', L.caffeine === true ? 'ja' : L.caffeine === false ? 'nej' : '', 'Nej')}</div></div>
    <div class="crow"><span>Förhållanden</span><input maxlength="300" placeholder="t.ex. bana 4, lugnt vatten" value="${esc(L.conditions || '')}" onchange="logSet('${s.id}','conditions',this.value)"></div>
    ${ctx === 'test' ? `<label class="crow chkl"><input type="checkbox" ${s.isBaseline ? 'checked' : ''} onchange="baseSet('${s.id}',this.checked)"> Testdagen är baslinje</label>` : ''}</details></div>`;
}
function logSet(sid, k, raw) {
  const s = DB.sessions[sid], L = s.log; let v = typeof raw === 'string' ? raw.trim() : raw;
  if (k === 'videoUrl' && v && !/^https:\/\/[^\s"<>]{3,}$/.test(v)) return toast('Videolänken måste börja med https:// – bara länk, inga filer');
  if (k === 'poolM' || k === 'fps') v = num(v);
  if (k === 'caffeine') v = L.caffeine === (v === 'ja') ? null : v === 'ja';
  if (k === 'poolM') s.items.forEach(it => { if (it.kind === 'swim') { it.results.forEach(x => { if (x) x.poolM = v; }); it._dirty = true; } });
  if (k === 'timingMethod') s.items.forEach(it => { if (it.kind === 'swim') { it.results.forEach(x => { if (x && (!x.method || x.method === (L.timingMethod || 'hand'))) x.method = v; }); it._dirty = true; } });
  if (k === 'fps') s.items.forEach(it => { if (it.kind === 'swim') { it.results.forEach(x => { if (x && x.method === 'video') x.fps = v; }); it._dirty = true; } });
  L[k] = v; s._logDirty = true; touch(s); save();
  if (['poolM', 'timingMethod', 'context', 'caffeine'].includes(k)) dayRender();
}
function baseSet(sid, on) { const s = DB.sessions[sid]; s.isBaseline = !!on; s._logDirty = true; touch(s); save(); }
/* "Genomfört enligt plan": allt fylls i från planen; bara avvikelser behöver loggas därefter */
function asPlanned(sid) {
  const s = DB.sessions[sid];
  s.items.forEach(it => {
    if (it.kind === 'check') it.done = true;
    if (it.kind === 'strength' && !it.test) it.sets.forEach((x, r) => { const sp = (it.setPlan || [])[r] || {}; if (x.kg == null && (sp.load ?? it.load) != null) x.kg = sp.load ?? it.load; if (x.reps == null && (sp.reps ?? it.targetReps) != null) x.reps = sp.reps ?? it.targetReps; if (x.rir == null && (sp.rir ?? it.rir) != null && s.type === 'gym') x.rir = sp.rir ?? it.rir; x.done = true; });
    if (!it.exec || !it.exec.status) it.exec = { ...(it.exec || {}), status: 'genomford' };
    it._dirty = true; });
  if (!s.log.rpe) s.log.rpe = s.rpeTarget || null; if (!s.log.durationMin) s.log.durationMin = s.plannedMin;
  if (isSwimLike(s) && !s.log.poolM) s.log.poolM = s.poolM || 25;
  s.log.status = 'logged'; s.log.loggedAt = new Date().toISOString(); s._logDirty = true; touch(s); haptic(12); save(); dayRender(); weekSummary();
  toast(s.log.rpe ? 'Ifyllt enligt plan – justera bara det som avvek' : 'Ifyllt enligt plan – ange passets RPE');
}
const DETAIL_LABEL = { stop_criterion: 'Stoppkriterium', key_metrics: 'Nyckelmått', hc_comment: 'Head Coach', progression: 'Progression', modification: 'Modifiering', intensity_text: 'Intensitet', warmup: 'Uppvärmning' };
function detailsHTML(d) {
  const e = Object.entries(d || {}).filter(([k, v]) => DETAIL_LABEL[k] && v);
  if (!e.length) return '';
  const dl = `<dl class="sdet">${e.map(([k, v]) => `<div><dt>${DETAIL_LABEL[k]}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  return e.reduce((n, [, v]) => n + String(v).length, 0) > 280 ? `<details class="sdetw"><summary>Detaljer · ${e.map(([k]) => DETAIL_LABEL[k].toLowerCase()).join(', ')}</summary>${dl}</details>` : dl;
}
function rpeIn(el, sid) { const s = DB.sessions[sid]; s.log.rpe = +el.value; s._logDirty = true; el.style.setProperty('--p', (el.value - 1) / 9 * 100 + '%'); el.nextElementSibling.textContent = String(el.value).replace('.', ','); touch(s); save(); loadUpd(sid); }
function durIn(el, sid) { const s = DB.sessions[sid], v = num(el.value); if (v != null && (v < 0 || v > 600)) { toast('Ange minuter 0–600'); return; } s.log.durationMin = v; s._logDirty = true; touch(s); save(); loadUpd(sid); }
function sessSave(sid) {
  const s = DB.sessions[sid];
  if (!s.log.rpe) { toast('Ange passets RPE innan du loggar'); return; }
  if (!s.log.durationMin) s.log.durationMin = s.plannedMin;
  if (isSwimLike(s) && !s.log.poolM) s.log.poolM = s.poolM || 25;
  if (s.log.status !== 'logged') { s.log.status = 'logged'; s.log.loggedAt = new Date().toISOString(); }
  s._logDirty = true; touch(s); haptic(12); save(); dayRender(); weekSummary();
  const sv = document.getElementById(sid + '-sv'); if (sv) { sv.classList.add('show'); setTimeout(() => sv.classList.remove('show'), 1800); }
}

/* ---------- Veckosummor ---------- */
function weekSummary() {
  [['P2', '15'], ['P1', '25']].forEach(([k, d]) => {
    const r = kpiResults(k), b = r.length ? Math.min(...r.map(x => x.t)) : null;
    document.getElementById('b' + d).innerHTML = b ? fmt(b) + '<small>s</small>' : '<span class="unk">okänd</span>';
    document.getElementById('g' + d).textContent = b == null ? 'inga tider ännu' : b - KPI[k].goal > 0 ? fmt(b - KPI[k].goal) + ' s kvar' : 'Målet nått';
  });
  drawSpark('spark15', 'P2', 150); drawSpark('spark25', 'P1', 230);
}
function drawSpark(svgId, k, W) {
  const [from, to] = KPI_SEG[k], h = byDay(measures({ from, to, start: 'block' })).map(x => x.best).slice(-8), sv = document.getElementById(svgId);
  if (h.length < 2) { sv.innerHTML = ''; return; }
  const G = KPI[k].goal, mn = Math.min(G, ...h) - .05, mx = Math.max(...h) + .05, X = i => 6 + i * ((W - 50) / (h.length - 1)), Y = v => 16 + (v - mn) / (mx - mn) * 36;
  const yG = Y(G).toFixed(1);
  sv.innerHTML = `<line x1="0" x2="${W}" y1="${yG}" y2="${yG}" stroke="#c7c7cc" stroke-dasharray="3 4"/><text x="${W}" y="${(+yG - 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#86868b">mål ${fmt(G)}</text>
  <polyline points="${h.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="#0071e3" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${X(h.length - 1)}" cy="${Y(h[h.length - 1])}" r="3.5" fill="#fff" stroke="#0071e3" stroke-width="2"/>`;
}
function weekLoadRender() {
  const el = document.getElementById('wkload'); if (!el) return; const T = weekTotals(WK.monday);
  const cell = (lab, p, d, u = '') => { if (!p) p = null; return `<div><span>${lab}</span><b>${d == null ? '<span class="unk">okänt</span>' : d.toLocaleString('sv-SE') + u}</b><small>plan ${p == null ? '–' : p.toLocaleString('sv-SE') + u}</small></div>`; };
  el.innerHTML = `<div class="wlh"><h3>Veckan</h3><span>genomfört · planerat</span></div><div class="wlg">
    ${cell('Belastning (sRPE)', T.load.p, T.load.d, ' AU')}${cell('Sprinter ≤25 m', T.sprints.p, T.sprints.d)}${cell('Maxmeter', T.maxM.p, T.maxM.d, ' m')}
    ${cell('Starter', T.starts.p, T.starts.d)}${cell('Maxbreakouts', T.breakouts.p, T.breakouts.d)}${cell('Hopp och kast', T.jumps.p, T.jumps.d)}</div>
    ${Object.keys(T.gym).length ? `<div class="wlgym">${Object.entries(T.gym).map(([k, v]) => `<span>${esc(k)} <b>${v.d == null ? '–' : v.d}</b>/${v.p} set</span>`).join('')}</div>` : ''}
    <div class="wlbar">${T.days.map((v, i) => `<div title="${DAY_SHORT[i]}"><i style="height:${T.maxDay ? Math.round((v || 0) / T.maxDay * 100) : 0}%"></i><span>${DAY_SHORT[i][0]}</span></div>`).join('')}</div>`;
}
