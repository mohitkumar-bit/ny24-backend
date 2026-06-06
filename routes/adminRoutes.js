import express from "express";
import adminMiddleware from "../middleware/adminMiddleware.js";
import {
  listPending,
  approveVerification,
  rejectVerification,
} from "../controllers/adminVerificationController.js";

const router = express.Router();

router.get("/verifications/pending", adminMiddleware, listPending);
router.post("/verifications/:userId/approve", adminMiddleware, approveVerification);
router.post("/verifications/:userId/reject", adminMiddleware, rejectVerification);

export default router;
