import { randomUUID } from "crypto";
import Subscription from "../models/Subscription.js";
import Transaction from "../models/Transaction.js";
import User from "../models/authModal.js";
import {
  PLAN_PRICING,
  createPhonePeCheckout,
  getPhonePeOrderStatus,
  getPublicBaseUrl,
  validatePhonePeCallback,
} from "../utils/phonepe.js";
import { fulfillAddonTransaction, isAddonKind } from "../utils/postQuota.js";

const SUCCESS_STATES = new Set(["COMPLETED", "SUCCESS", "PAID"]);

function buildEndDate(months) {
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + months);
  return endDate;
}

async function activatePaidSubscription({ userId, plan, billingCycle, months, merchantOrderId, providerOrderId, amountInr }) {
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
    subscription.paymentProvider = "phonepe";
    await subscription.save();
  } else {
    subscription = await Subscription.create({
      user: userId,
      plan,
      billingCycle,
      startDate,
      endDate,
      status: "active",
      paymentProvider: "phonepe",
      providerSubscriptionId: merchantOrderId,
    });
  }

  let transaction = await Transaction.findOne({ merchantOrderId });
  if (transaction) {
    transaction.subscription = subscription._id;
    transaction.status = "success";
    transaction.paymentMethod = "phonepe";
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
      paymentMethod: "phonepe",
      transactionId: `PHONEPE_${merchantOrderId}`,
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

function isPaymentSuccessful(state) {
  return SUCCESS_STATES.has(String(state || "").toUpperCase());
}

/** @deprecated Prefer PhonePe create-order flow */
export const createSubscription = async (req, res) => {
  return res.status(400).json({
    message: "Dummy subscribe is disabled. Use PhonePe checkout via /subscription/create-order.",
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
 * Create a PhonePe Standard Checkout order for Pro/Business.
 */
export const createPhonePeOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { plan } = req.body;

    const pricing = PLAN_PRICING[plan];
    if (!pricing) {
      return res.status(400).json({ message: "Invalid plan. Choose pro or business." });
    }

    const merchantOrderId = `GS_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const publicBase = getPublicBaseUrl();
    const redirectUrl = `${publicBase}/api/subscription/phonepe/redirect?merchantOrderId=${encodeURIComponent(merchantOrderId)}`;

    const subscription = await Subscription.create({
      user: userId,
      plan,
      billingCycle: pricing.billingCycle,
      startDate: new Date(),
      endDate: buildEndDate(pricing.months),
      status: "pending",
      paymentProvider: "phonepe",
      providerSubscriptionId: merchantOrderId,
    });

    await Transaction.create({
      user: userId,
      subscription: subscription._id,
      plan,
      billingCycle: pricing.billingCycle,
      amount: pricing.amountInr,
      status: "pending",
      paymentMethod: "phonepe",
      transactionId: `PHONEPE_${merchantOrderId}`,
      merchantOrderId,
    });

    const payResponse = await createPhonePeCheckout({
      merchantOrderId,
      amountInr: pricing.amountInr,
      redirectUrl,
    });

    const checkoutUrl = payResponse?.redirectUrl || payResponse?.redirect_url;
    if (!checkoutUrl) {
      await markTransactionFailed(merchantOrderId);
      return res.status(502).json({
        message: "PhonePe did not return a checkout URL",
        details: payResponse,
      });
    }

    return res.status(201).json({
      merchantOrderId,
      checkoutUrl,
      amount: pricing.amountInr,
      plan,
      billingCycle: pricing.billingCycle,
      months: pricing.months,
    });
  } catch (error) {
    console.error("Error creating PhonePe order:", error);
    return res.status(500).json({
      message: error?.message || "Failed to create PhonePe order",
    });
  }
};

/**
 * Confirm payment with PhonePe order status and activate subscription.
 */
export const verifyPhonePeOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { merchantOrderId } = req.body;

    if (!merchantOrderId) {
      return res.status(400).json({ message: "merchantOrderId is required" });
    }

    const transaction = await Transaction.findOne({ merchantOrderId, user: userId });
    if (!transaction) {
      return res.status(404).json({ message: "Payment order not found" });
    }

    if (transaction.status === "success") {
      if (isAddonKind(transaction.kind)) {
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

    const orderStatus = await getPhonePeOrderStatus(merchantOrderId);
    const state = orderStatus?.state || orderStatus?.orderState || orderStatus?.paymentState;

    if (isPaymentSuccessful(state)) {
      if (isAddonKind(transaction.kind)) {
        const result = await fulfillAddonTransaction(transaction, {
          providerOrderId: orderStatus?.orderId,
        });
        return res.json({
          status: "success",
          kind: transaction.kind,
          job: result.job || null,
          jobId: result.job?._id || result.featuredJobId || transaction.consumedJobId,
          transaction,
        });
      }

      const pricing = PLAN_PRICING[transaction.plan] || PLAN_PRICING.pro;
      const result = await activatePaidSubscription({
        userId,
        plan: transaction.plan,
        billingCycle: transaction.billingCycle || pricing.billingCycle,
        months: pricing.months,
        merchantOrderId,
        providerOrderId: orderStatus?.orderId || orderStatus?.paymentDetails?.[0]?.transactionId,
        amountInr: transaction.amount,
      });

      return res.json({
        status: "success",
        state,
        subscription: result.subscription,
        transaction: result.transaction,
      });
    }

    const failedStates = new Set(["FAILED", "PAYMENT_ERROR", "DECLINED", "CANCELLED", "CANCELED"]);
    if (failedStates.has(String(state || "").toUpperCase())) {
      await markTransactionFailed(merchantOrderId);
      return res.json({ status: "failed", state });
    }

    return res.json({ status: "pending", state: state || "PENDING" });
  } catch (error) {
    console.error("Error verifying PhonePe order:", error);
    return res.status(500).json({
      message: error?.message || "Failed to verify payment",
    });
  }
};

/**
 * Browser landing page after PhonePe checkout.
 * Opens the native app via deep link (Android intent + gigseva://).
 * Never auto-redirects to localhost WEB_APP_URL.
 */
export const phonePeRedirect = async (req, res) => {
  const merchantOrderId = String(req.query.merchantOrderId || "");
  const encodedId = encodeURIComponent(merchantOrderId);
  const deepLink = `gigseva://payment?merchantOrderId=${encodedId}`;
  // Android Chrome often blocks custom schemes — Intent URL is more reliable
  const androidIntent =
    `intent://payment?merchantOrderId=${encodedId}` +
    `#Intent;scheme=gigseva;package=com.tripledots.geegseva;end`;

  const rawWeb = (process.env.WEB_APP_URL || "").replace(/\/$/, "");
  const isLocalWeb =
    !rawWeb ||
    /localhost|127\.0\.0\.1/i.test(rawWeb);
  const webReturn =
    !isLocalWeb && rawWeb
      ? `${rawWeb}/payment?merchantOrderId=${encodedId}`
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
    <p>Tap below to return to the gigSEVA app and confirm your plan.</p>
    <a id="openApp" href="${deepLink}">Open gigSEVA app</a>
  </div>
  <script>
    (function () {
      var deepLink = ${JSON.stringify(deepLink)};
      var androidIntent = ${JSON.stringify(androidIntent)};
      var isAndroid = /Android/i.test(navigator.userAgent);
      var target = isAndroid ? androidIntent : deepLink;
      document.getElementById('openApp').setAttribute('href', target);
      // Auto-open app — do NOT fall back to localhost web
      setTimeout(function () { window.location.href = target; }, 300);
      setTimeout(function () { window.location.href = deepLink; }, 900);
    })();
  </script>
</body>
</html>`);
};

/**
 * Server-to-server callback from PhonePe (configure this URL in PhonePe dashboard via ngrok).
 */
export const phonePeCallback = async (req, res) => {
  try {
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const authHeader =
      req.headers["authorization"] ||
      req.headers["x-verify"] ||
      req.headers["x-phonepe-signature"] ||
      "";

    let merchantOrderId =
      req.body?.payload?.merchantOrderId ||
      req.body?.payload?.orderId ||
      req.body?.merchantOrderId ||
      null;
    let state = req.body?.payload?.state || req.body?.state || null;

    const validated = validatePhonePeCallback(authHeader, rawBody);
    if (validated?.payload) {
      merchantOrderId =
        validated.payload.merchantOrderId ||
        validated.payload.orderId ||
        merchantOrderId;
      state = validated.payload.state || state;
    }

    if (!merchantOrderId) {
      return res.status(400).json({ message: "Invalid callback payload" });
    }

    const transaction = await Transaction.findOne({ merchantOrderId });
    if (!transaction) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (transaction.status === "success") {
      return res.json({ success: true, alreadyProcessed: true });
    }

    // Prefer live status check over trusting callback body alone
    const orderStatus = await getPhonePeOrderStatus(merchantOrderId);
    state = orderStatus?.state || state;

    if (isPaymentSuccessful(state)) {
      if (isAddonKind(transaction.kind)) {
        await fulfillAddonTransaction(transaction, {
          providerOrderId: orderStatus?.orderId,
        });
        return res.json({ success: true, status: "success", kind: transaction.kind });
      }

      const pricing = PLAN_PRICING[transaction.plan] || PLAN_PRICING.pro;
      await activatePaidSubscription({
        userId: String(transaction.user),
        plan: transaction.plan,
        billingCycle: transaction.billingCycle || pricing.billingCycle,
        months: pricing.months,
        merchantOrderId,
        providerOrderId: orderStatus?.orderId,
        amountInr: transaction.amount,
      });
      return res.json({ success: true, status: "success" });
    }

    if (["FAILED", "PAYMENT_ERROR", "DECLINED", "CANCELLED", "CANCELED"].includes(String(state || "").toUpperCase())) {
      await markTransactionFailed(merchantOrderId);
      return res.json({ success: true, status: "failed" });
    }

    return res.json({ success: true, status: "pending", state });
  } catch (error) {
    console.error("PhonePe callback error:", error);
    return res.status(500).json({ message: "Callback processing failed" });
  }
};
