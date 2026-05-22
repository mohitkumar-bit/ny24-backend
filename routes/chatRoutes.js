
import express from "express";
import {
  sendMessage,
  getConversations,
  getMessages,
  checkChatLimit,
  togglePinConversation,
  claimChatSlot,
} from "../controllers/chatController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/send", authMiddleware, sendMessage);
router.post("/claim-slot", authMiddleware, claimChatSlot);
router.get("/conversations", authMiddleware, getConversations);
router.get("/messages/:conversationId", authMiddleware, getMessages);
router.get("/check-limit/:receiverId", authMiddleware, checkChatLimit);
router.patch("/pin/:conversationId", authMiddleware, togglePinConversation);

export default router;
