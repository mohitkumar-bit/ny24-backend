import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    isWorker: {
      type: Boolean,
      default: false,
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
      match: [/^[0-9]{10}$/, "Invalid phone number"],
    },
    
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
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

    savedJobs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JobPost",
      },
    ],

    refreshToken: {
      type: String,
    },

    lastLoginAt: {
      type: Date,
    }
  },

  { timestamps: true }

);

const User = mongoose.model("User", userSchema);

export default User;
