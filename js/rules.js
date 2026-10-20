/* Träningsregler (restriktioner med giltighetstid) och check-in för besvär.
   INTEGRITET: regler är formulerade som träningsregler – aldrig diagnoser eller symtom.
   Check-in är bara ja/nej plus kroppsdel ur en fast lista. Inga skattningar, ingen fritext. */
const rulesAll = () => Object.values(DB.restrictions || {}).sort((a, b) => a.validFrom.localeCompare(b.validFrom));
const ruleActive = (r, ds) => r.validFrom <= ds && (!r.validTo || ds <= r.validTo);
const rulesOn = ds => rulesAll().filter(r => ruleActive(r, ds));
const ruleRange = r => `fr.o.m. ${prettyShort(r.validFrom)}${r.validTo ? ` t.o.m. ${prettyShort(r.validTo)}` : ''}${r.until ? ` · t.o.m. ${esc(r.until)}` : ''}`;
function prettyShort(ds) { const d = parseYmd(ds); return `${d.getDate()}/${d.getMonth() + 1}`; }
function rulesHTML(ds) {
  if (!FEATURES.restrictions) return '';
  const rs = rulesOn(ds); if (!rs.length) return '';
  return `<div class="card rules"><div class="type"><i style="background:var(--warn,#c77700)"></i>Träningsregler</div>
    ${rs.map(r => `<div class="rule"><b>${esc(r.rule)}</b><span>${ruleRange(r)}${r.author ? ' · ' + esc(r.author) : ''}</span>
      ${isCoach() ? `<button class="link" onclick="ruleEnd('${esc(r.id)}','${ds}')">Avsluta</button>` : ''}</div>`).join('')}</div>`;
}
/* Badge på pass/moment som är kopplade till en regel */
function ruleBadge(ids, ds) {
  if (!FEATURES.restrictions) return '';
  const rs = (ids || []).map(id => (DB.restrictions || {})[id]).filter(r => r && ruleActive(r, ds));
  return rs.length ? `<span class="rbadge" title="${esc(rs.map(r => r.rule).join(' · '))}">Regel: ${esc(rs[0].rule)}${rs.length > 1 ? ` (+${rs.length - 1})` : ''}</span>` : '';
}
function ruleEnd(id, ds) {
  const r = DB.restrictions[id]; if (!r || !confirm(`Avsluta regeln "${r.rule}" i dag?`)) return;
  r.validTo = ds < r.validFrom ? r.validFrom : ds; r._dirty = true; save(); haptic(); dayRender();
}
/* Check-in: syns för simmaren (redigerbar) och coachen (läsbar) */
const checkinKey = ds => ds;
function checkinHTML(ds) {
  if (!FEATURES.checkin) return '';
  const c = (DB.checkins || {})[checkinKey(ds)], me = !isCoach();
  if (!me && !c) return '';
  if (!me) return `<div class="card checkin ro"><div class="type"><i style="background:var(--mut2)"></i>Check-in</div><p>${c.hasIssue ? `Besvär: <b>${esc(c.bodyPart)}</b>` : 'Inga besvär'}</p></div>`;
  const yes = c && c.hasIssue, no = c && !c.hasIssue;
  return `<div class="card checkin"><div class="type"><i style="background:var(--mut2)"></i>Check-in</div><h3>Besvär i dag?</h3>
    <div class="seg ci"><button class="${no ? 'on' : ''}" onclick="checkinSet('${ds}',false)">Nej</button><button class="${yes ? 'on' : ''}" onclick="checkinSet('${ds}',true)">Ja</button></div>
    ${yes ? `<div class="bparts" role="group" aria-label="Kroppsdel">${BODY_PARTS.map(b => `<button class="chip ${c.bodyPart === b ? 'on' : ''}" onclick="checkinPart('${ds}','${b}')">${b}</button>`).join('')}</div>` : ''}
    <p class="fine">Bara ja/nej och kroppsdel. Prata med din coach om något behöver ändras i träningen.</p></div>`;
}
function checkinSet(ds, yes) {
  DB.checkins = DB.checkins || {}; const k = checkinKey(ds), c = DB.checkins[k];
  if (c && c.hasIssue === yes && !yes) { delete DB.checkins[k]; DB.deletedCheckins = [...(DB.deletedCheckins || []), ds]; }
  else DB.checkins[k] = { date: ds, hasIssue: yes, bodyPart: yes ? (c && c.bodyPart) || null : null, _dirty: true };
  haptic(); save(); dayRender();
}
function checkinPart(ds, b) { const c = DB.checkins[checkinKey(ds)]; if (!c) return; c.bodyPart = b; c._dirty = true; haptic(); save(); dayRender(); }
