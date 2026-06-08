import User from "../models/authModal.js";
import Notification from "../models/Notification.js";
import NotificationTemplate from "../models/NotificationTemplate.js";
import { buildPushMessages, sendExpoPushNotifications } from "../utils/expoPush.js";

const listTemplates = async (req, res) => {
  try {
    const { search } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { body: { $regex: search, $options: "i" } },
      ];
    }
    const templates = await NotificationTemplate.find(query).sort("-createdAt");
    res.status(200).json({ success: true, templates, total: templates.length });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const getTemplate = async (req, res) => {
  try {
    const template = await NotificationTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.status(200).json({ success: true, template });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const createTemplate = async (req, res) => {
  try {
    const { name, title, body, type } = req.body;
    if (!name || !title || !body) {
      return res.status(400).json({ message: "Name, title and body are required" });
    }
    const template = await NotificationTemplate.create({ name, title, body, type });
    res.status(201).json({ success: true, template });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Template name already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

const updateTemplate = async (req, res) => {
  try {
    const template = await NotificationTemplate.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.status(200).json({ success: true, template });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Template name already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

const deleteTemplate = async (req, res) => {
  try {
    const template = await NotificationTemplate.findByIdAndDelete(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.status(200).json({ success: true, message: "Template deleted" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const resolveRecipients = async (audience, userId) => {
  if (audience === "user" && userId) {
    const user = await User.findById(userId).select("_id pushTokens");
    return user ? [user] : [];
  }
  if (audience === "workers") {
    return User.find({ isWorker: true }).select("_id pushTokens");
  }
  return User.find().select("_id pushTokens");
};

const sendNotification = async (req, res) => {
  try {
    const { templateId, title, body, type, audience = "all", userId } = req.body;

    let finalTitle = title;
    let finalBody = body;
    let finalType = type || "general";
    let templateRef = null;

    if (templateId) {
      const template = await NotificationTemplate.findById(templateId);
      if (!template) return res.status(404).json({ message: "Template not found" });
      finalTitle = title || template.title;
      finalBody = body || template.body;
      finalType = type || template.type;
      templateRef = template._id;
    }

    if (!finalTitle || !finalBody) {
      return res.status(400).json({ message: "Title and body are required" });
    }

    const recipients = await resolveRecipients(audience, userId);
    if (!recipients.length) {
      return res.status(400).json({ message: "No recipients found" });
    }

    const adminId = req.admin?._id || req.admin?.id || null;
    const notifications = recipients.map((user) => ({
      user: user._id,
      title: finalTitle,
      body: finalBody,
      type: finalType,
      template: templateRef,
      sentBy: adminId,
    }));

    await Notification.insertMany(notifications);

    const pushTokens = recipients.flatMap((user) =>
      (user.pushTokens || []).map((entry) => entry.token)
    );
    const pushMessages = buildPushMessages(pushTokens, {
      title: finalTitle,
      body: finalBody,
      data: { type: finalType },
    });
    const pushResult = await sendExpoPushNotifications(pushMessages);

    res.status(200).json({
      success: true,
      message: "Notifications sent",
      recipientCount: recipients.length,
      pushSent: pushResult.sent,
    });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const listSentNotifications = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const notifications = await Notification.find()
      .populate("user", "name email")
      .populate("template", "name")
      .sort("-createdAt")
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments();

    res.status(200).json({ success: true, notifications, total, page, limit });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

export {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  sendNotification,
  listSentNotifications,
};
