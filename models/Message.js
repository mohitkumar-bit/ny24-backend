import mongoose from "mongoose";

// Snapshot of the quoted message so replies render without extra lookups.
const replyToSchema = new mongoose.Schema(
  {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, default: "" },
    messageType: { type: String, default: "text" },
  },
  { _id: false }
);

const sharedLocationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, default: "" },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      default: "",
    },
    messageType: {
      type: String,
      enum: ["text", "call_request", "image", "audio", "location"],
      default: "text",
    },
    mediaUrl: {
      type: String,
    },
    mediaDuration: {
      type: Number,
    },
    location: {
      type: sharedLocationSchema,
      default: undefined,
    },
    callRequestStatus: {
      type: String,
      enum: ["pending", "accepted", "declined"],
    },
    replyTo: {
      type: replyToSchema,
      default: undefined,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);
export default Message;
