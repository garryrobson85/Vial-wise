const KEY = 'vialwise_v6';
const OLD_KEY = 'vialwise_v5';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const glp1Options = {
  semaglutide: { name: 'Semaglutide', doses: [0.25, 0.5, 1, 1.7, 2, 2.4] },
  tirzepatide: { name: 'Tirzepatide', doses: [2.5, 5, 7.5, 10, 12.5, 15] },
  retatrutide: { name: 'Retatrutide', doses: [1, 2, 4, 6, 8, 12] }
};

const defaults = {
  settings: {
    journey: 'GLP-1 weight journey',
    delivery: 'Reconstituted vial',
    units: 'kg',
    glp1: 'semaglutide',
    currentDose: '0.25',
    customDose: '',
    doseUnit: 'mg'
  },
  vials: [],
  schedule: [],
  weights: [],
  foods: [],
  symptoms: [],
  logs: [],
  compounds: []
};

let db = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || 'null') || structuredClone(defaults);
db = { ...structuredClone(defaults), ...db, settings: { ...defaults.settings, ...(db.settings || {}) } };
db.symptoms ||= [];

const save = () => {
  localStorage.setItem(KEY, JSON.stringify(db));
  render();
};
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => Number(v) || 0;
const money = n => 'GBP ' + (Number(n) || 0).toFixed(2);
const esc = s => String(s || '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const formObj = form => Object.fromEntries(new FormData(form).entries());
const today = () => new Date().toISOString().slice(0, 10);

function mcg(amount, unit) {
  return num(amount) * (unit === 'mg' ? 1000 : 1);
}

function ml(amount, unit) {
  return num(amount) / (unit === 'units' ? 100 : 1);
}

function glpName(key = db.settings.glp1) {
  return glp1Options[key]?.name || 'Custom GLP-1';
}

function currentDose() {
  const amount = db.settings.customDose || db.settings.currentDose || '';
  return { amount, unit: db.settings.doseUnit || 'mg' };
}

function populateDoseSelect(glpKey, selected) {
  const select = $('#settingsDose');
  select.innerHTML = (glp1Options[glpKey]?.doses || [])
    .map(d => `<option value="${d}">${d} mg</option>`)
    .join('');
  if (selected && [...select.options].some(o => o.value === String(selected))) select.value = String(selected);
}

function hydrateSettings() {
  $('#settingsGlp1').innerHTML = Object.entries(glp1Options)
    .map(([key, item]) => `<option value="${key}">${item.name}</option>`)
    .join('');

  const form = $('#settingsForm');
  Object.entries(db.settings).forEach(([key, value]) => {
    const field = form.elements[key];
    if (field) field.value = value;
  });
  populateDoseSelect(db.settings.glp1, db.settings.currentDose);
  $('#settingsGlp1').value = db.settings.glp1;
  $('#settingsDoseUnit').value = db.settings.doseUnit || 'mg';
}

function setTodayDefaults() {
  ['scheduleForm', 'weightForm', 'foodForm', 'symptomForm', 'logForm'].forEach(formId => {
    const input = $(`#${formId} input[name="date"]`);
    if (input && !input.value) input.value = today();
  });
}

function pageTitle() {
  $('#pageTitle').textContent = $('.tab.active')?.textContent || 'Today';
}

$('#tabs').addEventListener('click', e => {
  if (!e.target.matches('.tab')) return;
  $$('.tab').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#' + e.target.dataset.view).classList.add('active');
  pageTitle();
  if (e.target.dataset.view === 'vials') prefillVial();
  if (e.target.dataset.view === 'schedule') prefillSchedule();
});

function costPerDose(v) {
  const totalMcg = mcg(v.amount ?? v.amountMg, v.amountUnit || 'mg');
  const cost = num(v.cost);
  const doseMcg = mcg(v.dose ?? v.doseMcg, v.doseUnit || (v.doseMcg ? 'mcg' : 'mg'));
  return totalMcg && cost && doseMcg ? (cost / totalMcg) * doseMcg : 0;
}

function remainingValue(v) {
  const totalMcg = mcg(v.amount ?? v.amountMg, v.amountUnit || 'mg');
  const remMcg = mcg(v.remaining ?? v.remainingMg, v.remainingUnit || 'mg');
  return totalMcg && num(v.cost) ? num(v.cost) * (remMcg / totalMcg) : 0;
}

function dosesLeft(v) {
  const remMcg = mcg(v.remaining ?? v.remainingMg, v.remainingUnit || 'mg');
  const doseMcg = mcg(v.dose ?? v.doseMcg, v.doseUnit || (v.doseMcg ? 'mcg' : 'mg'));
  return remMcg && doseMcg ? Math.floor(remMcg / doseMcg) : 0;
}

function vialName(i) {
  return db.vials.find(v => v.id === i)?.name || 'Unassigned';
}

function autoCost(s) {
  const v = db.vials.find(item => item.id === s.vialId);
  if (!v) return 0;
  const totalMcg = mcg(v.amount ?? v.amountMg, v.amountUnit || 'mg');
  const doseMcg = mcg(s.amount ?? s.amountMcg ?? v.dose ?? v.doseMcg, s.amountUnit || v.doseUnit || 'mg');
  return totalMcg && num(v.cost) && doseMcg ? (num(v.cost) / totalMcg) * doseMcg : 0;
}

function prefillVial() {
  const dose = currentDose();
  if (!$('#vialNameInput').value) $('#vialNameInput').value = `${glpName()} vial`;
  if (!$('#vialDoseInput').value) $('#vialDoseInput').value = dose.amount;
  $('#vialDoseUnit').value = dose.unit;
}

function prefillSchedule() {
  const dose = currentDose();
  if (!$('#scheduleAmount').value) $('#scheduleAmount').value = dose.amount;
  $('#scheduleAmountUnit').value = dose.unit;
}

function render() {
  const spend = db.vials.reduce((a, v) => a + num(v.cost), 0);
  const value = db.vials.reduce((a, v) => a + remainingValue(v), 0);
  const doses = db.vials.reduce((a, v) => a + dosesLeft(v), 0);
  $('#statMode').textContent = glpName();
  $('#statVials').textContent = db.vials.length;
  $('#statSpend').textContent = money(spend);
  $('#statValue').textContent = money(value);
  $('#statDoses').textContent = doses;
  $('#statFood').textContent = db.foods.length;

  const due = db.schedule.filter(s => s.date === today());
  $('#todayBox').innerHTML = due.length ? due.map(s => `<div class="item"><b>${esc(vialName(s.vialId))}</b><span>${esc(s.time || '')} | ${esc(s.amount || s.amountMcg || '-')} ${esc(s.amountUnit || (s.amountMcg ? 'mcg' : 'mg'))} | ${esc(s.site || 'site not set')} | ${esc(s.status)}</span></div>`).join('') : 'No schedule entries due today.';

  $('#scheduleVial').innerHTML = '<option value="">Choose item</option>' + db.vials.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('');
  $('#vialList').innerHTML = db.vials.map(v => `<article class="item"><div class="item-head"><b>${esc(v.name)}</b><button onclick="del('vials','${v.id}')">Delete</button></div><div><span class="pill">${esc(v.type || 'Item')}</span><span class="pill">${money(v.cost)}</span><span class="pill">${dosesLeft(v)} doses left</span><span class="pill">${money(costPerDose(v))}/injection</span></div><small>${esc(v.remaining ?? v.remainingMg ?? 0)} ${esc(v.remainingUnit || 'mg')} remaining | value ${money(remainingValue(v))} | batch ${esc(v.batch || '-')} | expiry ${esc(v.expiry || '-')}</small><p>${esc(v.notes || '')}</p></article>`).join('') || '<div class="empty">No vials/items yet.</div>';

  $('#scheduleList').innerHTML = [...db.schedule].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(s => `<article class="item"><div class="item-head"><b>${esc(vialName(s.vialId))}</b><button onclick="del('schedule','${s.id}')">Delete</button></div><span>${esc(s.date)} ${esc(s.time)} | ${esc(s.amount || s.amountMcg || '-')} ${esc(s.amountUnit || (s.amountMcg ? 'mcg' : 'mg'))} | ${esc(s.site || '-')} | ${esc(s.status)}</span><small>Cost: ${money(s.actualCost || autoCost(s))}</small><p>${esc(s.notes || '')}</p></article>`).join('') || '<div class="empty">No schedule entries.</div>';

  $('#weightList').innerHTML = [...db.weights].sort((a, b) => b.date.localeCompare(a.date)).map(w => `<article class="item"><b>${esc(w.date)}: ${esc(w.weight)}${esc(w.unit)}</b><span>Appetite: ${esc(w.appetite || '-')} | Waist: ${esc(w.waist || '-')}</span><p>${esc(w.notes || '')}</p></article>`).join('') || '<div class="empty">No weight entries.</div>';
  $('#foodList').innerHTML = [...db.foods].sort((a, b) => b.date.localeCompare(a.date)).map(f => `<article class="item"><b>${esc(f.date)}: ${esc(f.meal)}</b><small>${esc(f.portion)} portion | fatty ${esc(f.fatty)} | spicy ${esc(f.spicy)} | caffeine ${esc(f.caffeine)}</small><p>${esc(f.notes || '')}</p></article>`).join('') || '<div class="empty">No food entries.</div>';
  $('#symptomList').innerHTML = [...db.symptoms].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).map(s => `<article class="item"><b>${esc(s.date)} ${esc(s.time || '')}: ${esc(s.symptom)}</b><span>Severity ${esc(s.severity || 0)}/10 | possible trigger: ${esc(s.trigger || '-')}</span><p>${esc(s.notes || '')}</p></article>`).join('') || '<div class="empty">No symptom entries.</div>';
  $('#logList').innerHTML = [...db.logs].sort((a, b) => b.date.localeCompare(a.date)).map(l => `<article class="item"><b>${esc(l.date)}</b><span>Appetite ${esc(l.appetite || '-')} | nausea ${esc(l.nausea || '-')} | energy ${esc(l.energy || '-')} | mood ${esc(l.mood || '-')} | ${esc(l.digestion || '-')}</span><p>${esc(l.notes || '')}</p></article>`).join('') || '<div class="empty">No daily logs.</div>';
  $('#compoundList').innerHTML = db.compounds.map(c => `<article class="item"><div class="item-head"><b>${esc(c.name)}</b><button onclick="del('compounds','${c.id}')">Delete</button></div><span>${esc(c.purpose || 'Additional tracking')}</span><p>${esc(c.notes || '')}</p></article>`).join('') || '<div class="empty">No additional compounds tracked.</div>';
  $('#foodInsights').innerHTML = insights();
}

function insights() {
  if (!db.foods.length || !db.symptoms.length) return 'Add food and symptom entries to see simple correlation hints.';
  const highSymptoms = db.symptoms.filter(s => num(s.severity) >= 5);
  if (!highSymptoms.length) return 'No higher-severity symptom entries yet.';

  const flags = { fatty: 0, spicy: 0, caffeine: 0 };
  highSymptoms.forEach(sym => {
    const sameDayFoods = db.foods.filter(food => food.date === sym.date);
    sameDayFoods.forEach(food => {
      if (food.fatty === 'Yes') flags.fatty++;
      if (food.spicy === 'Yes') flags.spicy++;
      if (food.caffeine === 'Yes') flags.caffeine++;
    });
  });

  const out = Object.entries(flags)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `<div class="item"><b>Possible ${key} link</b><span>${value} same-day higher-severity symptom match${value === 1 ? '' : 'es'} included ${key} intake.</span></div>`);
  return out.join('') || 'No same-day food markers are repeating with higher-severity symptoms yet.';
}

window.del = (key, itemId) => {
  db[key] = db[key].filter(x => x.id !== itemId);
  save();
};

$('#settingsGlp1').addEventListener('change', e => {
  populateDoseSelect(e.target.value);
  $('#settingsCustomDose').value = '';
});

$('#settingsForm').addEventListener('submit', e => {
  e.preventDefault();
  db.settings = { ...db.settings, ...formObj(e.target) };
  localStorage.setItem(KEY, JSON.stringify(db));
  $('#settingsSaved').textContent = 'Saved';
  setTimeout(() => $('#settingsSaved').textContent = '', 1800);
  render();
});

$('#vialForm').addEventListener('submit', e => {
  e.preventDefault();
  db.vials.push({ ...formObj(e.target), id: id() });
  e.target.reset();
  save();
});
$('#scheduleForm').addEventListener('submit', e => {
  e.preventDefault();
  db.schedule.push({ ...formObj(e.target), id: id() });
  e.target.reset();
  setTodayDefaults();
  save();
});
$('#weightForm').addEventListener('submit', e => {
  e.preventDefault();
  db.weights.push({ ...formObj(e.target), id: id() });
  e.target.reset();
  setTodayDefaults();
  save();
});
$('#foodForm').addEventListener('submit', e => {
  e.preventDefault();
  db.foods.push({ ...formObj(e.target), id: id() });
  e.target.reset();
  setTodayDefaults();
  save();
});
$('#symptomForm').addEventListener('submit', e => {
  e.preventDefault();
  db.symptoms.push({ ...formObj(e.target), id: id() });
  e.target.reset();
  setTodayDefaults();
  save();
});
$('#logForm').addEventListener('submit', e => {
  e.preventDefault();
  db.logs.push({ ...formObj(e.target), id: id() });
  e.target.reset();
  setTodayDefaults();
  save();
});
$('#compoundForm').addEventListener('submit', e => {
  e.preventDefault();
  db.compounds.push({ ...formObj(e.target), id: id() });
  e.target.reset();
  save();
});

$('#calcBtn').addEventListener('click', () => {
  const totalMcg = mcg($('#calcAmount').value, $('#calcAmountUnit').value);
  const waterMl = ml($('#calcWater').value, $('#calcWaterUnit').value);
  const doseMcg = mcg($('#calcDose').value, $('#calcDoseUnit').value);
  if (!totalMcg || !waterMl || !doseMcg) {
    $('#calcResult').textContent = 'Enter all three values.';
    return;
  }
  const concMcgMl = totalMcg / waterMl;
  const doseMl = doseMcg / concMcgMl;
  const units = doseMl * 100;
  $('#calcResult').innerHTML = `<b>Concentration:</b> ${concMcgMl.toFixed(2)} mcg/ml<br><b>Volume to measure:</b> ${doseMl.toFixed(4)} ml<br><b>U-100 syringe:</b> ${units.toFixed(1)} units`;
});

$$('.body-map button').forEach(b => b.addEventListener('click', () => {
  $('#selectedSite').textContent = b.dataset.site + ' copied to schedule.';
  $('#siteInput').value = b.dataset.site;
}));

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

$('#exportJson').addEventListener('click', () => download('vialwise-backup.json', JSON.stringify(db, null, 2)));
$('#exportCsv').addEventListener('click', () => {
  const rows = ['section,date,name,amount,cost,notes'];
  db.vials.forEach(v => rows.push(['vial', '', v.name, `${v.amount || v.amountMg || ''}${v.amountUnit || 'mg'}`, v.cost || 0, v.notes || ''].map(csvCell).join(',')));
  db.schedule.forEach(s => rows.push(['schedule', s.date, vialName(s.vialId), `${s.amount || s.amountMcg || ''}${s.amountUnit || 'mg'}`, s.actualCost || autoCost(s), s.notes || ''].map(csvCell).join(',')));
  db.foods.forEach(f => rows.push(['food', f.date, f.meal, f.portion, '', f.notes || ''].map(csvCell).join(',')));
  db.symptoms.forEach(s => rows.push(['symptom', s.date, s.symptom, `severity ${s.severity || 0}`, '', s.notes || ''].map(csvCell).join(',')));
  db.weights.forEach(w => rows.push(['weight', w.date, 'weight', `${w.weight}${w.unit}`, '', w.notes || ''].map(csvCell).join(',')));
  download('vialwise-summary.csv', rows.join('\n'), 'text/csv');
});

$('#sampleBtn').addEventListener('click', () => {
  db.settings = { ...db.settings, glp1: 'semaglutide', currentDose: '0.25', customDose: '', doseUnit: 'mg' };
  db.vials = [{ id: 'v1', name: 'Semaglutide vial', type: 'GLP-1', amount: '10', amountUnit: 'mg', water: '2', waterUnit: 'ml', remaining: '8.5', remainingUnit: 'mg', dose: '0.25', doseUnit: 'mg', cost: '85', batch: 'Demo', expiry: '2026-12-01', notes: 'Demo only' }];
  db.schedule = [{ id: 's1', vialId: 'v1', date: today(), time: '09:00', amount: '0.25', amountUnit: 'mg', site: 'Left abdomen', status: 'Planned', notes: 'Demo entry' }];
  db.foods = [{ id: 'f1', date: today(), meal: 'Coffee and toast', portion: 'Small', fatty: 'No', spicy: 'No', caffeine: 'Yes', notes: 'Demo food entry' }];
  db.symptoms = [{ id: 'y1', date: today(), time: '11:00', symptom: 'Mild nausea', severity: '3', trigger: 'Coffee', notes: 'Demo symptom entry' }];
  hydrateSettings();
  save();
});

$('#clearBtn').addEventListener('click', () => {
  if (confirm('Clear all local VialWise data?')) {
    localStorage.removeItem(KEY);
    localStorage.removeItem(OLD_KEY);
    location.reload();
  }
});

hydrateSettings();
setTodayDefaults();
render();
