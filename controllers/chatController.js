import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/authModal.js";

export const sendMessage = async (req, res) => {
  try {
    const { receiverId, conversationId, text } = req.body;
    const senderId = req.user.id;

    if (!text) {
      return res.status(400).json({ message: "Message text is required" });
    }

    // 1. Check if sender has an active subscription and count unique chats in last 24h
    const sender = await User.findById(senderId).populate("subscription");
    const plan = sender.subscription?.status === 'active' ? sender.subscription.plan : 'free';
    
    // Limits
    const limits = {
      free: 3,
      pro: 50,
      business: Infinity
    };

    const maxUniqueChats = limits[plan] || 3;

    if (maxUniqueChats !== Infinity) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Find how many unique people the user has messaged in the last 24h
      const uniqueRecipients = await Message.distinct("receiver", {
        sender: senderId,
        createdAt: { $gte: twentyFourHoursAgo }
      });

      // If we are trying to message a NEW person (not in the list of last 24h)
      if (!uniqueRecipients.some(r => r.toString() === String(receiverId || conversationId)) && uniqueRecipients.length >= maxUniqueChats) {
        return res.status(403).json({ 
          message: `Daily chat limit reached for ${plan} plan. Delete recent chats or upgrade.`,
          code: "CHAT_LIMIT_REACHED",
          limit: maxUniqueChats
        });
      }
    }


    let conversation;
    let targetReceiverId = receiverId;
    let targetConversationId = conversationId;

    // 2. Resolve conversation and receiver
    if (targetConversationId && mongoose.Types.ObjectId.isValid(targetConversationId)) {
      conversation = await Conversation.findById(targetConversationId);
      if (conversation) {
        // Find the other participant
        targetReceiverId = conversation.participants.find(p => p.toString() !== senderId.toString());
      } else if (!targetReceiverId && mongoose.Types.ObjectId.isValid(targetConversationId)) {
        // If ID didn't find a conversation, maybe the ID provided IS actually the receiverId
        targetReceiverId = targetConversationId;
      }
    }

    if (!conversation && targetReceiverId && mongoose.Types.ObjectId.isValid(targetReceiverId)) {
      conversation = await Conversation.findOne({
        participants: { $all: [senderId, targetReceiverId] },
      });

      if (!conversation) {
        conversation = await Conversation.create({
          participants: [senderId, targetReceiverId],
        });
      }
      targetConversationId = conversation._id;
    }

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found and no valid receiver provided" });
    }

    // 3. Create message
    const message = await Message.create({
      conversationId: targetConversationId,
      sender: senderId,
      receiver: targetReceiverId,
      text,
    });

    // 4. Update last message in conversation
    conversation.lastMessage = message._id;
    await conversation.save();

    res.status(201).json({
      ...message._doc,
      conversationId: targetConversationId
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

    const sender = await User.findById(userId).populate("subscription");
    const plan = sender.subscription?.status === 'active' ? sender.subscription.plan : 'free';
    
    const limits = {
      free: 3,
      pro: 50,
      business: Infinity
    };

    const maxUniqueChats = limits[plan] || 3;

    if (maxUniqueChats === Infinity) {
      return res.json({ allowed: true });
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const uniqueRecipients = await Message.distinct("receiver", {
      sender: userId,
      createdAt: { $gte: twentyFourHoursAgo }
    });

    // If already chatting with this person in last 24h, it's allowed
    if (uniqueRecipients.some(r => r.toString() === String(receiverId))) {
      return res.json({ allowed: true });
    }

    // If reached limit and trying to chat with someone new
    if (uniqueRecipients.length >= maxUniqueChats) {
      return res.status(403).json({ 
        allowed: false, 
        message: `Daily chat limit reached for ${plan} plan. Upgrade or delete recent chats.`,
        code: "CHAT_LIMIT_REACHED"
      });
    }

    res.json({ allowed: true });
  } catch (error) {
    console.error("Error checking chat limit:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const userProfile = await User.findById(userId).populate("subscription");
    const isSubscribed = userProfile?.subscription?.status === 'active';

    let query = { participants: userId };
    
    // Only apply 24h filter if user is NOT subscribed
    if (!isSubscribed) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      query.createdAt = { $gte: twentyFourHoursAgo };
    }

    const conversations = await Conversation.find(query)
      .populate({
        path: "participants",
        select: "name email phone",
      })
      .populate("lastMessage")
      .sort({ updatedAt: -1 });

    // Get user to check pinned chats
    const user = await User.findById(userId).select("pinnedConversations");
    const pinnedIds = user.pinnedConversations.map(id => id.toString());

    // Filter out the current user from participants list and add isPinned flag + unreadCount
    const formattedConversations = await Promise.all(conversations.map(async (conv) => {
      const otherUser = conv.participants.find(
        (p) => p._id.toString() !== userId
      );
      
      const unreadCount = await Message.countDocuments({
        conversationId: conv._id,
        receiver: userId,
        isRead: false
      });

      return {
        ...conv._doc,
        otherUser,
        isPinned: pinnedIds.includes(conv._id.toString()),
        unreadCount
      };
    }));

    res.json({ 
      conversations: formattedConversations, 
      isSubscribed 
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

    // If the conversationId is not a valid conversation but is a valid user ID, 
    // find the conversation between these two users
    if (mongoose.Types.ObjectId.isValid(conversationId)) {
      const isConversation = await Conversation.exists({ _id: conversationId });
      
      if (!isConversation) {
        const conv = await Conversation.findOne({
          participants: { $all: [userId, conversationId] }
        });
        
        if (conv) {
          targetConversationId = conv._id;
        } else {
          return res.json([]); // No messages yet
        }
      }
    }

    const messages = await Message.find({ conversationId: targetConversationId }).sort({ createdAt: 1 });
    
    // Mark as read
    await Message.updateMany(
      { conversationId: targetConversationId, receiver: userId, isRead: false },
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

    const user = await User.findById(userId);
    const isPinned = user.pinnedConversations.includes(conversationId);

    if (isPinned) {
      // Unpin
      user.pinnedConversations = user.pinnedConversations.filter(
        (id) => id.toString() !== conversationId
      );
    } else {
      // Pin
      user.pinnedConversations.push(conversationId);
    }

    await user.save();
    res.json({ message: isPinned ? "Unpinned" : "Pinned", isPinned: !isPinned });
  } catch (error) {
    console.error("Error toggling pin:", error);
    res.status(500).json({ message: "Server error" });
  }
};
