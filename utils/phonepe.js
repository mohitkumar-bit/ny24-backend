import { StandardCheckoutClient, Env, StandardCheckoutPayRequest } from "@phonepe-pg/pg-sdk-node";

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

export function getPhonePeClient() {
  if (clientInstance) return clientInstance;

  const clientId = process.env.PHONEPE_CLIENT_ID;
  const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
  const clientVersion = Number(process.env.PHONEPE_CLIENT_VERSION || 1);
  const envName = (process.env.PHONEPE_ENV || "SANDBOX").toUpperCase();

  if (!clientId || !clientSecret) {
    throw new Error("PhonePe credentials are missing. Set PHONEPE_CLIENT_ID and PHONEPE_CLIENT_SECRET.");
  }

  const env = envName === "PRODUCTION" ? Env.PRODUCTION : Env.SANDBOX;
  clientInstance = StandardCheckoutClient.getInstance(
    clientId,
    clientSecret,
    clientVersion,
    env
  );
  return clientInstance;
}

export function getPublicBaseUrl() {
  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "PUBLIC_BASE_URL is required for PhonePe redirects/callbacks (use your ngrok https URL)."
    );
  }
  return base;
}

export function rupeesToPaise(amountInr) {
  return Math.round(Number(amountInr) * 100);
}

export async function createPhonePeCheckout({ merchantOrderId, amountInr, redirectUrl }) {
  const client = getPhonePeClient();
  const request = StandardCheckoutPayRequest.builder()
    .merchantOrderId(merchantOrderId)
    .amount(rupeesToPaise(amountInr))
    .redirectUrl(redirectUrl)
    .build();

  return client.pay(request);
}

export async function getPhonePeOrderStatus(merchantOrderId) {
  const client = getPhonePeClient();
  return client.getOrderStatus(merchantOrderId);
}

export function validatePhonePeCallback(authorizationHeader, bodyString) {
  const username = process.env.PHONEPE_CALLBACK_USERNAME;
  const password = process.env.PHONEPE_CALLBACK_PASSWORD;
  if (!username || !password) {
    return null;
  }
  const client = getPhonePeClient();
  return client.validateCallback(
    username,
    password,
    authorizationHeader,
    bodyString
  );
}
