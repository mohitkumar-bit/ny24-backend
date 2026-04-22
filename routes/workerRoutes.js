import express from "express";
import { createWorkerProfile, getWorkers, getMyWorkerProfile, updateWorkerProfile } from "../controllers/workerController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/create-profile", authMiddleware, createWorkerProfile);
router.put("/update-profile", authMiddleware, updateWorkerProfile);
router.get("/my-profile", authMiddleware, getMyWorkerProfile);
router.get("/search", getWorkers);

export default router;
