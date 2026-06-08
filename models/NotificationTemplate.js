import mongoose from "mongoose";

const notificationTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
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
  },
  { timestamps: true }
);

const NotificationTemplate = mongoose.model(
  "NotificationTemplate",
  notificationTemplateSchema
);

export default NotificationTemplate;
