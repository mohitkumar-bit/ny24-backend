import { randomUUID } from "crypto";
import Subscription from "../models/Subscription.js";
import Transaction from "../models/Transaction.js";
import User from "../models/authModal.js";
import {
  PLAN_PRICING,
  CREDIT_PRICING,
  createRazorpayOrder,
  verifyRazorpaySignature,
} from "../utils/razorpay.js";
import {
  fulfillAddonTransaction,
  isAddonKind,
  isCreditKind,
  getQuotaForUser,
} from "../utils/postQuota.js";

function buildEndDate(months) {
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + months);
  return endDate;
}

async function activatePaidSubscription({
  userId,
  plan,
  billingCycle,
  months,
  merchantOrderId,
  providerOrderId,
  amountInr,
}) {
  const existingActive = await Subscription.findOne({
    user: userId,
    status: "active",
  });
  if (existingActive) {
    existingActive.status = "cancelled";
    await existingActive.save();
  }

  let subscription = await Subscription.findOne({
    user: userId,
    providerSubscriptionId: merchantOrderId,
  });

  const startDate = new Date();
  const endDate = buildEndDate(months);

  if (subscription) {
    subscription.plan = plan;
    subscription.billingCycle = billingCycle;
    subscription.startDate = startDate;
    subscription.endDate = endDate;
    subscription.status = "active";
    subscription.paymentProvider = "razorpay";
    await subscription.save();
  } else {
    subscription = await Subscription.create({
      user: userId,
      plan,
      billingCycle,
      startDate,
      endDate,
      status: "active",
      paymentProvider: "razorpay",
      providerSubscriptionId: merchantOrderId,
    });
  }

  let transaction = await Transaction.findOne({ merchantOrderId });
  if (transaction) {
    transaction.subscription = subscription._id;
    transaction.status = "success";
    transaction.paymentMethod = "razorpay";
    transaction.providerOrderId = providerOrderId || transaction.providerOrderId;
    transaction.paidAt = new Date();
    await transaction.save();
  } else {
    transaction = await Transaction.create({
      user: userId,
      subscription: subscription._id,
      plan,
      billingCycle,
      amount: amountInr,
      status: "success",
      paymentMethod: "razorpay",
      transactionId: `RZP_${merchantOrderId}`,
      merchantOrderId,
      providerOrderId,
      paidAt: new Date(),
    });
  }

  await User.findByIdAndUpdate(userId, {
    subscription: subscription._id,
  });

  return { subscription, transaction };
}

async function markTransactionFailed(merchantOrderId) {
  const transaction = await Transaction.findOne({ merchantOrderId });
  if (transaction && transaction.status === "pending") {
    transaction.status = "failed";
    await transaction.save();
  }

  const subscription = await Subscription.findOne({
    providerSubscriptionId: merchantOrderId,
    status: "pending",
  });
  if (subscription) {
    subscription.status = "cancelled";
    await subscription.save();
  }
}

async function fulfillSuccessfulPayment(transaction, { providerOrderId }) {
  if (isAddonKind(transaction.kind) || isCreditKind(transaction.kind)) {
    const result = await fulfillAddonTransaction(transaction, { providerOrderId });
    return {
      status: "success",
      kind: transaction.kind,
      job: result.job || null,
      jobId: result.job?._id || result.featuredJobId || transaction.consumedJobId,
      credits: result.credits || null,
      transaction,
    };
  }

  const pricing = PLAN_PRICING[transaction.plan] || PLAN_PRICING.pro;
  const result = await activatePaidSubscription({
    userId: String(transaction.user),
    plan: transaction.plan,
    billingCycle: transaction.billingCycle || pricing.billingCycle,
    months: pricing.months,
    merchantOrderId: transaction.merchantOrderId,
    providerOrderId,
    amountInr: transaction.amount,
  });

  return {
    status: "success",
    subscription: result.subscription,
    transaction: result.transaction,
  };
}

/** @deprecated Prefer Razorpay create-order flow */
export const createSubscription = async (req, res) => {
  return res.status(400).json({
    message: "Dummy subscribe is disabled. Use Razorpay checkout via /subscription/create-order.",
  });
};

export const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate("subscription");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      subscription:
        user.subscription && user.subscription.status === "active"
          ? user.subscription
          : null,
    });
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Create a Razorpay order for Pro/Business subscription.
 */
export const createPaymentOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { plan } = req.body;

    const pricing = PLAN_PRICING[plan];
    if (!pricing) {
      return res.status(400).json({ message: "Invalid plan. Choose pro or business." });
    }

    const merchantOrderId = `GS_${Date.now()}_${randomUUID().slice(0, 8)}`;

    const subscription = await Subscription.create({
      user: userId,
      plan,
      billingCycle: pricing.billingCycle,
      startDate: new Date(),
      endDate: buildEndDate(pricing.months),
      status: "pending",
      paymentProvider: "razorpay",
      providerSubscriptionId: merchantOrderId,
    });

    await Transaction.create({
      user: userId,
      subscription: subscription._id,
      plan,
      billingCycle: pricing.billingCycle,
      amount: pricing.amountInr,
      status: "pending",
      paymentMethod: "razorpay",
      transactionId: `RZP_${merchantOrderId}`,
      merchantOrderId,
      kind: "subscription",
    });

    const payOrder = await createRazorpayOrder({
      merchantOrderId,
      amountInr: pricing.amountInr,
      notes: { plan, kind: "subscription", userId: String(userId) },
    });

    await Transaction.updateOne(
      { merchantOrderId },
      { providerOrderId: payOrder.razorpayOrderId }
    );

    return res.status(201).json({
      merchantOrderId,
      razorpayOrderId: payOrder.razorpayOrderId,
      keyId: payOrder.keyId,
      amount: pricing.amountInr,
      amountPaise: payOrder.amountPaise,
      currency: payOrder.currency,
      plan,
      billingCycle: pricing.billingCycle,
      months: pricing.months,
      description: `${pricing.label} plan`,
    });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    const statusCode = error?.statusCode || error?.status;
    const description =
      error?.error?.description || error?.message || "Failed to create payment order";

    if (statusCode === 401) {
      return res.status(502).json({
        message:
          "Razorpay authentication failed. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env (copy both again from Razorpay Dashboard → API Keys).",
        code: "RAZORPAY_AUTH_FAILED",
      });
    }

    return res.status(500).json({ message: description });
  }
};

/**
 * Create a Razorpay order for Extra Ad / Extra Boost credits (website).
 */
export const createCreditOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { kind } = req.body;
    const pricing = CREDIT_PRICING[kind];
    if (!pricing) {
      return res.status(400).json({
        message: "Invalid credit kind. Use credit_extra_post or credit_extra_feature.",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const quota = await getQuotaForUser(userId);
    if (quota.plan !== "pro" && quota.plan !== "business") {
      return res.status(403).json({
        message: "Extra Ad and Extra Boost require an active Pro or Business plan.",
      });
    }

    const merchantOrderId = `GS_CREDIT_${Date.now()}_${randomUUID().slice(0, 8)}`;

    await Transaction.create({
      user: userId,
      plan: quota.plan,
      amount: pricing.amountInr,
      status: "pending",
      paymentMethod: "razorpay",
      transactionId: `RZP_${merchantOrderId}`,
      merchantOrderId,
      kind,
    });

    const payOrder = await createRazorpayOrder({
      merchantOrderId,
      amountInr: pricing.amountInr,
      notes: { kind, userId: String(userId) },
    });

    await Transaction.updateOne(
      { merchantOrderId },
      { providerOrderId: payOrder.razorpayOrderId }
    );

    return res.status(201).json({
      merchantOrderId,
      razorpayOrderId: payOrder.razorpayOrderId,
      keyId: payOrder.keyId,
      amount: pricing.amountInr,
      amountPaise: payOrder.amountPaise,
      currency: payOrder.currency,
      kind,
      description: pricing.label,
    });
  } catch (error) {
    console.error("Error creating credit order:", error);
    return res.status(500).json({
      message: error?.message || "Failed to create credit order",
    });
  }
};

/**
 * Confirm Razorpay payment via checkout signature and activate plan/credits.
 */
export const verifyPaymentOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      merchantOrderId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body;

    if (!merchantOrderId) {
      return res.status(400).json({ message: "merchantOrderId is required" });
    }

    const transaction = await Transaction.findOne({ merchantOrderId, user: userId });
    if (!transaction) {
      return res.status(404).json({ message: "Payment order not found" });
    }

    if (transaction.status === "success") {
      if (isAddonKind(transaction.kind) || isCreditKind(transaction.kind)) {
        return res.json({
          status: "success",
          kind: transaction.kind,
          jobId: transaction.consumedJobId || transaction.targetJobId,
          transaction,
        });
      }
      const subscription = await Subscription.findById(transaction.subscription);
      return res.json({
        status: "success",
        subscription,
        transaction,
      });
    }

    const orderId = razorpayOrderId || transaction.providerOrderId;
    const valid = verifyRazorpaySignature({
      razorpayOrderId: orderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!valid) {
      return res.status(400).json({
        status: "failed",
        message: "Invalid payment signature",
      });
    }

    const result = await fulfillSuccessfulPayment(transaction, {
      providerOrderId: razorpayPaymentId || orderId,
    });

    return res.json(result);
  } catch (error) {
    console.error("Error verifying Razorpay order:", error);
    return res.status(500).json({
      message: error?.message || "Failed to verify payment",
    });
  }
};

/** Aliases kept for older clients / route names */
export const createPhonePeOrder = createPaymentOrder;
export const verifyPhonePeOrder = verifyPaymentOrder;

/**
 * Optional browser return page after payment (Razorpay Checkout is usually modal).
 */
export const paymentReturn = async (req, res) => {
  const merchantOrderId = String(req.query.merchantOrderId || "");
  const encodedId = encodeURIComponent(merchantOrderId);
  const rawWeb = (process.env.WEB_APP_URL || "").replace(/\/$/, "");
  const isLocalWeb = !rawWeb || /localhost|127\.0\.0\.1/i.test(rawWeb);
  const webReturn =
    !isLocalWeb && rawWeb
      ? `${rawWeb}/dashboard.html#subscription`
      : "";

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>gigSEVA Payment</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; background:#FFF8EE; color:#111; display:flex; min-height:100vh; align-items:center; justify-content:center; margin:0; padding:24px; text-align:center; }
    .card { background:#fff; border-radius:20px; padding:28px 22px; max-width:420px; box-shadow:0 10px 30px rgba(0,0,0,.08); }
    h1 { font-size:22px; margin:0 0 8px; }
    p { color:#666; line-height:1.5; }
    a { display:inline-block; margin:10px 6px 0; background:#00A300; color:#fff; text-decoration:none; padding:14px 22px; border-radius:14px; font-weight:700; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Payment complete</h1>
    <p>You can return to your account to see the updated plan.</p>
    ${webReturn ? `<a href="${webReturn}">Back to dashboard</a>` : ""}
    <p style="font-size:12px;margin-top:16px;word-break:break-all;">Order: ${merchantOrderId || "—"}</p>
  </div>
</body>
</html>`);
};

/** @deprecated PhonePe callback removed */
export const phonePeCallback = async (_req, res) => {
  return res.status(410).json({
    message: "PhonePe is no longer supported. Use Razorpay checkout.",
  });
};

export const phonePeRedirect = paymentReturn;
