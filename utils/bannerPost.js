export const BANNER_VALIDITY_DAYS = 30;
export const BANNER_AD_PRICE_INR = 999;

export function getBannerExpiresAt(publishedAt = new Date()) {
  const expiresAt = new Date(publishedAt);
  expiresAt.setDate(expiresAt.getDate() + BANNER_VALIDITY_DAYS);
  return expiresAt;
}

export function isBannerAdActive(job) {
  if (!job?.isBannerAd || !job?.bannerUrl) return false;
  if (!job.bannerExpiresAt) return true;
  return new Date(job.bannerExpiresAt).getTime() > Date.now();
}
