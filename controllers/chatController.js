import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/authModal.js";
import {
  claimSlot,
  claimSlotOnPin,
  releaseSlotOnUnpin,
  cleanupExpiredSlots,
  cleanupOrphanedSlots,
  resolveOrCreateConversation,
  getActiveConversationIds,
  getSlotInfoForConversation,
  getSlotLimit,
  isSubscribed,
  findSlot,
  countActiveSlots,
  sortConversationsForFreeUser,
} from "../utils/chatSlots.js";
import { assertCanMessage, hasBlockBetween } from "../utils/chatBlock.js";
import ChatReport from "../models/ChatReport.js";
import { isCloudinaryConfigured, uploadToCloudinary } from "../utils/cloudinary.js";
import { notifyUser, getChatMessagePreview } from "../utils/pushNotifyUser.js";

export const claimChatSlot = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, receiverId } = req.body;

    let user = await User.findById(userId).populate("subscription");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (isSubscribed(user)) {
      return res.json({ allowed: true, isSubscribed: true });
    }

    const { conversation, targetConversationId } =
      await resolveOrCreateConversation(userId, receiverId, conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const otherParticipant = conversation.participants.find(
      (p) => p.toString() !== userId
    );
    if (otherParticipant) {
      const blockCheck = await assertCanMessage(userId, otherParticipant);
      if (blockCheck) {
        return res.status(403).json({
          allowed: false,
          message: blockCheck.message,
          code: blockCheck.code,
          blockedByMe: blockCheck.blockedByMe,
        });
      }
    }

    const result = await claimSlot(user, targetConversationId);

    if (!result.ok) {
      return res.status(403).json({
        allowed: false,
        message: result.message,
        code: result.code,
        limit: result.limit,
      });
    }

    res.json({
      allowed: true,
      conversationId: targetConversationId,
      openedAt: result.openedAt,
      expiresAt: result.expiresAt,
      isPinned: result.isPinned,
      slotsUsed: countActiveSlots(user),
      slotLimit: getSlotLimit(user),
    });
  } catch (error) {
    console.error("Error claiming chat slot:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const {
      receiverId,
      conversationId,
      text,
      mediaUrl,
      messageType: requestedType,
      mediaDuration,
    } = req.body;
    const senderId = req.user.id;

    const hasText = Boolean(text?.trim());
    const hasMedia = Boolean(mediaUrl?.trim());

    if (!hasText && !hasMedia) {
      return res.status(400).json({
        message: "Message text or media is required",
      });
    }

    let messageType = requestedType || (hasMedia ? "image" : "text");
    if (!["text", "image", "audio"].includes(messageType)) {
      return res.status(400).json({ message: "Invalid message type" });
    }
    if ((messageType === "image" || messageType === "audio") && !hasMedia) {
      return res.status(400).json({ message: "Media URL is required" });
    }
    if (messageType === "text" && !hasText) {
      return res.status(400).json({ message: "Message text is required" });
    }

    let user = await User.findById(senderId).populate("subscription");

    const { conversation, targetReceiverId, targetConversationId } =
      await resolveOrCreateConversation(senderId, receiverId, conversationId);

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation not found and no valid receiver provided",
      });
    }

    const blockCheck = await assertCanMessage(senderId, targetReceiverId);
    if (blockCheck) {
      return res.status(403).json({
        message: blockCheck.message,
        code: blockCheck.code,
        blockedByMe: blockCheck.blockedByMe,
      });
    }

    if (!isSubscribed(user)) {
      const slotResult = await claimSlot(user, targetConversationId);
      if (!slotResult.ok) {
        return res.status(403).json({
          message: slotResult.message,
          code: slotResult.code,
          limit: slotResult.limit,
        });
      }
      user = await User.findById(senderId).populate("subscription");
    }

    const message = await Message.create({
      conversationId: targetConversationId,
      sender: senderId,
      receiver: targetReceiverId,
      text:
        messageType === "text"
          ? text.trim()
          : text?.trim() || "",
      messageType,
      mediaUrl: hasMedia ? mediaUrl.trim() : undefined,
      mediaDuration:
        messageType === "audio" && mediaDuration != null
          ? Number(mediaDuration)
          : undefined,
    });

    const now = new Date();
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = now;
    await conversation.save();

    const slotInfo = getSlotInfoForConversation(user, targetConversationId);

    const sender = await User.findById(senderId).select("name");
    notifyUser({
      userId: targetReceiverId,
      title: sender?.name || "New message",
      body: getChatMessagePreview(messageType, text),
      type: "chat",
      channelId: "chat",
      data: {
        type: "chat",
        conversationId: targetConversationId.toString(),
        senderId: senderId.toString(),
        messageId: message._id.toString(),
      },
    });

    res.status(201).json({
      ...message._doc,
      conversationId: targetConversationId,
      slotInfo,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const checkChatLimit = async (req, res) => {
  try {
    const { receiverId } = req.params;
    const userId = req.user.id;

    const blockCheck = await assertCanMessage(userId, receiverId);
    if (blockCheck) {
      return res.status(403).json({
        allowed: false,
        message: blockCheck.message,
        code: blockCheck.code,
        blockedByMe: blockCheck.blockedByMe,
      });
    }

    let user = await User.findById(userId).populate("subscription");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (isSubscribed(user)) {
      return res.json({ allowed: true, isSubscribed: true });
    }

    await cleanupExpiredSlots(user);
    user = await User.findById(userId).populate("subscription");

    const existingConv = await Conversation.findOne({
      participants: { $all: [userId, receiverId] },
    });

    if (existingConv) {
      const existing = findSlot(user, existingConv._id);
      const pinnedIds = new Set(
        (user.pinnedConversations || []).map((id) => id.toString())
      );
      if (
        existing &&
        (pinnedIds.has(existingConv._id.toString()) ||
          !existing.expiresAt ||
          new Date(existing.expiresAt) > new Date())
      ) {
        return res.json({ allowed: true, conversationId: existingConv._id });
      }
    }

    const limit = getSlotLimit(user);
    if (countActiveSlots(user) >= limit) {
      return res.status(403).json({
        allowed: false,
        message: `All ${limit} chat slots are in use. Wait for a slot to expire, unpin a chat, or upgrade.`,
        code: "CHAT_LIMIT_REACHED",
        limit,
      });
    }

    res.json({ allowed: true, slotsAvailable: limit - countActiveSlots(user) });
  } catch (error) {
    console.error("Error checking chat limit:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    let user = await User.findById(userId).populate("subscription");
    const subscribed = isSubscribed(user);

    if (!subscribed) {
      await cleanupOrphanedSlots(user);
      user = await User.findById(userId).populate("subscription");
      await cleanupExpiredSlots(user);
      user = await User.findById(userId).populate("subscription");
    }

    const conversations = await Conversation.find({ participants: userId })
      .populate({ path: "participants", select: "name email phone profilePicture" })
      .populate("lastMessage")
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    const pinnedIds = (user.pinnedConversations || []).map((id) =>
      id.toString()
    );

    const activeSlotIds = new Set(
      getActiveConversationIds(user).map((id) => id.toString())
    );

    const formattedConversations = await Promise.all(
      conversations.map(async (conv) => {
        const otherUser = conv.participants.find(
          (p) => p._id.toString() !== userId
        );

        const unreadCount = await Message.countDocuments({
          conversationId: conv._id,
          receiver: userId,
          isRead: false,
        });

        const slotInfo = getSlotInfoForConversation(user, conv._id);
        const hasActiveSlot = activeSlotIds.has(conv._id.toString());
        const blockStatus = otherUser
          ? await hasBlockBetween(userId, otherUser._id)
          : { blocked: false };

        return {
          ...conv._doc,
          otherUser,
          isPinned: pinnedIds.includes(conv._id.toString()),
          unreadCount,
          slotInfo,
          hasActiveSlot,
          isBlocked: blockStatus.blocked,
          blockedByMe: blockStatus.blockedByMe || false,
          lastMessageAt:
            conv.lastMessageAt ||
            conv.lastMessage?.createdAt ||
            conv.updatedAt,
        };
      })
    );

    if (!subscribed) {
      sortConversationsForFreeUser(formattedConversations, user);
    } else {
      formattedConversations.sort((a, b) => {
        const dateA = new Date(a.lastMessageAt || 0).getTime();
        const dateB = new Date(b.lastMessageAt || 0).getTime();
        return dateB - dateA;
      });
    }

    res.json({
      conversations: formattedConversations,
      isSubscribed: subscribed,
      slotsUsed: subscribed ? 0 : countActiveSlots(user),
      slotLimit: getSlotLimit(user),
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    let targetConversationId = conversationId;

    if (mongoose.Types.ObjectId.isValid(conversationId)) {
      const isConversation = await Conversation.exists({ _id: conversationId });

      if (!isConversation) {
        const conv = await Conversation.findOne({
          participants: { $all: [userId, conversationId] },
        });

        if (conv) {
          targetConversationId = conv._id;
        } else {
          return res.json({ messages: [], conversationId: null });
        }
      }
    }

    const messages = await Message.find({
      conversationId: targetConversationId,
    }).sort({ createdAt: 1 });

    await Message.updateMany(
      {
        conversationId: targetConversationId,
        receiver: userId,
        isRead: false,
      },
      { $set: { isRead: true } }
    );

    res.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const togglePinConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    let user = await User.findById(userId).populate("subscription");
    const isPinned = user.pinnedConversations.some(
      (id) => id.toString() === conversationId
    );

    if (isPinned) {
      user.pinnedConversations = user.pinnedConversations.filter(
        (id) => id.toString() !== conversationId
      );
      await user.save();
      await releaseSlotOnUnpin(user, conversationId);
      return res.json({
        message: "Unpinned",
        isPinned: false,
      });
    }

    if (!isSubscribed(user)) {
      const pinResult = await claimSlotOnPin(user, conversationId);
      if (!pinResult.ok) {
        return res.status(403).json({
          message: pinResult.message,
          code: pinResult.code,
          limit: pinResult.limit,
        });
      }
      user = await User.findById(userId);
    }

    user.pinnedConversations.push(conversationId);
    await user.save();

    res.json({ message: "Pinned", isPinned: true });
  } catch (error) {
    console.error("Error toggling pin:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getBlockStatus = async (req, res) => {
  try {
    const { userId: otherUserId } = req.params;
    const currentUserId = req.user.id;

    const blockStatus = await hasBlockBetween(currentUserId, otherUserId);
    res.json({
      isBlocked: blockStatus.blocked,
      blockedByMe: blockStatus.blockedByMe || false,
      message: blockStatus.blocked ? blockStatus.message : null,
    });
  } catch (error) {
    console.error("Error getting block status:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const blockUser = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const currentUserId = req.user.id;

    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: "You cannot block yourself" });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    await User.findByIdAndUpdate(currentUserId, {
      $addToSet: { blockedUsers: targetUserId },
    });

    res.json({
      success: true,
      message: "User blocked. They can no longer message you.",
      isBlocked: true,
      blockedByMe: true,
    });
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const currentUserId = req.user.id;

    await User.findByIdAndUpdate(currentUserId, {
      $pull: { blockedUsers: targetUserId },
    });

    res.json({
      success: true,
      message: "User unblocked",
      isBlocked: false,
      blockedByMe: false,
    });
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const reportUser = async (req, res) => {
  try {
    const { reportedUserId, conversationId, reason, details } = req.body;
    const reporterId = req.user.id;

    if (!reportedUserId || !reason?.trim()) {
      return res.status(400).json({ message: "Reported user and reason are required" });
    }

    if (reportedUserId === reporterId) {
      return res.status(400).json({ message: "You cannot report yourself" });
    }

    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const report = await ChatReport.create({
      reporter: reporterId,
      reportedUser: reportedUserId,
      conversationId: conversationId || undefined,
      reason: reason.trim(),
      details: details?.trim() || "",
    });

    res.status(201).json({
      success: true,
      message: "Report submitted. Our team will review it shortly.",
      reportId: report._id,
    });
  } catch (error) {
    console.error("Error reporting user:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const uploadChatMediaHandler = async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        message:
          "Media upload is not configured. Add Cloudinary credentials to the server.",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Media file is required" });
    }

    const mime = req.file.mimetype || "";
    const isAudio = mime.startsWith("audio/") || mime === "video/webm";
    const messageType = isAudio ? "audio" : "image";
    const resourceType = isAudio ? "video" : "image";

    const mediaUrl = await uploadToCloudinary(
      req.file.buffer,
      req.user.id,
      "chat",
      resourceType
    );

    res.status(200).json({ mediaUrl, messageType });
  } catch (error) {
    console.error("Error uploading chat media:", error);
    res.status(500).json({ message: "Failed to upload media" });
  }
};
