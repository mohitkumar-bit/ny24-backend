import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  createCallRequest,
  getIncomingCallRequests,
  acceptCallRequest,
  declineCallRequest,
} from "../controllers/callRequestController.js";

const router = express.Router();

router.post("/", authMiddleware, createCallRequest);
router.get("/incoming", authMiddleware, getIncomingCallRequests);
router.post("/:id/accept", authMiddleware, acceptCallRequest);
router.post("/:id/decline", authMiddleware, declineCallRequest);

export default router;
