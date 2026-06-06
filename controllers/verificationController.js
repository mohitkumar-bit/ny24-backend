import User from "../models/authModal.js";
import WorkerProfile from "../models/WorkerProfile.js";
import { uploadToCloudinary, isCloudinaryConfigured } from "../utils/cloudinary.js";
import {
  assertBusinessPlan,
  formatVerificationForClient,
  hasActiveBusinessPlan,
} from "../utils/verificationHelpers.js";

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
      message = "Your documents are under review. Please wait up to 24 hours.";
    else if (!eligible) message = "Upgrade to the Business plan to get verified.";
    else message = "You can submit verification documents.";

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

const submitVerification = async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        message: "Image upload is not configured. Add Cloudinary credentials to the server.",
      });
    }

    const user = await assertBusinessPlan(req.user.id);

    if (user.isVerified) {
      return res.status(400).json({ message: "Account is already verified" });
    }

    if (user.verification?.status === "pending") {
      return res.status(400).json({ message: "Verification is already pending review" });
    }

    const { selfie, aadhaar, pan } = req.files || {};
    if (!selfie?.[0] || !aadhaar?.[0] || !pan?.[0]) {
      return res.status(400).json({
        message: "Selfie, Aadhaar card, and PAN card photos are required",
      });
    }

    const [selfieUrl, aadhaarUrl, panUrl] = await Promise.all([
      uploadToCloudinary(selfie[0].buffer, `${req.user.id}/selfie`),
      uploadToCloudinary(aadhaar[0].buffer, `${req.user.id}/aadhaar`),
      uploadToCloudinary(pan[0].buffer, `${req.user.id}/pan`),
    ]);

    user.verification = {
      status: "pending",
      submittedAt: new Date(),
      reviewedAt: null,
      selfieUrl,
      aadhaarUrl,
      panUrl,
      rejectionReason: null,
    };
    user.isVerified = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Documents submitted. Review may take up to 24 hours.",
      verification: formatVerificationForClient(user),
    });
  } catch (error) {
    if (error.message === "NOT_BUSINESS_PLAN") {
      return res.status(403).json({
        message: "Verification is only available for active Business plan subscribers",
      });
    }
    console.error("SUBMIT VERIFICATION ERROR", error);
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
  user.verification.rejectionReason = reason || "Documents could not be verified";
  await user.save();

  await WorkerProfile.findOneAndUpdate({ user: userId }, { isVerified: false });
  return user;
};

export { getStatus, getEligibility, submitVerification };
