const DAY_MS = 24 * 60 * 60 * 1000;

/** A post is live for 30 days from (re)publish, then it is archived. */
export const POST_LIFETIME_DAYS = 30;
export const POST_LIFETIME_MS = POST_LIFETIME_DAYS * DAY_MS;

/** A boost lasts 21 days, but never outlives the post it boosts. */
export const BOOST_DURATION_DAYS = 21;
export const BOOST_DURATION_MS = BOOST_DURATION_DAYS * DAY_MS;

function toTime(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? null : time;
}

export function getPostPublishedAt(job) {
  return toTime(job?.publishedAt) ?? toTime(job?.createdAt);
}

export function getPostExpiresAt(job) {
  const publishedAt = getPostPublishedAt(job);
  return publishedAt == null ? null : publishedAt + POST_LIFETIME_MS;
}

export function isPostLive(job, now = Date.now()) {
  const expiresAt = getPostExpiresAt(job);
  return expiresAt != null && now < expiresAt;
}

/** Mongo filter matching posts that are still inside their 30-day window. */
export function livePostFilter(now = Date.now()) {
  const cutoff = new Date(now - POST_LIFETIME_MS);
  return {
    $or: [
      { publishedAt: { $gt: cutoff } },
      { publishedAt: null, createdAt: { $gt: cutoff } },
    ],
  };
}

export function getFeaturedEndsAt(job) {
  if (!job?.isFeatured) return null;
  const startedAt = toTime(job.featuredAt) ?? getPostPublishedAt(job);
  const postExpiresAt = getPostExpiresAt(job);
  if (startedAt == null || postExpiresAt == null) return null;
  return Math.min(startedAt + BOOST_DURATION_MS, postExpiresAt);
}

export function isFeaturedActive(job, now = Date.now()) {
  const endsAt = getFeaturedEndsAt(job);
  return endsAt != null && now < endsAt;
}

/** Lifetime fields the apps need to show timers and the archive state. */
export function postLifecycleFields(job, now = Date.now()) {
  const publishedAt = getPostPublishedAt(job);
  const expiresAt = getPostExpiresAt(job);
  const featuredEndsAt = isFeaturedActive(job, now) ? getFeaturedEndsAt(job) : null;
  return {
    publishedAt: publishedAt == null ? null : new Date(publishedAt),
    expiresAt: expiresAt == null ? null : new Date(expiresAt),
    isArchived: !isPostLive(job, now),
    featuredEndsAt: featuredEndsAt == null ? null : new Date(featuredEndsAt),
  };
}
