import JobPost from "../models/JobPost.js";
import User from "../models/authModal.js";
import { isFeaturedActive } from "./featured.js";

export const PLAN_MONTHLY_POST_LIMIT = {
  free: 1,
  pro: 1,
  business: 3,
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

export function getPlanFromUser(user) {
  const sub = user?.subscription;
  const isActivePaid =
    sub?.status === "active" && ["pro", "business"].includes(sub?.plan);
  return isActivePaid ? sub.plan : "free";
}

export async function getQuotaForUser(authorId) {
  const user = await User.findById(authorId).populate("subscription");
  const plan = getPlanFromUser(user);
  const monthStart = getMonthStart();
  const posts = await JobPost.find({
    author: authorId,
    createdAt: { $gte: monthStart },
  }).select("isFeatured createdAt featuredAt");

  const postCount = posts.length;
  const featuredCount = posts.filter((job) => isFeaturedActive(job)).length;
  const postLimit = PLAN_MONTHLY_POST_LIMIT[plan] ?? 1;
  const featuredLimit = PLAN_MONTHLY_FEATURED_LIMIT[plan] ?? 0;

  return {
    plan,
    postCount,
    featuredCount,
    postLimit,
    featuredLimit,
    extraPostPrice: ADDON_PRICE_INR,
    extraFeaturePrice: ADDON_PRICE_INR,
    canPostFree: postCount < postLimit,
    canFeatureFree: featuredCount < featuredLimit,
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
  return JobPost.create({
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
}

export function isAddonKind(kind) {
  return [
    "extra_post",
    "extra_feature",
    "extra_post_and_feature",
  ].includes(kind);
}

export async function fulfillAddonTransaction(transaction, { providerOrderId } = {}) {
  if (transaction.status === "success" && transaction.consumedAt) {
    return { alreadyProcessed: true };
  }

  transaction.status = "success";
  transaction.paidAt = new Date();
  if (providerOrderId) {
    transaction.providerOrderId = providerOrderId;
  }

  if (transaction.targetJobId) {
    await JobPost.findByIdAndUpdate(transaction.targetJobId, {
      isFeatured: true,
      featuredAt: new Date(),
    });
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
