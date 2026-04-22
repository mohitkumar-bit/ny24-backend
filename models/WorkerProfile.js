import mongoose from "mongoose";

const workerProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one profile per user
    },

    title: {
      type: String, // "Expert Electrician"
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    skills: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category", // electrician, plumber, etc.
        required: true,
      },
    ],

    experience: {
      type: Number, // years
      default: 0,
    },

    hourlyRate: {
      type: Number,
      required: true,
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
      },
      address: String,
      city: String,
      district: String,
      state: String,
      pincode: String,
    },

    availability: {
      type: Boolean,
      default: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    rating: {
      type: Number,
      default: 0,
    },

    totalReviews: {
      type: Number,
      default: 0,
    },

    images: [String], // work photos
  },
  {
    timestamps: true,
  }
);

// 🔥 Important for location search
workerProfileSchema.index({ location: "2dsphere" });

const WorkerProfile = mongoose.model("WorkerProfile", workerProfileSchema);

export default WorkerProfile;
