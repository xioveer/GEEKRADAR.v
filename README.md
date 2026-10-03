# GeekRadar

Encuentra lugares geek reales a tu alrededor: arcades, comida, manga y cómics, y tiendas geek.

- **Interfaz clara estilo Google Maps**: mapa a pantalla completa (teselas CARTO Voyager sobre OpenStreetMap), barra de búsqueda flotante, chips de categorías y panel de resultados (bottom sheet en móvil, panel lateral en escritorio).
- **GPS real obligatorio**: la posición sale solo de `navigator.geolocation.watchPosition`. No hay ubicaciones por defecto ni datos simulados; si el permiso se niega, la app lo explica y permite reintentar.
- **Radar por categoría**: al tocar una categoría se anima el radar sobre tus coordenadas GPS y se consulta la [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) en un radio de 1,5 km (se amplía a 4 km y 10 km si hay menos de 5 resultados).
- **Resultados**: tarjetas ordenadas por distancia con dirección, horario, teléfono y web cuando existen, y botones **Cómo llegar** / **Ver en Google Maps**.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # genera dist/
```

La geolocalización del navegador requiere HTTPS (o `localhost`).

## Estructura

| Archivo | Contenido |
| --- | --- |
| `src/categories.js` | Categorías y sus filtros de etiquetas OSM |
| `src/overpass.js` | Consulta a Overpass (con servidores de respaldo) y normalización de resultados |
| `src/geo.js` | GPS en tiempo real, distancias y enlaces a Google Maps |
| `src/map.js` | Mapa Leaflet, punto azul, radar y marcadores |
| `src/main.js` | Estado de la app y la interfaz |
| `src/style.css` | Estilos (modo claro) |
