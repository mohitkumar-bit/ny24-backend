/** Featured placement lasts 30 days from post creation */
export const FEATURED_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function isFeaturedActive(job) {
  if (!job?.isFeatured) return false;
  const createdAt = job.createdAt ? new Date(job.createdAt).getTime() : NaN;
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt < FEATURED_DURATION_MS;
}
