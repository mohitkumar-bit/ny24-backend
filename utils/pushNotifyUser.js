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
    const notification = await Notification.create({
      user: userId,
      title,
      body,
      type,
      data,
    });

    const user = await User.findById(userId).select("pushTokens");
    if (!user?.pushTokens?.length) {
      console.warn(
        `notifyUser: no push tokens for user ${userId} — device will only see alerts after opening the app (local sync). Set up FCM + rebuild for background push.`
      );
      return notification;
    }

    const tokens = user.pushTokens.map((entry) => entry.token);
    const messages = buildPushMessages(tokens, {
      title,
      body,
      data: {
        ...data,
        notificationId: notification._id.toString(),
      },
      channelId,
    });

    const pushResult = await sendExpoPushNotifications(messages);
    if (pushResult.errors?.length) {
      console.error(`notifyUser push delivery issues for user ${userId}:`, pushResult.errors);
    }

    return notification;
  } catch (error) {
    console.error("notifyUser failed:", error);
    return null;
  }
};

export const getChatMessagePreview = (messageType, text) => {
  if (messageType === "call_request") return "You got a new call request";
  if (messageType === "image") return "You got a new message";
  if (messageType === "audio") return "You got a new message";
  return "You got a new message";
};
