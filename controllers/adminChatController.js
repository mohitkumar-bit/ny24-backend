import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/authModal.js";

const formatParticipant = (user) =>
  user
    ? {
        id: user._id,
        name: user.name,
        email: user.email,
      }
    : null;

const formatMessage = (message) => ({
  id: message._id,
  text: message.text,
  messageType: message.messageType,
  mediaUrl: message.mediaUrl,
  mediaDuration: message.mediaDuration,
  callRequestStatus: message.callRequestStatus,
  isRead: message.isRead,
  createdAt: message.createdAt,
  sender: formatParticipant(message.sender),
  receiver: formatParticipant(message.receiver),
});

const loadConversationMessages = async (conversationId) => {
  const conversation = await Conversation.findById(conversationId).populate(
    "participants",
    "name email"
  );

  if (!conversation) {
    return null;
  }

  const messages = await Message.find({ conversationId })
    .populate("sender", "name email")
    .populate("receiver", "name email")
    .sort({ createdAt: 1 })
    .limit(500);

  return {
    conversation: {
      id: conversation._id,
      participants: conversation.participants.map(formatParticipant),
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
    },
    messages: messages.map(formatMessage),
  };
};

export const listConversations = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    let filter = {};
    if (search.trim()) {
      const users = await User.find({
        $or: [
          { name: { $regex: search.trim(), $options: "i" } },
          { email: { $regex: search.trim(), $options: "i" } },
        ],
      }).select("_id");

      const userIds = users.map((user) => user._id);
      if (userIds.length === 0) {
        return res.json({
          conversations: [],
          total: 0,
          page: pageNum,
          limit: limitNum,
        });
      }

      filter = { participants: { $in: userIds } };
    }

    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .populate("participants", "name email")
        .populate({ path: "lastMessage", select: "text messageType createdAt" })
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Conversation.countDocuments(filter),
    ]);

    res.json({
      conversations: conversations.map((conversation) => ({
        id: conversation._id,
        participants: conversation.participants.map(formatParticipant),
        lastMessage: conversation.lastMessage
          ? {
              text: conversation.lastMessage.text,
              messageType: conversation.lastMessage.messageType,
              createdAt: conversation.lastMessage.createdAt,
            }
          : null,
        lastMessageAt: conversation.lastMessageAt,
        createdAt: conversation.createdAt,
      })),
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error("LIST ADMIN CONVERSATIONS ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getConversationMessages = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const result = await loadConversationMessages(id);
    if (!result) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    res.json(result);
  } catch (error) {
    console.error("GET ADMIN CONVERSATION MESSAGES ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getChatHistory = async (req, res) => {
  try {
    const { conversationId, userA, userB } = req.query;

    let targetConversationId = conversationId;

    if (!targetConversationId && userA && userB) {
      const conversation = await Conversation.findOne({
        participants: { $all: [userA, userB] },
      }).select("_id");

      targetConversationId = conversation?._id;
    }

    if (!targetConversationId || !mongoose.Types.ObjectId.isValid(targetConversationId)) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const result = await loadConversationMessages(targetConversationId);
    if (!result) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    res.json(result);
  } catch (error) {
    console.error("GET ADMIN CHAT HISTORY ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};
