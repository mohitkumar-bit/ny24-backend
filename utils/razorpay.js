import crypto from "crypto";
import Razorpay from "razorpay";

let clientInstance = null;

export const PLAN_PRICING = {
  pro: {
    amountInr: 99,
    months: 1,
    billingCycle: "monthly",
    label: "Pro",
  },
  business: {
    amountInr: 599,
    months: 6,
    billingCycle: "yearly",
    label: "Business",
  },
};

export const CREDIT_PRICING = {
  credit_extra_post: {
    amountInr: 99,
    label: "Extra Ad",
  },
  credit_extra_feature: {
    amountInr: 99,
    label: "Extra Boost",
  },
};

export function getRazorpayClient() {
  if (clientInstance) return clientInstance;

  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay credentials are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
    );
  }

  clientInstance = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
  return clientInstance;
}

export function getRazorpayKeyId() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  if (!keyId) {
    throw new Error("RAZORPAY_KEY_ID is missing");
  }
  return keyId;
}

export function getPublicBaseUrl() {
  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!base) {
    throw new Error("PUBLIC_BASE_URL is required");
  }
  return base;
}

export function rupeesToPaise(amountInr) {
  return Math.round(Number(amountInr) * 100);
}

export async function createRazorpayOrder({
  merchantOrderId,
  amountInr,
  notes = {},
}) {
  const client = getRazorpayClient();
  const amountPaise = rupeesToPaise(amountInr);

  const order = await client.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: String(merchantOrderId).slice(0, 40),
    notes: {
      merchantOrderId,
      ...notes,
    },
  });

  return {
    razorpayOrderId: order.id,
    amountPaise,
    currency: order.currency || "INR",
    amountInr: Number(amountInr),
    keyId: getRazorpayKeyId(),
    raw: order,
  };
}

export function verifyRazorpaySignature({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) {
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keySecret) {
    throw new Error("RAZORPAY_KEY_SECRET is missing");
  }
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return false;
  }

  const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(payload)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(String(razorpaySignature))
    );
  } catch {
    return false;
  }
}
