
import bcrypt from "bcryptjs";
import User from "../models/authModal.js";
import { formatVerificationForClient, hasActiveBusinessPlan } from "../utils/verificationHelpers.js";

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

    const accessToken = generateAccessToken({
      id: user._id,
      role: user.role,
    });

    const refreshToken = generateRefreshToken({
      id: user._id,
      role: user.role,
    });


    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isWorker: user.isWorker
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

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const accessToken = generateAccessToken({
      id: user._id,
      role: user.role,
    });

    const refreshToken = generateRefreshToken({
      id: user._id,
      role: user.role,
    });


    user.refreshToken = refreshToken;
    user.lastLoginAt = new Date();
    await user.save();

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isWorker: user.isWorker,
        subscription: user.subscription
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("LOGIN ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};



const logout = async (req, res) => {
  try {
    const userId = req.user.id;

    await User.findByIdAndUpdate(userId, {
      refreshToken: null,
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
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // issue new access token
    const newAccessToken = generateAccessToken({
      id: user._id,
      role: user.role,
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
        verificationStatus: verification.status,
        canVerify: verification.canSubmit && hasActiveBusinessPlan(user),
        subscription: user.subscription
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

    const updateData = { name, phone, bio };

    if (locationData?.coordinates?.length === 2) {
      updateData.location = {
        type: "Point",
        coordinates: locationData.coordinates,
        address: locationData.address || location || "",
        city: locationData.city || "",
        state: locationData.state || "",
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
        address: locationData.address || "",
        city: locationData.city || "",
        state: locationData.state || "",
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

export { register, login, logout, refreshAccessToken, getProfile, updateProfile };
