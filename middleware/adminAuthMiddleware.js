import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";

const adminAuthMiddleware = async (req, res, next) => {
  const secretHeader = req.headers["x-admin-secret"];
  if (process.env.ADMIN_SECRET && secretHeader === process.env.ADMIN_SECRET) {
    req.admin = { role: "admin", viaSecret: true };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Admin authentication required" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin access denied" });
    }

    const admin = await Admin.findById(decoded.id).select("name email role");
    if (!admin) {
      return res.status(401).json({ message: "Admin not found" });
    }

    req.admin = admin;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired admin token" });
  }
};

export default adminAuthMiddleware;
