import express from "express";
import {
  createJob,
  getJobs,
  getJobById,
  getMyJobs,
  updateJob,
  deleteJob,
  uploadJobImageHandler,
  uploadJobVideoHandler,
  createVideoJob,
  createBannerJob,
  getQuota,
  createAddonOrder,
  createFeatureOrder,
  streamJobVideo,
} from "../controllers/jobController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { uploadJobImage } from "../middleware/uploadJobImage.js";
import { uploadJobVideo, videoUploadSizeMessage } from "../middleware/uploadJobVideo.js";

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
router.post(
  "/upload-video",
  authMiddleware,
  (req, res, next) => {
    uploadJobVideo(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: videoUploadSizeMessage() });
        }
        return res.status(400).json({ message: err.message || "Invalid upload" });
      }
      next();
    });
  },
  uploadJobVideoHandler
);
router.post("/video", authMiddleware, createVideoJob);
router.post("/banner", authMiddleware, createBannerJob);
router.post("/", authMiddleware, createJob);
router.get("/quota", authMiddleware, getQuota);
router.post("/addon-order", authMiddleware, createAddonOrder);
router.post("/:id/feature-order", authMiddleware, createFeatureOrder);
router.get("/", authMiddleware, getJobs);
router.get("/me", authMiddleware, getMyJobs);
router.get("/:id/video-stream", streamJobVideo);
router.get("/:id", getJobById);
router.put("/:id", authMiddleware, updateJob);
router.delete("/:id", authMiddleware, deleteJob);

export default router;
