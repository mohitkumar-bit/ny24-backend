import User from "../models/authModal.js";
import WorkerProfile from "../models/WorkerProfile.js";
import {
  assertBusinessPlan,
  formatVerificationForClient,
  hasActiveBusinessPlan,
} from "../utils/verificationHelpers.js";
import {
  isAadhaarVerifySuccess,
  isValidAadhaarNumber,
  normalizeAadhaarNumber,
  sendAadhaarOtp,
  verifyAadhaarOtp,
} from "../utils/aadhaarApi.js";

const OTP_SESSION_MS = 10 * 60 * 1000;

const getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("subscription");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({
      success: true,
      verification: formatVerificationForClient(user),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getEligibility = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("subscription");
    if (!user) return res.status(404).json({ message: "User not found" });

    const eligible = hasActiveBusinessPlan(user);
    let message = "Verification is available for Business plan (₹599) subscribers only.";

    if (user.isVerified) message = "Your account is already verified.";
    else if (user.verification?.status === "pending")
      message = "Your Aadhaar is verified. Admin approval may take up to 24 hours.";
    else if (!eligible) message = "Upgrade to the Business plan to get verified.";
    else message = "Verify your Aadhaar with OTP to submit for admin approval.";

    res.status(200).json({
      success: true,
      eligible,
      message,
      verification: formatVerificationForClient(user),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const sendAadhaarOtpHandler = async (req, res) => {
  try {
    const user = await assertBusinessPlan(req.user.id);

    if (user.isVerified) {
      return res.status(400).json({ message: "Account is already verified" });
    }

    if (user.verification?.status === "pending") {
      return res.status(400).json({ message: "Verification is already pending review" });
    }

    const aadhaarNumber = normalizeAadhaarNumber(req.body?.aadhaar_number);
    if (!isValidAadhaarNumber(aadhaarNumber)) {
      return res.status(400).json({ message: "Enter a valid 12-digit Aadhaar number" });
    }

    const apiResult = await sendAadhaarOtp(aadhaarNumber);
    if (apiResult?.status !== 200) {
      return res.status(400).json({
        message: apiResult?.message || "Could not send OTP to Aadhaar-linked mobile",
      });
    }

    const referenceId = apiResult?.data?.reference_id;
    const requestId = apiResult?.request_id;
    const maskedAadhaar = apiResult?.data?.masked_aadhaar;

    if (!referenceId) {
      return res.status(502).json({ message: "Invalid response from Aadhaar provider" });
    }

    const expiresAt = new Date(Date.now() + OTP_SESSION_MS);
    if (!user.verification) user.verification = {};
    user.verification.aadhaarOtpSession = {
      referenceId,
      requestId: requestId || null,
      maskedAadhaar: maskedAadhaar || null,
      expiresAt,
      sentAt: new Date(),
    };
    await user.save();

    res.status(200).json({
      success: true,
      message: "OTP sent to your Aadhaar-linked mobile number",
      maskedAadhaar: maskedAadhaar || null,
      expiresAt,
    });
  } catch (error) {
    if (error.message === "NOT_BUSINESS_PLAN") {
      return res.status(403).json({
        message: "Verification is only available for active Business plan subscribers",
      });
    }
    if (error.message === "AADHAAR_API_NOT_CONFIGURED") {
      return res.status(503).json({
        message: "Aadhaar verification is not configured on the server",
      });
    }
    console.error("SEND AADHAAR OTP ERROR", error);
    res.status(500).json({ message: error.message || "Server error" });
  }
};

const verifyAadhaarAndSubmit = async (req, res) => {
  try {
    const user = await assertBusinessPlan(req.user.id);

    if (user.isVerified) {
      return res.status(400).json({ message: "Account is already verified" });
    }

    if (user.verification?.status === "pending") {
      return res.status(400).json({ message: "Verification is already pending review" });
    }

    const session = user.verification?.aadhaarOtpSession;
    if (!session?.referenceId) {
      return res.status(400).json({ message: "Send OTP to your Aadhaar number first" });
    }

    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ message: "OTP expired. Please send a new OTP" });
    }

    const aadhaarNumber = normalizeAadhaarNumber(req.body?.aadhaar_number);
    const otp = String(req.body?.otp || "").trim();

    if (!isValidAadhaarNumber(aadhaarNumber)) {
      return res.status(400).json({ message: "Enter a valid 12-digit Aadhaar number" });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "Enter the 6-digit OTP" });
    }

    const apiResult = await verifyAadhaarOtp({
      aadhaarNumber,
      otp,
      referenceId: session.referenceId,
      requestId: session.requestId,
    });

    if (!isAadhaarVerifySuccess(apiResult)) {
      return res.status(400).json({
        message:
          apiResult?.message === "verification_failed"
            ? "Invalid OTP. Please check and try again"
            : apiResult?.message || "Aadhaar verification failed",
      });
    }

    user.verification = {
      status: "pending",
      submittedAt: new Date(),
      reviewedAt: null,
      rejectionReason: null,
      maskedAadhaar: session.maskedAadhaar || apiResult?.data?.masked_aadhaar || null,
      aadhaarVerifiedAt: new Date(),
      aadhaarOtpSession: null,
      selfieUrl: null,
      aadhaarUrl: null,
      panUrl: null,
    };
    user.isVerified = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Aadhaar verified. Your request is sent for admin approval (up to 24 hours).",
      verification: formatVerificationForClient(user),
    });
  } catch (error) {
    if (error.message === "NOT_BUSINESS_PLAN") {
      return res.status(403).json({
        message: "Verification is only available for active Business plan subscribers",
      });
    }
    if (error.message === "AADHAAR_API_NOT_CONFIGURED") {
      return res.status(503).json({
        message: "Aadhaar verification is not configured on the server",
      });
    }
    console.error("VERIFY AADHAAR ERROR", error);
    res.status(500).json({ message: error.message || "Server error" });
  }
};

export const approveUserVerification = async (userId) => {
  const user = await User.findById(userId);
  if (!user || user.verification?.status !== "pending") {
    throw new Error("INVALID_PENDING_REQUEST");
  }

  user.isVerified = true;
  user.verification.status = "approved";
  user.verification.reviewedAt = new Date();
  user.verification.rejectionReason = null;
  await user.save();

  await WorkerProfile.findOneAndUpdate({ user: userId }, { isVerified: true });
  return user;
};

export const rejectUserVerification = async (userId, reason) => {
  const user = await User.findById(userId);
  if (!user || user.verification?.status !== "pending") {
    throw new Error("INVALID_PENDING_REQUEST");
  }

  user.isVerified = false;
  user.verification.status = "rejected";
  user.verification.reviewedAt = new Date();
  user.verification.rejectionReason = reason || "Aadhaar could not be verified";
  user.verification.aadhaarOtpSession = null;
  await user.save();

  await WorkerProfile.findOneAndUpdate({ user: userId }, { isVerified: false });
  return user;
};

export {
  getStatus,
  getEligibility,
  sendAadhaarOtpHandler,
  verifyAadhaarAndSubmit,
};
