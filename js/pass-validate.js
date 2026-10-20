'use strict';
/* Passformatet oh-pass v1: validering med svenska felmeddelanden. Samma kod körs i appen och i
   tools/validate-pass.mjs (CLI för botar). Spegel av schema/pass.schema.json – ändra båda tillsammans. */
(function (root) {
  const FORMAT = 'oh-pass', VERSION = 1;
  const TYPES = { swim: 'simpass', competition: 'tävling', gym: 'gympass', core: 'bålpass', mobility: 'rörlighetspass', imagery: 'pass med inre bilder' };
  const STATS = ['Start', '15 m', '25 m', 'Undervatten', 'Fart'];
  const ID_RE = /^[A-Za-z0-9][A-Za-z0-9:._\-]{2,99}$/, DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const K = {
    doc: ['format', 'version', 'generator', 'generated_at', 'source', 'sessions', 'nutrition', 'restrictions'],
    session: ['id', 'type', 'date', 'start', 'end', 'title', 'author', 'purpose', 'focus', 'rpe', 'rpe_max', 'rationale', 'starts_count', 'total_distance_m', 'status', 'details', 'source', 'optional', 'pool_m', 'event_name', 'restriction_ids', 'series', 'exercises', 'steps', 'result'],
    sresult: ['rpe', 'duration_min', 'comment', 'video_url', 'timing_method', 'fps', 'pool_m', 'start_type', 'conditions', 'context', 'warmup', 'caffeine', 'baseline', 'logged_at'],
    details: ['stop_criterion', 'key_metrics', 'hc_comment', 'warmup'],
    series: ['title', 'rationale', 'rounds', 'timing_mode', 'timing_value', 'work_rest', 'recovery', 'evidence', 'main', 'rows'],
    row: ['reps', 'distance_m', 'description', 'equipment', 'start_type', 'timing_mode', 'timing_value', 'sprint', 'stat_tag', 'segments', 'stop_criterion', 'intensity', 'cues', 'event', 'restriction_ids', 'result'],
    segment: ['from_m', 'to_m', 'turn'],
    rresult: ['status', 'comment', 'stopped_at_rep', 'stop_reason', 'video_url', 'times'],
    time: ['rep', 'segment', 'time_s', 'method', 'fps', 'start_type', 'pool_m', 'splits', 'reaction_s', 'turn_in_s', 'turn_out_s', 'strokes', 'stroke_rate', 'video_url'],
    split: ['at_m', 'time_s'],
    step: ['text', 'duration_s', 'result'],
    restriction: ['id', 'rule', 'valid_from', 'valid_to', 'until', 'author'],
    exercise: ['name', 'sets', 'reps', 'reps_max', 'unit', 'rest', 'load_kg', 'load_text', 'rir', 'rir_max', 'rpe', 'rpe_max', 'velocity_ms', 'set_plan', 'test', 'note', 'progression', 'modification', 'restriction_ids', 'result'],
    setplan: ['reps', 'reps_max', 'load_kg', 'load_text', 'rir', 'velocity_ms'],
    test: ['kind', 'method', 'name'],
    xresult: ['status', 'comment', 'video_url', 'sets', 'attempts'],
    xset: ['set', 'kg', 'reps', 'rir', 'velocity_ms'],
    attempt: ['value_cm'],
    nutrition: ['id', 'scope', 'name', 'day_type', 'date', 'dates', 'valid_from', 'valid_to', 'note', 'author', 'meals', 'source'],
    meal: ['time', 'when', 'name', 'foods', 'protein_g', 'carbs_g', 'relation', 'session_id', 'content'],
    food: ['item', 'amount'],
    source: ['kind', 'file', 'sheet_id', 'tab', 'row', 'pass_id', 'raw_status']
  };
  /* Integritet: endast träningsinnehåll. Fritext som ser ut som hälsodata ger varning (fälten finns inte i formatet). */
  const HEALTH = /\b(diagnos\w*|symtom\w*|smärt\w*|ont i|värk\w*|skad(a|or|ad)\b|inflammation\w*|läkare\w*|vårdcentral\w*|sjukgymnast\w*|läkemedel\w*|medicin(er|ering)?\b|tabletter|ibuprofen|kroppsvikt(en)?\s*(är|:|=)\s*\d|väger\s*\d|vikt(en)?\s*(är|:|=)?\s*\d+\s*kg\s*(kroppsvikt)?$|viktnedgång|gå ner i vikt|bmi\b|reds\b|menstruation\w*|mens\b|mående\w*|ångest\w*|stress(ad|nivå)\w*|sömnkvalitet\w*|mår\s+(bra|dåligt)|känner mig)/i;
  const SUPPL = /\b(koffein|kreatin|beta-?alanin|bikarbonat|natriumbikarbonat|järntablett\w*|d-vitamin|nitrat|rödbetsjuice|melatonin|proteinpulver|kosttillskott|tillskott)\b[^.;]{0,40}?\d+(?:[.,]\d+)?\s*(mg|g|µg|mcg|ie|iu|ml|kapslar|tabletter)\b/i;
  const ENERGY = /\b(underskott\w*|energiunderskott|kalori\w*|kcal|energiupplägg|energitillgänglighet|kroppssammansättning|fettprocent|brytkriteri\w*)\b/i;
  const TUE = /\bTUE\b|medicinsk dispens/;   // versaler: 'tue' i id:n och veckodagar är inte TUE
  /* Smärtskattning (t.ex. 'ryggsmärta 0–10', VAS, NRS) är uttryckligen förbjuden – fel, inte varning. */
  const PAINSCALE = /(smärt\w*|ont|besvär\w*)[^.;|\n]{0,25}?\b(0\s*[–—-]\s*10|vas|nrs)\b|\b(0\s*[–—-]\s*10|vas|nrs)\b[^.;|\n]{0,12}?smärt/i;
  function scanHealth(o, p, W, E) {
    if (typeof o === 'string') { const ps = PAINSCALE.exec(o); if (ps && E) E(p, `Smärtskattning får inte förekomma ("${ps[0].trim()}") – ta bort den. Check-in för besvär är bara ja/nej + kroppsdel i appen.`);
      const tu = TUE.exec(o); if (tu) W(p, `Texten verkar innehålla hälsoinformation ("${tu[0]}"). Endast träningsinnehåll får anges.`); const sp = SUPPL.exec(o); if (sp) W(p, `Tillskott med dos får inte anges ("${sp[0]}") – skriv livsmedel och mängd i stället`); const en = ENERGY.exec(o); if (en) W(p, `Energiupplägg, underskott, kroppssammansättning och brytkriterier ingår inte ("${en[0]}")`);
      const m = HEALTH.exec(o); if (m) W(p, `Texten verkar innehålla hälsoinformation ("${m[0]}"). Endast träningsinnehåll får anges – restriktioner skrivs som träningsregler.`); return; }
    if (Array.isArray(o)) return o.forEach((x, i) => scanHealth(x, `${p}[${i + 1}]`, W, E));
    if (o && typeof o === 'object') Object.entries(o).forEach(([k, v]) => { if (!['source', 'id', 'client_id', 'session_id', 'restriction_ids'].includes(k)) scanHealth(v, join(p, k), W, E); });
  }
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const validDate = s => { if (!DATE_RE.test(s)) return false; const [y, m, d] = s.split('-').map(Number), x = new Date(Date.UTC(y, m - 1, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d; };

  function validate(input) {
    const errors = [], warnings = [];
    const E = (p, m) => errors.push({ path: p, message: m }), W = (p, m) => warnings.push({ path: p, message: m });
    let doc = input;
    if (typeof doc === 'string') { try { doc = JSON.parse(doc); } catch (e) { E('', `Ogiltig JSON: ${e.message}`); return { ok: false, errors, warnings, doc: null }; } }
    // Tolerans: ett ensamt pass eller en lista med pass
    if (Array.isArray(doc)) { W('', 'Dokumentet är en lista – tolkas som { "format": "oh-pass", "version": 1, "sessions": [...] }'); doc = { format: FORMAT, version: VERSION, sessions: doc }; }
    else if (isObj(doc) && !doc.format && doc.type && doc.id) { W('', 'Dokumentet är ett ensamt pass – tolkas som ett dokument med ett pass'); doc = { format: FORMAT, version: VERSION, sessions: [doc] }; }
    if (!isObj(doc)) { E('', 'Dokumentet måste vara ett JSON-objekt'); return { ok: false, errors, warnings, doc: null }; }
    if (doc.format !== FORMAT) E('format', `"format" måste vara "${FORMAT}"`);
    if (doc.version !== VERSION) E('version', `"version" måste vara ${VERSION} (fick ${JSON.stringify(doc.version)})`);
    unknown(doc, K.doc, '', E); srcf(doc, '', E);
    const S = doc.sessions == null ? [] : doc.sessions, N = doc.nutrition == null ? [] : doc.nutrition, RS = doc.restrictions == null ? [] : doc.restrictions;
    if (!Array.isArray(RS)) E('restrictions', '"restrictions" måste vara en lista');
    if (!Array.isArray(S)) E('sessions', '"sessions" måste vara en lista');
    if (!Array.isArray(N)) E('nutrition', '"nutrition" måste vara en lista');
    if (Array.isArray(S) && Array.isArray(N) && Array.isArray(RS) && !S.length && !N.length && !RS.length) E('', 'Dokumentet innehåller inga pass ("sessions"), kostplaner ("nutrition") eller träningsregler ("restrictions")');
    if (Array.isArray(S) && S.length > 500) E('sessions', 'Högst 500 pass per dokument');
    const ids = new Map();
    const dup = (id, p) => { if (typeof id !== 'string') return; if (ids.has(id)) E(p + ' › id', `id "${id}" förekommer flera gånger (även i ${ids.get(id)}) – varje pass och kostplan måste ha ett unikt id`); else ids.set(id, p); };
    if (Array.isArray(S)) S.forEach((s, i) => { const p = `pass ${i + 1}` + (isObj(s) && typeof s.id === 'string' ? ` (${s.id})` : ''); session(s, p, E, W); if (isObj(s)) dup(s.id, p); });
    if (Array.isArray(RS)) RS.forEach((r, i) => { const p = `regel ${i + 1}` + (isObj(r) && typeof r.id === 'string' ? ` (${r.id})` : ''); restriction(r, p, E); if (isObj(r)) dup(r.id, p); });
    // Kopplingar till träningsregler
    const rids = new Set((Array.isArray(RS) ? RS : []).filter(isObj).map(r => r.id));
    const refs = (o, p) => { if (o.restriction_ids == null) return; if (!Array.isArray(o.restriction_ids) || o.restriction_ids.some(x => typeof x !== 'string')) return E(join(p, 'restriction_ids'), '"restriction_ids" måste vara en lista med regel-id');
      o.restriction_ids.filter(x => !rids.has(x)).forEach(x => W(join(p, 'restriction_ids'), `Regeln "${x}" finns inte i dokumentet – den måste redan finnas i appen`)); };
    if (Array.isArray(S)) S.forEach((s, i) => { if (!isObj(s)) return; const p = `pass ${i + 1}` + (typeof s.id === 'string' ? ` (${s.id})` : ''); refs(s, p);
      (Array.isArray(s.exercises) ? s.exercises : []).forEach((x, xi) => isObj(x) && refs(x, join(p, `övning ${xi + 1}`)));
      (Array.isArray(s.series) ? s.series : []).forEach((g, gi) => isObj(g) && Array.isArray(g.rows) && g.rows.forEach((r, ri) => isObj(r) && refs(r, join(p, `serie ${gi + 1} › rad ${ri + 1}`)))); });
    scanHealth(doc.sessions, 'pass', W, E); scanHealth(doc.nutrition, 'kost', W, E); scanHealth(doc.restrictions, 'regler', W, E);
    if (Array.isArray(N)) N.forEach((n, i) => { const p = `kostplan ${i + 1}` + (isObj(n) && typeof n.id === 'string' ? ` (${n.id})` : ''); nutrition(n, p, E, W); if (isObj(n)) dup(n.id, p); });
    return { ok: !errors.length, errors, warnings, doc };
  }
  function unknown(o, keys, p, E) { Object.keys(o).forEach(k => { if (!keys.includes(k)) E(join(p, k), `okänt fält "${k}"${hint(k, keys)}`); }); }
  const FORBIDDEN = /pain|smart|smärt|symptom|symtom|diagnos|injur|skada|medic|läkemedel|drug|tue|weight|vikt|bmi|kcal_in|intake|energy_avail|reds|mood|mående|wellbeing|wellness|feeling|känsla|stress|sleep|sömn|reflect|reflektion|journal|dagbok|conversation|samtal|private|privat|personlig|personal|menstru|cycle|focus_rating|fokusskattning|motivation_rating|health|hälsa|doctor|läkare|physio_note|vård|kcal|energi|energy|deficit|underskott|fat_g|fett|fluid|body|kropps|supplement|tillskott|dos(e|er|ering)?$|pain_score|back_pain/i;
  function hint(k, keys) {
    if (keys === K.nutrition && /^(carbs_g|protein_g)$/.test(k)) return ' – protein och kolhydrater anges per måltid ("meals[].protein_g", "meals[].carbs_g")';
    if (/kcal|energi|energy|deficit|underskott|fat_g|fett|fluid|body|kropps|supplement|tillskott|^dos/i.test(k)) return ' – energiupplägg, underskottsdagar, kroppssammansättning och tillskott med doser ingår inte i formatet';
    if (keys === K.nutrition && k === 'phase') return ' – använd "name" och "valid_from"/"valid_to", och scope "daytype", "day" eller "competition"';
    if (FORBIDDEN.test(k)) return ' – hälso-, mående- och reflektionsuppgifter (t.ex. smärtskattning) ingår inte i formatet; check-in för besvär är bara ja/nej + kroppsdel i appen';
    const m = keys.find(x => lev(x, k) <= 2); return m ? ` – menade du "${m}"?` : ` – fältet finns inte i oh-pass v1`; }
  function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
  const join = (p, k) => p ? `${p} › ${k}` : k;
  function str(o, k, p, E, { req = false, max = 1000, min = 0 } = {}) {
    const v = o[k];
    if (v == null || v === '') { if (req) E(join(p, k), `"${k}" saknas`); return; }
    if (typeof v !== 'string') return E(join(p, k), `"${k}" måste vara text`);
    if (v.trim().length < min) E(join(p, k), `"${k}" får inte vara tom`);
    if (v.length > max) E(join(p, k), `"${k}" är för lång (högst ${max} tecken, fick ${v.length})`);
  }
  function numf(o, k, p, E, { req = false, min = -Infinity, max = Infinity, int = false, gt = false } = {}) {
    const v = o[k];
    if (v == null) { if (req) E(join(p, k), `"${k}" saknas`); return; }
    if (typeof v !== 'number' || !isFinite(v)) return E(join(p, k), `"${k}" måste vara ett tal${typeof v === 'string' && /^\d+([.,]\d+)?$/.test(v.trim()) ? ` (skriv ${v.replace(',', '.')} utan citattecken)` : ''}`);
    if (int && !Number.isInteger(v)) E(join(p, k), `"${k}" måste vara ett heltal`);
    if (gt ? v <= min : v < min) E(join(p, k), `"${k}" måste vara ${gt ? 'större än' : 'minst'} ${min} (fick ${v})`);
    if (v > max) E(join(p, k), `"${k}" får vara högst ${max} (fick ${v})`);
  }
  function enumf(o, k, p, E, vals, req = false) { const v = o[k]; if (v == null) { if (req) E(join(p, k), `"${k}" saknas – ett av ${vals.map(x => `"${x}"`).join(', ')}`); return; } if (!vals.includes(v)) E(join(p, k), `"${k}" måste vara ett av ${vals.map(x => `"${x}"`).join(', ')} (fick ${JSON.stringify(v)})`); }
  function bool(o, k, p, E) { if (o[k] != null && typeof o[k] !== 'boolean') E(join(p, k), `"${k}" måste vara true eller false`); }
  function date(o, k, p, E, req) { const v = o[k]; if (v == null) { if (req) E(join(p, k), `"${k}" saknas (ÅÅÅÅ-MM-DD)`); return; } if (typeof v !== 'string' || !validDate(v)) E(join(p, k), `"${k}" måste vara ett giltigt datum ÅÅÅÅ-MM-DD (fick ${JSON.stringify(v)})`); }
  function time(o, k, p, E, req) { const v = o[k]; if (v == null) { if (req) E(join(p, k), `"${k}" saknas (TT:MM)`); return; } if (typeof v !== 'string' || !TIME_RE.test(v)) E(join(p, k), `"${k}" måste vara en tid TT:MM i 24-timmarsformat, t.ex. "15:00" (fick ${JSON.stringify(v)})`); }
  function id(o, p, E) { const v = o.id; if (v == null || v === '') return E(join(p, 'id'), '"id" saknas – ett stabilt id per pass gör att samma import två gånger inte skapar dubbletter'); if (typeof v !== 'string' || !ID_RE.test(v)) E(join(p, 'id'), `"id" måste vara 3–100 tecken: bokstäver a–z, siffror och : . _ - (fick ${JSON.stringify(v)})`); }

  const START_TYPES = ['block', 'push', 'deadstart', 'flygande'];
  const EQUIP = ['buckets', 'fallskärm', 'fenor', 'paddlar', 'mits', 'sox', 'snorkel', 'dolme', 'annat'];
  const METHODS = ['hand', 'video', 'touchpad', 'elektronisk', 'annan'];
  const CONTEXTS = ['traning', 'test', 'tavling'];
  const EXEC = ['genomford', 'andrad', 'struken'];
  const DAY_TYPES = ['traning', 'dubbelpass', 'vila', 'tavling'];
  const URL_RE = /^https:\/\/[^\s"<>]{3,500}$/;
  const isSwim = t => t === 'swim' || t === 'competition';
  const half = (o, k, p, E) => { if (typeof o[k] === 'number' && Math.round(o[k] * 2) !== o[k] * 2) E(join(p, k), `"${k}" anges i hela eller halva steg (t.ex. 6 eller 6.5)`); };
  const range = (o, a, b, p, E) => { if (typeof o[a] === 'number' && typeof o[b] === 'number' && o[b] < o[a]) E(join(p, b), `"${b}" (${o[b]}) måste vara minst "${a}" (${o[a]})`); if (o[b] != null && o[a] == null) E(join(p, a), `"${a}" saknas – "${b}" är övre gränsen i ett intervall`); };
  function urlf(o, k, p, E) { const v = o[k]; if (v == null) return; if (typeof v !== 'string' || !URL_RE.test(v)) E(join(p, k), `"${k}" måste vara en https-länk (bara länk, inga filer) (fick ${JSON.stringify(String(v).slice(0, 60))})`); }

  function session(s, p, E, W) {
    if (!isObj(s)) return E(p, 'Passet måste vara ett objekt');
    unknown(s, K.session, p, E); id(s, p, E);
    enumf(s, 'type', p, E, Object.keys(TYPES), true); date(s, 'date', p, E, true); str(s, 'title', p, E, { req: true, max: 120, min: 1 });
    time(s, 'start', p, E); time(s, 'end', p, E);
    if (TIME_RE.test(s.start || '') && TIME_RE.test(s.end || '') && s.end <= s.start) E(join(p, 'end'), `"end" (${s.end}) måste vara efter "start" (${s.start})`);
    if (!s.start) W(join(p, 'start'), 'Starttid saknas – passet visas utan tid');
    str(s, 'author', p, E, { max: 120 }); if (!s.author) W(join(p, 'author'), '"author" saknas – ange vem som skrev passet, t.ex. "Swim Coach"');
    str(s, 'purpose', p, E, { max: 1000 }); str(s, 'focus', p, E, { max: 500 }); str(s, 'rationale', p, E, { max: 4000 }); str(s, 'event_name', p, E, { max: 120 });
    numf(s, 'rpe', p, E, { min: 1, max: 10 }); half(s, 'rpe', p, E); numf(s, 'rpe_max', p, E, { min: 1, max: 10 }); half(s, 'rpe_max', p, E); range(s, 'rpe', 'rpe_max', p, E);
    numf(s, 'starts_count', p, E, { min: 0, max: 100, int: true }); numf(s, 'total_distance_m', p, E, { min: 0, max: 20000, int: true });
    enumf(s, 'status', p, E, ['utkast', 'godkand']);
    if (s.status === 'godkand') W(join(p, 'status'), 'Pass importeras alltid som utkast – endast simmaren kan godkänna i appen');
    bool(s, 'optional', p, E);
    if (isSwim(s.type)) enumf(s, 'pool_m', p, E, [25, 50], true); else if (s.pool_m != null) E(join(p, 'pool_m'), '"pool_m" (bassänglängd) gäller bara sim- och tävlingspass');
    if (s.event_name != null && s.type !== 'competition') E(join(p, 'event_name'), '"event_name" används bara för tävlingar (type "competition")');
    if (s.details != null) { if (!isObj(s.details)) E(join(p, 'details'), '"details" måste vara ett objekt'); else { unknown(s.details, K.details, join(p, 'details'), E); K.details.forEach(k => str(s.details, k, join(p, 'details'), E, { max: 1000 })); } }
    srcf(s, p, E);
    if (s.result != null) sessionResult(s, join(p, 'result'), E, W);
    if (s.type === 'imagery') {
      if (s.series != null || s.exercises != null) E(p, 'Pass med inre bilder byggs av "steps" – inte "series" eller "exercises"');
      if (!Array.isArray(s.steps) || !s.steps.length) return E(join(p, 'steps'), 'Pass med inre bilder behöver minst ett moment i "steps"');
      s.steps.forEach((x, xi) => { const q = join(p, `moment ${xi + 1}`); if (!isObj(x)) return E(q, 'Momentet måste vara ett objekt'); unknown(x, K.step, q, E); str(x, 'text', q, E, { req: true, max: 300, min: 1 }); numf(x, 'duration_s', q, E, { min: 0, max: 3600, int: true }); if (x.result != null) execResult(x.result, join(q, 'result'), E, W); });
      if (TIME_RE.test(s.start || '') && TIME_RE.test(s.end || '') && (+s.end.slice(0, 2) * 60 + +s.end.slice(3)) - (+s.start.slice(0, 2) * 60 + +s.start.slice(3)) > 30) W(join(p, 'end'), 'Pass med inre bilder är tänkta som korta pass (högst 30 min)');
      return;
    }
    if (s.steps != null) E(join(p, 'steps'), '"steps" används bara för pass med inre bilder (type "imagery")');
    if (isSwim(s.type)) {
      if (s.exercises != null) E(join(p, 'exercises'), 'Sim- och tävlingspass byggs av "series" med "rows" – inte "exercises"');
      if (!Array.isArray(s.series) || !s.series.length) return E(join(p, 'series'), 'Simpass behöver minst en serie i "series"');
      s.series.forEach((g, gi) => series(g, join(p, `serie ${gi + 1}`), E, W, s));
    } else if (TYPES[s.type]) {
      if (s.series != null) E(join(p, 'series'), `${TYPES[s.type][0].toUpperCase() + TYPES[s.type].slice(1)} byggs av "exercises" – "series" används bara för simpass`);
      if (!Array.isArray(s.exercises) || !s.exercises.length) return E(join(p, 'exercises'), `${TYPES[s.type][0].toUpperCase() + TYPES[s.type].slice(1)} behöver minst en övning i "exercises"`);
      s.exercises.forEach((x, xi) => exercise(x, join(p, `övning ${xi + 1}`), E, W, s.type));
    }
  }
  function sessionResult(s, p, E, W) {
    const r = s.result; if (!isObj(r)) return E(p, '"result" måste vara ett objekt');
    unknown(r, K.sresult, p, E);
    numf(r, 'rpe', p, E, { min: 1, max: 10 }); half(r, 'rpe', p, E); numf(r, 'duration_min', p, E, { min: 0, max: 600, int: true });
    str(r, 'comment', p, E, { max: 500 }); urlf(r, 'video_url', p, E); enumf(r, 'timing_method', p, E, METHODS); str(r, 'conditions', p, E, { max: 300 });
    enumf(r, 'start_type', p, E, START_TYPES); numf(r, 'fps', p, E, { min: 1, max: 1000, int: true }); enumf(r, 'context', p, E, CONTEXTS); str(r, 'warmup', p, E, { max: 120 }); bool(r, 'caffeine', p, E); bool(r, 'baseline', p, E);
    if (r.fps != null && r.timing_method !== 'video') E(join(p, 'fps'), '"fps" gäller bara tidtagning med video');
    if (r.baseline && r.context !== 'test') W(join(p, 'baseline'), 'Baslinje brukar vara en testdag – ange "context": "test"');
    if (isSwim(s.type)) enumf(r, 'pool_m', p, E, [25, 50], true); else if (r.pool_m != null) E(join(p, 'pool_m'), '"pool_m" gäller bara sim- och tävlingsresultat');
    if (r.logged_at != null && (typeof r.logged_at !== 'string' || isNaN(Date.parse(r.logged_at)))) E(join(p, 'logged_at'), '"logged_at" måste vara en tidpunkt i ISO 8601, t.ex. "2026-10-12T17:05:00+02:00"');
    if (validDate(s.date || '') && s.date > new Date().toISOString().slice(0, 10)) W(p, `Resultat på ett pass i framtiden (${s.date})`);
  }
  function execResult(r, p, E, W) {
    if (!isObj(r)) return E(p, '"result" måste vara ett objekt');
    enumf(r, 'status', p, E, EXEC); str(r, 'comment', p, E, { max: 300 });
    if ((r.status === 'andrad' || r.status === 'struken') && !r.comment) W(join(p, 'comment'), `Status "${r.status}" utan kommentar – skriv kort vad som ändrades`);
  }
  function series(g, p, E, W, s) {
    if (!isObj(g)) return E(p, 'Serien måste vara ett objekt');
    unknown(g, K.series, p, E); str(g, 'title', p, E, { max: 120 }); str(g, 'rationale', p, E, { max: 4000 });
    numf(g, 'rounds', p, E, { min: 1, max: 20, int: true }); timing(g, p, E);
    str(g, 'work_rest', p, E, { max: 20 }); if (typeof g.work_rest === 'string' && !/^\d+(?:[.,]\d+)?\s*:\s*\d+(?:[.,]\d+)?$/.test(g.work_rest)) E(join(p, 'work_rest'), `Arbete–vila-kvot skrivs som "1:12" (fick "${g.work_rest}")`);
    enumf(g, 'recovery', p, E, ['full', 'ofullstandig']); enumf(g, 'evidence', p, E, ['stark', 'mattlig', 'svag', 'extrapolerad']); bool(g, 'main', p, E);
    if (g.main && !g.rationale) W(join(p, 'rationale'), 'Huvudset utan motivering – ange fysiologisk motivering, arbete–vila-kvot, återhämtning och evidensgrad');
    if (g.main && g.rationale && (!g.work_rest || !g.recovery || !g.evidence)) W(p, 'Huvudset: ange "work_rest", "recovery" och "evidence" tillsammans med motiveringen');
    if (!Array.isArray(g.rows) || !g.rows.length) return E(join(p, 'rows'), 'Serien behöver minst en rad i "rows"');
    const rounds = g.rounds || 1;
    g.rows.forEach((r, ri) => row(r, join(p, `rad ${ri + 1}`), E, W, s, rounds));
  }
  function timing(o, q, E) {
    enumf(o, 'timing_mode', q, E, ['starttid', 'vila']); str(o, 'timing_value', q, E, { max: 40 });
    if (o.timing_mode && !o.timing_value) E(join(q, 'timing_value'), `"timing_value" saknas för tidsstyrning "${o.timing_mode}" (t.ex. "1:30")`);
    if (o.timing_value && !o.timing_mode) E(join(q, 'timing_mode'), '"timing_mode" saknas – "starttid" eller "vila" (vila ELLER starttid, inte båda)');
    if (o.timing_mode === 'starttid' && typeof o.timing_value === 'string' && !/^\d{1,2}:\d{2}$|^\d{1,3}\s*s?$/.test(o.timing_value)) E(join(q, 'timing_value'), `Starttid ska skrivas som m:ss eller sekunder, t.ex. "1:30" eller "45" (fick "${o.timing_value}")`);
  }
  function row(r, q, E, W, s, rounds) {
    if (!isObj(r)) return E(q, 'Raden måste vara ett objekt');
    unknown(r, K.row, q, E);
    numf(r, 'reps', q, E, { req: true, min: 1, max: 100, int: true }); numf(r, 'distance_m', q, E, { min: 0, max: 5000, gt: true });
    str(r, 'description', q, E, { max: 160 }); str(r, 'intensity', q, E, { max: 200 }); str(r, 'cues', q, E, { max: 1000 }); str(r, 'stop_criterion', q, E, { max: 300 }); str(r, 'event', q, E, { max: 80 });
    if (r.equipment != null) { if (!Array.isArray(r.equipment)) E(join(q, 'equipment'), `"equipment" måste vara en lista, t.ex. ["fenor", "paddlar"] – tillåtna: ${EQUIP.join(', ')}`); else r.equipment.forEach(x => { if (!EQUIP.includes(x)) E(join(q, 'equipment'), `okänd utrustning ${JSON.stringify(x)} – tillåtna: ${EQUIP.join(', ')}`); }); }
    if (r.distance_m == null && !r.description) E(q, 'Raden behöver "distance_m" (meter) eller "description"');
    enumf(r, 'start_type', q, E, START_TYPES); timing(r, q, E);
    bool(r, 'sprint', q, E); enumf(r, 'stat_tag', q, E, STATS);
    if (r.stat_tag === '25 m' && r.distance_m !== 25) E(join(q, 'stat_tag'), 'Statistik "25 m" (KPI P1) kräver distance_m 25');
    if (r.stat_tag === '15 m' && !(r.distance_m >= 15)) E(join(q, 'stat_tag'), 'Statistik "15 m" (KPI P2) kräver distance_m minst 15');
    if (['Start', 'Fart'].includes(r.stat_tag) && r.distance_m == null) E(join(q, 'stat_tag'), `Statistik "${r.stat_tag}" kräver distance_m`);
    if (r.segments != null) {
      if (!Array.isArray(r.segments)) E(join(q, 'segments'), '"segments" måste vara en lista, t.ex. [{ "from_m": 0, "to_m": 15 }]');
      else r.segments.forEach((g, gi) => { const z = join(q, `segment ${gi + 1}`); if (!isObj(g)) return E(z, 'Segmentet måste vara ett objekt'); unknown(g, K.segment, z, E);
        numf(g, 'from_m', z, E, { req: true, min: 0, max: 5000 }); numf(g, 'to_m', z, E, { req: true, min: 0, max: 5000 }); bool(g, 'turn', z, E);
        if (typeof g.from_m === 'number' && typeof g.to_m === 'number' && g.to_m <= g.from_m) E(z, `Segment ${g.from_m}–${g.to_m} m: "to_m" måste vara större än "from_m"`);
        if (typeof g.to_m === 'number' && typeof r.distance_m === 'number' && g.to_m > r.distance_m) E(z, `Segmentet slutar vid ${g.to_m} m men raden är ${r.distance_m} m`); });
    }
    if (r.sprint && !r.start_type && r.distance_m && r.distance_m <= 50) W(join(q, 'start_type'), 'Sprintrad utan "start_type" (block, push, deadstart eller flygande)');
    if (r.result != null) rowResult(r, join(q, 'result'), E, W, s, rounds);
  }
  function rowResult(r, p, E, W, s, rounds) {
    const x = r.result; if (!isObj(x)) return E(p, '"result" måste vara ett objekt');
    unknown(x, K.rresult, p, E); execResult(x, p, E, W); const n = (r.reps || 1) * rounds;
    numf(x, 'stopped_at_rep', p, E, { min: 1, max: n, int: true });
    if (x.stopped_at_rep != null && !x.stop_reason) W(join(p, 'stop_reason'), 'Stoppad rep utan "stop_reason" – standard är "fartfall"');
    enumf(x, 'stop_reason', p, E, ['fartfall', 'annat']); urlf(x, 'video_url', p, E);
    if (x.times != null) {
      if (!Array.isArray(x.times)) return E(join(p, 'times'), '"times" måste vara en lista');
      if (x.status === 'struken' && x.times.length) E(join(p, 'times'), 'En struken rad kan inte ha tider');
      const seen = new Set(), poolOk = (s.result && s.result.pool_m) || s.pool_m;
      x.times.forEach((t, ti) => {
        const z = join(p, `tid ${ti + 1}`); if (!isObj(t)) return E(z, 'Tiden måste vara ett objekt'); unknown(t, K.time, z, E);
        numf(t, 'rep', z, E, { req: true, min: 1, max: n, int: true }); numf(t, 'time_s', z, E, { min: 0.5, max: 3600 });
        if (typeof t.rep === 'number' && seen.has(t.rep + ':' + (t.segment ?? ''))) E(join(z, 'rep'), `Rep ${t.rep} har redan en tid${t.segment != null ? ' för segmentet' : ''}`); seen.add(t.rep + ':' + (t.segment ?? ''));
        numf(t, 'segment', z, E, { min: 1, max: Math.max(1, (r.segments || []).length), int: true }); if (t.segment != null && !(r.segments || []).length) E(join(z, 'segment'), '"segment" hänvisar till radens "segments", men raden har inga segment');
        enumf(t, 'method', z, E, METHODS); numf(t, 'fps', z, E, { min: 1, max: 1000, int: true }); enumf(t, 'start_type', z, E, START_TYPES); enumf(t, 'pool_m', z, E, [25, 50]);
        if (!t.pool_m && !poolOk) E(join(z, 'pool_m'), 'Bassänglängd saknas – ange "pool_m" på tiden, i passets "result" eller på passet');
        numf(t, 'reaction_s', z, E, { min: 0, max: 2 }); numf(t, 'turn_in_s', z, E, { min: 0, max: 30 }); numf(t, 'turn_out_s', z, E, { min: 0, max: 30 });
        numf(t, 'strokes', z, E, { min: 0, max: 200, int: true }); numf(t, 'stroke_rate', z, E, { min: 0, max: 100 }); urlf(t, 'video_url', z, E);
        if (t.time_s == null && !(t.splits || []).length) E(z, 'Tiden behöver "time_s" eller "splits"');
        if (t.splits != null) {
          if (!Array.isArray(t.splits)) E(join(z, 'splits'), '"splits" måste vara en lista, t.ex. [{ "at_m": 15, "time_s": 6.21 }]');
          else { let last = 0, lastT = 0; t.splits.forEach((sp, si) => { const y = join(z, `split ${si + 1}`); if (!isObj(sp)) return E(y, 'Splitten måste vara ett objekt'); unknown(sp, K.split, y, E);
            numf(sp, 'at_m', y, E, { req: true, min: 1, max: 5000, int: true }); numf(sp, 'time_s', y, E, { req: true, min: 0.1, max: 3600 });
            if (typeof sp.at_m === 'number') { if (sp.at_m <= last) E(y, 'Splittar måste komma i stigande ordning efter meter'); if (typeof r.distance_m === 'number' && sp.at_m > r.distance_m) E(y, `Split vid ${sp.at_m} m men raden är ${r.distance_m} m`); last = sp.at_m; }
            if (typeof sp.time_s === 'number') { if (sp.time_s <= lastT) E(y, 'Splittider måste öka'); lastT = sp.time_s; } });
            if (typeof t.time_s === 'number' && lastT && lastT > t.time_s) E(join(z, 'splits'), 'En splittid är längre än sluttiden'); }
        }
      });
    }
  }
  function exercise(x, p, E, W, type) {
    if (!isObj(x)) return E(p, 'Övningen måste vara ett objekt');
    unknown(x, K.exercise, p, E); str(x, 'name', p, E, { req: true, max: 200, min: 1 });
    numf(x, 'sets', p, E, { req: true, min: 1, max: 50, int: true }); numf(x, 'reps', p, E, { min: 0, max: 600 }); numf(x, 'reps_max', p, E, { min: 0, max: 600 }); range(x, 'reps', 'reps_max', p, E);
    enumf(x, 'unit', p, E, ['reps', 's']); str(x, 'rest', p, E, { max: 40 });
    numf(x, 'load_kg', p, E, { min: 0, max: 500 }); str(x, 'load_text', p, E, { max: 60 });
    numf(x, 'rir', p, E, { min: 0, max: 10 }); half(x, 'rir', p, E); numf(x, 'rir_max', p, E, { min: 0, max: 10 }); half(x, 'rir_max', p, E); range(x, 'rir', 'rir_max', p, E);
    numf(x, 'rpe', p, E, { min: 1, max: 10 }); half(x, 'rpe', p, E); numf(x, 'rpe_max', p, E, { min: 1, max: 10 }); half(x, 'rpe_max', p, E); range(x, 'rpe', 'rpe_max', p, E);
    numf(x, 'velocity_ms', p, E, { min: 0, max: 5, gt: true });
    ['note', 'progression', 'modification'].forEach(k => str(x, k, p, E, { max: 300 }));
    if (x.reps == null && x.unit !== 's' && !x.test && !(x.set_plan || []).length) W(join(p, 'reps'), '"reps" saknas – endast antal set visas');
    if (type !== 'gym' && x.load_kg != null) W(join(p, 'load_kg'), 'Belastning i ett bål-/rörlighetspass – kontrollera passtypen');
    if (x.set_plan != null) {
      if (!Array.isArray(x.set_plan)) E(join(p, 'set_plan'), '"set_plan" måste vara en lista med ett objekt per set');
      else { if (x.set_plan.length !== x.sets) E(join(p, 'set_plan'), `"set_plan" har ${x.set_plan.length} set men "sets" är ${x.sets}`);
        x.set_plan.forEach((sp, si) => { const q = join(p, `set ${si + 1}`); if (!isObj(sp)) return E(q, 'Setet måste vara ett objekt'); unknown(sp, K.setplan, q, E);
          numf(sp, 'reps', q, E, { min: 0, max: 600 }); numf(sp, 'reps_max', q, E, { min: 0, max: 600 }); range(sp, 'reps', 'reps_max', q, E); numf(sp, 'load_kg', q, E, { min: 0, max: 500 }); str(sp, 'load_text', q, E, { max: 60 });
          numf(sp, 'rir', q, E, { min: 0, max: 10 }); half(sp, 'rir', q, E); numf(sp, 'velocity_ms', q, E, { min: 0, max: 5, gt: true }); }); }
    }
    if (x.test != null) {
      const q = join(p, 'test'); if (!isObj(x.test)) E(q, '"test" måste vara ett objekt');
      else { unknown(x.test, K.test, q, E); enumf(x.test, 'kind', q, E, ['cmj', 'langdhopp', 'annat'], true); enumf(x.test, 'method', q, E, ['matta', 'platta', 'app', 'måttband']);
        if (x.test.kind === 'cmj' && !x.test.method) E(join(q, 'method'), 'CMJ kräver "method": "matta", "platta" eller "app"'); str(x.test, 'name', q, E, { max: 80 }); }
    }
    if (x.result != null) {
      const q = join(p, 'result'), r = x.result; if (!isObj(r)) return E(q, '"result" måste vara ett objekt');
      unknown(r, K.xresult, q, E); execResult(r, q, E, W); urlf(r, 'video_url', q, E);
      if (r.sets != null) { if (!Array.isArray(r.sets)) E(join(q, 'sets'), '"sets" måste vara en lista');
        else r.sets.forEach((st, si) => { const z = join(q, `set ${si + 1}`); if (!isObj(st)) return E(z, 'Setet måste vara ett objekt'); unknown(st, K.xset, z, E);
          numf(st, 'set', z, E, { req: true, min: 1, max: 50, int: true }); numf(st, 'kg', z, E, { min: 0, max: 500 }); numf(st, 'reps', z, E, { min: 0, max: 600 });
          numf(st, 'rir', z, E, { min: 0, max: 10 }); half(st, 'rir', z, E); numf(st, 'velocity_ms', z, E, { min: 0, max: 5, gt: true }); }); }
      if (r.attempts != null) { if (!x.test) E(join(q, 'attempts'), '"attempts" används bara för tester ("test")');
        if (!Array.isArray(r.attempts)) E(join(q, 'attempts'), '"attempts" måste vara en lista, t.ex. [{ "value_cm": 42.5 }]');
        else r.attempts.forEach((a, ai) => { const z = join(q, `försök ${ai + 1}`); if (!isObj(a)) return E(z, 'Försöket måste vara ett objekt'); unknown(a, K.attempt, z, E); numf(a, 'value_cm', z, E, { req: true, min: 0, max: 400 }); }); }
    }
  }
  function restriction(r, p, E) {
    if (!isObj(r)) return E(p, 'Regeln måste vara ett objekt');
    unknown(r, K.restriction, p, E); id(r, p, E); str(r, 'rule', p, E, { req: true, max: 300, min: 1 }); date(r, 'valid_from', p, E, true); date(r, 'valid_to', p, E, false);
    str(r, 'until', p, E, { max: 120 }); str(r, 'author', p, E, { max: 120 });
    if (r.valid_to == null && !r.until) E(p, 'Ange giltighetstid: "valid_to" (datum) och/eller "until" (t.ex. "fysiobedömning")');
    if (validDate(r.valid_from || '') && validDate(r.valid_to || '') && r.valid_to < r.valid_from) E(join(p, 'valid_to'), `"valid_to" (${r.valid_to}) är före "valid_from" (${r.valid_from})`);
  }
  function nutrition(n, p, E, W) {
    if (!isObj(n)) return E(p, 'Kostplanen måste vara ett objekt');
    srcf(n, p, E); unknown(n, K.nutrition, p, E); id(n, p, E); enumf(n, 'scope', p, E, ['daytype', 'day', 'competition'], true);
    str(n, 'name', p, E, { max: 60 }); str(n, 'note', p, E, { max: 500 }); str(n, 'author', p, E, { max: 120 });
    date(n, 'valid_from', p, E, false); date(n, 'valid_to', p, E, false);
    if (validDate(n.valid_from || '') && validDate(n.valid_to || '') && n.valid_to < n.valid_from) E(join(p, 'valid_to'), `"valid_to" (${n.valid_to}) är före "valid_from" (${n.valid_from})`);
    if (n.scope === 'daytype') { enumf(n, 'day_type', p, E, DAY_TYPES, true); if (n.date != null || n.dates != null) E(p, 'En kostplan per dagstyp gäller alla dagar av typen – använd scope "day" för ett enskilt datum'); }
    else if (n.day_type != null) E(join(p, 'day_type'), '"day_type" används bara med scope "daytype"');
    if (n.scope === 'day') date(n, 'date', p, E, true);
    if (n.scope === 'competition') { if (n.date == null && n.dates == null) E(p, 'Tävlingsrutinen behöver "date" eller "dates"'); date(n, 'date', p, E, false);
      if (n.dates != null) { if (!Array.isArray(n.dates) || !n.dates.length) E(join(p, 'dates'), '"dates" måste vara en lista med datum'); else n.dates.forEach((d, i) => { if (typeof d !== 'string' || !validDate(d)) E(join(p, `dates[${i + 1}]`), `ogiltigt datum ${JSON.stringify(d)}`); }); } }
    else if (n.dates != null) E(join(p, 'dates'), '"dates" används bara för tävlingsrutin (scope "competition")');
    if (!n.author) W(join(p, 'author'), '"author" saknas – ange vem som skrev planen, t.ex. "Nutritionist"');
    if (!Array.isArray(n.meals) || !n.meals.length) return E(join(p, 'meals'), 'Kostplanen behöver minst en måltid i "meals"');
    n.meals.forEach((m, i) => { const q = join(p, `måltid ${i + 1}`); if (!isObj(m)) return E(q, 'Måltiden måste vara ett objekt'); unknown(m, K.meal, q, E);
      time(m, 'time', q, E); str(m, 'when', q, E, { max: 40 }); if (!m.time && !m.when) E(q, 'Måltiden behöver "time" (TT:MM) eller "when" (t.ex. "3 h före start")');
      str(m, 'name', q, E, { max: 60 }); str(m, 'content', q, E, { max: 500 }); numf(m, 'protein_g', q, E, { min: 0, max: 200 }); numf(m, 'carbs_g', q, E, { min: 0, max: 400 });
      enumf(m, 'relation', q, E, ['fore_pass', 'efter_pass']); str(m, 'session_id', q, E, { max: 100 });
      if (m.session_id != null && !m.relation) E(join(q, 'relation'), '"session_id" kräver "relation": "fore_pass" eller "efter_pass"');
      if (m.session_id != null && n.scope === 'daytype') E(join(q, 'session_id'), 'En plan per dagstyp kan inte peka på ett visst pass – använd "relation" utan "session_id" (kopplas till dagens första/sista pass)');
      if (m.foods != null) { if (!Array.isArray(m.foods)) E(join(q, 'foods'), '"foods" måste vara en lista, t.ex. [{ "item": "Havregryn", "amount": "1 dl" }]');
        else m.foods.forEach((f, fi) => { const z = join(q, `livsmedel ${fi + 1}`); if (!isObj(f)) return E(z, 'Livsmedlet måste vara ett objekt'); unknown(f, K.food, z, E); str(f, 'item', z, E, { req: true, max: 120, min: 1 }); str(f, 'amount', z, E, { max: 40 }); }); }
      if (!m.content && !(m.foods || []).length) E(q, 'Måltiden behöver "foods" (livsmedel och mängd) eller "content"'); });
  }
  function srcf(o, p, E) {
    if (o.source == null) return; const q = join(p, 'source');
    if (!isObj(o.source)) return E(q, '"source" måste vara ett objekt');
    unknown(o.source, K.source, q, E); ['kind', 'file', 'sheet_id', 'tab', 'pass_id', 'raw_status'].forEach(k => str(o.source, k, q, E, { max: 200 })); numf(o.source, 'row', q, E, { min: 1, max: 1e6, int: true });
  }
  const fmtIssue = x => (x.path ? x.path + ': ' : '') + x.message;
  const api = { FORMAT, VERSION, STATS, TYPES, validate, fmtIssue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PassFormat = api;
})(typeof window !== 'undefined' ? window : globalThis);
