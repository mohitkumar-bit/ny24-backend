import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  registerPushToken,
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/", authMiddleware, getNotifications);
router.get("/unread-count", authMiddleware, getUnreadCount);
router.patch("/:id/read", authMiddleware, markAsRead);
router.post("/read-all", authMiddleware, markAllAsRead);
router.post("/register-token", authMiddleware, registerPushToken);

export default router;
