const KEY = 'vialwise_v7';
const OLD_KEYS = ['vialwise_v6', 'vialwise_v5'];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const glp1Options = {
  semaglutide: { name: 'Semaglutide', doses: [0.25, 0.5, 1, 1.7, 2, 2.4] },
  tirzepatide: { name: 'Tirzepatide', doses: [2.5, 5, 7.5, 10, 12.5, 15] },
  retatrutide: { name: 'Retatrutide', doses: [1, 2, 4, 6, 8, 12] }
};

const siteOrder = ['Left abdomen', 'Right abdomen', 'Left thigh', 'Right thigh', 'Left upper arm', 'Right upper arm'];

const defaults = {
  settings: {
    journey: 'GLP-1 weight journey',
    delivery: 'Reconstituted vial',
    mode: 'beginner',
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
  doseHistory: [],
  peptides: [],
  foodIdeas: [],
  compounds: []
};

function loadDb() {
  const raw = localStorage.getItem(KEY) || OLD_KEYS.map(k => localStorage.getItem(k)).find(Boolean);
  const loaded = raw ? JSON.parse(raw) : {};
  return {
    ...structuredClone(defaults),
    ...loaded,
    settings: { ...defaults.settings, ...(loaded.settings || {}) },
    symptoms: loaded.symptoms || [],
    doseHistory: loaded.doseHistory || [],
    peptides: loaded.peptides || loaded.compounds || [],
    foodIdeas: loaded.foodIdeas || []
  };
}

let db = loadDb();

const save = () => {
  localStorage.setItem(KEY, JSON.stringify(db));
  render();
};
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => Number(v) || 0;
const money = n => 'GBP ' + (Number(n) || 0).toFixed(2);
const cleanNumber = n => String(Number(n || 0).toFixed(3)).replace(/\.?0+$/, '');
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
  return { amount: db.settings.customDose || db.settings.currentDose || '', unit: db.settings.doseUnit || 'mg' };
}

function doseText(amount = currentDose().amount, unit = currentDose().unit) {
  return amount ? `${cleanNumber(amount)} ${unit}` : '-';
}

function populateGlpSelects() {
  const options = Object.entries(glp1Options).map(([key, item]) => `<option value="${key}">${item.name}</option>`).join('');
  $('#settingsGlp1').innerHTML = options;
  $('#doseHistoryGlp1').innerHTML = options;
}

function populateDoseSelect(glpKey, selected) {
  const select = $('#settingsDose');
  select.innerHTML = (glp1Options[glpKey]?.doses || []).map(d => `<option value="${d}">${d} mg</option>`).join('');
  if (selected && [...select.options].some(o => o.value === String(selected))) select.value = String(selected);
}

function hydrateSettings() {
  populateGlpSelects();
  const form = $('#settingsForm');
  Object.entries(db.settings).forEach(([key, value]) => {
    const field = form.elements[key];
    if (field) field.value = value;
  });
  populateDoseSelect(db.settings.glp1, db.settings.currentDose);
  $('#settingsGlp1').value = db.settings.glp1;
  $('#settingsDoseUnit').value = db.settings.doseUnit || 'mg';
  $('#doseHistoryGlp1').value = db.settings.glp1;
  applyMode();
}

function setTodayDefaults() {
  ['scheduleForm', 'weightForm', 'foodForm', 'symptomForm', 'logForm', 'doseHistoryForm'].forEach(formId => {
    const input = $(`#${formId} input[name="date"]`);
    if (input && !input.value) input.value = today();
  });
}

function pageTitle() {
  $('#pageTitle').textContent = $('.tab.active')?.textContent || 'Today';
}

function applyMode() {
  const mode = db.settings.mode || 'beginner';
  $('#beginnerMode').classList.toggle('active', mode === 'beginner');
  $('#advancedMode').classList.toggle('active', mode === 'advanced');
  $$('.advanced-tab').forEach(tab => tab.classList.toggle('hidden', mode !== 'advanced'));
  $$('.advanced-metric').forEach(item => item.classList.toggle('hidden', mode !== 'advanced'));
  const active = $('.tab.active');
  if (active?.classList.contains('hidden')) switchView('today');
}

function switchView(view) {
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === view));
  pageTitle();
  if (view === 'vials') prefillVial();
  if (view === 'schedule') prefillSchedule();
}

$('#tabs').addEventListener('click', e => {
  if (!e.target.matches('.tab') || e.target.classList.contains('hidden')) return;
  switchView(e.target.dataset.view);
});

$('#beginnerMode').addEventListener('click', () => {
  db.settings.mode = 'beginner';
  $('#settingsForm').elements.mode.value = 'beginner';
  save();
});

$('#advancedMode').addEventListener('click', () => {
  db.settings.mode = 'advanced';
  $('#settingsForm').elements.mode.value = 'advanced';
  save();
});

function costPerDose(v) {
  const totalMcg = totalInventoryMcg(v);
  const doseMcg = mcg(v.dose ?? v.doseMcg, v.doseUnit || (v.doseMcg ? 'mcg' : 'mg'));
  return totalMcg && num(v.cost) && doseMcg ? (num(v.cost) / totalMcg) * doseMcg : 0;
}

function itemQuantity(v) {
  return Math.max(1, Math.floor(num(v.quantity) || 1));
}

function totalInventoryMcg(v) {
  return mcg(v.amount ?? v.amountMg, v.amountUnit || 'mg') * itemQuantity(v);
}

function remainingValue(v) {
  const totalMcg = totalInventoryMcg(v);
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
  const totalMcg = totalInventoryMcg(v);
  const doseMcg = mcg(s.amount ?? s.amountMcg ?? v.dose ?? v.doseMcg, s.amountUnit || v.doseUnit || 'mg');
  return totalMcg && num(v.cost) && doseMcg ? (num(v.cost) / totalMcg) * doseMcg : 0;
}

function nextSchedule() {
  return [...db.schedule]
    .filter(s => s.status !== 'Taken' && s.status !== 'Skipped')
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))[0];
}

function latestTakenSite() {
  return [...db.schedule]
    .filter(s => s.site && s.status === 'Taken')
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))[0]?.site || '';
}

function nextSiteSuggestion() {
  const last = latestTakenSite();
  if (!last) return 'Start with a site and rotate from there.';
  const index = siteOrder.indexOf(last);
  return index >= 0 ? `Last used: ${last}. Consider ${siteOrder[(index + 1) % siteOrder.length]} next.` : `Last used: ${last}. Choose a different site next.`;
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

function renderToday(spend, value, doses) {
  const dose = currentDose();
  const due = db.schedule.filter(s => s.date === today());
  const next = nextSchedule();
  const cost = db.vials.map(costPerDose).find(Boolean) || 0;
  $('#todayPlan').textContent = `${glpName()} ${doseText(dose.amount, dose.unit)}`;
  $('#todaySub').textContent = due.length ? `${due.length} schedule entr${due.length === 1 ? 'y' : 'ies'} due today.` : 'No injection scheduled today.';
  $('#heroCost').textContent = `${money(cost)} / injection`;
  $('#heroNext').textContent = next ? `Next: ${next.date} ${next.time || ''}` : 'Next: not scheduled';
  $('#todayBox').innerHTML = due.length ? due.map(s => `<div class="item"><b>${esc(vialName(s.vialId))}</b><span>${esc(s.time || '')} | ${esc(s.amount || s.amountMcg || '-')} ${esc(s.amountUnit || (s.amountMcg ? 'mcg' : 'mg'))} | ${esc(s.site || 'site not set')} | ${esc(s.status)}</span></div>`).join('') : 'No schedule entries due today.';
  $('#promptBox').innerHTML = [
    `Dose: ${doseText(dose.amount, dose.unit)} ${glpName()}`,
    nextSiteSuggestion(),
    db.logs.some(l => l.date === today()) ? 'Daily check-in completed today.' : 'Add appetite, nausea, energy and mood today.',
    db.foods.some(f => f.date === today()) ? 'Food logged today.' : 'Log food if symptoms appear later.'
  ].map(item => `<div class="prompt"><b>+</b><span>${esc(item)}</span></div>`).join('');
  $('#costSnapshot').innerHTML = cost ? `<b>${money(cost)}</b> estimated per injection<br><b>${money(cost * 4.33)}</b> estimated monthly if weekly<br><b>${doses}</b> total estimated doses left<br><b>${money(value)}</b> remaining value from ${money(spend)} spend` : 'Add a vial or pen to calculate cost per injection.';
  $('#todayInsights').innerHTML = insights();
}

function render() {
  applyMode();
  const spend = db.vials.reduce((a, v) => a + num(v.cost), 0);
  const value = db.vials.reduce((a, v) => a + remainingValue(v), 0);
  const doses = db.vials.reduce((a, v) => a + dosesLeft(v), 0);
  const dose = currentDose();
  $('#statMode').textContent = glpName();
  $('#statDose').textContent = doseText(dose.amount, dose.unit);
  $('#statSpend').textContent = money(spend);
  $('#statValue').textContent = money(value);
  $('#statDoses').textContent = doses;
  $('#statFood').textContent = db.foods.length;
  renderToday(spend, value, doses);

  $('#scheduleVial').innerHTML = '<option value="">Choose item</option>' + db.vials.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('');
  $('#vialList').innerHTML = db.vials.map(v => `<article class="item"><div class="item-head"><b>${esc(v.name)}</b><button onclick="del('vials','${v.id}')">Delete</button></div><div><span class="pill">${itemQuantity(v)} item${itemQuantity(v) === 1 ? '' : 's'}</span><span class="pill">${esc(v.type || 'Item')}</span><span class="pill">${money(v.cost)} total</span><span class="pill">${dosesLeft(v)} doses left</span><span class="pill">${money(costPerDose(v))}/injection</span></div><small>${esc(v.amount ?? v.amountMg ?? 0)} ${esc(v.amountUnit || 'mg')} each | total ${cleanNumber(totalInventoryMcg(v) / 1000)} mg | remaining ${esc(v.remaining ?? v.remainingMg ?? 0)} ${esc(v.remainingUnit || 'mg')} | value ${money(remainingValue(v))} | batch ${esc(v.batch || '-')} | expiry ${esc(v.expiry || '-')}</small><p>${esc(v.notes || '')}</p></article>`).join('') || '<div class="empty">No vials/items yet.</div>';
  $('#scheduleList').innerHTML = [...db.schedule].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(s => `<article class="item"><div class="item-head"><b>${esc(vialName(s.vialId))}</b><button onclick="del('schedule','${s.id}')">Delete</button></div><span>${esc(s.date)} ${esc(s.time)} | ${esc(s.amount || s.amountMcg || '-')} ${esc(s.amountUnit || (s.amountMcg ? 'mcg' : 'mg'))} | ${esc(s.site || '-')} | ${esc(s.status)}</span><small>Cost: ${money(s.actualCost || autoCost(s))}</small><p>${esc(s.notes || '')}</p></article>`).join('') || '<div class="empty">No schedule entries.</div>';
  $('#siteSummary').textContent = nextSiteSuggestion();
  $('#weightList').innerHTML = [...db.weights].sort((a, b) => b.date.localeCompare(a.date)).map(w => `<article class="item"><b>${esc(w.date)}: ${esc(w.weight)}${esc(w.unit)}</b><span>Appetite: ${esc(w.appetite || '-')} | Waist: ${esc(w.waist || '-')}</span><p>${esc(w.notes || '')}</p></article>`).join('') || '<div class="empty">No weight entries.</div>';
  $('#foodList').innerHTML = [...db.foods].sort((a, b) => b.date.localeCompare(a.date)).map(f => `<article class="item"><b>${esc(f.date)}: ${esc(f.meal)}</b><small>${esc(f.portion)} portion | fatty ${esc(f.fatty)} | spicy ${esc(f.spicy)} | caffeine ${esc(f.caffeine)}</small><p>${esc(f.notes || '')}</p></article>`).join('') || '<div class="empty">No food entries.</div>';
  $('#symptomList').innerHTML = [...db.symptoms].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).map(s => `<article class="item"><b>${esc(s.date)} ${esc(s.time || '')}: ${esc(s.symptom)}</b><span>Severity ${esc(s.severity || 0)}/10 | possible trigger: ${esc(s.trigger || '-')}</span><p>${esc(s.notes || '')}</p></article>`).join('') || '<div class="empty">No symptom entries.</div>';
  $('#logList').innerHTML = [...db.logs].sort((a, b) => b.date.localeCompare(a.date)).map(l => `<article class="item"><b>${esc(l.date)}</b><span>Appetite ${esc(l.appetite || '-')} | nausea ${esc(l.nausea || '-')} | energy ${esc(l.energy || '-')} | mood ${esc(l.mood || '-')} | ${esc(l.digestion || '-')}</span><p>${esc(l.notes || '')}</p></article>`).join('') || '<div class="empty">No daily logs.</div>';
  $('#doseHistoryList').innerHTML = [...db.doseHistory].sort((a, b) => b.date.localeCompare(a.date)).map(d => `<article class="item"><div class="item-head"><b>${esc(d.date)}: ${esc(glpName(d.glp1))} ${esc(doseText(d.amount, d.unit))}</b><button onclick="del('doseHistory','${d.id}')">Delete</button></div><p>${esc(d.notes || '')}</p></article>`).join('') || '<div class="empty">No dose journey points yet.</div>';
  $('#peptideList').innerHTML = db.peptides.map(p => `<article class="item"><div class="item-head"><b>${esc(p.name)}</b><button onclick="del('peptides','${p.id}')">Delete</button></div><div><span class="pill">${esc(p.category || 'User-entered')}</span><span class="pill">${esc(doseText(p.amount, p.unit))}</span><span class="pill">${esc(p.frequency || 'No frequency')}</span></div><small>Start ${esc(p.startDate || '-')} | source ${esc(p.source || '-')} | storage ${esc(p.storage || '-')}</small><p>${esc(p.notes || '')}</p></article>`).join('') || '<div class="empty">No other peptides tracked.</div>';
  $('#foodInsights').innerHTML = insights();
}

function insights() {
  if (!db.foods.length || !db.symptoms.length) return 'Add food and symptom entries to see simple correlation hints.';
  const highSymptoms = db.symptoms.filter(s => num(s.severity) >= 5);
  if (!highSymptoms.length) return 'No higher-severity symptom entries yet.';
  const flags = { fatty: 0, spicy: 0, caffeine: 0 };
  highSymptoms.forEach(sym => {
    db.foods.filter(food => food.date === sym.date).forEach(food => {
      if (food.fatty === 'Yes') flags.fatty++;
      if (food.spicy === 'Yes') flags.spicy++;
      if (food.caffeine === 'Yes') flags.caffeine++;
    });
  });
  const out = Object.entries(flags).filter(([, value]) => value > 0).map(([key, value]) => `<div class="item"><b>Possible ${key} link</b><span>${value} same-day higher-severity symptom match${value === 1 ? '' : 'es'} included ${key} intake.</span></div>`);
  return out.join('') || 'No same-day food markers are repeating with higher-severity symptoms yet.';
}

function suggestMeal(craving, preference) {
  const q = craving.toLowerCase();
  let idea = {
    title: 'Protein plate with fibre',
    swap: `Instead of ${craving}, try a balanced plate with lean protein, slow carbs and vegetables.`,
    ingredients: ['lean protein', 'microwave rice or potatoes', 'salad or cooked vegetables', 'yoghurt or lemon dressing'],
    steps: ['Cook or warm the protein.', 'Add a small portion of slow carbs.', 'Fill half the plate with vegetables.', 'Use a light dressing and eat slowly.']
  };
  if (q.includes('pizza')) idea = { title: 'Pitta pizza with chicken and salad', swap: 'Keeps the pizza feel, but lowers grease and adds protein.', ingredients: ['wholemeal pitta', 'tomato passata', 'mozzarella', 'chicken or beans', 'peppers', 'side salad'], steps: ['Spread passata on the pitta.', 'Top with protein, peppers and a little mozzarella.', 'Bake until crisp.', 'Serve with salad.'] };
  else if (q.includes('burger')) idea = { title: 'Open turkey burger bowl', swap: 'Burger flavour without the heavy bun-and-fries crash.', ingredients: ['turkey or bean patty', 'lettuce', 'tomato', 'pickles', 'small potato wedges', 'yoghurt mustard sauce'], steps: ['Cook the patty.', 'Build a bowl with salad and pickles.', 'Add wedges if wanted.', 'Drizzle with yoghurt mustard sauce.'] };
  else if (q.includes('curry')) idea = { title: 'Gentle chicken or chickpea curry', swap: 'Creamy comfort with less oil and adjustable spice.', ingredients: ['chicken or chickpeas', 'tomatoes', 'spinach', 'light coconut milk or yoghurt', 'rice'], steps: ['Simmer protein with tomatoes.', 'Stir in spinach.', 'Add a little light coconut milk or yoghurt.', 'Serve with a modest rice portion.'] };
  else if (q.includes('pasta')) idea = { title: 'High-protein tomato pasta', swap: 'Pasta comfort with more protein and a lighter sauce.', ingredients: ['small pasta portion', 'chicken, tuna or lentils', 'tomato sauce', 'courgette or spinach', 'parmesan'], steps: ['Cook pasta.', 'Warm tomato sauce with protein and vegetables.', 'Combine and finish with a little parmesan.', 'Keep the portion comfortable.'] };
  else if (q.includes('sweet') || q.includes('chocolate') || q.includes('dessert')) idea = { title: 'Greek yoghurt dessert bowl', swap: 'Sweet, creamy and higher protein.', ingredients: ['Greek yoghurt', 'berries', 'cocoa or cinnamon', 'small drizzle of honey', 'crushed nuts'], steps: ['Spoon yoghurt into a bowl.', 'Add berries and cocoa or cinnamon.', 'Use a small honey drizzle.', 'Top with crushed nuts if tolerated.'] };
  else if (q.includes('coffee')) idea = { title: 'Lower-acid protein iced coffee', swap: 'Keeps the coffee ritual but makes it gentler and more filling.', ingredients: ['cold brew or half-caf coffee', 'milk or protein milk', 'ice', 'cinnamon'], steps: ['Use cold brew or half-caf.', 'Add milk or protein milk.', 'Serve over ice.', 'Sip slowly and pair with a small snack.'] };
  if (preference === 'Gentle on nausea') idea.steps.push('Keep the portion small and avoid eating quickly.');
  if (preference === 'Lower-fat') idea.steps.push('Use grilled, baked or air-fried cooking where possible.');
  if (preference === 'Vegetarian') idea.ingredients[0] = 'beans, lentils, tofu or Greek yoghurt';
  return idea;
}

window.del = (key, itemId) => {
  db[key] = db[key].filter(x => x.id !== itemId);
  save();
};

function normaliseVialForm(data) {
  data.quantity = String(itemQuantity(data));
  if (!data.remaining && data.amount) {
    const total = num(data.amount) * itemQuantity(data);
    data.remaining = cleanNumber(total);
    data.remainingUnit = data.amountUnit || 'mg';
  }
  return data;
}

function bindForm(idName, collection, normalise = data => data) {
  $(`#${idName}`).addEventListener('submit', e => {
    e.preventDefault();
    db[collection].push({ ...normalise(formObj(e.target)), id: id() });
    e.target.reset();
    setTodayDefaults();
    save();
  });
}

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
  hydrateSettings();
  render();
});

bindForm('vialForm', 'vials', normaliseVialForm);
bindForm('scheduleForm', 'schedule');
bindForm('weightForm', 'weights');
bindForm('foodForm', 'foods');
bindForm('symptomForm', 'symptoms');
bindForm('logForm', 'logs');
bindForm('doseHistoryForm', 'doseHistory');
bindForm('peptideForm', 'peptides');

$('#mealIdeaForm').addEventListener('submit', e => {
  e.preventDefault();
  const data = formObj(e.target);
  const idea = suggestMeal(data.craving, data.preference);
  db.foodIdeas.push({ ...data, ...idea, id: id(), date: today() });
  $('#mealIdeaResult').innerHTML = `<b>${esc(idea.title)}</b><p>${esc(idea.swap)}</p><b>Ingredients</b><ul>${idea.ingredients.map(i => `<li>${esc(i)}</li>`).join('')}</ul><b>Recipe</b><ol>${idea.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
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
  $('#calcResult').innerHTML = `<b>Concentration:</b> ${concMcgMl.toFixed(2)} mcg/ml<br><b>Volume to measure:</b> ${doseMl.toFixed(4)} ml<br><b>U-100 syringe:</b> ${(doseMl * 100).toFixed(1)} units`;
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
  db.vials.forEach(v => rows.push(['vial', '', v.name, `${itemQuantity(v)} x ${v.amount || v.amountMg || ''}${v.amountUnit || 'mg'}`, v.cost || 0, v.notes || ''].map(csvCell).join(',')));
  db.schedule.forEach(s => rows.push(['schedule', s.date, vialName(s.vialId), `${s.amount || s.amountMcg || ''}${s.amountUnit || 'mg'}`, s.actualCost || autoCost(s), s.notes || ''].map(csvCell).join(',')));
  db.doseHistory.forEach(d => rows.push(['dose_history', d.date, glpName(d.glp1), `${d.amount}${d.unit}`, '', d.notes || ''].map(csvCell).join(',')));
  db.foods.forEach(f => rows.push(['food', f.date, f.meal, f.portion, '', f.notes || ''].map(csvCell).join(',')));
  db.symptoms.forEach(s => rows.push(['symptom', s.date, s.symptom, `severity ${s.severity || 0}`, '', s.notes || ''].map(csvCell).join(',')));
  db.peptides.forEach(p => rows.push(['peptide', p.startDate || '', p.name, `${p.amount || ''}${p.unit || ''}`, '', p.notes || ''].map(csvCell).join(',')));
  db.weights.forEach(w => rows.push(['weight', w.date, 'weight', `${w.weight}${w.unit}`, '', w.notes || ''].map(csvCell).join(',')));
  download('vialwise-summary.csv', rows.join('\n'), 'text/csv');
});

$('#importJson').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    db = { ...structuredClone(defaults), ...imported, settings: { ...defaults.settings, ...(imported.settings || {}) } };
    localStorage.setItem(KEY, JSON.stringify(db));
    hydrateSettings();
    render();
    alert('Backup restored.');
  } catch {
    alert('That backup could not be read.');
  } finally {
    e.target.value = '';
  }
});

$('#sampleBtn').addEventListener('click', () => {
  db.settings = { ...db.settings, mode: 'advanced', glp1: 'semaglutide', currentDose: '0.25', customDose: '', doseUnit: 'mg' };
  db.vials = [{ id: 'v1', name: 'Semaglutide 5mg vials', type: 'GLP-1', quantity: '2', amount: '5', amountUnit: 'mg', water: '10', waterUnit: 'units', remaining: '8.5', remainingUnit: 'mg', dose: '0.25', doseUnit: 'mg', cost: '85', batch: 'Demo', expiry: '2026-12-01', notes: 'Demo: 2 x 5mg vials' }];
  db.schedule = [{ id: 's1', vialId: 'v1', date: today(), time: '09:00', amount: '0.25', amountUnit: 'mg', site: 'Left abdomen', status: 'Planned', notes: 'Demo entry' }];
  db.doseHistory = [{ id: 'd1', date: today(), glp1: 'semaglutide', amount: '0.25', unit: 'mg', notes: 'Demo start point' }];
  db.foods = [{ id: 'f1', date: today(), meal: 'Coffee and toast', portion: 'Small', fatty: 'No', spicy: 'No', caffeine: 'Yes', notes: 'Demo food entry' }];
  db.symptoms = [{ id: 'y1', date: today(), time: '11:00', symptom: 'Mild nausea', severity: '3', trigger: 'Coffee', notes: 'Demo symptom entry' }];
  db.peptides = [{ id: 'p1', name: 'Example peptide', category: 'Recovery', amount: '1', unit: 'mg', frequency: 'User-entered', startDate: today(), source: 'Demo', storage: 'Label instructions', notes: 'Demo only' }];
  hydrateSettings();
  save();
});

$('#clearBtn').addEventListener('click', () => {
  if (confirm('Clear all local VialWise data?')) {
    localStorage.removeItem(KEY);
    OLD_KEYS.forEach(k => localStorage.removeItem(k));
    location.reload();
  }
});

hydrateSettings();
setTodayDefaults();
render();
