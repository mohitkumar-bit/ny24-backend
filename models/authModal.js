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
      maxlength: 29,
    },

    profilePicture: {
      type: String,
      default: null,
    },

    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    isBlocked: {
      type: Boolean,
      default: false,
    },

    accountBlockReason: {
      type: String,
      default: null,
    },

    accountBlockedAt: {
      type: Date,
      default: null,
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

    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
    },
    
    pinnedConversations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
      },
    ],

    chatSlots: [
      {
        conversationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Conversation",
          required: true,
        },
        openedAt: {
          type: Date,
          required: true,
        },
        expiresAt: {
          type: Date,
          default: null,
        },
      },
    ],

    refreshToken: {
      type: String,
    },

    activeSessionId: {
      type: String,
      default: null,
    },

    lastLoginAt: {
      type: Date,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    verification: {
      status: {
        type: String,
        enum: ["none", "pending", "approved", "rejected"],
        default: "none",
      },
      submittedAt: Date,
      reviewedAt: Date,
      selfieUrl: String,
      aadhaarUrl: String,
      panUrl: String,
      rejectionReason: String,
    },

    pushTokens: [
      {
        token: { type: String, required: true },
        device: { type: String, default: "unknown" },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },

  { timestamps: true }

);

const User = mongoose.model("User", userSchema);

export default User;
