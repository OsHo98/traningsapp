'use strict';
/* Datamodell v1 – se docs/datamodell.md. Allt lagras lokalt (localStorage). */
const SCHEMA_VERSION = 1;
const ATHLETE = {
  id: 'demo-athlete', name: 'Demosimmare', event: '50 m fjäril',
  focus: 'Maximal topphastighet 0–25 m fjäril',
  target: { name: 'SM', isoWeek: '2026-W50', course: 'KB (25 m)' },
  macrocycle: 'Makrocykel – Kortbana 2026'
};
/* KPI-definitioner enligt sport-scientist/kpi-och-monitorering.md (v2, 2026-10-12) */
const KPI = {
  P1: { id: 'P1', name: '25 m start till beröring', short: '25 m', distanceM: 25, goal: 10.40, hcBaseline: 11.10,
        def: 'Från startsignal till beröring av väggen. 25 m-bassäng, start från pall.' },
  P2: { id: 'P2', name: 'Tid till 15 m', short: '15 m', distanceM: 15, goal: 5.35, hcBaseline: 5.60,
        def: 'Från startsignal till att huvudet passerar 15 m-markeringen.' }
};
const TYPE_NAME = { swim: 'Sim', competition: 'Tävling', gym: 'Gym', core: 'Bål och rörlighet', imagery: 'Inre bilder' };
const TYPE_COLOR = { swim: 'var(--sim)', competition: 'var(--comp, #e8590c)', gym: 'var(--gym)', core: 'var(--bal)', imagery: 'var(--img, #8a6fd1)' };
const DAY_NAMES = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
const DAY_SHORT = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

/* ---------- Veckomall (lokal plan tills säsongsprogrammet kopplas in) ---------- */
const sw = (title, sub, reps, d, kpi, stroke = 'fjäril', o = {}) => ({ kind: 'swim', title, sub, reps, distanceM: d, kpi, stroke, ...o });
const ck = (title, sub = '') => ({ kind: 'check', title, sub });
const st = (name, plan, sets, reps, o = {}) => ({ kind: 'strength', name, plan, targetSets: sets, targetReps: reps,
  unit: o.unit || 'reps', measureVelocity: !!o.vel, e1rm: o.e1rm !== false, test: o.test || null });
const TEMPLATE = [
  [ { tid: 'mon-sim', type: 'swim', title: 'Vmax och 25:or', start: '15:00', end: '16:15', items: [
      sw('6×15 m max från pall', '3 min vila', 6, 15, 'P2', 'fjäril', { startType: 'block', segments: [{ from: 0, to: 15 }], stopCriterion: 'Stoppa vid fartfall >3 % mot dagens bästa' }), sw('4×25 m fjäril max', '4 min vila · start till beröring', 4, 25, 'P1', 'fjäril', { startType: 'block', segments: [{ from: 0, to: 25 }] }),
      ck('Buckets 4×10 s', 'Full fart mot gummiband'), ck('Deadstart till 10 m', '3 st, fokus första tagen') ] },
    { tid: 'mon-gym', type: 'gym', title: 'Kraft, underkropp', start: '16:15', end: '17:00', items: [
      st('Trap bar jump', '4×3 @ 0,9 m/s', 4, 3, { vel: 1, e1rm: false }), st('Bulgarisk split squat', '3×5 per ben', 3, 5),
      st('Medicinbollskast framåt', '3×4', 3, 4, { e1rm: false }) ] } ],
  [ { tid: 'tue-sim', type: 'swim', title: 'Lätt sim och teknik', start: '14:00', end: '15:15', items: [
      ck('1200 m lätt mix', 'Andning 1/2'), ck('8×12 m delfin under vatten', 'Undervattensfas, 1 min vila'), ck('4×25 m tekniksim', 'Timing armar–kick') ] },
    { tid: 'tue-core', type: 'core', title: 'Bål och rörlighet', start: '15:15', end: '15:45', items: [
      st('Dead bug', '3×8', 3, 8, { e1rm: false }), st('Pallof press', '3×10 per sida', 3, 10, { e1rm: false }), st('Sidoplanka', '3×30 s', 3, 30, { unit: 's', e1rm: false }) ] },
    { tid: 'tue-aer', type: 'core', title: 'Aerobt 30 min', start: '15:45', end: '16:15', items: [ ck('Cykel zon 1–2', 'Puls under 140') ] } ],
  [ { tid: 'wed-gym', type: 'gym', title: 'Överkropp', start: '16:00', end: '16:45', items: [
      st('Pull-up med vikt', '4×4 · extra vikt', 4, 4), st('Landmine press', '3×5', 3, 5), st('Nordic hamstring', '3×4', 3, 4, { e1rm: false }) ] },
    { tid: 'wed-sim', type: 'swim', title: 'Bromsad sim', start: '16:45', end: '18:00', items: [
      ck('8×12,5 m med fallskärm', '2 min vila'), ck('Buckets 6×8 s'), ck('Dyk-buckets 4 st', 'Från pall'),
      sw('3×15 m frisim max', 'Kontroll efter bromsat', 3, 15, null, 'frisim', { startType: 'push' }) ] } ],
  [ { tid: 'thu-sim', type: 'swim', title: 'Teknik och paddel', start: '14:00', end: '15:15', items: [
      ck('1000 m lätt'), ck('6×25 m fjärilsteknik', 'Fokus timing'), ck('Paddel-buckets 6×8 s') ] },
    { tid: 'thu-core', type: 'core', title: 'Bål och rörlighet', start: '15:15', end: '15:45', items: [
      st('Bird dog', '3×8 per sida', 3, 8, { e1rm: false }), st('McGill curl-up', '3×6', 3, 6, { e1rm: false }), st('Sidoplanka', '3×30 s', 3, 30, { unit: 's', e1rm: false }) ] },
    { tid: 'thu-aer', type: 'core', title: 'Aerobt 30 min', start: '15:45', end: '16:15', items: [ ck('Roddmaskin zon 1–2') ] } ],
  [ { tid: 'fri-sim', type: 'swim', title: 'Starter och undervatten', start: '14:00', end: '15:15', items: [
      ck('8× deadstart till 10 m', '3 min vila'), sw('4× deadstart till 15 m, tidtaget', 'Full återhämtning', 4, 15, 'P2', 'fjäril', { startType: 'deadstart', segments: [{ from: 0, to: 15 }] }), ck('Reaktion på signal', '6 st') ] },
    { tid: 'fri-gym', type: 'gym', title: 'Snabbhet', start: '15:15', end: '16:00', items: [
      st('CMJ', '3 hopp, bästa och medel', 1, 3, { e1rm: false, test: { kind: 'cmj', method: 'matta' } }), st('Box jump', '5×2', 5, 2, { e1rm: false }), st('Hip thrust', '3×5', 3, 5), st('Landmine rotation', '3×5 per sida', 3, 5, { e1rm: false }) ] } ],
  [ { tid: 'sat-sim', type: 'swim', title: 'Vila eller teknik', start: '09:00', end: '10:00', items: [ ck('800 m lätt teknik', 'Valfritt'), ck('Glid och streamline') ] },
    { tid: 'sat-gym', type: 'gym', title: 'Lätt gym', start: '10:00', end: '11:00', items: [
      st('Isometrisk hamstring', '3×20 s', 3, 20, { unit: 's', e1rm: false }), st('Rotatorkuff', '3×12', 3, 12, { e1rm: false }) ] } ],
  []
];
const OPTIONAL_DAYS = [5];

/* ---------- Datum ---------- */
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); return addDays(x, -((x.getDay() + 6) % 7)); };
function isoWeek(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day);
  const y = x.getUTCFullYear(); const w = Math.ceil(((x - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return { y, w, key: `${y}-W${pad2(w)}` };
}
const minutesBetween = (a, b) => { const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number); return (h2 * 60 + m2) - (h1 * 60 + m1); };
const prettyDate = d => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

/* ---------- Format ---------- */
const fmt = (n, d = 2) => (n == null || isNaN(n)) ? '–' : n.toFixed(d).replace('.', ',');
const num = v => { if (v == null) return null; const s = String(v).trim().replace(',', '.'); if (s === '') return null; const n = parseFloat(s); return isNaN(n) ? null : n; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Lagring ---------- */
const TODAY = Q.get('today') ? parseYmd(Q.get('today')) : new Date();

/* Grupp/medlemskap: speglar backend/schema.sql (groups, memberships). Lokalt är detta en mock. */
const LOCAL_GROUP = { id: 'local-group', name: 'Performance Team' };
const LOCAL_USER = { id: 'local-user', email: null, displayName: 'Demosimmare', role: 'swimmer' };
function emptyDB() {
  return { schemaVersion: SCHEMA_VERSION, athlete: ATHLETE, kpi: KPI,
    group: LOCAL_GROUP, memberships: [{ groupId: LOCAL_GROUP.id, userId: LOCAL_USER.id, role: 'swimmer' }],
    sessions: {}, nutrition: { plans: [], logs: {}, deletedPlans: [] }, restrictions: {}, checkins: {},
    meta: { createdAt: new Date().toISOString(), updatedAt: null, demo: DEMO, source: 'local' } };
}
function makeSessionBase(dateStr, tpl) {
  const id = `${dateStr}_${tpl.tid}`, d = parseYmd(dateStr);
  return {
    id, groupId: (typeof DB !== 'undefined' && DB && DB.group ? DB.group.id : LOCAL_GROUP.id), athleteId: LOCAL_USER.id,
    createdBy: LOCAL_USER.id, updatedBy: null,
    date: dateStr, isoWeek: isoWeek(d).key, type: tpl.type, title: tpl.title, start: tpl.start, end: tpl.end,
    plannedMin: minutesBetween(tpl.start, tpl.end), optional: OPTIONAL_DAYS.includes((d.getDay() + 6) % 7), poolM: tpl.type === 'swim' || tpl.type === 'competition' ? 25 : null,
    source: { kind: 'template', templateId: tpl.tid }, planStatus: 'godkand', version: 1, purpose: '', startsCount: null,
    program: null, // reserverat: { sheetId, tab, row, status: APP_CONFIG.programApprovedStatus, approvedAt } när säsongsprogrammet kopplas in
    log: { status: 'planned', rpe: null, durationMin: null, loggedAt: null, updatedAt: null, poolM: null, timingMethod: '', startType: '', conditions: '', comment: '', videoUrl: '' },
    items: tpl.items.map((it, i) => {
      const base = { id: `${id}_${i}`, kind: it.kind };
      if (it.kind === 'swim') return { ...base, title: it.title, sub: it.sub, reps: it.reps, distanceM: it.distanceM, kpi: it.kpi, stroke: it.stroke, results: Array(it.reps).fill(null),
        startType: it.startType || '', segments: it.segments || [], stopCriterion: it.stopCriterion || '', equip: [], rounds: 1, exec: null };
      if (it.kind === 'strength') return { ...base, name: it.name, plan: it.plan, targetSets: it.targetSets, targetReps: it.targetReps, unit: it.unit,
        measureVelocity: it.measureVelocity, e1rm: it.e1rm, sets: Array.from({ length: it.targetSets }, () => ({ kg: null, reps: null, velocity: null, rir: null, done: false })),
        test: it.test || null, ...(it.test ? { attempts: Array(it.targetReps).fill(null) } : {}), exec: null };
      return { ...base, title: it.title, sub: it.sub, done: false };
    }),
    series: [], focus: tpl.focus || '', rpeTarget: tpl.rpeTarget ?? ({ swim: tpl.items.some(x => x.kpi) ? 8 : 5, gym: 7, core: 4, mobility: 3 }[tpl.type] || null), rationale: tpl.rationale || '', restrictionIds: []
  };
}
/* Mallens simpass delas i serier: förberedelse (före första tidtagna serien), huvudserie, fart/teknik */
function groupSwimSeries(s) {
  if (s.type !== 'swim' || !s.items.length) return s;
  const first = s.items.findIndex(i => i.kind === 'swim'), mk = (k, t) => ({ id: `${s.id}_s${k}`, title: t, rationale: '' });
  const groups = first < 0 ? [mk(0, 'Teknik')] : [mk(0, 'Förberedelse'), mk(1, 'Huvudserie'), mk(2, 'Fart och teknik')];
  s.items.forEach((it, i) => {
    const g = first < 0 ? 0 : i < first ? 0 : it.kind === 'swim' ? 1 : 2; it.seriesId = groups[g].id;
    if (it.kind === 'swim') { it.stat = it.kpi === 'P1' ? '25 m' : it.kpi === 'P2' ? '15 m' : 'Fart'; it.sprint = true; }
    const m = /(\d+)\s*min vila/.exec(it.sub || ''); if (m) { it.timingMode = 'vila'; it.timingValue = m[1] + ' min'; }
  });
  s.series = groups.filter(g => s.items.some(i => i.seriesId === g.id));
  const main = s.series.find(g => g.title === 'Huvudserie'); if (main) Object.assign(main, { main: true, workRest: '1:20', recovery: 'full', evidence: 'mattlig',
    rationale: 'Maximala lopp under 15 s belastar främst fosfagensystemet. Full återhämtning (3–4 min) ger tid för fosfokreatin att återbildas så att varje lopp simmas i maxfart (exempel).' });
  if (!s.rationale && first >= 0) s.rationale = 'Korta maximala lopp med lång vila: hög kvalitet i start och första 15–25 m, full återhämtning mellan loppen (exempel).';
  return s;
}
function ensureWeek(monday) {
  let added = false;
  for (let i = 0; i < 7; i++) {
    const ds = ymd(addDays(monday, i));
    TEMPLATE[i].forEach(t => { const id = `${ds}_${t.tid}`; if (!DB.sessions[id]) { DB.sessions[id] = makeSession(ds, t); added = true; } });
  }
  return added;
}
function makeSession(ds, tpl) { return groupSwimSeries(makeSessionBase(ds, tpl)); }
const sessionsOn = ds => Object.values(DB.sessions).filter(s => s.date === ds).sort((a, b) => a.start.localeCompare(b.start));
const allSessions = () => Object.values(DB.sessions).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
const findItem = (sid, ii) => DB.sessions[sid] && DB.sessions[sid].items[ii];
const touch = s => { s.log.updatedAt = new Date().toISOString(); s.updatedBy = (STORE.user() || LOCAL_USER).id; s._dirty = true; };
function save() { DB.meta.updatedAt = new Date().toISOString(); STORE.saveAll(DB); }

const BODY_PARTS = ['Nacke', 'Axel', 'Armbåge', 'Handled/hand', 'Bröstrygg', 'Ländrygg', 'Höft/ljumske', 'Lår', 'Knä', 'Underben', 'Fot/fotled', 'Annat'];
/* Rensar eventuella fält som inte är tillåtna (gamla lokala data) */
function privacyClean(d) {
  Object.values(d.sessions || {}).forEach(s => { if (s.log) delete s.log.note; delete s.wellbeing; delete s.reflection; });
  const N = d.nutrition; if (N) delete N.logs;   // ingen loggning av intag
  Object.values(d.sessions || {}).forEach(s => {   // äldre resultat: metod 'manuell' -> 'hand'; bassäng och starttyp sparas alltid
    if ((s.type === 'swim' || s.type === 'competition') && !s.poolM) s.poolM = 25;
    (s.items || []).forEach(it => { if (it.kind === 'swim') it.results = (it.results || []).map(x => x ? { ...x, method: x.method === 'manuell' || x.method === 'touchpad' ? 'hand' : x.method || 'hand', poolM: x.poolM || s.poolM || 25, startType: x.startType || it.startType || 'push' } : null); }); });
  d.restrictions = d.restrictions || {}; d.checkins = d.checkins || {};
  Object.values(d.checkins).forEach(c => { if (!c.hasIssue) c.bodyPart = null; else if (!BODY_PARTS.includes(c.bodyPart)) c.bodyPart = 'Annat'; Object.keys(c).forEach(k => { if (!['date', 'hasIssue', 'bodyPart', '_dirty'].includes(k)) delete c[k]; }); });
  return d;
}

function load() {
  const got = STORE.loadAll(); if (got && got.schemaVersion === SCHEMA_VERSION) return privacyClean(got);
  const d = emptyDB();
  if (BACKEND) { d.meta.source = 'supabase'; d.memberships = []; return d; }   // fylls av sync.js efter inloggning
  if (DEMO) seedDemo(d); else migrateV2(d);
  return d;
}

/* Migrering av data från demo v2 (nyckel oh-v42, vecka 42) */
function migrateV2(d) {
  let old; try { old = JSON.parse(localStorage.getItem('oh-v42') || 'null'); } catch (e) { return; }
  if (!old || old._seed) return;
  const mon = parseYmd('2026-10-12');
  TEMPLATE.forEach((day, i) => day.forEach(t => {
    const legacyId = t.tid.replace('-core', '-bal'); const o = old[legacyId]; if (!o) return;
    const ds = ymd(addDays(mon, i)); const s = makeSession(ds, t);
    s.log.rpe = o.rpe || null; if (o.ok) { s.log.status = 'logged'; s.log.loggedAt = new Date().toISOString(); }
    s.items.forEach((it, j) => {
      if (it.kind === 'swim' && o.s && o.s[j]) it.results = it.results.map((_, r) => { const v = num(o.s[j][r]); return v ? { timeS: v, method: 'manuell' } : null; });
      if (it.kind === 'check' && o.c && o.c[j]) it.done = true;
      if (it.kind === 'strength' && o.e && o.e[j]) it.sets = it.sets.map((x, r) => { const z = o.e[j][r]; return z ? { kg: num(z[0]), reps: num(z[1]), velocity: num(z[2]), rir: num(z[3]), done: !!z[4] } : x; });
    });
    d.sessions[s.id] = s;
  }));
}

/* ---------- Syntetiska demodata (deterministiska) ---------- */
function seedDemo(d) {
  let a = 42; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const nz = s => (rnd() + rnd() + rnd() - 1.5) * s;
  const r2 = x => Math.round(x * 100) / 100;
  const cur = mondayOf(TODAY), weeks = 7;
  const GYM = { 'Bulgarisk split squat': [16, 22, 2], 'Hip thrust': [100, 120, 5], 'Pull-up med vikt': [15, 22.5, 2.5], 'Landmine press': [30, 37.5, 2.5],
    'Trap bar jump': [60, 60, 5], 'Medicinbollskast framåt': [5, 5, 1], 'Rotatorkuff': [5, 5, 1], 'Landmine rotation': [20, 25, 2.5], 'Pallof press': [10, 12.5, 2.5] };
  const deload = 3; // vecka med lägre belastning
  for (let w = weeks; w >= 0; w--) {
    const mon = addDays(cur, -7 * w), p = (weeks - w) / weeks;
    for (let i = 0; i < 7; i++) {
      const ds = ymd(addDays(mon, i));
      TEMPLATE[i].forEach(t => {
        const s = makeSession(ds, t); d.sessions[s.id] = s;
        if (w === 0) return; // innevarande vecka fylls separat nedan
        if (i === 5 && rnd() < .5) return; // lördag valfritt
        const dl = (weeks - w) === deload;
        s.log.status = 'logged'; s.log.loggedAt = ds + 'T18:00:00'; s.log.durationMin = s.plannedMin + Math.round(nz(6));
        if (t.type === 'swim') { s.log.poolM = w >= 5 && t.tid === 'mon-sim' ? 50 : 25; s.poolM = s.log.poolM; s.log.timingMethod = 'hand'; }
        s.log.rpe = Math.max(2, Math.min(10, Math.round((t.type === 'swim' ? (t.items.some(x => x.kpi) ? 8 : 5) : t.type === 'gym' ? 7 : 4) + nz(1.2) - (dl ? 1.5 : 0))));
        s.items.forEach(it => {
          if (it.kind === 'check') it.done = rnd() > .08;
          if (it.kind === 'swim') {
            const n = dl ? Math.max(2, it.reps - 2) : it.reps;
            it.results = it.results.map((_, r) => {
              if (r >= n) return null;
              let v;
              if (it.kpi === 'P2') v = Math.max(5.61, 5.77 - .15 * p + nz(.035) + r * .006);
              else if (it.kpi === 'P1') v = Math.max(11.11, 11.41 - .27 * p + nz(.06) + r * .012);
              else v = 6.35 - .1 * p + nz(.05);
              rnd(); const pool = w >= 5 && t.tid === 'mon-sim' ? 50 : 25; return { timeS: r2(v + (it.startType === 'deadstart' ? .12 : 0)), method: w % 3 === 0 ? 'video' : 'hand', poolM: pool, startType: it.startType || 'push',
                ...(it.kpi === 'P1' && r === 0 ? { splits: [{ at: 15, t: r2(v * .505) }], strokes: 9 } : {}), ...(it.kpi === 'P2' && r === 0 ? { reactionS: r2(.66 + nz(.02)) } : {}) };
            });
          }
          if (it.kind === 'strength' && it.test) { it.attempts = it.attempts.map(() => Math.round((40 + 3 * p + nz(1)) * 10) / 10); return; }
          if (it.kind === 'strength') {
            const g = GYM[it.name];
            it.sets = it.sets.map((_, r) => {
              const kg = g ? Math.round((g[0] + (g[1] - g[0]) * p * (dl ? .85 : 1) + (r === it.sets.length - 1 ? 0 : 0)) / g[2]) * g[2] : null;
              return { kg, reps: it.targetReps, velocity: it.measureVelocity ? r2(.84 + .07 * p + nz(.03) - r * .01) : null,
                rir: it.unit === 's' ? null : Math.max(0, Math.round(2.5 + nz(1) - (dl ? -1 : 0))), done: true };
            });
          }
        });
      });
    }
  }
  // Innevarande vecka: måndag loggad (samma värden som demo v2)
  const ds = ymd(cur), ms = d.sessions[`${ds}_mon-sim`], mg = d.sessions[`${ds}_mon-gym`];
  if (ms) {
    Object.assign(ms.log, { status: 'logged', rpe: 8, durationMin: 75, loggedAt: ds + 'T16:20:00' });
    Object.assign(ms.log, { poolM: 25, timingMethod: 'hand', conditions: 'Bana 4, lugnt vatten' });
    [5.64, 5.57, 5.61, 5.79].forEach((v, r) => ms.items[0].results[r] = { timeS: v, method: 'hand', poolM: 25, startType: 'block', ...(r === 1 ? { reactionS: .65, splits: [{ at: 5, t: 1.71 }, { at: 10, t: 3.68 }] } : {}) });
    ms.items[0].exec = { status: 'andrad', comment: 'Stoppad vid fartfall efter rep 4', stoppedAtRep: 4, stopReason: 'fartfall', videoUrl: '' };
    ms.items[1].results[0] = { timeS: 11.17, method: 'hand', poolM: 25, startType: 'block', splits: [{ at: 15, t: 5.66 }], strokes: 9 };
    ms.items[1].results[1] = { timeS: 11.06, method: 'video', poolM: 25, startType: 'block', splits: [{ at: 15, t: 5.6 }], strokes: 9, videoUrl: 'https://example.org/demo/video-25m' };
  }
  if (mg) {
    Object.assign(mg.log, { status: 'logged', rpe: 7, durationMin: 45, loggedAt: ds + 'T17:05:00' });
    mg.items[0].sets = [[60, 3, .93, 3, 1], [60, 3, .91, 3, 1], [60, 3, .88, 2, 1], [null, null, null, null, 0]].map(x => ({ kg: x[0], reps: x[1], velocity: x[2], rir: x[3], done: !!x[4] }));
    mg.items[1].sets = [[22, 5, null, 3, 1], [22, 5, null, 2, 1], [null, null, null, null, 0]].map(x => ({ kg: x[0], reps: x[1], velocity: x[2], rir: x[3], done: !!x[4] }));
    mg.items[2].sets[0] = { kg: 5, reps: 4, velocity: null, rir: null, done: true };
  }
  // Ett utkast från coachen som simmaren kan godkänna (visar godkännandeflödet)
  const dr = makeSession(ymd(addDays(cur, 3)), { tid: 'demo-draft', type: 'mobility', title: 'Höft och bröstrygg', start: '16:15', end: '16:45', items: [
    st('90/90 höftrotation', '3×6 per sida', 3, 6, { e1rm: false }), st('Bröstryggsrotation på knä', '3×8 per sida', 3, 8, { e1rm: false }), st('Couch stretch', '2×45 s per sida', 2, 45, { unit: 's', e1rm: false })] });
  Object.assign(dr, { planStatus: 'utkast', source: { kind: 'manual' }, author: 'Demo-coach', purpose: 'Rörlighet för startposition och undervattensfas' });
  d.sessions[dr.id] = dr;
  // Träningsregel (restriktion formulerad som regel) kopplad till veckans gympass och knäböjsvarianter
  const rid = 'demo-regel-rygg'; if (FEATURES.restrictions) {
  d.restrictions[rid] = { id: rid, rule: 'Ingen progression i tunga ryggbelastande lyft', validFrom: ds, validTo: null, until: 'fysiobedömning', author: 'Demo-coach' };
  Object.values(d.sessions).filter(s => s.type === 'gym' && s.date >= ds).forEach(s => { s.restrictionIds = [rid]; s.items.forEach(it => { if (/split squat|hip thrust|trap bar/i.test(it.name || '')) it.restrictionIds = [rid]; }); }); }
  // Tävling (fiktiv) med splittar i samma struktur som träningstider
  const cd = ymd(addDays(cur, -2)), cs = makeSessionBase(cd, { tid: 'demo-tavling', type: 'competition', title: 'Klubbmöte', start: '10:00', end: '13:00', items: [
    sw('50 m fjäril, försök', '', 1, 50, null, 'fjäril', { startType: 'block', event: '50 m fjäril, försök' }), sw('50 m fjäril, final', '', 1, 50, null, 'fjäril', { startType: 'block', event: '50 m fjäril, final' })] });
  Object.assign(cs, { eventName: 'Höstsimiaden (fiktiv)', poolM: 25, author: 'Demosimmare', planStatus: 'godkand', source: { kind: 'manual' } });
  Object.assign(cs.log, { status: 'logged', rpe: 9, durationMin: 20, poolM: 25, timingMethod: 'elektronisk', loggedAt: cd + 'T13:00:00' });
  cs.items[0].results[0] = { timeS: 24.31, method: 'elektronisk', poolM: 25, startType: 'block', reactionS: .64, turnInS: 2.9, turnOutS: 3.4, strokes: 17, splits: [{ at: 5, t: 1.69 }, { at: 10, t: 3.62 }, { at: 15, t: 5.58 }, { at: 25, t: 11.05 }, { at: 35, t: 16.2 }] };
  cs.items[1].results[0] = { timeS: 24.12, method: 'elektronisk', poolM: 25, startType: 'block', reactionS: .62, strokes: 17, splits: [{ at: 15, t: 5.55 }, { at: 25, t: 10.98 }] };
  cs.items.forEach(it => { it.exec = { status: 'genomford', comment: '', stoppedAtRep: null, stopReason: '', videoUrl: '' }; });
  d.sessions[cs.id] = cs;
  // Kort pass med inre bilder
  const im = makeSession(ymd(addDays(cur, 1)), { tid: 'demo-img', type: 'imagery', title: 'Inre bilder: startrutin', start: '20:00', end: '20:10', items: [
    { kind: 'check', title: 'Rutinen bakom pallen: tre andetag, kliv upp, fötterna', sub: '2 min' }, { kind: 'check', title: 'Startsignal, frånskjut och inträde', sub: '3 min' }, { kind: 'check', title: 'Första tre tagen till 15 m', sub: '3 min' }] });
  Object.assign(im, { focus: 'Startsignal och första tagen', author: 'Demo-coach' }); im.items.forEach((it, i) => { it.durationS = [120, 180, 180][i]; });
  d.sessions[im.id] = im;
  d.meta.demo = true;
}

let DB = null;
DB = load();
