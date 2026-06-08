import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["general", "promo", "alert", "update"],
      default: "general",
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NotificationTemplate",
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
