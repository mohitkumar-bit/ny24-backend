import express from "express";
import { createSubscription, getSubscriptionStatus } from "../controllers/subscriptionController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/subscribe", authMiddleware, createSubscription);
router.get("/status", authMiddleware, getSubscriptionStatus);

export default router;
