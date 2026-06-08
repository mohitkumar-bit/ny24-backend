import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() }).select("+password");
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: admin._id, role: "admin" },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: "8h", algorithm: "HS256" }
    );

    res.status(200).json({
      success: true,
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
      },
    });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const me = async (req, res) => {
  if (req.admin?.viaSecret) {
    return res.status(200).json({
      success: true,
      admin: { name: "Secret Admin", email: "secret@admin.local", role: "admin" },
    });
  }

  res.status(200).json({
    success: true,
    admin: {
      id: req.admin._id,
      name: req.admin.name,
      email: req.admin.email,
      role: req.admin.role,
    },
  });
};

export { login, me };
