import express from "express";
import { createWorkerProfile, getWorkers, getMyWorkerProfile, updateWorkerProfile, getWorkerById } from "../controllers/workerController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/create-profile", authMiddleware, createWorkerProfile);
router.put("/update-profile", authMiddleware, updateWorkerProfile);
router.get("/my-profile", authMiddleware, getMyWorkerProfile);
router.get("/search", getWorkers);
router.get("/:id", getWorkerById);

export default router;
