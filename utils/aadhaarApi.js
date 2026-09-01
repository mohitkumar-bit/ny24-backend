const APITXT_BASE = "https://apitxt.com/api";

function getAuthKey() {
  const authkey = process.env.AADHAAR_API_AUTHKEY;
  if (!authkey) {
    throw new Error("AADHAAR_API_NOT_CONFIGURED");
  }
  return authkey;
}

export function normalizeAadhaarNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

export function isValidAadhaarNumber(value) {
  const digits = normalizeAadhaarNumber(value);
  return /^\d{12}$/.test(digits);
}

export async function sendAadhaarOtp(aadhaarNumber) {
  const authkey = getAuthKey();
  const res = await fetch(`${APITXT_BASE}/aadhaarSendOTP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      authkey,
      aadhaar_number: aadhaarNumber,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data?.status) {
    throw new Error(data?.message || "Failed to send Aadhaar OTP");
  }
  return data;
}

export async function verifyAadhaarOtp({
  aadhaarNumber,
  otp,
  referenceId,
  requestId,
}) {
  const authkey = getAuthKey();
  const body = {
    authkey,
    aadhaar_number: aadhaarNumber,
    otp: String(otp || "").trim(),
    reference_id: referenceId,
  };
  if (requestId) body.request_id = requestId;

  const res = await fetch(`${APITXT_BASE}/aadhaarVerifyOTP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data?.status) {
    throw new Error(data?.message || "Failed to verify Aadhaar OTP");
  }
  return data;
}

export function isAadhaarVerifySuccess(apiResult) {
  if (apiResult?.status !== 200) return false;
  if (apiResult?.data?.verified === true) return true;
  if (String(apiResult?.message || "").toLowerCase() === "success") return true;
  return false;
}
