// Geolocalización real del dispositivo (navigator.geolocation) y utilidades de distancia.

// Respaldo mientras el GPS responde o si falla: Barranquilla / Puerto Colombia (Atlántico, Colombia).
export const FALLBACK_POSITION = { lat: 11.019, lng: -74.85, accuracy: null, label: 'Barranquilla / Puerto Colombia' };

const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 };

export const GEO_ERRORS = {
  1: 'Permiso de ubicación denegado. Actívalo en la configuración del navegador para usar GeekRadar.',
  2: 'No se pudo determinar tu ubicación. Revisa que el GPS esté encendido.',
  3: 'La ubicación tardó demasiado en responder. Inténtalo de nuevo.',
};

export function geolocationSupported() {
  return 'geolocation' in navigator;
}

/**
 * Sigue la posición del dispositivo en tiempo real.
 * Devuelve una función para dejar de seguirla.
 */
export function watchPosition(onPosition, onError) {
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onPosition({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      }),
    onError,
    GEO_OPTIONS,
  );
  return () => navigator.geolocation.clearWatch(id);
}

export async function permissionState() {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'prompt';
  }
}

export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10 || 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}

export function googleMapsDirectionsUrl(place) {
  const params = new URLSearchParams({
    api: '1',
    destination: `${place.lat},${place.lng}`,
    travelmode: 'walking',
  });
  return `https://www.google.com/maps/dir/?${params}`;
}

export function googleMapsPlaceUrl(place) {
  const params = new URLSearchParams({ api: '1', query: `${place.name} ${place.lat},${place.lng}` });
  return `https://www.google.com/maps/search/?${params}`;
}
