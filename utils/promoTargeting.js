import { distanceKm, hasValidCoordinates } from "./distance.js";

/** Video promotions: only used when the promo or viewer has no city name */
export const VIDEO_CITY_RADIUS_KM = 30;
/** Banner promotions: only used when the promo or viewer has no state name */
export const BANNER_STATE_RADIUS_KM = 300;

/** Old/alternate names that refer to the same place */
const PLACE_ALIASES = {
  gurgaon: "gurugram",
  bangalore: "bengaluru",
  bombay: "mumbai",
  calcutta: "kolkata",
  madras: "chennai",
  mysore: "mysuru",
  allahabad: "prayagraj",
  poona: "pune",
  cochin: "kochi",
  trivandrum: "thiruvananthapuram",
  baroda: "vadodara",
  benares: "varanasi",
  banaras: "varanasi",
  "new delhi": "delhi",
  "nct of delhi": "delhi",
  "national capital territory of delhi": "delhi",
  orissa: "odisha",
  uttaranchal: "uttarakhand",
  pondicherry: "puducherry",
};

const INDIAN_STATES = new Set([
  "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat",
  "haryana", "himachal pradesh", "jharkhand", "karnataka", "kerala", "madhya pradesh",
  "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland", "odisha", "punjab", "rajasthan",
  "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand", "west bengal",
  "andaman and nicobar islands", "chandigarh", "dadra and nagar haveli and daman and diu",
  "delhi", "jammu and kashmir", "ladakh", "lakshadweep", "puducherry",
]);

export function normalizePlace(value) {
  const s = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\b(district|city)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return PLACE_ALIASES[s] || s;
}

/** null when either side is unknown; otherwise whether both name the same place */
function samePlace(a, b) {
  const x = normalizePlace(a);
  const y = normalizePlace(b);
  if (!x || !y) return null;
  if (x === y) return true;
  // "south delhi" vs "delhi": one name contains the other as whole words
  return ` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `);
}

function promoPlace(job) {
  const loc = job.location || {};
  const authorLoc = job.author?.location || {};
  return {
    city: loc.city || authorLoc.city || "",
    state: loc.state || authorLoc.state || "",
  };
}

function promoDistanceKm(job, viewer) {
  if (!Number.isFinite(viewer.lat) || !Number.isFinite(viewer.lng)) return null;
  if (job.distanceKm != null) return job.distanceKm;
  const coords = job.author?.location?.coordinates;
  if (!hasValidCoordinates(coords)) return null;
  return distanceKm(viewer.lat, viewer.lng, coords[1], coords[0]);
}

function withinKm(job, viewer, maxKm) {
  const km = promoDistanceKm(job, viewer);
  return km != null && km <= maxKm;
}

export function hasViewerLocation(viewer) {
  return Boolean(
    normalizePlace(viewer.city) ||
      normalizePlace(viewer.state) ||
      (Number.isFinite(viewer.lat) && Number.isFinite(viewer.lng))
  );
}

/** Video promotions run only in their own city (or anywhere in a state the viewer picked). */
export function isVideoInViewerCity(job, viewer) {
  const place = promoPlace(job);
  if (normalizePlace(viewer.city)) {
    const cityMatch = samePlace(place.city, viewer.city);
    if (cityMatch !== null) return cityMatch;
  } else if (normalizePlace(viewer.state)) {
    const stateMatch = samePlace(place.state, viewer.state);
    if (stateMatch !== null) return stateMatch;
  }
  return withinKm(job, viewer, VIDEO_CITY_RADIUS_KM);
}

/** Banner promotions run across their whole state. */
export function isBannerInViewerState(job, viewer) {
  const place = promoPlace(job);
  const stateMatch = samePlace(place.state, viewer.state);
  if (stateMatch !== null) return stateMatch;
  if (samePlace(place.city, viewer.city)) return true;
  return withinKm(job, viewer, BANNER_STATE_RADIUS_KM);
}

/** Keep only promos targeted at the viewer's area. Unknown viewer location keeps all promos. */
export function filterPromosForViewer(promos, viewer) {
  if (!hasViewerLocation(viewer)) return promos;
  return promos.filter((job) => {
    if (job.isVideoPost) return isVideoInViewerCity(job, viewer);
    if (job.isBannerAd) return isBannerInViewerState(job, viewer);
    return true;
  });
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) {
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [v, n] of counts) {
    if (n > bestCount) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Viewer for a city or state the user picked (e.g. the filter's city box).
 * A state name targets the whole state; a city also gets its state so banners still show.
 * `lookupStateForCity` is an optional async fallback (e.g. a user/profile lookup).
 */
export async function viewerForSelectedPlace(place, jobs = [], lookupStateForCity) {
  const name = normalizePlace(place);
  if (!name) return { city: "", state: "", lat: null, lng: null };

  if (INDIAN_STATES.has(name)) {
    return { city: "", state: name, lat: null, lng: null };
  }

  let state = mostCommon(
    jobs
      .map(promoPlace)
      .filter((p) => samePlace(p.city, name))
      .map((p) => normalizePlace(p.state))
  );
  if (!state && lookupStateForCity) {
    state = normalizePlace(await lookupStateForCity(place).catch(() => ""));
  }
  return { city: name, state, lat: null, lng: null };
}
