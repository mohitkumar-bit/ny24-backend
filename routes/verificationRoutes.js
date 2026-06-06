import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { uploadVerificationDocs } from "../middleware/uploadVerification.js";
import {
  getStatus,
  getEligibility,
  submitVerification,
} from "../controllers/verificationController.js";

const router = express.Router();

router.get("/status", authMiddleware, getStatus);
router.get("/eligibility", authMiddleware, getEligibility);
router.post(
  "/submit",
  authMiddleware,
  (req, res, next) => {
    uploadVerificationDocs(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || "Invalid upload" });
      }
      next();
    });
  },
  submitVerification
);

export default router;
