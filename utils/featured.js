/** Featured placement lasts 30 days from post creation */
export const FEATURED_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function isFeaturedActive(job) {
  if (!job?.isFeatured) return false;
  const startSource = job.featuredAt || job.createdAt;
  const startedAt = startSource ? new Date(startSource).getTime() : NaN;
  if (Number.isNaN(startedAt)) return false;
  return Date.now() - startedAt < FEATURED_DURATION_MS;
}
