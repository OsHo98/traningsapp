'use strict';
/* Coach-editor för planerade pass (validering, ordning, duplicera, mallar, kopiera vecka),
   planstatus (utkast → godkänt av simmaren), kostplaner med faser och simmarens kostlogg.
   Roll: i demo/lokalt en attrapp (flagga); i Supabase-läge från medlemskapet i gruppen. */
let ROLE = (Q.get('role') || localStorage.getItem('oh-role') || 'coach') === 'swimmer' ? 'swimmer' : 'coach';
const isCoach = () => ROLE === 'coach';
function setRole(r) { localStorage.setItem('oh-role', r); location.search = location.search.replace(/([?&])role=[^&]*/, '$1').replace(/[?&]$/, ''); }
const haptic = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
TYPE_NAME.core = 'Bål'; TYPE_NAME.mobility = 'Rörlighet'; TYPE_COLOR.mobility = 'var(--bal)';
const TYPE_LABEL = { swim: 'Simning', gym: 'Gym', core: 'Bål', mobility: 'Rörlighet', imagery: 'Inre bilder' };
const FIELDS = {
  gym: [['name', 'Övning', 't'], ['targetSets', 'Set', 'n', 1, 50], ['targetReps', 'Reps', 'n', 0, 100], ['load', 'Belastning kg', 'n', 0, 500], ['rir', 'RIR', 'n', 0, 10], ['rpe', 'RPE', 'n', 1, 10], ['velocityTarget', 'Mål m/s', 'n', 0, 5], ['rest', 'Vila', 't'], ['note', 'Instruktion', 't']],
  swim: [['title', 'Set', 't'], ['reps', 'Antal', 'n', 1, 100], ['distanceM', 'Distans m', 'n', 0, 5000], ['rest', 'Vila / intervall', 't'], ['intensity', 'Intensitet', 't'], ['cues', 'Fokus', 't'], ['kpi', 'KPI', 'kpi']],
  core: [['name', 'Övning', 't'], ['targetSets', 'Set', 'n', 1, 50], ['targetReps', 'Tid s / reps', 'n', 0, 600], ['rest', 'Vila', 't'], ['note', 'Instruktion', 't']],
};
FIELDS.mobility = FIELDS.core;
FIELDS.imagery = [['title', 'Moment', 't'], ['durationS', 'Tid (s)', 'n', 0, 3600]];
const fmtDur = s => s == null ? '' : s >= 60 ? `${Math.round(s / 60 * 10) / 10} min`.replace('.', ',') : `${s} s`;
/* 24-timmarstid oberoende av enhetens språk: 1500, 15.00, 15 → 15:00 */
function normTime(v) {
  const t = String(v || '').trim().replace(/[.,h ]/g, ':'); let m = /^(\d{1,2}):?(\d{2})?$/.exec(t);
  if (!m && /^\d{3,4}$/.test(t)) m = [t, t.slice(0, -2), t.slice(-2)];
  if (!m) return t; const h = +m[1], mi = +(m[2] || 0);
  return h < 24 && mi < 60 ? `${pad2(h)}:${pad2(mi)}` : t;
}
const plural = (n, a, b) => n === 1 ? a : b;
/* Simpass: serier med rader (som SwimTechs editor) */
const STAT_OPTS = ['', 'Start', '15 m', '25 m', 'Undervatten', 'Fart'];
const LOGGABLE = ['Start', '15 m', '25 m', 'Fart'];
const fmtM = d => String(d).replace('.', ',');
const rowLabel = r => [r.reps && r.distanceM ? `${r.reps}×${fmtM(r.distanceM)} m` : '', r.desc || r.event || ''].filter(Boolean).join(' ') || 'Rad';
const descOf = t => String(t || '').replace(/^\s*\d+\s*[×x]\s*\d+(?:[.,]\d+)?\s*m\b\s*/i, '');
const statKpi = (stat, d) => stat === '25 m' && d === 25 ? 'P1' : stat === '15 m' && d >= 15 ? 'P2' : null;
const timingText = r => r.timingMode && r.timingValue ? `${r.timingMode === 'starttid' ? 'Starttid' : 'Vila'} ${r.timingValue}` : '';
const START_NAME = { block: 'Block', push: 'Push', deadstart: 'Deadstart', flygande: 'Flygande' };
const EQUIP_LIST = ['buckets', 'fallskärm', 'fenor', 'paddlar', 'mits', 'sox', 'snorkel', 'dolme', 'annat'];
const segText = g => `${g.turn ? 'vändning ' : ''}${fmtM(g.from)}–${fmtM(g.to)} m`;
const equipText = r => (r.equip && r.equip.length ? r.equip.join(', ') : r.equipment || '');
const rowSub = r => [r.startType ? START_NAME[r.startType] : '', equipText(r), timingText(r), r.sprint ? 'Sprint' : '', (r.segments || []).length ? 'Mät ' + r.segments.map(segText).join(', ') : '', r.stat ? 'Statistik: ' + r.stat : '', r.intensity, r.cues].filter(Boolean).join(' · ');
const seriesId = () => BACKEND ? newId() : 'ser_' + Math.random().toString(36).slice(2, 10);
function rowFromItem(it) {
  return { id: it.id, reps: it.reps || 1, distanceM: it.distanceM ?? null, desc: it.desc ?? descOf(it.title), equipment: it.equipment || '',
    timingMode: it.timingMode || (it.rest ? 'vila' : ''), timingValue: it.timingValue || it.rest || '', sprint: !!it.sprint, restrictionIds: it.restrictionIds || [],
    startType: it.startType || '', equip: it.equip || [], segments: it.segments || [], stopCriterion: it.stopCriterion || '', event: it.event || '',
    stat: it.stat || (it.kpi === 'P1' ? '25 m' : it.kpi === 'P2' ? '15 m' : ''), intensity: it.intensity || '', cues: it.cues || '' };
}
function seriesOf(s) {
  const ser = (s.series || []).map(x => ({ ...x, rows: [] }));
  s.items.forEach(it => {
    let g = ser.find(x => x.id === it.seriesId);
    if (!g) { g = ser.find(x => x._auto); if (!g) { g = { id: seriesId(), title: '', rationale: '', rows: [], _auto: true }; ser.push(g); } }
    g.rows.push(rowFromItem(it));
  });
  return ser.length ? ser : [{ id: seriesId(), title: '', rationale: '', rows: [{ reps: 1 }] }];
}
let ED = null;

const dec = v => String(v).replace('.', ',');
const rng = (a, b) => a == null || a === '' ? '' : dec(a) + (b != null && b !== '' && b !== a ? '–' + dec(b) : '');
const TEST_NAME = { cmj: 'CMJ', langdhopp: 'Längdhopp', annat: 'Test' };
function planText(it) { if (it.test) return [`${TEST_NAME[it.test.kind] || 'Test'}${it.test.method ? ' (' + it.test.method + ')' : ''}`, it.targetReps ? `${dec(it.targetReps)} försök` : ''].filter(Boolean).join(' · ');
  return [it.targetSets && it.targetReps != null ? `${it.targetSets}×${rng(it.targetReps, it.repsMax)}${it.unit === 's' ? ' s' : ''}` : it.targetSets ? `${it.targetSets} set${it.unit === 's' ? ' (s)' : ''}` : '', it.load ? `@ ${dec(it.load)} kg` : it.loadText || '', it.rir != null && it.rir !== '' ? `RIR ${rng(it.rir, it.rirMax)}` : '', it.rpe ? `RPE ${rng(it.rpe, it.rpeMax)}` : '', it.velocityTarget ? `${String(it.velocityTarget).replace('.', ',')} m/s` : '', it.rest ? `vila ${it.rest}` : '', it.note || ''].filter(Boolean).join(' · '); }
const genId = date => BACKEND ? newId() : `${date}_m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const itemId = (sid, i) => BACKEND ? newId() : `${sid}_${i}_${Math.random().toString(36).slice(2, 6)}`;
function markPlan(s) { s._planDirty = true; s.version = (s.version || 1) + (s._new ? 0 : 1); if (s.planStatus === 'godkand') { s.planStatus = 'utkast'; s.approvedAt = null; } }

/* ---------- Passeditor ---------- */
function toEditable(it) {
  const e = { ...it };
  if (it.kind === 'swim' || it.kind === 'check') { e.cues = it.cues ?? ''; if (!it.rest && !it.intensity && !it.cues && it.sub) e.cues = it.sub; e.reps = it.reps || 1; }
  return e;
}
function editSession(id, date) {
  const s = id ? DB.sessions[id] : null;
  ED = s ? { ...JSON.parse(JSON.stringify(s)), items: s.items.map(toEditable) } : { id: null, date, type: 'gym', title: '', start: '16:00', end: '17:00', purpose: '', items: [] };
  if (ED.type === 'swim') ED.series = seriesOf(ED);
  ED.errors = {}; edRender(); edOpen();
}
function edOpen() { const el = document.getElementById('editor'); el.hidden = false; requestAnimationFrame(() => el.classList.add('in')); document.body.classList.add('modal'); }
function edClose() { const el = document.getElementById('editor'); el.classList.remove('in'); document.body.classList.remove('modal'); el.hidden = true; ED = null; }
function edField(i, k, l, t, mn, mx) {
  const it = ED.items[i], bad = ED.errors[`${i}.${k}`];
  if (t === 'kpi') return `<label>${l}<select onchange="ED.items[${i}].kpi=this.value||null;edValidate(true)"><option value="">Ingen</option><option value="P1" ${it.kpi === 'P1' ? 'selected' : ''}>P1 · 25 m</option><option value="P2" ${it.kpi === 'P2' ? 'selected' : ''}>P2 · 15 m</option></select>${bad ? `<em>${bad}</em>` : ''}</label>`;
  return `<label class="${bad ? 'bad' : ''}">${l}<input ${t === 'n' ? 'inputmode="decimal"' : ''} value="${esc(it[k] == null ? '' : String(it[k]).replace(t === 'n' ? '.' : '\u0000', ','))}" onchange="ED.items[${i}]['${k}']=${t === 'n' ? 'num(this.value)' : 'this.value.trim()'};edValidate(true)">${bad ? `<em>${bad}</em>` : ''}</label>`;
}
function edRender() {
  const F = FIELDS[ED.type], E = ED.errors, n = ED.items.length, unit = ED.type === 'swim' ? 'set' : 'övning', IL = ED.type === 'imagery' ? 'Moment' : 'Övning';
  const tpls = templatesFor(ED.type), errN = Object.keys(E).length;
  document.getElementById('editor').innerHTML = `<div class="sheet card" role="dialog" aria-modal="true" aria-label="${ED.id ? 'Redigera pass' : 'Nytt pass'}"><div class="grab"></div>
  <div class="eh"><button class="link" onclick="edClose()">Avbryt</button><h2>${ED.id ? 'Redigera pass' : 'Nytt pass'}</h2><button class="link strong" onclick="edSave()">Spara</button></div>
  ${ED.id && ED.planStatus === 'godkand' ? '<p class="hint">Passet är godkänt. Ändringar gör det till ett utkast som simmaren behöver godkänna igen.</p>' : ''}
  ${errN ? `<p class="errsum" role="alert">${errN} ${plural(errN, 'fält behöver', 'fält behöver')} rättas.</p>` : ''}
  <div class="seg">${['swim', 'gym', 'core', 'mobility', 'imagery'].map(t => `<button class="${ED.type === t ? 'on' : ''}" onclick="edType('${t}')">${TYPE_LABEL[t]}</button>`).join('')}</div>
  ${!ED.id && tpls.length ? `<label class="tplsel">Utgå från mall<select onchange="edFromTemplate(this.value)"><option value="">Tomt pass</option>${tpls.map((t, i) => `<option value="${i}">${esc(t.title)} · ${t.items.length} ${t.items.length === 1 ? 'moment' : 'moment'}</option>`).join('')}</select></label>` : ''}
  <div class="ef"><label class="wide2 ${E.title ? 'bad' : ''}">Titel<input value="${esc(ED.title)}" placeholder="${TYPE_LABEL[ED.type]}pass" maxlength="120" onchange="ED.title=this.value.trim();edValidate(true)">${E.title ? `<em>${E.title}</em>` : ''}</label>
    <label class="${E.date ? 'bad' : ''}">Datum<input type="date" value="${ED.date}" onchange="ED.date=this.value;edValidate(true)"></label>
    <label class="${E.start ? 'bad' : ''}">Start<input class="tm" inputmode="numeric" maxlength="5" placeholder="hh:mm" value="${ED.start}" onchange="ED.start=normTime(this.value);edValidate(true)"></label>
    <label class="${E.end ? 'bad' : ''}">Slut<input class="tm" inputmode="numeric" maxlength="5" placeholder="hh:mm" value="${ED.end}" onchange="ED.end=normTime(this.value);edValidate(true)">${E.end ? `<em>${E.end}</em>` : ''}</label>
    ${ED.type === 'swim' ? `<label>Bassäng<select onchange="ED.poolM=+this.value">${[25, 50].map(p => `<option value="${p}" ${(ED.poolM || 25) === p ? 'selected' : ''}>${p} m</option>`).join('')}</select></label>` : ''}
    ${ED.type === 'swim' ? `<label>Antal starter<input inputmode="numeric" value="${ED.startsCount ?? ''}" onchange="ED.startsCount=num(this.value)"></label>` : ''}
    <label class="wide2">Syfte<input value="${esc(ED.purpose || '')}" maxlength="300" placeholder="Valfritt" onchange="ED.purpose=this.value.trim()"></label>
    <label class="wide2">Fokus<input value="${esc(ED.focus || '')}" maxlength="500" placeholder="T.ex. första tagen, reaktion" onchange="ED.focus=this.value.trim()"></label>
    <label class="${E.rpeTarget ? 'bad' : ''}">RPE (plan)<input inputmode="numeric" value="${ED.rpeTarget ?? ''}" placeholder="1–10" onchange="ED.rpeTarget=num(this.value);edValidate(true)">${E.rpeTarget ? `<em>${E.rpeTarget}</em>` : ''}</label>
    ${ruleLinkHTML()}
    <label class="full">Motivering<textarea rows="2" maxlength="4000" placeholder="Varför passet ser ut så här (fysiologi, evidens) – valfritt" onchange="ED.rationale=this.value.trim()">${esc(ED.rationale || '')}</textarea></label></div>
  ${ED.type === 'swim' ? seriesEditorHTML() : `<div class="eitems">${ED.items.map((it, i) => `<div class="ei"><div class="eih"><b>${IL} ${i + 1}</b><span class="ord">
    <button class="iconbtn sm" aria-label="Flytta upp" ${i ? '' : 'disabled'} onclick="edMove(${i},-1)">↑</button><button class="iconbtn sm" aria-label="Flytta ned" ${i < n - 1 ? '' : 'disabled'} onclick="edMove(${i},1)">↓</button>
    <button class="link danger-t" onclick="edRemove(${i})">Ta bort</button></span></div><div class="ef">${F.map(([k, l, t, mn, mx]) => edField(i, k, l, t, mn, mx)).join('')}</div></div>`).join('')}</div>
  ${n ? '' : `<p class="empty">${ED.type === 'imagery' ? 'Inga moment ännu. Korta pass, t.ex. 3–4 moment à 1–2 min.' : 'Inga övningar ännu.'}</p>`}
  <button class="btn sec wide" onclick="ED.items.push({});edRender();edFocusLast()">+ Lägg till ${ED.type === 'imagery' ? 'moment' : unit}</button>`}
  <div class="act">${ED.id ? `<button class="btn sec" onclick="edDuplicate()">Duplicera</button><button class="btn sec" onclick="saveTemplate()">Spara som mall</button><button class="btn sec danger" onclick="edDelete()">Radera</button>` : ''}<button class="btn" onclick="edSave()">Spara pass</button></div></div>`;
}
function seriesEditorHTML() {
  const E = ED.errors, S = ED.series, sel = (v, opts, on) => `<select onchange="${on}">${opts.map(([k, l]) => `<option value="${k}" ${k === (v || '') ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<div class="series">${S.map((g, gi) => `<div class="serie"><div class="serh"><b>Serie ${gi + 1}</b><span class="ord">
    <button class="iconbtn sm" aria-label="Flytta serie upp" ${gi ? '' : 'disabled'} onclick="serMove(${gi},-1)">↑</button><button class="iconbtn sm" aria-label="Flytta serie ned" ${gi < S.length - 1 ? '' : 'disabled'} onclick="serMove(${gi},1)">↓</button>
    <button class="link danger-t" onclick="serRemove(${gi})">Ta bort serie</button></span></div>
    <div class="ef"><label class="wide2">Namn på serien<input value="${esc(g.title || '')}" maxlength="120" placeholder="T.ex. Uppvärmning, Huvudserie" onchange="ED.series[${gi}].title=this.value.trim()"></label>
      <label>Varv<input inputmode="numeric" value="${g.rounds > 1 ? g.rounds : ''}" placeholder="1" onchange="ED.series[${gi}].rounds=Math.max(1,Math.min(20,num(this.value)||1))"></label>
      <label class="cbx"><input type="checkbox" ${g.main ? 'checked' : ''} onchange="ED.series[${gi}].main=this.checked;edRender()"> Huvudset</label>
      ${g.main ? `<label>Arbete:vila<input value="${esc(g.workRest || '')}" maxlength="20" placeholder="1:20" onchange="ED.series[${gi}].workRest=this.value.trim().replace(/\s+/g,'')"></label>
      <label>Återhämtning${sel(g.recovery, [['', '–'], ['full', 'Full'], ['ofullstandig', 'Avsiktligt ofullständig']], `ED.series[${gi}].recovery=this.value`)}</label>
      <label>Evidensgrad${sel(g.evidence, [['', '–'], ['stark', 'Stark'], ['mattlig', 'Måttlig'], ['svag', 'Svag'], ['extrapolerad', 'Extrapolerad']], `ED.series[${gi}].evidence=this.value`)}</label>` : ''}</div>
    ${g.rows.map((r, ri) => { const k = `${gi}.${ri}`, bad = f => E[k + '.' + f] ? 'bad' : '', em = f => E[k + '.' + f] ? `<em>${E[k + '.' + f]}</em>` : '', set = (f, conv) => `ED.series[${gi}].rows[${ri}].${f}=${conv};edValidate(true)`;
      return `<div class="srow"><div class="srh"><span>Rad ${ri + 1}</span><span class="ord"><button class="iconbtn sm" aria-label="Flytta rad upp" ${ri ? '' : 'disabled'} onclick="rowMove(${gi},${ri},-1)">↑</button><button class="iconbtn sm" aria-label="Flytta rad ned" ${ri < g.rows.length - 1 ? '' : 'disabled'} onclick="rowMove(${gi},${ri},1)">↓</button><button class="link danger-t" onclick="rowRemove(${gi},${ri})">Ta bort</button></span></div>
      <div class="ef rowf"><label class="${bad('reps')}">Reps<input inputmode="numeric" value="${r.reps ?? ''}" onchange="${set('reps', 'num(this.value)')}">${em('reps')}</label><label class="${bad('distanceM')}">Meter<input inputmode="decimal" value="${r.distanceM == null ? '' : fmtM(r.distanceM)}" onchange="${set('distanceM', 'num(this.value)')}">${em('distanceM')}</label>
      <label class="wide2 ${bad('desc')}">Beskrivning<input value="${esc(r.desc || '')}" maxlength="160" placeholder="T.ex. fjäril max från pall" onchange="${set('desc', 'this.value.trim()')}">${em('desc')}</label>
      <label>Starttyp${sel(r.startType, [['', '–'], ...Object.entries(START_TYPES)], set('startType', 'this.value'))}</label>
      <div class="wide2 eqp" role="group" aria-label="Utrustning"><span>Utrustning</span><div>${EQUIP_LIST.map(q => `<button type="button" class="chip ${(r.equip || []).includes(q) ? 'on' : ''}" onclick="eqTog(${gi},${ri},'${q}')">${q}</button>`).join('')}</div></div>
      <label class="wide2">Mätsegment<input value="${esc((r.segments || []).map(segText).join(', '))}" maxlength="80" placeholder="t.ex. 0–15, 15–25, v20–30" onchange="ED.series[${gi}].rows[${ri}].segments=parseSegs(this.value);edValidate(true)"></label>
      <label class="wide2">Stoppkriterium<input value="${esc(r.stopCriterion || '')}" maxlength="300" placeholder="t.ex. fartfall >3 % mot dagens bästa" onchange="${set('stopCriterion', 'this.value.trim()')}"></label>
      <label>Tidsstyrning${sel(r.timingMode, [['', 'Ingen'], ['starttid', 'Starttid'], ['vila', 'Vila']], set('timingMode', 'this.value'))}</label>
      <label class="${bad('timingValue')}">Värde<input value="${esc(r.timingValue || '')}" maxlength="40" placeholder="${r.timingMode === 'starttid' ? '1:30' : r.timingMode === 'vila' ? '3 min' : '–'}" onchange="${set('timingValue', 'this.value.trim()')}">${em('timingValue')}</label>
      <label class="${bad('stat')}">Statistik${sel(r.stat, STAT_OPTS.map(o => [o, o || 'Ingen']), set('stat', 'this.value'))}${em('stat')}</label>
      <label class="cbx"><input type="checkbox" ${r.sprint ? 'checked' : ''} onchange="${set('sprint', 'this.checked')}"> Sprint</label></div></div>`; }).join('')}
    <button class="btn sec" onclick="ED.series[${gi}].rows.push({reps:1});edRender()">+ Rad</button>
    <label class="why">Motivering för serien<textarea rows="2" maxlength="4000" placeholder="T.ex. varför distans och vila (energisystem, återhämtning) – valfritt" onchange="ED.series[${gi}].rationale=this.value.trim()">${esc(g.rationale || '')}</textarea></label></div>`).join('')}</div>
  <button class="btn sec wide" onclick="ED.series.push({id:seriesId(),title:'',rationale:'',rows:[{reps:1}]});edRender();edFocusLast('.serie')">+ Serie</button>
  <p class="hint">Rader med Sprint eller Statistik (Start, 15 m, 25 m, Fart) får tidsfält i loggen. Statistik 25 m räknas som KPI P1, 15 m som P2.</p>`;
}
function eqTog(g, r, q) { const x = ED.series[g].rows[r], a = x.equip || []; x.equip = a.includes(q) ? a.filter(y => y !== q) : [...a, q]; edRender(); }
/* "0–15, 15–25, v20–30" → [{from,to,turn}] ('v' = vändning) */
function parseSegs(t) { return String(t || '').split(/[,;]/).map(z => z.trim()).filter(Boolean).map(z => { const m = /^(v|vändning\s*)?(\d+(?:[.,]\d+)?)\s*[–—-]\s*(\d+(?:[.,]\d+)?)/i.exec(z); return m ? { from: num(m[2]), to: num(m[3]), turn: !!m[1] } : null; }).filter(g => g && g.to > g.from); }
function serMove(i, d) { const a = ED.series, j = i + d; [a[i], a[j]] = [a[j], a[i]]; haptic(); edValidate(false); edRender(); }
function serRemove(i) { const x = ED.series.splice(i, 1)[0]; edValidate(false); edRender(); toast('Serien är borttagen', 'Ångra', () => { ED && (ED.series.splice(i, 0, x), edRender()); }); }
function rowMove(g, i, d) { const a = ED.series[g].rows, j = i + d; [a[i], a[j]] = [a[j], a[i]]; haptic(); edValidate(false); edRender(); }
function rowRemove(g, i) { ED.series[g].rows.splice(i, 1); edValidate(false); edRender(); }
function edFocusLast(sel = '.ei') { const el = document.querySelectorAll('#editor ' + sel); const x = el[el.length - 1]; if (x) { x.scrollIntoView({ block: 'center', behavior: 'smooth' }); const inp = x.querySelector('input'); inp && inp.focus({ preventScroll: true }); } }
function edType(t) {
  if (ED.type === t) return; const has = ED.type === 'swim' ? ED.series.some(g => g.rows.some(r => r.desc || r.distanceM)) : ED.items.length;
  if (has && !confirm('Byta passtyp? Momenten tas bort.')) return;
  ED.type = t; ED.items = []; ED.series = t === 'swim' ? [{ id: seriesId(), title: '', rationale: '', rows: [{ reps: 1 }] }] : undefined; ED.errors = {}; edRender();
}
function edMove(i, d) { const a = ED.items, j = i + d; [a[i], a[j]] = [a[j], a[i]]; haptic(); edValidate(false); edRender(); }
function edRemove(i) { const x = ED.items.splice(i, 1)[0]; edRender(); toast('Moment borttaget', 'Ångra', () => { ED && (ED.items.splice(i, 0, x), edRender()); }); }
function edValidate(rerender) {
  const E = {}, F = FIELDS[ED.type];
  if (!ED.date || !/^\d{4}-\d{2}-\d{2}$/.test(ED.date)) E.date = 'Ange datum';
  if (!/^\d{2}:\d{2}$/.test(ED.start || '')) E.start = 'Ange starttid';
  if (!/^\d{2}:\d{2}$/.test(ED.end || '')) E.end = 'Ange sluttid';
  else if (!E.start && minutesBetween(ED.start, ED.end) <= 0) E.end = 'Sluttiden måste vara efter starttiden';
  if ((ED.title || '').length > 120) E.title = 'Högst 120 tecken';
  if (ED.rpeTarget != null && (ED.rpeTarget < 1 || ED.rpeTarget > 10)) E.rpeTarget = '1–10';
  if (ED.type === 'swim') (ED.series || []).forEach((g, gi) => g.rows.forEach((r, ri) => {
    const k = `${gi}.${ri}`;
    if (!r.desc && !r.distanceM) E[k + '.desc'] = 'Ange meter eller beskrivning';
    if (r.reps == null || r.reps < 1 || r.reps > 100 || !Number.isInteger(r.reps)) E[k + '.reps'] = '1–100';
    if (r.distanceM != null && (r.distanceM <= 0 || r.distanceM > 5000)) E[k + '.distanceM'] = '1–5000';
    if (r.timingMode && !r.timingValue) E[k + '.timingValue'] = 'Ange värde';
    if (r.timingMode === 'starttid' && r.timingValue && !/^\d{1,2}:\d{2}$|^\d{1,3}\s*s?$/.test(r.timingValue)) E[k + '.timingValue'] = 'T.ex. 1:30 eller 45';
    if (r.stat === '25 m' && r.distanceM !== 25) E[k + '.stat'] = 'Kräver 25 m';
    if (r.stat === '15 m' && !(r.distanceM >= 15)) E[k + '.stat'] = 'Kräver minst 15 m';
    if (LOGGABLE.includes(r.stat) && !r.distanceM) E[k + '.stat'] = 'Kräver meter';
  }));
  if (ED.type !== 'swim') ED.items.forEach((it, i) => {
    const key = ED.type === 'swim' ? 'title' : 'name';
    if (!it[key] && Object.values(it).some(v => v != null && v !== '')) E[`${i}.${key}`] = 'Ange namn';
    if (!Object.values(it).some(v => v != null && v !== '')) E[`${i}.${key}`] = 'Tomt moment – fyll i eller ta bort';
    F.forEach(([k, , t, mn, mx]) => { const v = it[k]; if (t === 'n' && v != null && (isNaN(v) || v < mn || v > mx)) E[`${i}.${k}`] = `${String(mn).replace('.', ',')}–${mx}`; });
    if (ED.type === 'swim' && it.kpi) { const need = it.kpi === 'P1' ? 25 : 15; if (it.distanceM !== need) E[`${i}.kpi`] = `${it.kpi} kräver ${need} m`; }
  });
  ED.errors = E; if (rerender) { const y = document.querySelector('#editor .sheet') ? document.querySelector('#editor .sheet').scrollTop : 0; edRender(); const sh = document.querySelector('#editor .sheet'); if (sh) sh.scrollTop = y; }
  return !Object.keys(E).length;
}
function ruleLinkHTML() {
  if (!FEATURES.restrictions) return '';
  const rs = rulesAll().filter(r => ruleActive(r, ED.date) || (ED.restrictionIds || []).includes(r.id)); if (!rs.length) return '';
  const on = new Set(ED.restrictionIds || []);
  return `<fieldset class="full rlink"><legend>Träningsregler som gäller passet</legend>${rs.map(r => `<label class="cbx"><input type="checkbox" ${on.has(r.id) ? 'checked' : ''} onchange="ED.restrictionIds=(ED.restrictionIds||[]).filter(x=>x!=='${esc(r.id)}').concat(this.checked?['${esc(r.id)}']:[])"> ${esc(r.rule)} <span class="fine">${ruleRange(r)}</span></label>`).join('')}</fieldset>`;
}
function buildItems(type, items, sid, old) {
  return items.map((e, i) => {
    const prev = old && e.id && old.items.find(x => x.id === e.id);
    const id = prev ? prev.id : itemId(sid, i);
    if (type === 'imagery') return { id, kind: 'check', title: e.title || `Moment ${i + 1}`, durationS: e.durationS ?? null, sub: fmtDur(e.durationS), done: prev ? !!prev.done : false, details: e.durationS != null ? { duration_s: e.durationS } : {} };
    if (type === 'swim') {
      const reps = Math.max(1, Math.round(e.reps || 1)), kpi = /^P[12]$/.test(e.kpi || '') ? e.kpi : null;
      const sub = [e.rest, e.intensity, e.cues].filter(Boolean).join(' · ');
      const base = { id, title: e.title || `Set ${i + 1}`, sub, reps, distanceM: e.distanceM || null, rest: e.rest || '', intensity: e.intensity || '', cues: e.cues || '', kpi, stroke: e.stroke || 'fjäril', details: e.details || {} };
      if (!e.distanceM) return { ...base, kind: 'check', done: prev ? !!prev.done : false };
      const res = (prev && prev.results) || []; return { ...base, kind: 'swim', results: Array.from({ length: reps }, (_, r) => res[r] || null) };
    }
    const n = Math.max(1, Math.round(e.targetSets || 1)), unit = type === 'gym' ? (e.unit === 's' ? 's' : 'reps') : (e.unit || (e.targetReps >= 15 ? 's' : 'reps'));
    const it = { id, kind: 'strength', name: e.name || `Övning ${i + 1}`, targetSets: n, targetReps: e.targetReps ?? null, unit, load: e.load ?? null, loadText: e.loadText || '', rir: e.rir ?? null, rpe: e.rpe ?? null,
      velocityTarget: e.velocityTarget ?? null, rest: e.rest || '', note: e.note || '', details: e.details || {}, restrictionIds: e.restrictionIds || [],
      repsMax: e.repsMax ?? null, rirMax: e.rirMax ?? null, rpeMax: e.rpeMax ?? null, setPlan: e.setPlan || null, test: e.test || null, exec: (prev && prev.exec) || null,
      measureVelocity: type === 'gym' && (e.velocityTarget != null || /jump|hopp/i.test(e.name || '')), e1rm: type === 'gym' && !/jump|kast|hopp/i.test(e.name || '') };
    it.plan = planText(it); const ps = (prev && prev.sets) || [];
    it.sets = Array.from({ length: n }, (_, r) => ps[r] || { kg: null, reps: null, velocity: null, rir: null, done: false });
    if (it.test) { it.e1rm = false; it.measureVelocity = false; const pa = (prev && prev.attempts) || []; it.attempts = Array.from({ length: Math.max(1, Math.round(e.targetReps || 3)) }, (_, k) => pa[k] ?? null); }
    return it;
  });
}
function buildSeries(series, sid, old) {
  const items = []; let starts = 0;
  const out = series.filter(g => g.rows.length).map(g => ({ id: g.id, title: g.title || '', rationale: g.rationale || '', rounds: Math.max(1, g.rounds || 1), timingMode: g.timingMode || '', timingValue: g.timingValue || '',
    workRest: g.workRest || '', recovery: g.recovery || '', evidence: g.evidence || '', main: !!g.main }));
  series.filter(g => g.rows.length).forEach(g => g.rows.forEach(r => {
    const prev = old && r.id && old.items.find(x => x.id === r.id), id = prev ? prev.id : itemId(sid, items.length);
    const reps = Math.max(1, Math.round(r.reps || 1)), d = r.distanceM || null, kpi = statKpi(r.stat, d), rounds = Math.max(1, g.rounds || 1), slots = reps * rounds;
    if (r.stat === 'Start' || (r.startType && r.startType !== 'push' && r.sprint)) starts += slots;
    const base = { id, seriesId: g.id, title: rowLabel({ ...r, reps }), desc: r.desc || '', sub: rowSub(r), reps, distanceM: d, equipment: r.equipment || '', timingMode: r.timingMode || '', timingValue: r.timingValue || '',
      sprint: !!r.sprint, stat: r.stat || '', kpi, rest: r.timingMode === 'vila' ? r.timingValue : '', intensity: r.intensity || '', cues: r.cues || '', stroke: /frisim|crawl/i.test(r.desc || '') ? 'frisim' : 'fjäril', details: {}, restrictionIds: r.restrictionIds || [],
      startType: r.startType || '', equip: r.equip || [], segments: r.segments || [], stopCriterion: r.stopCriterion || '', event: r.event || '', rounds, exec: (prev && prev.exec) || null };
    if (d && (r.sprint || LOGGABLE.includes(r.stat) || r.startType || (r.segments || []).length || r.timed)) { const res = (prev && prev.results) || []; items.push({ ...base, kind: 'swim', results: Array.from({ length: slots }, (_, k) => res[k] || null) }); }
    else items.push({ ...base, kind: 'check', done: prev ? !!prev.done : false });
  }));
  return { series: out, items, starts };
}
function edSave() {
  if (!edValidate(true)) { haptic(30); const b = document.querySelector('#editor .bad'); b && b.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  if (BACKEND && !SB.athleteId) return toast('Bjud in simmaren först (Data → Grupp)');
  if (!ED.title) ED.title = TYPE_LABEL[ED.type] + 'pass';
  const old = ED.id && DB.sessions[ED.id];
  const id = old ? ED.id : genId(ED.date);
  const s = old ? JSON.parse(JSON.stringify(old)) : makeSession(ED.date, { tid: 'manual', type: ED.type, title: ED.title, start: ED.start, end: ED.end, items: [] });
  Object.assign(s, { id, date: ED.date, isoWeek: isoWeek(parseYmd(ED.date)).key, type: ED.type, title: ED.title, start: ED.start, end: ED.end,
    plannedMin: Math.max(0, minutesBetween(ED.start, ED.end)), purpose: ED.purpose || '', startsCount: ED.type === 'swim' ? (ED.startsCount ?? null) : null,
    poolM: ED.type === 'swim' ? (ED.poolM || 25) : null });
  if (!old) Object.assign(s, { source: { kind: 'manual' }, planStatus: 'utkast', version: 1, _new: true, athleteId: BACKEND ? SB.athleteId : s.athleteId, author: (STORE.user() || {}).email || 'Coach' });
  Object.assign(s, { focus: ED.focus || '', rpeTarget: ED.rpeTarget ?? null, rationale: ED.rationale || '', restrictionIds: ED.restrictionIds || [] });
  if (ED.type === 'swim') { const b = buildSeries(ED.series, id, old); s.series = b.series; s.items = b.items; if (ED.startsCount == null) s.startsCount = b.starts || null; }
  else { s.series = []; s.items = buildItems(ED.type, ED.items, id, old); }
  if (old && JSON.stringify(planOf(old)) === JSON.stringify(planOf(s))) { edClose(); return; }
  markPlan(s); s.updatedBy = (STORE.user() || LOCAL_USER).id; DB.sessions[id] = s; save(); edClose(); haptic();
  toast(old ? (old.planStatus === 'godkand' ? 'Sparat – väntar på nytt godkännande' : 'Passet är sparat') : 'Passet är skapat som utkast');
  const d = parseYmd(s.date); WK.monday = mondayOf(d); WK.day = (d.getDay() + 6) % 7; weekRender();
}
const planOf = s => ({ d: s.date, t: s.type, ti: s.title, a: s.start, b: s.end, p: s.purpose || '', sc: s.startsCount ?? null, f: s.focus || '', r: s.rpeTarget ?? null, m: s.rationale || '', ri: s.restrictionIds || [], se: s.series || [],
  i: s.items.map(it => { const { results, sets, done, plan, ...r } = it; return r; }) });
function edDelete() {
  const s = DB.sessions[ED.id], logged = s.log.status === 'logged' || s.items.some(hasData);
  if (!confirm(logged ? 'Passet har loggade värden. Radera ändå?' : 'Radera passet?')) return;
  delete DB.sessions[ED.id]; (DB.meta.deleted = DB.meta.deleted || []).push(ED.id); save(); edClose(); dayRender(); weekSummary();
  toast('Passet är raderat', 'Ångra', () => { DB.sessions[s.id] = s; DB.meta.deleted = DB.meta.deleted.filter(x => x !== s.id); s._planDirty = true; s._new = true; save(); dayRender(); });
}
/* Kopia av ett pass (endast plan, inga loggade värden) */
function clonePlan(s, date) {
  const id = genId(date), c = makeSession(date, { tid: 'manual', type: s.type, title: s.title, start: s.start, end: s.end, items: [] });
  Object.assign(c, { id, purpose: s.purpose || '', startsCount: s.startsCount ?? null, source: { kind: 'manual', copiedFrom: s.id }, planStatus: 'utkast', version: 1, _new: true,
    athleteId: BACKEND ? SB.athleteId : c.athleteId, author: (STORE.user() || {}).email || 'Coach' });
  Object.assign(c, { focus: s.focus || '', rpeTarget: s.rpeTarget ?? null, rationale: s.rationale || '', restrictionIds: [...(s.restrictionIds || [])] });
  if (s.type === 'swim') { const b = buildSeries(seriesOf(s).map(g => ({ ...g, id: seriesId(), rows: g.rows.map(r => ({ ...r, id: null })) })), id, null); c.series = b.series; c.items = b.items; }
  else c.items = buildItems(s.type, s.items.map(it => { const e = toEditable(it); delete e.id; return e; }), id, null);
  c._planDirty = true; return c;
}
function edDuplicate() {
  const s = DB.sessions[ED.id]; const d = prompt('Kopiera passet till datum (ÅÅÅÅ-MM-DD)', ymd(addDays(parseYmd(s.date), 7)));
  if (!d) return; if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(parseYmd(d))) return toast('Ogiltigt datum');
  const c = clonePlan(s, d); touch(c); DB.sessions[c.id] = c; save(); edClose();
  const dd = parseYmd(d); WK.monday = mondayOf(dd); WK.day = (dd.getDay() + 6) % 7; weekRender(); toast(`Kopierat till ${prettyDate(dd)}`);
}
function copyWeek() {
  const src = Array.from({ length: 7 }, (_, i) => sessionsOn(ymd(addDays(WK.monday, i)))).flat();
  if (!src.length) return toast('Veckan har inga pass att kopiera');
  const next = addDays(WK.monday, 7);
  if (!confirm(`Kopiera ${src.length} pass till vecka ${isoWeek(next).w}? Pass som redan finns där (samma tid och titel) hoppas över.`)) return;
  let n = 0;
  src.forEach(s => { const d = ymd(addDays(parseYmd(s.date), 7)); if (sessionsOn(d).some(x => x.title === s.title && x.start === s.start)) return; const c = clonePlan(s, d); touch(c); DB.sessions[c.id] = c; n++; });
  save(); WK.monday = next; WK.day = 0; weekRender(); haptic(); toast(`${n} pass kopierade till vecka ${isoWeek(next).w}`);
}
/* Mallar: inbyggda (standardveckan) + egna (sparas på enheten) */
function userTemplates() { try { return JSON.parse(localStorage.getItem('oh-templates')) || []; } catch (e) { return []; } }
function templatesFor(type) {
  const own = userTemplates().filter(t => t.type === type);
  const builtIn = TEMPLATE.flat().filter(t => t.type === type || (type === 'mobility' && t.type === 'core')).map(t => { const m = makeSession('2026-01-05', t); return { ...t, series: m.series, rationale: m.rationale, items: m.items.map(toEditable) }; });
  const seen = new Set(); return [...own, ...builtIn].filter(t => { const k = t.title + t.items.length; if (seen.has(k)) return false; seen.add(k); return true; });
}
function edFromTemplate(i) {
  if (i === '') return; const t = templatesFor(ED.type)[+i];
  Object.assign(ED, { title: t.title, start: t.start || ED.start, end: t.end || ED.end, purpose: t.purpose || '', focus: t.focus || '', rpeTarget: t.rpeTarget ?? null, rationale: t.rationale || '', items: t.items.map(x => { const e = { ...x }; delete e.id; delete e.results; delete e.sets; return e; }) });
  if (ED.type === 'swim') ED.series = (t.seriesDraft || seriesOf({ series: t.series || [], items: t.items })).map(g => ({ ...g, id: seriesId(), rows: g.rows.map(r => ({ ...r, id: null })) }));
  ED.errors = {}; edRender();
}
function saveTemplate() {
  const name = prompt('Namn på mallen', ED.title); if (!name) return;
  const list = userTemplates().filter(t => !(t.title === name && t.type === ED.type));
  list.unshift({ title: name, type: ED.type, start: ED.start, end: ED.end, purpose: ED.purpose || '', focus: ED.focus || '', rpeTarget: ED.rpeTarget ?? null, rationale: ED.rationale || '',
    seriesDraft: ED.type === 'swim' ? JSON.parse(JSON.stringify(ED.series)) : null, items: ED.type === 'swim' ? [] : ED.items.map(x => { const e = { ...x }; delete e.id; delete e.results; delete e.sets; delete e.done; return e; }) });
  localStorage.setItem('oh-templates', JSON.stringify(list.slice(0, 40))); toast(`Mallen ”${name}” är sparad på enheten`);
}

/* ---------- Planstatus ---------- */
function approveSession(id) {
  const s = DB.sessions[id]; s.planStatus = 'godkand'; s.approvedAt = new Date().toISOString(); s._approve = true; touch(s); save(); haptic(); dayRender(); toast('Passet är godkänt');
}
function approveDay(ds) { sessionsOn(ds).filter(s => s.planStatus === 'utkast').forEach(s => { s.planStatus = 'godkand'; s.approvedAt = new Date().toISOString(); s._approve = true; touch(s); }); save(); haptic(); dayRender(); toast('Dagens pass är godkända'); }
function statusChip(s) {
  if (s.planStatus !== 'utkast') return '';
  return `<span class="chip draft">${isCoach() ? 'Utkast · väntar på simmaren' : 'Utkast'}</span>`;
}

/* ---------- Kost: plan per dagstyp, dagsplan och tävlingsrutin ----------
   Tillåtet (Oskar 2026-10-12): måltider, klockslag, livsmedel, mängder, protein och kolhydrater per måltid,
   mat före/efter pass kopplat till passet och tävlingsrutin. Inga kcal-/energimål, underskottsdagar, vikt,
   kroppssammansättning, brytkriterier, skattningar eller tillskott med doser – och ingen loggning av intag. */
const DAY_TYPE = { traning: 'Träningsdag', dubbelpass: 'Dubbelpassdag', vila: 'Vilodag', tavling: 'Tävlingsdag' };
const REL = { fore_pass: 'Före pass', efter_pass: 'Efter pass' };
function nutDB() {
  let N = DB.nutrition;
  if (!N || !N.plans || N.plans.some(p => p.scope === 'phase' || p.targets)) {   // migrering: äldre faser med energimål tas bort
    const keep = ((N && N.plans) || []).filter(p => p.scope === 'day' || p.scope === 'daytype' || p.scope === 'competition').map(p => { const q = { ...p }; delete q.targets; delete q.phase; q.meals = (q.meals || []).map(m => m.foods ? m : { time: m.time || '', name: '', foods: [], content: m.text || m.content || '' }); return q; });
    DB.nutrition = N = { plans: keep, deletedPlans: ((N && N.deletedPlans) || []).concat(((N && N.plans) || []).filter(p => !keep.find(k => k.id === p.id)).map(p => p.id)) };
  }
  delete N.logs; N.deletedPlans = N.deletedPlans || []; return N;
}
function dayTypeOf(ds) {
  const ss = sessionsOn(ds).filter(s => s.type !== 'imagery' && !s.optional);
  if (ss.some(s => s.type === 'competition')) return 'tavling';
  return ss.length >= 2 ? 'dubbelpass' : ss.length ? 'traning' : 'vila';
}
const inRange = (p, ds) => (!p.validFrom || p.validFrom <= ds) && (!p.validTo || ds <= p.validTo);
function nutritionFor(ds) {
  const P = nutDB().plans, dt = dayTypeOf(ds);
  return P.find(p => p.scope === 'day' && p.date === ds)
    || P.find(p => p.scope === 'competition' && (p.date === ds || (p.dates || []).includes(ds)))
    || P.find(p => p.scope === 'daytype' && p.dayType === dt && inRange(p, ds))
    || (dt === 'dubbelpass' ? P.find(p => p.scope === 'daytype' && p.dayType === 'traning' && inRange(p, ds)) : null) || null;
}
const nutTitle = p => p.name || (p.scope === 'daytype' ? DAY_TYPE[p.dayType] || 'Kostplan' : p.scope === 'competition' ? 'Tävlingsrutin' : 'Dagsplan');
const nutWhen = p => p.scope === 'daytype' ? `${DAY_TYPE[p.dayType] || ''}${p.validFrom || p.validTo ? ` · ${p.validFrom || '…'} – ${p.validTo || '…'}` : ' · tills vidare'}` : p.scope === 'competition' ? 'Tävling ' + (p.dates || [p.date]).join(', ') : 'Dag ' + p.date;
const foodText = m => (m.foods || []).map(f => f.amount ? `${f.item} ${f.amount}` : f.item).join(', ') || m.content || '';
function mealSession(m, ds) {
  if (m.sessionRef) { const s = findByClient(m.sessionRef); if (s && s.date === ds) return s; }
  if (m.sessionId) { const s = DB.sessions.find(x => x.id === m.sessionId); if (s && s.date === ds) return s; }
  if (!m.relation) return null; const ss = sessionsOn(ds).filter(s => s.type !== 'imagery');
  return m.relation === 'fore_pass' ? ss[0] || null : ss[ss.length - 1] || null;
}
function mealsFor(ds) { const n = nutritionFor(ds); return n ? n.meals.map(m => ({ ...m, sess: mealSession(m, ds) })) : []; }
const sessShort = s => `${TYPE_NAME[s.type].toLowerCase()} ${s.start.replace(':', '.')}`;
function nutritionHTML(ds) {
  const n = nutritionFor(ds);
  if (!n && !isCoach()) return '';
  const meals = n ? mealsFor(ds) : [], P = meals.reduce((a, m) => a + (m.protein || 0), 0), C = meals.reduce((a, m) => a + (m.carbs || 0), 0);
  return `<div class="card nut"><div class="sh"><div><div class="type"><i style="background:var(--mut2)"></i>Kost · <span class="phase">${DAY_TYPE[dayTypeOf(ds)]}</span></div><h3>${n ? esc(nutTitle(n)) : 'Kostplan'}</h3>
    <div class="status">${!n ? 'Ingen plan för dagstypen' : n.scope === 'day' ? 'Gäller bara i dag' : n.scope === 'competition' ? 'Tävlingsrutin' : 'Plan för ' + DAY_TYPE[n.dayType].toLowerCase()}${P || C ? ` · protein ${P} g · kolhydrater ${C} g` : ''}</div></div>
    ${isCoach() ? `<button class="link" onclick="editNutrition('${ds}')">${n ? 'Redigera' : 'Lägg till'}</button>` : ''}</div>
  ${n ? `<div class="meals">${meals.map(m => `<div class="meal"><span>${esc(m.time ? m.time.replace(':', '.') : m.when)}</span><div>${m.name ? `<b>${esc(m.name)}</b>` : ''}${m.relation ? `<em class="rel">${REL[m.relation]}${m.sess ? ' · ' + esc(sessShort(m.sess)) : ''}</em>` : ''}<p>${esc(foodText(m))}</p>${m.content && (m.foods || []).length ? `<p class="fine">${esc(m.content)}</p>` : ''}</div>
    <small>${m.protein != null ? `P ${m.protein} g` : ''}${m.carbs != null ? `<br>K ${m.carbs} g` : ''}</small></div>`).join('')}</div>${n.note ? `<p class="fine">${esc(n.note)}</p>` : ''}` : ''}</div>`;
}
/* Mat före/efter pass visas också på passet */
function mealsForSession(s) { return mealsFor(s.date).filter(m => m.sess && m.sess.id === s.id); }
function editNutrition(ds) {
  const cur = nutritionFor(ds), dt = dayTypeOf(ds), base = cur || { scope: 'daytype', dayType: dt, meals: [] };
  ED = { nut: true, ds, id: cur ? cur.id : null, scope: base.scope, dayType: base.dayType || dt, name: base.name || '', dates: (base.dates || (base.date && base.scope === 'competition' ? [base.date] : [ds])).join(', '),
    validFrom: base.validFrom || '', validTo: base.validTo || '', note: base.note || '',
    meals: (base.meals || []).map(m => ({ time: m.time || '', when: m.when || '', name: m.name || '', foodsText: (m.foods || []).map(f => f.amount ? `${f.item}: ${f.amount}` : f.item).join('\n') || m.content || '', protein: m.protein ?? null, carbs: m.carbs ?? null, relation: m.relation || '', sessionRef: m.sessionRef || '', sessionId: m.sessionId || null })), errors: {} };
  nutRender(); edOpen();
}
function nutScope(sc) { if (ED.scope !== sc) ED.id = null; ED.scope = sc; nutRender(); }
function nutRender() {
  const E = ED.errors, sc = ED.scope;
  document.getElementById('editor').innerHTML = `<div class="sheet card" role="dialog" aria-modal="true" aria-label="Kostplan"><div class="grab"></div>
  <div class="eh"><button class="link" onclick="edClose()">Avbryt</button><h2>Kostplan</h2><button class="link strong" onclick="nutSave()">Spara</button></div>
  <div class="seg"><button class="${sc === 'daytype' ? 'on' : ''}" onclick="nutScope('daytype')">Dagstyp</button><button class="${sc === 'day' ? 'on' : ''}" onclick="nutScope('day')">Bara ${prettyDate(parseYmd(ED.ds))}</button><button class="${sc === 'competition' ? 'on' : ''}" onclick="nutScope('competition')">Tävlingsrutin</button></div>
  <div class="ef">
    ${sc === 'daytype' ? `<label>Dagstyp<select onchange="ED.dayType=this.value">${Object.entries(DAY_TYPE).map(([k, v]) => `<option value="${k}" ${k === ED.dayType ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Från (valfritt)<input type="date" value="${ED.validFrom}" onchange="ED.validFrom=this.value"></label><label class="${E.validTo ? 'bad' : ''}">Till (valfritt)<input type="date" value="${ED.validTo}" onchange="ED.validTo=this.value">${E.validTo ? `<em>${E.validTo}</em>` : ''}</label>` : ''}
    ${sc === 'competition' ? `<label class="wide2 ${E.dates ? 'bad' : ''}">Tävlingsdagar<input value="${esc(ED.dates)}" placeholder="2026-11-27, 2026-11-28" onchange="ED.dates=this.value">${E.dates ? `<em>${E.dates}</em>` : ''}</label>` : ''}
    <label class="wide2">Namn (valfritt)<input value="${esc(ED.name)}" maxlength="60" placeholder="${sc === 'daytype' ? DAY_TYPE[ED.dayType] : sc === 'competition' ? 'Tävlingsrutin' : 'Dagsplan'}" onchange="ED.name=this.value.trim()"></label></div>
  <p class="hint">${sc === 'daytype' ? 'Dagstypen avgörs av dagens pass: inget pass = vilodag, ett = träningsdag, två eller fler = dubbelpassdag, tävling = tävlingsdag.' : sc === 'day' ? 'Dagsplanen ersätter planen för dagstypen just den här dagen.' : 'Tävlingsrutinen gäller de angivna dagarna.'} Mat före och efter pass kopplas till dagens första respektive sista pass.</p>
  <div class="eitems">${ED.meals.map((m, i) => `<div class="ei"><div class="eih"><b>Måltid ${i + 1}</b><button class="link danger-t" onclick="ED.meals.splice(${i},1);nutRender()">Ta bort</button></div>
    <div class="ef"><label class="${E['m' + i] ? 'bad' : ''}">Klockslag<input class="tm" inputmode="numeric" maxlength="5" placeholder="hh:mm" value="${esc(m.time)}" onchange="ED.meals[${i}].time=normTime(this.value);this.value=ED.meals[${i}].time">${E['m' + i] ? `<em>${E['m' + i]}</em>` : ''}</label>
    <label>eller när<input value="${esc(m.when)}" maxlength="40" placeholder="3 h före start" onchange="ED.meals[${i}].when=this.value.trim()"></label>
    <label>Namn<input value="${esc(m.name)}" maxlength="60" placeholder="Frukost" onchange="ED.meals[${i}].name=this.value.trim()"></label>
    <label>Koppling<select onchange="ED.meals[${i}].relation=this.value"><option value="">Ingen</option>${Object.entries(REL).map(([k, v]) => `<option value="${k}" ${m.relation === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="wide2 ${E['f' + i] ? 'bad' : ''}">Livsmedel och mängd (en per rad)<textarea rows="3" placeholder="Havregryn: 1 dl&#10;Mjölk: 2 dl" onchange="ED.meals[${i}].foodsText=this.value">${esc(m.foodsText)}</textarea>${E['f' + i] ? `<em>${E['f' + i]}</em>` : ''}</label>
    <label>Protein g<input inputmode="decimal" value="${m.protein ?? ''}" onchange="ED.meals[${i}].protein=num(this.value)"></label><label>Kolhydrater g<input inputmode="decimal" value="${m.carbs ?? ''}" onchange="ED.meals[${i}].carbs=num(this.value)"></label></div></div>`).join('')}</div>
  <button class="btn sec wide" onclick="ED.meals.push({time:'',when:'',name:'',foodsText:'',protein:null,carbs:null,relation:''});nutRender()">+ Lägg till måltid</button>
  <label class="wide2 fl">Anteckning till planen (valfri)<input value="${esc(ED.note)}" maxlength="500" placeholder="t.ex. välkända livsmedel på tävlingsdagen" onchange="ED.note=this.value"></label>
  <div class="act">${ED.id ? '<button class="btn sec danger" onclick="nutDelete()">Radera planen</button>' : ''}<button class="btn" onclick="nutSave()">Spara kostplan</button></div></div>`;
}
function parseFoods(t) { return String(t || '').split('\n').map(x => x.trim()).filter(Boolean).map(x => { const i = x.lastIndexOf(':'); return i > 0 ? { item: x.slice(0, i).trim(), amount: x.slice(i + 1).trim() } : { item: x, amount: '' }; }); }
function nutSave() {
  const E = {}, sc = ED.scope;
  if (sc === 'daytype' && ED.validFrom && ED.validTo && ED.validTo < ED.validFrom) E.validTo = 'Slutdatum före startdatum';
  const dates = sc === 'competition' ? ED.dates.split(/[,\s]+/).filter(Boolean) : [];
  if (sc === 'competition' && (!dates.length || dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d)))) E.dates = 'Ange datum som ÅÅÅÅ-MM-DD, kommaseparerade';
  const meals = ED.meals.map((m, i) => ({ i, time: m.time, when: m.when, name: m.name, foods: parseFoods(m.foodsText), protein: m.protein, carbs: m.carbs, relation: m.relation, sessionRef: m.relation ? m.sessionRef : '', sessionId: m.relation ? m.sessionId : null, content: '' }))
    .filter(m => m.time || m.when || m.name || m.foods.length);
  meals.forEach(m => { if (!m.time && !m.when) E['m' + m.i] = 'Ange klockslag eller när'; if (!m.foods.length) E['f' + m.i] = 'Ange minst ett livsmedel'; const big = (m.protein ?? 0) > 200 || (m.carbs ?? 0) > 400 || (m.protein ?? 0) < 0 || (m.carbs ?? 0) < 0; if (big) E['f' + m.i] = 'Protein 0–200 g, kolhydrater 0–400 g per måltid'; });
  ED.errors = E; if (Object.keys(E).length) { haptic(30); return nutRender(); }
  meals.forEach(m => delete m.i); meals.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  const N = nutDB();
  let p = ED.id && N.plans.find(x => x.id === ED.id);
  if (!p && sc === 'day') p = N.plans.find(x => x.scope === 'day' && x.date === ED.ds);
  if (!p && sc === 'daytype') p = N.plans.find(x => x.scope === 'daytype' && x.dayType === ED.dayType && (x.validFrom || '') === ED.validFrom && (x.validTo || '') === ED.validTo);
  if (!p) { p = { id: genId('kost') }; N.plans.push(p); }
  Object.assign(p, { scope: sc, name: ED.name, note: ED.note, meals, dayType: sc === 'daytype' ? ED.dayType : null, date: sc === 'day' ? ED.ds : null, dates: sc === 'competition' ? dates : null,
    validFrom: sc === 'daytype' ? ED.validFrom || null : null, validTo: sc === 'daytype' ? ED.validTo || null : null, _dirty: true });
  save(); edClose(); dayRender(); toast('Kostplanen är sparad');
}
function nutDelete() { if (!confirm('Radera kostplanen?')) return; const N = nutDB(), i = N.plans.findIndex(x => x.id === ED.id); if (i >= 0) { N.deletedPlans.push(N.plans[i].id); N.plans.splice(i, 1); } save(); edClose(); dayRender(); }
function seedNutrition(d) {
  const F = (...a) => a.map(x => { const [item, amount] = x.split(': '); return { item, amount: amount || '' }; });
  d.nutrition = { deletedPlans: [], plans: [
    { id: 'demo-kost-traning', scope: 'daytype', dayType: 'traning', name: 'Träningsdag', meals: [
      { time: '07:00', name: 'Frukost', foods: F('Havregrynsgröt: 1 dl gryn', 'Mjölk: 2 dl', 'Bär: 1 dl', 'Ägg: 2 st'), protein: 30, carbs: 70 },
      { time: '12:00', name: 'Lunch', foods: F('Kyckling: 150 g', 'Ris: 2 dl kokt', 'Grönsaker: 2 nävar'), protein: 40, carbs: 85 },
      { when: '60–90 min före', name: 'Före pass', relation: 'fore_pass', foods: F('Banan: 1 st', 'Yoghurt: 2 dl'), protein: 10, carbs: 40 },
      { when: 'inom 30 min efter', name: 'Efter pass', relation: 'efter_pass', foods: F('Chokladmjölk: 4 dl', 'Smörgås med ost: 1 st'), protein: 20, carbs: 60 },
      { time: '19:00', name: 'Middag', foods: F('Lax: 150 g', 'Potatis: 250 g', 'Sallad'), protein: 35, carbs: 55 }] },
    { id: 'demo-kost-dubbel', scope: 'daytype', dayType: 'dubbelpass', name: 'Dubbelpassdag', meals: [
      { time: '06:15', name: 'Frukost', foods: F('Gröt: 1,5 dl gryn', 'Mjölk: 2 dl', 'Banan: 1 st'), protein: 22, carbs: 90 },
      { when: 'direkt efter första passet', name: 'Mellan passen', relation: 'efter_pass', foods: F('Smörgås med kalkon: 2 st', 'Juice: 2 dl'), protein: 25, carbs: 75 },
      { time: '12:00', name: 'Lunch', foods: F('Pasta: 200 g kokt', 'Köttfärssås: 1 portion'), protein: 40, carbs: 100 },
      { when: '60 min före sista passet', name: 'Före pass', relation: 'fore_pass', foods: F('Riskakor med honung: 3 st'), carbs: 45 },
      { time: '19:30', name: 'Middag', foods: F('Kycklinggryta: 1 portion', 'Ris: 2 dl kokt'), protein: 40, carbs: 80 }] },
    { id: 'demo-kost-vila', scope: 'daytype', dayType: 'vila', name: 'Vilodag', meals: [
      { time: '08:00', name: 'Frukost', foods: F('Fullkornsbröd: 2 skivor', 'Ägg: 2 st', 'Kvarg: 2 dl'), protein: 40, carbs: 40 },
      { time: '12:30', name: 'Lunch', foods: F('Linssoppa: 4 dl', 'Bröd: 1 skiva'), protein: 20, carbs: 60 },
      { time: '18:30', name: 'Middag', foods: F('Fisk: 150 g', 'Potatis: 200 g', 'Grönsaker'), protein: 35, carbs: 45 }] },
    { id: 'demo-kost-tavling', scope: 'competition', name: 'Tävlingsrutin', dates: [ymd(addDays(mondayOf(TODAY), 12))], note: 'Bara välkända livsmedel på tävlingsdagen', meals: [
      { when: '3 h före första start', name: 'Frukost', foods: F('Ljust bröd: 3 skivor', 'Sylt: 2 msk', 'Juice: 2 dl'), protein: 10, carbs: 90 },
      { when: 'mellan loppen', name: 'Mellan loppen', foods: F('Sportdryck: 5 dl', 'Banan: 1 st'), carbs: 55 },
      { when: 'direkt efter sista loppet', name: 'Återhämtning', foods: F('Chokladmjölk: 4 dl'), protein: 14, carbs: 44 }] }] };
}
if (DEMO && DB.meta.nutSeed !== 3) { seedNutrition(DB); DB.meta.nutSeed = 3; save(); }

