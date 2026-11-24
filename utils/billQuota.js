import User from "../models/authModal.js";
import { isSubscribed } from "./chatSlots.js";

/** Free users can generate this many bills lifetime; paid plans are unlimited. */
export const FREE_BILL_LIMIT = 20;

export function getBillQuotaSnapshot(user) {
  const subscribed = isSubscribed(user);
  const used = Math.max(0, Number(user?.billsGeneratedCount) || 0);
  const limit = subscribed ? null : FREE_BILL_LIMIT;
  const remaining = subscribed ? null : Math.max(0, FREE_BILL_LIMIT - used);
  const allowed = subscribed || used < FREE_BILL_LIMIT;

  return {
    isSubscribed: subscribed,
    used,
    limit,
    remaining,
    allowed,
  };
}

export async function getBillQuotaForUser(userId) {
  const user = await User.findById(userId).populate("subscription");
  if (!user) return null;
  return getBillQuotaSnapshot(user);
}

/**
 * Reserve one free-bill generation. Paid users are not counted.
 * Returns { ok, quota, code?, message? }.
 */
export async function consumeBillQuota(userId) {
  const user = await User.findById(userId).populate("subscription");
  if (!user) {
    return { ok: false, code: "USER_NOT_FOUND", message: "User not found" };
  }

  if (isSubscribed(user)) {
    return { ok: true, quota: getBillQuotaSnapshot(user) };
  }

  const updated = await User.findOneAndUpdate(
    {
      _id: userId,
      billsGeneratedCount: { $lt: FREE_BILL_LIMIT },
    },
    { $inc: { billsGeneratedCount: 1 } },
    { new: true }
  ).populate("subscription");

  if (!updated) {
    const latest = await User.findById(userId).populate("subscription");
    return {
      ok: false,
      code: "BILL_LIMIT_REACHED",
      message: `Free plan allows ${FREE_BILL_LIMIT} bills. Upgrade to keep generating bills.`,
      quota: getBillQuotaSnapshot(latest),
    };
  }

  return { ok: true, quota: getBillQuotaSnapshot(updated) };
}

/** Undo a free-bill consume when send fails after reservation. */
export async function refundBillQuota(userId) {
  const user = await User.findById(userId).populate("subscription");
  if (!user) return null;
  if (isSubscribed(user)) return getBillQuotaSnapshot(user);

  const updated = await User.findOneAndUpdate(
    {
      _id: userId,
      billsGeneratedCount: { $gt: 0 },
    },
    { $inc: { billsGeneratedCount: -1 } },
    { new: true }
  ).populate("subscription");

  return getBillQuotaSnapshot(updated || user);
}
