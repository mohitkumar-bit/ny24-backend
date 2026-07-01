
import express from "express";
import {
  sendMessage,
  getConversations,
  getMessages,
  checkChatLimit,
  togglePinConversation,
  claimChatSlot,
  getBlockStatus,
  blockUser,
  unblockUser,
  reportUser,
  uploadChatMediaHandler,
} from "../controllers/chatController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { uploadChatMedia } from "../middleware/uploadChatMedia.js";

const router = express.Router();

router.post("/send", authMiddleware, sendMessage);
router.post(
  "/upload-media",
  authMiddleware,
  uploadChatMedia,
  uploadChatMediaHandler
);
router.post("/claim-slot", authMiddleware, claimChatSlot);
router.get("/conversations", authMiddleware, getConversations);
router.get("/messages/:conversationId", authMiddleware, getMessages);
router.get("/check-limit/:receiverId", authMiddleware, checkChatLimit);
router.patch("/pin/:conversationId", authMiddleware, togglePinConversation);
router.get("/block-status/:userId", authMiddleware, getBlockStatus);
router.post("/block/:userId", authMiddleware, blockUser);
router.delete("/block/:userId", authMiddleware, unblockUser);
router.post("/report", authMiddleware, reportUser);

export default router;
