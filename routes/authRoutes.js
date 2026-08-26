import express from "express";
import {
  register,
  login,
  sendOtp,
  verifyOtp,
  logout,
  refreshAccessToken,
  getProfile,
  updateProfile,
  uploadProfilePictureHandler,
  removeProfilePictureHandler,
  changePassword,
} from "../controllers/authController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { uploadJobImage } from "../middleware/uploadJobImage.js";

const router = express.Router();

router.get("/me", authMiddleware, getProfile);
router.patch("/me", authMiddleware, updateProfile);
router.post(
  "/upload-profile-picture",
  authMiddleware,
  (req, res, next) => {
    uploadJobImage(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || "Invalid upload" });
      }
      next();
    });
  },
  uploadProfilePictureHandler
);
router.delete("/profile-picture", authMiddleware, removeProfilePictureHandler);
router.post("/change-password", authMiddleware, changePassword);
router.post("/register", register);
router.post("/login", login);
router.post("/otp/send", sendOtp);
router.post("/otp/verify", verifyOtp);
router.post("/logout", authMiddleware, logout);
router.post("/refresh", refreshAccessToken);

export default router;
