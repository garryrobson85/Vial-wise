const KEY = 'vialwise_v7';
const OLD_KEYS = ['vialwise_v6', 'vialwise_v5'];
const AI_WORKER_URL = (window.VIALWISE_CONFIG?.aiWorkerUrl || '').replace(/\/$/, '');
const AI_MODEL = 'claude-sonnet-4-6';
const EMBEDDED_GEMINI_API_KEY = ''; // Legacy direct browser keys are disabled. Use the private Worker instead.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const glp1Options = {
  semaglutide: { name: 'Semaglutide', doses: [0.25, 0.5, 1, 1.7, 2, 2.4] },
  tirzepatide: { name: 'Tirzepatide', doses: [2.5, 5, 7.5, 10, 12.5, 15] },
  retatrutide: { name: 'Retatrutide', doses: [1, 2, 4, 6, 8, 12] }
};

const siteOrder = ['Left abdomen', 'Right abdomen', 'Left thigh', 'Right thigh', 'Left upper arm', 'Right upper arm'];
const siteAliases = {
  'left abdomen': 'Left abdomen',
  'l abdomen': 'Left abdomen',
  'left stomach': 'Left abdomen',
  'l stomach': 'Left abdomen',
  'right abdomen': 'Right abdomen',
  'r abdomen': 'Right abdomen',
  'right stomach': 'Right abdomen',
  'r stomach': 'Right abdomen',
  'left thigh': 'Left thigh',
  'l thigh': 'Left thigh',
  'right thigh': 'Right thigh',
  'r thigh': 'Right thigh',
  'left upper arm': 'Left upper arm',
  'left arm': 'Left upper arm',
  'l upper arm': 'Left upper arm',
  'l arm': 'Left upper arm',
  'right upper arm': 'Right upper arm',
  'right arm': 'Right upper arm',
  'r upper arm': 'Right upper arm',
  'r arm': 'Right upper arm'
};

const geminiPricesUsd = {
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 }
};

const defaults = {
  settings: {
    journey: 'GLP-1 weight journey',
    delivery: 'Reconstituted vial',
    mode: 'pen',
    name: '',
    gender: 'female',
    theme: 'rose',
    appearance: 'light',
    startWeight: '',
    startDate: '',
    goalWeight: '',
    units: 'kg',
    age: '',
    heightUnit: 'cm',
    heightCm: '',
    heightFt: '',
    heightIn: '',
    activityLevel: 'light',
    caloriePace: 'medium',
    scheduleEvery: '7',
    motivation: '',
    healthDisclaimerAccepted: '',
    glp1: 'semaglutide',
    currentDose: '0.25',
    customDose: '',
    doseUnit: 'mg',
    penCost: '',
    penDoses: '',
    feedback: 'on',
    trendThreshold: '3',
    enabledSites: ['Left abdomen', 'Right abdomen', 'Left thigh', 'Right thigh']
  },
  vials: [],
  schedule: [],
  weights: [],
  foods: [],
  symptoms: [],
  digestion: [],
  logs: [],
  doseHistory: [],
  peptides: [],
  peptideSymptoms: [],
  foodIdeas: [],
  gemini: { apiKey: '', model: AI_MODEL, useGemini: 'yes' },
  geminiFreeDailyRequests: '0',
  geminiUsage: [],
  compounds: []
};

function normaliseDb(loaded = {}) {
  const data = {
    ...structuredClone(defaults),
    ...loaded,
    settings: { ...defaults.settings, ...(loaded.settings || {}) },
    symptoms: loaded.symptoms || [],
    digestion: loaded.digestion || [],
    doseHistory: loaded.doseHistory || [],
    peptides: loaded.peptides || loaded.compounds || [],
    peptideSymptoms: loaded.peptideSymptoms || [],
    gemini: { apiKey: '', model: AI_MODEL, useGemini: 'yes', ...(loaded.gemini || {}), apiKey: '' },
    geminiFreeDailyRequests: loaded.geminiFreeDailyRequests || '0',
    geminiUsage: loaded.geminiUsage || [],
    foodIdeas: loaded.foodIdeas || []
  };
  if (data.settings.units === 'lb') data.settings.units = 'st';
  data.weights = (data.weights || []).map(weight => ({ ...weight, unit: weight.unit === 'lb' ? 'st' : weight.unit }));
  return data;
}

function loadDb() {
  let loaded = {};
  try {
    const raw = localStorage.getItem(KEY) || OLD_KEYS.map(k => localStorage.getItem(k)).find(Boolean);
    loaded = raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('VialWise could not read saved browser data:', err);
  }
  return normaliseDb(loaded);
}

let db = loadDb();

function storageBytes() {
  try {
    return new Blob([JSON.stringify(db)]).size;
  } catch {
    return 0;
  }
}

function updateStorageStatus(message = '') {
  const box = $('#storageStatus') || $('#backupHealth') || $('#settingsSaved');
  if (!box) return;
  const mb = (storageBytes() / 1024 / 1024).toFixed(2);
  box.innerHTML = message || `Saved in this browser. Current local data size: ${mb} MB.`;
}

function idbStore() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  return new Promise(resolve => {
    const request = indexedDB.open('vialwise_store', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function idbSet(key, value) {
  const database = await idbStore();
  if (!database) return false;
  return new Promise(resolve => {
    const tx = database.transaction('records', 'readwrite');
    tx.objectStore('records').put(value, key);
    tx.oncomplete = () => {
      database.close();
      resolve(true);
    };
    tx.onerror = () => {
      database.close();
      resolve(false);
    };
  });
}

async function idbGet(key) {
  const database = await idbStore();
  if (!database) return null;
  return new Promise(resolve => {
    const tx = database.transaction('records', 'readonly');
    const request = tx.objectStore('records').get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
    tx.oncomplete = () => database.close();
  });
}

function persistDb() {
  try {
    db.updatedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(db));
    idbSet(KEY, db);
    updateStorageStatus();
    return true;
  } catch (err) {
    db.updatedAt = new Date().toISOString();
    idbSet(KEY, db);
    const message = 'Browser storage is full or blocked. Export JSON now, then remove some photos or use this app in the same normal browser profile.';
    console.warn('VialWise save failed:', err);
    updateStorageStatus(message);
    alert(message);
    return false;
  }
}

const save = () => {
  persistDb();
  render();
  returnToMainTop();
};
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => Number(v) || 0;
const money = n => 'GBP ' + (Number(n) || 0).toFixed(2);
const usd = n => '$' + (Number(n) || 0).toFixed(4);
const cleanNumber = n => String(Number(n || 0).toFixed(3)).replace(/\.?0+$/, '');
const esc = s => String(s || '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const formObj = form => Object.fromEntries(new FormData(form).entries());
const today = () => new Date().toISOString().slice(0, 10);
const dayMs = 24 * 60 * 60 * 1000;

function feedback(kind = 'tap') {
  if ((db.settings.feedback || 'on') === 'off') return;
  if (navigator.vibrate) navigator.vibrate(kind === 'save' ? [18, 24, 14] : [8, 12]);
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = feedback.ctx || (feedback.ctx = new AudioCtx());
    const notes = kind === 'save'
      ? [{ f: 660, t: 0, d: 0.07 }, { f: 990, t: 0.055, d: 0.11 }]
      : [{ f: 520, t: 0, d: 0.045 }, { f: 780, t: 0.035, d: 0.045 }];
    notes.forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'save' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(note.f, ctx.currentTime + note.t);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + note.t);
      gain.gain.exponentialRampToValueAtTime(kind === 'save' ? 0.028 : 0.014, ctx.currentTime + note.t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + note.t + note.d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + note.t);
      osc.stop(ctx.currentTime + note.t + note.d + 0.02);
    });
  } catch {}
}

function mcg(amount, unit) {
  return num(amount) * (unit === 'mg' ? 1000 : 1);
}

function baseAmount(amount, unit) {
  if (unit === 'iu') return { value: num(amount), family: 'iu', label: 'IU' };
  return { value: mcg(amount, unit), family: 'mass', label: 'mcg' };
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

function doseMg(amount, unit) {
  return num(amount) * (unit === 'mcg' ? 0.001 : 1);
}

function latestWeight() {
  return [...db.weights].filter(w => num(w.weight)).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function heightCmValue() {
  if ((db.settings.heightUnit || 'cm') === 'ftin') {
    const inches = (num(db.settings.heightFt) * 12) + num(db.settings.heightIn);
    return inches ? inches * 2.54 : 0;
  }
  return num(db.settings.heightCm);
}

function bmiValue(weightKgValue = latestWeightKg()) {
  const heightM = heightCmValue() / 100;
  if (!weightKgValue || !heightM) return 0;
  return weightKgValue / (heightM * heightM);
}

function populateGlpSelects() {
  const options = Object.entries(glp1Options).map(([key, item]) => `<option value="${key}">${item.name}</option>`).join('');
  $('#settingsGlp1').innerHTML = options;
  $('#doseHistoryGlp1').innerHTML = options;
  $('#onboardingGlp1').innerHTML = options;
}

function populateDoseSelect(glpKey, selected) {
  const select = $('#settingsDose');
  select.innerHTML = (glp1Options[glpKey]?.doses || []).map(d => `<option value="${d}">${d} mg</option>`).join('');
  if (selected && [...select.options].some(o => o.value === String(selected))) select.value = String(selected);
}

function refreshThemeLabels() {
  const labels = { rose: 'Rose glow', teal: 'Aqua glow', plum: 'Plum glow', slate: 'Slate glow' };
  $$('select[name="theme"]').forEach(select => {
    [...select.options].forEach(option => {
      option.textContent = labels[option.value] || option.textContent;
    });
  });
}

function ensureGeminiModelOptions() {
  const select = $('#geminiForm')?.elements.geminiModel;
  if (!select) return;
  select.innerHTML = '<option value="claude-sonnet-4-6">Claude Sonnet</option>';
  select.value = 'claude-sonnet-4-6';
  select.closest('label')?.classList.add('hidden');
  if (!$('#geminiFreeDailyRequests')) {
    select.closest('label')?.insertAdjacentHTML('afterend', '<label>Free requests/day<input id="geminiFreeDailyRequests" name="geminiFreeDailyRequests" type="number" min="0" step="1" value="0"></label>');
  }
}

function ensureMealPhotoUi() {
  if ($('#mealPhotoForm')) return;
  const grid = $('#food .grid.two-col');
  if (!grid) return;
  grid.insertAdjacentHTML('beforeend', `<article class="card meal-snap-card"><h2>Snap meal</h2><p class="muted">Take or upload a meal photo, choose the meal type, then review the estimate before saving.</p><form id="mealPhotoForm" class="form-grid single"><label>Meal photo<input name="mealPhoto" type="file" accept="image/*" capture="environment"></label><label>Meal type<select name="mealType"><option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snack</option><option>Drink</option><option>Meal</option></select></label><label>Extra context<textarea name="mealContext" rows="3" placeholder="Example: chicken wrap, small fries, Diet Coke. Mention sauces, oil, restaurant, or anything hidden."></textarea></label><button class="primary" type="submit">Estimate from photo</button></form><div id="mealPhotoPreview" class="meal-photo-preview empty">No meal photo selected.</div><div id="mealScanResult" class="result muted">AI estimates are a starting point. Review before saving.</div></article>`);
  $('#mealPhotoForm').addEventListener('change', async e => {
    if (e.target.name !== 'mealPhoto') return;
    const file = e.target.files[0];
    $('#mealPhotoPreview').innerHTML = file ? `<img src="${await compressPhoto(file)}" alt="Selected meal photo preview">` : 'No meal photo selected.';
  });
  $('#mealPhotoForm').addEventListener('submit', async e => {
    e.preventDefault();
    await estimateMealFromPhoto(e.target);
  });
}

function enhanceOnboardingWizard() {
  const form = $('#onboardingForm');
  if (!form || form.dataset.wizardReady) return;
  form.dataset.wizardReady = 'true';
  const grid = form.querySelector('.form-grid');
  const submit = form.querySelector('button[type="submit"]');
  const field = name => grid.querySelector(`[name="${name}"]`)?.closest('label,.mode-panel');
  const modePanels = [...grid.querySelectorAll('.mode-panel')];
  const steps = [
    { title: 'Make VialWise yours', sub: 'A quick setup so the tracker starts useful.', names: ['name', 'gender', 'theme'] },
    { title: 'Which GLP-1 are you tracking?', sub: 'Choose the medicine or compound name you currently use.', names: ['glp1', 'currentDose', 'customDose', 'doseUnit'] },
    { title: 'Device type', sub: 'This changes the setup flow for pens or vial inventory.', names: ['mode'], extra: modePanels },
    { title: 'How often do you take it?', sub: 'You can change schedule details later.', names: ['scheduleEvery'] },
    { title: 'Your body basics', sub: 'Used for BMR, calorie targets and progress charts.', names: ['startWeight', 'startDate', 'goalWeight', 'units', 'age', 'heightUnit', 'heightCm', 'heightFt', 'heightIn'] },
    { title: 'Daily routine', sub: 'This powers the calorie target estimate.', names: ['activityLevel', 'caloriePace'] },
    { title: 'What is driving you?', sub: 'A small reminder for the days motivation is useful.', names: ['motivation'] },
    { title: 'Health disclaimer', sub: 'VialWise tracks and calculates. It does not provide medical advice.', names: ['healthDisclaimerAccepted'] }
  ];
  const shell = document.createElement('div');
  shell.className = 'wizard-shell';
  shell.innerHTML = '<div class="wizard-top"><button class="wizard-back" type="button" aria-label="Back">Back</button><div class="wizard-track"><span></span></div></div><div class="wizard-steps"></div><div class="wizard-actions"><button class="wizard-next primary" type="button">Continue</button></div>';
  const holder = shell.querySelector('.wizard-steps');
  steps.forEach((step, index) => {
    const pane = document.createElement('section');
    pane.className = 'wizard-step';
    pane.dataset.step = index;
    pane.innerHTML = `<p class="eyebrow">Step ${index + 1} of ${steps.length}</p><h2>${esc(step.title)}</h2><p class="muted">${esc(step.sub)}</p><div class="wizard-fields"></div>`;
    const fields = pane.querySelector('.wizard-fields');
    step.names.map(field).filter(Boolean).forEach(node => fields.appendChild(node));
    (step.extra || []).forEach(node => fields.appendChild(node));
    holder.appendChild(pane);
  });
  grid.replaceWith(shell);
  submit.classList.add('hidden');
  form.appendChild(submit);
  let current = 0;
  const show = () => {
    form.querySelectorAll('.wizard-step').forEach((pane, index) => pane.classList.toggle('active', index === current));
    form.querySelector('.wizard-track span').style.width = `${((current + 1) / steps.length) * 100}%`;
    form.querySelector('.wizard-back').disabled = current === 0;
    form.querySelector('.wizard-next').textContent = current === steps.length - 1 ? 'Start tracking' : 'Continue';
    syncModePanels(form.elements.mode?.value || db.settings.mode);
  };
  form.querySelector('.wizard-back').addEventListener('click', () => {
    current = Math.max(0, current - 1);
    show();
  });
  form.querySelector('.wizard-next').addEventListener('click', () => {
    if (current < steps.length - 1) {
      current += 1;
      show();
    } else {
      form.requestSubmit(submit);
    }
  });
  form.addEventListener('change', e => {
    const label = e.target.closest('label');
    if (!label) return;
    label.classList.toggle('selected', !!e.target.value || e.target.checked);
  });
  show();
}

function applyFoodTestingMode() {
  $('#foodForm')?.closest('.card')?.classList.remove('hidden');
  $('#mealIdeaForm')?.closest('.card')?.classList.remove('hidden');
  $('.meal-snap-card')?.classList.remove('hidden');
  const geminiCard = $('#geminiForm')?.closest('.card');
  if (geminiCard) {
    $('#geminiForm')?.classList.add('hidden');
    geminiCard.querySelector('details')?.classList.add('hidden');
    if ($('#geminiStatus')) $('#geminiStatus').textContent = AI_WORKER_URL ? 'AI meal estimates and food swaps are routed through the private Cloudflare Worker.' : 'AI Worker not configured yet. Built-in food ideas still work without a key.';
  }
}

function hydrateSettings() {
  populateGlpSelects();
  refreshThemeLabels();
  ensureMealPhotoUi();
  enhanceOnboardingWizard();
  applyFoodTestingMode();
  const form = $('#settingsForm');
  Object.entries(db.settings).forEach(([key, value]) => {
    const field = form.elements[key];
    if (field?.type === 'checkbox') field.checked = value === 'yes' || value === true || value === 'on';
    else if (field) field.value = value;
  });
  populateDoseSelect(db.settings.glp1, db.settings.currentDose);
  $('#settingsGlp1').value = db.settings.glp1;
  $('#settingsDoseUnit').value = db.settings.doseUnit || 'mg';
  $('#doseHistoryGlp1').value = db.settings.glp1;
  $('#onboardingGlp1').value = db.settings.glp1;
  populateDoseSelect(db.settings.glp1, db.settings.currentDose);
  $('#onboardingDose').innerHTML = $('#settingsDose').innerHTML;
  $('#onboardingDose').value = db.settings.currentDose;
  const geminiForm = $('#geminiForm');
  if (geminiForm) {
    ensureGeminiModelOptions();
    geminiForm.elements.geminiApiKey.value = db.gemini?.apiKey || '';
    db.gemini.model = AI_MODEL;
    geminiForm.elements.geminiModel.value = AI_MODEL;
    geminiForm.elements.useGemini.value = db.gemini?.useGemini || 'yes';
    if (geminiForm.elements.geminiFreeDailyRequests) geminiForm.elements.geminiFreeDailyRequests.value = db.geminiFreeDailyRequests || '0';
  }
  applyMode();
  applyTheme();
  showOnboardingIfNeeded();
}

function setTodayDefaults() {
  ['scheduleForm', 'weightForm', 'foodForm', 'symptomForm', 'digestionForm', 'logForm', 'doseHistoryForm', 'peptideSymptomForm'].forEach(formId => {
    const input = $(`#${formId} input[name="date"]`);
    if (input && !input.value) input.value = today();
  });
}

document.addEventListener('click', e => {
  if (e.target.closest('button, .import-label')) feedback('tap');
});

function pageTitle() {
  $('#pageTitle').textContent = $('.tab.active')?.textContent || 'Today';
  updateNextInjectionLabel();
}

function formatScheduleLabel(entry) {
  if (!entry) return 'Next injection: not scheduled';
  const date = new Date(`${entry.date}T${entry.time || '00:00'}`);
  const when = Number.isNaN(date.getTime())
    ? entry.date
    : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `Next injection: ${when}${entry.time ? ` at ${entry.time}` : ''}`;
}

function updateNextInjectionLabel() {
  const label = $('#nextInjectionLabel');
  if (!label) return;
  label.textContent = formatScheduleLabel(nextSchedule());
}

function nextRingState(next) {
  if (next?.date === today()) return { progress: 70, status: 'Jab due today.', tone: 'due', action: 'Mark taken' };
  const last = [...db.schedule].filter(s => s.status === 'Taken').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
  if (last) {
    if (last.date === today()) return { progress: 12, status: 'Jab logged today.', tone: 'ready', action: next ? 'View schedule' : 'Add next jab' };
    const takenAt = new Date(`${last.date}T${last.time || '12:00'}`);
    const daysSince = Math.max(1, Math.floor((new Date() - takenAt) / dayMs) + 1);
    const tone = daysSince <= 4 ? 'ready' : daysSince <= 7 ? 'soon' : 'overdue';
    const progress = Math.min(100, Math.max(12, (daysSince / 8) * 100));
    return { progress, status: `Day ${daysSince} since last jab.`, tone, action: next ? 'View schedule' : 'Add next jab' };
  }
  if (!next) return { progress: 0, status: 'Add your first jab to get started.', tone: 'empty', action: 'Add jab' };
  const dueAt = new Date(`${next.date}T${next.time || '12:00'}`);
  const now = new Date();
  const hours = (dueAt - now) / (60 * 60 * 1000);
  if (Number.isNaN(dueAt.getTime())) return { progress: 45, status: 'Next date set.', tone: 'soon', action: 'View schedule' };
  if (hours < -2) return { progress: 96, status: 'Overdue. Check schedule.', tone: 'overdue', action: 'Mark taken' };
  if (hours <= 2) return { progress: 86, status: 'Due now.', tone: 'due', action: 'Mark taken' };
  if (hours <= 24) return { progress: 68, status: 'Due within 24 hours.', tone: 'soon', action: 'View schedule' };
  return { progress: 38, status: `Due in ${Math.ceil(hours / 24)} day${Math.ceil(hours / 24) === 1 ? '' : 's'}.`, tone: 'ready', action: 'View schedule' };
}

function applyTheme() {
  let theme = db.settings.theme || 'teal';
  if (!db.settings.theme && db.settings.gender === 'female') theme = 'rose';
  document.body.dataset.theme = theme;
  document.body.dataset.appearance = db.settings.appearance || 'light';
  const next = (db.settings.appearance || 'light') === 'dark' ? 'Light mode' : 'Dark mode';
  $('#appearanceToggle') && ($('#appearanceToggle').textContent = next);
  $('#mobileAppearanceToggle') && ($('#mobileAppearanceToggle').textContent = next);
}

function showOnboardingIfNeeded() {
  $('#onboardingOverlay')?.classList.toggle('hidden', !!db.settings.onboarded);
}

function applyMode() {
  if (db.settings.mode === 'beginner') db.settings.mode = 'pen';
  if (db.settings.mode === 'advanced') db.settings.mode = 'vials';
  const mode = db.settings.mode || 'pen';
  db.settings.mode = mode;
  if ($('#settingsForm')?.elements.mode) $('#settingsForm').elements.mode.value = mode;
  $('#penMode').classList.toggle('active', mode === 'pen');
  $('#vialMode').classList.toggle('active', mode === 'vials');
  $$('.vial-tab').forEach(tab => tab.classList.toggle('hidden', mode !== 'vials'));
  $$('.cost-metric').forEach(item => item.classList.remove('hidden'));
  syncModePanels(mode);
  const active = $('.tab.active');
  if (active?.classList.contains('hidden')) switchView('today');
}

function syncModePanels(modeValue) {
  const mode = modeValue || db.settings.mode || 'pen';
  $$('.pen-only').forEach(item => item.classList.toggle('hidden', mode !== 'pen'));
  $$('.vial-only').forEach(item => item.classList.toggle('hidden', mode !== 'vials'));
}

function switchView(view) {
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === view));
  document.body.classList.toggle('settings-hub', view === 'setup');
  $('#mobileMoreMenu')?.classList.remove('open');
  $('#mobileMoreMenu')?.classList.add('hidden');
  pageTitle();
  if (view === 'vials') prefillVial();
  if (view === 'schedule') prefillSchedule();
}

function returnToMainTop(view = '') {
  if (view) switchView(view);
  $('#mobileMoreMenu')?.classList.remove('open');
  $('#mobileMoreMenu')?.classList.add('hidden');
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('.main-content')?.scrollTo?.({ top: 0, behavior: 'smooth' });
  });
}

$('#tabs').addEventListener('click', e => {
  if (!e.target.matches('.tab') || e.target.classList.contains('hidden')) return;
  switchView(e.target.dataset.view);
});

$('.bottom-nav').addEventListener('click', e => {
  const button = e.target.closest('button[data-view]');
  if (!button) return;
  switchView(button.dataset.view);
});

$('#mobileMoreBtn')?.addEventListener('click', () => {
  const menu = $('#mobileMoreMenu');
  if (!menu) return;
  const open = !menu.classList.contains('open');
  menu.classList.toggle('open', open);
  menu.classList.toggle('hidden', !open);
});

$('#mobileMoreMenu').addEventListener('click', e => {
  const button = e.target.closest('button[data-view]');
  if (!button) return;
  switchView(button.dataset.view);
});

$('#promptBox')?.addEventListener('click', e => {
  const button = e.target.closest('button[data-view]');
  if (!button) return;
  switchView(button.dataset.view);
});

$('#settingsBtn').addEventListener('click', () => switchView('setup'));

function toggleAppearance() {
  db.settings.appearance = (db.settings.appearance || 'light') === 'dark' ? 'light' : 'dark';
  const form = $('#settingsForm');
  if (form?.elements.appearance) form.elements.appearance.value = db.settings.appearance;
  persistDb();
  applyTheme();
  feedback('save');
}

$('#appearanceToggle')?.addEventListener('click', toggleAppearance);
$('#mobileAppearanceToggle')?.addEventListener('click', () => {
  toggleAppearance();
  $('#mobileMoreMenu')?.classList.remove('open');
  $('#mobileMoreMenu')?.classList.add('hidden');
});
$('#startVialInventory')?.addEventListener('click', () => {
  db.settings.mode = 'vials';
  applyMode();
  switchView('vials');
});

document.addEventListener('click', e => {
  const view = e.target.closest('[data-view]')?.dataset.view;
  if (view && !e.target.closest('#tabs,.bottom-nav,#mobileMoreMenu')) switchView(view);
  const jump = e.target.closest('[data-jump]')?.dataset.jump;
  if (jump) switchView(jump);
});

$('#penMode').addEventListener('click', () => {
  db.settings.mode = 'pen';
  $('#settingsForm').elements.mode.value = 'pen';
  save();
});

$('#vialMode').addEventListener('click', () => {
  db.settings.mode = 'vials';
  $('#settingsForm').elements.mode.value = 'vials';
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
  if (i === 'current-glp1') return `${glpName()} (${doseText()})`;
  return db.vials.find(v => v.id === i)?.name || 'Unassigned';
}

function autoCost(s) {
  if (s.vialId === 'current-glp1') return penCostPerDose();
  const v = db.vials.find(item => item.id === s.vialId);
  if (!v) return 0;
  const totalMcg = totalInventoryMcg(v);
  const doseMcg = mcg(s.amount ?? s.amountMcg ?? v.dose ?? v.doseMcg, s.amountUnit || v.doseUnit || 'mg');
  return totalMcg && num(v.cost) && doseMcg ? (num(v.cost) / totalMcg) * doseMcg : 0;
}

function isPenMode() {
  return (db.settings.mode || 'pen') === 'pen';
}

function penTakenCount() {
  return db.schedule.filter(s => s.vialId === 'current-glp1' && s.status === 'Taken').length;
}

function penCostPerDose() {
  const doses = num(db.settings.penDoses);
  return doses ? num(db.settings.penCost) / doses : 0;
}

function penDosesLeft() {
  const doses = num(db.settings.penDoses);
  return Math.max(0, doses - penTakenCount());
}

function inventoryTotals() {
  if (isPenMode()) {
    const spend = num(db.settings.penCost);
    const perDose = penCostPerDose();
    const left = penDosesLeft();
    return { spend, value: perDose * left, doses: left, cost: perDose };
  }
  const spend = db.vials.reduce((a, v) => a + num(v.cost), 0);
  const value = db.vials.reduce((a, v) => a + remainingValue(v), 0);
  const doses = db.vials.reduce((a, v) => a + dosesLeft(v), 0);
  const cost = db.vials.map(costPerDose).find(Boolean) || 0;
  return { spend, value, doses, cost };
}

function nextSchedule() {
  return [...db.schedule]
    .filter(s => s.status !== 'Taken' && s.status !== 'Skipped')
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))[0];
}

function latestTakenSite() {
  return [...db.schedule]
    .filter(s => s.site && s.status === 'Taken')
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))
    .map(s => normaliseSite(s.site))
    .find(Boolean) || '';
}

function normaliseSite(site) {
  const cleaned = String(site || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return siteAliases[cleaned] || siteOrder.find(s => s.toLowerCase() === cleaned) || String(site || '').trim();
}

function enabledSites() {
  const sites = db.settings.enabledSites || defaults.settings.enabledSites;
  return sites.map(normaliseSite).filter(site => siteOrder.includes(site));
}

function eightWeekInjections() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 56);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  return [...db.schedule]
    .filter(s => s.site && s.date >= cutoffDate && s.status === 'Taken')
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
}

function nextSiteSuggestion() {
  const last = latestTakenSite();
  const rotation = enabledSites();
  if (!rotation.length) return 'Choose at least one site to include in rotation.';
  if (!last) return 'Start with a site and rotate from there.';
  const index = rotation.indexOf(last);
  return index >= 0 ? `Last used: ${last}. Consider ${rotation[(index + 1) % rotation.length]} next.` : `Last used: ${last}. Choose a site from your selected rotation next.`;
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

function renderToday(spend, value, doses, cost) {
  const dose = currentDose();
  const due = db.schedule.filter(s => s.date === today());
  const next = nextSchedule();
  renderSummaryDashboard(spend, value, doses, cost, due, next);
  $('#todayPlan').textContent = `${glpName()} ${doseText(dose.amount, dose.unit)}`;
  $('#todaySub').textContent = due.length ? `${due.length} schedule entr${due.length === 1 ? 'y' : 'ies'} due today.` : 'No injection scheduled today.';
  $('#heroCost').textContent = `${money(cost)} / injection`;
  $('#heroNext').textContent = next ? `Next: ${next.date} ${next.time || ''}` : 'Next: not scheduled';
  $('#todayBox').innerHTML = due.length ? due.map(s => `<div class="item"><b>${esc(vialName(s.vialId))}</b><span>${esc(s.time || '')} | ${esc(s.amount || s.amountMcg || '-')} ${esc(s.amountUnit || (s.amountMcg ? 'mcg' : 'mg'))} | ${esc(s.site || 'site not set')} | ${esc(s.status)}</span></div>`).join('') : renderProgressFocus();
  const prompts = [
    { view: 'schedule', text: `Dose: ${doseText(dose.amount, dose.unit)} ${glpName()}` },
    { view: 'sites', text: nextSiteSuggestion() },
    { view: 'logs', text: db.logs.some(l => l.date === today()) ? 'Daily check-in completed today.' : 'Add appetite, nausea, energy and mood today.' },
    { view: 'food', text: db.foods.some(f => f.date === today()) ? 'Food logged today.' : 'Log food if symptoms appear later.' }
  ];
  $('#promptBox').innerHTML = prompts.map(item => `<button class="prompt prompt-action" type="button" data-jump="${item.view}"><b>+</b><span>${esc(item.text)}</span></button>`).join('');
  $('#costSnapshot').innerHTML = cost ? `<b>${money(cost)}</b> estimated per injection<br><b>${money(cost * 4.33)}</b> estimated monthly if weekly<br><b>${doses}</b> estimated doses left<br><b>${money(value)}</b> remaining value from ${money(spend)} spend` : (isPenMode() ? 'Add pen cost and doses per pen in Setup.' : 'Add a vial or pen to calculate cost per injection.');
  $('#todayInsights').innerHTML = insights();
}

function halfLifeDays() {
  return { semaglutide: 7, tirzepatide: 5, retatrutide: 6 }[db.settings.glp1] || 6;
}

function medicationLevelOn(date) {
  const target = new Date(`${date}T12:00:00`);
  const halfLife = halfLifeDays();
  return db.schedule.filter(s => s.status === 'Taken').reduce((sum, s) => {
    const takenAt = new Date(`${s.date}T${s.time || '12:00'}`);
    const days = (target - takenAt) / dayMs;
    if (days < 0) return sum;
    const amount = doseMg(s.amount || s.amountMcg || currentDose().amount, s.amountUnit || (s.amountMcg ? 'mcg' : currentDose().unit));
    return sum + amount * Math.pow(0.5, days / halfLife);
  }, 0);
}

function levelSparkline() {
  const points = [];
  const start = new Date();
  start.setDate(start.getDate() - 21);
  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    points.push({ date: date.toISOString().slice(0, 10), value: medicationLevelOn(date.toISOString().slice(0, 10)) });
  }
  const max = Math.max(...points.map(p => p.value), 1);
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * 100;
    const y = 55 - (p.value / max) * 45;
    return `${i ? 'L' : 'M'}${cleanNumber(x)} ${cleanNumber(y)}`;
  }).join(' ');
  const fill = `${path} L100 60 L0 60 Z`;
  return `<svg class="level-chart" viewBox="0 0 100 62" preserveAspectRatio="none" aria-label="Estimated medication level chart"><path class="level-fill" d="${fill}"></path><path class="level-line" d="${path}"></path></svg>`;
}

function goalProgress() {
  const start = weightKg(db.settings.startWeight, db.settings.units || 'kg');
  const current = latestWeightKg();
  const goal = weightKg(db.settings.goalWeight, db.settings.units || 'kg');
  if (!start || !current || !goal || start === goal) return 0;
  return Math.max(0, Math.min(100, ((start - current) / (start - goal)) * 100));
}

function goalRemainingText() {
  const goal = weightKg(db.settings.goalWeight, db.settings.units || 'kg');
  const current = latestWeightKg();
  if (!goal || !current) return '-';
  const remainingKg = current - goal;
  const units = db.settings.units || 'kg';
  if (units === 'st') return `${cleanNumber(Math.abs(remainingKg / 6.35029))} st`;
  return `${cleanNumber(Math.abs(remainingKg))} kg`;
}

function renderSummaryDashboard(spend, value, doses, cost, due, next) {
  let dash = $('#summaryDashboard');
  if (!dash) {
    dash = document.createElement('div');
    dash.id = 'summaryDashboard';
    dash.className = 'summary-dashboard';
    $('#today .hero-panel')?.before(dash);
  }
  const taken = db.schedule.filter(s => s.status === 'Taken').length;
  const last = [...db.schedule].filter(s => s.status === 'Taken').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
  const totals = dailyFoodTotals(today());
  const weight = latestWeight();
  const bmi = bmiValue();
  const progress = goalProgress();
  const ring = nextRingState(next);
  const profile = bmrProfile();
  const target = profile ? Math.round(profile.targets[profile.selected] || profile.targets.medium) : 0;
  const caloriesLabel = target ? `${Math.round(totals.calories)} / ${target}` : (totals.calories ? Math.round(totals.calories) : '-');
  const bmrLabel = profile ? `${Math.round(profile.bmr)} kcal` : '-';
  dash.innerHTML = `<div class="summary-head"><button class="hamburger" type="button" data-view="setup">Settings</button><h2>Summary</h2><button class="add-jab" type="button" data-jump="schedule">+ Add jab</button></div>
  <section class="jab-strip"><h2>Jab history</h2><div class="mini-grid"><div><span>Jabs taken</span><b>${taken}</b></div><div><span>Last dose</span><b>${last ? doseText(last.amount || last.amountMcg || currentDose().amount, last.amountUnit || (last.amountMcg ? 'mcg' : currentDose().unit)) : '0 mg'}</b></div><div><span>Next status</span><b>${next ? esc(ring.status) : '-'}</b></div></div></section>
  <section class="next-ring-card"><h2>Jab cycle</h2><div class="due-bar ${ring.tone}" style="--progress:${ring.progress}"><div class="due-bar-head"><b>${last ? esc(last.date) : (next ? esc(next.date) : 'Welcome')}</b><span>${next ? esc(`${next.time || ''} - ${ring.status}`) : ring.status}</span></div><div class="due-track" aria-label="Jab cycle day scale"><span></span></div><div class="due-labels"><small>Days 1-4</small><small>Days 5-7</small><small>After 7</small></div><button type="button" data-jump="schedule">${ring.action}</button></div></section>
  <section class="today-strip"><h2>Today, ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</h2><div class="mini-grid"><div><span>Weight</span><b>${weight ? `${esc(weight.weight)} ${esc(weight.unit || db.settings.units)}` : '-'}</b></div><div><span>Calories</span><b>${caloriesLabel}</b></div><div><span>BMR</span><b>${bmrLabel}</b></div></div></section>
  <section class="results-strip"><h2>Results</h2><div class="mini-grid"><div><span>Current BMI</span><b>${bmi ? cleanNumber(bmi) : '-'}</b></div><div><span>To goal</span><b>${goalRemainingText()}</b><small>${Math.round(progress)}% progress</small></div><div><span>Cost / jab</span><b>${cost ? money(cost) : '-'}</b></div></div></section>`;
}

function renderProgressFocus() {
  const photos = [...db.weights].filter(w => w.photo).sort((a, b) => a.date.localeCompare(b.date));
  if (photos.length >= 2) {
    const first = photos[0];
    const latest = photos[photos.length - 1];
    return `<div class="progress-focus"><figure><span>First photo</span><img src="${first.photo}" alt="First uploaded progress photo"><figcaption>${esc(first.date)} | ${esc(first.weight || '-')} ${esc(first.unit || db.settings.units || '')}</figcaption></figure><figure><span>Latest photo</span><img src="${latest.photo}" alt="Latest uploaded progress photo"><figcaption>${esc(latest.date)} | ${esc(latest.weight || '-')} ${esc(latest.unit || db.settings.units || '')}</figcaption></figure></div>`;
  }
  if (photos.length === 1) {
    const latest = photos[0];
    return `<div class="progress-focus single"><figure><span>Latest photo</span><img src="${latest.photo}" alt="Latest uploaded progress photo"><figcaption>${esc(latest.date)} | ${esc(latest.weight || '-')} ${esc(latest.unit || db.settings.units || '')}</figcaption></figure><div class="progress-note"><b>No dose scheduled today.</b><p>Add another progress photo later to compare first versus latest here.</p><button data-jump="weight" type="button">Add progress photo</button></div></div>`;
  }
  return '<div class="progress-note"><b>No dose scheduled today.</b><p>Upload progress photos in Weight to make Today show your first versus latest picture on quiet days.</p><button data-jump="weight" type="button">Add progress photo</button></div>';
}

function renderChecklist() {
  const box = $('#onboardingChecklist');
  if (box) {
    box.classList.add('hidden');
    box.innerHTML = '';
  }
}

function render() {
  applyMode();
  const { spend, value, doses, cost } = inventoryTotals();
  const dose = currentDose();
  $('#statMode').textContent = glpName();
  $('#statDose').textContent = doseText(dose.amount, dose.unit);
  $('#statSpend').textContent = money(spend);
  $('#statValue').textContent = money(value);
  $('#statDoses').textContent = doses;
  $('#statFood').textContent = db.foods.length;
  updateNextInjectionLabel();
  renderToday(spend, value, doses, cost);

  $('#scheduleVial').innerHTML = `<option value="current-glp1">Current GLP-1: ${esc(glpName())} ${esc(doseText())}${isPenMode() ? ' pen' : ''}</option>` + (isPenMode() ? '' : '<option value="">Choose saved vial / pen</option>' + db.vials.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join(''));
  if ($('#schedule')?.classList.contains('active')) prefillSchedule();
  $('#vialList').innerHTML = db.vials.map(v => `<article class="item"><div class="item-head"><b>${esc(v.name)}</b><div class="item-actions"><button onclick="editItem('vials','${v.id}')">Edit</button><button onclick="del('vials','${v.id}')">Delete</button></div></div><div><span class="pill">${itemQuantity(v)} item${itemQuantity(v) === 1 ? '' : 's'}</span><span class="pill">${esc(v.type || 'Item')}</span><span class="pill">${money(v.cost)} total</span><span class="pill">${dosesLeft(v)} doses left</span><span class="pill">${money(costPerDose(v))}/injection</span></div><small>${esc(v.amount ?? v.amountMg ?? 0)} ${esc(v.amountUnit || 'mg')} each | total ${cleanNumber(totalInventoryMcg(v) / 1000)} mg | remaining ${esc(v.remaining ?? v.remainingMg ?? 0)} ${esc(v.remainingUnit || 'mg')} | value ${money(remainingValue(v))} | batch ${esc(v.batch || '-')} | expiry ${esc(v.expiry || '-')}</small><p>${esc(v.notes || '')}</p></article>`).join('') || '<div class="empty">No vials/items yet.</div>';
  $('#scheduleList').innerHTML = [...db.schedule].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(s => `<article class="item"><div class="item-head"><b>${esc(vialName(s.vialId))}</b><div class="item-actions"><button onclick="markSchedule('${s.id}','Taken')">Taken</button><button onclick="editItem('schedule','${s.id}')">Edit</button><button onclick="del('schedule','${s.id}')">Delete</button></div></div><span>${esc(s.date)} ${esc(s.time)} | ${esc(s.amount || s.amountMcg || '-')} ${esc(s.amountUnit || (s.amountMcg ? 'mcg' : 'mg'))} | ${esc(s.site || '-')} | ${esc(s.status)}</span><small>${s.repeatLabel ? esc(s.repeatLabel) + ' | ' : ''}Cost: ${money(s.actualCost || autoCost(s))}</small><p>${esc(s.notes || '')}</p></article>`).join('') || '<div class="empty">No schedule entries.</div>';
  $('#siteSummary').textContent = nextSiteSuggestion();
  renderSiteHistory();
  $('#weightList').innerHTML = [...db.weights].sort((a, b) => b.date.localeCompare(a.date)).map(w => `<article class="item"><div class="item-head"><b>${esc(w.date)}: ${esc(w.weight)}${esc(w.unit)}</b><button onclick="editItem('weights','${w.id}')">Edit</button></div>${w.photo ? `<img class="entry-photo" src="${w.photo}" alt="Progress photo for ${esc(w.date)}">` : ''}<span>Appetite: ${esc(w.appetite || '-')} | Waist: ${esc(w.waist || '-')}</span><p>${esc(w.notes || '')}</p></article>`).join('') || '<div class="empty">No weight entries.</div>';
  renderPhotoGallery();
  renderNutritionSummary();
  $('#foodList').innerHTML = renderFoodDiary();
  $('#symptomList').innerHTML = [...db.symptoms].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).map(s => `<article class="item"><div class="item-head"><b>${esc(s.date)} ${esc(s.time || '')}: ${esc(s.symptom)}</b><button onclick="editItem('symptoms','${s.id}')">Edit</button></div><span>Severity ${esc(s.severity || 0)}/10 | possible trigger: ${esc(s.trigger || '-')}</span><p>${esc(s.notes || '')}</p></article>`).join('') || '<div class="empty">No symptom entries.</div>';
  $('#digestionList').innerHTML = [...db.digestion].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).map(d => `<article class="item"><div class="item-head"><b>${esc(d.date)} ${esc(d.time || '')}: ${esc(d.movement)}</b><button onclick="editItem('digestion','${d.id}')">Edit</button></div><span>${esc(d.bristol || 'Bristol not set')} | discomfort ${esc(d.discomfort || 0)}/10 | ${esc(d.urgency || 'Normal')}</span><small>Hydration ${esc(d.hydration || '-')} | trigger ${esc(d.trigger || '-')}</small><p>${esc(d.notes || '')}</p></article>`).join('') || '<div class="empty">No digestion entries.</div>';
  renderDigestionSummary();
  renderGeminiUsage();
  $('#logList').innerHTML = [...db.logs].sort((a, b) => b.date.localeCompare(a.date)).map(l => `<article class="item"><div class="item-head"><b>${esc(l.date)}</b><button onclick="editItem('logs','${l.id}')">Edit</button></div><span>Appetite ${esc(l.appetite || '-')} | nausea ${esc(l.nausea || '-')} | energy ${esc(l.energy || '-')} | mood ${esc(l.mood || '-')} | ${esc(l.digestion || '-')}</span><p>${esc(l.notes || '')}</p></article>`).join('') || '<div class="empty">No daily logs.</div>';
  $('#doseHistoryList').innerHTML = [...db.doseHistory].sort((a, b) => b.date.localeCompare(a.date)).map(d => `<article class="item"><div class="item-head"><b>${esc(d.date)}: ${esc(glpName(d.glp1))} ${esc(doseText(d.amount, d.unit))}</b><div class="item-actions"><button onclick="editItem('doseHistory','${d.id}')">Edit</button><button onclick="del('doseHistory','${d.id}')">Delete</button></div></div><p>${esc(d.notes || '')}</p></article>`).join('') || '<div class="empty">No dose journey points yet.</div>';
  $('#peptideList').innerHTML = db.peptides.map(p => `<article class="item"><div class="item-head"><b>${esc(p.name)}</b><div class="item-actions"><button onclick="editItem('peptides','${p.id}')">Edit</button><button onclick="del('peptides','${p.id}')">Delete</button></div></div><div><span class="pill">${esc(p.category || 'User-entered')}</span><span class="pill">${esc(doseText(p.amount, p.unit))}</span><span class="pill">${esc(p.frequency || 'No frequency')}</span></div><small>Start ${esc(p.startDate || '-')} | source ${esc(p.source || '-')} | storage ${esc(p.storage || '-')}</small><p>${esc(p.notes || '')}</p></article>`).join('') || '<div class="empty">No other peptides tracked.</div>';
  $('#peptideSymptomList').innerHTML = [...db.peptideSymptoms].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).map(p => `<article class="item"><div class="item-head"><b>${esc(p.date)} ${esc(p.time || '')}: ${esc(p.symptom)}</b><div class="item-actions"><button onclick="editItem('peptideSymptoms','${p.id}')">Edit</button><button onclick="del('peptideSymptoms','${p.id}')">Delete</button></div></div><span>${esc(p.peptides || 'No peptide named')} | severity ${esc(p.severity || 0)}/10 | ${esc(p.timing || 'Timing not set')}</span><p>${esc(p.notes || '')}</p></article>`).join('') || '<div class="empty">No peptide symptom logs yet.</div>';
  $('#peptideInsights').innerHTML = peptideInsights();
  $('#foodInsights').innerHTML = insights();
  renderTrends();
}

function markerId(site) {
  return {
    'Left abdomen': 'markLeftAbdomen',
    'Right abdomen': 'markRightAbdomen',
    'Left thigh': 'markLeftThigh',
    'Right thigh': 'markRightThigh',
    'Left upper arm': 'markLeftUpperArm',
    'Right upper arm': 'markRightUpperArm'
  }[site];
}

function renderSiteHistory() {
  const recent = eightWeekInjections();
  const bySite = Object.fromEntries(siteOrder.map(site => [site, []]));
  const selected = enabledSites();
  $$('#sitePicker input[type="checkbox"]').forEach(input => {
    input.checked = selected.includes(input.value);
  });
  recent.forEach(entry => {
    const site = normaliseSite(entry.site);
    if (bySite[site]) bySite[site].push({ ...entry, site });
  });
  siteOrder.forEach(site => {
    const marker = $('#' + markerId(site));
    const button = $(`.site-marker[data-site="${site}"]`);
    const quickButton = $(`.body-map button[data-site="${site}"]`);
    const latest = bySite[site][0];
    if (marker) marker.textContent = bySite[site].length;
    if (button) {
      button.classList.toggle('has-history', bySite[site].length > 0);
      button.classList.toggle('disabled-site', !selected.includes(site));
      button.style.setProperty('--site-heat', Math.min(1, bySite[site].length / 4));
      button.title = latest ? `${site}: ${vialName(latest.vialId)} ${latest.amount || latest.amountMcg || '-'} ${latest.amountUnit || (latest.amountMcg ? 'mcg' : 'mg')} on ${latest.date}` : site;
    }
    if (quickButton) quickButton.classList.toggle('disabled-site', !selected.includes(site));
  });
  $('#siteHistory').innerHTML = recent.length ? recent.map(s => `<article class="item"><div class="item-head"><b>${esc(normaliseSite(s.site))}</b><span class="pill">${esc(s.date)} ${esc(s.time || '')}</span></div><span>${esc(vialName(s.vialId))} | ${esc(s.amount || s.amountMcg || '-')} ${esc(s.amountUnit || (s.amountMcg ? 'mcg' : 'mg'))}</span><small>${esc(s.notes || '')}</small></article>`).join('') : '<div class="empty">No taken injections in the last 8 weeks.</div>';
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

function peptideInsights() {
  if (!db.peptideSymptoms.length) return 'Add peptide symptom entries to see repeated co-use notes.';
  const counts = {};
  db.peptideSymptoms.forEach(entry => {
    String(entry.peptides || '').split(',').map(x => x.trim()).filter(Boolean).forEach(name => {
      const key = name.toLowerCase();
      counts[key] ||= { name, high: 0, total: 0 };
      counts[key].total++;
      if (num(entry.severity) >= 5) counts[key].high++;
    });
  });
  const rows = Object.values(counts).filter(x => x.total > 0).sort((a, b) => b.high - a.high || b.total - a.total);
  if (!rows.length) return 'Name the peptide(s) used in symptom logs to see repeated co-use notes.';
  return rows.map(x => `<div class="item"><b>${esc(x.name)}</b><span>${x.total} symptom log${x.total === 1 ? '' : 's'}; ${x.high} higher-severity entry${x.high === 1 ? '' : 'ies'}.</span><small>Pattern spotting only: this is not proof of an interaction.</small></div>`).join('');
}

function foodMarkers(food) {
  const markers = [];
  if (food.fatty === 'Yes') markers.push('fatty meals');
  if (food.spicy === 'Yes') markers.push('spicy food');
  if (food.caffeine === 'Yes') markers.push('caffeine');
  const meal = String(food.meal || '').toLowerCase();
  ['coffee', 'alcohol', 'bread', 'pasta', 'rice', 'pizza', 'chocolate', 'dairy', 'milk', 'cheese', 'fried', 'takeaway'].forEach(word => {
    if (meal.includes(word)) markers.push(word);
  });
  return [...new Set(markers)];
}

function trendStrength(count, threshold) {
  if (count >= Math.max(5, threshold + 2)) return 'Strong pattern';
  if (count >= Math.max(3, threshold)) return 'Likely pattern';
  return 'Possible pattern';
}

function buildTrendRows(targets, targetLabel) {
  const threshold = num(db.settings.trendThreshold) || 3;
  const counts = {};
  targets.forEach(target => {
    const sameDayFoods = db.foods.filter(food => food.date === target.date);
    sameDayFoods.forEach(food => {
      foodMarkers(food).forEach(marker => {
        const key = `${marker}::${targetLabel(target)}`;
        counts[key] ||= { marker, outcome: targetLabel(target), count: 0, dates: new Set() };
        if (!counts[key].dates.has(target.date)) {
          counts[key].count++;
          counts[key].dates.add(target.date);
        }
      });
    });
  });
  return Object.values(counts).filter(row => row.count >= threshold).sort((a, b) => b.count - a.count);
}

function renderTrendList(rows, emptyText) {
  const threshold = num(db.settings.trendThreshold) || 3;
  return rows.length ? rows.map(row => `<div class="item"><div class="item-head"><b>${esc(trendStrength(row.count, threshold))}</b><span class="pill">${row.count} matches</span></div><span>${esc(row.marker)} appeared alongside ${esc(row.outcome)} on ${row.count} logged day${row.count === 1 ? '' : 's'}.</span><small>Worth watching, not proof of cause.</small></div>`).join('') : emptyText;
}

function renderTrends() {
  const thresholdControl = $('#trendThresholdControl');
  if (thresholdControl) thresholdControl.value = db.settings.trendThreshold || '3';
  const symptomTargets = db.symptoms.filter(s => num(s.severity) >= 4 && s.symptom);
  const digestionTargets = db.digestion.filter(d => d.movement && d.movement !== 'Normal');
  $('#symptomTrendList').innerHTML = renderTrendList(buildTrendRows(symptomTargets, s => String(s.symptom || 'symptoms').toLowerCase()), `No food/symptom pattern has reached ${db.settings.trendThreshold || 3} matches yet.`);
  $('#digestionTrendList').innerHTML = renderTrendList(buildTrendRows(digestionTargets, d => String(d.movement || 'digestion changes').toLowerCase()), `No food/digestion pattern has reached ${db.settings.trendThreshold || 3} matches yet.`);
}

function renderPhotoGallery() {
  const photos = [...db.weights].filter(w => w.photo).sort((a, b) => b.date.localeCompare(a.date));
  $('#photoGallery').innerHTML = photos.length ? photos.map(w => `<figure><img src="${w.photo}" alt="Progress photo ${esc(w.date)}"><figcaption>${esc(w.date)} | ${esc(w.weight)}${esc(w.unit)}</figcaption></figure>`).join('') : '<div class="empty">No progress photos yet.</div>';
}

function weightKg(value, unit) {
  const n = num(value);
  if (!n) return 0;
  return unit === 'st' ? n * 6.35029 : n;
}

function latestWeightKg() {
  const weights = [...db.weights].filter(w => num(w.weight)).sort((a, b) => b.date.localeCompare(a.date));
  const latest = weights[0];
  if (latest) return weightKg(latest.weight, latest.unit || db.settings.units || 'kg');
  return weightKg(db.settings.startWeight, db.settings.units || 'kg');
}

function bmrProfile() {
  const kg = latestWeightKg();
  const cm = heightCmValue();
  const age = num(db.settings.age);
  if (!kg || !cm || !age) return null;
  const sexOffset = db.settings.gender === 'male' ? 5 : db.settings.gender === 'female' ? -161 : -78;
  const bmr = (10 * kg) + (6.25 * cm) - (5 * age) + sexOffset;
  const activity = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 }[db.settings.activityLevel || 'light'] || 1.375;
  const tdee = bmr * activity;
  const targets = { slow: Math.max(1000, tdee - 250), medium: Math.max(1000, tdee - 500), aggressive: Math.max(1000, tdee - 750) };
  return { bmr, tdee, targets, selected: db.settings.caloriePace || 'medium' };
}

function dailyFoodTotals(date) {
  return db.foods.filter(f => f.date === date).reduce((sum, f) => ({
    calories: sum.calories + num(f.calories),
    protein: sum.protein + num(f.protein),
    carbs: sum.carbs + num(f.carbs),
    fat: sum.fat + num(f.fat),
    count: sum.count + 1
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 });
}

function renderNutritionSummary() {
  const box = $('#nutritionSummary');
  if (!box) return;
  const profile = bmrProfile();
  const totals = dailyFoodTotals(today());
  if (!profile) {
    box.innerHTML = 'Add age, height, weight and activity level in onboarding or Settings to calculate BMR and calorie targets.';
    return;
  }
  const target = profile.targets[profile.selected] || profile.targets.medium;
  const left = target - totals.calories;
  box.innerHTML = `<div class="nutrition-summary"><div class="nutrition-hero"><span>Today</span><b>${Math.round(totals.calories)} / ${Math.round(target)} kcal</b><small>${left >= 0 ? `${Math.round(left)} kcal remaining` : `${Math.abs(Math.round(left))} kcal over target`}</small></div><div class="result-grid nutrition-grid"><div><span>BMR</span><b>${Math.round(profile.bmr)} kcal</b></div><div><span>Maintenance</span><b>${Math.round(profile.tdee)} kcal</b></div><div><span>Protein</span><b>${cleanNumber(totals.protein)}g</b></div><div><span>Carbs</span><b>${cleanNumber(totals.carbs)}g</b></div><div><span>Fat</span><b>${cleanNumber(totals.fat)}g</b></div><div><span>Selected pace</span><b>${esc(profile.selected)}</b></div></div><div class="nutrition-targets"><span>Slow ${Math.round(profile.targets.slow)}</span><span>Medium ${Math.round(profile.targets.medium)}</span><span>Aggressive ${Math.round(profile.targets.aggressive)}</span></div><p class="fine-print">Uses Mifflin-St Jeor BMR plus your activity level. Planning estimate only, not medical advice.</p></div>`;
}

function renderFoodDiary() {
  if (!db.foods.length) return '<div class="empty">No food entries.</div>';
  const groups = {};
  db.foods.forEach(food => {
    const date = food.date || today();
    groups[date] = groups[date] || [];
    groups[date].push(food);
  });
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])).map(([date, foods]) => {
    const totals = dailyFoodTotals(date);
    const entries = foods.sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(renderFoodEntry).join('');
    return `<article class="item food-day"><div class="item-head"><b>${esc(date)}</b><span class="pill">${totals.count} entr${totals.count === 1 ? 'y' : 'ies'}</span></div><div><span class="pill">${Math.round(totals.calories)} kcal</span><span class="pill">${cleanNumber(totals.protein)}g protein</span><span class="pill">${cleanNumber(totals.carbs)}g carbs</span><span class="pill">${cleanNumber(totals.fat)}g fat</span></div><div class="food-day-entries">${entries}</div></article>`;
  }).join('');
}

function renderFoodEntry(f) {
  const macroBits = [
    f.calories ? `${esc(f.calories)} kcal` : '',
    f.protein ? `P ${esc(f.protein)}g` : '',
    f.carbs ? `C ${esc(f.carbs)}g` : '',
    f.fat ? `F ${esc(f.fat)}g` : ''
  ].filter(Boolean);
  return `<article class="item food-entry"><div class="item-head"><b>${esc(f.time || '')} ${esc(f.mealType || f.portion || 'Meal')}: ${esc(f.meal)}</b><div class="item-actions"><button onclick="editItem('foods','${f.id}')">Edit</button><button onclick="del('foods','${f.id}')">Delete</button></div></div>${f.photo ? `<img class="entry-photo meal-entry-photo" src="${f.photo}" alt="Meal photo for ${esc(f.meal)}">` : ''}<div>${macroBits.map(bit => `<span class="pill">${bit}</span>`).join('')}<span class="pill">${esc(f.portion || 'Meal')}</span><span class="pill">fatty ${esc(f.fatty || 'No')}</span><span class="pill">spicy ${esc(f.spicy || 'No')}</span><span class="pill">caffeine ${esc(f.caffeine || 'No')}</span>${f.confidence ? `<span class="pill">${esc(f.confidence)} confidence</span>` : ''}</div>${f.items ? `<small>Detected: ${esc(f.items)}</small>` : ''}${f.source ? `<small>${esc(f.source)}</small>` : ''}<p>${esc(f.notes || '')}</p></article>`;
}

function renderDigestionSummary() {
  const counts = {};
  db.digestion.forEach(d => {
    counts[d.date] = (counts[d.date] || 0) + 1;
  });
  const rows = Object.entries(counts).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  $('#digestionSummary').innerHTML = rows.length ? rows.map(([date, count]) => `<div class="prompt"><b>${esc(String(count))}</b><span>${esc(date)} toilet visit${count === 1 ? '' : 's'} logged</span></div>`).join('') : 'Add toilet visits to see daily frequency.';
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

function renderMealIdea(idea, source = 'Built-in fallback') {
  idea.note = nonQuestionNote(idea.note, 'Assumes a practical home-style portion.');
  $('#mealIdeaResult').innerHTML = `<b>${esc(idea.title)}</b><p>${esc(idea.swap)}</p><b>Ingredients</b><ul>${idea.ingredients.map(i => `<li>${esc(i)}</li>`).join('')}</ul><b>Recipe</b><ol>${idea.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>${idea.note ? `<p class="fine-print">${esc(idea.note)}</p>` : ''}<small>${esc(source)}</small>`;
}

function geminiUsageCost(model, usage = {}) {
  const prices = geminiPricesUsd[model] || geminiPricesUsd[AI_MODEL];
  const promptTokens = num(usage.promptTokenCount);
  const outputTokens = Math.max(num(usage.candidatesTokenCount) + num(usage.thoughtsTokenCount), num(usage.totalTokenCount) - promptTokens, 0);
  const costUsd = (promptTokens / 1000000) * prices.input + (outputTokens / 1000000) * prices.output;
  return { promptTokens, outputTokens, totalTokens: promptTokens + outputTokens, costUsd };
}

function recordGeminiUsage(model, usage) {
  const cost = geminiUsageCost(model, usage);
  db.geminiUsage.unshift({ id: id(), date: new Date().toISOString(), model, ...cost });
  db.geminiUsage = db.geminiUsage.slice(0, 100);
  return cost;
}

function sameUtcDay(a, b = new Date()) {
  const date = new Date(a);
  return date.getUTCFullYear() === b.getUTCFullYear() && date.getUTCMonth() === b.getUTCMonth() && date.getUTCDate() === b.getUTCDate();
}

function geminiBillingSummary() {
  const todayRows = db.geminiUsage.filter(row => sameUtcDay(row.date));
  return {
    usedToday: todayRows.length,
    billableTodayCost: todayRows.reduce((sum, row) => sum + num(row.costUsd), 0),
    trackedCost: db.geminiUsage.reduce((sum, row) => sum + num(row.costUsd), 0)
  };
}

function renderGeminiUsage() {
  let box = $('#geminiCostBox');
  if (!box && $('#geminiStatus')) {
    box = document.createElement('div');
    box.id = 'geminiCostBox';
    box.className = 'result muted';
    $('#geminiStatus').insertAdjacentElement('afterend', box);
  }
  if (!box) return;
  const last = db.geminiUsage[0];
  const calls = db.geminiUsage.length;
  const model = AI_WORKER_URL ? AI_MODEL : 'Built-in fallback';
  const prices = geminiPricesUsd[AI_MODEL];
  const keyMode = AI_WORKER_URL ? 'Private Worker active. No AI key is stored in the app or browser.' : 'No Worker active; fallback suggestions will be used.';
  const billing = geminiBillingSummary();
  box.innerHTML = `<b>Anthropic cost estimate</b><div class="result-grid"><div><span>Last estimate</span><b>${last ? usd(last.costUsd) : '$0.0000'}</b></div><div><span>Today estimate</span><b>${usd(billing.billableTodayCost)}</b></div><div><span>Tracked total</span><b>${usd(billing.trackedCost)}</b></div><div><span>Tracked calls</span><b>${calls}</b></div><div><span>Last input tokens</span><b>${last ? cleanNumber(last.promptTokens) : '0'}</b></div><div><span>Last output tokens</span><b>${last ? cleanNumber(last.outputTokens) : '0'}</b></div><div><span>${esc(model)} rates</span><b>$${prices.input}/M in | $${prices.output}/M out</b></div></div><p class="fine-print">${esc(keyMode)} Anthropic has no free request allowance in this calculator. Estimates use returned Claude token counts and may differ from the final invoice after credits, taxes or provider-side billing rules.</p>`;
}

function geminiPrompt(craving, preference) {
  return `You are helping a GLP-1 user choose a practical food swap. Do not give medical advice. Suggest one healthier alternative and a simple recipe. The user wants: ${craving}. Preference: ${preference}. Make reasonable assumptions from the request and do not ask follow-up questions. Make it realistic, satisfying, higher protein where suitable, gentle on nausea/reflux where suitable, and avoid moralising language. Return compact JSON only with keys: title, swap, ingredients (array of 5-8 strings), steps (array of 4-6 strings), note. The note must be a short useful caution or assumption, never a question.`;
}

function mealPhotoPrompt(context, mealType) {
  return `You are estimating a food log for a GLP-1 user from a meal photo. Be useful but cautious: photo calorie estimates are approximate and the user must review before saving. Look for hidden calorie sources like oil, butter, sauces, cheese, nuts, sugar drinks, alcohol, and large portions. Context from user: ${context || 'none'}. Meal type: ${mealType || 'Meal'}. Make reasonable assumptions from the image and context. Do not ask follow-up questions and do not tell the user to answer anything. Return compact JSON only with keys: meal, items (array of strings), calories, protein, carbs, fat, fatty (Yes/No), spicy (Yes/No), caffeine (Yes/No), confidence (Low/Medium/High), glpNotes, reviewPrompt. If unsure, choose conservative ranges collapsed to one reasonable midpoint and explain uncertainty in glpNotes. reviewPrompt must be a short non-question instruction such as "Review hidden oils, sauces and portion size before saving."`;
}

function dataUrlParts(dataUrl) {
  const [meta, data] = String(dataUrl || '').split(',');
  return { mimeType: meta.match(/data:(.*?);base64/)?.[1] || 'image/jpeg', data: data || '' };
}

async function callAiWorker(path, payload) {
  if (!AI_WORKER_URL) throw new Error('AI Worker not configured');
  const res = await fetch(`${AI_WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`AI Worker returned unreadable data: ${text.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(data.error || data.message || `AI Worker ${res.status}`);
  return data;
}

function fallbackMealEstimate(context, mealType, photo) {
  const q = String(context || '').toLowerCase();
  const estimate = { meal: context || `${mealType || 'Meal'} photo`, items: [], calories: 450, protein: 25, carbs: 45, fat: 18, fatty: 'No', spicy: 'No', caffeine: 'No', confidence: photo ? 'Low' : 'Low', glpNotes: 'Basic fallback estimate only using visible/context clues.', reviewPrompt: 'Review hidden oils, sauces and portion size before saving.' };
  if (q.includes('pizza')) Object.assign(estimate, { meal: 'Pizza meal', items: ['pizza'], calories: 700, protein: 28, carbs: 78, fat: 30, fatty: 'Yes' });
  else if (q.includes('burger')) Object.assign(estimate, { meal: 'Burger meal', items: ['burger'], calories: 750, protein: 35, carbs: 65, fat: 38, fatty: 'Yes' });
  else if (q.includes('salad')) Object.assign(estimate, { meal: 'Salad meal', items: ['salad', 'dressing'], calories: 420, protein: 25, carbs: 25, fat: 24 });
  else if (q.includes('coffee')) Object.assign(estimate, { meal: 'Coffee / drink', items: ['coffee'], calories: 80, protein: 4, carbs: 8, fat: 3, caffeine: 'Yes' });
  if (q.includes('spicy') || q.includes('chilli') || q.includes('curry')) estimate.spicy = 'Yes';
  if (q.includes('fried') || q.includes('chips') || q.includes('fries') || q.includes('cream') || q.includes('cheese')) estimate.fatty = 'Yes';
  return estimate;
}

function nonQuestionNote(text, fallback) {
  const value = String(text || '').trim();
  if (!value || value.includes('?')) return fallback;
  return value;
}

async function generateGeminiMealPhoto(photoDataUrl, context, mealType) {
  const image = dataUrlParts(photoDataUrl);
  if (!image.data) throw new Error('No meal photo selected');
  const data = await callAiWorker('/meal-photo', { photo: image, context, mealType });
  return { ...data, usageMetadata: data.usageMetadata || {} };
}

function renderMealReview(estimate, photo, source, context, mealType) {
  estimate.glpNotes = nonQuestionNote(estimate.glpNotes, 'Estimate uses visible food and provided context only.');
  estimate.reviewPrompt = nonQuestionNote(estimate.reviewPrompt, 'Review hidden oils, sauces and portion size before saving.');
  $('#mealScanResult').innerHTML = `<form id="mealReviewForm" class="meal-review form-grid">
    <label>Meal name<input name="meal" value="${esc(estimate.meal || context || mealType || 'Meal')}" required></label>
    <label>Calories<input name="calories" type="number" min="0" step="1" value="${esc(estimate.calories || '')}"></label>
    <label>Protein (g)<input name="protein" type="number" min="0" step="1" value="${esc(estimate.protein || '')}"></label>
    <label>Carbs (g)<input name="carbs" type="number" min="0" step="1" value="${esc(estimate.carbs || '')}"></label>
    <label>Fat (g)<input name="fat" type="number" min="0" step="1" value="${esc(estimate.fat || '')}"></label>
    <label>Meal type<select name="mealType">${['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink', 'Meal'].map(type => `<option${type === mealType ? ' selected' : ''}>${type}</option>`).join('')}</select></label>
    <label>Portion<select name="portion"><option>Normal</option><option>Small</option><option>Large</option><option>Custom</option></select></label>
    <label>Fatty?<select name="fatty"><option${estimate.fatty === 'No' ? ' selected' : ''}>No</option><option${estimate.fatty === 'Yes' ? ' selected' : ''}>Yes</option></select></label>
    <label>Spicy?<select name="spicy"><option${estimate.spicy === 'No' ? ' selected' : ''}>No</option><option${estimate.spicy === 'Yes' ? ' selected' : ''}>Yes</option></select></label>
    <label>Caffeine?<select name="caffeine"><option${estimate.caffeine === 'No' ? ' selected' : ''}>No</option><option${estimate.caffeine === 'Yes' ? ' selected' : ''}>Yes</option></select></label>
    <label>Confidence<select name="confidence"><option${estimate.confidence === 'Low' ? ' selected' : ''}>Low</option><option${estimate.confidence === 'Medium' ? ' selected' : ''}>Medium</option><option${estimate.confidence === 'High' ? ' selected' : ''}>High</option></select></label>
    <label class="wide">Detected foods<textarea name="items" rows="2">${esc((estimate.items || []).join(', '))}</textarea></label>
    <label class="wide">Notes<textarea name="notes" rows="3">${esc([estimate.glpNotes, estimate.reviewPrompt].filter(Boolean).join(' '))}</textarea></label>
    <input name="photo" type="hidden" value="${esc(photo)}">
    <input name="source" type="hidden" value="${esc(source)}">
    <button class="primary">Save reviewed meal</button>
  </form><p class="fine-print">Review carefully. Photo estimates can miss oils, sauces, drinks, portion size and ingredients hidden under food.</p>`;
  $('#mealReviewForm').addEventListener('submit', e => {
    e.preventDefault();
    const data = formObj(e.target);
    db.foods.push({ ...data, id: id(), date: today(), aiReviewed: 'Yes' });
    $('#mealPhotoForm').reset();
    $('#mealPhotoPreview').innerHTML = 'No meal photo selected.';
    $('#mealScanResult').textContent = 'Meal saved. Snap another meal whenever you are ready.';
    feedback('save');
    save();
  });
}

async function estimateMealFromPhoto(form) {
  const file = form.elements.mealPhoto.files[0];
  const context = form.elements.mealContext.value.trim();
  const mealType = form.elements.mealType.value;
  $('#mealScanResult').textContent = 'Reviewing meal photo...';
  let photo = '';
  if (file) photo = await compressPhoto(file);
  try {
    if (!photo) throw new Error('No photo selected');
    const estimate = await generateGeminiMealPhoto(photo, context, mealType);
    const cost = recordGeminiUsage(AI_MODEL, estimate.usageMetadata);
    const { usageMetadata, ...cleanEstimate } = estimate;
    $('#geminiStatus').textContent = `Meal photo estimated with Claude Sonnet via Worker. Raw API estimate: ${usd(cost.costUsd)}.`;
    renderMealReview(cleanEstimate, photo, 'Claude Sonnet photo estimate', context, mealType);
  } catch (err) {
    const estimate = fallbackMealEstimate(context, mealType, photo);
    estimate.glpNotes = `${estimate.glpNotes} AI was not used: ${String(err.message || err).slice(0, 90)}.`;
    renderMealReview(estimate, photo, 'Basic fallback estimate', context, mealType);
  }
}

async function generateGeminiMeal(craving, preference) {
  const data = await callAiWorker('/food-swap', { craving, preference });
  if (!data.title || !data.ingredients || !data.steps) throw new Error('AI response was incomplete');
  return { title: data.title, swap: data.swap || data.note || '', ingredients: data.ingredients, steps: data.steps, usageMetadata: data.usageMetadata || {} };
}

window.del = (key, itemId) => {
  db[key] = db[key].filter(x => x.id !== itemId);
  feedback('save');
  save();
};

window.markSchedule = (itemId, status) => {
  const item = db.schedule.find(x => x.id === itemId);
  if (!item) return;
  item.status = status;
  if (!item.time) item.time = new Date().toTimeString().slice(0, 5);
  feedback('save');
  save();
};

window.editItem = (key, itemId) => {
  const item = db[key]?.find(x => x.id === itemId);
  if (!item) return;
  const notes = prompt('Edit notes', item.notes || '');
  if (notes === null) return;
  item.notes = notes;
  feedback('save');
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

function expandSchedule(data) {
  data.site = normaliseSite(data.site);
  const repeatEnabled = data.repeatEnabled === 'on';
  const count = repeatEnabled ? Math.min(52, Math.max(1, Math.floor(num(data.repeatCount) || 1))) : 1;
  const stepDays = data.repeatEvery === 'daily' ? 1 : 7;
  const baseDate = new Date(data.date + 'T00:00:00');
  const groupId = repeatEnabled ? id() : '';
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + index * stepDays);
    const { repeatEnabled, repeatEvery, repeatCount, ...entry } = data;
    return {
      ...entry,
      date: date.toISOString().slice(0, 10),
      status: repeatEnabled && index > 0 && data.status === 'Taken' ? 'Planned' : data.status,
      id: id(),
      repeatGroupId: groupId,
      repeatLabel: count > 1 ? `${data.repeatEvery} ${index + 1}/${count}` : ''
    };
  });
}

function normaliseFood(data) {
  return {
    ...data,
    source: data.source || 'Manual entry',
    mealType: data.mealType || data.portion || 'Meal'
  };
}

function bindForm(idName, collection, normalise = data => data) {
  $(`#${idName}`).addEventListener('submit', e => {
    e.preventDefault();
    db[collection].push({ ...normalise(formObj(e.target)), id: id() });
    e.target.reset();
    setTodayDefaults();
    feedback('save');
    save();
  });
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 900;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

$('#settingsGlp1').addEventListener('change', e => {
  populateDoseSelect(e.target.value);
  $('#settingsCustomDose').value = '';
});

$('#onboardingGlp1').addEventListener('change', e => {
  $('#onboardingDose').innerHTML = (glp1Options[e.target.value]?.doses || []).map(d => `<option value="${d}">${d} mg</option>`).join('');
});

$('#onboardingForm').elements.mode.addEventListener('change', e => syncModePanels(e.target.value));
$('#settingsForm').elements.mode.addEventListener('change', e => syncModePanels(e.target.value));

$('#onboardingForm').addEventListener('submit', e => {
  e.preventDefault();
  const data = formObj(e.target);
  const settingsData = { ...data };
  db.settings = { ...db.settings, ...settingsData, onboarded: true };
  if (settingsData.startWeight) {
    db.weights.unshift({ id: id(), date: settingsData.startDate || today(), weight: settingsData.startWeight, unit: settingsData.units || 'kg', appetite: 'Normal', notes: 'Starting weight from onboarding' });
  }
  persistDb();
  hydrateSettings();
  switchView('today');
  feedback('save');
  render();
  returnToMainTop('today');
});

$('#settingsForm').addEventListener('submit', e => {
  e.preventDefault();
  db.settings = { ...db.settings, ...formObj(e.target) };
  db.settings.onboarded = true;
  persistDb();
  $('#settingsSaved').textContent = 'Saved';
  setTimeout(() => $('#settingsSaved').textContent = '', 1800);
  hydrateSettings();
  applyTheme();
  feedback('save');
  render();
  returnToMainTop('today');
});

bindForm('vialForm', 'vials', normaliseVialForm);
$('#scheduleForm').addEventListener('submit', e => {
  e.preventDefault();
  db.schedule.push(...expandSchedule(formObj(e.target)));
  e.target.reset();
  setTodayDefaults();
  feedback('save');
  save();
});
$('#weightForm').addEventListener('submit', async e => {
  e.preventDefault();
  const data = formObj(e.target);
  const file = e.target.elements.photo.files[0];
  if (file) data.photo = await compressPhoto(file);
  db.weights.push({ ...data, id: id() });
  e.target.reset();
  setTodayDefaults();
  feedback('save');
  save();
});
bindForm('foodForm', 'foods', normaliseFood);
bindForm('symptomForm', 'symptoms');
bindForm('digestionForm', 'digestion');
bindForm('logForm', 'logs');
bindForm('doseHistoryForm', 'doseHistory');
bindForm('peptideForm', 'peptides');
bindForm('peptideSymptomForm', 'peptideSymptoms');

$('#trendThresholdControl').addEventListener('change', e => {
  db.settings.trendThreshold = e.target.value;
  $('#settingsForm').elements.trendThreshold.value = e.target.value;
  feedback('save');
  save();
});

$('#mealIdeaForm').addEventListener('submit', e => {
  e.preventDefault();
  makeMealIdea(formObj(e.target));
});

async function makeMealIdea(data) {
  db.lastMealRequest = data;
  $('#mealIdeaResult').textContent = 'Building suggestion...';
  try {
    const idea = await generateGeminiMeal(data.craving, data.preference);
    const cost = recordGeminiUsage(AI_MODEL, idea.usageMetadata);
    const { usageMetadata, ...savedIdea } = idea;
    db.foodIdeas.push({ ...data, ...savedIdea, id: id(), date: today(), source: 'Claude Sonnet via Worker', costUsd: cost.costUsd });
    const costLabel = `estimated cost ${usd(cost.costUsd)}`;
    renderMealIdea(savedIdea, `Claude Sonnet via Worker | ${costLabel}`);
    $('#geminiStatus').textContent = `AI Worker generated the latest suggestion: ${costLabel}.`;
  } catch (err) {
    const idea = suggestMeal(data.craving, data.preference);
    db.foodIdeas.push({ ...data, ...idea, id: id(), date: today(), source: 'Built-in fallback', fallbackReason: String(err.message || err) });
    renderMealIdea(idea, `Built-in fallback: ${String(err.message || err).slice(0, 90)}`);
    $('#geminiStatus').textContent = 'Used built-in fallback. The AI Worker may be missing, over quota, blocked by billing, or unavailable.';
  }
  feedback('save');
  save();
}

$('#regenerateMeal').addEventListener('click', () => {
  const formData = formObj($('#mealIdeaForm'));
  const data = formData.craving ? formData : db.lastMealRequest;
  if (!data?.craving) {
    $('#mealIdeaResult').textContent = 'Enter a craving first.';
    return;
  }
  makeMealIdea(data);
});

$('#geminiForm').addEventListener('submit', e => {
  e.preventDefault();
  const data = formObj(e.target);
  db.gemini = { apiKey: data.geminiApiKey, model: data.geminiModel, useGemini: data.useGemini };
  db.geminiFreeDailyRequests = data.geminiFreeDailyRequests || '0';
  $('#geminiStatus').textContent = AI_WORKER_URL ? 'AI Worker is configured. No browser API key is needed.' : 'No AI Worker configured. Built-in fallback will be used.';
  feedback('save');
  save();
});

$('#clearGeminiKey').addEventListener('click', () => {
  db.gemini = { ...db.gemini, apiKey: '' };
  hydrateSettings();
  $('#geminiStatus').textContent = AI_WORKER_URL ? 'AI Worker is configured. No browser API key is needed.' : 'Browser key cleared. Built-in fallback will be used.';
  feedback('save');
  save();
});

function formatBase(value, family) {
  if (family === 'iu') return `${cleanNumber(value)} IU`;
  return value >= 1000 ? `${cleanNumber(value / 1000)} mg` : `${cleanNumber(value)} mcg`;
}

function setSyringeVisual(units, syringeUnits) {
  const pct = Math.max(0, Math.min(100, (units / syringeUnits) * 100));
  $('#syringeVisual .syringe-fill').style.width = pct + '%';
  $('#syringeVisual span').textContent = `${cleanNumber(units)} / ${syringeUnits} units`;
}

$$('.quick-row button[data-water]').forEach(btn => btn.addEventListener('click', () => {
  $('#calcWater').value = btn.dataset.water;
  $('#calcWaterUnit').value = 'ml';
  $$('.quick-row button[data-water]').forEach(item => item.classList.toggle('selected', item === btn));
}));

$('#calcBtn').addEventListener('click', () => {
  const vial = baseAmount($('#calcAmount').value, $('#calcAmountUnit').value);
  const dose = baseAmount($('#calcDose').value, $('#calcDoseUnit').value);
  const waterMl = ml($('#calcWater').value, $('#calcWaterUnit').value);
  const syringeUnits = num($('#calcSyringe').value) || 100;
  const rounding = num($('#calcRounding').value) || 0.1;
  if (!vial.value || !waterMl || !dose.value) {
    $('#calcResult').textContent = 'Enter all three values.';
    setSyringeVisual(0, syringeUnits);
    return;
  }
  if (vial.family !== dose.family) {
    $('#calcResult').innerHTML = 'Vial amount and desired dose must use compatible units. Use mg/mcg together, or IU/IU together.';
    setSyringeVisual(0, syringeUnits);
    return;
  }
  const concentrationPerMl = vial.value / waterMl;
  const perUnit = concentrationPerMl / 100;
  const doseMl = dose.value / concentrationPerMl;
  const rawUnits = doseMl * 100;
  const roundedUnits = Math.round(rawUnits / rounding) * rounding;
  const roundedDose = roundedUnits * perUnit;
  const doseDiff = dose.value ? ((roundedDose - dose.value) / dose.value) * 100 : 0;
  const dosesPerVial = vial.value / dose.value;
  const fits = rawUnits <= syringeUnits;
  const label = vial.family === 'iu' ? 'IU' : 'mcg';
  const concentrationLine = vial.family === 'iu'
    ? `${cleanNumber(concentrationPerMl)} IU/ml`
    : `${cleanNumber(concentrationPerMl / 1000)} mg/ml (${cleanNumber(concentrationPerMl)} mcg/ml)`;
  const notes = [
    fits ? `Fits selected syringe (${syringeUnits} units).` : `Draw is larger than the selected ${syringeUnits}-unit syringe.`,
    Math.abs(doseDiff) > 2 ? `Rounded draw changes the dose by ${doseDiff.toFixed(1)}%. Consider a different water amount or rounding precision.` : 'Rounded draw is close to the requested dose.',
    rawUnits < 2 ? 'Very small draw volume: measurement may be hard to read on many syringes.' : '',
    rawUnits > 80 && syringeUnits === 100 ? 'Large draw volume: some users prefer a stronger concentration if appropriate for their setup.' : ''
  ].filter(Boolean);
  $('#calcResult').innerHTML = `<div class="result-grid"><div><span>Concentration</span><b>${concentrationLine}</b></div><div><span>Per U-100 unit</span><b>${cleanNumber(perUnit)} ${label}</b></div><div><span>Draw volume</span><b>${doseMl.toFixed(4)} ml</b></div><div><span>Syringe draw</span><b>${cleanNumber(rawUnits)} units</b></div><div><span>Rounded draw</span><b>${cleanNumber(roundedUnits)} units</b></div><div><span>Rounded amount</span><b>${formatBase(roundedDose, vial.family)}</b></div><div><span>Doses per vial</span><b>${cleanNumber(dosesPerVial)}</b></div><div><span>Remaining after one dose</span><b>${formatBase(vial.value - dose.value, vial.family)}</b></div></div><div class="calc-notes">${notes.map(n => `<p>${esc(n)}</p>`).join('')}</div>`;
  setSyringeVisual(rawUnits, syringeUnits);
});

$$('.body-map button, .site-marker').forEach(b => b.addEventListener('click', () => {
  $('#selectedSite').textContent = b.dataset.site + ' copied to schedule.';
  $('#siteInput').value = b.dataset.site;
}));

$('#sitePicker').addEventListener('change', e => {
  if (!e.target.matches('input[type="checkbox"]')) return;
  db.settings.enabledSites = $$('#sitePicker input[type="checkbox"]:checked').map(input => input.value);
  feedback('save');
  save();
});

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

$('#exportJson').addEventListener('click', () => {
  db.lastBackupTest = new Date().toISOString();
  persistDb();
  render();
  download('vialwise-backup.json', JSON.stringify(db, null, 2));
});
$('#testBackup').addEventListener('click', () => {
  try {
    const copy = JSON.parse(JSON.stringify(db));
    const required = ['settings', 'schedule', 'foods', 'symptoms', 'logs', 'vials', 'peptides'];
    const missing = required.filter(key => !(key in copy));
    db.lastBackupTest = new Date().toISOString();
    $('#backupHealth').innerHTML = missing.length ? `Backup structure warning: missing ${missing.map(esc).join(', ')}.` : `Backup health looks good. Last checked ${new Date(db.lastBackupTest).toLocaleString()}.`;
    feedback('save');
    save();
  } catch {
    $('#backupHealth').textContent = 'Backup health test failed.';
  }
});
$('#exportCsv').addEventListener('click', () => {
  const rows = ['section,date,name,amount,cost,notes'];
  db.vials.forEach(v => rows.push(['vial', '', v.name, `${itemQuantity(v)} x ${v.amount || v.amountMg || ''}${v.amountUnit || 'mg'}`, v.cost || 0, v.notes || ''].map(csvCell).join(',')));
  db.schedule.forEach(s => rows.push(['schedule', s.date, vialName(s.vialId), `${s.amount || s.amountMcg || ''}${s.amountUnit || 'mg'}`, s.actualCost || autoCost(s), s.notes || ''].map(csvCell).join(',')));
  db.doseHistory.forEach(d => rows.push(['dose_history', d.date, glpName(d.glp1), `${d.amount}${d.unit}`, '', d.notes || ''].map(csvCell).join(',')));
  db.foods.forEach(f => rows.push(['food', f.date, f.meal, `${f.mealType || f.portion || 'Meal'} | ${f.calories || 0} kcal | P ${f.protein || 0}g C ${f.carbs || 0}g F ${f.fat || 0}g`, '', f.notes || ''].map(csvCell).join(',')));
  db.symptoms.forEach(s => rows.push(['symptom', s.date, s.symptom, `severity ${s.severity || 0}`, '', s.notes || ''].map(csvCell).join(',')));
  db.digestion.forEach(d => rows.push(['digestion', d.date, d.movement, `frequency ${d.frequency || 0}`, '', d.notes || ''].map(csvCell).join(',')));
  db.peptides.forEach(p => rows.push(['peptide', p.startDate || '', p.name, `${p.amount || ''}${p.unit || ''}`, '', p.notes || ''].map(csvCell).join(',')));
  db.peptideSymptoms.forEach(p => rows.push(['peptide_symptom', p.date, p.peptides || p.symptom, `severity ${p.severity || 0}`, '', p.notes || ''].map(csvCell).join(',')));
  db.weights.forEach(w => rows.push(['weight', w.date, 'weight', `${w.weight}${w.unit}`, '', w.notes || ''].map(csvCell).join(',')));
  download('vialwise-summary.csv', rows.join('\n'), 'text/csv');
});

$('#importJson').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    db = normaliseDb(imported);
    persistDb();
    hydrateSettings();
    render();
    alert('Backup restored.');
  } catch {
    alert('That backup could not be read.');
  } finally {
    e.target.value = '';
  }
});

$('#sampleBtn')?.addEventListener('click', () => {
  db.settings = { ...db.settings, mode: 'vials', glp1: 'semaglutide', currentDose: '0.25', customDose: '', doseUnit: 'mg', penCost: '120', penDoses: '4' };
  db.vials = [{ id: 'v1', name: 'Semaglutide 5mg vials', type: 'GLP-1', quantity: '2', amount: '5', amountUnit: 'mg', water: '10', waterUnit: 'units', remaining: '8.5', remainingUnit: 'mg', dose: '0.25', doseUnit: 'mg', cost: '85', batch: 'Demo', expiry: '2026-12-01', notes: 'Demo: 2 x 5mg vials' }];
  db.schedule = [{ id: 's1', vialId: 'v1', date: today(), time: '09:00', amount: '0.25', amountUnit: 'mg', site: 'Left abdomen', status: 'Planned', notes: 'Demo entry' }];
  db.doseHistory = [{ id: 'd1', date: today(), glp1: 'semaglutide', amount: '0.25', unit: 'mg', notes: 'Demo start point' }];
  db.foods = [{ id: 'f1', date: today(), meal: 'Coffee and toast', portion: 'Small', fatty: 'No', spicy: 'No', caffeine: 'Yes', notes: 'Demo food entry' }];
  db.symptoms = [{ id: 'y1', date: today(), time: '11:00', symptom: 'Mild nausea', severity: '3', trigger: 'Coffee', notes: 'Demo symptom entry' }];
  db.digestion = [{ id: 'g1', date: today(), time: '08:00', movement: 'Normal', frequency: '1', bristol: 'Type 4 - smooth sausage', discomfort: '0', hydration: 'Normal', trigger: '', notes: 'Demo digestion entry' }];
  db.peptides = [{ id: 'p1', name: 'Example peptide', category: 'Recovery', amount: '1', unit: 'mg', frequency: 'User-entered', startDate: today(), source: 'Demo', storage: 'Label instructions', notes: 'Demo only' }];
  db.peptideSymptoms = [{ id: 'ps1', date: today(), time: '20:00', peptides: 'Example peptide', symptom: 'Sleep quality changed', severity: '2', timing: 'Same day', notes: 'Demo only' }];
  hydrateSettings();
  save();
});

$('#clearBtn').addEventListener('click', () => {
  if (confirm('Clear all local VialWise data?')) {
    localStorage.removeItem(KEY);
    OLD_KEYS.forEach(k => localStorage.removeItem(k));
    idbSet(KEY, null);
    location.reload();
  }
});

async function restoreDurableDb() {
  const stored = await idbGet(KEY);
  if (!stored) {
    updateStorageStatus();
    return;
  }
  const durable = normaliseDb(stored);
  const durableTime = Date.parse(durable.updatedAt || '');
  const currentTime = Date.parse(db.updatedAt || '');
  const currentHasData = db.settings?.onboarded || db.schedule.length || db.foods.length || db.weights.length || db.vials.length;
  if (!currentHasData || (durableTime && durableTime > currentTime)) {
    db = durable;
    hydrateSettings();
    setTodayDefaults();
    render();
    updateStorageStatus('Restored saved data from this browser.');
  } else {
    updateStorageStatus();
  }
}

hydrateSettings();
setTodayDefaults();
render();
restoreDurableDb();
