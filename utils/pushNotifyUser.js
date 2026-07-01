import User from "../models/authModal.js";
import Notification from "../models/Notification.js";
import { buildPushMessages, sendExpoPushNotifications } from "./expoPush.js";

export const notifyUser = async ({
  userId,
  title,
  body,
  type = "alert",
  data = {},
  channelId = "default",
}) => {
  try {
    await Notification.create({
      user: userId,
      title,
      body,
      type,
    });

    const user = await User.findById(userId).select("pushTokens");
    if (!user?.pushTokens?.length) return;

    const tokens = user.pushTokens.map((entry) => entry.token);
    const messages = buildPushMessages(tokens, {
      title,
      body,
      data,
      channelId,
    });

    await sendExpoPushNotifications(messages);
  } catch (error) {
    console.error("notifyUser failed:", error);
  }
};

export const getChatMessagePreview = (messageType, text) => {
  if (text?.trim()) return text.trim();
  if (messageType === "image") return "Sent a photo";
  if (messageType === "audio") return "Sent a voice message";
  if (messageType === "call_request") return "Sent a call request";
  return "Sent a message";
};
