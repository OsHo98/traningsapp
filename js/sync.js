'use strict';
/* Supabase-läge: magisk länk, grupp/inbjudan, synk (offline-först: lokal cache + utkorg av ändrade pass).
   All åtkomstkontroll sker i databasen (backend/schema.sql). Klienten skickar bara det rollen får ändra:
   coach skriver plan (pass/moment/kostplan); alla medlemmar skriver logg; endast simmaren godkänner. */
const SB = { client: null, user: null, group: null, role: null, groups: [], invites: [], members: [], athleteId: null,
  state: 'idle', error: null, lastSync: null, timer: null, busy: false };
const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || '');
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const hm = t => t ? String(t).slice(0, 5) : null;

class SupabaseAdapter extends LocalStorageAdapter {
  constructor(key) { super(key); this.kind = 'supabase'; }
  user() { return SB.user ? { id: SB.user.id, email: SB.user.email, role: SB.role } : null; }
  saveAll(db) { const ok = super.saveAll(db); sbSchedule(); return ok; }
  async signOut() { if (!BACKEND.accessToken) await SB.client.auth.signOut().catch(() => {}); ['oh-sb-auth', this.key, 'oh-sb-group', 'oh-mode'].forEach(k => localStorage.removeItem(k)); location.href = location.pathname; }
}
if (BACKEND) STORE = new SupabaseAdapter(KEY);

/* ---------- Mappning rad <-> app ---------- */
const nnum = v => v == null ? null : +v;
const execOf = i => (i.exec_status || i.exec_comment || i.stopped_at_rep || i.video_url) ? { status: i.exec_status || '', comment: i.exec_comment || '', stoppedAtRep: i.stopped_at_rep ?? null, stopReason: i.stop_reason || '', videoUrl: i.video_url || '' } : null;
function rowToSession(r, items, res, sets, series = []) {
  const ser = series.filter(x => x.session_id === r.id).sort((a, b) => a.position - b.position).map(x => ({ id: x.id, title: x.title || '', rationale: x.rationale || '', rounds: x.rounds || 1,
    timingMode: x.timing_mode || '', timingValue: x.timing_value || '', workRest: x.work_rest || '', recovery: x.recovery || '', evidence: x.evidence || '', main: !!x.is_main }));
  const its = items.filter(i => i.session_id === r.id).sort((a, b) => a.position - b.position).map(i => {
    const det = { ...(i.details || {}) }, g = ser.find(x => x.id === i.series_id), rounds = g ? g.rounds : 1;
    const base = { id: i.id, kind: i.kind, rest: i.rest || '', intensity: i.intensity || '', cues: i.cues || '', note: i.note || '', details: det,
      seriesId: i.series_id || null, equip: i.equipment || [], startType: i.start_type || '', segments: i.segments || [], stopCriterion: i.stop_criterion || '', event: i.event || '', rounds,
      timingMode: i.timing_mode || '', timingValue: i.timing_value || '', sprint: !!i.sprint, stat: i.stat_tag || '', restrictionIds: i.restriction_refs || [], exec: execOf(i) };
    if (r.type === 'imagery') base.durationS = det.duration_s ?? null;
    if (i.series_id) base.desc = descOf(i.title);
    if (i.kind === 'swim') {
      const rr = Array((i.reps || 0) * rounds).fill(null);
      res.filter(x => x.item_id === i.id).forEach(x => { if (x.rep_no <= rr.length) rr[x.rep_no - 1] = { timeS: +x.time_s, method: x.method, poolM: x.pool_m, startType: x.start_type,
        segTimes: x.seg_times || {}, splits: x.splits || [], fps: x.fps ?? null, reactionS: nnum(x.reaction_s), turnInS: nnum(x.turn_in_s), turnOutS: nnum(x.turn_out_s), strokes: x.strokes ?? null, strokeRate: nnum(x.stroke_rate), videoUrl: x.video_url || '' }; });
      return { ...base, title: i.title, sub: i.sub || '', reps: i.reps, distanceM: i.distance_m, kpi: i.kpi, stroke: i.stroke || 'fjäril', results: rr };
    }
    if (i.kind === 'strength') {
      const mine = sets.filter(x => x.item_id === i.id), test = i.test_kind ? { kind: i.test_kind, method: i.test_method || '', name: det.test_name || '' } : null;
      const ss = Array.from({ length: i.target_sets || 0 }, () => ({ kg: null, reps: null, velocity: null, rir: null, done: false }));
      if (!test) mine.forEach(x => { if (x.set_no <= ss.length) ss[x.set_no - 1] = { kg: nnum(x.kg), reps: nnum(x.reps), velocity: nnum(x.velocity), rir: nnum(x.rir), done: x.done }; });
      const o = { ...base, name: i.title, plan: i.sub || '', targetSets: i.target_sets, targetReps: nnum(i.target_reps), repsMax: nnum(i.reps_max), unit: i.unit || 'reps',
        load: nnum(i.load_kg), loadText: i.load_text || '', rir: nnum(i.rir_target), rirMax: nnum(i.rir_max), rpe: nnum(i.rpe_target), rpeMax: nnum(i.rpe_max),
        velocityTarget: nnum(i.velocity_target), measureVelocity: i.measure_velocity, e1rm: i.e1rm, setPlan: i.set_plan || null, test, sets: ss };
      if (test) { const n = Math.max(1, Math.round(i.target_reps || 3)); o.attempts = Array(n).fill(null); mine.forEach(x => { if (x.value_cm != null) { while (o.attempts.length < x.set_no) o.attempts.push(null); o.attempts[x.set_no - 1] = +x.value_cm; } }); }
      return o;
    }
    return { ...base, title: i.title, sub: i.sub || '', reps: i.reps, distanceM: i.distance_m, done: i.done };
  });
  const st = hm(r.start_time) || '00:00', en = hm(r.end_time) || st;
  return { id: r.id, groupId: r.group_id, athleteId: r.athlete_id, createdBy: r.created_by, updatedBy: r.updated_by, clientId: r.client_id,
    date: r.date, isoWeek: r.iso_week, type: r.type, title: r.title, start: st, end: en, plannedMin: r.planned_min ?? Math.max(0, minutesBetween(st, en)),
    optional: !!(r.details && r.details.optional), purpose: r.purpose || '', focus: r.focus || '', rpeTarget: nnum(r.rpe_target), rpeMax: nnum(r.rpe_max), rationale: r.rationale || '', restrictionIds: r.restriction_refs || [],
    poolM: r.pool_m, eventName: r.event_name || '',
    series: ser, startsCount: r.starts_count, totalDistanceM: r.total_distance_m, details: r.details || {},
    planStatus: r.plan_status, approvedAt: r.approved_at, version: r.version, author: r.author || '',
    source: { kind: r.source_kind, templateId: r.template_id },
    program: r.program_sheet_id ? { sheetId: r.program_sheet_id, tab: r.program_tab, row: r.program_row, passId: r.program_pass_id, rawStatus: r.program_raw_status } : null,
    log: { status: r.status, rpe: nnum(r.rpe), durationMin: r.duration_min, loggedAt: r.logged_at, updatedAt: r.updated_at, poolM: r.log_pool_m, timingMethod: r.timing_method || '',
      startType: r.log_start_type || '', conditions: r.conditions || '', comment: r.log_comment || '', videoUrl: r.video_url || '',
      fps: r.log_fps ?? null, context: r.log_context || '', warmup: r.log_warmup || '', caffeine: r.log_caffeine ?? null },
    isBaseline: !!r.is_baseline,
    items: its, serverUpdatedAt: r.updated_at };
}
const SWIMLIKE = t => t === 'swim' || t === 'competition';
function sessionRow(s) {
  return { id: s.id, group_id: SB.group.id, athlete_id: s.athleteId, date: s.date, type: s.type, title: s.title,
    start_time: s.start || null, end_time: s.end || null, planned_min: s.plannedMin ?? null, purpose: s.purpose || null,
    starts_count: s.startsCount ?? null, total_distance_m: s.totalDistanceM ?? null, details: { ...(s.details || {}), optional: !!s.optional },
    focus: s.focus || null, rpe_target: s.rpeTarget ?? null, rpe_max: s.rpeMax ?? null, rationale: s.rationale || null, restriction_refs: s.restrictionIds || [],
    pool_m: SWIMLIKE(s.type) ? (s.poolM || 25) : null, event_name: s.type === 'competition' ? (s.eventName || null) : null,
    author: s.author || null, source_kind: (s.source && ['template', 'manual', 'program', 'bot'].includes(s.source.kind)) ? s.source.kind : (s.source && s.source.kind === 'import' ? 'bot' : 'manual'),
    template_id: (s.source && s.source.templateId) || null, client_id: s.clientId || s.id,
    ...(s.program ? { program_sheet_id: s.program.sheetId, program_tab: s.program.tab, program_row: s.program.row, program_pass_id: s.program.passId, program_raw_status: s.program.rawStatus } : {}),
    ...(s._new ? logRow(s) : {}) };   // planändring skriver aldrig över simmarens logg
}
const httpsOrNull = u => u && /^https:\/\/[^\s"<>]{3,}$/.test(u) && u.length <= 500 ? u : null;
function logRow(s) { const L = s.log || {}; return { ...(SB.m002 ? { log_fps: L.fps || null, log_context: L.context || null, log_warmup: L.warmup || null, log_caffeine: L.caffeine ?? null, is_baseline: !!s.isBaseline } : {}),
  status: L.status || 'planned', rpe: L.rpe ?? null, duration_min: L.durationMin ?? null, logged_at: L.loggedAt || null,
  log_pool_m: SWIMLIKE(s.type) ? (L.poolM || null) : null, timing_method: L.timingMethod ? m002Method(L.timingMethod) : null, log_start_type: L.startType || null, conditions: L.conditions || null,
  log_comment: L.comment || null, video_url: httpsOrNull(L.videoUrl) }; }
const m002Method = m => SB.m002 ? m : (m === 'touchpad' ? 'elektronisk' : m);   // utan migration 002 sparas touchpad som elektronisk
function execRow(it) { const x = it.exec || {}; return { done: !!it.done, exec_status: x.status || null, exec_comment: x.comment || null, stopped_at_rep: x.stoppedAtRep || null,
  stop_reason: x.stoppedAtRep ? (x.stopReason || 'fartfall') : (x.stopReason || null), video_url: httpsOrNull(x.videoUrl) }; }
function itemRow(it, s, pos) {
  const r = { id: it.id, session_id: s.id, group_id: SB.group.id, position: pos, kind: it.kind, title: (it.kind === 'strength' ? it.name : it.title) || 'Moment',
    sub: (it.kind === 'strength' ? it.plan : it.sub) || null, rest: it.rest || null, intensity: it.intensity || null, cues: it.cues || null, note: it.note || null, details: { ...(it.details || {}) },
    reps: null, distance_m: null, kpi: null, stroke: null, target_sets: null, target_reps: null, reps_max: null, unit: null, load_kg: null, load_text: null, rir_target: null, rir_max: null, rpe_target: null, rpe_max: null,
    velocity_target: null, measure_velocity: false, e1rm: true, set_plan: null, test_kind: null, test_method: null,
    series_id: it.seriesId || null, equipment: (it.equip || []).filter(x => EQUIP_LIST.includes(x)), start_type: it.startType || null, segments: it.segments || [], stop_criterion: it.stopCriterion || null, event: it.event || null,
    timing_mode: it.timingMode || null, timing_value: it.timingValue || null, sprint: !!it.sprint, stat_tag: it.stat || null, restriction_refs: it.restrictionIds || [] };
  if (it.kind === 'swim') Object.assign(r, { reps: it.reps, distance_m: it.distanceM, kpi: it.kpi || null, stroke: it.stroke || null });
  else if (it.kind === 'strength') { Object.assign(r, { target_sets: it.targetSets, target_reps: it.targetReps ?? null, reps_max: it.repsMax ?? null, unit: it.unit || 'reps', load_kg: it.load ?? null, load_text: it.loadText || null,
    rir_target: it.rir ?? null, rir_max: it.rirMax ?? null, rpe_target: it.rpe ?? null, rpe_max: it.rpeMax ?? null, velocity_target: it.velocityTarget ?? null, measure_velocity: !!it.measureVelocity, e1rm: it.e1rm !== false,
    set_plan: it.setPlan || null, test_kind: it.test ? it.test.kind : null, test_method: it.test ? (it.test.method || null) : null });
    if (it.test && it.test.name) r.details.test_name = it.test.name; }
  else Object.assign(r, { reps: it.reps ?? null, distance_m: it.distanceM ?? null });
  if (s._new && canPlan(s) && !isCoach()) Object.assign(r, execRow(it));   // egen tävling: genomförande följer med
  return r;
}
function planRow(p) {
  return { id: p.id, group_id: SB.group.id, athlete_id: SB.athleteId, scope: p.scope, name: p.name || null, day_type: p.scope === 'daytype' ? p.dayType : null,
    date: p.scope === 'day' ? p.date : p.scope === 'competition' ? (p.date || null) : null, dates: p.scope === 'competition' ? (p.dates && p.dates.length ? p.dates : null) : null,
    valid_from: p.scope === 'daytype' ? (p.validFrom || null) : null, valid_to: p.scope === 'daytype' ? (p.validTo || null) : null, note: p.note || null, author: p.author || null, client_id: p.clientId || p.id };
}
function mealRows(p) {
  return (p.meals || []).filter(m => m.time || m.when).map((m, i) => ({ plan_id: p.id, group_id: SB.group.id, position: i, time: m.time || null, when_text: m.when || null, name: m.name || null,
    foods: m.foods || [], protein_g: m.protein ?? null, carbs_g: m.carbs ?? null, relation: m.relation || null,
    session_id: m.relation && isUuid(m.sessionId) && DB.sessions[m.sessionId] ? m.sessionId : null, session_ref: m.sessionRef || null, content: m.content || null }));
}
/* Får den här användaren skriva passets plan? Coach alltid; simmaren bara sin egen tävling (samma regel som RLS). */
const canPlan = s => isCoach() || (s.type === 'competition' && SB.user && (!s.athleteId || s.athleteId === SB.user.id) && SB.role === 'swimmer');

/* ---------- Hämta ---------- */
async function sbAll(table, cols = '*') {
  const out = []; for (let from = 0; ; from += 1000) {
    const { data, error } = await SB.client.from(table).select(cols).eq('group_id', SB.group.id).range(from, from + 999);
    if (error) throw error; out.push(...data); if (data.length < 1000) return out;
  }
}
async function sbPull() {
  const [ss, it, rs, st, np, nm, se, rx, ci] = await Promise.all(['sessions', 'session_items', 'swim_results', 'strength_sets', 'nutrition_plans', 'nutrition_meals', 'session_series', 'restrictions', 'checkins'].map(t => sbAll(t)));
  const keepR = Object.values(DB.restrictions || {}).filter(r => r._dirty);
  DB.restrictions = {}; rx.forEach(r => { DB.restrictions[r.client_id] = { id: r.client_id, rule: r.rule, validFrom: r.valid_from, validTo: r.valid_to, until: r.until_text || '', author: r.author || '' }; });
  keepR.forEach(r => { DB.restrictions[r.id] = r; });
  const keepC = Object.values(DB.checkins || {}).filter(c => c._dirty), delC = DB.deletedCheckins || [];
  DB.checkins = {}; ci.filter(c => c.athlete_id === SB.athleteId && !delC.includes(c.date)).forEach(c => { DB.checkins[c.date] = { date: c.date, hasIssue: c.has_issue, bodyPart: c.body_part }; });
  keepC.forEach(c => { DB.checkins[c.date] = c; });
  const keep = {}; Object.values(DB.sessions).forEach(s => { if (s._dirty || s._planDirty || s._approve) keep[s.id] = s; });
  DB.sessions = {}; ss.forEach(r => { DB.sessions[r.id] = keep[r.id] || rowToSession(r, it, rs, st, se); });
  Object.values(keep).forEach(s => { if (!DB.sessions[s.id] && s._new) DB.sessions[s.id] = s; });
  const N = DB.nutrition || {}; const keepP = (N.plans || []).filter(p => p._dirty);
  const plans = np.map(p => ({ id: p.id, clientId: p.client_id, scope: p.scope, name: p.name || '', dayType: p.day_type, date: p.date, dates: p.dates, validFrom: p.valid_from, validTo: p.valid_to,
    note: p.note || '', author: p.author || '',
    meals: nm.filter(m => m.plan_id === p.id).sort((a, b) => a.position - b.position).map(m => ({ time: hm(m.time) || '', when: m.when_text || '', name: m.name || '', foods: m.foods || [],
      protein: nnum(m.protein_g), carbs: nnum(m.carbs_g), relation: m.relation || '', sessionId: m.session_id, sessionRef: m.session_ref || '', content: m.content || '' })) }));
  keepP.forEach(k => { const i = plans.findIndex(p => p.id === k.id); if (i >= 0) plans[i] = k; else plans.push(k); });
  DB.nutrition = { plans: plans.filter(p => !(N.deletedPlans || []).includes(p.id)), deletedPlans: N.deletedPlans || [] };
  DB.group = { id: SB.group.id, name: SB.group.name };
  DB.meta.userId = SB.user.id; DB.meta.lastPull = new Date().toISOString();
}

/* ---------- Skicka ---------- */
const chk = r => { if (r && r.error) throw r.error; return r; };
async function sbPushSession(s) {
  const c = SB.client;
  if (s._planDirty && canPlan(s)) {
    if (!s.athleteId || !isUuid(s.athleteId)) s.athleteId = isCoach() ? SB.athleteId : SB.user.id;
    if (!s.athleteId) throw new Error('Bjud in simmaren innan du planerar pass');
    chk(await c.from('sessions').upsert({ ...sessionRow(s), ...(s._new ? { plan_status: 'utkast' } : {}) }, { onConflict: 'id' }));
    const rows = s.items.map((it, i) => itemRow(it, s, i));
    const { data: ex } = chk(await c.from('session_items').select('id').eq('session_id', s.id));
    const gone = ex.map(x => x.id).filter(id => !rows.some(r => r.id === id));
    if (gone.length) chk(await c.from('session_items').delete().in('id', gone));
    const sers = (s.series || []).map((g, i) => ({ id: g.id, session_id: s.id, group_id: SB.group.id, position: i, title: g.title || null, rationale: g.rationale || null, rounds: g.rounds || 1,
      timing_mode: g.timingMode || null, timing_value: g.timingValue || null, work_rest: g.workRest || null, recovery: g.recovery || null, evidence: g.evidence || null, is_main: !!g.main }));
    const { data: exs } = chk(await c.from('session_series').select('id').eq('session_id', s.id));
    const goneS = exs.map(x => x.id).filter(id => !sers.some(r => r.id === id));
    if (goneS.length) chk(await c.from('session_series').delete().in('id', goneS));
    if (sers.length) chk(await c.from('session_series').upsert(sers, { onConflict: 'id' }));
    if (rows.length) chk(await c.from('session_items').upsert(rows, { onConflict: 'id' }));
  }
  if (s._logDirty && !s._new) chk(await c.from('sessions').update(logRow(s)).eq('id', s.id));
  if (s._approve) { chk(await c.from('sessions').update({ plan_status: 'godkand' }).eq('id', s.id)); }
  for (const it of s.items.filter(i => i._dirty)) {   // bara moment som användaren faktiskt ändrat
    chk(await c.from('session_items').update(execRow(it)).eq('id', it.id));
    if (it.kind === 'swim') {
      const up = [], del = [];
      (it.results || []).forEach((x, r) => x && x.timeS > 0 ? up.push({ item_id: it.id, group_id: SB.group.id, rep_no: r + 1, time_s: x.timeS, method: m002Method(METHOD_ALL[x.method] ? x.method : 'hand'),
        ...(SB.m002 ? { fps: x.method === 'video' ? (x.fps || s.log.fps || null) : null, time_of_day: s.start || null, context: s.log.context || (s.type === 'competition' ? 'tavling' : 'traning'), warmup: s.log.warmup || null, caffeine: s.log.caffeine ?? null } : {}),
        pool_m: x.poolM || s.log.poolM || s.poolM || 25, start_type: x.startType || it.startType || 'push', seg_times: x.segTimes || {}, splits: x.splits || [], reaction_s: x.reactionS ?? null,
        turn_in_s: x.turnInS ?? null, turn_out_s: x.turnOutS ?? null, strokes: x.strokes ?? null, stroke_rate: x.strokeRate ?? null, video_url: httpsOrNull(x.videoUrl) }) : del.push(r + 1));
      if (up.length) chk(await c.from('swim_results').upsert(up, { onConflict: 'item_id,rep_no' }));
      if (del.length) chk(await c.from('swim_results').delete().eq('item_id', it.id).in('rep_no', del));
    } else if (it.kind === 'strength') {
      const up = [], del = [];
      if (it.test) (it.attempts || []).forEach((v, r) => v != null ? up.push({ item_id: it.id, group_id: SB.group.id, set_no: r + 1, value_cm: v, done: true }) : del.push(r + 1));
      else (it.sets || []).forEach((x, r) => (x.kg != null || x.reps != null || x.velocity != null || x.rir != null || x.done)
        ? up.push({ item_id: it.id, group_id: SB.group.id, set_no: r + 1, kg: x.kg, reps: x.reps, velocity: x.velocity, rir: x.rir, done: !!x.done }) : del.push(r + 1));
      if (up.length) chk(await c.from('strength_sets').upsert(up, { onConflict: 'item_id,set_no' }));
      if (del.length) chk(await c.from('strength_sets').delete().eq('item_id', it.id).in('set_no', del));
    }
    delete it._dirty;
  }
  delete s._dirty; delete s._planDirty; delete s._approve; delete s._new; delete s._logDirty;
}
async function sbPush() {
  const c = SB.client, N = DB.nutrition || {};
  for (const id of [...(DB.meta.deleted || [])]) { if (isUuid(id)) chk(await c.from('sessions').delete().eq('id', id)); DB.meta.deleted = DB.meta.deleted.filter(x => x !== id); }
  for (const s of Object.values(DB.sessions).filter(s => s._dirty || s._planDirty || s._approve)) await sbPushSession(s);
  if (isCoach()) {
    for (const id of [...(N.deletedPlans || [])]) { chk(await c.from('nutrition_plans').delete().eq('id', id)); N.deletedPlans = N.deletedPlans.filter(x => x !== id); }
    for (const p of (N.plans || []).filter(p => p._dirty)) {
      chk(await c.from('nutrition_plans').upsert(planRow(p), { onConflict: 'id' }));
      chk(await c.from('nutrition_meals').delete().eq('plan_id', p.id));
      const meals = mealRows(p);
      if (meals.length) chk(await c.from('nutrition_meals').insert(meals));
      delete p._dirty;
    }
  }
  if (isCoach() && FEATURES.restrictions) for (const r of Object.values(DB.restrictions || {}).filter(r => r._dirty)) {
    chk(await c.from('restrictions').upsert({ group_id: SB.group.id, athlete_id: SB.athleteId, client_id: r.id, rule: r.rule, valid_from: r.validFrom, valid_to: r.validTo || null, until_text: r.until || null, author: r.author || null }, { onConflict: 'group_id,client_id' }));
    delete r._dirty;
  }
  if (FEATURES.checkin && !isCoach() && SB.user && SB.user.id === SB.athleteId) {
    for (const d of [...(DB.deletedCheckins || [])]) { chk(await c.from('checkins').delete().eq('group_id', SB.group.id).eq('athlete_id', SB.user.id).eq('date', d)); DB.deletedCheckins = DB.deletedCheckins.filter(x => x !== d); }
    for (const x of Object.values(DB.checkins || {}).filter(x => x._dirty && (!x.hasIssue || x.bodyPart))) {
      chk(await c.from('checkins').upsert({ group_id: SB.group.id, athlete_id: SB.user.id, date: x.date, has_issue: x.hasIssue, body_part: x.hasIssue ? x.bodyPart : null }, { onConflict: 'group_id,athlete_id,date' }));
      delete x._dirty;
    }
  }
}
function sbPending() { return Object.values(DB.sessions).filter(s => s._dirty || s._planDirty || s._approve).length + (DB.meta.deleted || []).length
  + ((DB.nutrition && DB.nutrition.plans) || []).filter(p => p._dirty).length
  + Object.values(DB.restrictions || {}).filter(r => r._dirty).length + Object.values(DB.checkins || {}).filter(x => x._dirty).length + (DB.deletedCheckins || []).length; }
async function sbSync(opts = {}) {
  if (!SB.group || SB.busy) return; SB.busy = true; sbSetState('sync');
  try {
    if (!SB.athleteId || ROUTE === 'data') await sbLoadMembers();
    if (SB.m002 == null) { const { error } = await SB.client.from('sessions').select('is_baseline').limit(1); SB.m002 = !error; }
    await sbPush(); await sbPull(); LocalStorageAdapter.prototype.saveAll.call(STORE, DB);
    SB.lastSync = new Date(); SB.error = null; sbSetState('ok');
    if (!opts.quiet && typeof go === 'function' && ROUTE) go(ROUTE, false);
  } catch (e) {
    console.warn('Synk', e); SB.error = e.message || String(e); LocalStorageAdapter.prototype.saveAll.call(STORE, DB);
    sbSetState(navigator.onLine === false || /fetch|network/i.test(SB.error) ? 'offline' : 'error');
    if (/JWT|expired|401/i.test(SB.error)) toast('Inloggningen har gått ut. Logga in igen.');
    else if (sbPending() && !opts.silentError) toast('Kunde inte synka: ' + SB.error);
  } finally { SB.busy = false; }
}
function sbSchedule() { if (!SB.group) return; clearTimeout(SB.timer); sbSetState(navigator.onLine === false ? 'offline' : 'pending'); SB.timer = setTimeout(() => sbSync({ quiet: true }), 1200); }
function sbSetState(st) {
  SB.state = st; const el = document.getElementById('syncdot'); if (!el) return;
  const n = sbPending(); el.dataset.state = st;
  el.title = { sync: 'Synkar…', ok: 'Synkad', pending: 'Sparar…', offline: `Offline – ${n} ändringar väntar`, error: 'Synkfel: ' + (SB.error || '') }[st] || '';
}
window.addEventListener('online', () => { if (SB.group) sbSync({ quiet: true }); });

/* ---------- Inloggning, grupp, inbjudan ---------- */
async function sbBoot(next) {
  SB.client = supabase.createClient(BACKEND.url, BACKEND.key, BACKEND.accessToken ? { accessToken: async () => BACKEND.accessToken }
    : { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'oh-sb-auth' } });
  if (BACKEND.accessToken) { const p = jwtPayload(BACKEND.accessToken); SB.user = { id: p.sub, email: p.email }; }
  else {
    const urlErr = Q.get('error_description') || new URLSearchParams(location.hash.slice(1)).get('error_description');
    const resetAsked = +localStorage.getItem('oh-pw-reset') > Date.now() - 864e5;
    SB.recovery = /type=recovery/.test(location.hash) || (resetAsked && Q.has('code'));
    SB.client.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') SB.recovery = true; });   // registreras före getSession så händelsen inte missas
    const { data, error } = await SB.client.auth.getSession();
    if (error) toast('Inloggningen fungerade inte: ' + sbAuthErr(error));
    else if (urlErr) toast(sbAuthErr({ message: urlErr }));
    SB.user = data && data.session ? data.session.user : null;
    if (Q.has('code') || Q.has('error_description') || /access_token|error_description/.test(location.hash)) history.replaceState(null, '', location.pathname + '#vecka');
    SB.client.auth.onAuthStateChange((ev, sess) => { if (ev === 'SIGNED_OUT' && SB.user) { SB.user = null; location.reload(); } });
  }
  if (!SB.user) return sbLoginScreen(next);
  if (SB.recovery && SB.user && !BACKEND.accessToken) { SB.recovery = false; return sbPasswordScreen(() => location.reload(), true); }
  if (DB.meta.userId && DB.meta.userId !== SB.user.id) { DB = emptyDB(); DB.meta.source = 'supabase'; }
  try { await sbLoadGroups(); } catch (e) {
    if (DB.meta.userId === SB.user.id && DB.group && DB.group.id !== LOCAL_GROUP.id) {   // offline: kör på cache
      SB.group = DB.group; SB.role = DB.meta.role; ROLE = SB.role; SB.athleteId = DB.meta.athleteId; sbSetState('offline'); return next();
    }
    return sbScreen(`<h2>Kunde inte ansluta</h2><p>${esc(e.message || e)}</p><button class="btn big wide" onclick="location.reload()">Försök igen</button>${backendFooter()}`);
  }
  if (!SB.group) return sbGroupScreen(next);
  sbEnterGroup(); next(); sbSync();
}
function sbEnterGroup() {
  ROLE = SB.role; DB.meta.role = SB.role; DB.meta.athleteId = SB.athleteId; DB.meta.userId = SB.user.id; DB.group = { id: SB.group.id, name: SB.group.name };
  localStorage.setItem('oh-sb-group', SB.group.id);
  const rp = document.getElementById('rolepill'); if (rp) rp.textContent = isCoach() ? 'Coach' : 'Simmare';
  const bd = document.querySelector('.brand .demo'); if (bd) bd.hidden = true;
  document.getElementById('login').hidden = true; sbSetState('sync');
}
/* ---------- Grupper: välja, skapa, ta bort (v1.2) ---------- */
function sbGroupLabel(g) {
  const mine = SB.user && g.createdBy === SB.user.id, dt = g.createdAt ? new Date(g.createdAt).toLocaleDateString('sv-SE') : '';
  const who = mine ? 'skapad av dig' : g.creatorEmail ? 'coach: ' + g.creatorEmail : dt ? 'skapad ' + dt : '';
  const base = `${g.name} · ${ROLE_SV[g.role] || ''}${who ? ` (${who})` : ''}`;
  const twin = SB.groups.some(x => x.id !== g.id && x.name === g.name && x.role === g.role && x.createdBy === g.createdBy);
  return twin && g.createdAt ? `${base} · ${new Date(g.createdAt).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}` : base;
}
const sbCanDeleteGroup = () => !!(SB.group && SB.user && SB.role === 'coach' && SB.group.createdBy === SB.user.id);
async function sbSwitchGroup(id) {
  if (!SB.group || id === SB.group.id) return;
  if (sbPending()) { await sbSync(); if (sbPending()) { dataRender(); return toast('Synka klart innan du byter grupp'); } }
  localStorage.setItem('oh-sb-group', id); localStorage.removeItem(STORE.key);   // cachen gäller bara en grupp
  location.reload();
}
async function sbCreateGroup(name) {
  name = (name || '').trim(); if (!name) return toast('Ange ett gruppnamn');
  if (sbPending()) await sbSync();
  const { data, error } = await SB.client.from('groups').insert({ name, created_by: SB.user.id }).select('id').single();
  if (error) return toast('Kunde inte skapa grupp: ' + error.message);
  toast('Gruppen är skapad. Du är coach.'); localStorage.setItem('oh-sb-group', data.id); localStorage.removeItem(STORE.key);
  setTimeout(() => location.reload(), 600);
}
function sbModal(html) {
  let m = document.getElementById('gmodal'); if (!m) { m = document.createElement('div'); m.id = 'gmodal'; m.className = 'gmodal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); document.body.append(m); }
  m.innerHTML = `<div class="card gsheet">${html}</div>`; m.hidden = false; document.body.classList.add('modal');
  m.onclick = e => { if (e.target === m) sbCloseModal(); }; return m;
}
function sbCloseModal() { const m = document.getElementById('gmodal'); if (m) m.hidden = true; document.body.classList.remove('modal'); }
async function sbDeleteGroupDialog() {
  if (!sbCanDeleteGroup()) return;
  const g = SB.group;
  if (!SB.m003) return sbModal(`<h2>Databasen behöver uppdateras</h2><p>För att kunna ta bort grupper behöver databasen uppdateras först. Be den som administrerar Supabase att köra <b>backend/migration-003.sql</b> (se docs/supabase-steg.md). Inget har tagits bort.</p><div class="act"><button class="btn" onclick="sbCloseModal()">OK</button></div>`);
  const { count, error } = await SB.client.from('sessions').select('id', { count: 'exact', head: true }).eq('group_id', g.id);
  const n = error ? (g.sessions ?? '?') : count;
  const m = sbModal(`<h2>Ta bort gruppen?</h2><p>Gruppen <b>${esc(g.name)}</b> och allt i den tas bort permanent: <b>${n} pass</b> med moment, tider och set, kostplaner, restriktioner, incheckningar, medlemskap och inbjudningar. Det går inte att ångra.</p>
    <label class="glabel"><span>Skriv gruppnamnet <b>${esc(g.name)}</b> för att bekräfta</span><input id="gconfirm" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
    <div class="act"><button class="btn sec" onclick="sbCloseModal()">Avbryt</button><button class="btn danger-b" id="gdelok" disabled>Ta bort grupp</button></div>`);
  const inp = m.querySelector('#gconfirm'), ok = m.querySelector('#gdelok');
  inp.oninput = () => { ok.disabled = inp.value.trim() !== g.name; }; inp.focus();
  ok.onclick = async () => {
    if (inp.value.trim() !== g.name) return; ok.disabled = true;
    const { error } = await SB.client.rpc('delete_group', { g: g.id });
    if (error) { ok.disabled = false; return toast(/Bara coachen/.test(error.message) ? 'Bara coachen som skapade gruppen kan ta bort den' : 'Kunde inte ta bort gruppen: ' + error.message); }
    const rest = SB.groups.find(x => x.id !== g.id);
    localStorage.removeItem(STORE.key); rest ? localStorage.setItem('oh-sb-group', rest.id) : localStorage.removeItem('oh-sb-group');
    sbModal(`<h2>Gruppen är borttagen</h2><p>${esc(g.name)} är borttagen.${rest ? ` Du växlas till ${esc(sbGroupLabel(rest))}.` : ''}</p>`);
    setTimeout(() => location.reload(), 900);
  };
}
async function sbLoadGroups() {
  const c = SB.client;
  const rpc = await c.rpc('my_groups');   // migration-003; saknas den används fallback nedan
  SB.m003 = !rpc.error;
  if (!rpc.error) SB.groups = (rpc.data || []).map(g => ({ id: g.id, name: g.name, role: g.role, createdBy: g.created_by, createdAt: g.created_at, creatorEmail: g.creator_email || '', coachEmails: g.coach_emails || '', sessions: g.session_count }));
  else {
    const { data: ms, error } = await c.from('memberships').select('group_id, role, groups(id, name, created_by, created_at)').eq('user_id', SB.user.id); if (error) throw error;
    SB.groups = ms.map(m => ({ id: m.group_id, name: m.groups ? m.groups.name : 'Grupp', role: m.role, createdBy: m.groups ? m.groups.created_by : null, createdAt: m.groups ? m.groups.created_at : null, creatorEmail: '' }));
    const ids = [...new Set(SB.groups.map(g => g.createdBy).filter(Boolean))];
    if (ids.length) { const { data: pr } = await c.from('profiles').select('id, email').in('id', ids); SB.groups.forEach(g => { g.creatorEmail = ((pr || []).find(p => p.id === g.createdBy) || {}).email || ''; }); }
  }
  const { data: inv } = await c.from('invitations').select('id, group_id, role, expires_at').eq('email', SB.user.email).is('accepted_at', null);
  SB.invites = (inv || []).filter(i => !SB.groups.some(g => g.id === i.group_id) && new Date(i.expires_at) > new Date());
  const want = localStorage.getItem('oh-sb-group');
  SB.group = SB.groups.find(g => g.id === want) || SB.groups[0] || null; SB.role = SB.group ? SB.group.role : null;
  if (SB.group) await sbLoadMembers();
}
async function sbLoadMembers() {
  const c = SB.client;
  const { data: mem } = await c.from('memberships').select('user_id, role').eq('group_id', SB.group.id);
  const { data: prof } = await c.from('profiles').select('id, email, display_name');
  SB.members = (mem || []).map(m => ({ ...m, email: ((prof || []).find(p => p.id === m.user_id) || {}).email || '' }));
  const sw = SB.members.filter(m => m.role === 'swimmer'); SB.athleteId = (sw.find(m => m.user_id === SB.user.id) || sw[0] || {}).user_id || null;
  if (isCoach() || SB.role === 'coach') { const { data } = await c.from('invitations').select('id, email, role, accepted_at, expires_at').eq('group_id', SB.group.id); SB.groupInvites = data || []; }
}
function sbScreen(html) { const el = document.getElementById('login'); el.innerHTML = `<div class="card">${html}</div>`; el.hidden = false; return el; }
const backendFooter = () => `<p class="fine">Ansluten till ${esc(BACKEND.url.replace(/^https?:\/\//, ''))} · <a href="#" onclick="sbDisconnect();return false">Byt backend</a></p>`;
/* ---------- Inloggning: lösenord, konto, glömt lösenord, Google, mejllänk ---------- */
const sbRedirect = () => APP_CONFIG.authRedirectUrl || (location.origin + location.pathname);
const PW_MIN = 8;
function sbAuthErr(error) {
  const m = String((error && (error.message || error.msg || error.error_description)) || error || ''), code = (error && (error.code || error.error_code)) || '', st = error && error.status;
  if (/provider is not enabled|unsupported provider/i.test(m) || code === 'provider_disabled') return 'Inloggning med Google är inte aktiverad ännu. Logga in med e-post och lösenord så länge.';
  if (/invalid login credentials/i.test(m) || code === 'invalid_credentials') return 'Fel e-postadress eller lösenord.';
  if (/email not confirmed/i.test(m) || code === 'email_not_confirmed') return 'E-postadressen är inte bekräftad ännu. Öppna länken i bekräftelsemejlet och försök igen.';
  if (/password should|weak password|at least \d+ char/i.test(m) || code === 'weak_password') return `Lösenordet är för svagt. Använd minst ${PW_MIN} tecken.`;
  if (st === 429 || /rate limit|too many|for security purposes|seconds/i.test(m) || /rate_limit/.test(code)) return 'För många försök just nu. Vänta en stund och försök igen.';
  if (/already registered|already been registered|user_already_exists/i.test(m + code)) return 'Det finns redan ett konto med den e-postadressen. Logga in, eller välj Glömt lösenord.';
  if (/same password|different from the old/i.test(m) || code === 'same_password') return 'Det nya lösenordet måste skilja sig från det gamla.';
  if (/reauthentic/i.test(m)) return 'Av säkerhetsskäl behöver du logga in på nytt innan du byter lösenord.';
  if (/fetch|network/i.test(m)) return 'Ingen kontakt med servern. Kontrollera uppkopplingen.';
  if (/signups? not allowed|signup is disabled/i.test(m)) return 'Nya konton kan inte skapas just nu.';
  return 'Något gick fel: ' + m;
}
const logo = '<img src="icons/icon-192.png" alt="" width="64" height="64">';
function sbMsg(el, txt, kind = 'err') { const m = el.querySelector('.amsg'); if (m) { m.textContent = txt || ''; m.className = 'amsg ' + kind; m.hidden = !txt; } }
async function sbBusy(btn, label, fn) { const t = btn.innerHTML; btn.disabled = true; btn.textContent = label; try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = t; } }
function sbLoginScreen(next, mode = 'login', email = '') {
  const signup = mode === 'signup';
  const el = sbScreen(`${logo}<h2>${signup ? 'Skapa konto' : 'Logga in'}</h2>
    <p>${signup ? 'Välj e-postadress och ett lösenord på minst 8 tecken.' : 'Logga in med e-post och lösenord.'}</p>
    <form id="pwform" novalidate><input name="email" type="email" required placeholder="E-postadress" autocomplete="email" autocapitalize="none" spellcheck="false" value="${esc(email)}">
      <input name="password" type="password" required placeholder="Lösenord${signup ? ' (minst 8 tecken)' : ''}" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="${signup ? PW_MIN : 1}">
      <p class="amsg err" role="alert" hidden></p>
      <button class="btn big wide" id="pwbtn">${signup ? 'Skapa konto' : 'Logga in'}</button></form>
    ${signup ? '' : '<button class="link" id="forgot">Glömt lösenord?</button>'}
    <div class="or"><span>eller</span></div>
    <button class="btn google wide" id="gbtn"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Logga in med Google</button>
    <button class="btn sec wide" id="mlbtn">Skicka inloggningslänk via e-post</button>
    <p class="swap">${signup ? 'Har du redan ett konto? <button class="link" id="swap">Logga in</button>' : 'Ny här? <button class="link" id="swap">Skapa konto</button>'}</p>
    <p class="fine">Ingen kan se gruppens data utan att vara inbjuden.</p><button class="btn sec wide" onclick="goDemo()">Tillbaka till demoläget</button>${backendFooter()}`);
  const f = el.querySelector('#pwform'), em = () => f.email.value.trim().toLowerCase();
  el.querySelector('#swap').onclick = () => sbLoginScreen(next, signup ? 'login' : 'signup', em());
  if (!signup) el.querySelector('#forgot').onclick = () => sbForgotScreen(next, em());
  el.querySelector('#mlbtn').onclick = () => sbMagicScreen(next, em());
  el.querySelector('#gbtn').onclick = e => sbBusy(e.currentTarget, 'Öppnar Google…', () => sbGoogle(el));
  f.onsubmit = async e => {
    e.preventDefault(); sbMsg(el, ''); const email = em(), password = f.password.value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sbMsg(el, 'Ange en giltig e-postadress.');
    if (!password) return sbMsg(el, 'Ange ditt lösenord.');
    if (signup && password.length < PW_MIN) return sbMsg(el, `Lösenordet är för svagt. Använd minst ${PW_MIN} tecken.`);
    await sbBusy(el.querySelector('#pwbtn'), signup ? 'Skapar konto…' : 'Loggar in…', async () => {
      if (!signup) {
        const { error } = await SB.client.auth.signInWithPassword({ email, password });
        if (error) return sbMsg(el, sbAuthErr(error));
        return location.reload();
      }
      const { data, error } = await SB.client.auth.signUp({ email, password, options: { emailRedirectTo: sbRedirect() } });
      if (error) return sbMsg(el, sbAuthErr(error));
      if (data && data.session) return location.reload();
      if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return sbMsg(el, sbAuthErr({ message: 'User already registered' }));
      sbScreen(`${logo}<h2>Bekräfta din e-post</h2><p>Vi har skickat ett bekräftelsemejl till <b>${esc(email)}</b>. Öppna länken och logga sedan in med ditt lösenord.</p>
        <button class="btn big wide" id="back">Till inloggningen</button>`).querySelector('#back').onclick = () => sbLoginScreen(next, 'login', email);
    });
  };
}
async function sbGoogle(el) {
  sbMsg(el, '');
  try {   // kontrollera först att Google är påslaget, annars hamnar man på Supabases felsida
    const r = await fetch(BACKEND.url + '/auth/v1/settings', { headers: { apikey: BACKEND.key } });
    if (r.ok) { const st = await r.json(); if (st.external && st.external.google === false) return sbMsg(el, sbAuthErr({ message: 'provider is not enabled' })); }
  } catch (e) { /* offline e.d.: låt OAuth-anropet avgöra */ }
  const { error } = await SB.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: sbRedirect() } });
  if (error) sbMsg(el, sbAuthErr(error));
}
function sbForgotScreen(next, email = '') {
  const el = sbScreen(`${logo}<h2>Glömt lösenord</h2><p>Ange din e-postadress så skickar vi en länk där du väljer ett nytt lösenord. Fungerar också om du bara har loggat in med länk tidigare.</p>
    <form id="fpform" novalidate><input name="email" type="email" required placeholder="E-postadress" autocomplete="email" autocapitalize="none" spellcheck="false" value="${esc(email)}">
    <p class="amsg err" role="alert" hidden></p><button class="btn big wide" id="fpbtn">Skicka återställningslänk</button></form>
    <button class="btn sec wide" id="back">Tillbaka</button>`);
  const f = el.querySelector('form'); el.querySelector('#back').onclick = () => sbLoginScreen(next, 'login', f.email.value.trim());
  f.onsubmit = async e => {
    e.preventDefault(); sbMsg(el, ''); const em = f.email.value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return sbMsg(el, 'Ange en giltig e-postadress.');
    await sbBusy(el.querySelector('#fpbtn'), 'Skickar…', async () => {
      const { error } = await SB.client.auth.resetPasswordForEmail(em, { redirectTo: sbRedirect() });
      if (error) return sbMsg(el, sbAuthErr(error));
      localStorage.setItem('oh-pw-reset', String(Date.now()));
      sbScreen(`${logo}<h2>Kolla din e-post</h2><p>Om det finns ett konto för <b>${esc(em)}</b> har vi skickat en länk. Öppna den i den här webbläsaren och välj ett nytt lösenord.</p>
        <button class="btn sec wide" id="back">Till inloggningen</button>`).querySelector('#back').onclick = () => sbLoginScreen(next, 'login', em);
    });
  };
}
function sbMagicScreen(next, email = '') {
  const el = sbScreen(`${logo}<h2>Logga in med länk</h2>
    <p>Ange din e-postadress så skickar vi en inloggningslänk. Öppna länken på den här enheten.</p>
    <form id="mlform" novalidate><input type="email" required placeholder="E-postadress" autocomplete="email" autocapitalize="none" spellcheck="false" value="${esc(email)}">
    <p class="amsg err" role="alert" hidden></p><button class="btn big wide" id="mlsend">Skicka inloggningslänk</button></form>
    <button class="btn sec wide" id="back">Tillbaka</button>`);
  const f = el.querySelector('form'); el.querySelector('#back').onclick = () => sbLoginScreen(next, 'login', f.querySelector('input').value.trim());
  f.onsubmit = async e => {
    e.preventDefault(); sbMsg(el, ''); const em = f.querySelector('input').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return sbMsg(el, 'Ange en giltig e-postadress.');
    await sbBusy(el.querySelector('#mlsend'), 'Skickar…', async () => {
      const { error } = await SB.client.auth.signInWithOtp({ email: em, options: { emailRedirectTo: sbRedirect(), shouldCreateUser: true } });
      if (error) return sbMsg(el, sbAuthErr(error));
      sbScreen(`${logo}<h2>Kolla din e-post</h2><p>Vi har skickat en inloggningslänk till <b>${esc(em)}</b>. Öppna den i den här webbläsaren.</p>
        <p class="fine">Installerad app på iPhone: öppna länken i Safari, välj sedan Dela → Lägg till på hemskärmen igen om det behövs.</p><button class="btn sec wide" onclick="location.reload()">Jag har klickat på länken</button>`);
    });
  };
}
/* Nytt lösenord: efter återställningslänk (PASSWORD_RECOVERY) eller "Sätt lösenord" under Data → Konto. */
function sbPasswordScreen(done, recovery = false) {
  const el = sbScreen(`${logo}<h2>${recovery ? 'Välj nytt lösenord' : 'Sätt lösenord'}</h2>
    <p>${recovery ? 'Välj ett nytt lösenord för ' : 'Sätt ett lösenord så kan du logga in med e-post och lösenord som '}<b>${esc(SB.user ? SB.user.email : '')}</b>. Minst 8 tecken.</p>
    <form id="npform" novalidate><input name="p1" type="password" required placeholder="Nytt lösenord" autocomplete="new-password" minlength="${PW_MIN}">
    <input name="p2" type="password" required placeholder="Upprepa lösenordet" autocomplete="new-password">
    <p class="amsg err" role="alert" hidden></p><button class="btn big wide" id="npbtn">Spara lösenord</button></form>
    <button class="btn sec wide" id="npcancel">${recovery ? 'Hoppa över' : 'Avbryt'}</button>`);
  const f = el.querySelector('form'), close = () => { localStorage.removeItem('oh-pw-reset'); el.hidden = true; done && done(); };
  el.querySelector('#npcancel').onclick = close;
  f.onsubmit = async e => {
    e.preventDefault(); sbMsg(el, ''); const p = f.p1.value;
    if (p.length < PW_MIN) return sbMsg(el, `Lösenordet är för svagt. Använd minst ${PW_MIN} tecken.`);
    if (p !== f.p2.value) return sbMsg(el, 'Lösenorden matchar inte.');
    await sbBusy(el.querySelector('#npbtn'), 'Sparar…', async () => {
      const { error } = await SB.client.auth.updateUser({ password: p });
      if (error) return sbMsg(el, sbAuthErr(error));
      close(); toast('Lösenordet är sparat. Nu kan du logga in med e-post och lösenord.');
    });
  };
}
function sbSetPassword() { if (!SB.client || BACKEND.accessToken) return toast('Inte tillgängligt i det här läget'); sbPasswordScreen(() => { if (SB.group) document.getElementById('login').hidden = true; }); }
function sbGroupScreen(next) {
  const inv = SB.invites[0];
  const el = sbScreen(inv
    ? `<h2>Du är inbjuden</h2><p>Du har en inbjudan till en träningsgrupp som <b>${inv.role === 'coach' ? 'coach' : 'simmare'}</b>.</p><button class="btn big wide" id="acc">Gå med i gruppen</button><p class="fine">Inloggad som ${esc(SB.user.email)} · <a href="#" onclick="STORE.signOut();return false">Logga ut</a></p>`
    : `<h2>Ingen grupp ännu</h2><p>Är du simmare: be din coach bjuda in <b>${esc(SB.user.email)}</b> och ladda sedan om.</p>
       <p>Är du coach: skapa gruppen här.</p><form id="gform"><input value="Performance Team" maxlength="80" aria-label="Gruppnamn"><button class="btn big wide">Skapa grupp</button></form>
       <button class="btn sec wide" onclick="location.reload()">Ladda om</button><p class="fine">Inloggad som ${esc(SB.user.email)} · <a href="#" onclick="STORE.signOut();return false">Logga ut</a></p>`);
  if (inv) el.querySelector('#acc').onclick = async () => {
    const { error } = await SB.client.rpc('accept_invitation', { inv: inv.id }); if (error) return toast('Kunde inte gå med: ' + error.message);
    localStorage.setItem('oh-sb-group', inv.group_id); await sbLoadGroups(); sbEnterGroup(); next(); sbSync(); toast('Välkommen till gruppen');
  };
  else el.querySelector('form').onsubmit = async e => {
    e.preventDefault(); const name = el.querySelector('input').value.trim() || 'Performance Team';
    const { data, error } = await SB.client.from('groups').insert({ name, created_by: SB.user.id }).select('id').single(); if (error) return toast('Kunde inte skapa grupp: ' + error.message);
    localStorage.setItem('oh-sb-group', data.id); await sbLoadGroups(); sbEnterGroup(); next(); sbSync(); toast('Gruppen är skapad. Bjud in simmaren under Data.');
  };
}
async function sbInvite(email, role) {
  email = (email || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Ange en giltig e-postadress');
  await SB.client.from('invitations').delete().eq('group_id', SB.group.id).eq('email', email).is('accepted_at', null);
  const { error } = await SB.client.from('invitations').insert({ group_id: SB.group.id, email, role, invited_by: SB.user.id });
  if (error) return toast(/duplicate|unique/i.test(error.message) ? 'Personen är redan inbjuden' : 'Kunde inte bjuda in: ' + error.message);
  await sbLoadMembers(); dataRender(); toast(`Inbjudan skapad. Be ${email} logga in i appen.`);
}
async function sbRevoke(id) { await SB.client.from('invitations').delete().eq('id', id); await sbLoadMembers(); dataRender(); }
function sbDisconnect() { if (!confirm('Koppla från backend på den här enheten? Lokala osynkade ändringar försvinner.')) return; if (SB.client && !BACKEND.accessToken) SB.client.auth.signOut().catch(() => {}); clearBackend(); location.href = location.pathname; }
