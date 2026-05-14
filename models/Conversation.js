import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
  },
  { timestamps: true }
);

// Removed TTL index to allow conditional expiration for free/pro users
// conversationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
