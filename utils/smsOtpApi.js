const APITXT_BASE = "https://apitxt.com/api";

function getAuthKey() {
  const authkey = process.env.AADHAAR_API_AUTHKEY;
  if (!authkey) {
    throw new Error("AADHAAR_API_NOT_CONFIGURED");
  }
  return authkey;
}

/** Format 10-digit Indian mobile as 91XXXXXXXXXX for apitxt. */
export function toApitxtMobile(phone10, country = "91") {
  const digits = String(phone10 || "").replace(/\D/g, "");
  const local = digits.length >= 10 ? digits.slice(-10) : digits;
  const cc = String(country || "91").replace(/\D/g, "") || "91";
  return `${cc}${local}`;
}

/**
 * Send login/register OTP via apitxt.com/api/sendOTP
 * Uses the same authkey as Aadhaar verification (AADHAAR_API_AUTHKEY).
 */
export async function sendPhoneOtp({ phone, otp }) {
  const authkey = getAuthKey();
  const country = String(process.env.APITXT_OTP_COUNTRY || "91").replace(/\D/g, "") || "91";
  const mobile = toApitxtMobile(phone, country);

  const body = new URLSearchParams();
  body.set("authkey", authkey);
  body.set("mobile", mobile);
  body.set("otp", String(otp));
  body.set("country", country);

  const channel = String(process.env.APITXT_OTP_CHANNEL || "").trim();
  if (channel) body.set("channel", channel);

  const templateId = String(process.env.APITXT_OTP_TEMPLATE_ID || "").trim();
  if (templateId) body.set("template_id", templateId);

  const templateName = String(process.env.APITXT_OTP_TEMPLATE_NAME || "").trim();
  if (templateName) body.set("template_name", templateName);

  const projectRefId = String(process.env.APITXT_OTP_PROJECT_REF_ID || "").trim();
  if (projectRefId) body.set("project_ref_id", projectRefId);

  const res = await fetch(`${APITXT_BASE}/sendOTP`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json().catch(() => ({}));
  const status = String(data?.status || "").toLowerCase();
  const ok = status === "success" || status === "ok" || res.ok;

  if (!ok) {
    const message =
      data?.message ||
      data?.error ||
      (res.status === 401 ? "OTP SMS auth failed" : "Failed to send OTP SMS");
    const err = new Error(message);
    err.apiResult = data;
    err.statusCode = res.status;
    throw err;
  }

  return data;
}
