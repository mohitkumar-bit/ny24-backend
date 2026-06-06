import User from "../models/authModal.js";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const hasActiveBusinessPlan = (user) => {
  const sub = user?.subscription;
  return sub?.plan === "business" && sub?.status === "active";
};

export const formatVerificationForClient = (user) => {
  const v = user.verification || {};
  const submittedAt = v.submittedAt ? new Date(v.submittedAt) : null;
  const canReviewAt = submittedAt
    ? new Date(submittedAt.getTime() + TWENTY_FOUR_HOURS_MS)
    : null;
  const msUntilReview = canReviewAt
    ? Math.max(0, canReviewAt.getTime() - Date.now())
    : 0;

  return {
    isVerified: !!user.isVerified,
    status: v.status || "none",
    submittedAt: v.submittedAt,
    reviewedAt: v.reviewedAt,
    rejectionReason: v.rejectionReason,
    canReviewAt,
    hoursUntilReview: Math.ceil(msUntilReview / (60 * 60 * 1000)),
    canSubmit: hasActiveBusinessPlan(user) && !user.isVerified && v.status !== "pending",
    eligible: hasActiveBusinessPlan(user),
  };
};

export const assertBusinessPlan = async (userId) => {
  const user = await User.findById(userId).populate("subscription");
  if (!user) throw new Error("USER_NOT_FOUND");
  if (!hasActiveBusinessPlan(user)) throw new Error("NOT_BUSINESS_PLAN");
  return user;
};

export const canAdminApprove = (submittedAt) => {
  if (!submittedAt) return false;
  return Date.now() - new Date(submittedAt).getTime() >= TWENTY_FOUR_HOURS_MS;
};
