import express from "express";
import {
  createSubscription,
  getSubscriptionStatus,
  createPaymentOrder,
  createCreditOrder,
  verifyPaymentOrder,
  paymentReturn,
  phonePeCallback,
} from "../controllers/subscriptionController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/subscribe", authMiddleware, createSubscription);
router.get("/status", authMiddleware, getSubscriptionStatus);

router.post("/create-order", authMiddleware, createPaymentOrder);
router.post("/create-credit-order", authMiddleware, createCreditOrder);
router.post("/verify-order", authMiddleware, verifyPaymentOrder);

// Optional return page + legacy PhonePe paths (gone)
router.get("/payment/return", paymentReturn);
router.get("/phonepe/redirect", paymentReturn);
router.post("/phonepe/callback", phonePeCallback);

export default router;
