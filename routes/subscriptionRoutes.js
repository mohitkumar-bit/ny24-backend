import express from "express";
import {
  createSubscription,
  getSubscriptionStatus,
  createPhonePeOrder,
  verifyPhonePeOrder,
  phonePeRedirect,
  phonePeCallback,
} from "../controllers/subscriptionController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/subscribe", authMiddleware, createSubscription);
router.get("/status", authMiddleware, getSubscriptionStatus);

router.post("/create-order", authMiddleware, createPhonePeOrder);
router.post("/verify-order", authMiddleware, verifyPhonePeOrder);

// Public PhonePe endpoints (HTTPS via ngrok)
router.get("/phonepe/redirect", phonePeRedirect);
router.post("/phonepe/callback", phonePeCallback);

export default router;
