/** Returns true if coordinates are usable (not missing or 0,0) */
export function hasValidCoordinates(coords) {
  if (!Array.isArray(coords) || coords.length !== 2) return false;
  const [lng, lat] = coords;
  if (typeof lng !== "number" || typeof lat !== "number") return false;
  if (lng === 0 && lat === 0) return false;
  return true;
}

/** Haversine distance in km between two lat/lng points */
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Prefer worker profile coords, fall back to linked user profile coords */
export function resolveWorkerCoordinates(worker) {
  if (hasValidCoordinates(worker.location?.coordinates)) {
    return worker.location.coordinates;
  }
  if (hasValidCoordinates(worker.user?.location?.coordinates)) {
    return worker.user.location.coordinates;
  }
  return null;
}

export function sortWorkersByDistance(workers, userCoordinates) {
  if (!hasValidCoordinates(userCoordinates)) {
    return workers.map((w) => ({
      ...(w.toObject ? w.toObject() : w),
      distanceKm: null,
    }));
  }

  const [userLng, userLat] = userCoordinates;

  return workers
    .map((w) => {
      const plain = w.toObject ? w.toObject() : { ...w };
      const coords = resolveWorkerCoordinates(plain);
      const km = coords
        ? distanceKm(userLat, userLng, coords[1], coords[0])
        : Infinity;
      return {
        ...plain,
        distanceKm: km === Infinity ? null : Math.round(km * 10) / 10,
      };
    })
    .sort((a, b) => {
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      return da - db;
    });
}
