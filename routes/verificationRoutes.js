import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getStatus,
  getEligibility,
  sendAadhaarOtpHandler,
  verifyAadhaarAndSubmit,
} from "../controllers/verificationController.js";

const router = express.Router();

router.get("/status", authMiddleware, getStatus);
router.get("/eligibility", authMiddleware, getEligibility);
router.post("/aadhaar/send-otp", authMiddleware, sendAadhaarOtpHandler);
router.post("/aadhaar/verify", authMiddleware, verifyAadhaarAndSubmit);

export default router;
