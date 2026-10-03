// Mapa Leaflet con estilo claro tipo Google Maps, punto azul del usuario y radar.

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FALLBACK_POSITION } from './geo.js';

let map;
let userMarker;
let accuracyCircle;
let radarMarker;
let rangeCircle;
let placesLayer;
const markersById = new Map();

export function initMap(el) {
  map = L.map(el, {
    zoomControl: false,
    attributionControl: true,
    worldCopyJump: true,
    minZoom: 2,
  }).setView([FALLBACK_POSITION.lat, FALLBACK_POSITION.lng], 13);

  // Teselas claras "Voyager" de CARTO sobre datos de OpenStreetMap.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  placesLayer = L.layerGroup().addTo(map);
  map.on('zoomend', resizeRadar);
  return map;
}

export function updateUserPosition(pos) {
  const latlng = [pos.lat, pos.lng];
  if (!userMarker) {
    accuracyCircle = L.circle(latlng, {
      radius: pos.accuracy,
      className: 'accuracy-circle',
      interactive: false,
    }).addTo(map);
    userMarker = L.marker(latlng, {
      icon: L.divIcon({ className: 'user-dot', html: '<span></span>', iconSize: [22, 22] }),
      keyboard: false,
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(map);
  } else {
    userMarker.setLatLng(latlng);
    accuracyCircle.setLatLng(latlng).setRadius(pos.accuracy);
  }
  radarMarker?.setLatLng(latlng);
  rangeCircle?.setLatLng(latlng);
}

export function centerOn(pos, zoom) {
  map.flyTo([pos.lat, pos.lng], zoom ?? Math.max(map.getZoom(), 15), { duration: 0.8 });
}

// ---------- Radar ----------

function radiusInPixels(meters) {
  const center = rangeCircle.getLatLng();
  const p1 = map.latLngToLayerPoint(center);
  const lngOffset = meters / (111320 * Math.cos((center.lat * Math.PI) / 180));
  const p2 = map.latLngToLayerPoint([center.lat, center.lng + lngOffset]);
  return Math.abs(p2.x - p1.x);
}

function resizeRadar() {
  if (!radarMarker || !rangeCircle) return;
  const size = Math.min(Math.max(radiusInPixels(rangeCircle.getRadius()) * 2, 140), 1400);
  const el = radarMarker.getElement();
  if (el) el.style.setProperty('--radar-size', `${size}px`);
}

/** Muestra y anima el radar sobre las coordenadas GPS reales. */
export function startRadar(pos, radius, color) {
  const latlng = [pos.lat, pos.lng];
  if (!rangeCircle) {
    rangeCircle = L.circle(latlng, { radius, className: 'range-circle', interactive: false }).addTo(map);
  } else {
    rangeCircle.setLatLng(latlng).setRadius(radius);
  }
  if (!radarMarker) {
    radarMarker = L.marker(latlng, {
      icon: L.divIcon({
        className: 'radar',
        html: '<div class="radar__ring"></div><div class="radar__ring"></div><div class="radar__ring"></div><div class="radar__sweep"></div>',
        iconSize: [0, 0],
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: -1000,
    }).addTo(map);
  } else {
    radarMarker.setLatLng(latlng);
  }
  const el = radarMarker.getElement();
  el.style.setProperty('--radar-color', color);
  el.classList.add('is-scanning');
  map.flyToBounds(rangeCircle.getBounds(), { ...paddingForSheet(), duration: 0.8, maxZoom: 17 });
  map.once('moveend', resizeRadar);
  resizeRadar();
}

export function stopRadar() {
  radarMarker?.getElement()?.classList.remove('is-scanning');
}

// ---------- Lugares ----------

function pinIcon(place, active = false) {
  const { color, icon } = place.category;
  return L.divIcon({
    className: `pin${active ? ' is-active' : ''}`,
    html: `<div class="pin__body" style="--pin-color:${color}"><span class="material-symbols-outlined">${icon}</span></div>`,
    iconSize: [30, 40],
    iconAnchor: [15, 38],
  });
}

export function showPlaces(places, onSelect) {
  placesLayer.clearLayers();
  markersById.clear();
  for (const place of places) {
    const marker = L.marker([place.lat, place.lng], { icon: pinIcon(place), title: place.name, riseOnHover: true });
    marker.on('click', () => onSelect(place.id, 'map'));
    marker.addTo(placesLayer);
    markersById.set(place.id, { marker, place });
  }
}

export function highlightPlace(id, pan) {
  for (const [key, { marker, place }] of markersById) {
    const active = key === id;
    marker.setIcon(pinIcon(place, active));
    marker.setZIndexOffset(active ? 900 : 0);
    if (active && pan) map.panTo(marker.getLatLng(), { animate: true });
  }
}

export function fitPlaces(pos, places) {
  if (!places.length) return;
  const bounds = L.latLngBounds([[pos.lat, pos.lng], ...places.slice(0, 15).map((p) => [p.lat, p.lng])]);
  map.flyToBounds(bounds, { ...paddingForSheet(), maxZoom: 17, duration: 0.8 });
}

// Deja libre el área que tapan la barra superior y el panel de resultados.
function paddingForSheet() {
  if (window.matchMedia('(min-width: 768px)').matches) {
    return { paddingTopLeft: [440, 120], paddingBottomRight: [60, 40] };
  }
  const sheet = document.getElementById('sheet');
  const covered = sheet ? window.innerHeight - sheet.getBoundingClientRect().top : 0;
  return { paddingTopLeft: [24, 130], paddingBottomRight: [24, Math.max(covered, 0) + 24] };
}
