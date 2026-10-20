'use strict';
/* Mätvärden – EN plats för alla tider (träning och tävling). Varje tid sparas med bassänglängd och starttyp.
   Ett mätvärde = en sträcka från–till meter med tid, t.ex. 0–15 (KPI P2), 0–25 (KPI P1), 15–25 eller vändning 20–30.
   Källor per rep: tiden för radens första mätsegment (eller hela distansen), övriga segmenttider och splittar från 0 m. */
const START_TYPES = { block: 'Block', push: 'Push', deadstart: 'Deadstart', flygande: 'Flygande' };
const METHODS = { hand: 'Hand', video: 'Video', touchpad: 'Touchpad', elektronisk: 'Elektronisk', annan: 'Annan' };
const EXEC_NAME = { genomford: 'Genomfört', andrad: 'Ändrat', struken: 'Struket' };
const SPLIT_AT = [5, 10, 15, 25, 35, 50];
const isSwimLike = s => s.type === 'swim' || s.type === 'competition';
const primarySeg = it => (it.segments && it.segments[0]) || { from: 0, to: it.distanceM || 0 };
const repLabel = (it, r) => it.rounds > 1 ? `V${Math.floor(r / it.reps) + 1}·${(r % it.reps) + 1}` : `${r + 1}`;
function poolOf(s, x) { return (x && x.poolM) || s.log.poolM || s.poolM || 25; }
function startOf(s, it, x) { return (x && x.startType) || it.startType || s.log.startType || 'push'; }
/* Alla mätvärden, nyast sist. Strukna rader räknas inte. */
function allMeasures() {
  const out = [];
  allSessions().forEach(s => { if (!isSwimLike(s)) return;
    s.items.forEach(it => { if (it.kind !== 'swim' || (it.exec && it.exec.status === 'struken')) return;
      const segs = it.segments && it.segments.length ? it.segments : [{ from: 0, to: it.distanceM || 0 }];
      it.results.forEach((x, r) => { if (!x) return;
        const base = { date: s.date, sid: s.id, iid: it.id, rep: r + 1, title: it.title, comp: s.type === 'competition', pool: poolOf(s, x), start: startOf(s, it, x), method: x.method || 'hand', video: x.videoUrl || '',
          type: s.type, fps: x.method === 'video' ? (x.fps || s.log.fps || null) : null, context: s.log.context || (s.type === 'competition' ? 'tavling' : 'traning'), timeOfDay: s.start,
          warmup: s.log.warmup || '', caffeine: s.log.caffeine ?? null, baseline: !!s.isBaseline, reaction: x.reactionS ?? null, turnIn: x.turnInS ?? null, turnOut: x.turnOutS ?? null, strokes: x.strokes ?? null, strokeRate: x.strokeRate ?? null };
        const seen = new Set(), add = (from, to, t, src) => { const k = from + '-' + to; if (!(t > 0) || seen.has(k) || !(to > from)) return; seen.add(k); out.push({ ...base, from, to, t, src }); };
        add(segs[0].from, segs[0].to, x.timeS, 'tid');
        Object.entries(x.segTimes || {}).forEach(([i, t]) => { const g = segs[+i - 1]; if (g) add(g.from, g.to, t, 'segment'); });
        if (segs[0].from === 0) (x.splits || []).forEach(sp => add(0, sp.at, sp.t, 'split'));
      }); }); });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const KPI_SEG = { P1: [0, 25], P2: [0, 15] };
/* Filter: { from, to, start, pool, before } – null betyder alla */
function measures(f = {}) {
  return allMeasures().filter(m => (f.from == null || m.from === f.from) && (f.to == null || m.to === f.to) && (!f.start || m.start === f.start) && (!f.pool || m.pool === f.pool)
    && (!f.before || m.date < f.before) && (f.comp == null || m.comp === f.comp));
}
/* Per dag: dagens bästa och medelvärde */
function byDay(ms) {
  const d = {}; ms.forEach(m => (d[m.date] = d[m.date] || []).push(m.t));
  return Object.entries(d).sort().map(([date, v]) => ({ date, best: Math.min(...v), mean: v.reduce((a, b) => a + b) / v.length, n: v.length }));
}
/* Baslinje: medel av de tre första dagarnas bästa tider i urvalet (minst en dag) */
function baseline(days) { const b = days.slice(0, 3).map(d => d.best); return b.length ? b.reduce((a, c) => a + c) / b.length : null; }
/* Huvud-KPI (veckovyn): från block, alla banlängder */
function kpiResults(kpi, beforeDate) { const [from, to] = KPI_SEG[kpi]; return measures({ from, to, start: 'block', before: beforeDate }).map(m => ({ date: m.date, t: m.t })); }
const persBefore = (kpi, date) => Math.min(KPI[kpi].hcBaseline, ...kpiResults(kpi, date).map(x => x.t));
/* Veckobelastning (sRPE × min) för alla passtyper */
function weekLoad(monday) {
  const L = { total: 0, swim: 0, gym: 0, other: 0, n: 0, planned: 0 };
  for (let i = 0; i < 7; i++) sessionsOn(ymd(addDays(monday, i))).forEach(s => {
    if (s.type === 'imagery') return; const m = s.log.durationMin || s.plannedMin; L.planned += (s.rpeTarget || 0) * s.plannedMin;
    if (s.log.status !== 'logged' || !s.log.rpe) return; const v = Math.round(s.log.rpe * m);
    L.total += v; L.n++; if (isSwimLike(s)) L.swim += v; else if (s.type === 'gym') L.gym += v; else L.other += v; });
  return L;
}
/* e1RM (Epley) på extra vikt – kroppsvikt registreras inte i appen */
/* Veckosummor: planerat bredvid genomfört. Saknad loggning = null ("okänt"), aldrig 0. */
const GYM_CAT = [['Hopp och kast', /hopp|jump|kast|throw|cmj|box|studs/i], ['Drag', /pull|chin|rodd|row|drag|lat/i], ['Press', /press|bänk|bench|dips|armhäv|push/i],
  ['Ben', /knäböj|squat|split|utfall|lunge|marklyft|deadlift|hip|nordic|belt|benpress|rfess|step|hamstring/i], ['Bål', /plank|dead bug|pallof|bird|curl-up|rotation|bål|core|hollow|lever/i]];
const gymCat = n => (GYM_CAT.find(([, re]) => re.test(n || '')) || ['Övrigt'])[0];
function rowDone(it) {   // antal genomförda lopp på en simrad, eller null om okänt
  const ex = it.exec || {}, n = it.results ? it.results.length : (it.reps || 0) * (it.rounds || 1);
  if (ex.status === 'struken') return 0;
  const t = (it.results || []).filter(x => x && x.timeS > 0).length;
  if (ex.stoppedAtRep) return Math.max(t, ex.stoppedAtRep);
  if (t) return t;
  if (ex.status === 'genomford' || ex.status === 'andrad' || (it.kind === 'check' && it.done)) return n;
  return null;
}
function weekTotals(monday) {
  const z = () => ({ p: 0, d: null }), T = { load: z(), sprints: z(), maxM: z(), starts: z(), breakouts: z(), jumps: z(), gym: {}, days: [], maxDay: 0 };
  const add = (o, v) => { if (v != null) o.d = (o.d || 0) + v; };
  for (let i = 0; i < 7; i++) { let day = null;
    sessionsOn(ymd(addDays(monday, i))).forEach(s => {
      if (s.type === 'imagery') return;
      if (s.rpeTarget) T.load.p += Math.round(s.rpeTarget * s.plannedMin);
      if (s.log.status === 'logged' && s.log.rpe && s.log.durationMin) { const v = Math.round(s.log.rpe * s.log.durationMin); add(T.load, v); day = (day || 0) + v; }
      s.items.forEach(it => {
        if (it.kind === 'swim' || (it.kind === 'check' && it.distanceM)) {
          const n = (it.reps || 0) * (it.rounds || 1), d = rowDone(it), dist = it.distanceM || 0, isStart = ['block', 'deadstart'].includes(it.startType) || it.stat === 'Start';
          if (it.sprint && dist && dist <= 25) { T.sprints.p += n; T.maxM.p += n * dist; add(T.sprints, d); add(T.maxM, d == null ? null : d * dist); }
          if (isStart) { T.starts.p += n; add(T.starts, d); }
          if (it.stat === 'Undervatten' || /breakout|utbrytning/i.test(it.title || '')) { T.breakouts.p += n; add(T.breakouts, d); }
        }
        if (it.kind === 'strength') {
          const cat = gymCat(it.name), done = it.test ? (it.attempts || []).filter(x => x != null).length : it.sets.filter(x => x.done).length, known = done > 0 || (it.exec && it.exec.status);
          if (cat === 'Hopp och kast' || it.test) { const per = it.test ? 1 : (it.targetReps || 1); T.jumps.p += it.test ? (it.attempts || []).length : it.targetSets * per;
            if (known) add(T.jumps, it.test ? done : it.sets.filter(x => x.done).reduce((a, x) => a + (x.reps || per), 0)); }
          if (s.type === 'gym' || s.type === 'core' || s.type === 'mobility') { const g = T.gym[cat] = T.gym[cat] || { p: 0, d: null }; g.p += it.test ? 0 : it.targetSets || 0; if (known && !it.test) g.d = (g.d || 0) + done; }
        }
      });
    });
    T.days.push(day); T.maxDay = Math.max(T.maxDay, day || 0);
  }
  return T;
}
