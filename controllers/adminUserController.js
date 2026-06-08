import bcrypt from "bcryptjs";
import User from "../models/authModal.js";

const listUsers = async (req, res) => {
  try {
    const { search, isWorker, isVerified, page = 1, limit = 20 } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }
    if (isWorker === "true") query.isWorker = true;
    if (isWorker === "false") query.isWorker = false;
    if (isVerified === "true") query.isVerified = true;
    if (isVerified === "false") query.isVerified = false;

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password -refreshToken")
        .sort("-createdAt")
        .skip(skip)
        .limit(Number(limit)),
      User.countDocuments(query),
    ]);

    res.status(200).json({ success: true, users, total, page: Number(page), limit: Number(limit) });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -refreshToken");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ success: true, user });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const createUser = async (req, res) => {
  try {
    const { name, email, password, phone, isWorker, bio, isVerified } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      isWorker: isWorker ?? false,
      bio,
      isVerified: isVerified ?? false,
      location: {
        type: "Point",
        coordinates: [77.209, 28.6139],
        city: "New Delhi",
        state: "Delhi",
      },
    });

    const safe = user.toObject();
    delete safe.password;
    res.status(201).json({ success: true, user: safe });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Duplicate field value" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

const updateUser = async (req, res) => {
  try {
    const { name, email, phone, isWorker, bio, isVerified, password } = req.body;
    const updates = { name, email, phone, isWorker, bio, isVerified };

    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);

    if (password) {
      updates.password = await bcrypt.hash(password, 10);
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password -refreshToken");

    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ success: true, user });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ success: true, message: "User deleted" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

export { listUsers, getUser, createUser, updateUser, deleteUser };
