'use strict';
/* Import av oh-pass v1 (docs/pass-api.md) för coacher och botar: klistra in eller välj filer → validering → förhandsgranskning → import.
   Dubblettskydd: varje pass/kostplan/regel har ett stabilt "id" i filen. Samma import två gånger skapar inget nytt:
   oförändrade pass hoppas över, ändrade pass uppdateras (och blir utkast igen), pass med loggade resultat ändras aldrig.
   I Supabase-läge blir databasens id en deterministisk UUID av grupp + id, så upsert på id är idempotent även mellan enheter. */

/* Deterministisk UUID (128 bitar ur cyrb128) – samma indata ger alltid samma id */
function stableUuid(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) { k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233); h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179); }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233); h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
  const x = [h1, h2, h3, h4].map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-5${x.slice(13, 16)}-${'89ab'[parseInt(x[16], 16) & 3]}${x.slice(17, 20)}-${x.slice(20, 32)}`;
}
const impScope = () => (BACKEND && SB.group ? SB.group.id : (DB.group || LOCAL_GROUP).id);
const impSessionId = cid => BACKEND ? stableUuid(`${impScope()}:pass:${cid}`) : 'p_' + cid.replace(/[^A-Za-z0-9_\-]/g, '_');
const impPlanId = cid => BACKEND ? stableUuid(`${impScope()}:kost:${cid}`) : 'n_' + cid.replace(/[^A-Za-z0-9_\-]/g, '_');
const findByClient = cid => Object.values(DB.sessions).find(s => s.clientId === cid) || DB.sessions[impSessionId(cid)] || null;

/* oh-pass-pass → appens pass. old = befintligt pass (vid uppdatering behålls moment-id per position) */
const hasResult = o => !!(o.result || (o.series || []).some(g => (g.rows || []).some(r => r.result)) || (o.exercises || []).some(x => x.result) || (o.steps || []).some(x => x.result));
function passToSession(o, old) {
  const id = old ? old.id : impSessionId(o.id), st = o.start || '00:00', en = o.end || st, swimLike = o.type === 'swim' || o.type === 'competition';
  const s = makeSession(o.date, { tid: 'import', type: o.type, title: o.title, start: st, end: en, items: [] });
  const src = o.source || {}, R = o.result || null;
  Object.assign(s, { id, clientId: o.id, purpose: o.purpose || '', startsCount: o.starts_count ?? null, totalDistanceM: o.total_distance_m ?? null, details: { ...(o.details || {}) },
    optional: !!o.optional, author: o.author || '', focus: o.focus || '', rpeTarget: o.rpe ?? null, rpeMax: o.rpe_max ?? null, rationale: o.rationale || '',
    poolM: swimLike ? o.pool_m : null, eventName: o.event_name || '',
    restrictionIds: FEATURES.restrictions ? (o.restriction_ids || []) : [], source: { kind: src.kind || 'import' },
    program: src.sheet_id ? { sheetId: src.sheet_id, tab: src.tab, row: src.row, passId: src.pass_id, rawStatus: src.raw_status } : null, approvedInProgram: o.status === 'godkand' });
  if (R) Object.assign(s.log, { status: 'logged', rpe: R.rpe ?? null, durationMin: R.duration_min ?? null, comment: R.comment || '', videoUrl: R.video_url || '', poolM: R.pool_m ?? s.poolM,
    timingMethod: R.timing_method || '', startType: R.start_type || '', conditions: R.conditions || '', fps: R.fps ?? null, context: R.context || '', warmup: R.warmup || '', caffeine: R.caffeine ?? null, loggedAt: R.logged_at || (o.date + 'T12:00:00') });
  if (R) s.isBaseline = !!R.baseline;
  const refs = x => FEATURES.restrictions ? (x || []) : [];
  const oldIds = old ? old.items.map(it => it.id) : [], oid = k => oldIds[k] || null;
  const exec = r => r ? { status: r.status || '', comment: r.comment || '', stoppedAtRep: r.stopped_at_rep ?? null, stopReason: r.stop_reason || '', videoUrl: r.video_url || '' } : null;
  let k = 0;
  if (swimLike) {
    const rowsSrc = [];
    const b = buildSeries((o.series || []).map((g, gi) => ({ id: old && old.series && old.series[gi] ? old.series[gi].id : (BACKEND ? stableUuid(`${id}:serie:${gi}`) : `${id}_s${gi}`), title: g.title || '', rationale: g.rationale || '',
      rounds: g.rounds || 1, timingMode: g.timing_mode || '', timingValue: g.timing_value || '', workRest: g.work_rest || '', recovery: g.recovery || '', evidence: g.evidence || '', main: !!g.main,
      rows: (g.rows || []).map(r => { rowsSrc.push(r); return { id: oid(k++), reps: r.reps || 1, distanceM: r.distance_m ?? null, desc: r.description || '', equip: r.equipment || [], timingMode: r.timing_mode || '', timingValue: r.timing_value || '',
        sprint: !!r.sprint, stat: r.stat_tag || '', intensity: r.intensity || '', cues: r.cues || '', restrictionIds: refs(r.restriction_ids), startType: r.start_type || '',
        segments: (r.segments || []).map(x => ({ from: x.from_m, to: x.to_m, turn: !!x.turn })), stopCriterion: r.stop_criterion || '', event: r.event || '', timed: !!(r.result && (r.result.times || []).length) || o.type === 'competition' }; }) })), id, old);
    s.series = b.series; s.items = b.items; if (s.startsCount == null && b.starts) s.startsCount = b.starts;
    s.items.forEach((it, i) => { const r = rowsSrc[i], x = r && r.result; if (!x) return;
      it.exec = exec(x); if (it.kind === 'check') it.done = x.status === 'genomford' || x.status === 'andrad';
      (x.times || []).forEach(t => { if (it.kind !== 'swim') return; const ri = t.rep - 1; if (ri >= it.results.length) return;
        const cur = it.results[ri] || { fps: t.fps ?? (R && R.fps) ?? null, method: t.method || (R && R.timing_method) || 'hand', startType: t.start_type || it.startType || (R && R.start_type) || 'push', poolM: t.pool_m || (R && R.pool_m) || s.poolM };
        if (t.segment && t.segment > 1) { cur.segTimes = { ...(cur.segTimes || {}), [t.segment]: t.time_s }; }
        else Object.assign(cur, { timeS: t.time_s ?? null, splits: (t.splits || []).map(z => ({ at: z.at_m, t: z.time_s })), reactionS: t.reaction_s ?? null, turnInS: t.turn_in_s ?? null, turnOutS: t.turn_out_s ?? null,
          strokes: t.strokes ?? null, strokeRate: t.stroke_rate ?? null, videoUrl: t.video_url || '' });
        if (!cur.timeS && cur.splits && cur.splits.length) cur.timeS = cur.splits[cur.splits.length - 1].t;
        it.results[ri] = cur; it._dirty = true; }); });
  } else if (o.type === 'imagery') {
    s.items = buildItems('imagery', (o.steps || []).map(x => ({ id: oid(k++), title: x.text, durationS: x.duration_s ?? null })), id, old);
    s.items.forEach((it, i) => { const x = (o.steps[i] || {}).result; if (x) { it.exec = exec(x); it.done = x.status !== 'struken'; it._dirty = true; } });
  } else {
    const xs = o.exercises || [];
    s.items = buildItems(o.type, xs.map(x => ({ id: oid(k++), name: x.name, targetSets: x.sets, targetReps: x.reps ?? null, repsMax: x.reps_max ?? null, unit: x.unit || (o.type === 'gym' ? 'reps' : null),
      load: x.load_kg ?? null, loadText: x.load_text || '', rir: x.rir ?? null, rirMax: x.rir_max ?? null, rpe: x.rpe ?? null, rpeMax: x.rpe_max ?? null, velocityTarget: x.velocity_ms ?? null, rest: x.rest || '', note: x.note || '',
      setPlan: x.set_plan ? x.set_plan.map(z => ({ reps: z.reps ?? null, repsMax: z.reps_max ?? null, load: z.load_kg ?? null, loadText: z.load_text || '', rir: z.rir ?? null, velocity: z.velocity_ms ?? null })) : null,
      test: x.test ? { kind: x.test.kind, method: x.test.method || '', name: x.test.name || '' } : null,
      restrictionIds: refs(x.restriction_ids), details: { ...(x.progression ? { progression: x.progression } : {}), ...(x.modification ? { modification: x.modification } : {}) } })), id, old);
    s.items.forEach((it, i) => { const x = (xs[i] || {}).result; if (!x) return; it.exec = exec(x);
      (x.sets || []).forEach(z => { while (it.sets.length < z.set) it.sets.push({ kg: null, reps: null, velocity: null, rir: null, done: false });
        it.sets[z.set - 1] = { kg: z.kg ?? null, reps: z.reps ?? null, velocity: z.velocity_ms ?? null, rir: z.rir ?? null, done: true }; });
      if (it.test && x.attempts) { it.attempts = x.attempts.map(a => a.value_cm); }
      it._dirty = true; });
  }
  if (!BACKEND) { s.items.forEach((it, i) => { if (!oid(i)) it.id = `${id}_${i}`; }); }
  else s.items.forEach((it, i) => { if (!oid(i)) it.id = stableUuid(`${id}:moment:${i}`); });
  return s;
}
function nutToPlan(n, old) {
  const sess = cid => { const x = cid && findByClient(cid); return x ? x.id : null; };
  return { id: old ? old.id : impPlanId(n.id), clientId: n.id, scope: n.scope, name: n.name || '', dayType: n.day_type || null, date: n.date || null, dates: n.dates || null,
    validFrom: n.valid_from || null, validTo: n.valid_to || null, note: n.note || '', author: n.author || '',
    meals: (n.meals || []).map(m => ({ time: m.time || '', when: m.when || '', name: m.name || '', foods: (m.foods || []).map(f => ({ item: f.item, amount: f.amount || '' })),
      protein: m.protein_g ?? null, carbs: m.carbs_g ?? null, relation: m.relation || '', sessionId: sess(m.session_id), sessionRef: m.session_id || '', content: m.content || '' })) };
}
const ruleOf = r => ({ id: r.id, rule: r.rule, validFrom: r.valid_from, validTo: r.valid_to || null, until: r.until || '', author: r.author || '' });
const isLogged = s => s.log.status === 'logged' || s.items.some(hasData);
const samePlan = (a, b) => JSON.stringify(planOf(a)) === JSON.stringify(planOf(b)) && (a.author || '') === (b.author || '') && JSON.stringify(a.details || {}) === JSON.stringify(b.details || {}) && !!a.optional === !!b.optional;
const resultSig = s => JSON.stringify([s.log.status === 'logged' ? [s.log.rpe, s.log.durationMin, s.log.comment || '', s.log.poolM ?? null, s.log.timingMethod || '', s.log.startType || '', s.log.conditions || '', s.log.videoUrl || '', s.log.context || '', s.log.caffeine ?? null, s.isBaseline || false] : null,
  s.items.map(it => [it.exec || null, it.results || null, it.kind === 'strength' ? it.sets.map(x => x.done ? [x.kg, x.reps, x.velocity, x.rir] : null) : null, it.attempts || null, it.kind === 'check' ? !!it.done : null])]);
const nutKey = p => JSON.stringify([p.scope, p.name || '', p.dayType || '', p.date || '', p.dates || '', p.validFrom || '', p.validTo || '', p.note || '', p.meals]);

/* Analys: vad händer om dokumentet importeras? Ändrar ingenting. */
function importPlan(doc) {
  const out = [];
  if (!FEATURES.restrictions) (doc.restrictions || []).forEach(r => out.push({ kind: 'regel', obj: ruleOf(r), action: 'avstangd' }));
  else (doc.restrictions || []).forEach(r => { const old = (DB.restrictions || {})[r.id], neu = ruleOf(r);
    out.push({ kind: 'regel', obj: neu, action: !old ? 'ny' : JSON.stringify({ ...old, _dirty: undefined }) === JSON.stringify(neu) ? 'oforandrad' : 'uppdateras' }); });
  (doc.sessions || []).forEach(o => { const old = findByClient(o.id), neu = passToSession(o, old);
    const res = hasResult(o), sp = old && samePlan(old, neu);
    let action;
    if (!old) action = 'ny';
    else if (isLogged(old)) action = sp && (!res || resultSig(old) === resultSig(neu)) ? 'oforandrad' : 'skyddad';
    else action = sp && !res ? 'oforandrad' : 'uppdateras';
    out.push({ kind: 'pass', src: o, obj: neu, old, action, planChanged: !!old && !sp, results: res }); });
  (doc.nutrition || []).forEach(n => { const old = nutDB().plans.find(p => p.clientId === n.id || p.id === impPlanId(n.id)), neu = nutToPlan(n, old);
    out.push({ kind: 'kost', obj: neu, old, action: !old ? 'ny' : nutKey(old) === nutKey(neu) ? 'oforandrad' : 'uppdateras' }); });
  return out;
}
function applyImport(plan) {
  let n = 0;
  plan.filter(p => p.action === 'ny' || p.action === 'uppdateras').forEach(p => {
    if (p.kind === 'regel') { DB.restrictions = DB.restrictions || {}; DB.restrictions[p.obj.id] = { ...p.obj, _dirty: true }; }
    else if (p.kind === 'pass') {
      const s = p.obj;
      if (p.old) { s.version = p.old.version || 1; if (!p.results) s.log = p.old.log; else s._logDirty = true; s.planStatus = p.old.planStatus; s.approvedAt = p.old.approvedAt; s.athleteId = p.old.athleteId; s.createdBy = p.old.createdBy;
        if (p.planChanged) markPlan(s); }
      else Object.assign(s, { planStatus: 'utkast', version: 1, _new: true, _planDirty: true, athleteId: BACKEND ? SB.athleteId : s.athleteId });
      touch(s); DB.sessions[s.id] = s;
    } else if (p.kind === 'kost') {
      const N = nutDB(), i = N.plans.findIndex(x => x.id === p.obj.id); const v = { ...p.obj, _dirty: true };
      Object.keys(v).forEach(k => v[k] === undefined && delete v[k]); if (i >= 0) N.plans[i] = v; else N.plans.push(v);
    }
    n++;
  });
  if (n) save();
  return n;
}

/* ---------- UI ---------- */
let IMP = null;
const ACT = { ny: ['Ny', 'new'], uppdateras: ['Uppdateras', 'upd'], oforandrad: ['Finns redan', 'same'], skyddad: ['Har loggade resultat – ändras inte', 'prot'], avstangd: ['Avstängt – importeras inte', 'same'] };
function openImport() {
  if (!isCoach()) return toast('Endast coach kan importera planerade pass');
  IMP = { text: '', files: [], errors: [], warnings: [], plan: null }; impRender(); edOpen();
}
function impSummary(s) {
  if (s.type === 'swim' || s.type === 'competition') { const m = s.items.reduce((a, it) => a + (it.reps || 0) * (it.distanceM || 0), 0); return `${s.series.length} ${plural(s.series.length, 'serie', 'serier')}${m ? ` · ${m.toLocaleString('sv-SE')} m` : ''}`; }
  return `${s.items.length} ${s.type === 'imagery' ? 'moment' : plural(s.items.length, 'övning', 'övningar')}`;
}
function impRender() {
  const I = IMP, P = I.plan, cnt = a => P ? P.filter(p => p.action === a).length : 0, todo = cnt('ny') + cnt('uppdateras');
  const issue = x => `<li><code>${esc(x.file ? x.file + ' › ' : '')}${esc(x.path || 'dokument')}</code> ${esc(x.message)}</li>`;
  const byDate = P ? P.filter(p => p.kind === 'pass').sort((a, b) => (a.obj.date + a.obj.start).localeCompare(b.obj.date + b.obj.start)) : [];
  document.getElementById('editor').innerHTML = `<div class="sheet card imp" role="dialog" aria-modal="true" aria-label="Importera pass"><div class="grab"></div>
  <div class="eh"><button class="link" onclick="edClose()">Stäng</button><h2>Importera</h2><span></span></div>
  <p class="hint">Klistra in JSON i formatet <b>oh-pass v1</b> – ett pass, en vecka eller flera – eller välj en eller flera filer. Samma fil kan importeras igen utan dubbletter.</p>
  <textarea class="code" id="imptext" rows="7" spellcheck="false" autocapitalize="none" placeholder='{ "format": "oh-pass", "version": 1, "sessions": [ … ] }' oninput="IMP.text=this.value;IMP.files=[]">${esc(I.text)}</textarea>
  <div class="btns"><button class="btn" onclick="impCheck()">Granska</button><label class="btn sec">Välj filer<input type="file" accept="application/json,.json" multiple hidden onchange="impFiles(this.files);this.value=''"></label>${I.text || I.files.length ? '<button class="btn sec" onclick="IMP={text:\'\',files:[],errors:[],warnings:[],plan:null};impRender()">Rensa</button>' : ''}</div>
  ${I.files.length ? `<p class="fine">${I.files.map(f => esc(f.name)).join(', ')}</p>` : ''}
  ${I.errors.length ? `<div class="errsum" role="alert"><b>Kan inte importeras – ${I.errors.length} ${plural(I.errors.length, 'fel', 'fel')}.</b> Rätta filen och granska igen. Inget har ändrats.<ul class="issues">${I.errors.slice(0, 60).map(issue).join('')}</ul>${I.errors.length > 60 ? `<p>… och ${I.errors.length - 60} till</p>` : ''}</div>` : ''}
  ${I.warnings.length ? `<details class="warns" ${I.errors.length ? '' : 'open'}><summary>${I.warnings.length} ${plural(I.warnings.length, 'varning', 'varningar')}</summary><ul class="issues">${I.warnings.slice(0, 60).map(issue).join('')}</ul></details>` : ''}
  ${P ? `<div class="impsum"><span class="ia new">${cnt('ny')} nya</span><span class="ia upd">${cnt('uppdateras')} uppdateras</span><span class="ia same">${cnt('oforandrad')} finns redan</span>${cnt('skyddad') ? `<span class="ia prot">${cnt('skyddad')} skyddade</span>` : ''}</div>
    <div class="impl">${P.filter(p => p.kind === 'regel').map(p => `<div class="ip"><i style="background:var(--warn)"></i><div><b>Träningsregel</b><span>${esc(p.obj.rule)} · ${p.action === 'avstangd' ? 'regler är avstängda tills inloggning med RLS är verifierad' : ruleRange(p.obj)}</span></div><em class="ia ${ACT[p.action][1]}">${ACT[p.action][0]}</em></div>`).join('')}
    ${byDate.map(p => { const s = p.obj, d = parseYmd(s.date); return `<div class="ip"><i style="background:${TYPE_COLOR[s.type]}"></i><div><b>${esc(s.title)}</b><span>${DAY_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()}/${d.getMonth() + 1} · ${s.start.replace(':', '.')} · ${TYPE_NAME[s.type]} · ${impSummary(s)}${s.author ? ' · ' + esc(s.author) : ''}${p.results ? ' · <b class="resm">med resultat</b>' : ''}</span></div><em class="ia ${ACT[p.action][1]}">${ACT[p.action][0]}</em></div>`; }).join('')}
    ${P.filter(p => p.kind === 'kost').map(p => `<div class="ip"><i style="background:var(--mut2)"></i><div><b>${esc(nutTitle(p.obj))}</b><span>${esc(nutWhen(p.obj))} · ${p.obj.meals.length} måltider</span></div><em class="ia ${ACT[p.action][1]}">${ACT[p.action][0]}</em></div>`).join('')}</div>
    <p class="fine">Nya och ändrade pass blir utkast som simmaren godkänner. Pass med loggade resultat skrivs aldrig över – inte heller av importerade resultat.</p>
    <div class="act"><button class="btn" ${todo ? '' : 'disabled'} onclick="impApply()">${todo ? `Importera ${todo}` : 'Inget att importera'}</button></div>` : ''}</div>`;
}
function impFiles(fl) {
  const fs = [...fl]; if (!fs.length) return;
  Promise.all(fs.map(f => f.text().then(t => ({ name: f.name, text: t })))).then(r => { IMP.files = r; IMP.text = r.length === 1 ? r[0].text : ''; impCheck(); });
}
function impCheck() {
  const srcs = IMP.files.length ? IMP.files : [{ name: '', text: (document.getElementById('imptext') || {}).value ?? IMP.text }];
  IMP.text = srcs.length === 1 ? srcs[0].text : ''; IMP.errors = []; IMP.warnings = []; IMP.plan = null;
  if (!srcs.some(s => s.text.trim())) { IMP.errors.push({ path: '', message: 'Klistra in JSON eller välj en fil' }); return impRender(); }
  const merged = { format: 'oh-pass', version: 1, sessions: [], nutrition: [], restrictions: [] }, seen = new Map();
  srcs.forEach(src => {
    const r = PassFormat.validate(src.text), f = srcs.length > 1 ? src.name : '';
    r.errors.forEach(e => IMP.errors.push({ ...e, file: f })); r.warnings.forEach(w => IMP.warnings.push({ ...w, file: f }));
    if (!r.ok) return;
    ['sessions', 'nutrition', 'restrictions'].forEach(k => (r.doc[k] || []).forEach(x => {
      if (seen.has(x.id)) return IMP.errors.push({ file: f, path: x.id, message: `id "${x.id}" finns också i ${seen.get(x.id) || 'en annan fil'}` });
      seen.set(x.id, src.name); merged[k].push(x); }));
  });
  if (BACKEND && !SB.athleteId && merged.sessions.length) IMP.errors.push({ path: '', message: 'Bjud in simmaren först (Data → Grupp) – pass kopplas till simmaren' });
  if (!IMP.errors.length) IMP.plan = importPlan(merged);
  haptic(IMP.errors.length ? 30 : 8); impRender();
}
function impApply() {
  const P = IMP.plan; if (!P) return;
  const n = applyImport(P), first = P.filter(p => p.kind === 'pass' && (p.action === 'ny' || p.action === 'uppdateras')).map(p => p.obj.date).sort()[0];
  edClose(); haptic(12);
  toast(`${n} ${plural(n, 'post', 'poster')} importerade${first ? ' som utkast' : ''}`);
  if (first) { const d = parseYmd(first); WK.monday = mondayOf(d); WK.day = (d.getDay() + 6) % 7; location.hash = '#vecka'; if (ROUTE === 'vecka') weekRender(); }
  else if (ROUTE === 'data') dataRender(); else if (ROUTE === 'vecka') weekRender();
}
