import User from "../models/authModal.js";
import {
  approveUserVerification,
  rejectUserVerification,
} from "./verificationController.js";
import { canAdminApprove } from "../utils/verificationHelpers.js";

const listPending = async (req, res) => {
  try {
    const users = await User.find({ "verification.status": "pending" })
      .select("name email verification createdAt")
      .sort("-verification.submittedAt");

    const list = users.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      submittedAt: u.verification?.submittedAt,
      canApprove: canAdminApprove(u.verification?.submittedAt),
      selfieUrl: u.verification?.selfieUrl,
      aadhaarUrl: u.verification?.aadhaarUrl,
      panUrl: u.verification?.panUrl,
    }));

    res.status(200).json({ success: true, pending: list });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const approveVerification = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user || user.verification?.status !== "pending") {
      return res.status(404).json({ message: "Pending verification not found" });
    }

    if (!canAdminApprove(user.verification.submittedAt)) {
      return res.status(400).json({
        message: "Must wait 24 hours after submission before approval",
      });
    }

    await approveUserVerification(req.params.userId);
    res.status(200).json({ success: true, message: "User verified successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const rejectVerification = async (req, res) => {
  try {
    const { reason } = req.body;
    await rejectUserVerification(req.params.userId, reason);
    res.status(200).json({ success: true, message: "Verification rejected" });
  } catch (error) {
    if (error.message === "INVALID_PENDING_REQUEST") {
      return res.status(404).json({ message: "Pending verification not found" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

export { listPending, approveVerification, rejectVerification };
