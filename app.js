'use strict';

// ---------- Speicher ----------
const KEY = 'organisation-v1';
const defaults = () => ({
  tasks: [],      // {id, text, list, due, done, created}
  plan: [],       // {id, name, exercises: [{id, name, sets, reps, weight, photo?}]}
  log: [],        // {id, dayName, start, end, exercises: [{exId, name, sets: [{reps, weight, done}]}]}
  session: null,  // laufendes Training, gleiche Form wie ein Log-Eintrag
  settings: { rest: 90 },
  food: { goals: { kcal: 2298, p: 160, c: 292, f: 48 }, entries: [] }, // entries: {id, date, name, kcal, p, c, f}
  chores: [],     // wiederkehrend: {id, name, every (Tage), last (YYYY-MM-DD|null), prev}
  habits: [],     // täglich: {id, name}
  habitLog: {},   // {YYYY-MM-DD: [habitId]}
  visits: [],     // manuell eingetragene Gym-Besuche (YYYY-MM-DD), zusätzlich zu den Trainings im Verlauf
});

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Startplan aus den Screenshots: alle Übungen 4 Sätze à 8-12 Wiederholungen, Gewicht offen.
const START_PLAN = [
  ['Push', ['Beinpresse', 'Wadenheben an der Beinpresse', 'Schrägbankdrücken an der Multipresse', 'Schulterpresse', 'Unterarmstütz']],
  ['Pull', ['Beinbeuger im Liegen', 'Low Row', 'Latzug', 'Butterfly Reverse', 'Seitstütz', 'Rückenstrecker Maschine']],
  ['Full Body', ['Hürdensitz', 'Fußkreisen', 'Handlauf', 'Beinpresse', 'Beinbeuger im Sitzen', 'Breites Latziehen im neutralen Griff', 'Kurzhantel-Schrägbankdrücken', 'Enger 90/90 Sitz mit Hüftextension', 'Schrauben Mobilisierung', 'Side Stretch']],
];

// Fotos aus der free-exercise-db (Public Domain), Name -> [Bild-ID, nur ähnliche Variante?].
const PHOTOS = {
  'beinpresse': ['Leg_Press'],
  'wadenheben an der beinpresse': ['Calf_Press_On_The_Leg_Press_Machine'],
  'schrägbankdrücken an der multipresse': ['Smith_Machine_Incline_Bench_Press'],
  'schulterpresse': ['Machine_Shoulder_Military_Press'],
  'unterarmstütz': ['Plank'],
  'beinbeuger im liegen': ['Lying_Leg_Curls'],
  'low row': ['Seated_Cable_Rows', true],
  'latzug': ['Wide-Grip_Lat_Pulldown'],
  'butterfly reverse': ['Reverse_Machine_Flyes'],
  'seitstütz': ['Side_Bridge'],
  'rückenstrecker maschine': ['Hyperextensions_Back_Extensions', true],
  'beinbeuger im sitzen': ['Seated_Leg_Curl'],
  'breites latziehen im neutralen griff': ['Wide-Grip_Lat_Pulldown', true],
  'kurzhantel-schrägbankdrücken': ['Incline_Dumbbell_Press'],
  'hürdensitz': ['Seated_Floor_Hamstring_Stretch', true],
  'fußkreisen': ['Ankle_Circles', true],
  'handlauf': ['Inchworm'],
};

// Startwerte für den Haushaltsplan, Intervalle in Tagen (änderbar unter „Bearbeiten“).
const START_CHORES = [['Wäsche machen', 7], ['Aufräumen', 3], ['Staubsaugen', 7], ['Wischen', 14], ['Bettzeug waschen', 14], ['Badezimmer putzen', 7]];
const START_HABITS = ['30 Minuten lesen', 'Lernen / Uni'];

let state = load();
if (!state.routinesSeeded) {
  if (!state.chores.length) state.chores = START_CHORES.map(([name, every]) => ({ id: uid(), name, every, last: null }));
  if (!state.habits.length) state.habits = START_HABITS.map(name => ({ id: uid(), name }));
  state.routinesSeeded = true;
}
if (!state.seeded && !state.plan.length) {
  state.plan = START_PLAN.map(([name, exs]) => ({
    id: uid(), name, exercises: exs.map(n => ({ id: uid(), name: n, sets: 4, reps: '8-12', weight: null })),
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
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { alert('Speicher voll. Entferne eigene Fotos oder exportiere und lösche alte Daten.'); }
}

// ---------- Helfer ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Lokales Datum als YYYY-MM-DD (toISOString wäre UTC und nach Mitternacht noch "gestern").
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const fmtDate = iso => new Date(typeof iso === 'string' && iso.length === 10 ? iso + 'T12:00' : iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const fmtDur = ms => { const s = Math.max(0, Math.floor(ms / 1000)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return ymd(d); };
const num = v => parseFloat(String(v).replace(',', '.')) || 0;
const fmtKg = w => (w === null || w === '' || w === undefined) ? '' : String(w).replace('.', ',');

const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};

// ---------- UI-Zustand (nicht gespeichert) ----------
let tab = 'tasks';
let listFilter = 'Alle';
let showDone = false;
let gymDay = null;
let editPlan = false;
let editRoutines = false;
let restEnd = 0;
let foodDate = today();
let sheet = null; // {day, ex} für die Detail-Ansicht einer Übung

const view = document.getElementById('view');
const titles = { tasks: 'Aufgaben', gym: 'Training', food: 'Ernährung', settings: 'Mehr' };

function render() {
  document.getElementById('title').textContent = tab === 'gym' && state.session ? state.session.dayName : titles[tab];
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const action = tab === 'tasks' ? `<button class="link" data-act="edit-routines">${editRoutines ? 'Fertig' : 'Bearbeiten'}</button>`
    : tab === 'gym' && !state.session ? `<button class="link" data-act="edit-plan">${editPlan ? 'Fertig' : 'Bearbeiten'}</button>`
    : tab === 'gym' && state.session ? '<button class="btn small" data-act="finish">Beenden</button>' : '';
  document.getElementById('top-action').innerHTML = action;
  view.innerHTML = tab === 'tasks' ? renderTasks() : tab === 'gym' ? renderGym() : tab === 'food' ? renderFood() : renderSettings();
  renderSheet();
  tick();
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
  const open = inList.filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.created - b.created);
  const done = inList.filter(t => t.done);

  const row = t => {
    const over = t.due && !t.done && t.due < today();
    const sub = [listFilter === 'Alle' ? esc(t.list) : '', t.due ? `<span class="${over ? 'over' : ''}">${fmtDate(t.due)}</span>` : ''].filter(Boolean).join(' · ');
    return `<div class="item ${t.done ? 'done' : ''}">
      <button class="check ${t.done ? 'on' : ''}" data-act="toggle" data-id="${t.id}">${t.done ? ICON.check : ''}</button>
      <div class="text"><span>${esc(t.text)}</span>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
      <button class="icon-btn" data-act="del-task" data-id="${t.id}" aria-label="Löschen">${ICON.trash}</button>
    </div>`;
  };

  return `${editRoutines ? renderRoutineEditor() : renderRoutines()}
    <div class="section"><h2>To-dos</h2></div>
    <form class="adder" id="task-form">
      <input name="text" placeholder="Neue Aufgabe …" autocomplete="off" required>
      <button class="btn">+</button>
    </form>
    <div class="adder-extra">
      <input form="task-form" name="list" list="lists" placeholder="Liste" value="${listFilter === 'Alle' ? '' : esc(listFilter)}">
      <input form="task-form" name="due" type="date">
    </div>
    <datalist id="lists">${all.map(l => `<option value="${esc(l)}">`).join('')}</datalist>
    <div class="chips">${['Alle', ...all].map(l => `<button class="chip ${l === listFilter ? 'active' : ''}" data-act="filter" data-list="${esc(l)}">${esc(l)}</button>`).join('')}</div>
    <div class="card">${open.length ? open.map(row).join('') : '<div class="empty">Alles erledigt.</div>'}</div>
    ${done.length ? `
      <div class="section"><h2>Erledigt · ${done.length}</h2>
        <div><button class="link" data-act="show-done">${showDone ? 'Ausblenden' : 'Anzeigen'}</button>
        ${showDone ? ' <button class="link" style="color:var(--danger)" data-act="clear-done">Leeren</button>' : ''}</div></div>
      ${showDone ? `<div class="card">${done.map(row).join('')}</div>` : ''}` : ''}`;
}

// ---------- Gewohnheiten & Haushalt ----------
const habitDone = (id, date) => (state.habitLog[date] || []).includes(id);
function habitStreak(id) {
  let n = 0, d = today();
  if (!habitDone(id, d)) d = addDays(d, -1); // heute noch offen bricht die Serie nicht
  while (habitDone(id, d)) { n++; d = addDays(d, -1); }
  return n;
}
function choreDue(c) { return c.last ? c.every - daysBetween(c.last, today()) : 0; }

function renderRoutines() {
  const t = today();
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const habits = state.habits.map(h => {
    const on = habitDone(h.id, t), streak = habitStreak(h.id);
    return `<div class="item">
      <button class="check ${on ? 'on' : ''}" data-act="habit" data-id="${h.id}" data-date="${t}">${on ? ICON.check : ''}</button>
      <div class="text"><span>${esc(h.name)}</span><div class="sub">${streak ? `Serie: ${streak} ${streak === 1 ? 'Tag' : 'Tage'}` : 'Heute noch offen'}</div></div>
      <div class="dots">${week.map(d => `<button class="dot ${habitDone(h.id, d) ? 'on' : ''} ${d === t ? 'today' : ''}" data-act="habit" data-id="${h.id}" data-date="${d}" aria-label="${fmtDate(d)}"></button>`).join('')}</div>
    </div>`;
  }).join('');

  const chores = [...state.chores].sort((a, b) => choreDue(a) - choreDue(b)).map(c => {
    const due = choreDue(c), doneToday = c.last === t;
    const when = doneToday ? `erledigt · wieder in ${c.every} ${c.every === 1 ? 'Tag' : 'Tagen'}`
      : !c.last ? 'noch nie erledigt'
      : due < 0 ? `<span class="over">${-due} ${due === -1 ? 'Tag' : 'Tage'} überfällig</span>`
      : due === 0 ? '<span class="over">heute fällig</span>' : due === 1 ? 'morgen fällig' : `in ${due} Tagen`;
    return `<div class="item ${doneToday ? 'done' : ''}">
      <button class="check ${doneToday ? 'on' : ''}" data-act="chore" data-id="${c.id}">${doneToday ? ICON.check : ''}</button>
      <div class="text"><span>${esc(c.name)}</span><div class="sub">${when}</div></div>
      <span class="muted">alle ${c.every} T.</span>
    </div>`;
  }).join('');

  return `
    ${habits ? `<div class="section"><h2>Täglich</h2><span class="muted">letzte 7 Tage</span></div><div class="card">${habits}</div>` : ''}
    ${chores ? `<div class="section"><h2>Haushalt</h2></div><div class="card">${chores}</div>` : ''}`;
}

function renderRoutineEditor() {
  return `
    <div class="section"><h2>Täglich</h2></div>
    <div class="card">${state.habits.map(h => `
      <div class="item"><input class="grow" data-field="habit-name" data-id="${h.id}" value="${esc(h.name)}" placeholder="Gewohnheit">
        <button class="icon-btn danger" data-act="del-habit" data-id="${h.id}" aria-label="Löschen">${ICON.trash}</button></div>`).join('')}
      <button class="link" data-act="add-habit">+ Gewohnheit</button></div>
    <div class="section"><h2>Haushalt</h2><span class="muted">Intervall in Tagen</span></div>
    <div class="card">${state.chores.map(c => `
      <div class="item"><input class="grow" data-field="chore-name" data-id="${c.id}" value="${esc(c.name)}" placeholder="Aufgabe">
        <input class="num" data-field="chore-every" data-id="${c.id}" value="${c.every}" inputmode="numeric">
        <button class="icon-btn danger" data-act="del-chore" data-id="${c.id}" aria-label="Löschen">${ICON.trash}</button></div>`).join('')}
      <button class="link" data-act="add-chore">+ Aufgabe</button></div>`;
}

// ---------- Gym-Besuche ----------
function visitDates() {
  return new Set([...state.log.map(l => ymd(new Date(l.start))), ...state.visits]);
}

function renderVisits() {
  const v = visitDates(), t = today();
  const monday = addDays(t, -((new Date(t + 'T12:00').getDay() + 6) % 7));
  const start = addDays(monday, -7 * 11); // 12 Wochen
  const days = Array.from({ length: 84 }, (_, i) => addDays(start, i));
  const inWeek = [...v].filter(d => d >= monday && d <= t).length;
  const inMonth = [...v].filter(d => d.slice(0, 7) === t.slice(0, 7)).length;
  const logged = new Set(state.log.map(l => ymd(new Date(l.start))));
  return `<div class="card pad">
    <div class="stats">
      <div><b>${inWeek}</b><span class="muted">diese Woche</span></div>
      <div><b>${inMonth}</b><span class="muted">diesen Monat</span></div>
      <div><b>${v.size}</b><span class="muted">gesamt</span></div>
    </div>
    <div class="cal">${['M', 'D', 'M', 'D', 'F', 'S', 'S'].map(x => `<span class="muted">${x}</span>`).join('')}
      ${days.map(d => `<button class="dot ${v.has(d) ? 'on' : ''} ${d === t ? 'today' : ''}" ${d > t || logged.has(d) ? 'disabled' : `data-act="visit" data-date="${d}"`} aria-label="${fmtDate(d)}"></button>`).join('')}</div>
    <div class="muted" style="margin-top:6px">Trainings zählen automatisch. Tippe auf einen Tag, um einen Besuch nachzutragen.</div>
  </div>`;
}

// ---------- Training ----------
const findEx = (dayId, exId) => state.plan.find(d => d.id === dayId)?.exercises.find(e => e.id === exId);

function photos(e) {
  if (!e) return null;
  if (e.photo) return { imgs: [e.photo], own: true };
  const p = PHOTOS[e.name.trim().toLowerCase()];
  return p ? { imgs: [`img/ex/${p[0]}-0.jpg`, `img/ex/${p[0]}-1.jpg`], similar: !!p[1] } : null;
}

function thumb(e, dayId) {
  const p = photos(e);
  const initials = esc((e.name.match(/\p{L}/gu) || ['?']).slice(0, 2).join('').toUpperCase());
  return `<button class="thumb" data-act="detail" data-day="${dayId}" data-ex="${e.id}">${p ? `<img src="${p.imgs[0]}" alt="" loading="lazy">` : initials}</button>`;
}

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
  if (!state.plan.find(d => d.id === gymDay)) gymDay = state.plan[0]?.id ?? null;
  const day = state.plan.find(d => d.id === gymDay);
  const chips = `<div class="chips">${state.plan.map(d => `<button class="chip ${d.id === gymDay ? 'active' : ''}" data-act="pick-day" data-day="${d.id}">${esc(d.name)}</button>`).join('')}
    ${editPlan ? '<button class="chip" data-act="add-day">+ Tag</button>' : ''}</div>`;

  if (!day) return `${chips}<div class="card empty">Noch kein Trainingstag. Tippe oben auf „Bearbeiten“.</div>`;
  if (editPlan) return chips + renderDayEditor(day);

  const rows = day.exercises.map(e => `
    <div class="item">
      ${thumb(e, day.id)}
      <div class="text"><span>${esc(e.name)}</span><div class="sub">${e.sets} × ${esc(e.reps || '?')}</div></div>
      <div class="stepper">
        <button data-act="w-" data-day="${day.id}" data-ex="${e.id}" aria-label="weniger">−</button>
        <input data-field="w" data-day="${day.id}" data-ex="${e.id}" value="${fmtKg(e.weight)}" placeholder="–" inputmode="decimal">
        <span>kg</span>
        <button data-act="w+" data-day="${day.id}" data-ex="${e.id}" aria-label="mehr">+</button>
      </div>
    </div>`).join('');

  const hist = state.log.slice(-8).reverse().map(l => {
    const sets = l.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
    return `<div class="item"><div class="text"><span>${esc(l.dayName)}</span><div class="sub">${fmtDate(l.start)} · ${fmtDur(l.end - l.start)} min · ${sets} Sätze</div></div>
      <button class="icon-btn" data-act="del-log" data-id="${l.id}" aria-label="Löschen">${ICON.trash}</button></div>`;
  }).join('');

  return `${renderVisits()}${chips}
    <div class="card">${rows || '<div class="empty">Keine Übungen. Tippe auf „Bearbeiten“.</div>'}</div>
    ${day.exercises.length ? `<button class="btn full" data-act="start" data-day="${day.id}">${esc(day.name)} starten</button>` : ''}
    ${hist ? `<div class="section"><h2>Verlauf</h2></div><div class="card">${hist}</div>` : ''}`;
}

function renderDayEditor(day) {
  return `
    <div class="card pad row">
      <input class="grow" data-field="day-name" data-day="${day.id}" value="${esc(day.name)}" placeholder="Name des Tags">
      <button class="icon-btn danger" data-act="del-day" data-day="${day.id}" aria-label="Tag löschen">${ICON.trash}</button>
    </div>
    <div class="card">
      <div class="edit-grid" style="padding-bottom:0"><span class="muted">Übung</span><span class="muted" style="text-align:center">Sätze</span><span class="muted" style="text-align:center">Wdh.</span><span></span></div>
      ${day.exercises.map(e => `
        <div class="edit-grid">
          <input data-field="name" data-day="${day.id}" data-ex="${e.id}" value="${esc(e.name)}" placeholder="Übung">
          <input class="c" data-field="sets" data-day="${day.id}" data-ex="${e.id}" value="${e.sets}" inputmode="numeric">
          <input class="c" data-field="reps" data-day="${day.id}" data-ex="${e.id}" value="${esc(e.reps)}" placeholder="8-12">
          <button class="icon-btn danger" data-act="del-ex" data-day="${day.id}" data-ex="${e.id}" aria-label="Übung löschen">${ICON.trash}</button>
        </div>`).join('')}
    </div>
    <button class="btn secondary full" data-act="add-ex" data-day="${day.id}">+ Übung</button>
    <p class="muted">Gewichte stellst du nach „Fertig“ direkt in der Übersicht ein. Tippe auf ein Bild für Details oder ein eigenes Foto.</p>`;
}

function renderSession() {
  const s = state.session;
  const exs = s.exercises.map((e, ei) => {
    const last = lastFor(e.name);
    const planEx = findEx(s.dayId, e.exId) || { id: '', name: e.name };
    return `<div class="card pad">
      <div class="row">
        ${thumb(planEx, s.dayId)}
        <div class="grow"><h3>${esc(e.name)}</h3>
          <div class="muted">Ziel ${esc(e.target)}${last ? ` · Zuletzt ${last.map(x => `${fmtKg(x.weight) || '–'}×${x.reps || '?'}`).join(' ')}` : ''}</div></div>
      </div>
      <div class="sets">
        <span class="h">#</span><span class="h">kg</span><span class="h">Wdh.</span><span></span>
        ${e.sets.map((st, si) => `
          <span class="n">${si + 1}</span>
          <input class="${st.done ? 'done' : ''}" data-field="s-weight" data-ei="${ei}" data-si="${si}" value="${fmtKg(st.weight)}" placeholder="–" inputmode="decimal">
          <input class="${st.done ? 'done' : ''}" data-field="s-reps" data-ei="${ei}" data-si="${si}" value="${st.reps}" placeholder="${esc(e.target.split('×')[1] || '')}" inputmode="numeric">
          <button class="check ${st.done ? 'on' : ''}" data-act="set-done" data-ei="${ei}" data-si="${si}">${st.done ? ICON.check : ''}</button>`).join('')}
      </div>
      <button class="link" style="padding:0 0 2px" data-act="add-set" data-ei="${ei}">+ Satz</button>
    </div>`;
  }).join('');

  return `
    <div class="card session-head">
      <div class="grow"><div class="muted">Dauer</div><div class="big js-elapsed">${fmtDur(Date.now() - s.start)}</div></div>
      <div class="muted" style="text-align:right">${s.exercises.reduce((n, e) => n + e.sets.filter(x => x.done).length, 0)} / ${s.exercises.reduce((n, e) => n + e.sets.length, 0)}<br>Sätze</div>
    </div>
    ${exs}
    <button class="btn full" data-act="finish">Training beenden</button>
    <div class="spacer"></div>
    <button class="btn secondary full" data-act="cancel">Verwerfen</button>`;
}

function startSession(dayId) {
  const d = state.plan.find(x => x.id === dayId);
  state.session = {
    id: uid(), dayId, dayName: d.name, start: Date.now(),
    exercises: d.exercises.map(e => {
      const last = lastFor(e.name);
      const w = e.weight ?? (last ? last[last.length - 1].weight : '');
      return { exId: e.id, name: e.name, target: `${e.sets}×${e.reps || '?'}`, sets: Array.from({ length: Number(e.sets) || 1 }, () => ({ reps: '', weight: w ?? '', done: false })) };
    }),
  };
}

function finishSession() {
  const s = state.session;
  s.end = Date.now();
  // Zuletzt benutztes Gewicht in den Plan übernehmen, damit es beim nächsten Mal vorbelegt ist.
  for (const e of s.exercises) {
    const done = e.sets.filter(x => x.done && x.weight !== '');
    const planEx = findEx(s.dayId, e.exId);
    if (planEx && done.length) planEx.weight = num(done[done.length - 1].weight);
  }
  state.log.push(s);
  state.session = null;
  restEnd = 0;
}

// Detail-Ansicht einer Übung mit großen Bildern und eigenem Foto.
function renderSheet() {
  const el = document.getElementById('sheet');
  const e = sheet && findEx(sheet.day, sheet.ex);
  if (!e) { el.hidden = true; el.innerHTML = ''; return; }
  const p = photos(e);
  el.hidden = false;
  el.innerHTML = `<div class="panel">
    <div class="row"><h3 class="grow">${esc(e.name)}</h3><button class="link" data-act="close-sheet">Schließen</button></div>
    <div class="muted">${e.sets} × ${esc(e.reps || '?')}${e.weight != null ? ` · ${fmtKg(e.weight)} kg` : ''}
      ${p?.similar ? ' <span class="badge">Bild zeigt ähnliche Variante</span>' : ''}${p?.own ? ' <span class="badge">Eigenes Foto</span>' : ''}</div>
    ${p ? `<div class="imgs">${p.imgs.map(src => `<img src="${src}" alt="">`).join('')}</div>` : '<div class="empty">Kein Bild vorhanden.</div>'}
    <div class="row">
      <label class="btn secondary grow" style="text-align:center">${e.photo ? 'Foto ersetzen' : 'Eigenes Foto'}<input type="file" accept="image/*" id="photo-input" hidden></label>
      ${e.photo ? '<button class="btn secondary" data-act="del-photo">Entfernen</button>' : ''}
    </div>
  </div>`;
}

function resizeImage(file, max = 480) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- Ernährung ----------
const MACROS = [['p', 'Protein'], ['c', 'Kohlenhydrate'], ['f', 'Fett']];

function renderFood() {
  const { goals, entries } = state.food;
  const day = entries.filter(x => x.date === foodDate);
  const sum = k => day.reduce((n, x) => n + x[k], 0);
  const shift = n => { const d = new Date(foodDate + 'T12:00'); d.setDate(d.getDate() + n); return ymd(d); };
  const kcal = Math.round(sum('kcal')), left = Math.round(goals.kcal - kcal);

  // Zuletzt gegessen: letzte Version je Name, für schnelles Hinzufügen.
  const recent = [];
  for (let i = entries.length - 1; i >= 0 && recent.length < 12; i--)
    if (!recent.some(r => r.name.toLowerCase() === entries[i].name.toLowerCase())) recent.push(entries[i]);

  const bar = (v, g, h = 5) => `<div class="bar" style="height:${h}px"><div style="width:${g ? Math.min(100, v / g * 100) : 0}%"></div></div>`;

  return `
    <div class="chips" style="justify-content:space-between;align-items:center">
      <button class="chip" data-act="food-day" data-date="${shift(-1)}">‹</button>
      <button class="chip active" data-act="food-day" data-date="${today()}">${foodDate === today() ? 'Heute' : fmtDate(foodDate)}</button>
      <button class="chip" data-act="food-day" data-date="${shift(1)}">›</button>
    </div>
    <div class="card pad macro">
      <div class="row"><div class="kcal grow"><b>${left}</b><span class="muted">kcal übrig</span></div><span class="muted">${kcal} / ${goals.kcal}</span></div>
      ${bar(kcal, goals.kcal, 7)}
      <div class="ring-row">${MACROS.map(([k, label]) => {
        const v = Math.round(sum(k)), g = goals[k] || 0;
        return `<div><div class="muted">${label}</div><div class="v ${g && v > g ? 'over' : ''}">${v} / ${g} g</div>${bar(v, g)}</div>`;
      }).join('')}</div>
    </div>
    <form class="card pad" id="food-form">
      <input name="name" placeholder="Mahlzeit" autocomplete="off" required>
      <div class="food-grid">
        <input name="kcal" placeholder="kcal" inputmode="decimal">
        <input name="p" placeholder="P (g)" inputmode="decimal">
        <input name="c" placeholder="KH (g)" inputmode="decimal">
        <input name="f" placeholder="F (g)" inputmode="decimal">
      </div>
      <div class="spacer"></div>
      <button class="btn full">Hinzufügen</button>
    </form>
    ${recent.length ? `<div class="chips">${recent.map(r => `<button class="chip" data-act="food-again" data-id="${r.id}">+ ${esc(r.name)}</button>`).join('')}</div>` : ''}
    <div class="card">${day.length ? day.map(x => `<div class="item"><div class="text"><span>${esc(x.name)}</span>
      <div class="sub">${Math.round(x.kcal)} kcal · P ${x.p} · KH ${x.c} · F ${x.f}</div></div>
      <button class="icon-btn" data-act="del-food" data-id="${x.id}" aria-label="Löschen">${ICON.trash}</button></div>`).join('') : '<div class="empty">Noch nichts eingetragen.</div>'}</div>`;
}

// ---------- Mehr ----------
function renderSettings() {
  const g = state.food.goals;
  return `
    <div class="section"><h2>Tagesziel Ernährung</h2></div>
    <div class="card pad food-grid" style="margin-top:0">
      ${[['kcal', 'kcal'], ['p', 'P (g)'], ['c', 'KH (g)'], ['f', 'F (g)']].map(([k, l]) => `<label class="muted">${l}<input data-field="goal-${k}" value="${g[k]}" inputmode="decimal" style="margin-top:4px;text-align:center"></label>`).join('')}
    </div>
    <div class="section"><h2>Training</h2></div>
    <div class="card pad row">
      <span class="grow">Pausentimer (Sekunden)</span>
      <input class="num" data-field="rest" value="${state.settings.rest}" inputmode="numeric">
    </div>
    <div class="section"><h2>Backup</h2></div>
    <div class="card pad">
      <p class="muted" style="margin-top:0">Daten liegen nur auf diesem Gerät. Löschst du die Website-Daten in Safari, sind sie weg. Exportiere regelmäßig.</p>
      <div class="row">
        <button class="btn grow" data-act="export">Exportieren</button>
        <label class="btn secondary grow" style="text-align:center">Importieren<input type="file" accept="application/json" id="import" hidden></label>
      </div>
    </div>
    <div class="section"><h2>Installieren</h2></div>
    <div class="card pad muted">Safari → Teilen → „Zum Home-Bildschirm“. Danach startet die App im Vollbild und funktioniert offline.</div>
    <p class="muted">Übungsbilder: free-exercise-db (Public Domain).</p>`;
}

// ---------- Events ----------
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  tab = b.dataset.tab; sheet = null; render(); window.scrollTo(0, 0);
});

view.addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (e.target.id === 'food-form') {
    state.food.entries.push({ id: uid(), date: foodDate, name: f.get('name').trim(), kcal: num(f.get('kcal')), p: num(f.get('p')), c: num(f.get('c')), f: num(f.get('f')) });
  } else if (e.target.id === 'task-form') {
    const text = f.get('text').trim(); if (!text) return;
    state.tasks.push({ id: uid(), text, list: f.get('list').trim() || 'Allgemein', due: f.get('due') || '', done: false, created: Date.now() });
  } else return;
  save(); render();
  view.querySelector('input[name=text], input[name=name]')?.focus();
});

document.addEventListener('click', e => {
  if (e.target.id === 'sheet') { sheet = null; renderSheet(); return; } // Tipp auf den Hintergrund schließt
  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, id, day, ex } = el.dataset;
  const d = day && state.plan.find(x => x.id === day);
  switch (act) {
    case 'toggle': { const t = state.tasks.find(x => x.id === id); t.done = !t.done; break; }
    case 'del-task': state.tasks = state.tasks.filter(x => x.id !== id); break;
    case 'filter': listFilter = el.dataset.list; break;
    case 'show-done': showDone = !showDone; break;
    case 'clear-done':
      if (!confirm('Erledigte Aufgaben entfernen?')) return;
      state.tasks = state.tasks.filter(t => !(t.done && (listFilter === 'Alle' || t.list === listFilter))); break;

    case 'edit-routines': editRoutines = !editRoutines; break;
    case 'habit': {
      const list = state.habitLog[el.dataset.date] || [];
      state.habitLog[el.dataset.date] = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
      if (!state.habitLog[el.dataset.date].length) delete state.habitLog[el.dataset.date];
      break;
    }
    case 'chore': {
      const c = state.chores.find(x => x.id === id);
      if (c.last === today()) { c.last = c.prev ?? null; delete c.prev; } // nochmal tippen = rückgängig
      else { c.prev = c.last; c.last = today(); }
      break;
    }
    case 'add-habit': state.habits.push({ id: uid(), name: '' }); break;
    case 'del-habit': state.habits = state.habits.filter(x => x.id !== id); break;
    case 'add-chore': state.chores.push({ id: uid(), name: '', every: 7, last: null }); break;
    case 'del-chore': state.chores = state.chores.filter(x => x.id !== id); break;
    case 'visit': {
      const dt = el.dataset.date;
      state.visits = state.visits.includes(dt) ? state.visits.filter(x => x !== dt) : [...state.visits, dt]; break;
    }

    case 'pick-day': gymDay = day; break;
    case 'edit-plan': editPlan = !editPlan; break;
    case 'add-day': { const nd = { id: uid(), name: `Tag ${state.plan.length + 1}`, exercises: [] }; state.plan.push(nd); gymDay = nd.id; break; }
    case 'del-day': if (!confirm(`„${d.name}“ löschen?`)) return; state.plan = state.plan.filter(x => x !== d); break;
    case 'add-ex': d.exercises.push({ id: uid(), name: '', sets: 4, reps: '8-12', weight: null }); break;
    case 'del-ex': d.exercises = d.exercises.filter(x => x.id !== ex); break;
    case 'w-': case 'w+': {
      const e2 = findEx(day, ex);
      e2.weight = Math.max(0, Math.round(((e2.weight || 0) + (act === 'w+' ? 2.5 : -2.5)) * 10) / 10); break;
    }
    case 'detail': if (!findEx(day, ex)) return; sheet = { day, ex }; renderSheet(); return;
    case 'close-sheet': sheet = null; renderSheet(); return;
    case 'del-photo': delete findEx(sheet.day, sheet.ex).photo; break;

    case 'start': startSession(day); window.scrollTo(0, 0); break;
    case 'set-done': {
      const st = state.session.exercises[el.dataset.ei].sets[el.dataset.si];
      st.done = !st.done;
      restEnd = st.done && state.settings.rest > 0 ? Date.now() + state.settings.rest * 1000 : restEnd;
      break;
    }
    case 'add-set': {
      const sets = state.session.exercises[el.dataset.ei].sets;
      sets.push({ reps: '', weight: sets.length ? sets[sets.length - 1].weight : '', done: false }); break;
    }
    case 'skip-rest': restEnd = 0; tick(); return;
    case 'finish':
      if (!state.session.exercises.some(x => x.sets.some(st => st.done)) && !confirm('Kein Satz abgehakt. Trotzdem speichern?')) return;
      finishSession(); break;
    case 'cancel': if (!confirm('Training verwerfen?')) return; state.session = null; restEnd = 0; break;
    case 'del-log': if (!confirm('Eintrag löschen?')) return; state.log = state.log.filter(x => x.id !== id); break;

    case 'food-day': foodDate = el.dataset.date; break;
    case 'food-again': {
      const src = state.food.entries.find(x => x.id === id);
      state.food.entries.push({ ...src, id: uid(), date: foodDate }); break;
    }
    case 'del-food': state.food.entries = state.food.entries.filter(x => x.id !== id); break;
    case 'export': exportData(); return;
    default: return;
  }
  save(); render();
});

// Eingabefelder speichern ohne Neu-Rendern (Fokus bleibt erhalten).
document.addEventListener('input', e => {
  const el = e.target, f = el.dataset.field; if (!f) return;
  const v = el.value;
  if (f === 'habit-name') state.habits.find(x => x.id === el.dataset.id).name = v;
  else if (f === 'chore-name') state.chores.find(x => x.id === el.dataset.id).name = v;
  else if (f === 'chore-every') state.chores.find(x => x.id === el.dataset.id).every = Math.max(1, parseInt(v) || 1);
  else if (f.startsWith('goal-')) state.food.goals[f.slice(5)] = num(v);
  else if (f === 'rest') state.settings.rest = Math.max(0, parseInt(v) || 0);
  else if (f === 'day-name') state.plan.find(x => x.id === el.dataset.day).name = v;
  else if (f === 's-reps' || f === 's-weight') {
    const st = state.session.exercises[el.dataset.ei].sets[el.dataset.si];
    st[f === 's-reps' ? 'reps' : 'weight'] = v.replace(',', '.');
  } else {
    const e2 = findEx(el.dataset.day, el.dataset.ex);
    if (f === 'w') e2.weight = v.trim() === '' ? null : num(v);
    else if (f === 'sets') e2.sets = Math.max(1, parseInt(v) || 1);
    else e2[f] = v;
  }
  save();
});

document.addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  if (e.target.id === 'photo-input' && sheet) {
    try { findEx(sheet.day, sheet.ex).photo = await resizeImage(file); save(); render(); }
    catch { alert('Foto konnte nicht geladen werden.'); }
  } else if (e.target.id === 'import') {
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.tasks) || !Array.isArray(data.plan)) throw new Error();
      if (!confirm('Aktuelle Daten durch das Backup ersetzen?')) return;
      state = Object.assign(defaults(), data); save(); render(); alert('Import fertig.');
    } catch { alert('Datei ist kein gültiges Backup.'); }
  }
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

// Laufende Uhren: Trainingsdauer und Pausentimer.
function tick() {
  const restEl = document.getElementById('rest');
  if (!state.session) { restEl.hidden = true; return; }
  const el = document.querySelector('.js-elapsed'); if (el) el.textContent = fmtDur(Date.now() - state.session.start);
  const left = restEnd - Date.now();
  if (left > 0) {
    restEl.hidden = false;
    restEl.innerHTML = `Pause ${fmtDur(left)} <button data-act="skip-rest">Überspringen</button>`;
  } else {
    if (restEnd && navigator.vibrate) navigator.vibrate(300);
    restEnd = 0; restEl.hidden = true;
  }
}
setInterval(tick, 500);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (state.session) tab = 'gym';
render();
