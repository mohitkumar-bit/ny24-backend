import express from "express";
import { applyToJob, getApplicationsForJob } from "../controllers/applicationController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/apply", authMiddleware, applyToJob);
router.get("/:jobId", authMiddleware, getApplicationsForJob);

export default router;
