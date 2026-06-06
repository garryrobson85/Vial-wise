const menuButton = document.querySelector(".menu-button");
const menu = document.querySelector("#menu");
const PRICE_FEED_URL =
  new URLSearchParams(location.search).get("feed") ||
  "https://petrair-prices.garryrobson85.workers.dev/";
const LEAD_BRIEF_URL =
  new URLSearchParams(location.search).get("leadBrief") ||
  "https://contactform.garryrobson85.workers.dev/";
const PRICE_REFRESH_MS = 60000;
const RTL_LANGUAGES = new Set(["ar"]);
let clickAudioContext;

const translations = window.PETRAIR_TRANSLATIONS || {};

const specContent = {
  crude: {
    eyebrow: "Crude oil",
    title: "Crude Oil",
    image: "images/petrair-crude-custom.jpg",
    body: "Crude oil is one of the world's most actively traded energy commodities and serves as the primary feedstock for the global refining industry.\n\nPetrair's trading activities may encompass a variety of crude oil grades, including light, medium, and heavy crudes from different producing regions, depending on market availability, commercial opportunities, and counterparty requirements.\n\nTransactions are approached through disciplined counterparty review, benchmark-aware pricing and document-led execution."
  },
  jet: {
    eyebrow: "Aviation fuel",
    title: "Jet A-1",
    image: "images/petrair-jet-custom.jpg",
    body: "The internationally recognised grade of aviation turbine fuel used by commercial airlines, cargo operators and aviation service providers worldwide.\n\nJet A-1 enquiries are handled with attention to destination storage, delivery scheduling, documentary controls and independent inspection requirements.\n\nPetrair focuses on commercially credible movements where counterparties, terminals and payment routes can be clearly verified."
  },
  diesel: {
    eyebrow: "Diesel",
    title: "ULSD 10ppm",
    image: "images/petrair-diesel-custom-v2.jpg",
    body: "Ultra Low Sulphur Diesel \u2014 a high-quality automotive diesel meeting stringent environmental and performance standards.\n\nPetrair evaluates ULSD opportunities across refined-products channels where quality, quantity, storage, inspection and banking documentation can be aligned before execution.\n\nThe focus is on practical, controlled transaction flow rather than speculative exposure."
  },
  lpg: {
    eyebrow: "Liquefied petroleum gas",
    title: "LPG",
    image: "images/petrair-lpg-custom-v2.jpg",
    body: "Liquefied Petroleum Gas \u2014 a versatile hydrocarbon fuel of propane and butane used across multiple sectors worldwide.\n\nLPG trade flows depend on suitable terminal infrastructure, vessel compatibility, product handling requirements and clear documentary controls.\n\nPetrair reviews opportunities on a case-by-case basis with emphasis on counterparty reliability, origin controls and executable logistics."
  }
};

const instruments = [
  { id: "brent", symbol: "CB.F", name: "ICE Brent Crude", sub: "Front-month futures", live: true, seed: 82.44, unit: "USD/bbl", decimals: 2 },
  { id: "wti", symbol: "CL.F", name: "NYMEX WTI Crude", sub: "Front-month futures", live: true, seed: 77.91, unit: "USD/bbl", decimals: 2 },
  { id: "ulsdHarbor", symbol: "HO.F", name: "ULSD NY Harbor", sub: "Front-month futures", live: true, seed: 2.55, unit: "USD/gal", decimals: 3 },
  { id: "rbobGasoline", symbol: "RB.F", name: "RBOB Gasoline", sub: "Front-month futures", live: true, seed: 2.48, unit: "USD/gal", decimals: 3 },
  { id: "naturalGas", symbol: "NG.F", name: "Natural Gas (Henry Hub)", sub: "Front-month futures", live: true, seed: 3.21, unit: "USD/MMBtu", decimals: 2 }
];

const priceState = Object.fromEntries(
  instruments.map((instrument) => [
    instrument.id,
    {
      price: instrument.seed,
      previous: instrument.seed,
      history: Array.from({ length: 12 }, () => instrument.seed * (1 + (Math.random() - 0.5) * 0.01))
    }
  ])
);

menuButton?.addEventListener("click", () => {
  const isOpen = menu.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

menu?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    menu.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  }
});

function applyLanguage(lang) {
  const dictionary = translations[lang] || {};
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL_LANGUAGES.has(lang) ? "rtl" : "ltr";
  localStorage.setItem("petrair_lang", lang);

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    if (!element.dataset.i18nDefault) {
      element.dataset.i18nDefault = element.textContent;
    }
    const key = element.dataset.i18n;
    element.textContent = dictionary[key] || element.dataset.i18nDefault;
  });
}

const languageSelect = document.querySelector("#language-select");
const savedLanguage = localStorage.getItem("petrair_lang") || "en";
if (languageSelect) {
  languageSelect.value = savedLanguage;
  languageSelect.addEventListener("change", () => applyLanguage(languageSelect.value));
}
applyLanguage(savedLanguage);

const revealTargets = document.querySelectorAll(".section-head, .product-card, .price-board, .capability-flow article, .process-list div, .map-band, .checks div, .doc-grid a, .rfq-panel");
revealTargets.forEach((element) => element.classList.add("reveal"));
if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -40px 0px" }
  );
  revealTargets.forEach((element) => revealObserver.observe(element));
} else {
  revealTargets.forEach((element) => element.classList.add("in-view"));
}

function playClickSound() {
  try {
    clickAudioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = clickAudioContext.currentTime;
    const oscillator = clickAudioContext.createOscillator();
    const gain = clickAudioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(640, now);
    oscillator.frequency.exponentialRampToValueAtTime(420, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    oscillator.connect(gain);
    gain.connect(clickAudioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.12);
  } catch {}
}

document.addEventListener("click", (event) => {
  const target = event.target.closest?.("a, button, select, input, textarea");
  if (target && !target.closest("#language-select")) playClickSound();
});

function createSparkline(history) {
  const width = 84;
  const height = 28;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const points = history
    .map((value, index) => {
      const x = (index / (history.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 5) - 2.5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = history[history.length - 1] >= history[0];
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  svg.setAttribute("class", "spark");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-hidden", "true");
  line.setAttribute("points", points);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", rising ? "#75d19f" : "#ef8585");
  line.setAttribute("stroke-width", "1.8");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke-linejoin", "round");
  svg.append(line);
  return svg;
}

function buildPriceBoard() {
  const rows = document.querySelector("#price-rows");
  if (!rows) return;
  rows.textContent = "";

  for (const instrument of instruments) {
    const row = document.createElement("tr");
    row.dataset.instrument = instrument.id;

    const symbol = document.createElement("td");
    symbol.className = "price-symbol";
    symbol.textContent = instrument.name;
    const sub = document.createElement("small");
    sub.textContent = `${instrument.symbol} / ${instrument.unit}`;
    symbol.append(sub);

    const last = document.createElement("td");
    last.className = "price-last";
    last.dataset.field = "last";

    const change = document.createElement("td");
    change.className = "price-change";
    change.dataset.field = "change";

    const trend = document.createElement("td");
    trend.className = "hide-sm";
    trend.dataset.field = "trend";

    const type = document.createElement("td");
    const tag = document.createElement("span");
    tag.className = "price-tag";
    tag.textContent = "Live";
    type.append(tag);

    row.append(symbol, last, change, trend, type);
    rows.append(row);
  }
}

function formatPrice(instrument, state) {
  return `${state.price.toFixed(instrument.decimals)} ${instrument.unit}`;
}

function formatChange(instrument, state) {
  const delta = state.price - state.previous;
  const pct = state.previous ? (delta / state.previous) * 100 : 0;
  const rising = delta >= 0;
  return {
    rising,
    text: `${rising ? "+" : "-"}${Math.abs(delta).toFixed(instrument.decimals)} (${Math.abs(pct).toFixed(2)}%)`
  };
}

function createTickerGroup(hidden) {
  const group = document.createElement("span");
  group.className = "ticker-group";
  if (hidden) group.setAttribute("aria-hidden", "true");

  for (const instrument of instruments) {
    const state = priceState[instrument.id];
    const change = formatChange(instrument, state);
    const item = document.createElement("span");
    item.className = "ticker-item";

    const name = document.createElement("span");
    name.className = "ticker-name";
    name.textContent = instrument.name;
    const symbol = document.createElement("small");
    symbol.textContent = instrument.symbol;
    const price = document.createElement("span");
    price.textContent = formatPrice(instrument, state);
    const move = document.createElement("span");
    move.className = `ticker-change ${change.rising ? "up" : "down"}`;
    move.textContent = change.text;

    item.append(name, symbol, price, move);
    group.append(item);
  }

  return group;
}

function renderTicker() {
  const track = document.querySelector("#market-ticker-track");
  if (!track) return;
  track.textContent = "";
  track.append(createTickerGroup(false), createTickerGroup(true));
}

function renderPrices() {
  for (const instrument of instruments) {
    const row = document.querySelector(`[data-instrument="${instrument.id}"]`);
    if (!row) continue;
    const state = priceState[instrument.id];
    const changeData = formatChange(instrument, state);
    const last = row.querySelector('[data-field="last"]');
    const change = row.querySelector('[data-field="change"]');
    const trend = row.querySelector('[data-field="trend"]');

    last.textContent = formatPrice(instrument, state);
    change.className = `price-change ${changeData.rising ? "up" : "down"}`;
    change.textContent = changeData.text;
    trend.textContent = "";
    trend.append(createSparkline(state.history));
  }

  renderTicker();

  const updated = document.querySelector("#price-updated");
  if (updated) {
    updated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
}

function setPriceStatus(label, mode) {
  const status = document.querySelector("#price-status");
  const dot = document.querySelector("#price-status-dot");
  if (status) status.textContent = label;
  if (dot) {
    dot.style.background = mode === "live" ? "#75d19f" : mode === "error" ? "#aeb8c7" : "var(--gold)";
  }
}

function applyDemoMove() {
  for (const instrument of instruments) {
    const state = priceState[instrument.id];
    state.previous = state.price;
    state.price = Number((state.price * (1 + (Math.random() - 0.5) * 0.004)).toFixed(4));
    state.history.push(state.price);
    if (state.history.length > 12) state.history.shift();
  }
}

async function refreshPrices() {
  if (!document.querySelector("#price-rows")) return;

  if (!PRICE_FEED_URL) {
    applyDemoMove();
    setPriceStatus("Demo prices", "demo");
    renderPrices();
    return;
  }

  try {
    const response = await fetch(PRICE_FEED_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Price feed returned ${response.status}`);
    const data = await response.json();

    for (const id of instruments.map((instrument) => instrument.id)) {
      if (data[id] && typeof data[id].price === "number") {
        const state = priceState[id];
        state.previous = typeof data[id].prev === "number" ? data[id].prev : state.price;
        state.price = data[id].price;
        state.history.push(state.price);
        if (state.history.length > 12) state.history.shift();
      }
    }

    setPriceStatus("Streaming", "live");
    renderPrices();
  } catch {
    applyDemoMove();
    setPriceStatus("Indicative fallback", "error");
    renderPrices();
  }
}

buildPriceBoard();
refreshPrices();
setInterval(refreshPrices, PRICE_REFRESH_MS);

const modal = document.querySelector("#spec-modal");
const modalTitle = document.querySelector("#modal-title");
const modalEyebrow = document.querySelector("#modal-eyebrow");
const modalBody = document.querySelector("#modal-body");
const modalImage = document.querySelector("#modal-image");
const modalClose = modal?.querySelector(".modal-close");
const rfqModal = document.querySelector("#rfq-modal");
const rfqModalClose = rfqModal?.querySelector(".rfq-modal-close");

function openSpec(key) {
  const spec = specContent[key];
  if (!spec || !modal) return;
  const panel = modal.querySelector(".modal-panel");
  if (spec.image) {
    panel?.style.setProperty("--spec-backdrop", `url("${spec.image}")`);
    if (modalImage) modalImage.style.backgroundImage = `url("${spec.image}")`;
  }
  panel?.classList.remove("modal-panel-enter");
  modalEyebrow.textContent = spec.eyebrow;
  modalTitle.textContent = spec.title;
  modalBody.textContent = spec.body;
  modal.hidden = false;
  if (panel) {
    panel.offsetHeight;
    panel.classList.add("modal-panel-enter");
  }
  modalClose?.focus();
}

function closeSpec() {
  if (modal) modal.hidden = true;
}

function openRfq() {
  if (!rfqModal) return;
  rfqModal.hidden = false;
  rfqModal.querySelector("select, input, textarea, button")?.focus();
}

function closeRfq() {
  if (rfqModal) rfqModal.hidden = true;
}

document.querySelectorAll("[data-spec]").forEach((card) => {
  card.addEventListener("click", () => openSpec(card.dataset.spec));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openSpec(card.dataset.spec);
    }
  });
});
modalClose?.addEventListener("click", closeSpec);
modal?.addEventListener("click", (event) => {
  if (event.target === modal) closeSpec();
});
document.querySelectorAll("[data-open-rfq]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    openRfq();
  });
});
rfqModalClose?.addEventListener("click", closeRfq);
rfqModal?.addEventListener("click", (event) => {
  if (event.target === rfqModal) closeRfq();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSpec();
    closeRfq();
  }
});

const form = document.querySelector("#rfq-form");
const note = document.querySelector("#form-note");

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const email = String(data.get("Email") || "").trim();

  if (!email || !email.includes("@")) {
    note.textContent = "Please add a valid email address first.";
    return;
  }

  const lines = [];
  for (const [key, value] of data.entries()) {
    const text = String(value).trim();
    if (text) lines.push(`${key}: ${text}`);
  }

  if (LEAD_BRIEF_URL) {
    const payload = Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value).trim()]));
    payload.Page = location.href;
    payload.SubmittedAt = new Date().toISOString();
    fetch(LEAD_BRIEF_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {});
  }

  const subject = encodeURIComponent(`Petrair SA enquiry - ${data.get("Product") || "Trading"}`);
  const body = encodeURIComponent(lines.join("\n"));
  window.location.href = `mailto:sales@petrairsa.com?subject=${subject}&body=${body}`;
  note.textContent = "Opening your email client with the enquiry prepared.";
});
