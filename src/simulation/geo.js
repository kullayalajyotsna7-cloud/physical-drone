export const TIRUPATI_ORIGIN = { latitude: 13.63551, longitude: 79.41989 };
const metersPerDegree = 111320;

export function localToLatLng(x, z) {
  const cosine = Math.cos(TIRUPATI_ORIGIN.latitude * Math.PI / 180);
  return {
    latitude: TIRUPATI_ORIGIN.latitude + x / metersPerDegree,
    longitude: TIRUPATI_ORIGIN.longitude + z / (metersPerDegree * cosine),
  };
}

export function latLngToLocal(latitude, longitude) {
  const cosine = Math.cos(TIRUPATI_ORIGIN.latitude * Math.PI / 180);
  return [
    (latitude - TIRUPATI_ORIGIN.latitude) * metersPerDegree,
    (longitude - TIRUPATI_ORIGIN.longitude) * metersPerDegree * cosine,
  ];
}
