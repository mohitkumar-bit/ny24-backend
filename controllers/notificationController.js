import User from "../models/authModal.js";
import Notification from "../models/Notification.js";

const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ user: userId })
        .sort("-createdAt")
        .skip(skip)
        .limit(limit),
      Notification.countDocuments({ user: userId }),
      Notification.countDocuments({ user: userId, isRead: false }),
    ]);

    res.status(200).json({
      success: true,
      notifications,
      total,
      unreadCount,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      user: req.user.id,
      isRead: false,
    });
    res.status(200).json({ success: true, unreadCount });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { $set: { isRead: true } },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    res.status(200).json({ success: true, notification });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );
    res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const registerPushToken = async (req, res) => {
  try {
    const { token, device = "unknown" } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Push token is required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const tokens = user.pushTokens || [];
    const existingIndex = tokens.findIndex((entry) => entry.token === token);

    if (existingIndex >= 0) {
      tokens[existingIndex].device = device;
      tokens[existingIndex].updatedAt = new Date();
    } else {
      tokens.push({ token, device, updatedAt: new Date() });
    }

    user.pushTokens = tokens.slice(-10);
    await user.save();

    res.status(200).json({ success: true, message: "Push token registered" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

export {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  registerPushToken,
};
