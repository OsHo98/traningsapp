'use strict';
/* Små SVG-diagram utan bibliotek. Ritas i containerns faktiska bredd (ritas om vid storleksändring). */
const ACC = '#0071e3', GRAY = '#aeaeb2', GRID = '#ececf0', LBL = '#86868b';
function niceTicks(mn, mx, n) {
  const span = mx - mn || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const stp = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const out = []; for (let v = Math.ceil(mn / stp) * stp; v <= mx + 1e-9; v += stp) out.push(+v.toFixed(6)); return { ticks: out, step: stp };
}
function decimalsFor(step) { return step >= 1 ? 0 : step >= .1 ? 1 : 2; }
/* o: { labels, series:[{values, color, dash, width, dots, name}], goal, goalLabel, invert, h, unit, fmtV } */
function lineChart(el, o) {
  const W = Math.max(260, el.clientWidth || 600), H = o.h || 190, L = 44, R = 16, Tp = 14, B = 26;
  const vals = o.series.flatMap(s => s.values).filter(v => v != null);
  if (!vals.length) { el.innerHTML = `<div style="height:${H}px;display:grid;place-items:center;color:${LBL};font-size:14px">Inga data ännu</div>`; return; }
  const all = o.goal != null ? vals.concat(o.goal) : vals;
  let mn = Math.min(...all), mx = Math.max(...all); const pd = (mx - mn) * .12 || Math.abs(mx) * .02 || 1; mn -= pd; mx += pd;
  const { ticks, step } = niceTicks(mn, mx, H < 170 ? 3 : 4), dec = o.dec != null ? o.dec : decimalsFor(step);
  const n = o.labels.length, X = i => n < 2 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1);
  const Y = v => o.invert ? Tp + (v - mn) / (mx - mn) * (H - Tp - B) : Tp + (1 - (v - mn) / (mx - mn)) * (H - Tp - B);
  let g = '';
  ticks.forEach(t => { const y = Y(t).toFixed(1); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${GRID}"/><text x="${L - 8}" y="${+y + 4}" text-anchor="end" font-size="11" fill="${LBL}">${fmt(t, dec)}</text>`; });
  const every = Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 44)));
  o.labels.forEach((l, i) => { if ((n - 1 - i) % every === 0) g += `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="${LBL}">${esc(l)}</text>`; });
  if (o.goal != null) { const y = Y(o.goal).toFixed(1); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${GRAY}" stroke-dasharray="4 4" stroke-width="1.5"/><text x="${o.goalLeft ? L + 4 : W - R}" y="${+y - 5}" text-anchor="${o.goalLeft ? 'start' : 'end'}" font-size="11" fill="${LBL}">${esc(o.goalLabel || 'mål')}</text>`; }
  o.series.forEach(s => {
    let d = '', pen = false; s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1); pen = true; });
    g += `<path d="${d}" fill="none" stroke="${s.color || ACC}" stroke-width="${s.width || 2.25}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`;
    if (s.dots !== false) s.values.forEach((v, i) => { if (v != null) g += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${s.r || 3}" fill="${s.hollow ? '#fff' : (s.color || ACC)}" stroke="${s.color || ACC}" stroke-width="1.6"/>`; });
  });
  const s0 = o.series[0], li = s0.values.map((v, i) => v != null ? i : -1).filter(i => i >= 0).pop();
  if (li != null && li >= 0) { const v = s0.values[li], x = X(li), y = Y(v); g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#fff" stroke="${s0.color || ACC}" stroke-width="2.25"/><text x="${Math.min(x, W - R - 2).toFixed(1)}" y="${(y + (o.invert ? -10 : -10)).toFixed(1)}" text-anchor="${x > W - R - 30 ? 'end' : 'middle'}" font-size="12" font-weight="600" fill="#1d1d1f">${o.fmtV ? o.fmtV(v) : fmt(v, dec)}</text>`; }
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || '')}">${g}</svg>`;
}
/* o: { labels, values, line:{values,color,dash}, h, fmtV } */
function barChart(el, o) {
  const W = Math.max(260, el.clientWidth || 600), H = o.h || 170, L = 44, R = 16, Tp = 16, B = 26;
  const vals = o.values.filter(v => v != null).concat((o.line && o.line.values.filter(v => v != null)) || []);
  if (!vals.length) { el.innerHTML = `<div style="height:${H}px;display:grid;place-items:center;color:${LBL};font-size:14px">Inga data ännu</div>`; return; }
  const mx = Math.max(...vals) * 1.12 || 1, { ticks, step } = niceTicks(0, mx, 3), top = Math.max(mx, ticks[ticks.length - 1]);
  const n = o.labels.length, bw = (W - L - R) / n, Y = v => Tp + (1 - v / top) * (H - Tp - B);
  let g = '';
  ticks.forEach(t => { const y = Y(t).toFixed(1); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${GRID}"/><text x="${L - 8}" y="${+y + 4}" text-anchor="end" font-size="11" fill="${LBL}">${o.fmtT ? o.fmtT(t) : t.toLocaleString('sv-SE')}</text>`; });
  const every = Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 44)));
  o.values.forEach((v, i) => {
    const x = L + i * bw + bw * .2, w = bw * .6, last = i === n - 1;
    if (v != null && v > 0) g += `<rect x="${x.toFixed(1)}" y="${Y(v).toFixed(1)}" width="${w.toFixed(1)}" height="${(Y(0) - Y(v)).toFixed(1)}" rx="${Math.min(5, w / 3).toFixed(1)}" fill="${last ? ACC : 'rgba(0,113,227,.28)'}"/>`;
    if ((n - 1 - i) % every === 0) g += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="${LBL}">${esc(o.labels[i])}</text>`;
  });
  if (o.line) { let d = '', pen = false; o.line.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + (L + i * bw + bw / 2).toFixed(1) + ',' + Y(v).toFixed(1); pen = true; });
    g += `<path d="${d}" fill="none" stroke="${o.line.color || '#1d1d1f'}" stroke-width="1.75" stroke-dasharray="${o.line.dash || ''}" stroke-linejoin="round"/>`; }
  const lv = o.values[n - 1]; if (lv) g += `<text x="${(L + (n - 1) * bw + bw / 2).toFixed(1)}" y="${(Y(lv) - 7).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="#1d1d1f">${o.fmtV ? o.fmtV(lv) : lv.toLocaleString('sv-SE')}</text>`;
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || '')}">${g}</svg>`;
}
