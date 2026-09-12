import mongoose from "mongoose";

const contentReportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["post", "worker_profile"],
      required: true,
      index: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobPost",
    },
    workerProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
    },
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    details: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ["pending", "dismissed", "reviewed"],
      default: "pending",
      index: true,
    },
    adminNote: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    reviewedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("ContentReport", contentReportSchema);
