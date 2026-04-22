import mongoose from "mongoose";

const jobPostSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: true,
      },
    ],
    price: {
      type: Number,
      default: 0,
    },
    location: {
      address: String,
      city: String,
      state: String,
    },
    status: {
      type: String,
      enum: ["open", "closed", "in-progress"],
      default: "open",
    },
    images: [String],
  },
  { timestamps: true }
);

const JobPost = mongoose.model("JobPost", jobPostSchema);

export default JobPost;
