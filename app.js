'use strict';

// ---------- Speicher ----------
const KEY = 'organisation-v1';
const defaults = () => ({
  tasks: [],      // {id, text, list, due, done, created}
  plan: [],       // {id, name, exercises: [{id, name, sets, reps, weight}]}
  log: [],        // {id, dayName, start, end, exercises: [{name, sets: [{reps, weight, done}]}]}
  session: null,  // laufendes Training, gleiche Form wie ein Log-Eintrag
  settings: { rest: 90 },
});

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Startplan aus den Screenshots. Sätze/Wdh./Gewichte fehlen noch ("Krafttest"),
// daher nur Platzhalter: 3 Sätze, Wiederholungen leer.
const START_PLAN = [
  ['Push', ['Beinpresse', 'Wadenheben an der Beinpresse', 'Schrägbankdrücken an der Multipresse', 'Schulterpresse', 'Unterarmstütz']],
  ['Pull', ['Butterfly Reverse', 'Seitstütz', 'Rückenstrecker Maschine']],
  ['Full Body', ['Hürdensitz', 'Fußkreisen', 'Handlauf', 'Beinpresse', 'Beinbeuger im Sitzen', 'Breites Latziehen im neutralen Griff', 'Kurzhantel-Schrägbankdrücken']],
];

let state = load();
if (!state.seeded && !state.plan.length) {
  state.plan = START_PLAN.map(([name, exs]) => ({
    id: uid(), name, exercises: exs.map(n => ({ id: uid(), name: n, sets: 3, reps: '', weight: null })),
  }));
}
state.seeded = true;
save();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? Object.assign(defaults(), JSON.parse(raw)) : defaults();
  } catch { return defaults(); }
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = iso => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const fmtDur = ms => { const s = Math.max(0, Math.floor(ms / 1000)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };

// ---------- UI-Zustand (nicht gespeichert) ----------
let tab = 'tasks';
let listFilter = 'Alle';
let showDone = false;
let editPlan = false;
let restEnd = 0;

const view = document.getElementById('view');
const titles = { tasks: 'Aufgaben', gym: 'Training', settings: 'Mehr' };

function render() {
  document.getElementById('title').textContent = titles[tab];
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  view.innerHTML = tab === 'tasks' ? renderTasks() : tab === 'gym' ? renderGym() : renderSettings();
}

// ---------- Aufgaben ----------
function lists() {
  const names = [...new Set(state.tasks.map(t => t.list).filter(Boolean))].sort();
  return names.length ? names : ['Allgemein'];
}

function renderTasks() {
  const all = lists();
  if (listFilter !== 'Alle' && !all.includes(listFilter)) listFilter = 'Alle';
  const inList = state.tasks.filter(t => listFilter === 'Alle' || t.list === listFilter);
  const open = inList.filter(t => !t.done).sort((a, b) => (a.due || '9999') .localeCompare(b.due || '9999') || a.created - b.created);
  const done = inList.filter(t => t.done);

  const taskRow = t => {
    const over = t.due && !t.done && t.due < today();
    return `<div class="task ${t.done ? 'done' : ''}">
      <input type="checkbox" data-act="toggle" data-id="${t.id}" ${t.done ? 'checked' : ''}>
      <div class="text">${esc(t.text)}
        <div class="due ${over ? 'over' : ''}">${listFilter === 'Alle' ? esc(t.list) : ''}${t.due ? ' · ' + fmtDate(t.due) : ''}</div>
      </div>
      <button class="btn danger" data-act="del-task" data-id="${t.id}">Löschen</button>
    </div>`;
  };

  return `
    <form class="card" id="task-form">
      <input name="text" placeholder="Neue Aufgabe" autocomplete="off" required>
      <div class="row" style="margin-top:8px">
        <input class="grow" name="list" list="lists" placeholder="Liste" value="${listFilter === 'Alle' ? '' : esc(listFilter)}">
        <input class="grow" name="due" type="date">
        <button class="btn">+</button>
      </div>
      <datalist id="lists">${all.map(l => `<option value="${esc(l)}">`).join('')}</datalist>
    </form>
    <div class="chips">${['Alle', ...all].map(l => `<button class="chip ${l === listFilter ? 'active' : ''}" data-act="filter" data-list="${esc(l)}">${esc(l)}</button>`).join('')}</div>
    <div class="card">${open.length ? open.map(taskRow).join('') : '<div class="empty">Nichts offen.</div>'}</div>
    ${done.length ? `
      <div class="row"><button class="link grow" style="text-align:left" data-act="show-done">${showDone ? 'Erledigte ausblenden' : `Erledigt (${done.length}) anzeigen`}</button>
      ${showDone ? '<button class="btn danger" data-act="clear-done">Alle entfernen</button>' : ''}</div>
      ${showDone ? `<div class="card">${done.map(taskRow).join('')}</div>` : ''}` : ''}`;
}

// ---------- Training ----------
function lastFor(name) {
  for (let i = state.log.length - 1; i >= 0; i--) {
    const ex = state.log[i].exercises.find(e => e.name.toLowerCase() === name.toLowerCase());
    const sets = ex && ex.sets.filter(s => s.done);
    if (sets && sets.length) return sets;
  }
  return null;
}

function renderGym() {
  if (state.session) return renderSession();
  if (editPlan) return renderPlanEditor();

  const days = state.plan.map(d => `
    <div class="card">
      <div class="row"><h3 class="grow">${esc(d.name)}</h3><button class="btn" data-act="start" data-id="${d.id}">Starten</button></div>
      ${d.exercises.map(e => `<div class="muted">${esc(e.name)} – ${e.sets}×${esc(e.reps || '?')}${e.weight ? ` @ ${e.weight} kg` : ''}</div>`).join('') || '<div class="muted">Keine Übungen</div>'}
    </div>`).join('');

  const hist = state.log.slice(-10).reverse().map(l => {
    const sets = l.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
    return `<div class="task"><div class="text">${esc(l.dayName)}<div class="due">${fmtDate(l.start)} · ${fmtDur(l.end - l.start)} min · ${sets} Sätze</div></div>
      <button class="btn danger" data-act="del-log" data-id="${l.id}">Löschen</button></div>`;
  }).join('');

  return `
    ${days || '<div class="card empty">Noch kein Trainingsplan. Tippe auf „Plan bearbeiten“.</div>'}
    <button class="btn secondary full" data-act="edit-plan">Plan bearbeiten</button>
    ${hist ? `<h2>Verlauf</h2><div class="card">${hist}</div>` : ''}`;
}

function renderPlanEditor() {
  const days = state.plan.map(d => `
    <div class="card">
      <div class="row"><input class="grow" data-field="day-name" data-day="${d.id}" value="${esc(d.name)}" placeholder="Name des Tags">
        <button class="btn danger" data-act="del-day" data-day="${d.id}">Löschen</button></div>
      <div class="muted" style="margin:8px 0 2px">Übung · Sätze · Wdh. · kg</div>
      ${d.exercises.map(e => `
        <div class="row" style="margin-bottom:6px">
          <input class="grow" data-field="name" data-day="${d.id}" data-ex="${e.id}" value="${esc(e.name)}" placeholder="Übung">
          <input class="num" data-field="sets" data-day="${d.id}" data-ex="${e.id}" value="${e.sets}" inputmode="numeric">
          <input class="num" data-field="reps" data-day="${d.id}" data-ex="${e.id}" value="${esc(e.reps)}" placeholder="8-10">
          <input class="num" data-field="weight" data-day="${d.id}" data-ex="${e.id}" value="${e.weight ?? ''}" inputmode="decimal">
          <button class="btn danger" data-act="del-ex" data-day="${d.id}" data-ex="${e.id}">×</button>
        </div>`).join('')}
      <button class="link" data-act="add-ex" data-day="${d.id}">+ Übung</button>
    </div>`).join('');

  return `${days}
    <button class="btn secondary full" data-act="add-day">+ Trainingstag</button>
    <div style="height:10px"></div>
    <button class="btn full" data-act="edit-plan">Fertig</button>`;
}

function renderSession() {
  const s = state.session;
  const exs = s.exercises.map((e, ei) => {
    const last = lastFor(e.name);
    return `<div class="card">
      <h3>${esc(e.name)}</h3>
      <div class="muted">Ziel: ${e.target}${last ? ` · Letztes Mal: ${last.map(x => `${x.reps}×${x.weight}`).join(', ')}` : ''}</div>
      ${e.sets.map((st, si) => `
        <div class="set ${st.done ? 'done' : ''}">
          <span class="label">Satz ${si + 1}</span>
          <input class="num" data-field="s-reps" data-ei="${ei}" data-si="${si}" value="${st.reps}" placeholder="Wdh." inputmode="numeric">
          <span class="muted">×</span>
          <input class="num" data-field="s-weight" data-ei="${ei}" data-si="${si}" value="${st.weight}" placeholder="kg" inputmode="decimal">
          <span class="muted grow">kg</span>
          <input type="checkbox" data-act="set-done" data-ei="${ei}" data-si="${si}" ${st.done ? 'checked' : ''}>
        </div>`).join('')}
      <div class="row"><button class="link" data-act="add-set" data-ei="${ei}">+ Satz</button></div>
    </div>`;
  }).join('');

  return `
    <div class="card row">
      <div class="grow"><h3>${esc(s.dayName)}</h3><div class="muted">Dauer <span class="js-elapsed">${fmtDur(Date.now() - s.start)}</span></div></div>
      <div class="timer js-rest">${restEnd > Date.now() ? fmtDur(restEnd - Date.now()) : ''}</div>
    </div>
    ${exs}
    <button class="btn full" data-act="finish">Training beenden</button>
    <div style="height:10px"></div>
    <button class="btn secondary full" data-act="cancel">Abbrechen (nicht speichern)</button>`;
}

function startSession(dayId) {
  const d = state.plan.find(x => x.id === dayId);
  state.session = {
    id: uid(), dayName: d.name, start: Date.now(),
    exercises: d.exercises.map(e => {
      const last = lastFor(e.name);
      const w = last ? last[last.length - 1].weight : (e.weight ?? '');
      return { name: e.name, target: `${e.sets}×${e.reps || '?'}`, sets: Array.from({ length: Number(e.sets) || 1 }, () => ({ reps: '', weight: w, done: false })) };
    }),
  };
}

// ---------- Mehr ----------
function renderSettings() {
  return `
    <div class="card">
      <h3>Pausentimer</h3>
      <div class="row"><input class="num" data-field="rest" value="${state.settings.rest}" inputmode="numeric"><span class="muted">Sekunden nach jedem abgehakten Satz</span></div>
    </div>
    <div class="card">
      <h3>Backup</h3>
      <p class="muted">Daten liegen nur auf diesem Gerät (im Browser). Löscht du die Website-Daten in Safari, sind sie weg. Exportiere regelmäßig.</p>
      <button class="btn" data-act="export">Exportieren</button>
      <label class="btn secondary" style="display:inline-block">Importieren<input type="file" accept="application/json" id="import" hidden></label>
    </div>
    <div class="card">
      <h3>Installieren</h3>
      <p class="muted">Safari → Teilen → „Zum Home-Bildschirm“. Danach startet die App im Vollbild und funktioniert offline.</p>
    </div>`;
}

// ---------- Events ----------
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  tab = b.dataset.tab; render(); window.scrollTo(0, 0);
});

view.addEventListener('submit', e => {
  if (e.target.id !== 'task-form') return;
  e.preventDefault();
  const f = new FormData(e.target);
  const text = f.get('text').trim(); if (!text) return;
  const list = f.get('list').trim() || 'Allgemein';
  state.tasks.push({ id: uid(), text, list, due: f.get('due') || '', done: false, created: Date.now() });
  save(); render();
  view.querySelector('input[name=text]').focus();
});

view.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, id, day, ex } = el.dataset;
  const d = day && state.plan.find(x => x.id === day);
  switch (act) {
    case 'toggle': { const t = state.tasks.find(x => x.id === id); t.done = !t.done; break; }
    case 'del-task': state.tasks = state.tasks.filter(x => x.id !== id); break;
    case 'filter': listFilter = el.dataset.list; break;
    case 'show-done': showDone = !showDone; break;
    case 'clear-done':
      if (!confirm('Alle erledigten Aufgaben entfernen?')) return;
      state.tasks = state.tasks.filter(t => !(t.done && (listFilter === 'Alle' || t.list === listFilter))); break;
    case 'edit-plan': editPlan = !editPlan; break;
    case 'add-day': state.plan.push({ id: uid(), name: `Tag ${state.plan.length + 1}`, exercises: [] }); break;
    case 'del-day': if (!confirm(`„${d.name}“ löschen?`)) return; state.plan = state.plan.filter(x => x !== d); break;
    case 'add-ex': d.exercises.push({ id: uid(), name: '', sets: 3, reps: '10', weight: null }); break;
    case 'del-ex': d.exercises = d.exercises.filter(x => x.id !== ex); break;
    case 'start':
      if (!state.plan.find(x => x.id === id).exercises.length) { alert('Dieser Tag hat noch keine Übungen.'); return; }
      startSession(id); break;
    case 'set-done': {
      const st = state.session.exercises[el.dataset.ei].sets[el.dataset.si];
      st.done = el.checked;
      if (st.done && state.settings.rest > 0) restEnd = Date.now() + state.settings.rest * 1000;
      break;
    }
    case 'add-set': {
      const sets = state.session.exercises[el.dataset.ei].sets;
      const prev = sets[sets.length - 1];
      sets.push({ reps: '', weight: prev ? prev.weight : '', done: false }); break;
    }
    case 'finish': {
      const s = state.session;
      if (!s.exercises.some(x => x.sets.some(st => st.done)) && !confirm('Kein Satz abgehakt. Trotzdem speichern?')) return;
      s.end = Date.now(); state.log.push(s); state.session = null; restEnd = 0; break;
    }
    case 'cancel': if (!confirm('Training verwerfen?')) return; state.session = null; restEnd = 0; break;
    case 'del-log': if (!confirm('Eintrag löschen?')) return; state.log = state.log.filter(x => x.id !== id); break;
    case 'export': exportData(); return;
    default: return;
  }
  save(); render();
});

// Eingabefelder speichern ohne Neu-Rendern (Fokus bleibt erhalten).
view.addEventListener('input', e => {
  const el = e.target, f = el.dataset.field; if (!f) return;
  const v = el.value;
  if (f === 'rest') state.settings.rest = Math.max(0, parseInt(v) || 0);
  else if (f === 'day-name') state.plan.find(x => x.id === el.dataset.day).name = v;
  else if (f === 's-reps' || f === 's-weight') {
    const st = state.session.exercises[el.dataset.ei].sets[el.dataset.si];
    st[f === 's-reps' ? 'reps' : 'weight'] = v.replace(',', '.');
  } else {
    const e2 = state.plan.find(x => x.id === el.dataset.day).exercises.find(x => x.id === el.dataset.ex);
    if (f === 'sets') e2.sets = Math.max(1, parseInt(v) || 1);
    else if (f === 'weight') e2.weight = v === '' ? null : parseFloat(v.replace(',', '.'));
    else e2[f] = v;
  }
  save();
});

view.addEventListener('change', e => {
  if (e.target.id !== 'import') return;
  const file = e.target.files[0]; if (!file) return;
  file.text().then(txt => {
    const data = JSON.parse(txt);
    if (!Array.isArray(data.tasks) || !Array.isArray(data.plan)) throw new Error();
    if (!confirm('Aktuelle Daten durch das Backup ersetzen?')) return;
    state = Object.assign(defaults(), data); save(); render(); alert('Import fertig.');
  }).catch(() => alert('Datei ist kein gültiges Backup.'));
});

async function exportData() {
  const json = JSON.stringify(state, null, 2);
  const name = `organisation-backup-${today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Laufende Uhren im Training aktualisieren.
setInterval(() => {
  if (!state.session) return;
  const el = document.querySelector('.js-elapsed'); if (el) el.textContent = fmtDur(Date.now() - state.session.start);
  const r = document.querySelector('.js-rest');
  if (r) {
    const left = restEnd - Date.now();
    r.textContent = left > 0 ? fmtDur(left) : (restEnd ? 'Los!' : '');
    if (left <= 0 && restEnd && navigator.vibrate) { navigator.vibrate(300); restEnd = 0; }
  }
}, 500);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (state.session) tab = 'gym';
render();
