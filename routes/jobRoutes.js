import express from "express";
import {
  createJob,
  getJobs,
  getJobById,
  getMyJobs,
  updateJob,
  deleteJob,
  uploadJobImageHandler,
} from "../controllers/jobController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { uploadJobImage } from "../middleware/uploadJobImage.js";

const router = express.Router();

router.post(
  "/upload-image",
  authMiddleware,
  (req, res, next) => {
    uploadJobImage(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || "Invalid upload" });
      }
      next();
    });
  },
  uploadJobImageHandler
);
router.post("/", authMiddleware, createJob);
router.get("/", authMiddleware, getJobs);
router.get("/me", authMiddleware, getMyJobs);
router.get("/:id", getJobById);
router.put("/:id", authMiddleware, updateJob);
router.delete("/:id", authMiddleware, deleteJob);

export default router;
