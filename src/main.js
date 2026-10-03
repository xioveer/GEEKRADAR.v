import './style.css';
import { CATEGORIES, CATEGORY_BY_ID } from './categories.js';
import { searchPlaces } from './overpass.js';
import {
  FALLBACK_POSITION,
  GEO_ERRORS,
  distanceMeters,
  formatDistance,
  geolocationSupported,
  googleMapsDirectionsUrl,
  googleMapsPlaceUrl,
  permissionState,
  watchPosition,
} from './geo.js';
import {
  centerOn,
  fitPlaces,
  highlightPlace,
  initMap,
  showPlaces,
  startRadar,
  stopRadar,
  updateUserPosition,
} from './map.js';

// Radios de escaneo (metros): se amplía si hay pocos resultados.
const SCAN_RADII = [1500, 4000, 10000];
const MIN_RESULTS = 5;
const MIN_SCAN_MS = 1400;

const state = {
  position: null, // última posición GPS real { lat, lng, accuracy }; null hasta que el GPS responda
  lastRenderPosition: null,
  categoryId: null,
  places: [],
  radius: null,
  query: '',
  selectedId: null,
  scanController: null,
  stopWatching: null,
};

const $ = (id) => document.getElementById(id);
const els = {
  chips: $('categoryChips'),
  search: $('searchInput'),
  clearSearch: $('clearSearchBtn'),
  sheet: $('sheet'),
  sheetHandle: $('sheetHandle'),
  title: $('sheetTitle'),
  subtitle: $('sheetSubtitle'),
  status: $('statusBox'),
  results: $('results'),
  locate: $('locateBtn'),
  gate: $('gpsGate'),
  gateText: $('gateText'),
  gateBtn: $('gateBtn'),
  gateSkip: $('gateSkipBtn'),
  toast: $('toast'),
};

// ---------- utilidades DOM ----------

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style') el.style.cssText = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const icon = (name, cls = '') => h('span', { class: `material-symbols-outlined ${cls}`, 'aria-hidden': 'true' }, name);

let toastTimer;
function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), 4000);
}

function setSheet(mode) {
  els.sheet.dataset.mode = mode; // peek | half | full
  document.body.dataset.sheet = mode;
}

// ---------- GPS ----------

// Coordenadas para escanear: GPS real si ya respondió; si no, el respaldo en Colombia.
function scanOrigin() {
  return state.position || FALLBACK_POSITION;
}

function showFallbackHint(reason) {
  if (state.categoryId) return;
  els.subtitle.textContent = `${reason} Mostrando ${FALLBACK_POSITION.label}. Elige una categoría para escanear.`;
}

function showGate(message, buttonLabel = 'Usar mi ubicación') {
  els.gateText.textContent = message;
  els.gateBtn.textContent = buttonLabel;
  els.gateBtn.hidden = !buttonLabel;
  els.gate.hidden = false;
}

function startGps() {
  state.stopWatching?.();
  els.gateBtn.disabled = true;
  els.gateBtn.textContent = 'Obteniendo ubicación…';
  state.stopWatching = watchPosition(onPosition, onGpsError);
}

function onPosition(pos) {
  const first = !state.position;
  state.position = pos;
  updateUserPosition(pos);
  if (first) {
    els.gate.hidden = true;
    els.gateBtn.disabled = false;
    centerOn(pos, 16);
    document.body.classList.add('has-location');
    // Si ya se escaneó desde el respaldo, repite el escaneo con el GPS real.
    if (state.categoryId) scanCategory(state.categoryId);
  }
  if (!state.categoryId) {
    els.subtitle.textContent = `Tu ubicación: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} (±${Math.round(pos.accuracy)} m). Elige una categoría para escanear.`;
  }
  // Actualiza distancias en tiempo real cuando te mueves.
  if (state.places.length && distanceMeters(state.lastRenderPosition, pos) > 20) {
    for (const p of state.places) p.distance = distanceMeters(pos, p);
    state.places.sort((a, b) => a.distance - b.distance);
    renderResults();
  }
}

function onGpsError(err) {
  els.gateBtn.disabled = false;
  const message = GEO_ERRORS[err.code] || 'No se pudo obtener tu ubicación.';
  if (!state.position) {
    showGate(message, 'Reintentar');
    showFallbackHint('GPS no disponible.');
  } else {
    toast(message);
  }
}

// ---------- Categorías ----------

function renderChips() {
  els.chips.replaceChildren(
    ...CATEGORIES.map((cat) =>
      h(
        'button',
        {
          type: 'button',
          class: 'chip',
          'data-id': cat.id,
          'aria-pressed': 'false',
          style: `--chip-color:${cat.color}`,
          onclick: () => scanCategory(cat.id),
        },
        icon(cat.icon, 'chip__icon'),
        cat.label,
      ),
    ),
  );
}

function updateChips() {
  for (const chip of els.chips.children) {
    const active = chip.dataset.id === state.categoryId;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-pressed', String(active));
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function scanCategory(categoryId) {
  const category = CATEGORY_BY_ID[categoryId];
  state.scanController?.abort();
  const controller = new AbortController();
  state.scanController = controller;

  state.categoryId = categoryId;
  state.places = [];
  state.selectedId = null;
  updateChips();
  showPlaces([], selectPlace);
  els.results.replaceChildren();
  els.title.textContent = category.label;
  setSheet('peek');

  // Se usa la posición GPS más reciente; si el GPS aún no responde, el respaldo en Colombia.
  const origin = scanOrigin();
  const where = state.position
    ? `${origin.lat.toFixed(5)}, ${origin.lng.toFixed(5)}`
    : `${FALLBACK_POSITION.label} (aproximada, GPS sin respuesta)`;
  let places = [];
  let radius = SCAN_RADII[0];
  try {
    for (radius of SCAN_RADII) {
      startRadar(origin, radius, category.color);
      setStatus('scanning', `Escaneando ${category.label.toLowerCase()} en un radio de ${formatDistance(radius)}…`);
      els.subtitle.textContent = `Radar activo en ${where}`;
      const [found] = await Promise.all([searchPlaces(category, origin, radius, controller.signal), wait(MIN_SCAN_MS)]);
      places = found;
      if (places.length >= MIN_RESULTS) break;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    stopRadar();
    setStatus('error', 'No se pudo consultar OpenStreetMap. Revisa tu conexión e inténtalo de nuevo.', () =>
      scanCategory(categoryId),
    );
    els.subtitle.textContent = 'Error en la búsqueda';
    setSheet('half');
    return;
  }
  if (controller.signal.aborted) return;

  stopRadar();
  state.places = places;
  state.radius = radius;
  state.lastRenderPosition = { ...origin };
  showPlaces(places, selectPlace);
  renderResults();
  setSheet(places.length ? 'half' : 'peek');
  if (places.length) fitPlaces(origin, places);
}

function setStatus(kind, message, retry) {
  if (!kind) {
    els.status.hidden = true;
    return;
  }
  els.status.className = `status status--${kind}`;
  els.status.replaceChildren(
    ...[
        kind === 'scanning' ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : icon(kind === 'error' ? 'error' : 'info'),
      h('span', {}, message),
      retry && h('button', { type: 'button', class: 'btn btn--text', onclick: retry }, 'Reintentar'),
    ].filter(Boolean),
  );
  els.status.hidden = false;
}

// ---------- Resultados ----------

function visiblePlaces() {
  const q = state.query.trim().toLowerCase();
  if (!q) return state.places;
  return state.places.filter((p) => `${p.name} ${p.type} ${p.cuisine} ${p.address}`.toLowerCase().includes(q));
}

function renderResults() {
  if (!state.categoryId) return;
  const category = CATEGORY_BY_ID[state.categoryId];
  const places = visiblePlaces();
  state.lastRenderPosition = { ...scanOrigin() };

  const total = state.places.length;
  els.subtitle.textContent = total
    ? `${total} ${total === 1 ? 'lugar' : 'lugares'} en ${formatDistance(state.radius)} a la redonda`
    : `Sin resultados en ${formatDistance(state.radius)}`;

  if (!total) {
    setStatus('info', `No encontramos ${category.label.toLowerCase()} registrados en OpenStreetMap cerca de ti.`, () =>
      scanCategory(state.categoryId),
    );
  } else if (!places.length) {
    setStatus('info', 'Ningún resultado coincide con tu filtro.');
  } else {
    setStatus(null);
  }

  showPlaces(places, selectPlace);
  if (state.selectedId) highlightPlace(state.selectedId, false);
  els.results.replaceChildren(...places.map(placeCard));
}

function placeCard(place) {
  const meta = [place.type, place.cuisine].filter(Boolean).join(' · ');
  return h(
    'li',
    {
      class: `card${place.id === state.selectedId ? ' is-selected' : ''}`,
      'data-id': place.id,
      tabindex: '0',
      onclick: (e) => {
        if (!e.target.closest('a')) selectPlace(place.id, 'list');
      },
      onkeydown: (e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) selectPlace(place.id, 'list');
      },
    },
    h(
      'div',
      { class: 'card__main' },
      h('h3', { class: 'card__title' }, place.name),
      h('p', { class: 'card__meta' }, meta, h('span', { class: 'card__dot' }, '·'), formatDistance(place.distance)),
      place.address ? h('p', { class: 'card__line' }, icon('location_on'), place.address) : null,
      place.openingHours ? h('p', { class: 'card__line' }, icon('schedule'), place.openingHours) : null,
      h(
        'div',
        { class: 'card__actions' },
        h(
          'a',
          { class: 'btn btn--primary btn--sm', href: googleMapsDirectionsUrl(place), target: '_blank', rel: 'noopener' },
          icon('directions'),
          'Cómo llegar',
        ),
        h(
          'a',
          { class: 'btn btn--outline btn--sm', href: googleMapsPlaceUrl(place), target: '_blank', rel: 'noopener' },
          icon('map'),
          'Ver en Google Maps',
        ),
        place.phone
          ? h('a', { class: 'btn btn--outline btn--sm btn--icon', href: `tel:${place.phone.split(';')[0]}`, 'aria-label': 'Llamar' }, icon('call'))
          : null,
        /^https?:\/\//i.test(place.website)
          ? h(
              'a',
              { class: 'btn btn--outline btn--sm btn--icon', href: place.website, target: '_blank', rel: 'noopener', 'aria-label': 'Sitio web' },
              icon('public'),
            )
          : null,
      ),
    ),
    h('div', { class: 'card__badge', style: `--badge-color:${place.category.color}` }, icon(place.category.icon)),
  );
}

function selectPlace(id, source) {
  state.selectedId = id;
  highlightPlace(id, source === 'list');
  for (const card of els.results.children) card.classList.toggle('is-selected', card.dataset.id === id);
  if (source === 'map') {
    if (els.sheet.dataset.mode === 'peek') setSheet('half');
    els.results.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ---------- Inicio ----------

function bindUi() {
  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    els.clearSearch.hidden = !state.query;
    renderResults();
  });
  els.clearSearch.addEventListener('click', () => {
    els.search.value = '';
    state.query = '';
    els.clearSearch.hidden = true;
    renderResults();
    els.search.focus();
  });
  els.sheetHandle.addEventListener('click', () => {
    const next = { peek: 'half', half: 'full', full: 'peek' };
    setSheet(next[els.sheet.dataset.mode] || 'half');
  });
  els.locate.addEventListener('click', () => {
    if (state.position) centerOn(state.position, 16);
    else startGps();
  });
  els.gateBtn.addEventListener('click', startGps);
  els.gateSkip.addEventListener('click', () => {
    els.gate.hidden = true;
    showFallbackHint('Esperando el GPS.');
  });
}

async function init() {
  initMap($('map'));
  renderChips();
  bindUi();
  setSheet('peek');

  if (!geolocationSupported()) {
    showGate('Tu navegador no soporta geolocalización. Puedes explorar Barranquilla mientras tanto.', null);
    return;
  }
  if (!window.isSecureContext) {
    showGate('La geolocalización solo funciona en conexiones seguras (HTTPS o localhost). Puedes explorar Barranquilla mientras tanto.', null);
    return;
  }
  showFallbackHint('Buscando tu GPS…');
  if ((await permissionState()) === 'granted') startGps();
  else showGate(els.gateText.textContent);
}

init();
