'use strict';
/* Tävlingsresultat: simmaren (eller coachen) lägger in en tävling med lopp. Tider och splittar loggas sedan
   per lopp i samma struktur som träningstider (swim_results), med bassänglängd och starttyp. */
const COMP_DIST = [25, 50, 100, 200];
function editComp(id, ds) {
  const s = id && DB.sessions[id];
  if (BACKEND && !isCoach() && s && s.athleteId !== SB.user.id) return toast('Bara din egen tävling kan ändras');
  ED = { comp: true, id: s ? s.id : null, ds: s ? s.date : ds, title: s ? s.title : 'Tävling', eventName: s ? s.eventName || '' : '', poolM: s ? s.poolM || 25 : 25,
    start: s ? s.start : '10:00', end: s ? s.end : '12:00',
    races: s ? s.items.filter(i => i.kind === 'swim').map(i => ({ id: i.id, event: i.event || i.title, distanceM: i.distanceM || 50, startType: i.startType || 'block' })) : [{ id: null, event: '50 m fjäril', distanceM: 50, startType: 'block' }], errors: {} };
  compRender(); edOpen();
}
function compRender() {
  const E = ED.errors;
  document.getElementById('editor').innerHTML = `<div class="sheet card" role="dialog" aria-modal="true" aria-label="Tävling"><div class="grab"></div>
  <div class="eh"><button class="link" onclick="edClose()">Avbryt</button><h2>Tävling</h2><button class="link strong" onclick="compSave()">Spara</button></div>
  <div class="ef"><label class="wide2 ${E.title ? 'bad' : ''}">Namn<input value="${esc(ED.title)}" maxlength="120" onchange="ED.title=this.value.trim()">${E.title ? `<em>${E.title}</em>` : ''}</label>
    <label class="wide2">Tävling/arrangör (valfritt)<input value="${esc(ED.eventName)}" maxlength="120" onchange="ED.eventName=this.value.trim()"></label>
    <label>Start<input class="tm" inputmode="numeric" maxlength="5" value="${esc(ED.start)}" onchange="ED.start=normTime(this.value);this.value=ED.start"></label>
    <label class="${E.end ? 'bad' : ''}">Slut<input class="tm" inputmode="numeric" maxlength="5" value="${esc(ED.end)}" onchange="ED.end=normTime(this.value);this.value=ED.end">${E.end ? `<em>${E.end}</em>` : ''}</label></div>
  <div class="crow"><span>Bassäng</span><div class="seg mini">${[25, 50].map(p => `<button class="${ED.poolM === p ? 'on' : ''}" onclick="ED.poolM=${p};compRender()">${p} m</button>`).join('')}</div></div>
  <div class="eitems">${ED.races.map((r, i) => `<div class="ei"><div class="eih"><b>Lopp ${i + 1}</b>${ED.races.length > 1 ? `<button class="link danger-t" onclick="ED.races.splice(${i},1);compRender()">Ta bort</button>` : ''}</div>
    <div class="ef"><label class="wide2">Gren och omgång<input value="${esc(r.event)}" maxlength="80" placeholder="50 m fjäril, final" onchange="ED.races[${i}].event=this.value.trim()"></label>
    <label>Distans<select onchange="ED.races[${i}].distanceM=+this.value">${COMP_DIST.map(d => `<option value="${d}" ${r.distanceM === d ? 'selected' : ''}>${d} m</option>`).join('')}</select></label>
    <label>Start<select onchange="ED.races[${i}].startType=this.value">${Object.entries(START_TYPES).map(([k, v]) => `<option value="${k}" ${r.startType === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div></div>`).join('')}</div>
  <button class="btn sec wide" onclick="ED.races.push({id:null,event:'',distanceM:50,startType:'block'});compRender()">+ Lägg till lopp</button>
  <p class="hint">Tider, splittar (5, 10, 15, 25, 35 och 50 m), reaktionstid och vändning loggas på varje lopp efter att tävlingen sparats.</p>
  <div class="act">${ED.id ? '<button class="btn sec danger" onclick="compDelete()">Radera</button>' : ''}<button class="btn" onclick="compSave()">Spara tävling</button></div></div>`;
}
function compSave() {
  const E = {}; if (!ED.title) E.title = 'Ange namn'; if (ED.end <= ED.start) E.end = 'Sluttid före start';
  ED.errors = E; if (Object.keys(E).length) return compRender();
  const old = ED.id && DB.sessions[ED.id], id = old ? old.id : (BACKEND ? newId() : genId(ED.ds));
  const s = old || makeSession(ED.ds, { tid: 'tavling', type: 'competition', title: ED.title, start: ED.start, end: ED.end, items: [] });
  const serId = (old && old.series && old.series[0] && old.series[0].id) || (BACKEND ? newId() : id + '_s0');
  const prev = id => old && old.items.find(i => i.id === id);
  Object.assign(s, { id, type: 'competition', title: ED.title, eventName: ED.eventName, poolM: ED.poolM, start: ED.start, end: ED.end, plannedMin: minutesBetween(ED.start, ED.end),
    series: [{ id: serId, title: 'Lopp', rationale: '', rounds: 1, timingMode: '', timingValue: '', workRest: '', recovery: '', evidence: '', main: false }] });
  s.items = ED.races.filter(r => r.event || r.distanceM).map((r, i) => { const p = prev(r.id);
    return { id: p ? p.id : (BACKEND ? newId() : `${id}_${i}_${Date.now().toString(36)}`), kind: 'swim', seriesId: serId, title: `${r.distanceM} m · ${r.event || 'lopp'}`, sub: '', event: r.event, reps: 1, distanceM: r.distanceM,
      kpi: null, stroke: /frisim|crawl/i.test(r.event) ? 'frisim' : 'fjäril', startType: r.startType, segments: [], stopCriterion: '', equip: [], rounds: 1, sprint: true, stat: '', restrictionIds: [],
      exec: p ? p.exec : null, results: p ? p.results.slice(0, 1) : [null], _dirty: !!p }; });
  if (!old) Object.assign(s, { source: { kind: 'manual' }, planStatus: 'godkand', version: 1, _new: true, author: (STORE.user() || {}).email || 'Simmare',
    athleteId: BACKEND ? (isCoach() ? SB.athleteId : SB.user.id) : s.athleteId });
  s.log.poolM = ED.poolM; s.log.context = 'tavling'; if (!s.log.timingMethod) s.log.timingMethod = 'elektronisk';
  s._planDirty = true; touch(s); DB.sessions[id] = s; save(); edClose(); dayRender(); toast('Tävlingen är sparad – logga tiderna på loppen');
}
function compDelete() { if (!confirm('Radera tävlingen och dess tider?')) return; delete DB.sessions[ED.id]; (DB.meta.deleted = DB.meta.deleted || []).push(ED.id); save(); edClose(); dayRender(); weekSummary(); }
