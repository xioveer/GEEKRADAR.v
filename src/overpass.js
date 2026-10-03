// Consulta de lugares reales a la Overpass API (OpenStreetMap).

import { distanceMeters } from './geo.js';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const TYPE_LABELS = {
  amusement_arcade: 'Arcade',
  escape_game: 'Escape room',
  internet_cafe: 'Café internet / gaming',
  gaming_centre: 'Centro de videojuegos',
  restaurant: 'Restaurante',
  fast_food: 'Comida rápida',
  cafe: 'Cafetería',
  food_court: 'Plazoleta de comidas',
  books: 'Librería',
  anime: 'Tienda de anime',
  comics: 'Tienda de cómics',
  comic: 'Tienda de cómics',
  video_games: 'Tienda de videojuegos',
  games: 'Juegos de mesa',
  hobby: 'Tienda de hobbies',
  model: 'Modelismo',
  collector: 'Coleccionables',
  toys: 'Juguetería',
  computer: 'Tienda de computadores',
  trading_cards: 'Cartas coleccionables',
};

export function buildQuery(category, { lat, lng }, radius) {
  const around = `(around:${Math.round(radius)},${lat.toFixed(6)},${lng.toFixed(6)})`;
  const clauses = category.filters
    .map(([key, regex]) => `  nwr["${key}"~"${regex}"]["name"]${around};`)
    .join('\n');
  return `[out:json][timeout:25];\n(\n${clauses}\n);\nout center tags 200;`;
}

async function postQuery(query, signal) {
  let lastError;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: 'data=' + encodeURIComponent(query),
        signal,
      });
      if (!res.ok) throw new Error(`Overpass respondió HTTP ${res.status}`);
      const data = await res.json();
      return data.elements || [];
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
    }
  }
  throw lastError || new Error('No se pudo contactar la Overpass API');
}

function addressOf(tags) {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  const parts = [street, tags['addr:suburb'] || tags['addr:neighbourhood'], tags['addr:city']].filter(Boolean);
  return parts.join(', ') || tags['addr:full'] || '';
}

function matchedType(tags, category) {
  for (const [key, regex] of category.filters) {
    const value = tags[key];
    if (value && new RegExp(regex).test(value)) return TYPE_LABELS[value] || category.label;
  }
  return category.label;
}

function toPlace(el, category, origin) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null || !tags.name) return null;
  return {
    id: `${el.type}/${el.id}`,
    name: tags.name,
    type: matchedType(tags, category),
    cuisine: tags.cuisine ? tags.cuisine.split(';').map((c) => c.replace(/_/g, ' ')).join(', ') : '',
    address: addressOf(tags),
    openingHours: tags.opening_hours || '',
    phone: tags.phone || tags['contact:phone'] || '',
    website: tags.website || tags['contact:website'] || '',
    lat,
    lng,
    distance: distanceMeters(origin, { lat, lng }),
    category,
  };
}

/** Busca lugares de la categoría alrededor de `origin` dentro de `radius` metros. */
export async function searchPlaces(category, origin, radius, signal) {
  const elements = await postQuery(buildQuery(category, origin, radius), signal);
  const seen = new Set();
  return elements
    .map((el) => toPlace(el, category, origin))
    .filter((p) => {
      if (!p || p.distance > radius || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .sort((a, b) => a.distance - b.distance);
}
