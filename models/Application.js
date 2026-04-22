import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    jobPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobPost",
      required: true,
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: String,
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// Ensure a worker can only apply once to a specific job post
applicationSchema.index({ jobPost: 1, worker: 1 }, { unique: true });

const Application = mongoose.model("Application", applicationSchema);

export default Application;
