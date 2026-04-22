import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { getSavedJobs, toggleSaveJob } from "../controllers/savedController.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", getSavedJobs);
router.post("/toggle/:jobId", toggleSaveJob);

export default router;
