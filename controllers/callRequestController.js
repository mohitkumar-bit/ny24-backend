import CallRequest from "../models/CallRequest.js";
import Message from "../models/Message.js";
import User from "../models/authModal.js";
import {
  claimSlot,
  resolveOrCreateConversation,
  getSlotInfoForConversation,
  isSubscribed,
} from "../utils/chatSlots.js";
import { notifyUser } from "../utils/pushNotifyUser.js";

const createCallRequest = async (req, res) => {
  try {
    const { receiverId, sourceType, sourceId, sourceTitle, conversationId } = req.body;
    const requesterId = req.user.id;

    if (!receiverId || !sourceType || !sourceId) {
      return res.status(400).json({
        message: "receiverId, sourceType and sourceId are required",
      });
    }

    if (requesterId === receiverId) {
      return res.status(400).json({ message: "You cannot send a call request to yourself" });
    }

    const [requester, receiver] = await Promise.all([
      User.findById(requesterId).select("name phone"),
      User.findById(receiverId).select("name phone"),
    ]);

    if (!receiver) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!requester?.phone) {
      return res.status(400).json({
        message: "Add a phone number to your profile so they can call you back",
      });
    }

    const { conversation, targetReceiverId, targetConversationId } =
      await resolveOrCreateConversation(requesterId, receiverId, conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Could not start conversation" });
    }

    let user = await User.findById(requesterId).populate("subscription");

    if (!isSubscribed(user)) {
      const slotResult = await claimSlot(user, targetConversationId);
      if (!slotResult.ok) {
        return res.status(403).json({
          message: slotResult.message,
          code: slotResult.code,
          limit: slotResult.limit,
        });
      }
      user = await User.findById(requesterId).populate("subscription");
    }

    const existingMessage = await Message.findOne({
      conversationId: targetConversationId,
      sender: requesterId,
      messageType: "call_request",
      callRequestStatus: "pending",
    });

    if (existingMessage) {
      return res.status(200).json({
        success: true,
        message: "Call request already sent in this chat.",
        conversationId: targetConversationId,
        chatMessage: existingMessage,
      });
    }

    const message = await Message.create({
      conversationId: targetConversationId,
      sender: requesterId,
      receiver: targetReceiverId,
      text: "Call request has been sent",
      messageType: "call_request",
      callRequestStatus: "pending",
    });

    await CallRequest.create({
      requester: requesterId,
      receiver: targetReceiverId,
      sourceType,
      sourceId,
      sourceTitle: sourceTitle || "",
      messageId: message._id,
      conversationId: targetConversationId,
    });

    const now = new Date();
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = now;
    await conversation.save();

    const slotInfo = getSlotInfoForConversation(user, targetConversationId);

    notifyUser({
      userId: targetReceiverId,
      title: requester?.name || "Call request",
      body: "Sent you a call request",
      type: "chat",
      channelId: "chat",
      data: {
        type: "chat",
        conversationId: targetConversationId.toString(),
        senderId: requesterId.toString(),
        messageId: message._id.toString(),
      },
    });

    res.status(201).json({
      success: true,
      message: "Call request sent in chat.",
      conversationId: targetConversationId,
      chatMessage: message,
      slotInfo,
    });
  } catch (error) {
    console.error("CREATE CALL REQUEST ERROR", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getIncomingCallRequests = async (req, res) => {
  try {
    const requests = await CallRequest.find({
      receiver: req.user.id,
      status: "pending",
    })
      .populate("requester", "name")
      .sort("-createdAt");

    res.status(200).json({
      success: true,
      requests: requests.map((r) => ({
        _id: r._id,
        messageId: r.messageId,
        conversationId: r.conversationId,
        requester: {
          _id: r.requester._id,
          name: r.requester.name,
        },
        sourceType: r.sourceType,
        sourceTitle: r.sourceTitle,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const acceptCallRequest = async (req, res) => {
  try {
    const { id } = req.params;
    let callRequest = await CallRequest.findOne({
      $or: [{ _id: id }, { messageId: id }],
      receiver: req.user.id,
      status: "pending",
    }).populate("requester", "name phone");

    if (!callRequest) {
      return res.status(404).json({ message: "Call request not found" });
    }

    if (!callRequest.requester?.phone) {
      return res.status(400).json({
        message: "This user has no phone number on their profile",
      });
    }

    callRequest.status = "accepted";
    callRequest.respondedAt = new Date();
    await callRequest.save();

    if (callRequest.messageId) {
      await Message.findByIdAndUpdate(callRequest.messageId, {
        callRequestStatus: "accepted",
        text: "Call request accepted",
      });
    }

    res.status(200).json({
      success: true,
      phone: callRequest.requester.phone,
      requesterName: callRequest.requester.name,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const declineCallRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const callRequest = await CallRequest.findOneAndUpdate(
      {
        $or: [{ _id: id }, { messageId: id }],
        receiver: req.user.id,
        status: "pending",
      },
      { status: "declined", respondedAt: new Date() },
      { new: true }
    );

    if (!callRequest) {
      return res.status(404).json({ message: "Call request not found" });
    }

    if (callRequest.messageId) {
      await Message.findByIdAndUpdate(callRequest.messageId, {
        callRequestStatus: "declined",
        text: "Call request declined",
      });
    }

    res.status(200).json({ success: true, message: "Call request declined" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export { createCallRequest, getIncomingCallRequests, acceptCallRequest, declineCallRequest };
