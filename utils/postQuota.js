import JobPost from "../models/JobPost.js";
import User from "../models/authModal.js";
import { isFeaturedActive } from "./featured.js";
import { getVideoExpiresAt, VIDEO_POST_PRICE_INR } from "./videoPost.js";
import { getBannerExpiresAt, BANNER_AD_PRICE_INR } from "./bannerPost.js";

export const PLAN_MONTHLY_POST_LIMIT = {
  free: 1,
  pro: 1,
  business: 1,
};

export const PLAN_MONTHLY_FEATURED_LIMIT = {
  free: 0,
  pro: 1,
  business: 1,
};

export const ADDON_PRICE_INR = 99;

export function getMonthStart() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function getPlanFromUser(user) {
  const sub = user?.subscription;
  const isActivePaid =
    sub?.status === "active" && ["pro", "business"].includes(sub?.plan);
  return isActivePaid ? sub.plan : "free";
}

async function ensureQuotaPeriod(user) {
  const monthKey = getMonthKey();
  if (user.quotaMonthKey === monthKey) return user;

  if (!user.quotaMonthKey) {
    const monthStart = getMonthStart();
    const posts = await JobPost.find({
      author: user._id,
      createdAt: { $gte: monthStart },
    }).select("isFeatured createdAt featuredAt");
    user.monthlyPostCount = posts.length;
    user.monthlyFeaturedCount = posts.filter((job) => isFeaturedActive(job)).length;
  } else {
    user.monthlyPostCount = 0;
    user.monthlyFeaturedCount = 0;
  }

  user.quotaMonthKey = monthKey;
  await user.save();
  return user;
}

export async function consumePostQuota(authorId) {
  const user = await User.findById(authorId).populate("subscription");
  if (!user) return;
  await ensureQuotaPeriod(user);
  const postLimit = PLAN_MONTHLY_POST_LIMIT[getPlanFromUser(user)] ?? 1;
  const postCount = user.monthlyPostCount || 0;
  const credits = user.extraPostCredits || 0;

  if (postCount >= postLimit && credits > 0) {
    await User.updateOne(
      { _id: authorId, quotaMonthKey: getMonthKey(), extraPostCredits: { $gt: 0 } },
      { $inc: { extraPostCredits: -1 } }
    );
    return;
  }

  await User.updateOne(
    { _id: authorId, quotaMonthKey: getMonthKey() },
    { $inc: { monthlyPostCount: 1 } }
  );
}

export async function consumeFeatureQuota(authorId) {
  const user = await User.findById(authorId).populate("subscription");
  if (!user) return;
  await ensureQuotaPeriod(user);
  const featuredLimit = PLAN_MONTHLY_FEATURED_LIMIT[getPlanFromUser(user)] ?? 0;
  const featuredCount = user.monthlyFeaturedCount || 0;
  const credits = user.extraFeatureCredits || 0;

  if (featuredCount >= featuredLimit && credits > 0) {
    await User.updateOne(
      {
        _id: authorId,
        quotaMonthKey: getMonthKey(),
        extraFeatureCredits: { $gt: 0 },
      },
      { $inc: { extraFeatureCredits: -1 } }
    );
    return;
  }

  await User.updateOne(
    { _id: authorId, quotaMonthKey: getMonthKey() },
    { $inc: { monthlyFeaturedCount: 1 } }
  );
}

export async function getQuotaForUser(authorId) {
  const user = await User.findById(authorId).populate("subscription");
  await ensureQuotaPeriod(user);
  const plan = getPlanFromUser(user);
  const postCount = user.monthlyPostCount || 0;
  const featuredCount = user.monthlyFeaturedCount || 0;
  const postLimit = PLAN_MONTHLY_POST_LIMIT[plan] ?? 1;
  const featuredLimit = PLAN_MONTHLY_FEATURED_LIMIT[plan] ?? 0;
  const extraPostCredits = user.extraPostCredits || 0;
  const extraFeatureCredits = user.extraFeatureCredits || 0;
  const videoPostCredits = user.videoPostCredits || 0;
  const bannerAdCredits = user.bannerAdCredits || 0;
  const subscriptionPostsRemaining = Math.max(0, postLimit - postCount);
  const subscriptionFeaturesRemaining = Math.max(0, featuredLimit - featuredCount);

  return {
    plan,
    postCount,
    featuredCount,
    postLimit,
    featuredLimit,
    extraPostCredits,
    extraFeatureCredits,
    videoPostCredits,
    bannerAdCredits,
    subscriptionPostsUsed: postCount,
    subscriptionPostsRemaining,
    subscriptionFeaturesUsed: featuredCount,
    subscriptionFeaturesRemaining,
    extraPostPrice: ADDON_PRICE_INR,
    extraFeaturePrice: ADDON_PRICE_INR,
    videoPostPrice: VIDEO_POST_PRICE_INR,
    bannerAdPrice: BANNER_AD_PRICE_INR,
    canPostFree: subscriptionPostsRemaining > 0 || extraPostCredits > 0,
    canFeatureFree: subscriptionFeaturesRemaining > 0 || extraFeatureCredits > 0,
    canPublishVideoPost: videoPostCredits > 0,
    canPublishBannerAd: bannerAdCredits > 0,
  };
}

export function quoteAddon({ quota, wantFeatured, isNewPost }) {
  const extraPost = Boolean(isNewPost && !quota.canPostFree);
  const extraFeature = Boolean(wantFeatured && !quota.canFeatureFree);
  const amount =
    (extraPost ? ADDON_PRICE_INR : 0) + (extraFeature ? ADDON_PRICE_INR : 0);

  let kind = null;
  if (extraPost && extraFeature) kind = "extra_post_and_feature";
  else if (extraPost) kind = "extra_post";
  else if (extraFeature) kind = "extra_feature";

  return { extraPost, extraFeature, amount, kind };
}

export function sanitizeJobFields(body) {
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";

  if (!title || title.length > 11 || /\d/.test(title)) {
    return {
      error: "Title must be at most 11 characters and cannot contain numbers",
    };
  }
  if (!description || description.length > 29 || /\d/.test(description)) {
    return {
      error:
        "Description must be at most 29 characters and cannot contain numbers",
    };
  }

  const images = Array.isArray(body?.images)
    ? body.images.filter((url) => typeof url === "string" && url.trim())
    : [];

  return {
    payload: {
      title,
      description,
      categories: body?.categories,
      price: body?.price,
      location: body?.location,
      images,
      requirements: {
        gender: body?.requirements?.gender || "Any",
        minAge:
          typeof body?.requirements?.minAge === "number"
            ? body.requirements.minAge
            : null,
        maxAge:
          typeof body?.requirements?.maxAge === "number"
            ? body.requirements.maxAge
            : null,
      },
    },
  };
}

export async function createJobFromPayload(authorId, payload, { isFeatured }) {
  const job = await JobPost.create({
    author: authorId,
    title: payload.title,
    description: payload.description,
    categories: payload.categories,
    price: payload.price,
    location: payload.location,
    images: payload.images || [],
    isFeatured: Boolean(isFeatured),
    featuredAt: isFeatured ? new Date() : null,
    requirements: payload.requirements,
  });
  await consumePostQuota(authorId);
  if (isFeatured) {
    await consumeFeatureQuota(authorId);
  }
  return job;
}

export async function consumeVideoPostCredit(authorId) {
  await User.updateOne(
    { _id: authorId, videoPostCredits: { $gt: 0 } },
    { $inc: { videoPostCredits: -1 } }
  );
}

export async function createVideoJobFromPayload(authorId, payload, videoUrl) {
  const publishedAt = new Date();
  const job = await JobPost.create({
    author: authorId,
    title: payload.title,
    description: payload.description,
    categories: payload.categories,
    price: payload.price,
    location: payload.location,
    images: payload.images || [],
    isFeatured: false,
    featuredAt: null,
    isVideoPost: true,
    videoUrl,
    videoExpiresAt: getVideoExpiresAt(publishedAt),
    requirements: payload.requirements,
  });
  await consumeVideoPostCredit(authorId);
  return job;
}

export async function consumeBannerAdCredit(authorId) {
  await User.updateOne(
    { _id: authorId, bannerAdCredits: { $gt: 0 } },
    { $inc: { bannerAdCredits: -1 } }
  );
}

export async function createBannerJobFromPayload(authorId, payload, bannerUrl) {
  const publishedAt = new Date();
  const job = await JobPost.create({
    author: authorId,
    title: payload.title,
    description: payload.description,
    categories: payload.categories,
    price: payload.price,
    location: payload.location,
    images: payload.images || [],
    isFeatured: false,
    featuredAt: null,
    isBannerAd: true,
    bannerUrl,
    bannerExpiresAt: getBannerExpiresAt(publishedAt),
    requirements: payload.requirements,
  });
  await consumeBannerAdCredit(authorId);
  return job;
}

export function isAddonKind(kind) {
  return [
    "extra_post",
    "extra_feature",
    "extra_post_and_feature",
  ].includes(kind);
}

export function isCreditKind(kind) {
  return [
    "credit_extra_post",
    "credit_extra_feature",
    "credit_video_post",
    "credit_banner_ad",
  ].includes(kind);
}

export async function fulfillAddonTransaction(transaction, { providerOrderId } = {}) {
  if (transaction.status === "success" && transaction.consumedAt) {
    return { alreadyProcessed: true };
  }

  transaction.status = "success";
  transaction.paidAt = new Date();
  transaction.paymentMethod = "razorpay";
  if (providerOrderId) {
    transaction.providerOrderId = providerOrderId;
  }

  if (isCreditKind(transaction.kind)) {
    const field =
      transaction.kind === "credit_extra_feature"
        ? "extraFeatureCredits"
        : transaction.kind === "credit_video_post"
          ? "videoPostCredits"
          : transaction.kind === "credit_banner_ad"
            ? "bannerAdCredits"
            : "extraPostCredits";
    await User.findByIdAndUpdate(transaction.user, { $inc: { [field]: 1 } });
    transaction.consumedAt = new Date();
    await transaction.save();
    const user = await User.findById(transaction.user).select(
      "extraPostCredits extraFeatureCredits videoPostCredits bannerAdCredits"
    );
    return {
      credits: {
        extraPostCredits: user?.extraPostCredits || 0,
        extraFeatureCredits: user?.extraFeatureCredits || 0,
        videoPostCredits: user?.videoPostCredits || 0,
        bannerAdCredits: user?.bannerAdCredits || 0,
      },
    };
  }

  if (transaction.targetJobId) {
    await JobPost.findByIdAndUpdate(transaction.targetJobId, {
      isFeatured: true,
      featuredAt: new Date(),
    });
    await consumeFeatureQuota(transaction.user);
    transaction.consumedAt = new Date();
    await transaction.save();
    return { featuredJobId: transaction.targetJobId };
  }

  if (transaction.jobPayload) {
    const isFeatured =
      transaction.kind === "extra_feature" ||
      transaction.kind === "extra_post_and_feature";
    const job = await createJobFromPayload(transaction.user, transaction.jobPayload, {
      isFeatured,
    });
    transaction.consumedAt = new Date();
    transaction.consumedJobId = job._id;
    await transaction.save();
    return { job };
  }

  await transaction.save();
  return {};
}
