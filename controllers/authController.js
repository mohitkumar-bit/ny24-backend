
import crypto from "crypto";
import bcrypt from "bcryptjs";
import User from "../models/authModal.js";
import { formatVerificationForClient, hasActiveBusinessPlan } from "../utils/verificationHelpers.js";
import { uploadToCloudinary, isCloudinaryConfigured } from "../utils/cloudinary.js";

const formatUserLocationResponse = (user) => {
  const loc = user.location;
  if (!loc?.coordinates?.length) {
    return { location: loc?.address || null, locationDetails: null };
  }
  const display =
    loc.address ||
    [loc.city, loc.state].filter(Boolean).join(", ") ||
    null;
  return {
    location: display,
    locationDetails: {
      address: loc.address || "",
      city: loc.city || "",
      state: loc.state || "",
      district: loc.district || "",
      pincode: loc.pincode || "",
      coordinates: loc.coordinates,
    },
  };
};
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../utils/jwt.js";

const SESSION_REVOKED = {
  message: "Logged in on another device. Please sign in again.",
  code: "SESSION_REVOKED",
};

const DUMMY_OTP = String(process.env.DUMMY_OTP || "123456");
const OTP_TTL_MS = 5 * 60 * 1000;
/** phone -> { otp, expiresAt, purpose, name?, email? } */
const otpStore = new Map();

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits.slice(-10);
}

function isValidPhone(phone) {
  return /^[0-9]{10}$/.test(phone);
}

function buildAuthUserPayload(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email || null,
    role: user.role,
    isWorker: user.isWorker,
    subscription: user.subscription,
    createdAt: user.createdAt,
    phone: user.phone,
    profilePicture: user.profilePicture || null,
  };
}

const issueSessionTokens = async (user, extraFields = {}) => {
  const sessionId = crypto.randomUUID();
  const tokenPayload = { id: user._id, role: user.role, sessionId };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  Object.assign(user, extraFields);
  user.refreshToken = refreshToken;
  user.activeSessionId = sessionId;
  await user.save();

  return { accessToken, refreshToken };
};

const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
    });

    const { accessToken, refreshToken } = await issueSessionTokens(user);

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isWorker: user.isWorker,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("REGISTER ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};


const login = async (req, res) => {
  console.log("loginn.....");

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email }).select("+password").populate("subscription");
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    if (!user.password) {
      return res.status(401).json({
        message: "This account uses phone OTP login. Please sign in with your phone number.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const { accessToken, refreshToken } = await issueSessionTokens(user, {
      lastLoginAt: new Date(),
    });

    res.status(200).json({
      message: "Login successful",
      user: buildAuthUserPayload(user),
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("LOGIN ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Dummy OTP — always accepts DUMMY_OTP (default 123456). No SMS sent.
 * purpose: "login" | "register"
 */
const sendOtp = async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const purpose = String(req.body?.purpose || "login").toLowerCase();
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: "Enter a valid 10-digit phone number" });
    }

    if (purpose !== "login" && purpose !== "register") {
      return res.status(400).json({ message: "Invalid purpose" });
    }

    const existing = await User.findOne({ phone });

    if (purpose === "login" && !existing) {
      return res.status(404).json({
        message: "No account found for this number. Please sign up.",
        code: "USER_NOT_FOUND",
      });
    }

    if (purpose === "register") {
      if (!name) {
        return res.status(400).json({ message: "Name is required to sign up" });
      }
      if (existing) {
        return res.status(400).json({
          message: "An account already exists with this number. Please sign in.",
          code: "USER_EXISTS",
        });
      }
      if (email) {
        const emailTaken = await User.findOne({ email });
        if (emailTaken) {
          return res.status(400).json({ message: "Email is already registered" });
        }
      }
    }

    if (existing?.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    otpStore.set(phone, {
      otp: DUMMY_OTP,
      expiresAt: Date.now() + OTP_TTL_MS,
      purpose,
      name: purpose === "register" ? name : existing?.name || "",
      email: purpose === "register" ? email : "",
    });

    return res.status(200).json({
      message: "OTP sent successfully",
      phone,
      expiresIn: Math.floor(OTP_TTL_MS / 1000),
      // Dummy mode — clients can show this for testing
      dummyOtp: DUMMY_OTP,
    });
  } catch (error) {
    console.error("SEND OTP ERROR 👉", error);
    return res.status(500).json({ message: "Failed to send OTP" });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const otp = String(req.body?.otp || "").trim();

    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: "Enter a valid 10-digit phone number" });
    }
    if (!otp || otp.length < 4) {
      return res.status(400).json({ message: "Enter the OTP" });
    }

    const pending = otpStore.get(phone);
    if (!pending || pending.expiresAt < Date.now()) {
      otpStore.delete(phone);
      return res.status(400).json({ message: "OTP expired. Please request a new one." });
    }

    if (otp !== pending.otp && otp !== DUMMY_OTP) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    otpStore.delete(phone);

    let user = await User.findOne({ phone }).populate("subscription");

    if (pending.purpose === "register") {
      if (user) {
        return res.status(400).json({
          message: "An account already exists with this number. Please sign in.",
        });
      }

      const name = pending.name || String(req.body?.name || "").trim();
      if (!name) {
        return res.status(400).json({ message: "Name is required to sign up" });
      }

      const emailRaw =
        pending.email ||
        (typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "");
      const email = emailRaw || undefined;

      user = await User.create({
        name,
        phone,
        ...(email ? { email } : {}),
        location: { type: "Point", coordinates: [0, 0] },
      });
      user = await User.findById(user._id).populate("subscription");
    } else {
      if (!user) {
        return res.status(404).json({
          message: "No account found for this number. Please sign up.",
        });
      }
      if (user.isBlocked) {
        return res.status(403).json({ message: "Account is blocked" });
      }
    }

    const { accessToken, refreshToken } = await issueSessionTokens(user, {
      lastLoginAt: new Date(),
    });

    return res.status(200).json({
      message: pending.purpose === "register" ? "Account created successfully" : "Login successful",
      user: buildAuthUserPayload(user),
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("VERIFY OTP ERROR 👉", error);
    if (error?.code === 11000) {
      return res.status(400).json({ message: "Phone or email already registered" });
    }
    return res.status(500).json({ message: "Failed to verify OTP" });
  }
};

const logout = async (req, res) => {
  try {
    const userId = req.user.id;

    await User.findByIdAndUpdate(userId, {
      refreshToken: null,
      activeSessionId: null,
    });

    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("LOGOUT ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};


const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    // verify refresh token signature
    const decoded = verifyRefreshToken(refreshToken);

    // check token exists in DB
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json(SESSION_REVOKED);
    }

    if (!decoded.sessionId || !user.activeSessionId || decoded.sessionId !== user.activeSessionId) {
      return res.status(401).json(SESSION_REVOKED);
    }

    const newAccessToken = generateAccessToken({
      id: user._id,
      role: user.role,
      sessionId: user.activeSessionId,
    });

    res.status(200).json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired refresh token" });
  }
};


const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("subscription");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const verification = formatVerificationForClient(user);
    const { location, locationDetails } = formatUserLocationResponse(user);
    res.status(200).json({ 
      success: true, 
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        bio: user.bio,
        location,
        locationDetails,
        isWorker: user.isWorker,
        isVerified: user.isVerified,
        profilePicture: user.profilePicture || null,
        verificationStatus: verification.status,
        canVerify: verification.canSubmit && hasActiveBusinessPlan(user),
        subscription: user.subscription,
        createdAt: user.createdAt,
      } 
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, phone, bio, location, locationData } = req.body;
    const userId = req.user.id;

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    let cleanBio = bio;
    if (bio !== undefined && bio !== null) {
      cleanBio = String(bio).trim();
      if (cleanBio.length > 29 || /\d/.test(cleanBio)) {
        return res.status(400).json({
          message: "Bio must be at most 29 characters and cannot contain numbers",
        });
      }
    }

    let cleanName = name;
    if (name !== undefined && name !== null) {
      cleanName = String(name).trim();
      if (!cleanName || /\d/.test(cleanName)) {
        return res.status(400).json({
          message: "Full name is required and cannot contain numbers",
        });
      }
    }

    const noDigits = (value) => {
      if (value === undefined || value === null || value === "") return true;
      return !/\d/.test(String(value));
    };

    if (
      locationData &&
      (!noDigits(locationData.address) ||
        !noDigits(locationData.city) ||
        !noDigits(locationData.state))
    ) {
      return res.status(400).json({
        message: "Area, city, and state cannot contain numbers",
      });
    }

    const updateData = { name: cleanName, phone, bio: cleanBio };

    if (locationData?.coordinates?.length === 2) {
      updateData.location = {
        type: "Point",
        coordinates: locationData.coordinates,
        address: String(locationData.address || location || "").replace(/\d/g, ""),
        city: String(locationData.city || "").replace(/\d/g, ""),
        state: String(locationData.state || "").replace(/\d/g, ""),
        district: locationData.district || "",
        pincode: locationData.pincode || "",
      };
    } else if (
      locationData &&
      (locationData.address || locationData.city || locationData.state)
    ) {
      const prevCoords =
        existingUser.location?.coordinates?.length === 2
          ? existingUser.location.coordinates
          : [0, 0];
      updateData.location = {
        type: "Point",
        coordinates: prevCoords,
        address: String(locationData.address || "").replace(/\d/g, ""),
        city: String(locationData.city || "").replace(/\d/g, ""),
        state: String(locationData.state || "").replace(/\d/g, ""),
        district: locationData.district || "",
        pincode: locationData.pincode || "",
      };
    } else if (location !== undefined) {
      const prevCoords = existingUser.location?.coordinates?.length === 2
        ? existingUser.location.coordinates
        : [0, 0];
      updateData.location = {
        type: "Point",
        coordinates: prevCoords,
        address: location,
        city: existingUser.location?.city || "",
        state: existingUser.location?.state || "",
        district: existingUser.location?.district || "",
        pincode: existingUser.location?.pincode || "",
      };
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    ).populate("subscription");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const verification = formatVerificationForClient(user);
    const { location: locDisplay, locationDetails } = formatUserLocationResponse(user);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        bio: user.bio,
        location: locDisplay,
        locationDetails,
        isWorker: user.isWorker,
        isVerified: user.isVerified,
        profilePicture: user.profilePicture || null,
        verificationStatus: verification.status,
        canVerify: verification.canSubmit && hasActiveBusinessPlan(user),
        subscription: user.subscription
      },
    });
  } catch (error) {
    console.error("UPDATE PROFILE ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const uploadProfilePictureHandler = async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        message: "Image upload is not configured. Add Cloudinary credentials to the server.",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const profilePicture = await uploadToCloudinary(
      req.file.buffer,
      req.user.id,
      "profiles"
    );

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { profilePicture } },
      { new: true }
    ).populate("subscription");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const verification = formatVerificationForClient(user);
    const { location, locationDetails } = formatUserLocationResponse(user);

    res.status(200).json({
      success: true,
      profilePicture,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        bio: user.bio,
        location,
        locationDetails,
        isWorker: user.isWorker,
        isVerified: user.isVerified,
        profilePicture: user.profilePicture || null,
        verificationStatus: verification.status,
        canVerify: verification.canSubmit && hasActiveBusinessPlan(user),
        subscription: user.subscription,
      },
    });
  } catch (error) {
    console.error("UPLOAD PROFILE PICTURE ERROR 👉", error);
    res.status(500).json({ message: "Failed to upload profile picture" });
  }
};

const removeProfilePictureHandler = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { profilePicture: null } },
      { new: true }
    ).populate("subscription");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const verification = formatVerificationForClient(user);
    const { location, locationDetails } = formatUserLocationResponse(user);

    res.status(200).json({
      success: true,
      profilePicture: null,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        bio: user.bio,
        location,
        locationDetails,
        isWorker: user.isWorker,
        isVerified: user.isVerified,
        profilePicture: null,
        verificationStatus: verification.status,
        canVerify: verification.canSubmit && hasActiveBusinessPlan(user),
        subscription: user.subscription,
      },
    });
  } catch (error) {
    console.error("REMOVE PROFILE PICTURE ERROR 👉", error);
    res.status(500).json({ message: "Failed to remove profile picture" });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password must be different from current password" });
    }

    const user = await User.findById(req.user.id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR 👉", error);
    res.status(500).json({ message: "Failed to change password" });
  }
};

export {
  register,
  login,
  sendOtp,
  verifyOtp,
  logout,
  refreshAccessToken,
  getProfile,
  updateProfile,
  uploadProfilePictureHandler,
  removeProfilePictureHandler,
  changePassword,
};
