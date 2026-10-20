'use strict';
/* Statistik vecka för vecka. Primära KPI: P1 (25 m start–beröring) och P2 (tid till 15 m). */
const STV = { range: 8, ex: null, seg: '0-25', start: 'block', pool: 0, ctx: '' };
const epley = (kg, reps) => kg * (1 + reps / 30);
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

function weekKeys(n) {
  const cur = mondayOf(TODAY); let first = cur;
  if (n === 0) { const ds = allSessions().filter(s => s.log.status === 'logged').map(s => s.date); first = ds.length ? mondayOf(parseYmd(ds[0])) : cur; }
  else first = addDays(cur, -7 * (n - 1));
  const out = []; for (let m = first; m <= cur; m = addDays(m, 7)) out.push({ key: isoWeek(m).key, w: isoWeek(m).w, mon: m });
  return out;
}
function statsData(weeks) {
  const by = {}; weeks.forEach(w => by[w.key] = { P1: [], P2: [], ex: {}, vol: 0, load: 0, rpe: [], n: 0 });
  const sets = { P1: [], P2: [] };
  allSessions().forEach(s => {
    const W = by[s.isoWeek]; if (!W) return;
    s.items.forEach(it => {
      if (it.kind === 'swim' && it.kpi) {
        const v = it.results.filter(x => x && x.timeS > 0).map(x => x.timeS);
        if (v.length) { const o = { date: s.date, title: it.title, n: v.length, best: Math.min(...v), mean: mean(v), video: it.results.filter(x => x && x.method === 'video').length }; W[it.kpi].push(o); sets[it.kpi].push(o); }
      }
      if (it.kind === 'strength' && it.unit === 'reps') {
        const done = it.sets.filter(x => x.kg && x.reps);
        if (s.type === 'gym') W.vol += done.reduce((a, x) => a + x.kg * x.reps, 0);
        if (done.length) { const e = W.ex[it.name] = W.ex[it.name] || { e1rm: [], top: [], vel: [] };
          done.forEach(x => { if (it.e1rm && x.reps <= 10) e.e1rm.push(epley(x.kg, x.reps)); e.top.push(x.kg); if (x.velocity) e.vel.push(x.velocity); }); }
      }
    });
    if (s.log.status === 'logged' && s.log.rpe) { W.load += s.log.rpe * (s.log.durationMin || s.plannedMin); W.rpe.push(s.log.rpe); W.n++; }
    if (s.date <= ymd(TODAY) && !s.optional) { W.planned = (W.planned || 0) + 1; if (s.log.status === 'logged') W.done = (W.done || 0) + 1; }
  });
  return { by, sets };
}

function statsRender() {
  const weeks = weekKeys(STV.range), { by, sets } = statsData(weeks), labels = weeks.map(w => 'v' + w.w);
  const wk = k => weeks.map(w => by[w.key][k]);
  const best = k => wk(k).map(a => a.length ? Math.min(...a.map(x => x.best)) : null);
  const meanSet = k => wk(k).map(a => a.length ? mean(a.map(x => x.mean)) : null);
  const exNames = [...new Set(weeks.flatMap(w => Object.keys(by[w.key].ex)))].filter(n => weeks.some(w => (by[w.key].ex[n] || {}).e1rm && by[w.key].ex[n].e1rm.length));
  if (!STV.ex || !exNames.includes(STV.ex)) STV.ex = exNames.find(n => /pull|chin/i.test(n)) || (exNames.includes('Hip thrust') ? 'Hip thrust' : exNames[0]);
  const velNames = [...new Set(weeks.flatMap(w => Object.keys(by[w.key].ex)))].filter(n => weeks.some(w => (by[w.key].ex[n] || {}).vel && by[w.key].ex[n].vel.length));
  const load = weeks.map(w => weekTotals(w.mon).load.d), plan = weeks.map(w => weekTotals(w.mon).load.p || null), roll = load.map((_, i) => { const p = load.slice(Math.max(0, i - 4), i).filter(v => v > 0); return p.length >= 2 ? mean(p) : null; });

  const kpiCard = k => {
    const b = best(k), vals = b.filter(v => v != null), allB = sets[k].map(x => x.best), pb = allB.length ? Math.min(...allB) : null;
    const first = vals[0], last = vals[vals.length - 1], ch = vals.length > 1 ? last - first : null, gap = pb != null ? pb - KPI[k].goal : null;
    return `<div class="card kpi"><div class="k">${KPI[k].name}<span>${k}</span></div><div class="cap">Bästa v${weeks[0].w}–v${weeks[weeks.length - 1].w}</div>
      <div class="big">${fmt(pb)}<small>s</small></div>
      <div class="row2"><div>Senaste vecka<b>${fmt(last)}</b></div><div>Sedan v${weeks[b.findIndex(v => v != null)] ? weeks[b.findIndex(v => v != null)].w : weeks[0].w}<b class="${ch < 0 ? 'down' : ''}">${ch == null ? '–' : (ch < 0 ? '−' : '+') + fmt(Math.abs(ch))}</b></div><div>Kvar till mål ${fmt(KPI[k].goal)}<b>${gap == null ? '–' : gap > 0 ? fmt(gap) : 'nått'}</b></div></div></div>`;
  };
  const recent = () => sets.P1.concat(sets.P2).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title)).slice(0, 10).map(x => { const d = parseYmd(x.date); return `<tr><td style="white-space:nowrap">${d.getDate()}/${d.getMonth() + 1}</td><td>${esc(x.title)}</td><td class="r">${x.n}</td><td class="r"><b>${fmt(x.best)}</b></td><td class="r">${fmt(x.mean)}</td></tr>`; }).join('');

  document.getElementById('v-statistik').innerHTML = `
  <div class="eyebrow">${DB.meta.demo ? '<span class="demo">Demo</span> ' : ''}${whoHTML()} · ${DB.meta.demo ? 'syntetiska data' : 'egna loggar'}</div>
  <div class="head"><div><h1>Statistik</h1><div class="sub">Utveckling vecka för vecka · v${weeks[0].w}–v${weeks[weeks.length - 1].w}</div></div></div>
  <div class="seg" style="max-width:300px;margin:22px 0 0">${[[4, '4 v'], [8, '8 v'], [12, '12 v'], [0, 'Allt']].map(([v, l]) => `<button class="${STV.range === v ? 'on' : ''}" onclick="STV.range=${v};statsRender()">${l}</button>`).join('')}</div>
  <div class="kpis">${kpiCard('P1')}${kpiCard('P2')}</div>
  ${swimSectionHTML(weeks)}
  <div class="secth">Gym</div>
  <div class="charts">
    <div class="card ch"><h3>Uppskattat 1RM</h3><div class="cs">Epley: kg × (1 + reps/30), bästa set per vecka. Pull-ups: på extra vikt (kroppsvikt registreras inte).</div>
      <div class="chips" style="margin-top:12px">${exNames.map(n => `<button class="${n === STV.ex ? 'on' : ''}" onclick="STV.ex='${esc(n)}';statsRender()">${esc(n)}</button>`).join('')}</div>
      <div class="plot" id="cE1"></div><div class="legend"><span><i style="background:${ACC}"></i>e1RM</span><span><i style="background:${GRAY}"></i>Toppvikt</span></div></div>
    <div class="card ch"><h3>Stånghastighet</h3><div class="cs">${esc(velNames[0] || 'Ingen övning med hastighet')} · snitt m/s per vecka, fast belastning</div><div class="plot" id="cV"></div>
      <div class="legend"><span><i style="background:${ACC}"></i>Snitthastighet</span><span><i class="d"></i>Plan 0,90 m/s</span></div></div>
    ${jumpCardHTML()}
    <div class="card ch full"><h3>Volym</h3><div class="cs">Summa kg × reps i gympass per vecka · v${weeks[weeks.length - 1].w} pågår</div><div class="plot" id="cVol"></div></div>
  </div>
  <div class="secth">Belastning</div>
  <div class="charts">
    <div class="card ch"><h3>Veckobelastning</h3><div class="cs">sRPE (RPE × minuter, AU) sim och gym · streckat = planerat · tom stapel = okänt (inget loggat), aldrig noll · v${weeks[weeks.length - 1].w} pågår</div><div class="plot" id="cLoad"></div></div>
    <div class="card ch full"><h3>Planföljsamhet</h3><div class="cs">Andel genomförda och loggade pass av planerade (t.o.m. idag, valfria pass räknas inte)</div><div class="plot" id="cAdh"></div></div>
    <div class="card ch"><h3>RPE</h3><div class="cs">Snitt-RPE per loggat pass och vecka (CR-10)</div><div class="plot" id="cRpe"></div></div>
  </div>
  <p class="caveat">Elitsimmares variation mellan lopp är cirka 0,8–1 % (≈ 0,1 s på 25 m), så små förändringar kan vara brus. Handtagna tider kan avvika 0,1–0,2 s. ${DB.meta.demo ? ' Alla värden här är syntetiska demodata.' : ''}</p>`;

  const drawAll = () => {
    const ex = n => weeks.map(w => by[w.key].ex[n]);
    lineChart(document.getElementById('cE1'), { labels, dec: 0, fmtV: v => fmt(v, 0) + ' kg', aria: 'e1RM',
      series: [{ values: ex(STV.ex).map(e => e && e.e1rm.length ? Math.max(...e.e1rm) : null) }, { values: ex(STV.ex).map(e => e && e.top.length ? Math.max(...e.top) : null), color: GRAY, width: 1.75, r: 2.5 }] });
    lineChart(document.getElementById('cV'), { labels, dec: 2, goal: velNames[0] ? .9 : null, goalLabel: 'plan 0,90', goalLeft: true, fmtV: v => fmt(v) + ' m/s', h: 190, aria: 'Stånghastighet',
      series: [{ values: velNames[0] ? ex(velNames[0]).map(e => e && e.vel.length ? mean(e.vel) : null) : [] }] });
    barChart(document.getElementById('cVol'), { labels, values: wk('vol').map(v => v ? Math.round(v) : null), h: 160, fmtV: v => v.toLocaleString('sv-SE') + ' kg', aria: 'Volym' });
    barChart(document.getElementById('cLoad'), { labels, values: load, line: { values: plan, dash: '4 3', color: '#6e6e73' }, aria: 'Veckobelastning' });
    swimDraw();
    barChart(document.getElementById('cAdh'), { labels, values: weeks.map(w => by[w.key].planned ? Math.round(100 * (by[w.key].done || 0) / by[w.key].planned) : null), h: 150, fmtV: v => v + ' %', fmtT: t => t + ' %', aria: 'Planföljsamhet' });
    lineChart(document.getElementById('cRpe'), { labels, dec: 1, h: 170, fmtV: v => fmt(v, 1), aria: 'RPE', series: [{ values: wk('rpe').map(a => a.length ? mean(a) : null) }] });
  };
  drawAll(); STV.redraw = drawAll;
}

/* ---------- Sim: EN plats för alla mätvärden ---------- */
const CTX_NAME = { traning: 'Träning', test: 'Test', tavling: 'Tävling' };
const segKey = m => m.from + '-' + m.to;
function swimFilter() { const [from, to] = STV.seg.split('-').map(Number); return { from, to, start: STV.start || null, pool: STV.pool || null }; }
function swimSel(weeks) {
  const first = weeks.length ? ymd(weeks[0].mon) : '0000';
  return measures(swimFilter()).filter(m => (!STV.ctx || m.context === STV.ctx) && m.date >= first);
}
/* Baslinje: testdagar markerade som baslinje (samma sträcka/start/bassäng); annars de tre första dagarna */
function baselineOf() {
  const all = measures(swimFilter()), marked = all.filter(m => m.baseline);
  if (marked.length) { const d = byDay(marked); return { v: d.reduce((a, x) => a + x.best, 0) / d.length, src: `testdag${d.length > 1 ? 'ar' : ''} ${d.map(x => prettyShort(x.date)).join(', ')}` }; }
  const d = byDay(all); return d.length ? { v: baseline(d), src: `första ${Math.min(3, d.length)} mätdag${d.length > 1 ? 'arna' : 'en'} (ingen testdag markerad)` } : { v: null, src: '' };
}
function swimSectionHTML(weeks) {
  const segs = [...new Set(['0-15', '0-25', ...allMeasures().map(segKey)])].sort((a, b) => { const [a1, a2] = a.split('-').map(Number), [b1, b2] = b.split('-').map(Number); return a1 - b1 || a2 - b2; });
  const sg = (k, opts, cur) => `<div class="seg mini fl">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" onclick="STV.${k}=${typeof v === 'number' ? v : `'${v}'`};statsRender()">${l}</button>`).join('')}</div>`;
  const ms = swimSel(weeks), days = byDay(ms), B = baselineOf(), last = days[days.length - 1];
  const diff = last && B.v ? last.best - B.v : null;
  const [from, to] = STV.seg.split('-').map(Number);
  const cmp = Object.keys(START_TYPES).map(st => { const d = byDay(measures({ from, to, pool: STV.pool || null, start: st }).filter(m => !STV.ctx || m.context === STV.ctx)); if (!d.length) return '';
    const b = Math.min(...d.map(x => x.best)), mn = d.reduce((a, x) => a + x.mean * x.n, 0) / d.reduce((a, x) => a + x.n, 0);
    return `<tr><td>${START_TYPES[st]}</td><td class="r">${d.reduce((a, x) => a + x.n, 0)}</td><td class="r"><b>${fmt(b)}</b></td><td class="r">${fmt(mn)}</td><td class="r">${fmt(d[d.length - 1].best)}</td></tr>`; }).join('');
  const rows = ms.slice().reverse().slice(0, 40).map(m => `<tr><td style="white-space:nowrap">${prettyShort(m.date)}</td><td>${esc(m.title)}${m.comp ? ' <span class="chip comp">Tävling</span>' : ''}${m.baseline ? ' <span class="chip base">Baslinje</span>' : ''}</td><td class="r"><b>${fmt(m.t)}</b></td><td>${START_TYPES[m.start] || '–'}</td><td class="r">${m.pool} m</td><td>${METHODS[m.method] || m.method}${m.fps ? ' ' + m.fps + ' fps' : ''}</td><td>${CTX_NAME[m.context] || '–'}</td></tr>`).join('');
  return `<div class="card ch full swimf"><h3>Tider ${STV.seg.replace('-', '–')} m</h3><div class="cs">Dagens bästa och medel per mätdag mot baslinjen · bassänglängd och starttyp sparas på varje tid</div>
    <div class="filters">${sg('seg', segs.map(k => [k, k.replace('-', '–') + ' m']), STV.seg)}
      ${sg('start', [['', 'Alla starter'], ...Object.entries(START_TYPES)], STV.start)}
      ${sg('pool', [[0, 'Båda banor'], [25, '25 m'], [50, '50 m']], STV.pool)}
      ${sg('ctx', [['', 'Allt'], ['traning', 'Träning'], ['test', 'Test'], ['tavling', 'Tävling']], STV.ctx)}</div>
    <div class="row2 sw4"><div>Dagens bästa<b>${last ? fmt(last.best) : '–'}</b><small>${last ? prettyShort(last.date) : 'inga tider'}</small></div><div>Dagens medel<b>${last ? fmt(last.mean) : '–'}</b><small>${last ? last.n + ' mätningar' : ''}</small></div>
      <div>Baslinje<b>${B.v ? fmt(B.v) : '–'}</b><small>${esc(B.src)}</small></div><div>Mot baslinjen<b class="${diff < 0 ? 'down' : ''}">${diff == null ? '–' : (diff < 0 ? '−' : '+') + fmt(Math.abs(diff)) + ' s'}</b><small>${diff == null ? '' : (diff / B.v * 100).toFixed(1).replace('.', ',') + ' %'}</small></div></div>
    <div class="plot" id="cSwim"></div>
    <div class="legend"><span><i style="background:${ACC}"></i>Dagens bästa</span><span><i style="background:${GRAY}"></i>Dagens medel</span><span><i class="d"></i>Baslinje</span></div>
    ${cmp ? `<h4>Per starttyp</h4><table class="list"><thead><tr><th>Start</th><th class="r">Antal</th><th class="r">Bästa</th><th class="r">Medel</th><th class="r">Senast bästa</th></tr></thead><tbody>${cmp}</tbody></table>` : ''}
    <details class="allm"><summary>Alla mätvärden (${ms.length})</summary><table class="list"><thead><tr><th>Dag</th><th>Lopp</th><th class="r">Tid</th><th>Start</th><th class="r">Bana</th><th>Metod</th><th>Kontext</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Inga tider i urvalet</td></tr>'}</tbody></table>
      <p class="fine">Hela listan med splittar, reaktion och vändningar finns i Data → Rådata CSV / Mätvärden JSON.</p></details></div>`;
}
function swimDraw() {
  const el = document.getElementById('cSwim'); if (!el) return;
  const days = byDay(swimSel(weekKeys(STV.range))), B = baselineOf(), kpi = STV.seg === '0-25' ? KPI.P1 : STV.seg === '0-15' ? KPI.P2 : null;
  if (!days.length) { el.innerHTML = '<p class="empty">Inga tider i urvalet</p>'; return; }
  lineChart(el, { labels: days.map(d => prettyShort(d.date)), invert: true, goal: kpi ? kpi.goal : null, goalLabel: kpi ? 'mål ' + fmt(kpi.goal) : '', dec: 2, aria: 'Tider per mätdag',
    series: [{ values: days.map(d => d.best) }, { values: days.map(d => d.mean), color: GRAY, width: 1.75, r: 2.5 }, ...(B.v ? [{ values: days.map(() => B.v), color: '#86868b', width: 1.25, r: 0, dash: '4 3', dots: false }] : [])] });
}
/* Hopptester: CMJ och längdhopp, bästa och medel per testdag */
function jumpCardHTML() {
  const T = {}; allSessions().forEach(s => s.items.forEach(it => { if (!it.test) return; const v = (it.attempts || []).filter(x => x != null); if (!v.length) return;
    (T[it.test.kind] = T[it.test.kind] || []).push({ date: s.date, best: Math.max(...v), mean: v.reduce((a, b) => a + b) / v.length, method: it.test.method || '', n: v.length, base: !!s.isBaseline }); }));
  const K = { cmj: 'CMJ', langdhopp: 'Längdhopp' }, keys = Object.keys(T);
  if (!keys.length) return `<div class="card ch"><h3>Hopptester</h3><div class="cs">CMJ och längdhopp – bästa och medel per testdag</div><p class="empty">Inga hopptester loggade ännu</p></div>`;
  return `<div class="card ch"><h3>Hopptester</h3><div class="cs">Bästa och medel per testdag (cm)</div>${keys.map(k => `<h4>${K[k] || esc(k)}</h4><table class="list"><thead><tr><th>Dag</th><th>Metod</th><th class="r">Försök</th><th class="r">Bästa</th><th class="r">Medel</th></tr></thead><tbody>
    ${T[k].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map(x => `<tr><td>${prettyShort(x.date)}${x.base ? ' <span class="chip base">Baslinje</span>' : ''}</td><td>${esc(x.method || '–')}</td><td class="r">${x.n}</td><td class="r"><b>${fmt(x.best, 1)}</b></td><td class="r">${fmt(x.mean, 1)}</td></tr>`).join('')}</tbody></table>`).join('')}</div>`;
}
