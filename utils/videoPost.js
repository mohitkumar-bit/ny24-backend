export const VIDEO_VALIDITY_DAYS = 30;
export const VIDEO_POST_PRICE_INR = 1999;

export function getVideoExpiresAt(publishedAt = new Date()) {
  const expiresAt = new Date(publishedAt);
  expiresAt.setDate(expiresAt.getDate() + VIDEO_VALIDITY_DAYS);
  return expiresAt;
}

export function isVideoPostActive(job) {
  if (!job?.isVideoPost || !job?.videoUrl) return false;
  if (!job.videoExpiresAt) return true;
  return new Date(job.videoExpiresAt).getTime() > Date.now();
}
