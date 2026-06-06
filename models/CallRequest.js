import mongoose from "mongoose";

const callRequestSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
    sourceType: {
      type: String,
      enum: ["worker", "job"],
      required: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    sourceTitle: {
      type: String,
      trim: true,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
    },
    respondedAt: Date,
  },
  { timestamps: true }
);

callRequestSchema.index({ receiver: 1, status: 1 });
callRequestSchema.index({ requester: 1, receiver: 1, status: 1 });

const CallRequest = mongoose.model("CallRequest", callRequestSchema);
export default CallRequest;
