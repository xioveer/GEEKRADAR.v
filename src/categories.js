// Categorías de búsqueda y sus filtros de OpenStreetMap (Overpass QL).
// Cada filtro es [clave, expresión regular de valores].

export const CATEGORIES = [
  {
    id: 'arcades',
    label: 'Arcades',
    icon: 'sports_esports',
    color: '#129eaf',
    filters: [
      ['leisure', '^(amusement_arcade|escape_game)$'],
      ['amenity', '^(internet_cafe|gaming_centre)$'],
    ],
  },
  {
    id: 'comida',
    label: 'Comida',
    icon: 'restaurant',
    color: '#e8710a',
    filters: [['amenity', '^(restaurant|fast_food|cafe|food_court)$']],
  },
  {
    id: 'manga',
    label: 'Manga y cómics',
    icon: 'menu_book',
    color: '#d93025',
    filters: [
      ['shop', '^(books|anime|comics|comic)$'],
    ],
  },
  {
    id: 'tiendas',
    label: 'Tiendas geek',
    icon: 'storefront',
    color: '#188038',
    filters: [
      ['shop', '^(video_games|games|hobby|model|collector|toys|computer|trading_cards)$'],
    ],
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
