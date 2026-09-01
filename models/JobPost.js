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
    requirements: {
      gender: {
        type: String,
        enum: ["Any", "Male", "Female"],
        default: "Any",
      },
      minAge: {
        type: Number,
        default: null,
      },
      maxAge: {
        type: Number,
        default: null,
      },
    },
    status: {
      type: String,
      enum: ["open", "closed", "in-progress"],
      default: "open",
    },
    images: [String],
    isFeatured: {
      type: Boolean,
      default: false,
    },
    featuredAt: {
      type: Date,
      default: null,
    },
    isVideoPost: {
      type: Boolean,
      default: false,
    },
    videoUrl: {
      type: String,
      default: null,
    },
    videoExpiresAt: {
      type: Date,
      default: null,
    },
    isBannerAd: {
      type: Boolean,
      default: false,
    },
    bannerUrl: {
      type: String,
      default: null,
    },
    bannerExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const JobPost = mongoose.model("JobPost", jobPostSchema);

export default JobPost;
