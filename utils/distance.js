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

function normalizeLocalityToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/** Collect unique locality tokens for text-based matching. */
export function collectLocalityTokens(...sources) {
  const tokens = new Set();
  for (const source of sources) {
    if (!source) continue;
    if (Array.isArray(source)) {
      for (const item of source) {
        const t = normalizeLocalityToken(item);
        if (t.length >= 3) tokens.add(t);
      }
      continue;
    }
    const raw = String(source);
    for (const part of raw.split(/[|,]/)) {
      const t = normalizeLocalityToken(part);
      if (t.length >= 3) tokens.add(t);
    }
  }
  return Array.from(tokens);
}

export function resolveAuthorCoordinates(author) {
  const coords = author?.location?.coordinates;
  return hasValidCoordinates(coords) ? coords : null;
}

export function resolveJobDistanceKm(job, userLat, userLng) {
  if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) return null;
  const coords = resolveAuthorCoordinates(job.author);
  if (!coords) return null;
  return Math.round(distanceKm(userLat, userLng, coords[1], coords[0]) * 10) / 10;
}

function matchesLocalityText(item, localityTokens) {
  const loc = item.location || {};
  const haystack = [loc.city, loc.state, loc.address, loc.district]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack || localityTokens.length === 0) return false;

  return localityTokens.some((token) => {
    if (haystack.includes(token)) return true;
    return haystack.split(/[\s,]+/).some((word) => word.includes(token) || token.includes(word));
  });
}

/**
 * Orders every item nearest first without hiding any of them.
 * Items within `scoreRadiusKm` keep their ranking-score order (distance, subscription and
 * recency rules), farther items follow strictly by distance, and items with no known
 * position come last unless their address matches the viewer's area.
 * `rankingScore` is rewritten so later sorts by score keep this order.
 */
export function orderByProximity(items, { scoreRadiusKm, localityTokens = [] }) {
  const near = [];
  const far = [];
  const unknown = [];

  for (const item of items) {
    const km = item.distanceKm;
    if (km != null) {
      (km <= scoreRadiusKm ? near : far).push(item);
    } else if (matchesLocalityText(item, localityTokens)) {
      near.push(item);
    } else {
      unknown.push(item);
    }
  }

  const byScore = (a, b) => (b.rankingScore ?? 0) - (a.rankingScore ?? 0);
  near.sort(byScore);
  far.sort((a, b) => a.distanceKm - b.distanceKm || byScore(a, b));
  unknown.sort(byScore);

  const ordered = [...near, ...far, ...unknown];
  return ordered.map((item, index) => ({ ...item, rankingScore: ordered.length - index }));
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
