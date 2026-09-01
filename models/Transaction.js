import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
    },

    plan: {
      type: String,
      enum: ["free", "pro", "business"],
    },

    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },

    paymentMethod: {
      type: String, // card, upi, phonepe, dummy, etc.
    },

    transactionId: {
      type: String,
      unique: true,
    },

    merchantOrderId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    providerOrderId: {
      type: String,
    },

    paidAt: {
      type: Date,
    },

    kind: {
      type: String,
      enum: [
        "subscription",
        "extra_post",
        "extra_feature",
        "extra_post_and_feature",
        "credit_extra_post",
        "credit_extra_feature",
        "credit_video_post",
        "credit_banner_ad",
      ],
      default: "subscription",
    },

    jobPayload: {
      type: mongoose.Schema.Types.Mixed,
    },

    targetJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobPost",
    },

    consumedJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobPost",
    },

    consumedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

const Transaction = mongoose.model("Transaction", transactionSchema);

export default Transaction;
